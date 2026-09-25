// tools/food-inbox.mjs — how Claude posts meal SUGGESTIONS to William's app.
//
//   node tools/food-inbox.mjs post <day.json> [--note "text"]   post one suggestion
//   node tools/food-inbox.mjs pending                            list suggestions not yet reviewed
//   node tools/food-inbox.mjs selftest                           check the table and its security
//
// The inbox key comes from the BILLYS_INBOX_KEY environment variable (on Windows,
// the user-level variable is read from the registry if this process started
// before it was set). It is never printed, logged or put in a URL. It can only
// add, read and remove rows in `food_inbox` — never the workout/food log itself.
// Nothing posted here reaches the log until William taps Accept in the app.
//
// <day.json> is { "days": [ { "date": "YYYY-MM-DD", "meals": [ { "category": "Lunch",
//   "name": "...", "notes": "", "items": [ { "name": "...", "kcal": 0, "proteinG": 0,
//   "carbsG": 0, "fatG": 0, "grams": 0 } ] } ] } ] }. The app re-validates everything.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const SB_URL = 'https://sqmkjgubujrkxygsukng.supabase.co';
const SB_KEY = 'sb_publishable_m6cjgKCi9ZwPUnlJWTUb3A_lGp67uNa';   // public by design, same as index.html
const TABLE = SB_URL + '/rest/v1/food_inbox';

export function readInboxKey(env = process.env, platform = process.platform){
  if (env.BILLYS_INBOX_KEY) return env.BILLYS_INBOX_KEY.trim();
  if (platform === 'win32'){
    try {
      const out = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', 'BILLYS_INBOX_KEY'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const m = out.match(/BILLYS_INBOX_KEY\s+REG_\w+\s+(\S+)/);
      if (m) return m[1].trim();
    } catch (e) { /* not set */ }
  }
  return '';
}
export function plausibleKey(k){ return typeof k === 'string' && /^[\x21-\x7e]{20,100}$/.test(k); }

// A first-pass check so obvious mistakes fail here, with a clear message,
// rather than as an unusable suggestion in the app. The app's check is the real one.
export function checkPayload(p, today){
  const errors = [];
  if (!p || typeof p !== 'object' || !Array.isArray(p.days) || !p.days.length) return ['payload needs a non-empty "days" array'];
  if (JSON.stringify(p).length > 200000) return ['payload too large'];
  p.days.forEach((d, i) => {
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) errors.push('day ' + (i + 1) + ': date must be YYYY-MM-DD');
    else if (today && d.date > today) errors.push('day ' + (i + 1) + ': ' + d.date + ' is in the future');
    if (!d || !Array.isArray(d.meals) || !d.meals.length) errors.push('day ' + (i + 1) + ': no meals');
    else d.meals.forEach((m, j) => {
      if (!m || !Array.isArray(m.items) || !m.items.length) errors.push('day ' + (i + 1) + ', meal ' + (j + 1) + ': no items');
      else m.items.forEach((it, k) => ['kcal', 'proteinG', 'carbsG', 'fatG', 'grams'].forEach(f => {
        const v = it && it[f];
        if (v != null && v !== '' && !(typeof v === 'number' && isFinite(v) && v >= 0)) errors.push('day ' + (i + 1) + ', meal ' + (j + 1) + ', item ' + (k + 1) + ': ' + f + ' must be a number >= 0');
      }));
    });
  });
  return errors;
}

function headers(key, extra){
  return Object.assign({ apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'X-Inbox-Key': key }, extra || {});
}
export async function post(key, payload, note){
  const r = await fetch(TABLE, {
    method: 'POST',
    headers: headers(key, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify({ inbox_key: key, payload, note: note ? String(note).slice(0, 200) : null }),
  });
  if (!r.ok) throw new Error('post failed: HTTP ' + r.status);
}
export async function pending(key){
  const r = await fetch(TABLE + '?select=id,note,created_at,payload&order=created_at.asc', { headers: headers(key) });
  if (!r.ok) throw new Error('read failed: HTTP ' + r.status);
  return r.json();
}
async function del(key, id){
  const r = await fetch(TABLE + '?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: headers(key, { Prefer: 'return=representation' }) });
  if (!r.ok) throw new Error('delete failed: HTTP ' + r.status);
  return r.json();
}

// Uses two throwaway keys (never the real one): posts a harmless row with A,
// checks A can read it and B can't, B can't delete it, then A deletes it.
export async function selftest(){
  const A = 'ib-selftest-' + randomBytes(12).toString('hex'), B = 'ib-selftest-' + randomBytes(12).toString('hex');
  const results = [];
  const step = (name, pass) => { results.push((pass ? 'PASS  ' : 'FAIL  ') + name); return pass; };
  await post(A, { days: [], selftest: true }, 'selftest — safe to ignore');
  const seenA = await pending(A);
  step('a key can add and read its own suggestions', seenA.length === 1);
  step('another key cannot read them', (await pending(B)).length === 0);
  step('another key cannot delete them', (await del(B, seenA[0] && seenA[0].id)).length === 0 && (await pending(A)).length === 1);
  const r = await fetch(TABLE + '?select=id', { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
  step('no key reads nothing', r.ok && (await r.json()).length === 0);
  step('the owner can delete', (await del(A, seenA[0].id)).length === 1 && (await pending(A)).length === 0);
  return results;
}

function localToday(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

async function main(argv){
  const cmd = argv[0];
  if (cmd === 'selftest'){
    const res = await selftest();
    res.forEach(l => console.log(l));
    return res.every(l => l.startsWith('PASS')) ? 0 : 1;
  }
  const key = readInboxKey();
  if (!plausibleKey(key)){ console.error('No inbox key found. Set BILLYS_INBOX_KEY (see CLAUDE.md, "Claude inbox").'); return 2; }
  if (cmd === 'pending'){
    const rows = await pending(key);
    if (!rows.length) console.log('No suggestions waiting.');
    rows.forEach(r => console.log(r.created_at + '  ' + ((r.payload && r.payload.days) || []).map(d => d.date + ' (' + ((d.meals || []).length) + ' meals)').join(', ') + (r.note ? '  — ' + r.note : '')));
    return 0;
  }
  if (cmd === 'post'){
    const file = argv[1];
    if (!file){ console.error('Usage: node tools/food-inbox.mjs post <day.json> [--note "text"]'); return 2; }
    const noteAt = argv.indexOf('--note');
    const note = noteAt > 0 ? argv[noteAt + 1] : '';
    const payload = JSON.parse(readFileSync(file, 'utf8'));
    const errors = checkPayload(payload, localToday());
    if (errors.length){ errors.forEach(e => console.error('✗ ' + e)); return 1; }
    await post(key, payload, note);
    const meals = payload.days.reduce((a, d) => a + d.meals.length, 0);
    console.log('Posted ' + meals + ' meal(s) for ' + payload.days.map(d => d.date).join(', ') + '. William reviews them in the app.');
    return 0;
  }
  console.error('Usage: node tools/food-inbox.mjs post <day.json> [--note "text"] | pending | selftest');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href){
  // Set exitCode rather than calling process.exit(): exiting while fetch's
  // sockets are still closing crashes Node on Windows (libuv assertion) and
  // reports a misleading exit code.
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, e => { console.error(e.message); process.exitCode = 1; });
}
