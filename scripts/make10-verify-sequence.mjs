import { readFileSync } from 'node:fs';
import { privateFile, metadataFile, assertOutsideRepository, generateValidPool, verifyArtifact } from './lib/make10-sequence.mjs';

try {
  if (process.argv.length !== 2) throw new Error('No options are supported.');
  assertOutsideRepository(privateFile);
  const artifact = JSON.parse(readFileSync(privateFile, 'utf8'));
  const metadata = JSON.parse(readFileSync(metadataFile, 'utf8'));
  const pool = generateValidPool(console.log);
  verifyArtifact(artifact, metadata, pool);
  console.log(`Verified ${artifact.count} unique, solvable puzzles; exact exhaustive pool match. SHA-256: ${artifact.sha256}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
