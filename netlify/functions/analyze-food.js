// netlify/functions/analyze-food.js
// v36 — Gate 2: photo -> structured food analysis via Netlify AI Gateway.
// Plain ES module. No SDK, no package.json. fetch + chat/completions.
//
// Gate 1 laid down `food` state. This is the only network call the food feature
// makes; localStorage stays source of truth, photo discarded after analysis.

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MODEL = 'gpt-4o-mini';

function json(status, body){
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function validatePhotoBase64(s){
  if (typeof s !== 'string') return null;
  if (s.indexOf('data:image/') !== 0) return null;
  const comma = s.indexOf(',');
  if (comma < 1) return null;
  const mime = s.slice(5, comma).split(';')[0];
  if (!mime || mime.indexOf('/') < 1) return null;
  return { mime, base64: s.slice(comma + 1) };
}

function checkToken(req){
  // Token auth: if ANALYZE_FOOD_TOKEN env var is set on Netlify, require matching
  // X-Food-Token header. If env var isn't set, the function is public (handy for
  // first-time setup; flip it on once the UI starts sending the header).
  const required = process.env.ANALYZE_FOOD_TOKEN;
  if (!required) return null;
  const supplied = req.headers.get('X-Food-Token');
  if (supplied !== required) return json(401, { error: 'Missing or invalid X-Food-Token header' });
  return null;
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  const denied = checkToken(req);
  if (denied) return denied;

  let body;
  try { body = await req.json(); } catch (e) { return json(400, { error: 'Invalid JSON body' }); }

  const photo = validatePhotoBase64(body && body.photoBase64);
  if (!photo) return json(400, { error: 'photoBase64 must be a data:image/* URL' });

  const approxBytes = Math.floor(photo.base64.length * 3 / 4);
  if (approxBytes > MAX_PHOTO_BYTES){
    return json(413, { error: 'Photo too large (~' + (approxBytes/1024/1024).toFixed(1) + ' MB). Max ' + (MAX_PHOTO_BYTES/1024/1024) + ' MB.' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  if (!apiKey || !baseUrl){
    return json(500, { error: 'AI Gateway not configured. Need OPENAI_API_KEY + OPENAI_BASE_URL.' });
  }

  const userText = (body.description || 'Estimate the items, weights, calories, and macros in this meal.').slice(0, 1000);

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name:        { type: 'string' },
            grams:       { type: 'number' },
            kcal:        { type: 'number' },
            proteinG:    { type: 'number' },
            carbsG:      { type: 'number' },
            fatG:        { type: 'number' },
            confidence:  { type: 'string', enum: ['low', 'medium', 'high'] },
            notes:       { type: 'string' }
          },
          required: ['name','grams','kcal','proteinG','carbsG','fatG','confidence'],
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

  let upstream;
  try {
    const endpoint = baseUrl.replace(/\/+$/, '') + '/chat/completions';
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        messages: [
          { role: 'system', content:
            'You are a careful nutrition estimator. Given a meal photo and optional context, ' +
            'return JSON only. Bias conservative: typical plates have hidden fats and oils the camera ' +
            'cannot see, so estimate slightly higher when uncertain. Always populate `assumptions` ' +
            '(what you guessed) and `warnings` (what you could not).'
          },
          { role: 'user', content: [
            { type: 'text', text: userText },
            { type: 'image_url', image_url: { url: body.photoBase64 } }
          ]}
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'food_analysis', schema, strict: true }
        }
      })
    });
    if (!r.ok){
      const t = await r.text();
      return json(502, { error: 'AI Gateway error', status: r.status, detail: t.slice(0, 500) });
    }
    upstream = await r.json();
  } catch (e) {
    return json(502, { error: 'AI Gateway request failed', detail: e.message });
  }

  let parsed;
  try {
    const content = upstream.choices && upstream.choices[0] && upstream.choices[0].message && upstream.choices[0].message.content;
    parsed = JSON.parse(content || '{}');
  } catch (e) {
    return json(502, { error: 'AI returned non-JSON content', detail: upstream });
  }

  if (!parsed.items || !Array.isArray(parsed.items) || !parsed.totals){
    return json(502, { error: 'AI response missing required fields', detail: parsed });
  }

  // Trust-but-verify: re-derive totals from items so the client never
  // trusts whatever totals the model wrote. The UI recomputes from items
  // on save too — defense in depth against malformed AI responses.
  const sum = parsed.items.reduce((acc, i) => ({
    kcal:     acc.kcal     + (Number(i.kcal)     || 0),
    proteinG: acc.proteinG + (Number(i.proteinG) || 0),
    carbsG:   acc.carbsG   + (Number(i.carbsG)   || 0),
    fatG:     acc.fatG     + (Number(i.fatG)     || 0)
  }), { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });

  return json(200, {
    items: parsed.items,
    totals: sum,
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
    warnings:    Array.isArray(parsed.warnings)    ? parsed.warnings    : []
  });
};

export const config = {
  path: '/api/analyze-food'
};
