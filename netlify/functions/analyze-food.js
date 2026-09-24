// netlify/functions/analyze-food.js
// v40 (Gate 3) — meal photo -> itemised macro ESTIMATE via Netlify AI Gateway
// (OpenAI-compatible chat/completions). Plain ES module, no SDK, no package.json.
//
// The app shows the result in the meal editor for the user to check and edit;
// nothing is saved until they tap Save. The photo is never stored — not here,
// not in the app.
//
// AUTH: the caller must hold a valid sync code (X-Sync-Key). We check it the
// same way the app's sync does — a Supabase read that row-level security only
// answers when the key matches a real row. So only devices already linked to
// the data can spend AI credits, and no new secret has to live in the public
// page. Fail closed: if the check can't be made (Supabase paused, network),
// the request is refused.
//
// Never log the sync key, the photo, or upstream bodies.

const SB_URL = 'https://sqmkjgubujrkxygsukng.supabase.co';
const SB_KEY = 'sb_publishable_m6cjgKCi9ZwPUnlJWTUb3A_lGp67uNa';   // public by design, same as index.html

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;       // the app sends ~0.2–1 MB after compressing
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_ITEMS = 25;
const MAX = { grams: 5000, kcal: 5000, proteinG: 500, carbsG: 1000, fatG: 500 };   // per item, typo/hallucination guard
const DEFAULT_MODEL = 'gpt-4o-mini';

function env(name){
  try { if (typeof Netlify !== 'undefined' && Netlify.env) return Netlify.env.get(name); } catch (e) {}
  return process.env[name];
}

// Errors carry a stable code for the app and a plain message for Billy.
// Upstream detail is logged server-side (status only), never returned.
function fail(status, code, message){
  return new Response(JSON.stringify({ error: code, message }), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
function ok(body){
  return new Response(JSON.stringify(body), {
    status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function parsePhoto(s){
  if (typeof s !== 'string' || s.indexOf('data:') !== 0) return null;
  const comma = s.indexOf(',');
  if (comma < 1) return null;
  const meta = s.slice(5, comma);
  const mime = meta.split(';')[0];
  if (!ALLOWED_MIME.includes(mime) || meta.indexOf(';base64') < 0) return null;
  const base64 = s.slice(comma + 1);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  return { mime, bytes: Math.floor(base64.length * 3 / 4) };
}

// Same shape the Supabase check constraint enforces (20–100 chars), printable, no spaces.
function plausibleSyncKey(k){ return typeof k === 'string' && /^[\x21-\x7e]{20,100}$/.test(k); }

async function syncKeyIsValid(key){
  const r = await fetch(SB_URL + '/rest/v1/workout_state?select=updated_at&limit=1', {
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'X-Sync-Key': key },
  });
  if (!r.ok) throw new Error('verify HTTP ' + r.status);
  const rows = await r.json();
  return Array.isArray(rows) && rows.length === 1;
}

function num(v, max){
  const n = Number(v);
  if (!isFinite(n) || n < 0) return 0;
  return Math.round(Math.min(n, max) * 10) / 10;
}
function text(v, len){ return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, len) : ''; }

// Never pass the model's output through as-is: clamp every number, cut every
// string, cap the item count, and recompute totals from the items.
function sanitizeAnalysis(parsed){
  const items = (Array.isArray(parsed && parsed.items) ? parsed.items : [])
    .slice(0, MAX_ITEMS)
    .map(i => ({
      name: text(i && i.name, 80) || 'Item',
      grams: num(i && i.grams, MAX.grams),
      kcal: num(i && i.kcal, MAX.kcal),
      proteinG: num(i && i.proteinG, MAX.proteinG),
      carbsG: num(i && i.carbsG, MAX.carbsG),
      fatG: num(i && i.fatG, MAX.fatG),
      confidence: ['low', 'medium', 'high'].includes(i && i.confidence) ? i.confidence : 'low',
      notes: text(i && i.notes, 200),
    }));
  const totals = items.reduce((a, i) => ({
    kcal: a.kcal + i.kcal, proteinG: a.proteinG + i.proteinG, carbsG: a.carbsG + i.carbsG, fatG: a.fatG + i.fatG,
  }), { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  Object.keys(totals).forEach(k => { totals[k] = Math.round(totals[k] * 10) / 10; });
  const list = (v) => (Array.isArray(v) ? v : []).map(s => text(s, 200)).filter(Boolean).slice(0, 8);
  return { items, totals, assumptions: list(parsed && parsed.assumptions), warnings: list(parsed && parsed.warnings) };
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name:       { type: 'string' },
          grams:      { type: 'number' },
          kcal:       { type: 'number' },
          proteinG:   { type: 'number' },
          carbsG:     { type: 'number' },
          fatG:       { type: 'number' },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          notes:      { type: 'string' }
        },
        // Strict mode requires EVERY property to be listed here, `notes` included
        // (the model returns '' when it has none). Leaving one out makes the
        // API reject the request outright.
        required: ['name','grams','kcal','proteinG','carbsG','fatG','confidence','notes'],
      }
    },
    totals: {
      type: 'object',
      additionalProperties: false,
      properties: {
        kcal:     { type: 'number' },
        proteinG: { type: 'number' },
        carbsG:   { type: 'number' },
        fatG:     { type: 'number' }
      },
      required: ['kcal','proteinG','carbsG','fatG']
    },
    assumptions: { type: 'array', items: { type: 'string' } },
    warnings:    { type: 'array', items: { type: 'string' } }
  },
  required: ['items','totals','assumptions','warnings']
};

export default async (req) => {
  if (req.method !== 'POST') return fail(405, 'method', 'POST only.');
  if (env('FOOD_AI_DISABLED') === '1') return fail(503, 'disabled', 'Photo analysis is switched off.');

  // 1. Who's asking. Cheap format check first, then the real one.
  const key = req.headers.get('X-Sync-Key');
  if (!plausibleSyncKey(key)) return fail(401, 'unauthorized', 'Set up Sync on this device to use photo analysis.');
  try {
    if (!(await syncKeyIsValid(key))) return fail(401, 'unauthorized', 'This device\'s sync code wasn\'t recognised.');
  } catch (e) {
    console.error('analyze-food: sync verification unavailable', e && e.message);
    return fail(503, 'verify_unavailable', 'Couldn\'t verify this device right now. Try again in a minute.');
  }

  // 2. What they sent.
  let body;
  try { body = await req.json(); } catch (e) { return fail(400, 'bad_request', 'The photo didn\'t arrive intact. Try again.'); }
  const photo = parsePhoto(body && body.photoBase64);
  if (!photo) return fail(400, 'bad_request', 'That file isn\'t a supported photo (JPEG, PNG or WebP).');
  if (photo.bytes > MAX_PHOTO_BYTES) return fail(413, 'too_large', 'That photo is too large. Try a smaller one.');
  const description = text(body.description, 500);

  // 3. The model.
  const apiKey = env('OPENAI_API_KEY');
  const baseUrl = env('OPENAI_BASE_URL');
  if (!apiKey || !baseUrl){
    console.error('analyze-food: AI Gateway env vars missing');
    return fail(503, 'not_configured', 'Photo analysis isn\'t set up on the server yet.');
  }
  const model = env('FOOD_AI_MODEL') || DEFAULT_MODEL;

  let upstream;
  try {
    const r = await fetch(baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 1500,
        messages: [
          { role: 'system', content:
            'You are a careful nutrition estimator. Given a meal photo and optional context, ' +
            'list each distinct food or drink as an item with estimated grams, kcal, protein, carbs and fat. ' +
            'Bias conservative: typical plates have hidden fats and oils the camera cannot see, so estimate ' +
            'slightly higher when uncertain. Use the user\'s context (brands, weights) over visual guesses. ' +
            'Do not invent items that are not visible or described. Put what you guessed in `assumptions` ' +
            'and what you could not determine in `warnings`. Use notes "" when there is nothing to add.'
          },
          { role: 'user', content: [
            { type: 'text', text: description || 'Estimate the items, weights, calories and macros in this meal.' },
            { type: 'image_url', image_url: { url: body.photoBase64 } }
          ]}
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'food_analysis', schema: SCHEMA, strict: true } }
      })
    });
    if (!r.ok){
      console.error('analyze-food: upstream HTTP ' + r.status);
      if (r.status === 429) return fail(429, 'busy', 'The AI service is busy. Try again in a minute.');
      return fail(502, 'upstream', 'The photo couldn\'t be analysed. Try again, or enter the meal by hand.');
    }
    upstream = await r.json();
  } catch (e) {
    console.error('analyze-food: upstream request failed', e && e.message);
    return fail(502, 'upstream', 'The photo couldn\'t be analysed. Try again, or enter the meal by hand.');
  }

  let parsed;
  try {
    const content = upstream && upstream.choices && upstream.choices[0] && upstream.choices[0].message && upstream.choices[0].message.content;
    parsed = JSON.parse(content || '');
  } catch (e) {
    console.error('analyze-food: model returned non-JSON');
    return fail(502, 'bad_output', 'The AI answer was unreadable. Try again, or enter the meal by hand.');
  }
  const result = sanitizeAnalysis(parsed);
  if (!result.items.length) return fail(422, 'no_items', 'No food was recognised in that photo.');
  return ok(Object.assign(result, { model }));
};

export const config = {
  path: '/api/analyze-food'
};
