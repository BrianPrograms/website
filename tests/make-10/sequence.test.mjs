import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sequenceHash, shuffle, createArtifact, metadataFor, verifyArtifact, assertOutsideRepository, repository, privateFile, assertNotFrozen, writeNewJson } from '../../scripts/lib/make10-sequence.mjs';

// Structural fixtures only; production verification independently rebuilds the real solver pool.
const pool = Array.from({ length: 6891 }, (_, i) => String(i).padStart(4, '0'));
const artifact = createArtifact(pool, '2026-01-01T00:00:00.000Z');
const metadata = metadataFor(artifact);

test('shuffle preserves its input and every entry, including leading zeroes', () => {
  const shuffled = shuffle(pool);
  assert.notEqual(shuffled, pool);
  assert.equal(new Set(shuffled).size, 6891);
  assert.deepEqual([...shuffled].sort(), pool);
  assert.equal(pool[0], '0000');
  assert.deepEqual(shuffle([]), []);
  assert.deepEqual(shuffle(['0010']), ['0010']);
});

test('sequence hash is order-sensitive; public metadata contains no puzzle list', () => {
  assert.equal(sequenceHash(pool), sequenceHash([...pool]));
  assert.notEqual(sequenceHash(pool), sequenceHash([...pool].reverse()));
  assert.deepEqual(Object.keys(metadata).sort(), ['count', 'generatedAt', 'hashEncoding', 'ruleset', 'sha256']);
  assert.doesNotThrow(() => verifyArtifact(artifact, metadata, pool));
});

test('verification rejects corrupt structure, set, order, checksum and metadata', () => {
  const corruptions = [
    a => { a.ruleset = 'basic-v2'; }, a => { a.count--; },
    a => { a.sequence.pop(); }, a => { a.sequence[0] = a.sequence[1]; },
    a => { a.sequence[0] = 0; }, a => { a.sequence[0] = '000'; },
    a => { a.sequence[0] = '00x0'; }, a => { a.sequence[0] = '0000\n'; }, a => { a.sequence[0] = '9999'; },
    a => { a.sequence.reverse(); }, a => { a.sha256 = '0'.repeat(64); },
    a => { a.generatedAt = 'invalid'; }, a => { a.hashEncoding = 'other'; },
  ];
  for (const corrupt of corruptions) {
    const changed = structuredClone(artifact); corrupt(changed);
    assert.throws(() => verifyArtifact(changed, metadata, pool));
  }
  // Even if the private file's checksum is recomputed, public metadata detects reordering.
  const reordered = createArtifact([...pool].reverse(), artifact.generatedAt);
  assert.throws(() => verifyArtifact(reordered, metadata, pool), /metadata/);
  assert.throws(() => verifyArtifact(artifact, { ...metadata, count: 1 }, pool), /metadata/);
});

test('private path is outside Pages output; exclusive writes and either freeze marker block overwrites', () => {
  assert.doesNotThrow(() => assertOutsideRepository(privateFile));
  assert.throws(() => assertOutsideRepository(path.join(repository, '.make10-private/basic-v1-sequence.json')), /outside/);
  const directory = mkdtempSync(path.join(tmpdir(), 'make10-freeze-test-'));
  const sequencePath = path.join(directory, 'sequence.json'), metadataPath = path.join(directory, 'metadata.json');
  try {
    assert.doesNotThrow(() => assertNotFrozen(sequencePath, metadataPath));
    writeNewJson(sequencePath, { marker: 'original' });
    const original = readFileSync(sequencePath, 'utf8');
    assert.throws(() => writeNewJson(sequencePath, { marker: 'replacement' }), { code: 'EEXIST' });
    assert.equal(readFileSync(sequencePath, 'utf8'), original);
    assert.throws(() => assertNotFrozen(sequencePath, metadataPath), /already been frozen/);
    writeNewJson(metadataPath, metadata);
    assert.throws(() => assertNotFrozen(path.join(directory, 'missing.json'), metadataPath), /already been frozen/);
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert(path.basename(directory).startsWith('make10-freeze-test-'));
    rmSync(directory, { recursive: true });
  }
});
