# Make 10 Stage 4 backend

This stage adds read-only daily/archive APIs and a dedicated D1 schedule. No
frontend integration, player data, submissions, statistics or production launch
date is included. The fixed `1350` frontend and mathematical engine are unchanged.

## Targets and configuration

Wrangler 4.88.0 and its installed schema were inspected. `make10_db` uses
`make10-migrations/`, never Commander Draft's `migrations/`. The original
`commander_draft_db` binding and database ID are preserved.

- Top level: `make10_db`, database name `make10-db` (local verified; remote ID unset).
- Pages `env.preview`: `make10_db`, database name `make10-db-preview` (remote ID unset).
- The preview D1 array repeats Commander Draft unchanged because binding arrays
  are not inherited. Make 10 preview must have its own remote database ID.

`preview_database_id` is documented by this Wrangler version for Wrangler Dev;
it is not a substitute for Pages' `env.preview` deployment configuration. Remote
dev is not enabled. Remote scripts reject unset IDs, Commander Draft's ID, or
matching Make 10 production/preview IDs. No database IDs were invented.

Cloudflare authentication failed (`Failed to fetch auth token: 400 Bad Request`,
`Not logged in`). No remote database was created or seeded and no site deployed.

## Verified local workflow

```sh
npm test
npm run make10:db:migrate -- --local
npm run make10:db:seed -- --local
npm run make10:db:verify -- --local
```

Local persistence is outside the repository:
`~/.make10-private/website/d1-state` (currently
`C:\Users\brian\.make10-private\website\d1-state`). Use that same explicit
`--persist-to` value with `wrangler pages dev` if testing via HTTP. Do not put a
seeded SQLite database in the Pages document root. The supplied tools use the
`make10_db` local identifier until remote IDs are configured; adding a remote ID
may select a new local emulated database, requiring local migration and seeding
again. It does not alter the frozen sequence.

Example PowerShell HTTP development command (choose your own TEST date):

```powershell
npx wrangler pages dev . --port 8789 --persist-to "$env:USERPROFILE\.make10-private\website\d1-state" --binding MAKE10_LAUNCH_DATE=2026-01-01
```

That date is an example only, not a committed production setting. HTTP uses the
actual server clock. Automated handler tests inject `now` as a function argument;
there is no request parameter, environment variable, or HTTP endpoint that can
override the server clock/timezone. Unit tests cover schema/API behavior using
Node 22's built-in SQLite. The frozen-artifact integration test reads the external
private file; it skips on machines without that file. All tests ran here without
skips. Wrangler's Pages Functions build also checks the actual route imports.

## Seed and integrity guarantees

The private artifact is read from its existing Stage 3 path. Before any INSERT,
the seeder validates it against the exhaustive solver pool, evaluates a legal
witness for every solvable puzzle, checks the tracked metadata, and pins the hash:

`b0e9c92129a2b82be2e69c1a8acf70e84282e536ad1df6a870ae4b28990833b2`

The seeder never regenerates/shuffles. Its temporary SQL and Wrangler logs are
created in an external OS temporary directory and removed afterward. Captured
Wrangler SQL/query output is not printed, including on errors. SQLite state and
the private artifact remain outside the public repository.

Empty tables can be seeded. A complete matching database reports already seeded
and performs no writes. Any partial/different contents fail, including missing or
changed metadata. There is no DELETE, UPDATE, upsert, force, or reset option.
The full puzzle insert is a single `INSERT ... SELECT ... FROM json_each(...)`
under 100 KB; duplicate keys abort the statement. Metadata is inserted last.
Schema triggers prevent update/delete and seal further puzzle inserts after
metadata exists. A failed/interrupted import is not silently repaired: rerun the
verifier and investigate; do not delete or replace a production schedule.

The independent DB verifier reads all rows with `ORDER BY sequence_index`, checks
exactly 6891 consecutive indices and unique four-character strings, reconstructs
the array, hashes `JSON.stringify(sequence)` as UTF-8 and compares it against the
authoritative hash, tracked metadata, and DB metadata. It does not trust the stored
hash alone and does not need the private artifact. Timestamps/counts are checked.

## API contract

Configure `MAKE10_LAUNCH_DATE` separately for each intended deployment, using a
strict `YYYY-MM-DD`. It is deliberately unset in the repository. Both handlers
reuse `projects/make-10/schedule/dates.mjs`: Sydney IANA timezone extraction and
calendar-day indexing preserve correct DST behavior. No sequence wrapping.

- `GET /api/make-10/daily`: current server-side Sydney day.
- `GET /api/make-10/puzzle?date=YYYY-MM-DD`: exactly one strict date parameter;
  allows launch through today, within available sequence bounds.
- Success: HTTP 200, only `{ "date": "YYYY-MM-DD", "puzzle": "0019", "ruleset": "basic-v1" }`
  (puzzle above is a synthetic example, not a schedule disclosure).
- Invalid/missing/duplicate requested date: 400 `{ "error": "invalid_date" }`.
- Before launch, future, or exhausted: 404 `{ "error": "not_available" }`.
- Missing/invalid launch configuration: 503 `{ "error": "launch_date_not_configured" }`.
- Missing/invalid scheduled row: 503 `{ "error": "puzzle_unavailable" }`.
- Binding/database failure: 503 `{ "error": "service_unavailable" }`; details are
  logged server-side, never returned to clients.
- Other methods: 405 `{ "error": "method_not_allowed" }`, `Allow: GET`.

All responses use `Cache-Control: no-store`. Future dates are rejected before any
D1 query. Allowed requests query one row using parameterized statements. No list,
hash, index, solutions or future schedule is returned. Daily ignores client date,
timezone and clock parameters.

## Remaining manual Cloudflare setup (do not deploy yet)

1. Authenticate: `npx wrangler login` and complete Cloudflare's browser login.
2. Confirm the intended account with `npx wrangler whoami`.
3. Create the databases with `npx wrangler d1 create make10-db` and
   `npx wrangler d1 create make10-db-preview`.
4. Put the returned production UUID in the top-level `make10_db.database_id`
   and the distinct preview UUID in `env.preview.d1_databases`' Make 10 entry.
   Preserve Commander Draft's entries and both dedicated migration directories.
5. Apply and seed the intended remote target explicitly:

```sh
npm run make10:db:migrate -- --remote=preview --confirm-remote-migration
npm run make10:db:seed -- --remote=preview --confirm-remote-seed
npm run make10:db:verify -- --remote=preview
```

For production, substitute `--remote=production` in those three commands only
when intentionally ready. Both remote writes require explicit confirmation flags;
verification is read-only. These commands do not deploy the website. Choose the
real launch date separately immediately before a later deployment, and set the
configuration in the appropriate production/preview environment then.
