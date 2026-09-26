# FAILURE-MODES.md — what keeps going wrong in billys-workout

> **What this is:** the same bugs grouped by **shape** instead of by date. `CHANGELOG.md`
> is chronological, so a cause that repeats looks like unrelated entries — this file
> makes the repeats visible *before* the next one.
>
> **How to use it:** before writing code that saves, syncs, rebuilds an object, or
> adds a check, skim the headings. If what you're about to write matches a shape,
> the guard is already written down. **Read the pre-ship checklist at the end before
> every push.**
>
> **How it stays current:** when a bug is fixed, add a row to an existing shape or
> start a new section. A shape with three or more instances deserves an automated
> guard (a test that fails when the guard is removed), not just a note.

---

## 1. Code that drops fields it doesn't recognise

**Shape:** something rebuilds an object from a fixed list of fields — on load, on save, or in an editor — so any field it doesn't know about silently disappears. With sync, one device's loss is pushed to every other device.

| When | Where | What was lost |
|---|---|---|
| 2026-08-08 (v33) | `loadState()` whitelisted five `store` keys | `customTypes` would have been deleted by v32 devices |
| 2026-09-23 (v37) | `saveState()` wrote a fixed set of top-level keys | pre-v36 devices drop the whole `food` object |
| 2026-09-23 (v40) | `mealSaveDraft()` rebuilt items field by field | AI markers (`source`, `confidence`) and any newer item field |
| 2026-09-23 (v41) | `recipeSaveDraft()` rebuilt ingredients the same way | per-ingredient fields |

**Guard:** normalise with `Object.assign({}, existing, { …known fields })`, never `{ a: x.a, b: x.b }`. Unknown keys are carried at every level (top level, `store`, `food`, meals, items, ingredients, goals, saved meals). Tests plant a `futureKey` / `futureField` and assert it survives load → save → reload. Four instances: any new save path needs the same test.

**Receiving side:** an old build can still push a copy without a newer field. `applyRemote()` keeps local `food` when the incoming copy has no `food` key at all. That only covers `food`; it's a mitigation, not a cure.

---

## 2. The screen not redrawn after a change behind a sheet

**Shape:** an action saves correctly while a modal/sheet is open, but nothing repaints the page underneath, so the user sees stale data until some unrelated action redraws.

| When | Where | Symptom |
|---|---|---|
| 2026-08-08 (v30) | `swapExercise` had its `render()` removed as "wasted" | swapped exercise still showed the old name after closing |
| 2026-09-24 (v46) | `inboxAccept()` saved but didn't render | day totals and the "N meals from Claude" banner stayed stale behind the review sheet |

**Guard:** `closeModal()` always calls `render()` — don't remove it. Anything that changes data while a sheet *stays open* (inbox accept/reject, anything that reopens a sheet) must call `render()` itself. Tests assert the main container's HTML right after the action, not just the data.

---

## 3. UI state treated as data

**Shape:** something that only describes *what the user is looking at* is saved like real data — so it syncs, marks the device dirty, and collides with real changes from another device.

| When | Where | Symptom |
|---|---|---|
| 2026-09-23 (v38) | tab/section switches called `saveState()`; `viewState` was in the synced blob | merely switching tabs turned the other device's next change into a sync conflict, and phones opened on the laptop's tab |

**Guard:** navigation goes to `caprica_workout_v2_view` via `saveViewPrefs()` and never through `saveState()`. Before adding anything to the blob, ask: would Billy be upset if another device lost it? If not, it's per-device.

---

## 4. Checks that pass without checking

**Shape:** a test, preflight or listing reports success (or failure) for a reason that has nothing to do with the thing it claims to check. The worst version is "all green" while the code is broken.

| When | What | Why it lied |
|---|---|---|
| 2026-08-06 | a sandbox listing said `CLAUDE.md` didn't exist | stale sandbox snapshot; PowerShell saw the file |
| 2026-09-23 (v40) | a hung async test exited with code 0 | Node exits quietly when a promise never settles — looks exactly like a pass |
| 2026-09-24 (v46) | every mutation "caught" | the scratch copy lacked `tools/`, so every run failed on a missing file, not on the mutation |
| 2026-09-24 (v46) | a mutation missed in the inbox selftest | the fake "leaky" table leaked every way at once, so a blind check was masked by another |

**Guard:** the suite sets a `finished` flag and fails with `TESTS DID NOT FINISH` if the end isn't reached. For every new behaviour, **break it and watch the suite fail** — and first prove the unmutated scratch copy passes. Fakes that simulate a failure should fail one way at a time. Cross-check "file missing" claims with a second tool before writing them up.

---

## 5. Whole-file corruption from Windows tooling

**Shape:** a harmless-looking scripted edit on Windows rewrites the whole file's encoding.

| When | What |
|---|---|
| 2026-08-08 | PowerShell `Get-Content` → `Set-Content` turned every emoji into mojibake and added a BOM to `index.html` |

**Guard:** edit with the Edit tool; if you must script, use `[IO.File]::ReadAllText` / `WriteAllText` with `UTF8Encoding($false)`. After any scripted edit, `git diff --stat` must touch only the lines you meant to change; check for a BOM and for `Ã`/`ðŸ` in the diff.

---

## 6. Network cleanup that assumes the network

**Shape:** a follow-up request (delete, acknowledge) is sent once and never retried, so an offline moment leaves leftovers on the server.

| When | What |
|---|---|
| 2026-09-24 (v47) | inbox rows accepted while the phone was offline stayed on the server |

**Guard:** make the *correctness* step local and first (`food.inbox.done` is recorded before the delete), and retry the cleanup on the next successful contact. Never retry on something that isn't already recorded as handled.

---

## 7. Secrets in the wrong place

**Shape:** a credential ends up somewhere it shouldn't — a URL, a log, a chat, the wrong variable.

| When | What |
|---|---|
| 2026-09-24 | the sync code (`bw-…`) was pasted into chat and stored as `BILLYS_INBOX_KEY`; the tool rejected it because inbox keys start `ib-` |

**Guard:** keys never go in URLs or logs (tests assert both for the inbox and the photo function). Each key has a recognisable prefix, and tools check it. Never use a `bw-` code, even when it's offered — point to the right key instead. Rotation of the exposed code is an open item in CLAUDE.md.

---

## 8. Tab bars too wide for small phones

**Shape:** a row of tabs sized to its content, with generous padding, fits a desktop or a 375px phone but overflows a narrower one — often only when a longer label (a badge, a count) appears.

| When | Where | Symptom |
|---|---|---|
| 2026-09-23 (v42) | the four Food tabs used the Workout/Food switch's 16px padding | "Recipes" clipped by ~10px at 375px |
| 2026-09-25 (v48) | three top tabs with the "⚙️ Admin ⚠️" sync badge | 10px over at 320px |

**Guard:** measure in the browser at 320, 375 and 414px **with the longest label the tab can show** (badges on), checking the bar's `scrollWidth <= clientWidth`. Narrow screens get tighter padding via a media query; don't shrink everyone's tabs to fix the smallest phone.

---

## 9. Tests reaching live systems

**Shape:** a test copy of the app talks to the real backend — often through something that runs automatically *before* the test's stubs are installed (page load, a timer, a service worker).

| When | What |
|---|---|
| 2026-09-25 | a browser test put a fake sync code (`bw-000…`) into a `localhost` copy to show the Admin page's sync status. Later reloads ran the open-time sync before `fetch` was stubbed, and created a junk row in William's Supabase. His own row was untouched. |

**Guard:** `isLocalTestCopy()` makes `sbReq` refuse every sync request from `localhost`, `127.0.0.1`, `*.localhost` and `file:` (tested for each, mutation-checked). Never put a real or fake sync code in a browser test copy. When a test *must* touch a live service, use throwaway credentials that can only reach their own data (like the inbox selftest), and clean up after. After any browser session, check the live data for rows or changes you didn't mean to make.

---

## Pre-ship checklist

1. `node tests/check_syntax.cjs` → `SYNTAX_OK`.
2. `node tests/workout.test.cjs` → the summary line printed (not `TESTS DID NOT FINISH`).
3. Every new behaviour mutation-checked, from a scratch copy that passes unmutated (§4).
4. New save/sync path? A `futureKey` survives it (§1). New UI state? Not in the blob (§3). Change made behind an open sheet? The page behind it re-renders (§2).
5. `git diff --stat` shows only intended lines; no BOM, no mojibake, no secrets or real `bw-`/`ib-` keys (§5, §7).
6. `APP_VERSION` (index.html) and `sw.js` VERSION bumped once, to the same value (a test enforces the match).
7. Browser check at phone width on a `localhost` origin with `fetch` stubbed; console clean. Changed a tab row or label? Measure at 320/375/414 with badges showing (§8). No sync code in the test copy, and nothing new in the live data afterwards (§9).
8. Commit locally, **report to William, push only on "push"** (`git fetch` first). Then confirm the live `sw.js` and syntax-check the live script.
