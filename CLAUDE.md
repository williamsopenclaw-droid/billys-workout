# CLAUDE.md — billys-workout

Notes for whichever Claude picks this up next. Claude's memory doesn't sync between machines, so anything non-obvious about how this app works lives here.

This is a much smaller project than the NorthShield repos — one HTML file, one small Supabase backend (two tables), one Netlify function, no build step. Keep this file proportionate. If it starts growing rule numbers into the twenties, something has gone wrong with the app, not the documentation.

---

## Documentation map

- **`CLAUDE.md`** (this file) — the rulebook: who you're working with, where things live, house rules, and the current state of Food / sync / the Claude inbox.
- **`FAILURE-MODES.md`** — bugs that keep repeating, grouped by shape. **Read its pre-ship checklist before shipping.**
- **`CHANGELOG.md`** — the full dated history (v28 → now), newest first. Look there for *why* something is the way it is.
- **`README.md`** — for William: how to use the app day to day, the two keys, and what to do when something looks off. Written in plain language; keep it that way.

---

## Who you're working with

William. Safety manager, not a heavy coder. He wants to understand what's going on more than he wants to read code. Explain the "why" in plain language, and prefer one clean fix over a scattering of small edits. He'll say when he wants to dig into specifics.

The app is for Billy. Treat it as a real tool someone uses at a gym on a phone, not a demo.

---

## Current state — Food, sync and the Claude inbox

Everything here was built v35–v47 (Sept 20–24, 2026). The narrative for each version is in `CHANGELOG.md`; this section keeps only what is still in force.

### How Claude logs William's food (the normal request)

When William pastes a day's list and asks for it to be added:

1. **Check what's already there** for that date — a names/categories-only read through the Supabase connector (`execute_sql` on `workout_state`, `data->'food'->'mealsByDay'->'YYYY-MM-DD'`) is fine. Don't post duplicates.
2. **Write the day as JSON** (format at the top of `tools/food-inbox.mjs`). Real label or USDA numbers only — **never invent values.** Look labels up online when needed; say where a number came from, and spell out every estimate in the meal's `notes`. Put mL amounts in item names (`grams` is grams). William decides what's estimated vs. left blank; ask when it matters.
3. `node tools/food-inbox.mjs post day.json --note "Tue Sep 22 - …"`, then `pending` to confirm.
4. Tell him it's waiting (Food tab banner "📥 N meals from Claude"). **Nothing reaches his log until he taps Accept.**
5. After he accepts, **verify on the server** (meal count and kcal per day in `workout_state`) and that `pending` is empty. If the server doesn't have it, the accepting device was offline: have him open ⚙️ Admin → Sync now, then re-check.

**Two keys — never mix them up.** The **sync code** (`bw-…`, localStorage `caprica_workout_sync_key`) opens his whole history: never ask for it, never use it, even if it's handed over. The **inbox key** (`ib-…`, `food.inbox.key`, and `BILLYS_INBOX_KEY` on this PC) can only add/read/remove *suggestions* in `food_inbox`. The script reads the key from the environment or the Windows registry; never print it, put it in a URL, or echo it. `node tools/food-inbox.mjs selftest` checks the table's row security with throwaway keys.

**Supabase changes** can go through the MCP connector (it can see this project), but **only with William's explicit go-ahead each time** — it's his live data. Inspect first (`list_tables`, `pg_policies`), apply with `apply_migration`, then run the advisors and the selftest. Keep the SQL in `supabase/`.

### Data rules

- **Food is the top-level `food` object** in the `caprica_workout_v2` blob: `mealsByDay{date:[meal]}`, `goals`, `savedMeals`, `recipes`, `inbox{key, done}`. Totals are always recomputed from items (`mealMacros()`); stored totals are ignored.
- **Never drop fields you don't recognise** (FAILURE-MODES §1). Unknown keys survive at the top level (`unknownTopKeys`), in `store`, in `food`, and on meals, items, recipe ingredients, goals and saved meals. Normalise with `Object.assign({}, existing, {known fields})` — never rebuild an object from a fixed field list.
- **Categories are stable ids** (`MEAL_CATEGORIES`: `breakfast`, `am-snack`, `lunch`, `pm-snack`, `post-workout`, `dinner`, `evening-snack`). Store the id, never the label. Meals from before v39 have no category and are **never rewritten** — `mealCategory()` groups them at render time.
- **All Food writes go through the editors or the layer functions** (`addMealToDay`, `updateMeal`, `logRecipeAmount`, `inboxAccept`, …), which validate numbers (finite, ≥ 0, capped) and escape every user/AI/imported string on render. Food UI is event-delegated (`data-act` / `data-input`) — no user text in inline `onclick`.
- **`foodDay()`** is the day the Food screen shows and logs to: session-only, never in the future.

### Sync rules (on top of House rule #12)

- **Navigation is per-device** (`caprica_workout_v2_view`) and never goes through `saveState()` — doing so marks the device dirty and turns the other device's next change into a conflict (FAILURE-MODES §3).
- On returning to the foreground the app pulls (skipped while a sheet is open, because a clean pull reloads the page); going to the background flushes a pending push.
- `applyRemote()` keeps this device's `food` if the incoming copy has no `food` key at all (written by a pre-v36 build).

### Features, in one line each

- **Recipes:** `ing.portions` lets one ingredient divide differently (rice made 7 of 8); `r.cookedWeightG` enables logging by grams. Logged meals record `meal.recipe`.
- **Saved meals:** create / ✎ edit in the meal editor's saved mode; **⤓ Import** takes JSON (format above `parseSavedMealsImport()`), all-or-nothing, replacing same-named meals in place.
- **Photo estimates:** `POST /api/analyze-food`, authenticated with the device's sync code checked against Supabase (fails closed). Results only ever fill the open editor — **never save an AI result directly.** Env vars on Netlify: `OPENAI_API_KEY` + `OPENAI_BASE_URL` (AI Gateway), optional `FOOD_AI_MODEL`, `FOOD_AI_DISABLED=1` kill switch. Never put a model key in `index.html`.
- **Admin tab** (`SECTIONS` = workout / food / admin; `renderAdmin()`): Sync status + Sync now / Sync settings, the inbox, Backup / Restore, workout CSV, app version. These used to be header toolbar buttons; the toolbar now only holds Install and the hidden restore file input. Sync problems badge the tab label (`SYNC_BADGE`: 📴 offline, ⚠️ error/conflict) so they're visible from every screen. Switching to Admin is navigation — per-device, never `saveState()`.
- **Claude inbox:** app side in the "Claude inbox" block of `index.html`; the id goes into `food.inbox.done` *before* the row is deleted, so nothing is applied twice; already-handled rows are cleaned up on the next check.

### Testing and shipping

- `node tests/check_syntax.cjs` and `node tests/workout.test.cjs` before every commit. The suite must print its summary line; `TESTS DID NOT FINISH` (exit 1) means an async test hung.
- **Break it and watch it fail** for every new behaviour (mutation check in a scratch copy). The scratch copy must include every file the tests import (`tools/`, `netlify/`) and must pass unmutated first — otherwise every mutation "fails" and reads as caught (FAILURE-MODES §4).
- Browser checks use a separate `http://localhost` origin with `fetch` stubbed, never the live site's data. `file://` previews in the pane have storage disabled.
- **William's standing rule: commit locally, then report** (what changed, files, test results, assumptions, known issues) **and push only when he says "push"** — `git fetch` first, never force-push. Bump the version once per deploy: `APP_VERSION` in `index.html` (the only place it's written there — label, backups and Admin read it) and `VERSION` in `sw.js`. A test fails if they differ. After pushing, confirm the live `sw.js` version and syntax-check the live script.
- He works in small approved steps ("gates"). Don't start the next piece until he asks.

---

## What this project is

A personal workout and food tracker. Single-file PWA, installed to a phone home screen, works offline, stores everything in `localStorage`. No accounts. Network use: optional Supabase sync (Rule #12), the Claude inbox, and the food-photo Netlify function (see Current state).

- `index.html` — **the entire app.** HTML, CSS and JS in one file (~4,000 lines; one `<script>` block).
- `sw.js` — service worker. Network-first for `index.html`, cache-first for icons, ignores non-GET requests.
- `manifest.json`, `icon-192.png`, `icon-512.png` — PWA install metadata.
- `netlify.toml` — publish `.`, no build command, asset processing off, and forced-404 rules that hide everything but the app from the public site. **The test suite fails if a top-level file or folder is neither an app asset nor hidden there** — add new docs/folders to it.
- `netlify/functions/analyze-food.js` — the food-photo endpoint.
- `tools/food-inbox.mjs` — how Claude posts meal suggestions (`post` / `pending` / `selftest`).
- `supabase/food_inbox.sql` — the inbox table and its row security, as applied.
- `tests/workout.test.cjs` (the logic suite) and `tests/check_syntax.cjs` (Rule #11 in one command).
- `.github/workflows/keep-supabase-awake.yml` — pings Supabase twice a day so the free project doesn't pause.

No `package.json`, no bundler. Edit `index.html` directly.

---

## Where things live

**Netlify**
- Project: `workout-tracker-app-403`
- Site ID: `25606fe7-f887-48b4-9162-b33e832f1aae`
- URL: https://workout-tracker-app-403.netlify.app
- Deploys: https://app.netlify.com/projects/workout-tracker-app-403/deploys
- Repo: `williamsopenclaw-droid/billys-workout` (public). Git-linked auto-deploy on push to `main` — **wired up 2026-08-06**, before that it was manual drag-and-drop deploys.

**On disk**
- Windows: `C:\Users\wbalk\OneDrive\Documents\GitHub\billys-workout\`
- That path is inside OneDrive because Windows redirects `Documents` there by default (Known Folder Move). **This is deliberate — William wants the repo in Documents. Don't propose moving it.** The NorthShield guidance about keeping clones off synced paths was written for a repo with a much heavier `.git`; here the cost/benefit doesn't hold, and it was checked properly on 2026-08-06:
  - Every file is fully materialised on disk — no `Offline` or `ReparsePoint` attributes, so these are **not** cloud placeholders. Placeholders are what actually make tools misread OneDrive folders, and there aren't any.
  - The OneDrive client isn't even running most of the time.
- **If a tool reports a file or commit missing that you're sure exists, suspect your own sandbox before the filesystem.** On 2026-08-06 a Bash-based listing returned this repo one commit behind and reported `CLAUDE.md` as nonexistent; PowerShell read it correctly at the same moment. That was a stale sandbox snapshot, not OneDrive. Cross-check with PowerShell (`Get-ChildItem -Force`, `git ls-files`) before concluding anything is absent — and don't write the absence up as fact until you have.
- **The one real risk is `.git/index.lock` going stale** if OneDrive touches `.git` mid-operation. Happened once (2026-08-06). If commits start failing, look for a 0-byte lock file with no git process holding it, and delete it. That's the whole mitigation.

**Supabase** (sync backend, added 2026-08-08)
- Project ref: `sqmkjgubujrkxygsukng` · URL `https://sqmkjgubujrkxygsukng.supabase.co`
- **Separate free-plan org** (org id `nxnjdsffctxkosqaixka`, project name "Workout App", us-east-2), not the Pro org holding the safety-forms project. **Correction 2026-09-24:** the Supabase MCP connector (logged in to the account whose listed org is "williamsopenclaw-droid's Org") *can* read and migrate this project — `get_project`, `list_tables`, `execute_sql` and `apply_migration` all work — even though the org doesn't appear in `list_organizations`. Schema changes can go through the connector, **but only with William's explicit go-ahead each time**: it's his live data. `.mcp.json` in this repo points at the project.
- **Known advisor warning (pre-existing, not fixed):** `public.touch_updated_at` has a mutable `search_path`. Low risk here, and the fix is one `alter function` — William's call.
- Free plan means it **pauses after ~7 days of low activity**. Design assumes this: a paused backend costs sync, never data.
- `public.workout_state` — `sync_key` (PK), `data` (jsonb), `updated_at`, `device_note`. RLS returns a row only when the `X-Sync-Key` header matches `sync_key`; no delete policy; check constraints cap the key at 20–100 chars and the payload under 2MB.
- `public.food_inbox` — Claude's meal suggestions, scoped by the `X-Inbox-Key` header; insert/select/delete only, no update. SQL in `supabase/food_inbox.sql`; details under Current state.
- The publishable key is in `index.html` **on purpose** — it's public by design and useless without a sync key.

**localStorage keys** (all on the app's own origin)
- `caprica_workout_v2` — everything. Historical name; the `v2` is meaningless now, the real version is the `_schemaVersion` field inside. Don't rename it, you'll orphan Billy's data.
- `caprica_workout_v2_view` — this device's screen/tab (`{section, foodTab}`). Never synced, never in backups; losing it just resets the view.
- `caprica_workout_sync_key` — the shared secret linking devices. **Never synced and never in the repo**; it's the only thing protecting the row. Same value typed on every device.
- `caprica_workout_sync_meta` — `{syncedAt, dirty, lastSync}`. `syncedAt` is the server `updated_at` we last agreed with; `dirty` means this device has changes the server hasn't got.
- `caprica_workout_v2_pre_restore` — written by **Restore** before it overwrites anything, so a wrong file picked on the wrong device is recoverable. Overwritten on each restore; it is a single undo step, not a history.
- `caprica_workout_v2_v3_backup` — one-time snapshot of the pre-v28 blob, written during migration. Safe to leave forever; it's small and it's the only copy of the old shape. **Searching the source for this key finds nothing** — it's built as `LS_KEY + '_v3_backup'` at the migration branch in `loadState()`. It exists; don't delete it as dead code on the strength of a failed grep.

---

## Start-of-session norm

Read `index.html` before you change it. This file describes intent; the code is truth. The app has been rewritten twice (v26 → v27 → v28) and each rewrite invalidated assumptions the previous one baked in.

---

## House rules

### 1. Dates are the state keys. Do not reintroduce week/day indices.

Everything is keyed by a local-time `'YYYY-MM-DD'` string. `sessionLog['2026-08-06'][0]`, `dayTypes['2026-08-06']`, and so on.

Before v28 the schema was `sessionLog[weekIndex][dayOfWeek][exIdx]`, anchored to a hardcoded `ROTATION_START` constant. That's what forced the workout split onto fixed Mon/Wed/Fri slots and made "what did I lift last Tuesday" a date-arithmetic puzzle. It's gone. If you find yourself computing a week index, stop — you're rebuilding the thing v28 removed.

### 2. Local time, never UTC

`toStr()` uses `getFullYear()` / `getMonth()` / `getDate()`. Never `toISOString().slice(0,10)`.

Same trap as the NorthShield repo: `toISOString()` is UTC, and an evening workout logged in Mountain Time lands on tomorrow's date. Here it's worse than a wrong label — the rotation reads the date keys to decide what's next, so a UTC slip silently schedules the wrong workout. Treat any new `toISOString()` in date code as a bug.

### 3. `dayTypes` is the source of truth. The projection is derived and never saved.

Two different things decide what a day is:

- `dayTypes[ds]` — **pinned.** Either William set it by tapping the day, or it got locked in when something was logged. Persisted.
- `projection().map[ds]` — **forecast.** Computed on the fly from the last pinned workout. Never written to disk.

`getDayType(ds)` checks the pin first, then falls back to the forecast, then to `'Rest'`. If you ever persist the projection you'll freeze the schedule and the whole sliding-forward behaviour dies.

Call `invalidateProjection()` after anything that touches `dayTypes`. It's cached per `(mode, today)` so a date rollover at midnight recomputes on its own.

### 4. Pin before you mutate

`pinIfNeeded(ds)` locks a forecast day into `dayTypes` at its current type. Call it before writing reps, weights, or plan edits.

Without it, logging a set on a day the forecast merely *suggested* would leave that day unpinned — then the next recompute could reassign it to a different workout type while the logged reps stayed put, silently attaching Upper Body reps to a Lower Body day. `onRepChange`, `setWeight`, `toggleDone` and `editPlan` all call it already. New write paths must too.

### 5. Progression pins the session weight, and is reversible

When every set hits the top of the rep range, `syncProgression()` does two things:

1. Writes `sess.weight` with the weight **actually used**, so history can't shift retroactively when the global number moves.
2. Raises `PROGRESSION[name].weight` by 10%, rounded to nearest 5 lb, minimum +5.

`sess.progressed` and `sess.progressedFrom` track the award so it can be undone. Edit a rep back down and the bump rolls back to `progressedFrom`. **Call `syncProgression()` on every rep edit, not just on completion** — it handles both directions and is idempotent. Skipping the rollback path leaves Billy's working weight permanently inflated by a typo.

Bodyweight and band exercises (`weight: 'BW' | 'Light' | 'Medium' | 'Heavy'`) parse to `NaN` and bail out early. That's the guard — don't "fix" it with a default of 0.

**`syncProgression()` only works while the plan still points at the exercise that earned the award.** It recomputes `met` from the *current* plan, so once the plan entry is changed or deleted the award is orphaned and the weight stays up forever. Any path that swaps or removes an exercise must call **`revertProgression(ds, exIdx, name)` first**, before mutating the plan. `swapExercise` and `removeExercise` both do. If you add another path that discards a session, it must too — this is the same trap as Rule #4, one layer down.

### 6. Rounding to 5 lb is aggressive on light weights — known, accepted, revisit if asked

25 lb × 1.1 = 27.5 → rounds to **30**, a 20% jump. Same for 12.5 → 15. William chose nearest-5 deliberately when asked, and it's correct for barbells and machines where the plates are 5s anyway.

If he ever mentions dumbbell jumps feeling too big, the fix is granularity by weight (2.5 lb steps under 50 lb) in `bumpWeight()`, not abandoning the rule.

### 7. A/B blocks are computed from a date anchor, not stored

`getVariant(ds)` derives the exercise variant from `BLOCK_ANCHOR` (`2026-06-07`): 10 weeks on A, 10 weeks on B, alternating forever. Nothing is persisted, so past days always render with the variant they'd have had.

Moving `BLOCK_ANCHOR` retroactively rewrites which exercises historical days show. Don't, unless that's explicitly the goal.

### 8. Gym and Travel are fully independent schedules

`store.gym` and `store.travel` each hold their own `dayTypes`, `dayPlans`, `sessionLog`, `dayNotes`, `exNotes`. Switching modes switches the whole calendar, including which day is "next up."

This is deliberate — a week of band workouts on the road shouldn't renumber the gym rotation. But it does mean a rest-day gap appears in gym mode for travel days. If William ever says the calendar "lost" workouts, check which mode he's in first.

### 9. The v3 → v4 migration has to keep working

`loadState()` detects `_schemaVersion < 4` and runs `migrateV3()`, which maps old `[weekIndex][dayOfWeek]` entries onto real dates using `LEGACY_SUNDAY = '2026-06-07'` and the old fixed Mon/Wed/Fri layout, then backs the original blob up to `caprica_workout_v2_v3_backup`.

Billy may have devices that haven't opened the app since v27. Don't delete the migration path, and don't change `LEGACY_SUNDAY` — it's the anchor the old schema's week 0 was pinned to.

**One thing the migration drops:** v27's `archivedWeeks` (a per-week collapse toggle). v28 has no archive feature, so the flags are discarded. No workout data is lost, just the collapsed/expanded state.

### 10. Bump `sw.js` VERSION on every deploy

The `VERSION` constant at the top of `sw.js` names the cache. If you ship `index.html` without bumping it, installed phones keep serving the old cached app and the change appears not to have deployed.

`index.html` is network-first so it usually refreshes on its own, but the service worker itself only hands over on restart. When William says an update didn't take, first ask him to force-close the app and reopen — not to clear data.

### 11. It's one file — verify the whole thing parses

There's no build step and no linter, so a stray brace ships silently and the app renders a blank page. After editing, extract the script block and syntax-check it.

**`node tests/check_syntax.cjs` does this in one command** — use it. `index.html` has exactly one `<script>` block (the test suite asserts it), which is what makes the crude extraction safe. If a second one is ever added, the extraction checks only the first — fix it rather than trusting a pass. The manual fallback:

**On William's Windows machine**, PowerShell:

```powershell
$s = Get-Content index.html -Raw; $a = $s.IndexOf('<script>') + 8; $b = $s.IndexOf('</script>'); Set-Content chk.js $s.Substring($a, $b - $a) -Encoding utf8; node --check chk.js; Remove-Item chk.js
```

Note `.Split('<script>')` does **not** work in PowerShell — `String.Split(string)` splits on each character in that string, not the whole token. Use `IndexOf`/`Substring` as above.

⚠️ **Never round-trip `index.html` through `Get-Content` → `Set-Content`.** PowerShell 5.1 reads as the ANSI codepage and writes UTF-8-with-BOM, which turns every emoji and `·` in the file into mojibake (`🏋️` → `ðŸ‹ï¸`) and prepends a BOM — a whole-file corruption from what looks like a simple find-and-replace. It happened on 2026-08-08 and needed `git checkout -- index.html` to undo. Use the Edit tool for edits; if you must script it, `[System.IO.File]::ReadAllText` / `WriteAllText` with `UTF8Encoding($false)`. Check with `git diff --stat` — a bulk edit touching far more lines than you changed means you've corrupted the encoding.

**Node is installed** — v24.19.0 at `C:\Program Files\nodejs\`, added 2026-08-06 via `winget install OpenJS.NodeJS.LTS`. The command above was verified end-to-end that day: it passes on the real `index.html` and correctly fails a deliberately broken file with a `SyntaxError`. **Python is not needed and never was** — it was only slicing out the script block, which the PowerShell line now does. `python`/`python3` on this machine are still Microsoft Store placeholder shortcuts, not real interpreters; ignore them.

**Two Windows gotchas when handing William a command:** his shell is Windows PowerShell 5.1, where `&&` is a parse error (`The token '&&' is not a valid statement separator`) — chain with `;` instead. And a freshly installed tool won't be on an already-running shell's PATH; refresh with
`$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")` before concluding it isn't installed.

**Browser fallback**, if a toolchain is ever unavailable: open `index.html` and check the console — a syntax error shows as a single parse error on load and every global goes `undefined`. See Rule #12, which is still the better option for testing behaviour rather than just syntax.

**In a Linux sandbox** (where Claude often runs), the original still applies:

```bash
python3 -c "s=open('index.html',encoding='utf-8').read(); open('/tmp/chk.js','w').write(s.split('<script>')[1].split('</script>')[0])"
node --check /tmp/chk.js
```

### 12. Sync never blocks logging, and never overwrites blind

Two invariants, both easy to break with a "simplification":

**`localStorage` is the source of truth.** Every network call is wrapped so a dead network, an expired key, or a paused project degrades to *no sync* — never to a failed save. `saveState()` calls `markSyncDirty()` / `scheduleSync()` inside their own `try`, after the write has already succeeded. Don't move sync ahead of the write, and don't `await` it there.

**The push is a compare-and-swap.** `sbPush()` filters the `PATCH` on the `updated_at` it expects (`&updated_at=eq.…`). If another device wrote in between, zero rows match and we detect a conflict instead of clobbering. **Deleting that filter would silently lose whichever device synced second** — it looks like a redundant query param and it is not. `dirty` stays set on failure so the change retries.

Conflicts are never resolved automatically: `openConflictModal()` shows workout and meal counts on both sides and the user picks. The discarded side is kept in `_pre_restore`.

### 13. Custom workouts are not part of the rotation

`store[mode].customTypes` maps a user-typed name to an exercise list. They appear in the day picker beside Upper/Lower/Arms and can go on any day, but they are **not** in `ROTATION`.

That matters because `nextType()` returns `'Upper'` for anything it doesn't recognise. Feeding it a custom type would silently reset the cycle — the exact desync v28 removed. So every rotation decision is guarded by **`isRotationType()`**: the anchor scan in `projection()` skips custom days, and the forward walk sets `gap = 1` for them without advancing `t`. Net effect: a custom day occupies its slot and pushes the next workout out by the usual spacing, but Upper → Lower → Arms continues in order around it.

Two ways in: **New custom workout** builds from a blank list via `openTemplateEditor()`, which edits `customTypes[name]` directly and is simpler than the day editor because a template has no reps, weights or progression. **Save as custom workout** keeps a day you've already set up. The editor holds its target in `_ctEditing` rather than passing user-typed names through `onclick` attributes.

Template edits reach days that have no stored `dayPlans[ds]`; a day edited by hand keeps its own copy. Same semantics as the built-in templates.

Custom types have no A/B variant — `templateFor()` returns their list directly. Labels and colours go through `typeLabel()` / `typeColor()`, which fall back to the name and `CUSTOM_COLOR`; **never index `TYPE_LABEL`/`TYPE_COLOR` directly** or custom days render blank. Deleting a type freezes its exercise list onto any day using it first, the same trap as unpinning a logged day.

### 14. Test the logic headlessly before deploying

**That harness now exists: `tests/workout.test.cjs`, run before every commit** (see Current state → Testing and shipping). Background: the sandbox had no npm registry access, so jsdom wasn't available. The v28 work used a hand-rolled stub instead — fake `localStorage`, a `document.getElementById` that returns objects recording `innerHTML`, then `eval` the extracted script and assert against the returned HTML strings. That caught real bugs (the v27 `renderMonth` `centerMonday` ReferenceError among them) without a browser.

Worth rebuilding if you make a change of any size. The render functions all return strings, which makes them unusually easy to assert on.

**Better option when you have browser tools, and the one that works with no Node installed:** open `file:///C:/Users/wbalk/OneDrive/Documents/GitHub/billys-workout/index.html` in the browser pane and drive the real functions from the console. Everything is global (plain `<script>`, no module), so `syncProgression`, `swapExercise`, `getProgression()` and friends are all directly callable. This is how the 2026-08-06 progression bug was both reproduced and verified fixed, and it needs no toolchain at all. (In the Claude desktop app's browser pane, `file://` pages open as static snapshots with storage disabled — serve the folder on a `localhost` port instead, and stub `fetch` so nothing reaches the live Supabase.)

Two things to know: `file://` has its own `localStorage`, separate from the live site, so tests can't touch real data — but snapshot and restore `caprica_workout_v2` anyway if you test against the deployed origin. And the service worker fails to register over `file://` ("unknown error occurred when fetching the script"). That console error is expected and is **not** a code fault.

If the script block has a syntax error the whole file fails to parse and every global is `undefined` — so `typeof syncProgression === 'function'` doubles as the Rule #11 check.

---

## Open work / known gaps

- **Rotate the sync code** — it appeared in chat on 2026-09-24 (CHANGELOG, v47). William's call when. Rotation = new code on one device, re-link the others, then delete the old `workout_state` row (via the connector, with his OK) so the old code no longer opens a copy of his data.
- **Supabase advisor:** `public.touch_updated_at` has a mutable `search_path` (pre-existing, low risk, one `alter function` to fix — his call).
- **Photo estimates are unproven end to end.** The live function rejects unauthenticated calls correctly, but a real photo has only been analysed if William has tried one; whether Netlify AI Gateway supplies the env vars is unverified.
- **Light-dumbbell rounding** — see Rule #6 (legacy/Travel progression only).
- **Rep ranges aren't editable in the UI.** `range` and `top` are baked into `PROGRESSION` (and `GYM_TEMPLATES` for the weekday gym plans). Changing what counts as a completed set means editing the source.
- **The keep-alive can itself be switched off.** GitHub disables scheduled workflows after 60 days of *repository* inactivity; then the project pauses. GitHub emails first, and `workflow_dispatch` re-runs it by hand. The Sync panel's "last synced … over a week ago" line is the in-app backstop.

Resolved items that used to live here are recorded in `CHANGELOG.md`.

---

## Deploying

1. Edit `index.html`; bump `APP_VERSION` there and `VERSION` in `sw.js` to the same value (Rule #10 — a test fails if they differ).
2. `node tests/check_syntax.cjs` and `node tests/workout.test.cjs`.
3. Commit locally and **report to William**; push to `main` only when he says "push" (`git fetch` first).
4. Netlify publishes in under a minute. Confirm the live `sw.js` VERSION and syntax-check the live script.

This machine (William's home Windows box) can push to GitHub directly. Netlify state can also be read through the Netlify MCP.

---

## Recent changes

**The dated history now lives in `CHANGELOG.md`** (newest first). Docs are current through the v48 Admin-tab commit (2026-09-25). Before writing new entries, run `git log --oneline -5` and compare against the top of `CHANGELOG.md` — anything newer is undocumented. Add the new entry to the top of `CHANGELOG.md`, and fold any rule that's still in force into **Current state** above.
