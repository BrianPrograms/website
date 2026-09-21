# Stage 8A preview and Stage 8B launch checklist

## Verified preview

- Project: `website`; production branch: `main` (confirmed with Cloudflare API).
- Preview branch: `codex/make10-preview`; no Git push or merge was performed.
- Final immutable URL: https://b461215f.website-6sn.pages.dev
- The earlier `0b586b2f` preview predates the solved-restoration race fix; use
  `b461215f` for phone testing.
- Stable preview alias: https://codex-make10-preview.website-6sn.pages.dev
- Deployment ID: `b461215f-f0c2-4e94-bc4b-3cb157bc8084`.
- Deployment API confirmed `environment=preview`, `uses_functions=true`, and
  `make10_db` -> `bd002a39-5ec1-49a0-837c-b26be92684a8` (`make10-db-preview`).
- Temporary preview launch: `2026-09-01`. It lives in the generated package's
  `wrangler.jsonc` at `env.preview.vars.MAKE10_LAUNCH_DATE`, and was uploaded as
  the Pages project's preview runtime variable. It is not in the tracked root
  configuration. Production's launch variable remains absent.
- Commander Draft's pre-existing binding is preserved. Do not create test draft
  rooms: it still uses the existing Commander Draft database, not a new fixture DB.

## Small, isolated deployment package

No source directories were moved and the tracked root Wrangler configuration was
not changed. `node scripts/pages-preview-build.mjs 2026-09-01` creates a unique
ignored `.wrangler/pages-preview-<suffix>/` package. The current package paths are
recorded in `.wrangler/make10-preview-build.json`.

The final deployed directory was `.wrangler/pages-preview-8Fzokd/public`.
Only `public` is uploaded, never the repository root or its parent package.
The adjacent generated Wrangler config sets `pages_build_output_dir=./public`.
The manifest beside it is for local audit and is not public.

The explicit allowlist copies 39 public files:

- Root portfolio HTML, CSS and JS; robots, sitemap and webmanifest; all site icons;
  the public resume PDF.
- Existing X-O RNG and Commander Draft HTML/CSS/JS, preserving paths and imports.
- Make 10 HTML/CSS/app; all UI modules; expression/rational engine modules and
  date utilities actually imported by the browser.
- A generated 404 page prevents an SPA fallback from disguising missing paths.

Excluded: Git/config/secrets, node_modules, server source, tests, documentation,
database migrations, administrative scripts, exhaustive solver, sequence metadata,
private frozen sequence and all `.make10-private` data. The private sequence is
outside the repository and is never copied. The asset test checks the allowlist
and verifies frontend module imports are included.

All existing `functions/` routes are compiled by Wrangler using
`pages functions build functions --outdir <public>/_worker.js` and
`--output-routes-path <public>/_routes.json`. Wrangler generates the dispatcher
from the unchanged route tree, including `/api/make-10/*` and all Commander Draft
routes. Pages recognizes `_worker.js/index.js` as executable server code, not a
downloadable static asset. The generated route map limits invocation to the API
paths; other requests use Pages static assets. There is no hand-written replacement
router. The deprecated `--outfile` format is deliberately avoided because this
Wrangler version emits a multipart upload body, not runnable JS.

Preview-only deployment command (from the repository):

```powershell
$bundle = Get-Content .wrangler/make10-preview-build.json | ConvertFrom-Json
node node_modules/wrangler/bin/wrangler.js pages deploy public --cwd $bundle.staging --project-name website --branch codex/make10-preview --commit-dirty=true
```

After each deployment, read its Cloudflare deployment record and confirm its
environment, branch, Make 10 database UUID and launch variable before testing writes.
Cloudflare's [Pages configuration documentation](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
describes how `env.preview` overrides the production/top-level bindings.

## Verification performed

All 66 automated tests passed, including the original 64 plus asset-boundary and
startup-race regression tests. `git diff --check` and Pages Functions compilation
passed. Frozen-sequence verification checked the complete 10,000 ordered-puzzle
pool and confirmed exactly 6,891 solvable puzzles matching the frozen artifact.

Real deployed Functions were tested for daily/archive puzzle correctness, pre-launch
and future protection, identity creation, Secure/HttpOnly/SameSite=Lax/Path=/ cookie,
valid/invalid/oversized submissions, first/second finder, idempotent retry, status,
progress and ownership-gated other methods. No identifiers or raw SQL errors were
returned. All 39 public assets responded successfully; representative private,
test, migration, config, solver and worker-source paths returned 404. Commander
Draft's route dispatcher returned its expected 404 for a nonexistent room.

Browser QA covered the homepage card, daily solve, keyboard editing, unfinished
reload, solved reload, archive deep link, Back/Forward, Other solutions, Try another,
calendar solved labels, Escape/focus return, visible focus outline, success/error
aria-live announcements and a clean 320px calendar. No normal console errors occurred.
This was browser viewport testing, not physical-phone or screen-reader hardware testing.

A real deployment exposed a solved-restoration race: startup fetched today's puzzle
twice, replacing its object while status was pending. Startup now fetches daily
once, and the app compares date/puzzle identity rather than object reference when
accepting restored state. Regression coverage and deployed reload verification pass.

The previous run removed the four disposable preview test identities and their
solves and recorded zero remaining rows. On the 22 September Sydney resumption,
preview contained one player, one method and one submission. The player was created
at `2026-09-21T11:35:49.563Z` and does not match either saved fixture inventory.
It has been preserved pending the user's ownership/cleanup confirmation; preview
must not currently be described as empty. Production was queried only:
all three solution/identity tables remain empty. Both remote schedules have 6,891
rows, 6,891 unique puzzles, every index 0–6890 and reconstructed SHA-256:
`b0e9c92129a2b82be2e69c1a8acf70e84282e536ad1df6a870ae4b28990833b2`.
No schedule row was written or regenerated.

Final resumed checks reconfirmed the corrected deployment's preview environment,
branch, preview D1 UUID and temporary date; production deployment remained
`7c50c10d-fc09-422d-8db3-e8d9e02784e6` with no launch variable. GET-only API,
39-asset and private-path checks passed without creating further fixtures.
The fresh local Pages build compiled successfully into
`.wrangler/pages-preview-RwT95m/public`; this verification build was not deployed.
The build pointer now names that fresh package, not the previously deployed one.

## Physical phone checklist — user still needs to perform

Use the final preview URL on your actual phone, in portrait:

1. Open Make 10 from the portfolio card; confirm the back arrow returns correctly.
2. Drag + between digits; drag − as binary subtraction and as unary negation.
3. Add/match parentheses; check unmatched amber state and finger-offset drag preview.
4. Erase symbols; reset; ensure digits never move out of order.
5. Press = on an incorrect expression; check red number then original attempt returns.
6. Solve correctly; check green 10 and acknowledged statistics. On the 1 September
   archive (`3411`), `3 × 4 − 1 − 1` is a known valid phone-test expression.
7. Open/close the calendar; select an archive date; check its accessible solved marker.
8. Open `/projects/make-10/?date=2026-09-01` directly and confirm the date/puzzle.
9. Edit an unsolved date, reload and check the expression restores.
10. Reload a solved date and check green 10/statistics restore.
11. Use Try another solution and Other solutions; check compact layout/empty state.
12. Test browser Back/Forward between dates; confirm independent attempts.
13. Check portrait overflow, touch targets, keyboard display if applicable, and
    readable layout with your normal phone text-size settings.

Phone tests may create preview-only solves. Never run disposable test solves on
the production database/domain.

## Exact remaining Stage 8B actions — not performed

1. Complete the phone checklist and resolve any physical-device problems. Approve
   the actual Sydney-calendar launch date and explicitly authorize production release.
2. Re-run tests and sequence/production read-only checks; review the final working
   tree. Keep the current public allowlist and compiled Functions artifact strategy.
3. Immediately before release, set the approved date in the tracked root
   `wrangler.jsonc` at top-level `vars.MAKE10_LAUNCH_DATE` (production), not
   `env.preview.vars`. Keep production `make10_db` pointing to
   `4d873aa1-5eac-4f2e-a0b0-84d46dec0ad6`; preview remains the separate UUID.
   Do not reuse the preview's temporary value as the production decision.
4. Prepare a fresh production package using the same publicAssets allowlist and
   Functions build. Its generated config must copy the approved production vars
   and top-level production D1 binding, with `pages_build_output_dir=./public`.
   The current preview builder intentionally refuses a production launch variable;
   adapt/generalize this guard only in the authorized Stage 8B task.
5. Do not simply merge to main while its existing Git build settings still upload
   the repository root. Before any Git-triggered release, configure that workflow's
   build command/output to the same reviewed public bundle, or use an explicitly
   approved staged direct-upload release. This stage left live production build
   settings unchanged. The existing production deployment currently predates Make
   10 and has only its Commander Draft binding; the production release must upload
   the prepared Make 10 binding as well as the approved launch date.
6. Only after authorization, deploy the reviewed production package to project
   `website` on branch `main`. Never use the preview configuration for that upload.
7. Inspect the new production deployment record; verify its database UUID/date,
   custom-domain static pages and read-only daily/status/progress behavior. Do not
   insert fake production solutions. Recheck schedule integrity and monitor normal
   launch traffic/errors. Merge/release strategy requires explicit authorization.
