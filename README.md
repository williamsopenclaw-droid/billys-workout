# Billy's Workout

A personal workout and food tracker that lives on your phone's home screen and works offline.

**App:** https://workout-tracker-app-403.netlify.app — open it once in Chrome on your phone and choose **Install** / **Add to Home screen**.

Everything you log is saved on the device first, so the app keeps working with no signal. **Sync** copies it between your phone and laptop whenever there's a connection.

---

## Everyday use

### Workout tab
The calendar shows what's next (weekday Upper A / Lower A / Upper B / Lower B in gym mode; Travel has its own schedule). Tap a day to open it, log reps and weights, and the app suggests weight increases once you hit every target — you confirm them.

### Food tab
- **Day** — today's meals grouped by Breakfast, Morning Snack, Lunch, and so on, with your calorie and protein progress. **‹ ›** moves between days. **Edit goals** changes your daily targets.
- **History** — each day's totals and what you ate. Tap a day to open it.
- **Saved** — one-tap meals you have regularly. ✎ edits one; **+ New saved meal** builds one; **⤓ Import** takes a list Claude prepares.
- **Recipes** — meal-prep batches. **Log amount…** logs part of a portion or a weight (weigh the whole cooked batch once and enter it under Edit).

### Logging food with Claude
1. Send Claude your list for the day (like the ones you've been sending).
2. Claude looks up anything it doesn't know, then sends the meals to your **Claude inbox**.
3. In the app, the Food tab shows **"📥 N meals from Claude — tap to review"**. Check the numbers and tap **Accept** (or **Reject**).

Nothing is added to your log until you tap Accept. Anything Claude had to estimate is written in that meal's notes. You can edit any meal afterwards by tapping it.

---

## Your two keys

| | Starts with | What it does | Who should have it |
|---|---|---|---|
| **Sync code** | `bw-` | Links your devices and opens your **entire** history | Only your devices. Never send it to anyone, including Claude. |
| **Inbox key** | `ib-` | Lets Claude *suggest* meals for you to review. It can't see or change your log. | Your devices, and the Windows setting `BILLYS_INBOX_KEY` on the PC where Claude runs |

Both are shown in the app under **☁️ Sync**.

---

## When something looks off

| What you see | What to do |
|---|---|
| An update didn't show up | Fully close the app (swipe it away) and reopen it. Don't clear its data. |
| Meals or workouts missing on one device | On the device where you entered them: **☁️ Sync → Sync now** (it needs a connection). Then open the other device. |
| A **"Sync conflict"** box | Both devices changed while apart. Pick the side showing **more** workouts and meals. The other side is kept as a one-time backup. |
| Claude's meals don't appear | **☁️ Sync → Check for suggestions now.** If still nothing, ask Claude to check the inbox. |
| Sync says "last synced over a week ago" | Tell Claude — the free Supabase project may have paused. Your data on the device is safe either way. |

---

## Backups

- **💾 Backup** saves everything (workouts and food) as a file. Worth doing now and then.
- **♻️ Restore** replaces everything on that device with a backup file. It keeps one safety copy of what was there, in case you picked the wrong file.
- **CSV** exports workouts for a spreadsheet. It's a report, not a backup.

---

## Changing your sync code

If your sync code has been seen by someone else (for example, pasted into a chat), ask Claude to walk you through changing it. It takes a few minutes: make a new code on one device, link your other devices to it, then Claude removes the old copy from Supabase with your OK.

---

## For whoever works on the code

- `CLAUDE.md` — the rulebook: how the app works and the rules for changing it.
- `FAILURE-MODES.md` — bugs that keep repeating, and the checklist to run before shipping.
- `CHANGELOG.md` — the full history, newest first.

Tests: `node tests/check_syntax.cjs` and `node tests/workout.test.cjs`. Pushing to `main` deploys to Netlify automatically.
