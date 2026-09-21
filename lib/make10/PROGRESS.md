# Stage 7: attempts, restored solves and archive navigation

The existing Stage 6 tables and indexes are reused. No new migration, remote schema
write, remote test submission, launch setting or deployment is part of this stage.
The mathematical engine and frozen schedule are unchanged.

## Local storage

Keys are `make10:v1:attempt:<ruleset>:<YYYY-MM-DD>`, for example
`make10:v1:attempt:basic-v1:2026-09-20`.

```json
{"version":1,"editor":{"puzzle":"3471","operators":[null,"+",null],"negative":[false,false,false,false],"groups":[],"pending":[],"nextId":1}}
```

Only the structured editor is stored: puzzle string, three binary operators,
four digit-negation flags, completed manual groups (id/start/end/negative), pending
open groups (id/start/negative), and nextId. No drag/erase/dialog/animation state,
server player ID, solved flag, analytics or other tracking data is saved locally.
No stored content is executed. Each edit saves synchronously under the active date,
so switching dates or reloading during evaluation restores the original expression.

Restoration checks version, authoritative puzzle identity, types, ranges, operators,
array lengths, unique group IDs, crossing groups and pending order. Oversized,
invalid or incompatible data is removed and replaced with bare digits. Only known
fields are copied. Storage exceptions (privacy mode, blocked access, quota) do not
break gameplay; persistence is unavailable in that case.

Trash deletes the active date's attempt. Successful server acknowledgement clears
the stale pre-solve attempt. Try another solution starts and stores a fresh bare
editor for the same date; subsequent edits are saved normally. On reload/revisit,
server-confirmed solved state takes precedence, including over an additional
unfinished method. Reset never removes server solve records.

## Read-only APIs and privacy

Both routes use only the existing HttpOnly `make10_player` cookie and server-minted
player registry. They never create identities, return identifiers, or accept a
player ID/solved flag from localStorage or URL parameters. Unknown/malformed
cookies return no history. Both require GET and return Cache-Control: no-store.

`GET /api/make-10/status?date=YYYY-MM-DD` validates one strict calendar date against
the launch date, server-side Sydney today, schedule length and authoritative D1
row. Invalid dates return 400; future/pre-launch/exhausted dates return 404.

Before any expression lookup, it checks for a player-method row owned by this
cookie identity for this puzzle. Unsolved response:

```json
{"date":"2026-09-20","solved":false,"methodsFound":0}
```

A solved response includes date, solved=true, methodsFound, and the Stage 6 method
and otherMethods fields. The primary method is the most recently first-submitted
distinct method, with hash tie-break for equal timestamps. Repeating a method
does not change its original submitted_at. Counts remain aggregate submission
counts; first-discovery status still compares the recorded first player. Other
methods are ordered by count, discovery time and hash, excluding the primary.
All history remains in D1 even though only one primary method is displayed.

`GET /api/make-10/progress` returns only `{solvedDates:[...]}`. Its query is scoped
to the cookie player, Basic v1, existing schedule rows and available indices up to
server-side Sydney today. Indices are converted to dates only on the server. There
are no expressions, hashes, identifiers, future dates or future puzzle codes in
this broad response. Existing player/ruleset/index primary-key prefixes cover the
queries; no index migration is needed.

## Frontend and navigation

Local attempts load when a puzzle is activated. A separate status request may
replace them with the existing green 10 and saved-result actions. No evaluation
animation is resumed. Date selection, explicit reset and new save acknowledgements
invalidate stale status responses. A failed status request leaves the editable
local attempt; it never invents a solve. Reload retries restoration.

The calendar reads server progress and marks dates with a 4px dot and an accessible
`, solved` label. Disabled dates never receive markers. A successful submission
adds its date immediately; delayed progress/status responses cannot remove that
new acknowledgement. Existing selected/today styling remains intact.

Archive links use `/projects/make-10/?date=YYYY-MM-DD`. Startup obtains server
daily bounds before resolving the query. Malformed, repeated, pre-launch and
future parameters fall back to today and are removed with replaceState. A date
equal to today also normalizes to the no-date URL. Unrelated parameters and hash
fragments are preserved.

Successful calendar selections use pushState without reloading; Today removes
date. Popstate uses the same validated puzzle controller to activate the relevant
date and its saved attempt, without adding another history entry. Failed archive
requests retain the active puzzle and normalize the URL to that active date.
The server independently rejects future requests regardless of client URL logic.

## Verification

Stage 7 adds storage, API ownership/privacy/date-boundary, solved precedence,
calendar acknowledgement, deep-link/history and stale-response tests, while
retaining the original 51 checks.

Final `npm test`: 64 passed, zero failed/skipped. `git diff --check` passed.
Read-only local D1 verification confirmed 6,891 rows, 6,891 unique puzzles, every
index 0–6890 and reconstructed SHA-256
`b0e9c92129a2b82be2e69c1a8acf70e84282e536ad1df6a870ae4b28990833b2`.
Stage 7 performed no remote database operations; the previously verified preview
and production schedules were not touched.

Browser QA used the local Pages server and temporary launch 2026-09-01. Verified:
unfinished expression restoration; separate 1 and 20 September attempts across
Back/Forward; direct archive reload; archive solve and immediate accessible marker;
server-restored solved UI; Try another solution; Today URL normalization; safe
future-link fallback; localStorage clearing without losing cookie-backed solves;
cookie deletion removing prior solve access and creating a new identity on the next
submission; 320px calendar layout; no normal console errors. A temporary local-only
storage/cookie test route was removed after QA.

## Limitations

Additional attempts on an already-solved puzzle are superseded by the server solve
on reload, deliberately prioritizing confirmed history. Progress does not synchronize
live between tabs; reload refreshes it. Offline status failures cannot restore server
statistics until connectivity returns and the page reloads. Persistence has no expiry
or cross-device sync; clearing storage removes local attempts. Deleting/expiring the
cookie loses access to that anonymous identity's history without deleting D1 records.
Cookie identity counts are still not unique-human counts. Mobile QA uses a browser
viewport, not physical hardware. All development submissions remain local.
