import { readFileSync,writeFileSync,mkdirSync,mkdtempSync,copyFileSync,lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { publicAssets } from './lib/pages-assets.mjs';
import { isValidDate } from '../projects/make-10/schedule/dates.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const production=process.argv[2]==='--production';
assert(process.argv.length===3,'Supply a temporary preview YYYY-MM-DD launch date, or --production');
const config=JSON.parse(readFileSync(path.join(root,'wrangler.jsonc'),'utf8'));
const launch=production ? config.vars?.MAKE10_LAUNCH_DATE : process.argv[2];
assert(isValidDate(launch),'Expected a valid launch date');
assert.equal(config.name,'website');
// Basic v1's production anchor is permanent; preview dates remain independent.
if(production || config.vars?.MAKE10_LAUNCH_DATE)assert.equal(config.vars?.MAKE10_LAUNCH_DATE,'2026-09-01','Do not change the Basic v1 production anchor');
assert.equal(config.d1_databases.find(b=>b.binding==='make10_db').database_id,'4d873aa1-5eac-4f2e-a0b0-84d46dec0ad6');
assert.equal(config.env.preview.d1_databases.find(b=>b.binding==='make10_db').database_id,'bd002a39-5ec1-49a0-837c-b26be92684a8');
mkdirSync(path.join(root,'.wrangler'),{recursive:true});
const environment=production ? 'production' : 'preview';
const staging=mkdtempSync(path.join(root,'.wrangler',`pages-${environment}-`)),output=path.join(staging,'public');
const assets=publicAssets(root);
for(const file of assets){const dest=path.join(output,file);mkdirSync(path.dirname(dest),{recursive:true});copyFileSync(path.join(root,file),dest);}
// Prevent Pages' SPA fallback from making excluded private paths appear successful.
writeFileSync(path.join(output,'404.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found | Brian Nguyen</title><h1>Page not found</h1><a href="/">Back to portfolio</a></html>');
const build=spawnSync(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),'pages','functions','build','functions','--outdir',path.join(output,'_worker.js'),'--output-routes-path',path.join(output,'_routes.json'),'--compatibility-date',config.compatibility_date],{cwd:root,stdio:'inherit'});
assert.equal(build.status,0,'Functions build failed');
assert(lstatSync(path.join(output,'_worker.js','index.js')).isFile(),'Expected a runnable worker directory, not a multipart upload file');
config.pages_build_output_dir='./public';
if(production)delete config.env; // No preview binding/configuration in the production package.
else config.env.preview.vars={...config.env.preview.vars,MAKE10_LAUNCH_DATE:launch};
writeFileSync(path.join(staging,'wrangler.jsonc'),JSON.stringify(config,null,2)+'\n');
writeFileSync(path.join(staging,'asset-manifest.json'),JSON.stringify(assets,null,2)+'\n');
writeFileSync(path.join(root,'.wrangler',`make10-${environment}-build.json`),JSON.stringify({staging,output,launch,environment,assets:assets.length},null,2)+'\n');
console.log(JSON.stringify({staging,output,launch,environment,assets:assets.length},null,2));

