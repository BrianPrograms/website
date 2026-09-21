import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { publicAssets } from '../../scripts/lib/pages-assets.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('preview asset allowlist excludes server/database/test/private material while preserving all frontend imports and icons',()=>{
  const assets=publicAssets(root),set=new Set(assets);
  for(const file of assets) {
    assert(!/(^|\/)(tests|lib|scripts|functions|server|node_modules|\.make10-private|\.git)\//.test(file));
    assert(!/\.(sql|md|toml)$/.test(file));assert(!file.includes('solver.mjs'));assert(!file.includes('metadata'));
    if(/\.(mjs|js)$/.test(file)) {
      const source=readFileSync(new URL(file,new URL('../../',import.meta.url)),'utf8');
      for(const match of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)) {
        const resolved=new URL(match[1],`https://assets.test/${file}`).pathname.slice(1);assert(set.has(resolved),`${file} requires ${resolved}`);
      }
    }
  }
  for(const expected of ['index.html','assets/resume.pdf','favicon.ico','projects/commander-draft/app.js','projects/xorng/src/net/wsClient.js','projects/make-10/ui/progress.mjs'])assert(set.has(expected));
});
