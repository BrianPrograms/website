# Basic v1 frozen schedule

The frontend remains the fixed `1350` puzzle. This module adds no daily loading,
API, D1 binding, or player features. The mathematical engine is unchanged.

## Freeze and verify

Run `npm test`, then **once** run `npm run make10:freeze`.
Run `npm run make10:verify-sequence` at any time for read-only verification.
Both scripts exhaustively solve `0000`–`9999`, retain leading zeroes, and validate
and independently evaluate a solution AST for each solvable puzzle. Exactly
6,891 must be solvable. Verification compares the entire frozen set to that pool.

Fisher–Yates uses Node `crypto.randomInt` for each unbiased choice. Only the freeze
command shuffles; neither the verifier nor the date module does. There is no
force/regenerate option. Either an existing private file or existing metadata
blocks freezing, with exclusive creation protecting against concurrent writers.

The private file is **outside the repository**, at
`~/.make10-private/website/basic-v1-sequence.json` (`~` is Node's home directory).
On this machine: `C:\Users\brian\.make10-private\website\basic-v1-sequence.json`.
The scripts reject any path that resolves inside the repository, including via
existing symlinks/junctions. Do not copy it into this repository or a public folder.
`.gitignore` also excludes accidentally copied `.make10-private` directories,
but gitignore is not a static hosting access-control mechanism.

This location is deliberate: `wrangler.jsonc` publishes `.` and the installed
Pages uploader does not exclude arbitrary dot-directories. The external artifact
is outside both that upload tree and the local static preview's document root.
No production deployment changes are necessary.

`basic-v1-metadata.json` is non-sensitive and intended for version control. It
contains only ruleset, count, timestamp, hash encoding and SHA-256, never puzzles.
The hash input is exactly `JSON.stringify(sequence)` encoded as UTF-8, with no
whitespace or trailing newline. Puzzle order and leading zeroes are significant.
Future D1 seeding must read rows in sequence-index order, reconstruct that array
of strings, and compare the hash to this metadata.

Back up the private artifact securely. Its random order cannot be recovered from
the hash. On another machine, restore that same artifact to the external location;
do not generate a replacement. If metadata writing fails after the private file
was created, preserve that file and recover metadata from its header (all fields
except `sequence`), then run the verifier. Never reshuffle to recover a write error.
Regenerating after launch would invalidate the daily schedule.

## Sydney calendar dates

`sydneyDate(instant)` returns a `YYYY-MM-DD` date in `Australia/Sydney` using Intl
timezone data. Pass an epoch-millisecond number or a Date for deterministic use;
omitting it uses the current instant. Date strings must be valid Gregorian dates
in years 0001–9999; `isValidDate` checks them without rollover normalization.

`calendarDaysBetween(launchDate, date)` compares UTC calendar representations of
the two date-only strings. It does not divide elapsed Sydney timestamps by 24h,
so a 23-hour or 25-hour DST day still advances exactly one calendar day.

`resolveSequenceIndex({ launchDate, date, count = 6891 })` returns:

- `{ status: 'available', index: 0 }` on launch day (then 1, 2, ...).
- `{ status: 'before-launch', index: null }` before launch.
- `{ status: 'exhausted', index: null }` after index 6890.

Invalid dates/configuration throw RangeError. The launch date is required and has
no production default. A later server can pass `date: sydneyDate()` for today or
a validated requested calendar date. No wrapping, archive policy, or future-date
authorization is implemented in this date arithmetic layer.
