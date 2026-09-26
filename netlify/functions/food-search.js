// netlify/functions/food-search.js
// v49 — packaged-food lookups from Open Food Facts, limited to products sold in
// Canada. Plain ES module, no dependencies.
//
//   GET /api/food-search?q=premier protein   → up to 12 matches (per-100 g values)
//   GET /api/food-search?code=0643843714477  → one product, with its serving size
//
// Why a relay: OFF's search service doesn't allow direct browser calls (no
// CORS), its free-text query language would let stray characters change the
// search, and its data is crowd-sourced — so numbers are cleaned here and
// obviously inconsistent entries are flagged `suspect` for the app to warn about.
// The public data needs no key and nothing about the user is sent upstream.

const SEARCH = 'https://search.openfoodfacts.org/search';
const PRODUCT = 'https://world.openfoodfacts.org/api/v2/product/';
const UA = 'BillysWorkout/1.0 (personal food log; https://workout-tracker-app-403.netlify.app)';
const TIMEOUT_MS = 8000;
const MAX_PER100 = { kcal: 900, proteinG: 100, carbsG: 100, fatG: 100 };
const MAX_SERVING = { kcal: 3000, proteinG: 300, carbsG: 500, fatG: 300 };

function reply(status, body, cacheSeconds){
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': cacheSeconds ? 'public, max-age=' + cacheSeconds : 'no-store' },
  });
}
function fail(status, code, message){ return reply(status, { error: code, message }); }

async function upstream(url){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal });
  } finally { clearTimeout(t); }
}

// Keep words, not query syntax: OFF search parses quotes, colons, brackets etc.
function cleanQuery(q){
  return String(q || '').normalize('NFC').replace(/[^\p{L}\p{N}\s'&.-]/gu, ' ').replace(/\s+/g, ' ').trim();
}
function text(v, n){
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '';
}
function num(v, max){
  const n = typeof v === 'string' ? Number(v) : v;
  return (typeof n === 'number' && isFinite(n) && n >= 0 && n <= max) ? Math.round(n * 10) / 10 : null;
}
function macros(n, suffix, max){
  const kcal = num(n['energy-kcal' + suffix], max.kcal) ?? (num(n['energy' + suffix], max.kcal * 4.184) != null ? num(n['energy' + suffix] / 4.184, max.kcal) : null);
  const out = { kcal, proteinG: num(n['proteins' + suffix], max.proteinG), carbsG: num(n['carbohydrates' + suffix], max.carbsG), fatG: num(n['fat' + suffix], max.fatG) };
  return Object.values(out).some(v => v != null) ? out : null;
}
// Calories should roughly equal 4·protein + 4·carbs + 9·fat. Crowd-sourced
// entries sometimes don't (one Premier Protein listing claims 0.2 kcal/100 g).
function suspectOf(m){
  if (!m || m.kcal == null) return true;
  const est = 4 * (m.proteinG || 0) + 4 * (m.carbsG || 0) + 9 * (m.fatG || 0);
  if (est < 15 && m.kcal < 15) return false;                  // water, diet drinks
  return Math.abs(m.kcal - est) > Math.max(25, 0.35 * Math.max(m.kcal, est));
}

function cleanProduct(p){
  if (!p || typeof p !== 'object') return null;
  const n = p.nutriments || {};
  const name = text(p.product_name_en, 100) || text(p.product_name, 100) || text(p.product_name_fr, 100);
  const code = typeof p.code === 'string' && /^\d{6,14}$/.test(p.code) ? p.code : null;
  if (!name || !code) return null;
  let per100 = macros(n, '_100g', MAX_PER100);
  const perServing = macros(n, '_serving', MAX_SERVING);
  const grams = num(p.serving_quantity, 2000);
  const servingLabel = text(p.serving_size, 40);
  // Only a serving is known: derive per-100 g from it when its weight is known.
  if (!per100 && perServing && grams){
    per100 = {};
    for (const k of Object.keys(perServing)) per100[k] = perServing[k] == null ? null : num(perServing[k] * 100 / grams, MAX_PER100[k]);
  }
  if (!per100 && !perServing) return null;
  return {
    code, name, brand: text(p.brands, 60),
    per100, perServing,
    serving: (grams || servingLabel) ? { label: servingLabel, grams } : null,
    suspect: suspectOf(per100 || perServing),
  };
}

export default async (req) => {
  if (req.method !== 'GET') return fail(405, 'method', 'GET only.');
  const params = new URL(req.url).searchParams;
  const code = params.get('code');
  const q = params.get('q');

  if (code != null){
    if (!/^\d{6,14}$/.test(code)) return fail(400, 'bad_request', 'That isn\'t a barcode.');
    let r;
    try { r = await upstream(PRODUCT + code + '.json?fields=code,product_name,product_name_en,product_name_fr,brands,serving_size,serving_quantity,nutriments'); }
    catch (e) { console.error('food-search: product lookup failed', e && e.name); return fail(502, 'upstream', 'Packaged-food lookup is unavailable right now.'); }
    if (r.status === 404) return fail(404, 'not_found', 'That product isn\'t in the database.');
    if (!r.ok){ console.error('food-search: product HTTP ' + r.status); return fail(502, 'upstream', 'Packaged-food lookup is unavailable right now.'); }
    let j; try { j = await r.json(); } catch (e) { return fail(502, 'upstream', 'Packaged-food lookup is unavailable right now.'); }
    const product = j && j.status === 1 ? cleanProduct(Object.assign({ code }, j.product)) : null;
    if (!product) return fail(404, 'not_found', 'That product has no usable nutrition data.');
    return reply(200, { product }, 86400);
  }

  const query = cleanQuery(q);
  if (query.length < 2) return fail(400, 'bad_request', 'Type at least 2 letters.');
  if (query.length > 80) return fail(400, 'bad_request', 'That search is too long.');
  let r;
  try {
    r = await upstream(SEARCH + '?q=' + encodeURIComponent(query + ' countries_tags:"en:canada"')
      + '&page_size=12&fields=code,product_name,product_name_en,product_name_fr,brands,serving_size,serving_quantity,nutriments');
  } catch (e) { console.error('food-search: search failed', e && e.name); return fail(502, 'upstream', 'Packaged-food search is unavailable right now.'); }
  if (!r.ok){ console.error('food-search: search HTTP ' + r.status); return fail(502, 'upstream', 'Packaged-food search is unavailable right now.'); }
  let j; try { j = await r.json(); } catch (e) { return fail(502, 'upstream', 'Packaged-food search is unavailable right now.'); }
  const seen = new Set();
  const results = (Array.isArray(j && j.hits) ? j.hits : []).map(cleanProduct)
    .filter(p => p && !seen.has(p.code) && seen.add(p.code)).slice(0, 12);
  return reply(200, { results }, 3600);
};

export const config = { path: '/api/food-search' };
