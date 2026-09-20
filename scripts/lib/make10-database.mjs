import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RULESET, PUZZLE_COUNT } from '../../projects/make-10/schedule/dates.mjs';
import { privateFile, metadataFile, assertOutsideRepository, generateValidPool, verifyArtifact, sequenceHash } from './make10-sequence.mjs';

export const AUTHORITATIVE_HASH = 'b0e9c92129a2b82be2e69c1a8acf70e84282e536ad1df6a870ae4b28990833b2';
export const rowsQuery = 'SELECT ruleset, sequence_index, puzzle_code FROM make10_puzzles ORDER BY sequence_index';
export const metadataQuery = 'SELECT ruleset, puzzle_count, sequence_sha256, generated_at, seeded_at FROM make10_sequence_metadata';

export function loadVerifiedSequence(progress = () => {}) {
  assertOutsideRepository(privateFile);
  const artifact = JSON.parse(readFileSync(privateFile, 'utf8'));
  const metadata = JSON.parse(readFileSync(metadataFile, 'utf8'));
  assert.equal(artifact.sha256, AUTHORITATIVE_HASH, 'Private hash is not the authoritative Basic v1 hash');
  assert.equal(metadata.sha256, AUTHORITATIVE_HASH, 'Tracked hash is not authoritative');
  verifyArtifact(artifact, metadata, generateValidPool(progress));
  return artifact;
}

export function verifyDatabase(rows, metadataRows) {
  const tracked = JSON.parse(readFileSync(metadataFile, 'utf8'));
  assert.equal(tracked.sha256, AUTHORITATIVE_HASH, 'Tracked hash is not authoritative');
  assert.equal(rows.length, PUZZLE_COUNT, 'Database must contain exactly 6891 puzzle rows');
  assert.equal(metadataRows.length, 1, 'Expected exactly one metadata row');
  const sequence = [], seen = new Set();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    assert.equal(row.ruleset, RULESET, 'Wrong database ruleset');
    assert.equal(row.sequence_index, i, 'Duplicate, missing or unordered sequence index');
    assert(typeof row.puzzle_code === 'string' && row.puzzle_code.length === 4 && /^\d{4}$/.test(row.puzzle_code), 'Invalid database puzzle code');
    seen.add(row.puzzle_code); sequence.push(row.puzzle_code);
  }
  assert.equal(seen.size, PUZZLE_COUNT, 'Duplicate puzzle codes');
  const hash = sequenceHash(sequence);
  assert.equal(hash, AUTHORITATIVE_HASH, 'Reconstructed database sequence hash mismatch');
  const metadata = metadataRows[0];
  assert.equal(metadata.ruleset, RULESET, 'Wrong metadata ruleset');
  assert.equal(metadata.puzzle_count, PUZZLE_COUNT, 'Wrong metadata count');
  assert.equal(metadata.sequence_sha256, hash, 'Metadata hash mismatch');
  assert.equal(metadata.generated_at, tracked.generatedAt, 'Generation timestamp mismatch');
  assert.equal(typeof metadata.seeded_at, 'string', 'Missing seed timestamp');
  assert.equal(new Date(metadata.seeded_at).toISOString(), metadata.seeded_at, 'Invalid seed timestamp');
  return { count: rows.length, unique: seen.size, sha256: hash };
}

export function seedDisposition(rows, metadataRows) {
  if (rows.length === 0 && metadataRows.length === 0) return 'empty';
  verifyDatabase(rows, metadataRows); // Anything incomplete or different fails closed.
  return 'already-seeded';
}

const quote = value => `'${String(value).replaceAll("'", "''")}'`;
export function seedSql(artifact, seededAt = new Date().toISOString()) {
  assert.equal(artifact.sha256, AUTHORITATIVE_HASH);
  assert.equal(sequenceHash(artifact.sequence), AUTHORITATIVE_HASH);
  // One INSERT for the entire pool: a uniqueness conflict aborts the whole statement.
  // JSON keeps this single statement below D1's SQL length limit for all 6891 rows.
  return `INSERT INTO make10_puzzles (ruleset, sequence_index, puzzle_code) SELECT 'basic-v1', CAST(key AS INTEGER), value FROM json_each(${quote(JSON.stringify(artifact.sequence))});\n` +
    `INSERT INTO make10_sequence_metadata (ruleset, puzzle_count, sequence_sha256, generated_at, seeded_at) VALUES ('basic-v1',6891,${quote(AUTHORITATIVE_HASH)},${quote(artifact.generatedAt)},${quote(seededAt)});\n`;
}
