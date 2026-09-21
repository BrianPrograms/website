import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handlePuzzleRequest } from '../../lib/make10/api.mjs';
import { privateFile } from '../../scripts/lib/make10-sequence.mjs';
import { AUTHORITATIVE_HASH, rowsQuery, metadataQuery, verifyDatabase, seedDisposition, seedSql } from '../../scripts/lib/make10-database.mjs';

const schema = readFileSync(new URL('../../make10-migrations/0001_schedule.sql', import.meta.url), 'utf8');
function database() { const db = new DatabaseSync(':memory:'); db.exec(schema); return db; }
function harness(launchDate = '2026-01-01', now = '2025-12-31T13:00:00Z') {
  const db = database(), calls = [], logs = [];
  for (const [index, code] of ['0019', '0028', '0037'].entries()) {
    db.prepare('INSERT INTO make10_puzzles VALUES (?, ?, ?)').run('basic-v1', index, code);
  }
  const env = { MAKE10_LAUNCH_DATE: launchDate, make10_db: {
    prepare(sql) { return { bind(...args) { calls.push({ sql, args }); return { first: async () => db.prepare(sql).get(...args) ?? null }; } }; },
  } };
  return { db, env, calls, logs,
    async request(query = '', mode = 'daily', method = 'GET') {
      const response = await handlePuzzleRequest(new Request(`https://example.test/api/make-10/${mode === 'daily' ? 'daily' : 'puzzle'}${query}`, { method }), env, mode,
        { now: () => Date.parse(now), log: (...args) => logs.push(args) });
      assert.equal(response.headers.get('cache-control'), 'no-store');
      return { status: response.status, body: await response.json() };
    },
  };
}

test('daily launch/next Sydney day and leading-zero strings survive real SQLite + API', async () => {
  for (const [instant, date, puzzle, index] of [
    ['2025-12-31T13:00:00Z', '2026-01-01', '0019', 0],
    ['2026-01-01T13:00:00Z', '2026-01-02', '0028', 1],
  ]) {
    const h = harness('2026-01-01', instant);
    try {
      const result = await h.request('?date=2099-01-01&timezone=UTC&now=2099-01-01');
      assert.deepEqual(result, { status: 200, body: { date, puzzle, ruleset: 'basic-v1', launchDate: '2026-01-01' } });
      assert.deepEqual(h.calls[0].args, ['basic-v1', index]);
      assert.match(h.calls[0].sql, /ruleset = \? AND sequence_index = \?/);
    } finally { h.db.close(); }
  }
});

test('daily DST and leap-day mapping reuse Sydney calendar dates', async () => {
  for (const [launch, instant, date] of [
    ['2026-04-05', '2026-04-05T14:00:00Z', '2026-04-06'],
    ['2026-10-04', '2026-10-04T13:00:00Z', '2026-10-05'],
    ['2024-02-28', '2024-02-28T13:00:00Z', '2024-02-29'],
  ]) {
    const h = harness(launch, instant);
    try { assert.deepEqual(await h.request(), { status: 200, body: { date, puzzle: '0028', ruleset: 'basic-v1', launchDate: launch } }); }
    finally { h.db.close(); }
  }
});

test('archive accepts past/today but rejects malformed and impossible dates', async () => {
  const h = harness('2026-01-01', '2026-01-01T13:00:00Z');
  try {
    assert.deepEqual(await h.request('?date=2026-01-01', 'archive'), { status: 200, body: { date: '2026-01-01', puzzle: '0019', ruleset: 'basic-v1' } });
    assert.equal((await h.request('?date=2026-01-02', 'archive')).body.puzzle, '0028');
    const before = h.calls.length;
    for (const query of ['', '?date=', '?date=2026-1-01', '?date=2026-02-30', '?date=2025-02-29',
      '?date=2026-01-01T00:00:00Z', '?date=2026-01-01%0A', '?date=2026-01-01&date=2026-01-02',
      '?date=%27%20OR%201=1--']) {
      assert.deepEqual(await h.request(query, 'archive'), { status: 400, body: { error: 'invalid_date' } });
    }
    assert.equal(h.calls.length, before);
  } finally { h.db.close(); }
});

test('before launch, future and exhaustion use the same generic rejection without querying D1', async () => {
  for (const [launch, now, requested, mode] of [
    ['2026-01-01', '2026-01-01T00:00:00Z', '2025-12-31', 'archive'],
    ['2026-01-01', '2026-01-01T00:00:00Z', '2026-01-02', 'archive'],
    ['2026-01-01', '2026-01-01T00:00:00Z', '2099-01-01', 'archive'],
    ['2026-01-01', '2044-11-14T00:00:00Z', '2044-11-13', 'archive'],
    ['2026-01-01', '2044-11-14T00:00:00Z', '', 'daily'],
    ['2026-01-01', '2025-12-30T13:00:00Z', '', 'daily'],
  ]) {
    const h = harness(launch, now);
    try {
      assert.deepEqual(await h.request(`?date=${requested}`, mode), { status: 404, body: { error: 'not_available' } });
      assert.equal(h.calls.length, 0);
    } finally { h.db.close(); }
  }
});

test('missing/invalid configuration, missing rows, and DB errors are clean JSON', async () => {
  const h = harness();
  try {
    for (const launch of [undefined, '', '2026-2-01', '2026-02-30']) {
      h.env.MAKE10_LAUNCH_DATE = launch;
      assert.deepEqual(await h.request(), { status: 503, body: { error: 'launch_date_not_configured' } });
    }
    assert.equal(h.calls.length, 0);
    h.env.MAKE10_LAUNCH_DATE = '2025-01-01';
    assert.deepEqual(await h.request(), { status: 503, body: { error: 'puzzle_unavailable' } });
    h.env.make10_db.prepare = () => { throw new Error('PRIVATE SQL credentials database internals'); };
    assert.deepEqual(await h.request(), { status: 503, body: { error: 'service_unavailable' } });
    assert.equal(h.logs.length, 2);
    assert.equal((await h.request('', 'daily', 'POST')).status, 405);
  } finally { h.db.close(); }
});

test('schema rejects invalid values and keeps puzzle codes TEXT', () => {
  const db = database();
  try {
    const insert = db.prepare('INSERT INTO make10_puzzles VALUES (?, ?, ?)');
    for (const args of [['other', 0, '0019'], ['basic-v1', -1, '0019'], ['basic-v1', 6891, '0019'],
      ['basic-v1', 0.5, '0019'], ['basic-v1', 0, '019'], ['basic-v1', 0, '00x9']]) assert.throws(() => insert.run(...args));
    insert.run('basic-v1', 0, '0019');
    assert.equal(db.prepare('SELECT typeof(puzzle_code) AS type FROM make10_puzzles').get().type, 'text');
    assert.throws(() => insert.run('basic-v1', 1, '0019'));
    assert.throws(() => insert.run('basic-v1', 0, '0028'));
    assert.throws(() => db.exec("UPDATE make10_puzzles SET puzzle_code = '0028'"));
    assert.throws(() => db.exec('DELETE FROM make10_puzzles'));
    assert.throws(() => db.prepare('INSERT INTO make10_sequence_metadata VALUES (?, ?, ?, ?, ?)').run('basic-v1', 6891, AUTHORITATIVE_HASH, 'date', 'date'));
  } finally { db.close(); }
});

test('real frozen artifact round-trips SQL; verifier recomputes authoritative order and rejects corruption', { skip: !existsSync(privateFile) }, () => {
  // Private local integration fixture; no sequence is embedded in source control.
  const artifact = JSON.parse(readFileSync(privateFile, 'utf8'));
  const db = database();
  try {
    assert.equal(seedDisposition([], []), 'empty');
    const sql = seedSql(artifact, '2026-01-01T00:00:00.000Z');
    assert(Buffer.byteLength(sql) < 100000);
    db.exec(sql);
    const rows = db.prepare(rowsQuery).all(), metadata = db.prepare(metadataQuery).all();
    assert.deepEqual(verifyDatabase(rows, metadata), { count: 6891, unique: 6891, sha256: AUTHORITATIVE_HASH });
    assert.equal(seedDisposition(rows, metadata), 'already-seeded');
    assert(rows.some(row => row.puzzle_code.startsWith('0')));
    assert.throws(() => db.exec(sql));
    assert.throws(() => seedDisposition(rows.slice(1), metadata), /6891/);
    for (const mutate of [
      r => { r.pop(); }, r => { r[1].sequence_index = 0; }, r => { r[1].sequence_index = 2; },
      r => { r[1].puzzle_code = r[0].puzzle_code; },
      r => { [r[0].puzzle_code, r[1].puzzle_code] = [r[1].puzzle_code, r[0].puzzle_code]; },
    ]) { const changed = structuredClone(rows); mutate(changed); assert.throws(() => verifyDatabase(changed, metadata)); }
    assert.throws(() => verifyDatabase(rows, [{ ...metadata[0], sequence_sha256: '0'.repeat(64) }]));
    assert.throws(() => verifyDatabase(rows, [{ ...metadata[0], puzzle_count: 6890 }]));
    assert.throws(() => seedDisposition([], metadata));
  } finally { db.close(); }
});
