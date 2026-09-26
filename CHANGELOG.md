# CHANGELOG — billys-workout

The dated history of the app, **newest first**. Moved out of CLAUDE.md on 2026-09-24 to keep the rulebook short; rules still in force were folded into CLAUDE.md's **Current state** and **House rules**. "Rule #N" below means the House rules in CLAUDE.md.

When you ship something, add an entry at the top.

---

## 2026-09-25 — v49: food search, and local test copies can't sync

**Food search.** William used to log food in Samsung Health and wanted its search. 🔎 **Search food** in the meal (and saved-meal) editor searches, in order: **your foods** (every item you've logged, saved, or used as a recipe ingredient with grams — offline, with your own numbers; recent ones show before you type), Health Canada's **Canadian Nutrient File** (5,690 plain foods with Canadian metric serving sizes; no key; the name list is cached per device and searched on the phone; nutrients fetched on pick), and **Open Food Facts, Canada** for packaged brands (through a new relay, `/api/food-search`, because its search blocks browser calls and parses query syntax). He asked for the Canadian source over USDA; CNF needs no key, so there was nothing for him to set up.

Pick → choose grams or a serving chip ("1 medium (18–20 cm) = 118 g", "1 serving (1 Shake (325 ml)) = 325 g") → an editable row with a live macro preview. Nothing saves until Save. Crowd-sourced OFF entries whose calories don't match their macros (one Premier Protein listing claims 0.2 kcal/100 g) are flagged ⚠️; the relay also blanks out-of-range numbers, strips query syntax, adds the Canada filter, and never logs the search text. Verified live: relay against real OFF (Premier Protein, Gatorade Zero, Dempster's), and the app in a real browser against real CNF — "banana" → "Banana, raw" → 1 medium = 105 kcal.

**Incident, and the guard for it.** During the v48 browser test a fake sync code was put into the `localhost` test copy and not removed. The app syncs on page load, before a test can stub `fetch`, so later reloads created a junk row (`bw-000…`) in William's Supabase. His own row was never touched. Now `isLocalTestCopy()` makes every sync request from a local copy fail — FAILURE-MODES §9. The junk row (and an old `bw-TES…` test row) await his OK to delete.

Also: food-search results with equal dates sorted unpredictably (comparator never returned 0) — fixed. Tests: 653 assertions; 33 food-search mutations and 6 guard mutations caught from baseline-verified copies.

---

## 2026-09-25 — v48: Admin tab

William asked for an Admin tab holding CSV, Backup, Restore and Sync. **⚙️ Admin** joins Workout and Food; the header toolbar keeps only Install (and the hidden restore file input, which stays outside the re-rendered area so it always exists). The page gathers Sync (status, last synced, unsynced changes, Sync now, Sync settings), the Claude inbox (waiting count, Review, Check now), Backup & restore with a one-line explanation of each, the workout CSV (current mode; says food isn't included), and the app version. Every button calls the same function as before.

Moving the Sync button would have hidden sync problems, so `setSyncStatus()` now badges the tab label (📴 offline, ⚠️ error/conflict) and redraws the Admin page when it's open. Navigation rules unchanged: Admin is per-device view state.

`APP_VERSION` is now the one place the version is written in `index.html` (label, backup `appVersion`, Admin), and a test fails if it differs from `sw.js`.

Found in browser testing and fixed: with a badge showing, the three top tabs ran 10px past a 320px phone — narrow screens now get tighter padding (FAILURE-MODES §8). Tests: 542 assertions; 13 Admin mutations caught from a baseline-verified scratch copy; Gate 1a/2 mutations re-run, all caught.

---

## 2026-09-24 — docs split, and the public site limited to the app

- **Docs:** CLAUDE.md was ~60 KB, mostly dated entries. The history moved here (newest first); rules still in force were condensed into CLAUDE.md's new **Current state** section. A line-by-line check confirmed every old line is either carried over verbatim or deliberately rewritten (stale facts corrected: "no database", Rule #11's script line numbers, the "can't push from here" deploy note). New: **README.md** (William's plain-language guide) and **FAILURE-MODES.md** (repeat bugs by shape, with a pre-ship checklist).
- **Hiding rule:** the site publishes the repo folder, so docs, tests, tools and config were readable at the app's address. `netlify.toml` now 404s all of them. A test fails if a top-level file or folder is neither an app asset nor listed there, and if an app asset is ever hidden — both proven by breaking them.

---

## 2026-09-24 — v47: inbox cleanup retry

First real use (Sep 24): William accepted Tue + Wed on his phone while it had no connection. The meals were safe locally and uploaded when he tapped Sync now, but the rows' deletes had been fire-and-forget, so they'd have lingered on the server. `checkInbox()` now retries the delete for any row it receives whose id is already in `food.inbox.done` — and **only** those (a mutation that deleted every returned row, i.e. unreviewed suggestions too, is caught by the tests). Those rows were never shown again either way; this is tidiness, not correctness.

**Logging workflow as it actually ran:** William pastes the day's list in chat → Claude checks what's already on that date (a names/categories-only `execute_sql` read via the connector is fine) → writes the day JSON with real label/USDA numbers, every estimate spelled out in meal `notes` → `node tools/food-inbox.mjs post …` → he Accepts in the app → verify the server copy (`workout_state` meal counts/kcal per day) and `pending` is empty. If he says he accepted but the server doesn't show it, the accepting device is offline or unsynced: have him open ☁️ Sync → Sync now.

**Don't confuse the two keys.** On 2026-09-24 William first put his **sync code** (`bw-…`) into `BILLYS_INBOX_KEY`. The script rejected it (inbox keys start `ib-`) and nothing was written with it. The sync code therefore appeared in chat; he chose to rotate it later. Never use a `bw-` code, even if it's handed over.

---

## 2026-09-24 — v46: Claude inbox (how Claude logs food for William)

**This is the way to "add today's meals" when William asks.** Claude must not use or ask for the sync code. Instead Claude posts *suggestions* to the inbox; William reviews and accepts them in the app.

**Posting (Claude):**
1. Write the day as JSON (format at the top of `tools/food-inbox.mjs`; same item fields as saved-meal import, plus per-meal `category`, `name`, `notes`, `time`). Use real label/USDA numbers only — never invent values; leave a number out (= 0) and say so in `notes` when unknown.
2. `node tools/food-inbox.mjs post day.json --note "Sep 24 — from your list"` → prints what was posted. `pending` lists what he hasn't reviewed; don't re-post a day that's still pending.
3. Tell William it's waiting in the app (Food tab banner "📥 N meals from Claude").

The key comes from `BILLYS_INBOX_KEY` (Windows user environment variable; the script reads the registry if the shell predates it). Never print it, put it in a URL, or paste it in chat. `node tools/food-inbox.mjs selftest` checks the table and its row security with two throwaway keys — it never touches the real inbox.

**Server:** table `public.food_inbox` (`supabase/food_inbox.sql`, applied 2026-09-24 through the Supabase MCP connector as migration `food_inbox`, with William's go-ahead). Verified live: selftest 5/5 PASS, edits refused (no UPDATE policy), no rows left behind, security advisor silent on the new table. RLS scopes insert/select/delete to rows whose `inbox_key` equals the `X-Inbox-Key` header; there's no update policy; payload < 256 KB. The inbox key can't read or change `workout_state`.

**App:** Sync panel → 📥 Claude inbox → Set up (key `ib-` + 48 hex, stored in `food.inbox.key` so it syncs) / Check now / Turn off (deletes pending rows, forgets the key). `checkInbox()` runs on open and on returning to the foreground (throttled 60 s, single-flight, silent on any failure, skipped offline). It only *shows* suggestions: a banner on the Food screen opens the review sheet (days, categories, items, macros, notes, "already logged?" flags). **Nothing reaches the log until Accept.** `parseInboxPayload()` re-validates with the same rules as import (dates must be real and not in the future, ≤ 14 days, ≤ 20 meals/day); unusable ones can only be dismissed. Accept/Reject record the row id in `food.inbox.done` (synced, capped at 200) *before* deleting the row, so a failed delete or another device can never apply one twice. Accepted meals carry `addedBy: 'claude-inbox'`.

Tests: 455 assertions, including a fake Supabase enforcing the same per-key rules; the selftest is proven to catch each kind of leak separately. 26 mutations, all caught. Found in browser testing and fixed: Accept didn't redraw the day behind the review sheet.

**Mutation-testing gotcha (for whoever runs these next):** scratch copies of the repo must include every file the tests import (`tools/` since v46). A missing file makes *every* mutation "fail", which reads as "all caught" — check an unmutated copy passes first.

---

## 2026-09-23 — v45: import saved meals

**Why it exists:** Claude can't write into William's data (it lives on his devices and behind his sync code, which Claude must not use). Import is the hand-off: Claude prepares text, William pastes it in the app (on any device — sync carries it to the others).

**Saved tab → ⤓ Import saved meals** → paste text or Choose file → **Check** (preview: each meal marked New or Replace, with item count, kcal and protein) → **Import N saved meals**. Format — also documented in the code above `parseSavedMealsImport()`:

```json
{ "savedMeals": [ { "name": "Breakfast coffee", "category": "Breakfast",
    "items": [ { "name": "Whey isolate (1 scoop)", "kcal": 120, "proteinG": 27, "carbsG": 2, "fatG": 0.5, "grams": 32 } ] } ] }
```

A bare array works too. `category` may be a label ("After Work / Workout") or id (`post-workout`); `protein`/`carbs`/`fat` are accepted aliases; missing numbers are 0. Rules: JSON.parse only; **all-or-nothing** with specific messages ("Meal 2 ("A"), item 1: kcal must be a number from 0 to 10000"); limits 50 meals, 30 items each, 200k chars, per-item caps; duplicate names within one import rejected. **A name matching an existing saved meal (case-insensitive) replaces it in place** — id and unknown fields kept — so pasting the same text twice doesn't duplicate. Apply re-parses the current text, and editing the text clears the preview. Logged meals are never touched. When giving William import text, put mL amounts in the item name (the `grams` field is grams).

Tests: 376 assertions — the fixture is the exact three-meal text given to William on 2026-09-23. 19 mutations, all caught.

---

## 2026-09-23 — v44: new saved meal from scratch

**+ New saved meal** on the Saved tab opens the same saved-mode editor empty (`openSavedMealEditor(null)`, `savedId: null`); Save calls `addSavedMeal()` and logs nothing. Same rules: a name or category, at least one item, validated numbers. "+ Saved Meal from Recent" is still there as the second button.

Tests: 287 assertions; 4 more mutations on this path, all caught.

---

## 2026-09-23 — v43: edit saved meals

✎ on each saved meal opens the **meal editor in saved mode** (`openSavedMealEditor()`, `_mealEditor.kind === 'saved'`) — same category chips, item rows and number checks, but no date, time, notes or photo. Save goes through `updateSavedMeal()`, which updates in place, keeps unknown fields, drops an invalid/cleared category, and refuses (rather than re-creating) a saved meal another device deleted meanwhile. At least one item is required. **Meals already logged from it are copies and don't change** — the sheet says so. Saved-meal chips now show their category.

Tests: 274 assertions; 10 mutations, all caught.

---

## 2026-09-23 — v42: Food tab bar fits on phones

The four Food tabs used the Workout/Food switch's style (16px side padding, sized to content), which needed ~360px — more than a 375px phone has, so "Recipes" was clipped. `#food-tab-nav` now has its own CSS: full width, four equal tabs, 4px padding, and 12px text below 360px. Measured in the browser at 279, 320, 375 and 414px: every tab's text fits, no page overflow. The Workout/Food switch is unchanged. CSS only.

---

## 2026-09-23 — v41: recipe partial portions

- **Log any amount.** Recipe cards have **Log 1 portion** (unchanged) and **Log amount…**, a sheet with Portions / Grams, a live macro preview, and limits (0 < portions ≤ 20, 0 < grams ≤ 5000). Everything goes through `logRecipeAmount(id, portions, grams)`, which logs to `foodDay()` and records `meal.recipe = {id, portions, grams?}` (additive).
- **Per-ingredient portion count** (`ing.portions`, optional): an ingredient divides by its own count instead of the recipe's — the beef & cabbage stir-fry makes 8 portions but its rice made 7. `recipeScaledItems(r, n)` takes `n / ingPortions` of each ingredient; `recipePerPortion()` drives the card.
- **By weight** needs `r.cookedWeightG`, the cooked weight of the whole batch, weighed once. grams ÷ (cooked ÷ portions) = portions, then the same maths. Raw ingredient grams can't stand in for this, so the Grams tab explains instead of guessing when it's missing.
- Old recipes (no cooked weight, no ingredient portions) compute exactly as before. The recipe editor now keeps unknown ingredient fields on save (same fix as meals in v40), and blank cooked weight / ingredient portions remove the field.

Tests: 250 assertions; 16 mutations, all caught (one — accepting 0 — only after adding a check that the user is told why).

---

## 2026-09-23 — v40, Gate 3: AI photo estimates

**Flow.** Meal editor → 📷 Estimate from photo (+ optional description) → the phone resizes to ≤1280 px JPEG (`compressPhoto()`, typically 0.2–0.5 MB, strips metadata) → `POST /api/analyze-food` → the result is loaded into the **open editor as ordinary editable rows** (`applyAiResult()`), replacing only an untouched starter row, with a banner plus the model's assumptions and warnings. **Nothing is saved until the user taps Save — never write an AI result directly.** Saved items keep `source: 'ai'` + `confidence`; the meal gets `aiAssisted: true` (additive). The photo is never stored or synced. A result that arrives after the editor was closed is dropped.

**Auth is the sync code — no separate token.** The app sends `X-Sync-Key`; the function checks it with the same RLS-gated Supabase read that sync uses, and **fails closed** if Supabase can't be reached (paused project → photo analysis unavailable, manual logging unaffected). So photo analysis needs Sync set up on the device. No new secret exists anywhere in the public page. The key is never sent to the AI gateway and never logged.

**Server config (Netlify env vars):** `OPENAI_API_KEY` + `OPENAI_BASE_URL` — provided by Netlify AI Gateway when it's enabled for the team; if missing the function answers 503 `not_configured`. Optional `FOOD_AI_MODEL` (default `gpt-4o-mini`) and `FOOD_AI_DISABLED=1` as a kill switch. `ANALYZE_FOOD_TOKEN` is no longer used. **Never put a model key in `index.html`.**

**Hardening.** Only base64 JPEG/PNG/WebP, ≤4 MB. The model's output is never passed through: every number clamped (≥0, per-item caps), strings cut, ≤25 items, totals recomputed; the client re-validates the same way. Errors are a stable `error` code plus a plain `message`; upstream bodies are never returned or logged (status only). `sw.js` now ignores non-GET requests.

**Also fixed:** `mealSaveDraft()` rebuilt items from a fixed field list, dropping any other field (the AI markers, or a newer build's fields). It now keeps them. And the test suite now **fails if it never reaches the end** — a hung async test used to exit 0, which looks like a pass.

Tests: 208 assertions. 26 Gate 3 mutations: 25 caught; the 26th (removing the stale-result guard) is behaviourally equivalent because the late result is written to the closed draft object, never the open one. The real end-to-end call needs Billy's phone with Sync set up — it can't be exercised from here without a real sync code.

---

## 2026-09-23 — v39, Gate 2: meal categories and editable goals

- **Categories are stable ids on the meal** (`meal.category`: `breakfast`, `am-snack`, `lunch`, `pm-snack`, `post-workout`, `dinner`, `evening-snack`), defined once in `MEAL_CATEGORIES`. Store the id, never the label, so labels can be reworded freely. Unknown or junk ids read as Other.
- **Additive, no migration.** Meals from before v39 have no `category` and are **never rewritten**: `mealCategory()` groups them at render time by name ("Breakfast", "After Work" …) or under Other. Editing and saving such a meal writes the category for real. Older builds keep the field on edit because `updateMeal()` merges with `Object.assign`.
- **Defaults.** A new meal logged for today defaults by time of day (`categoryForNow()`, hour thresholds in `MEAL_CATEGORIES[].from`); a past day defaults to none. Saved meals remember their category; recipe portions take the time default today, none on a past day. A blank name takes the category label, so older builds still show "Breakfast".
- **Day view groups by category** in the fixed order, with a subtotal per group; the card title is the item list when the name just repeats the category. **History lists what was eaten under each category.**
- **Goals are editable** (Edit goals on the Day progress card), stored in `food.goals` so they sync. Validated as calories 500–10000 and protein 0–500 (typo guards, not advice), rounded to whole numbers; unknown goal fields are kept.

Tests: 149 assertions. Thirteen Gate 2 mutations were each caught. One mutation (removing `esc()` on category headings) is undetectable because labels are fixed text — it's kept as a guard in case labels ever become editable.

---

## 2026-09-23 — v38, Gate 1a: sync you can trust, Food on any day

William is developing Food in gates: **1** reliable manual Food (1a done here), **2** meal categories + editable goals, **3** AI photo analysis. Don't start a later gate's work early. His Sept 22–23 food log goes in through the app/data layer once macros are known — never hard-coded, and never with invented numbers.

- **Screen/tab position is per-device and never synced.** Stored in `caprica_workout_v2_view` (`saveViewPrefs()`/`applyViewPrefs()`); `switchSection()` and `setFoodTab()` no longer call `saveState()`. Before v38 they did, and `viewState` rode in the synced blob, so merely switching tabs marked the device dirty and turned the other device's next change into a conflict. A v36–v37 blob's `viewState` is read only as a first-load fallback. **Don't route navigation through `saveState()` again.** (`workoutMode` — gym/travel — is still in the blob, as it always was.)
- **Foreground/background sync.** `visibilitychange` → visible calls `resumeSync()` (skipped while a modal is open, because a clean pull reloads the page and would lose a half-typed meal); → hidden flushes a pending push immediately instead of waiting out the 3s debounce. Conflict handling is unchanged (Rule #12).
- **Food on any past day.** `foodDay()` is the day the Food screen shows and logs to (`viewState.foodDay`, null = today, session-only, clamped to ≤ today in both `setFoodDay()` and `foodDay()`). Day arrows, "Back to today", tappable History cards, and History paging by week (`viewState.foodHistoryPage`). Log Meal, saved meals and recipes all log to `foodDay()`; Saved/Recipes show "Logging to …" when it isn't today.
- **Deletes confirm** (meal, saved meal, recipe). **Numbers are validated** on save (`foodRowError()`): blank = 0, otherwise a finite number ≥ 0; recipe portions > 0. **Meal time is escaped** — it was the one unescaped Food field.
- Logging a saved meal now always gives items fresh ids (it reused the saved meal's, so repeated logs shared ids).

Tests: 115 assertions. Each Gate 1a behaviour was mutation-checked — thirteen deliberate breakages, each made the suite fail. (The Food tab bar clipping noted here was fixed in v42.)

---

## 2026-09-23 — v36 food tracking, v37 hardening

**v36 (Sept 21–23, built outside Claude, commits `90a60e5`, `651e301`, `a921380`)** added a Food section beside Workout: meals per day, daily kcal/protein goals, saved one-tap meals, and meal-prep recipes logged one portion at a time. State is a **top-level `food` object** in the same `caprica_workout_v2` blob (not inside `store`), so it rides along with save, backup, restore and sync. Totals are always recomputed from items (`mealMacros()`); a stored `totals` is ignored. All food UI is event-delegated via `data-act`/`data-input` — no user text in inline `onclick`. `90a60e5` shipped a parse error (blank app) that `651e301` fixed a day later — the syntax check (`node tests/check_syntax.cjs`) exists to prevent a repeat.

**The app is no longer network-free.** `netlify/functions/analyze-food.js` serves `POST /api/analyze-food`. *(v36–v39 notes about `ANALYZE_FOOD_TOKEN` / `X-Food-Token` are superseded — see the v40 section above.)*

**v37 fixes (`sw.js` → v37, app label → v37):**
- `saveState()` now carries **unknown top-level keys** through every save (`unknownTopKeys`, filled in `loadState()` for schema ≥ 4 only — v3 blobs' top-level keys are the old schema and must not be carried). Before this, a build older than the data dropped anything newer at the top level — which is exactly how pre-v36 devices drop `food`, and would have repeated with the next top-level addition.
- `applyRemote()` keeps this device's `food` when the incoming synced copy has **no `food` key at all** (written by a pre-v36 build), and marks the device dirty so the next sync repairs the server. A copy that *has* `food`, even an empty one, wins as normal. This only mitigates the pre-v36 client problem on the receiving end; it can't stop an old build from pushing a food-less copy.
- Conflict and restore prompts show meal counts alongside workout counts (`countMeals()`), so a food-only difference is visible.
- `analyze-food.js`: fail closed without the token; `notes` added to the strict schema's `required` (strict mode needs every property listed, or the API rejects the request — it would have failed every call).

Tests: `node tests/workout.test.cjs` now covers food mutations and totals, persistence, the top-level key carry-through, the sync food guard, and the function's auth and schema (77 assertions). Each new check was confirmed to fail against the pre-v37 code.

---

## 2026-09-20 — v35

Gym now forecasts Monday–Friday from September 21, using separate built-in types `Upper A`, `Lower A`, `Upper B`, `Lower B`. `gymProjection()` skips weekends and carries missed workouts to the next weekday. Existing pinned days (including legacy/custom ones) remain intact; only the new types advance the new cycle. Travel still uses the original every-other-day Upper/Lower/Arms forecast and 10-week A/B blocks.

`GYM_TEMPLATES` contains the cable-free routines and per-plan rep targets/cues. Legacy `TEMPLATES` and the original progression targets remain for history. New lifts have blank working weights or BW; existing lifts retain saved weights. `pinIfNeeded()` freezes new plans before logging so exercise names, ranges and set counts cannot change under existing reps. Custom plan copies preserve this metadata, and swaps clear it to use the replacement exercise's targets.

New routines start at two working sets. From October 5 onward, the calendar offers a recovery-based switch to regular set counts (and back); `store.gym.fullVolumeFrom` only affects untouched plans. This additive field is included by existing save/backup/sync without backend changes.

New gym progression is explicitly confirmed in the exercise modal after all target reps are logged. Default increments: 5 lb for barbells, 2.5 lb for dumbbells, adjustable to match the equipment. Bodyweight does not auto-progress. Existing rep-edit and swap/removal rollback still applies. Legacy sessions and Travel retain the old progression behavior. The older rules below describe those legacy paths where they mention +10%, 10-week blocks, or three-day gym rotation.

Validation: `node tests/workout.test.cjs` checks scheduling, skips, pins, history, v3 migration, Travel, ramp-up, persistence and reversible progression. Browser verification uses a separate localhost origin, never real synced workout data. Syntax-check the full script and bump the service-worker version on deployment as before.

---

## 2026-08-06 → 2026-08-08 — v17 to v34 (formerly "Recent changes")

- **2026-08-08 — build a custom workout from scratch (`sw.js` → v34, app label → v34).**

  Follow-up to v33: **+ New custom workout** in the manage screen starts from a blank list, and **Edit exercises** reopens any saved one. Previously the only route was to set a day to Upper/Lower/Arms and delete what you didn't want, which is backwards for a workout with nothing in common with the templates.

  `openTemplateEditor()` edits the saved template directly — add, remove, and set counts. It reuses `updateAddExercises()` and `modAddSets()` from the day flow, so the picker is the same one, but keeps its own add/remove rather than reworking the day/session code.

  Verified: creation starts empty, exercises add with the chosen group and set count, sets clamp at 1–6, removal works, and a day set to that workout picks up the list. Edge cases checked — a day set to an *empty* custom workout still renders and opens, and template edits reach untouched days while hand-edited days keep their own copy.

- **2026-08-08 — custom workouts (`sw.js` → v33, app label → v33).**

  Named, reusable exercise lists that sit alongside Upper/Lower/Arms. Build a day however you like, then **Save as custom workout** in the day modal — it reuses the existing per-day exercise editing rather than adding a second exercise picker. **Manage custom workouts** renames and deletes. Stored per mode in `store[mode].customTypes`, so they ride along with backup, restore and sync for free.

  They deliberately don't join the rotation — see Rule #13 for the `isRotationType()` guard that keeps `nextType()` from resetting the cycle. Verified: inserting a custom day preserved the order `Lower > Arms > Upper > Lower > Arms` and only shifted the dates out by the normal spacing; with a custom day in the past the anchor still resolved to the last real rotation workout.

  **Also fixed a latent sync hazard in `loadState()`.** It whitelisted the five known store keys, so a device on an older build would drop anything newer, then save it back without it and push that loss to every other device. It now preserves unknown keys. Verified a synthetic future key survives load, re-save and backup. This mattered immediately — `customTypes` is exactly such a key, and v32 clients would have deleted it.

  Two self-inflicted problems worth recording. A PowerShell find-and-replace corrupted every emoji in `index.html` and added a BOM; reverted with `git checkout` and redone through the Edit tool — see Rule #11. And the same bulk replace rewrote `TYPE_LABEL[t]` *inside* the new `typeLabel()` helper, making it call itself; caught by a stack-overflow in testing.

- **2026-08-08 — keep-alive for the free Supabase project (no app change, no `sw.js` bump).**

  `.github/workflows/keep-supabase-awake.yml` runs twice daily and makes three queries against `workout_state`, keeping the project above the Free-plan activity threshold. Sync was confirmed working across William's phone and laptop first — the keep-alive was only worth adding once there was something to keep alive.

  **No secrets.** It sends the publishable key that's already public in `index.html` and deliberately sends *no* `X-Sync-Key`, so RLS returns `[]` every time. Verified by running the script body locally: three 200s and an empty-list body, so nothing of Billy's can reach the workflow logs.

  It distinguishes failure modes rather than just failing: `540` reports the project as paused with the dashboard link and the 90-day deadline, `401/403` points at a rotated key needing updating in two places, and `000` means unreachable.

  One bug caught before it shipped: `[ "$fail" = "1" ] && exit 1` under `set -euo pipefail` aborts the job on a *successful* query, because the false test makes the AND-list return non-zero. Rewritten as an `if`. There's a comment in the file so it doesn't get "tidied" back.

- **2026-08-08 — Supabase sync (`sw.js` → v32, app label → v32).**

  Automatic two-way sync across devices, chosen over manual push/pull because it never silently loses data. `☁️ Sync` in the toolbar: create a sync code on the first device, paste it on the others.

  Pull on open when the server is ahead and this device is clean; debounced push 3s after a save. When both sides have moved, it stops and asks — see Rule #12 for the compare-and-swap that makes that detection reliable, and don't touch it without reading that rule.

  Schema, RLS and constraints were applied by William through the dashboard SQL Editor (the MCP connector can't see this project) and verified from here over HTTP: reading with the publishable key and no sync header returns `[]`; cross-key reads and writes are refused; deletes leave the row; the size and key-length caps reject bad input.

  Sync verified end to end against the live database: round trip preserved workout counts; a stale compare-and-swap was detected instead of overwriting; server-ahead-and-clean pulled; server-ahead-and-dirty prompted and left the server untouched; "keep this device" advanced the server and cleared the dirty flag; with no sync key every entry point no-ops. **Offline: with `fetch` failing outright, logging still saved, the app still rendered, the change stayed pending, and it uploaded once the network returned.**

  Not done: nothing keeps the free project awake. See Open work.

- **2026-08-08 — backup/restore, and stop hiding logged data (`sw.js` → v31, app label → v31).**

  Prompted by William opening the app on his laptop and finding an Arms workout he'd logged on his phone "missing." Nothing was wrong — `localStorage` is per-device and there is no sync — but it surfaced that a lost phone meant a lost training history, with no copy anywhere.

  **💾 Backup / ♻️ Restore.** `exportBackup()` writes the whole `LS_KEY` blob wrapped with `_backup`/`exportedAt` metadata; `importBackup()` accepts that wrapper or a bare state blob, validates it has `store` + `_schemaVersion`, and shows a confirm listing what's in the file *and* what's on the device before overwriting. Restore is destructive, so it first copies the current blob to `caprica_workout_v2_pre_restore`.

  It ends with `location.reload()` rather than re-hydrating in place — deliberate. `loadState()` uses `Object.assign` into the live `PROGRESSION` objects, so a swap without a reload leaves stale exercise keys from the outgoing data. Don't "optimise" the reload away.

  **CSV export was hiding real data.** It skipped any day whose type read `Rest`, but an unpinned day still holds its logged sets — so a day that dropped its pin vanished from the export while its reps sat in storage. Now any day with logged data is exported regardless of type, labelled `Unpinned (has logged data)`.

  **`setDayType(ds,'auto')` now freezes the plan first.** A logged day's plan is usually a template derived from its type; unpinning discarded the type, leaving reps with nothing naming the exercises. It now materialises the plan into `dayPlans` before dropping the pin — but only when the day actually has logged data, so genuine rest days don't accumulate plans. Before this, the rescued CSV rows read `(unknown — plan not stored)`.

  Verified: full round trip (3 logged workouts across gym + travel, wiped, restored, reps and weights identical); junk/CSV/wrong-shape files rejected; both wrapped and bare blobs accepted; unpinned days now export with real exercise names; genuine rest days still excluded; re-pinning restores everything.

- **2026-08-08 — repaint on modal close; fixes the swap regression (`sw.js` → v30, app label → v30).**

  **Swapping an exercise looked like it did nothing.** The plan saved correctly, but closing the modal left the old exercise name on screen until some unrelated action happened to redraw. Reproduced on the live site: the list still read the old name while `getPlan()` returned the new one.

  Cause was fix #6 from 2026-08-07 (below). Removing `render()` from `swapExercise` looked like it was deleting a wasted repaint hidden behind the modal — but `closeModal()` only strips a CSS class and never redraws, so nothing repainted the list at all.

  **`closeModal()` now calls `render()`.** This keeps the original intent — one repaint when the modal actually closes, instead of one per modal action behind a covering overlay — while guaranteeing the list is correct when the user sees it again. **Don't remove this `render()`**, and don't put one back in `swapExercise`; the comment on `closeModal` says why.

  Verified: swap now shows the new exercise on close, `removeExercise` still updates, day view survives a close-triggered render, back-to-month works, and closing a modal from the monthly view is fine.

- **2026-08-07 — standalone day view (`sw.js` → v29, app label → v29).**

  New `'day'` view mode: tapping a day opens it on its own page rather than scrolling to it inside the weekly list. `goToDay()` sets `viewState.dayAnchor` and `mode = 'day'`; `renderDayView()` wraps the existing `renderDay()` with a "← Calendar" back bar; `backToMonth()` returns to monthly. The view bar and mode toggle are hidden in day mode and restored on the way back. Rest days get the same treatment with a "Change day" button. Both "Open workout" and the "Next up" card route through it.

  Note `render()` skips scroll restoration in day mode and `updateNavLabels()` returns early — day mode has no week/month nav to label.

- **2026-08-07 — v28 review fixes (six cleanups, `sw.js` → v28).**

  Applied all six recommended fixes from the v28 review:

  1. **Removed duplicate CSS blocks** — `.month-grid` and `.month-day` were defined twice (lines 64-77 and lines 220-236). The first set was dead — the second always won. Removed the first, file went from 1612 → 1598 lines.

  2. **Bumped `sw.js` VERSION from v18 to v28** — it was 10 versions behind. Without this, PWA users who installed pre-v28 would keep the old cached app.

  3. **`changeSets` now truncates `sess.reps` when reducing sets** — if an exercise drops from 5 sets to 3, set 4 and 5 rep values are now discarded. Before they stuck around in localStorage forever (invisible in the UI but alive in exports).

  4. **Escape key closes the modal** — `document.addEventListener('keydown', ...)` added. Small but makes desktop use feel responsive.

  5. **`saveState` now shows a toast on failure** — instead of silently swallowing a full-storage error, it tells the user. The console.error stays (for debugging).

  6. **`swapExercise` no longer calls `render()` before reopening the modal** — it was doing a full-page render that got immediately covered by the modal. Now it just saves and opens the modal, saving a render cycle. ⚠️ **This one caused a regression — see the 2026-08-08 entry.** The render looked wasted but was the only thing repainting the list underneath.

- **2026-08-06 — progression rollback fix, plus two small cleanups (`sw.js` → v18).**

  **`swapExercise` and `removeExercise` left progression bumps stranded.** Reproduced in the browser against the live site: Incline Barbell Press at 135, all sets logged at the top of the range, correctly bumped to 150 — then swapping the exercise out left it at **150 permanently**, with `progressedFrom: 135` orphaned on the session. `removeExercise` did the same and was worse: it deletes the session entry, so nothing remembered 135 at all. Real-world effect is Billy's working weight creeping up for a session he didn't actually complete.

  Root cause is that `syncProgression()` recomputes from the *current* plan, so it cannot undo an award after the plan entry has changed — the rollback has to happen first. Added `revertProgression(ds, exIdx, name)` and called it at the top of both functions, before the mutation. Rule #5 now documents the constraint. Verified fixed for both paths (135 → 150 → 135), with a control check that ordinary rep-edit-down rollback still works.

  **`manifest.json` description** updated — it still advertised a 2-week rotation that hasn't existed since v28.

  **Added `.gitattributes`** with `* text=auto` and `*.png binary`, so Windows CRLF churn stops burying real changes in diffs. This is the thing the v28 commit had to clean up by hand.

- **2026-08-06 — CLAUDE.md reviewed and corrected (docs only, no app change).** Every house rule was re-checked against `index.html` and they all hold: no `ROTATION_START` or week indices survive, `toISOString` appears zero times, `pinIfNeeded` is called from exactly the four paths Rule #4 names, `bumpWeight` matches Rule #6, `sw.js` is on v17. Four things were wrong and are now fixed:

  **The on-disk path was wrong** — it claimed `D:\GitHub Repo\`, but the clone is inside OneDrive, the very thing the line below it warns against. **Rule #11's syntax check couldn't run** — it assumed `python3`, `node` and `/tmp`, none of which exist on William's Windows machine; a PowerShell version and a browser fallback were added. **The `_v3_backup` key** is assembled from `LS_KEY` and so can't be found by searching for it, which reads like it doesn't exist. **The docs-current hash** was stale.

  Also recorded: a directory listing returned the repo one commit behind and reported `CLAUDE.md` as nonexistent, while PowerShell saw it correctly at the same moment. **This was first written up as OneDrive sync lag. That was wrong** — checked the same day, no file carries the `Offline`/`ReparsePoint` attributes that mark cloud placeholders, and the OneDrive client wasn't running. It was a stale sandbox snapshot. The corrected guidance is under "On disk"; the lesson is to cross-check with PowerShell before recording an absence as fact.

- **2026-08-06 — v28: rotation-driven schedule, editable day types, 10% progression (`d2ba4de`, `sw.js` → v17).** Three changes William asked for, plus one bug found on the way in.

  **Schedule is now driven by what was actually logged.** Upper → Lower → Arms, where the next workout lands the day after the last one completed and slides forward if it's skipped. Previously the split was pinned to Mon/Wed/Fri by day-of-week, so missing a Wednesday desynced the rotation until the next week. Beyond the next workout the calendar sketches an every-other-day forecast so the month isn't blank — that's a forecast, not a commitment (Rule #3).

  **State re-keyed from `[weekIndex][dayOfWeek]` to dates**, with a v3 migration and a backup of the old blob (Rules #1, #9).

  **Monthly view is now the default, and it renders.** It didn't before: `renderMonth` referenced an undefined `centerMonday`, so the v27 monthly tab threw a `ReferenceError` on every click. Nobody had reported it, which suggests the tab was never really used.

  **Tap any day to set it** to Upper / Lower / Arms / Rest, or back to auto. Manual picks pin and the rotation resumes around them.

  **Progression:** all sets at the top of the rep range → +10% next session, rounded to nearest 5 lb, reversible if reps are edited down (Rules #5, #6). Replaces a flat +5 lb that only triggered off a single stored `reps` value.

  **A/B variants moved from weekly alternation to 10-week blocks** at William's request.

  Verified with 137 assertions across two headless harnesses (Rule #12) — rotation, sliding, overrides, rounding, migration, persistence, rendering. Deployed and confirmed live.

- **2026-08-06 — Netlify auto-deploy linked to GitHub.** The site had been deployed by hand since it was created; pushes did nothing to the live URL. Now git-linked on `main`. Also cleared a stale `.git/index.lock` (0 bytes, no git process holding it) that was blocking commits, and reverted CRLF-only churn in `.gitignore`, `manifest.json` and `netlify.toml` so the v28 commit touched only real changes. A `.gitattributes` with `* text=auto` would stop the line-ending noise recurring — not added yet.

---

## Resolved open-work items (formerly in CLAUDE.md)

- ~~Auto-deploy is linked but unproven.~~ **Resolved 2026-08-06 — it works.** Pushing `32978a4` produced deploy `6a7540d4d128f70008f191ed` on its own: `commit_ref` matches the pushed commit, `branch: main`, `manual_deploy: false`, `committer: williamsopenclaw-droid`, published 4s after build. No further action.
  **Caveat for whoever checks this next:** `deploy_source` still reads `"api"` even on a genuine push-triggered deploy, so it is *not* a reliable signal and the earlier reading of it was a false alarm. Judge by `commit_ref` matching HEAD, `manual_deploy: false`, and `committer` instead.
- ~~`manifest.json` description is stale.~~ Fixed 2026-08-06 — now "Upper/Lower/Arms workout tracker. Works offline."
- ~~No data export/import beyond CSV.~~ **Resolved 2026-08-08** — 💾 Backup / ♻️ Restore move the whole state as a JSON file. Still no automatic sync: `localStorage` is per-device, so the file *is* the transfer mechanism and moving it is a manual step.
- ~~No automatic cross-device sync.~~ **Built 2026-08-08** — see Rule #12 and "Where things live".
- ~~Free-tier pausing is unmitigated.~~ **Handled 2026-08-08** by `.github/workflows/keep-supabase-awake.yml` — see Recent changes.
- ~~Suspected: `swapExercise` skips the progression rollback.~~ **Confirmed and fixed 2026-08-06** — and `removeExercise` had it too. See Rule #5 and Recent changes.
