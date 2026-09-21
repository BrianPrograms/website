// Explicit, non-production integration check. Uses real HTTP/native D1 batch
// locally; preview invokes the same handlers over Wrangler's remote SQL API.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { handleSolutions } from '../lib/make10/solutions.mjs';
import { handlePlayer } from '../lib/make10/identity.mjs';

const mode=process.argv[2];
assert(['--local','--remote-preview'].includes(mode) && process.argv.length===3,'Use --local or --remote-preview; production is never supported');
const remote=mode==='--remote-preview';
const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
assert.equal(config.env.preview.d1_databases.find(b=>b.binding==='make10_db').database_id,'bd002a39-5ec1-49a0-837c-b26be92684a8');
const target=remote?['--remote','--env','preview']:['--local','--persist-to',`${process.env.USERPROFILE}/.make10-private/website/d1-state`];
function query(sql) {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','make10_db',...target,'--command',sql,'--json'],{env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'},stdio:['ignore','pipe','pipe']});
    let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.resume();child.on('error',reject);
    child.on('close',code=>{try{assert.equal(code,0,'D1 integration query failed; private SQL output suppressed');const data=JSON.parse(output);assert(data.every(r=>r.success));resolve(data);}catch(e){reject(e);}});
  });
}
const literal=value=>typeof value==='number'?String(value):`'${String(value).replaceAll("'","''")}'`;
const db={prepare(sql){return {bind(...values){let index=0;const command=sql.replaceAll('?',()=>literal(values[index++]));assert.equal(index,values.length);return {command,first:async()=>(await query(command))[0].results[0]??null,run:async()=>(await query(command))[0]};}};},batch:statements=>query(statements.map(s=>s.command).join(';'))};
const env={make10_db:db,MAKE10_LAUNCH_DATE:'2026-09-01'},options={now:()=>Date.parse('2026-09-21T00:00:00Z')};
const origin=remote?'https://preview-test.invalid':'http://127.0.0.1:8789';
const date='2026-09-01',expression='3*4-1-1',other='3*(4-1)+1',cookies=[];
async function request(endpoint,cookie='',body,method='POST') {
  const req=new Request(`${origin}/api/make-10/${endpoint}`,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return remote ? (endpoint==='player'?handlePlayer(req,env,options):handleSolutions(req,env,options)) : fetch(req);
}
async function submit(cookie,source=expression) {
  const res=await request('solutions',cookie,{date,expression:source});assert.equal(res.status,200);return res.json();
}
const counts=async()=>(await query('SELECT (SELECT COUNT(*) FROM make10_players) players,(SELECT COUNT(*) FROM make10_solution_methods) methods,(SELECT COUNT(*) FROM make10_player_methods) submissions'))[0].results[0];
const before=await counts();
const existing=(await query("SELECT COUNT(*) n FROM make10_solution_methods WHERE ruleset='basic-v1' AND sequence_index=0"))[0].results[0].n;
assert.equal(existing,0,'Refusing to mix fixtures with existing discoveries for this puzzle');
assert.equal((await query("SELECT puzzle_code FROM make10_puzzles WHERE ruleset='basic-v1' AND sequence_index=0"))[0].results[0].puzzle_code,'3411');
try {
  for(let i=0;i<2;i++) {
    const res=await request('player');assert.equal(res.status,200);
    const cookie=res.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);
    if(remote)assert.match(cookie,/Secure/);cookies.push(cookie.split(';')[0]);
  }
  const first=await submit(cookies[0]);assert.equal(first.method.count,1);assert.equal(first.method.youWereFirst,true);assert.equal(first.method.alreadySubmitted,false);
  const second=await submit(cookies[1]);assert.equal(second.method.count,2);assert.equal(second.method.youWereFirst,false);
  const retry=await submit(cookies[0]);assert.equal(retry.method.count,2);assert.equal(retry.method.youWereFirst,true);assert.equal(retry.method.alreadySubmitted,true);
  const race=await Promise.all(cookies.map(cookie=>submit(cookie,other)));
  assert.equal(race.filter(r=>r.method.youWereFirst).length,1);
  const repeats=await Promise.all([submit(cookies[0],other),submit(cookies[0],other),submit(cookies[1],other)]);
  assert(repeats.every(r=>r.method.count===2&&r.method.alreadySubmitted));
  assert(repeats.every(r=>r.otherMethods.length===1&&r.otherMethods[0].count===2));
  assert.equal((await request('solutions','',undefined,'GET')).status,405);
  assert.equal((await request('solutions',cookies[0],{date,expression:'3+4+1+1'})).status,400);
  assert.deepEqual(await counts(),{players:before.players+2,methods:before.methods+2,submissions:before.submissions+4});
  console.log(JSON.stringify({target:remote?'preview':'local HTTP/native D1 batch',first,second,retry,race:'one first discoverer; two players; concurrent retries unchanged'},null,2));
} finally {
  // Only UUIDs minted for this run are disposable. Never touch schedule rows or
  // other identities, and never support a production target.
  if(cookies.length) {
    const ids=cookies.map(c=>c.split('=')[1]);assert(ids.every(id=>/^[0-9a-f-]{36}$/.test(id)));
    const set=ids.map(literal).join(',');
    await query(`DELETE FROM make10_player_methods WHERE player_id IN (${set}); DELETE FROM make10_solution_methods WHERE first_player_id IN (${set}) AND NOT EXISTS (SELECT 1 FROM make10_player_methods p WHERE p.ruleset=make10_solution_methods.ruleset AND p.sequence_index=make10_solution_methods.sequence_index AND p.method_hash=make10_solution_methods.method_hash); DELETE FROM make10_players WHERE player_id IN (${set})`);
  }
  assert.deepEqual(await counts(),before,'Fixture cleanup must restore pre-test row counts');
  console.log('Owned test fixtures removed; original row counts restored.');
}
