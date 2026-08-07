# CLAUDE.md — billys-workout

Notes for whichever Claude picks this up next. Claude's memory doesn't sync between machines, so anything non-obvious about how this app works lives here.

This is a much smaller project than the NorthShield repos — one HTML file, no database, no auth, no build step. Keep this file proportionate. If it starts growing rule numbers into the twenties, something has gone wrong with the app, not the documentation.

---

## Who you're working with

William. Safety manager, not a heavy coder. He wants to understand what's going on more than he wants to read code. Explain the "why" in plain language, and prefer one clean fix over a scattering of small edits. He'll say when he wants to dig into specifics.

The app is for Billy. Treat it as a real tool someone uses at a gym on a phone, not a demo.

---

## What this project is

A personal workout tracker. Single-file PWA, installed to a phone home screen, works offline, stores everything in `localStorage`. No backend, no accounts, no network calls at runtime.

- `index.html` — **the entire app.** HTML, CSS and JS in one file (~1,600 lines).
- `sw.js` — service worker. Network-first for `index.html`, cache-first for icons.
- `manifest.json`, `icon-192.png`, `icon-512.png` — PWA install metadata.
- `netlify.toml` — publish `.`, no build command, asset processing off.

No `package.json`, no bundler, no CI. Edit `index.html` directly.

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

**localStorage keys** (all on the app's own origin)
- `caprica_workout_v2` — everything. Historical name; the `v2` is meaningless now, the real version is the `_schemaVersion` field inside. Don't rename it, you'll orphan Billy's data.
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

`index.html` has exactly one `<script>` block (currently lines 313–1593), which is what makes the crude extraction below safe. If a second one is ever added, these commands check only the first — fix the extraction rather than trusting a pass.

**On William's Windows machine**, PowerShell:

```powershell
$s = Get-Content index.html -Raw; $a = $s.IndexOf('<script>') + 8; $b = $s.IndexOf('</script>'); Set-Content chk.js $s.Substring($a, $b - $a) -Encoding utf8; node --check chk.js; Remove-Item chk.js
```

Note `.Split('<script>')` does **not** work in PowerShell — `String.Split(string)` splits on each character in that string, not the whole token. Use `IndexOf`/`Substring` as above.

**Node is installed** — v24.19.0 at `C:\Program Files\nodejs\`, added 2026-08-06 via `winget install OpenJS.NodeJS.LTS`. The command above was verified end-to-end that day: it passes on the real `index.html` and correctly fails a deliberately broken file with a `SyntaxError`. **Python is not needed and never was** — it was only slicing out the script block, which the PowerShell line now does. `python`/`python3` on this machine are still Microsoft Store placeholder shortcuts, not real interpreters; ignore them.

**Two Windows gotchas when handing William a command:** his shell is Windows PowerShell 5.1, where `&&` is a parse error (`The token '&&' is not a valid statement separator`) — chain with `;` instead. And a freshly installed tool won't be on an already-running shell's PATH; refresh with
`$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")` before concluding it isn't installed.

**Browser fallback**, if a toolchain is ever unavailable: open `index.html` and check the console — a syntax error shows as a single parse error on load and every global goes `undefined`. See Rule #12, which is still the better option for testing behaviour rather than just syntax.

**In a Linux sandbox** (where Claude often runs), the original still applies:

```bash
python3 -c "s=open('index.html',encoding='utf-8').read(); open('/tmp/chk.js','w').write(s.split('<script>')[1].split('</script>')[0])"
node --check /tmp/chk.js
```

### 12. Test the logic headlessly before deploying

The sandbox has no npm registry access, so jsdom isn't available. The v28 work used a hand-rolled stub instead — fake `localStorage`, a `document.getElementById` that returns objects recording `innerHTML`, then `eval` the extracted script and assert against the returned HTML strings. That caught real bugs (the v27 `renderMonth` `centerMonday` ReferenceError among them) without a browser.

Worth rebuilding if you make a change of any size. The render functions all return strings, which makes them unusually easy to assert on.

**Better option when you have browser tools, and the one that works with no Node installed:** open `file:///C:/Users/wbalk/OneDrive/Documents/GitHub/billys-workout/index.html` in the browser pane and drive the real functions from the console. Everything is global (plain `<script>`, no module), so `syncProgression`, `swapExercise`, `getProgression()` and friends are all directly callable. This is how the 2026-08-06 progression bug was both reproduced and verified fixed, and it needs no toolchain at all.

Two things to know: `file://` has its own `localStorage`, separate from the live site, so tests can't touch real data — but snapshot and restore `caprica_workout_v2` anyway if you test against the deployed origin. And the service worker fails to register over `file://` ("unknown error occurred when fetching the script"). That console error is expected and is **not** a code fault.

If the script block has a syntax error the whole file fails to parse and every global is `undefined` — so `typeof syncProgression === 'function'` doubles as the Rule #11 check.

---

## Open work / known gaps

- ~~Auto-deploy is linked but unproven.~~ **Resolved 2026-08-06 — it works.** Pushing `32978a4` produced deploy `6a7540d4d128f70008f191ed` on its own: `commit_ref` matches the pushed commit, `branch: main`, `manual_deploy: false`, `committer: williamsopenclaw-droid`, published 4s after build. No further action.
  **Caveat for whoever checks this next:** `deploy_source` still reads `"api"` even on a genuine push-triggered deploy, so it is *not* a reliable signal and the earlier reading of it was a false alarm. Judge by `commit_ref` matching HEAD, `manual_deploy: false`, and `committer` instead.
- ~~`manifest.json` description is stale.~~ Fixed 2026-08-06 — now "Upper/Lower/Arms workout tracker. Works offline."
- **Light-dumbbell rounding** — see Rule #6.
- **Rep ranges aren't editable in the UI.** `range` and `top` are baked into `PROGRESSION`. Changing what counts as a completed set means editing the source.
- **No data export/import beyond CSV.** CSV is one-way. If Billy switches phones there's no way to move history across — it's `localStorage`, tied to the origin and the browser profile.
- ~~Suspected: `swapExercise` skips the progression rollback.~~ **Confirmed and fixed 2026-08-06** — and `removeExercise` had it too. See Rule #5 and Recent changes.

---

## Deploying

1. Edit `index.html` (and bump `sw.js` VERSION — Rule #10).
2. Syntax-check the script block (Rule #11).
3. Commit and push to `main`.
4. Netlify publishes in well under a minute; there's no build to run.

The sandbox can't reach GitHub or the npm registry (both 403 through the proxy), so **pushing and CLI-based deploys have to happen on William's machine.** You can read Netlify state through the Netlify MCP, and `deploy-site` returns an `npx` command for him to run — but you can't run it yourself.

---

## Recent changes

**Docs current through commit `fdcec88` (2026-08-06).** Before writing new entries, run `git log fdcec88..HEAD --oneline` — anything it prints is undocumented. Bump this hash in the same commit that writes the entry.

- **2026-08-07 — v28 review fixes (six cleanups, `sw.js` → v28).**

  Applied all six recommended fixes from the v28 review:

  1. **Removed duplicate CSS blocks** — `.month-grid` and `.month-day` were defined twice (lines 64-77 and lines 220-236). The first set was dead — the second always won. Removed the first, file went from 1612 → 1598 lines.

  2. **Bumped `sw.js` VERSION from v18 to v28** — it was 10 versions behind. Without this, PWA users who installed pre-v28 would keep the old cached app.

  3. **`changeSets` now truncates `sess.reps` when reducing sets** — if an exercise drops from 5 sets to 3, set 4 and 5 rep values are now discarded. Before they stuck around in localStorage forever (invisible in the UI but alive in exports).

  4. **Escape key closes the modal** — `document.addEventListener('keydown', ...)` added. Small but makes desktop use feel responsive.

  5. **`saveState` now shows a toast on failure** — instead of silently swallowing a full-storage error, it tells the user. The console.error stays (for debugging).

  6. **`swapExercise` no longer calls `render()` before reopening the modal** — it was doing a full-page render that got immediately covered by the modal. Now it just saves and opens the modal, saving a render cycle.

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
