# Make 10 Stage 6: anonymous discoveries

POST `/api/make-10/player` establishes a server-generated UUID v4 identity.
`make10_player` has Path=/, HttpOnly, SameSite=Lax and Max-Age=31536000;
HTTPS also sets Secure, while local HTTP works without it. The server accepts
only UUIDs in its own `make10_players` registry. Missing, malformed, duplicated,
or unregistered cookie values are replaced. No identity is returned in JSON.
The frontend establishes the cookie before saving, so a lost save acknowledgement
can be retried with the same identity. Direct solution requests also issue a
cookie if necessary; clients should bootstrap first for that retry guarantee.

POST `/api/make-10/solutions` accepts exactly:

```json
{"date":"2026-09-01","expression":"3*4-1-1"}
```

JSON is limited to 2,048 bytes (including streamed bodies); expression strings
are limited to 256 characters. Extra fields, invalid JSON, invalid dates and
wrong content types are rejected. The date is checked against the configured
launch date and server-side Sydney date; its authoritative ordered four-digit
puzzle is loaded with a parameterized D1 query. Future/pre-launch/exhausted dates
return 404, invalid submissions/solutions 400, unavailable configuration/data 503.
Cross-origin browser POSTs are rejected. Responses are no-store.

The existing engine parses the string after normalizing display operators
(× becomes *, ÷ becomes /, − becomes -). It enforces exactly the
original four digits in order, including repeated digits and leading zeroes;
concatenation, missing/extra/reordered digits, illegal syntax/operators and undefined
arithmetic fail. Exact rational evaluation must equal 10. No eval or second
mathematical validator is used. Display text comes from the engine formatter.

The unchanged engine canonicalizes structure, redundant parentheses, negative
pairs and negation of exact zero. It does not merge general algebraic equivalents.
Method identity is lowercase hexadecimal SHA-256 of UTF-8:
`basic-v1` + newline + canonical method. Client hashes/results/IDs are never trusted.

## Schema and atomic recording

`0002_solutions.sql` adds:

| Table | Purpose and keys |
| --- | --- |
| make10_players | Server-minted player_id primary key and created_at; no personal data |
| make10_solution_methods | Ruleset/index/hash composite primary key; unique ruleset/index/canonical structure; display expression, first_discovered_at, first_player_id |
| make10_player_methods | Player/ruleset/index/hash composite primary key and submitted_at |

Foreign keys link methods to the frozen schedule and players, and submissions
to both methods and players. The method key covers puzzle lookup, the submission
key covers player/puzzle lookup, and a separate ruleset/index/hash index supports
method counts. Counts are derived, never cached. Schedule migration 0001 is unchanged.

One native D1 batch inserts the identity, inserts the method on conflict do nothing,
inserts the player-method on conflict do nothing, and reads statistics. D1's
transactional batch plus unique constraints selects exactly one recorded first
discoverer and prevents duplicate player counts. `alreadySubmitted` comes from
the submission INSERT's change count; `youWereFirst` compares the stored first
player with the cookie identity and stays true on that player's later retries.

Other methods come only from submitted records, exclude the current method, and
sort by count descending, discovery time ascending, then hash. Only display
expressions and aggregate counts are exposed. GET on either POST endpoint returns
405. There is no solution-list GET or exhaustive-solver import.

## Response examples verified against local and preview D1

First discovery:

```json
{"date":"2026-09-01","solved":true,"method":{"expression":"3 × 4 − 1 − 1","count":1,"youWereFirst":true,"alreadySubmitted":false},"otherMethods":[]}
```

A different player submitting that method:

```json
{"date":"2026-09-01","solved":true,"method":{"expression":"3 × 4 − 1 − 1","count":2,"youWereFirst":false,"alreadySubmitted":false},"otherMethods":[]}
```

Original first player's duplicate retry:

```json
{"date":"2026-09-01","solved":true,"method":{"expression":"3 × 4 − 1 − 1","count":2,"youWereFirst":true,"alreadySubmitted":true},"otherMethods":[]}
```

## Verification and remote state

`npm test` passed all 51 tests (zero failures/skips), including the original 39
plus submission, identity, canonical hashing, transaction rollback and frontend
retry/late-response tests. `git diff --check` passed.

With the existing local Pages server running using the temporary 2026-09-01 launch:

```sh
node scripts/make10-solutions-integration.mjs --local
node scripts/make10-solutions-integration.mjs --remote-preview
```

These explicit integration commands refuse production. Local mode exercises real
HTTP Pages Functions and native D1 batch. Preview mode runs the same handlers via
a Wrangler remote SQL adapter, including concurrent requests; it is not a deployed
preview website test. The script checks the known first puzzle, refuses existing
discoveries on that fixture puzzle, and removes only identities and solve rows it
created. It verifies the original table counts were restored. It never edits the
schedule. Test preview only before launch while it has no live solve traffic.

On 21 September 2026, local migration/native-batch race checks passed; preview
migration, empty-table/foreign-key checks, and integration checks then passed.
Only after preview succeeded was production migrated. Both remote databases have
0001 and 0002 applied, no foreign-key violations, and zero players, methods and
player-method rows. Production received no test submissions. Local browser QA
records intentionally remain local; integration fixtures were removed.

Independent schedule verification passed locally and remotely, including after
preview integration: 6,891 rows, 6,891 unique puzzles, every index 0–6890, reconstructed
SHA-256 `b0e9c92129a2b82be2e69c1a8acf70e84282e536ad1df6a870ae4b28990833b2`.
No deployment or production launch-date setting was made.

## Identity and abuse limitations

Counts represent anonymous browser-cookie identities, not guaranteed unique
humans. Cookie deletion/expiry, private browsing and separate devices create new
identities; a shared browser can combine people. localStorage is irrelevant.
The UUID is a bearer credential: someone who obtains it can act as that identity.
No IP addresses, user agents, names, emails or fingerprints are stored by this
feature. No bot defense or rate limiting is added in this stage, so automation can
create identities and inflate counts, and anyone able to submit a valid solution
can see discovered methods. Concurrent first-ever cookie bootstraps in separate
tabs can create separate identities before either receives its cookie. Browser
cookie blocking prevents reliable deduplication. These are not account guarantees.
