import assert from 'node:assert/strict';
import { createHash, randomInt } from 'node:crypto';
import { existsSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { solve } from '../../projects/make-10/engine/solver.mjs';
import { validate, evaluate } from '../../projects/make-10/engine/expression.mjs';
import { key } from '../../projects/make-10/engine/rational.mjs';
import { RULESET, PUZZLE_COUNT } from '../../projects/make-10/schedule/dates.mjs';

export const repository = fileURLToPath(new URL('../../', import.meta.url));
export const privateFile = path.join(homedir(), '.make10-private', 'website', 'basic-v1-sequence.json');
export const metadataFile = path.join(repository, 'projects/make-10/schedule/basic-v1-metadata.json');
export const hashEncoding = 'sha256:utf8:JSON.stringify(sequence)';

export function assertOutsideRepository(filename) {
  // Resolve existing ancestors too, so a junction/symlink cannot redirect into Pages assets.
  let ancestor = path.resolve(filename);
  const tail = [];
  while (!existsSync(ancestor)) {
    tail.unshift(path.basename(ancestor));
    const parent = path.dirname(ancestor);
    assert.notEqual(parent, ancestor, 'Cannot resolve private output path');
    ancestor = parent;
  }
  const resolved = path.resolve(realpathSync(ancestor), ...tail);
  const relative = path.relative(realpathSync(repository), resolved);
  assert(relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative), 'Private sequence must be outside the repository / Pages output');
}

export function sequenceHash(sequence) {
  return createHash('sha256').update(JSON.stringify(sequence), 'utf8').digest('hex');
}

export function shuffle(pool) {
  const result = [...pool];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function generateValidPool(progress = () => {}) {
  const pool = [];
  for (let i = 0; i < 10000; i++) {
    const puzzle = String(i).padStart(4, '0');
    const result = solve(puzzle);
    if (result.solvable) {
      // Check an actual witness independently of the solver's value buckets/counts.
      const witness = result.solutions().next().value;
      assert.equal(validate(witness, puzzle), true);
      assert.equal(key(evaluate(witness)), '10/1');
      pool.push(puzzle);
    } else assert.equal(result.solutionCount, 0n);
    if ((i + 1) % 1000 === 0) progress(`Checked ${i + 1}/10000 puzzles; ${pool.length} solvable.`);
  }
  assert.equal(pool.length, PUZZLE_COUNT, 'Basic v1 solvable pool has changed');
  assert.equal(new Set(pool).size, PUZZLE_COUNT);
  assert(pool.every(puzzle => /^\d{4}$/.test(puzzle)));
  return pool;
}

export function createArtifact(sequence, generatedAt = new Date().toISOString()) {
  return { ruleset: RULESET, count: PUZZLE_COUNT, generatedAt, hashEncoding, sha256: sequenceHash(sequence), sequence };
}

export function metadataFor(artifact) {
  const { ruleset, count, generatedAt, hashEncoding, sha256 } = artifact;
  return { ruleset, count, generatedAt, hashEncoding, sha256 };
}

export function verifyArtifact(artifact, metadata, validPool) {
  assert.equal(artifact.ruleset, RULESET, 'Wrong ruleset');
  assert.equal(artifact.count, PUZZLE_COUNT, 'Wrong count');
  assert.equal(artifact.hashEncoding, hashEncoding, 'Unknown hash encoding');
  assert.equal(typeof artifact.generatedAt, 'string', 'Missing generation timestamp');
  assert.equal(new Date(artifact.generatedAt).toISOString(), artifact.generatedAt, 'Invalid generation timestamp');
  assert(Array.isArray(artifact.sequence), 'Missing sequence');
  assert.equal(artifact.sequence.length, PUZZLE_COUNT, 'Wrong sequence length');
  assert(artifact.sequence.every(puzzle => typeof puzzle === 'string' && puzzle.length === 4 && /^\d{4}$/.test(puzzle)), 'Invalid puzzle string');
  assert.equal(new Set(artifact.sequence).size, PUZZLE_COUNT, 'Duplicate puzzles');
  assert.equal(validPool.length, PUZZLE_COUNT, 'Wrong solver pool count');
  assert.deepEqual([...artifact.sequence].sort(), [...validPool].sort(), 'Frozen set differs from exhaustive solver pool');
  assert.equal(artifact.sha256, sequenceHash(artifact.sequence), 'Sequence checksum mismatch');
  assert.deepEqual(metadata, metadataFor(artifact), 'Tracked metadata does not match private sequence');
}

export function assertNotFrozen(sequencePath = privateFile, metadataPath = metadataFile) {
  if (existsSync(sequencePath) || existsSync(metadataPath)) {
    throw new Error('Basic v1 has already been frozen (sequence or metadata exists). Refusing to overwrite. Restore the original private file from backup if missing; regenerating after launch invalidates the daily schedule.');
  }
}

export function writeNewJson(filename, value) {
  writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}
