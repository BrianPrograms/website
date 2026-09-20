import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { repository, privateFile, assertOutsideRepository } from './lib/make10-sequence.mjs';
import { loadVerifiedSequence, rowsQuery, metadataQuery, verifyDatabase, seedDisposition, seedSql } from './lib/make10-database.mjs';

let temporary;
try {
  const [operation, ...flags] = process.argv.slice(2);
  if (!['migrate', 'seed', 'verify'].includes(operation)) throw new Error('Expected migrate, seed or verify');
  const local = flags.includes('--local');
  const remote = flags.find(flag => flag.startsWith('--remote='))?.slice('--remote='.length);
  const allowed = ['--local', '--remote=preview', '--remote=production', '--confirm-remote-seed', '--confirm-remote-migration'];
  if (flags.some(flag => !allowed.includes(flag)) || new Set(flags).size !== flags.length ||
      flags.filter(flag => flag.startsWith('--remote=')).length > 1 || local === Boolean(remote)) {
    throw new Error('Specify exactly one target: --local, --remote=preview, or --remote=production');
  }
  if (!local && operation !== 'verify' && !flags.includes(operation === 'seed' ? '--confirm-remote-seed' : '--confirm-remote-migration')) {
    throw new Error(`Remote ${operation} requires --confirm-remote-${operation === 'seed' ? 'seed' : 'migration'}`);
  }
  const config = JSON.parse(readFileSync(path.join(repository, 'wrangler.jsonc'), 'utf8'));
  const bindings = remote === 'preview' ? config.env?.preview?.d1_databases : config.d1_databases;
  const binding = bindings?.find(item => item.binding === 'make10_db');
  assert.equal(binding?.migrations_dir, 'make10-migrations', 'Make 10 must use its dedicated migration directory');
  if (!local) {
    assert(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(binding.database_id ?? ''), 'Remote Make 10 database_id is not configured. Authenticate and create the database first; see backend README.');
    const commanderIds = config.d1_databases.filter(item => item.binding === 'commander_draft_db').map(item => item.database_id);
    assert(!commanderIds.includes(binding.database_id), 'Refusing to use Commander Draft database');
    const other = remote === 'preview' ? config.d1_databases : config.env?.preview?.d1_databases;
    assert.notEqual(binding.database_id, other?.find(item => item.binding === 'make10_db')?.database_id, 'Preview and production must be separate databases');
  }
  const persistence = path.join(path.dirname(privateFile), 'd1-state');
  assertOutsideRepository(persistence);
  console.log(`Target: ${local ? 'local' : remote} / ${binding.database_name} / binding make10_db`);
  temporary = mkdtempSync(path.join(tmpdir(), 'make10-d1-'));
  assertOutsideRepository(temporary);
  const targetArgs = local ? ['--local', '--persist-to', persistence] : ['--remote', ...(remote === 'preview' ? ['--env', 'preview'] : [])];
  const run = (args, json = false) => {
    const result = spawnSync(process.execPath, [path.join(repository, 'node_modules/wrangler/bin/wrangler.js'), ...args,
      '--config', path.join(repository, 'wrangler.jsonc'), ...targetArgs], {
      cwd: repository, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: path.join(temporary, 'wrangler.log') },
    });
    if (result.error || result.status !== 0) {
      // Never print captured SQL/rows: an import error can echo the private sequence.
      throw new Error(`Wrangler ${operation} failed (exit ${result.status}). Check authentication, target configuration and migration state. Private output suppressed; no replacement/cleanup of database rows was attempted.`);
    }
    if (!json) return;
    const data = JSON.parse(result.stdout);
    assert(Array.isArray(data) && data.every(item => item.success !== false), 'D1 query failed');
    return data;
  };
  const snapshot = () => {
    const results = run(['d1', 'execute', 'make10_db', '--command', `${rowsQuery}; ${metadataQuery};`, '--json'], true);
    assert.equal(results.length, 2, 'Expected puzzle and metadata query results');
    return [results[0].results, results[1].results];
  };
  if (operation === 'migrate') {
    run(['d1', 'migrations', 'apply', 'make10_db']);
    console.log('Make 10 migrations applied.');
  } else if (operation === 'verify') {
    console.log(JSON.stringify(verifyDatabase(...snapshot()), null, 2));
  } else {
    // All artifact/solver checks finish before even attempting an INSERT.
    const artifact = loadVerifiedSequence(console.log);
    if (seedDisposition(...snapshot()) === 'already-seeded') {
      console.log('Already correctly seeded; no writes performed.');
    } else {
      const sqlFile = path.join(temporary, 'seed.sql');
      writeFileSync(sqlFile, seedSql(artifact), { flag: 'wx', mode: 0o600 });
      // Remote file imports can print progress before their JSON output. Check
      // the exit status here; the separate query below verifies the actual data.
      run(['d1', 'execute', 'make10_db', '--file', sqlFile, '--json']);
      console.log(JSON.stringify(verifyDatabase(...snapshot()), null, 2));
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (temporary) {
    const resolved = realpathSync(temporary);
    assert.equal(path.dirname(resolved), realpathSync(tmpdir()));
    assert(path.basename(resolved).startsWith('make10-d1-'));
    rmSync(resolved, { recursive: true, force: true });
  }
}
