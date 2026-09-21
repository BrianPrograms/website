# Make 10 daily frontend (Stage 7)

The page loads `/api/make-10/daily`; there is no fixed development puzzle or
fallback digit string. The API supplies `date`, `puzzle`, `ruleset` and
`launchDate`. The editor retains the four-character puzzle string, so leading
zeroes survive rendering and validation. The mathematical engine is unchanged.

`ui/puzzles.mjs` manages validated API responses, request ordering, failures and
rollover. `ui/archive.mjs` renders a native modal dialog. The calendar only enables
dates between the server's launch date and current Sydney date, inclusive. It
never calculates sequence indices or receives the future sequence. Calendar
formatting uses UTC date-only coordinates to avoid the browser's local timezone
shifting the server-provided calendar dates.

Selecting a different date invokes the app's reset callback: stop the evaluation
timer, release any drag, clear tool/erase state, restore that date's structured
attempt and start idle playback. Server-confirmed solved state takes precedence.
Selecting the same puzzle or merely opening/closing the calendar leaves
the attempt intact. Failed archive loads also preserve the current game. Late
responses from cancelled/superseded selections cannot activate a puzzle.

The calendar supports Close, Escape, outside-click dismissal, native modal focus
containment and focus restoration to its opener. Today refetches the daily API.
Only archived puzzles have a muted date label. Stage 7 adds server-backed solved
dots and local structured attempts; see [persistence and progress](../../lib/make10/PROGRESS.md).
Stage 6 supplies anonymous cookie identity, successful submissions and per-method
statistics; see [solution backend](../../lib/make10/SOLUTIONS.md).

Visible pages check the daily API every five minutes and on focus/visibility,
throttled to at most one check per 30 seconds. A changed server date resets a
current-day game; an intentionally selected archive stays active. Background
failures do not interrupt play. The calendar's bounds update from fresh responses.
No client clock is used to select a puzzle. Each fetch has a 15-second timeout.

## Local preview only

Use the existing external local database, never a remote database, for browser QA:

```powershell
npm run make10:db:migrate -- --local
npm run make10:db:seed -- --local
node node_modules/wrangler/bin/wrangler.js pages dev . --ip 127.0.0.1 --port 8789 --persist-to "$env:USERPROFILE/.make10-private/website/d1-state" --binding MAKE10_LAUNCH_DATE=2026-09-01
```

The launch date above is a temporary local CLI binding, not a production choice.
`wrangler.jsonc` has no `MAKE10_LAUNCH_DATE`. No deployment is part of this stage.
Open `http://127.0.0.1:8789/projects/make-10/`. The old static-only preview on 8788
cannot serve Pages Functions; use the Wrangler URL for this stage.

## Verification

`npm test` runs all existing gameplay/backend/scheduling checks and frontend
controller tests: API loading, leading zeroes, bounds, reset/preservation,
retries, response validation, superseded requests, and injected daily rollover.
The original gameplay assertions remain intact; their fixture now explicitly
passes `1350` to the generalized editor constructor.

Browser QA on 21 September 2026 used the real local D1 schedule and launch
`2026-09-01`. The daily response was:

```json
{"date":"2026-09-21","puzzle":"4051","ruleset":"basic-v1","launchDate":"2026-09-01"}
```

Verified desktop and 320px layouts; calendar bounds and dismissal; preservation
on open/close; 20 September (`3471`) archive selection and reset; Today restoration;
5 September (`0446`) leading-zero rendering and successful evaluation; and no
horizontal overflow at 320px. A second local-only preview with launch
`2026-09-05` verified disabled pre-launch days within the month, then was stopped.
Invalid/future selections never fetch in controller tests; the server continues
to reject future requests with generic 404 JSON. No future sequence asset is
requested or imported by the frontend.

Archive URLs now preserve their date and unfinished attempts survive reload.
Server-confirmed solves override local attempts. Rollover may take
up to five minutes while continuously visible, or occur on the next focus check.
Mobile QA used a 320px browser viewport rather than physical touch hardware.

## Successful solution saving

`ui/save.mjs` establishes the HttpOnly cookie with POST `/api/make-10/player`,
then posts only `{date, expression}` to `/api/make-10/solutions`. It waits until
the existing evaluation animation ends at green 10. Statistics and Other solutions
remain hidden until the server acknowledges the valid submission. First finders
see one discovery message; others see a correctly pluralized player count.

Other solutions lists only submitted methods, with display operators and counts.
Try another solution clears the editor on the same puzzle without changing saved
records. Reset/date changes abort pending saves and ignore late acknowledgements.
Failures retain the successful expression in memory and show Retry under green 10.
Retry uses the same payload and cookie. Reload restores the pre-animation editor
or the server-confirmed solved state, never a partially completed animation.

Stage 6 browser QA covered first discovery, duplicate save after reload, additional
method, empty/populated disclosure, same-puzzle reset, archive solve, 320px width
without horizontal overflow, and explicit storage clearing without changing the
cookie identity. Stopping the local API produced Retry without statistics; restarting
it and retrying saved the preserved expression. The result area's stacking order
was corrected so the puzzle area cannot intercept its buttons. Normal gameplay
had no console errors; the deliberate offline test produced expected diagnostics.
