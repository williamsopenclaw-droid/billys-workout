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

### Logging a meal
Food → **+ Log Meal**:
- **Meal type** is a dropdown (Breakfast … Evening Snack). **＋ Add another…** at the bottom adds your own, like "Pre-bed snack"; it appears on all your devices.
- **Time** fills in by itself when you log for today. You can change it.
- **🔎 Search food…** is the main way to add food (below). Under it: **✏️ Add manually** to type an item in yourself, and **📷 Photo** to estimate from a picture.
- Each food shows as a card with its calories and macros. **Tap a card to change its numbers.** The bar at the top shows what the whole meal adds up to.
- A name and notes are optional — they're under **More details**.

### Searching for a food
In any meal, tap **🔎 Search food…** and start typing:
- **Your foods** — anything you've logged before, with your own numbers (works offline).
- **Canadian Nutrient File** — Health Canada's plain foods (fruit, vegetables, meat, grains, dairy), with Canadian serving sizes like "1 medium banana" or "250 mL".
- **Packaged foods** — brands sold in Canada, from Open Food Facts. Anyone can add to it, so a ⚠️ means the numbers don't add up — check the package.

Tap a result, choose grams or a serving size, and tap **Add to meal**. It's added as a normal row you can still edit; nothing is saved until you tap Save.

### Admin tab
Sync (status, **Sync now**, and **Sync settings** with your codes), the Claude inbox, **Backup**, **Restore** and the workout **CSV** all live here. If sync needs attention, the tab itself shows 📴 (no connection) or ⚠️ (a problem), so you'll see it from any screen.

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

Both are shown in the app under **⚙️ Admin → Sync settings**.

---

## When something looks off

| What you see | What to do |
|---|---|
| An update didn't show up | Fully close the app (swipe it away) and reopen it. Don't clear its data. |
| Meals or workouts missing on one device | On the device where you entered them: **⚙️ Admin → Sync now** (it needs a connection). Then open the other device. |
| A **"Sync conflict"** box | Both devices changed while apart. Pick the side showing **more** workouts and meals. The other side is kept as a one-time backup. |
| Claude's meals don't appear | **⚙️ Admin → Claude inbox → Check now.** If still nothing, ask Claude to check the inbox. |
| A ⚠️ or 📴 on the **Admin** tab | Open Admin: it says what's wrong. 📴 = no connection (changes upload later); ⚠️ = a sync problem or a conflict to resolve with **Sync now**. |
| Sync says "last synced over a week ago" | Tell Claude — the free Supabase project may have paused. Your data on the device is safe either way. |

---

## Backups

All on the **⚙️ Admin** tab.

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
