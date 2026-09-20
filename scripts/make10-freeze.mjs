import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { privateFile, metadataFile, assertOutsideRepository, assertNotFrozen, generateValidPool, shuffle, createArtifact, metadataFor, verifyArtifact, writeNewJson } from './lib/make10-sequence.mjs';

try {
  if (process.argv.length !== 2) throw new Error('No options are supported. Basic v1 may only be frozen once.');
  assertOutsideRepository(privateFile);
  assertNotFrozen();
  const pool = generateValidPool(console.log);
  const artifact = createArtifact(shuffle(pool));
  const metadata = metadataFor(artifact);
  verifyArtifact(artifact, metadata, pool);
  mkdirSync(path.dirname(privateFile), { recursive: true, mode: 0o700 });
  assertOutsideRepository(privateFile);
  // Exclusive writes also protect against two freeze processes running concurrently.
  // If metadata writing fails, preserve the private sequence for recovery, never reshuffle.
  writeNewJson(privateFile, artifact);
  writeNewJson(metadataFile, metadata);
  console.log(JSON.stringify({ ...metadata, privateFile, metadataFile }, null, 2));
  console.log('Frozen once. Back up the private file securely; metadata alone cannot reconstruct the order.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
