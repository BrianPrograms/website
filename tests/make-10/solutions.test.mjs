import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleSolutions, validateSolution, methodHash } from '../../lib/make10/solutions.mjs';
import { handlePlayer, COOKIE_NAME } from '../../lib/make10/identity.mjs';
import { createSaveController, methodMessage, validateSaved } from '../../projects/make-10/ui/save.mjs';

const source='(1 - 3) * (-5) + 0', other='-(1 - 3) * 5 + 0';
function fixture() {
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
  for(const migration of ['0001_schedule.sql','0002_solutions.sql']) sql.exec(readFileSync(new URL(`../../make10-migrations/${migration}`,import.meta.url),'utf8'));
  sql.exec("INSERT INTO make10_puzzles VALUES ('basic-v1',0,'1350'),('basic-v1',1,'0019')");
  const db={prepare(query){return {bind(...args){return {query,args,first:async()=>sql.prepare(query).get(...args)??null,run:async()=>sql.prepare(query).run(...args)};}};},
    async batch(statements){sql.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>{const results=sql.prepare(s.query).all(...s.args);return {results,meta:{changes:sql.prepare('SELECT changes() AS n').get().n}};});sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}
  };
  const env={make10_db:db,MAKE10_LAUNCH_DATE:'2026-09-21'},options={now:()=>Date.parse('2026-09-22T00:00:00Z'),log:()=>{}};
  const request=(data,cookie='',url='https://example.test/api/make-10/solutions',method='POST')=>new Request(url,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(method==='POST'?{body:JSON.stringify(data)}:{})});
  return {sql,db,env,options,request,
    async player(){const response=await handlePlayer(new Request('https://example.test/api/make-10/player',{method:'POST'}),env,options);return response.headers.get('set-cookie').split(';')[0];},
    submit(expression=source,cookie='',date='2026-09-21'){return handleSolutions(request({date,expression},cookie),env,options);},
  };
}

test('server accepts exact valid expression and emits only safe fields',async()=>{
  const f=fixture();try {
    const response=await f.submit(),data=await response.json();
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.deepEqual(data,{date:'2026-09-21',solved:true,method:{expression:'(1 − 3) × (−5) + 0',count:1,youWereFirst:true,alreadySubmitted:false},otherMethods:[]});
    assert(!JSON.stringify(data).includes('player_id'));assert(!JSON.stringify(data).includes('method_hash'));
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM make10_solution_methods').get().n,1);
  } finally {f.sql.close();}
});

test('server rejects incorrect result, syntax, concatenation, reordering, missing/repeated digits, operators and undefined arithmetic',async()=>{
  const f=fixture();try {
    for(const expression of ['1+3+5+0','(1-3','13-5+0','(3-1)*5+0','(1-3)*(-5)','(1-3)*(-5)+0+0','1**3+5+0','(1-3)*(-5)/0','alert(1)','1^3+5+0','']) {
      assert.equal((await f.submit(expression)).status,400,expression);
    }
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM make10_solution_methods').get().n,0);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM make10_players').get().n,0);
  } finally {f.sql.close();}
});

test('date/configuration/body/origin checks reject safely without saves',async()=>{
  const f=fixture();try {
    for(const date of ['2026-09-20','2026-09-23','2099-01-01']) assert.equal((await f.submit(source,'',date)).status,404);
    assert.equal((await f.submit(source,'','2026-02-30')).status,400);
    for(const added of ['playerId','canonicalMethod','methodHash','result','puzzle']) {
      const response=await handleSolutions(f.request({date:'2026-09-21',expression:source,[added]:'forged'}),f.env,f.options);
      assert.equal(response.status,400);
    }
    assert.equal((await f.submit('('.repeat(300))).status,400);
    assert.equal((await f.submit('x'.repeat(3000))).status,400);
    const bad=new Request('https://example.test/api/make-10/solutions',{method:'POST',headers:{Origin:'https://evil.test','Content-Type':'application/json'},body:'{}'});
    assert.equal((await handleSolutions(bad,f.env,f.options)).status,403);
    const wrongType=new Request('https://example.test/api/make-10/solutions',{method:'POST',body:'{}'});
    assert.equal((await handleSolutions(wrongType,f.env,f.options)).status,400);
    delete f.env.MAKE10_LAUNCH_DATE;assert.equal((await f.submit()).status,503);
    f.env.MAKE10_LAUNCH_DATE='invalid';assert.equal((await f.submit()).status,503);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM make10_players').get().n,0);
  } finally {f.sql.close();}
});

test('canonical parentheses, visual operators, unary wrappers and negative zero share hashes without algebraic merging',async()=>{
  const expected=await validateSolution(source,'1350');
  for(const expression of ['((1 - 3) * ((-5))) + (-0)','(1 − 3) × (−5) + 0','(1-3)*---5+--0']) assert.equal((await validateSolution(expression,'1350')).hash,expected.hash);
  assert.notEqual((await validateSolution(other,'1350')).hash,expected.hash);
  assert.equal(await methodHash(expected.canonicalMethod),expected.hash);
  assert.notEqual(await methodHash(expected.canonicalMethod,'basic-v2'),expected.hash);
  assert.equal((await validateSolution('0+0+1+9','0019')).expression,'0 + 0 + 1 + 9');
  assert.equal((await validateSolution('0÷4+4+6','0446')).hash,(await validateSolution('0/4+4+6','0446')).hash);
});

test('server-minted cookie is HttpOnly, scoped, long-lived, secure on HTTPS and safe on local HTTP',async()=>{
  const f=fixture();try {
    const response=await f.submit(),cookie=response.headers.get('set-cookie');
    assert.match(cookie,new RegExp(`^${COOKIE_NAME}=`));assert.match(cookie,/HttpOnly/);assert.match(cookie,/Path=\//);assert.match(cookie,/SameSite=Lax/);assert.match(cookie,/Max-Age=31536000/);assert.match(cookie,/Secure/);
    const again=await f.submit(source,cookie.split(';')[0]);assert.equal(again.headers.get('set-cookie'),null);
    for(const value of ['bad',crypto.randomUUID()]) {
      const response=await f.submit(source,`${COOKIE_NAME}=${value}`);
      assert(response.headers.get('set-cookie'));assert(!response.headers.get('set-cookie').startsWith(`${COOKIE_NAME}=${value};`));
    }
    const local=await handleSolutions(f.request({date:'2026-09-21',expression:source},'','http://localhost/api/make-10/solutions'),f.env,f.options);
    assert(!local.headers.get('set-cookie').includes('Secure'));
  } finally {f.sql.close();}
});

test('first discovery survives retries; distinct players count once; a player may discover additional methods',async()=>{
  const f=fixture();try {
    const a=await f.player(),b=await f.player();
    const first=await (await f.submit(source,a)).json();assert.equal(first.method.youWereFirst,true);
    const second=await (await f.submit(source,b)).json();assert.equal(second.method.youWereFirst,false);assert.equal(second.method.count,2);
    const repeat=await (await f.submit(source,a)).json();assert.equal(repeat.method.youWereFirst,true);assert.equal(repeat.method.alreadySubmitted,true);assert.equal(repeat.method.count,2);
    const another=await (await f.submit(other,a)).json();assert.equal(another.method.count,1);assert.equal(another.otherMethods.length,1);assert.equal(another.otherMethods[0].count,2);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM make10_solution_methods').get().n,2);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM make10_player_methods').get().n,3);
    assert.equal((await f.submit('0+0+1+9',a,'2026-09-22')).status,200);
  } finally {f.sql.close();}
});

test('concurrent method discovery and duplicate retries remain unique and atomic',async()=>{
  const f=fixture();try {
    const a=await f.player(),b=await f.player();
    const results=await Promise.all([f.submit(source,a),f.submit(source,b),f.submit(source,a)]);
    const bodies=await Promise.all(results.map(r=>r.json()));
    assert(bodies.every(r=>r.solved));
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM make10_solution_methods').get().n,1);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM make10_player_methods').get().n,2);
    const method=f.sql.prepare('SELECT first_player_id FROM make10_solution_methods').get();
    assert([a.split('=')[1],b.split('=')[1]].includes(method.first_player_id));
    assert.equal(bodies.filter(r=>r.method.alreadySubmitted).length,1);
  } finally {f.sql.close();}
});

test('unsolved GET has no solution access and DB failure exposes no raw details',async()=>{
  const f=fixture();try {
    await f.submit();
    const response=await handleSolutions(f.request(null,'','https://example.test/api/make-10/solutions?date=2026-09-21','GET'),f.env,f.options);
    assert.equal(response.status,405);assert.deepEqual(await response.json(),{error:'method_not_allowed'});
    f.db.batch=async()=>{throw new Error('private SQL and identifiers');};
    assert.deepEqual(await (await f.submit()).json(),{error:'service_unavailable'});
  } finally {f.sql.close();}
});

test('a failed player-method insert rolls back the whole discovery batch',async()=>{
  const f=fixture();try {
    f.sql.exec("CREATE TRIGGER fail_submission BEFORE INSERT ON make10_player_methods BEGIN SELECT RAISE(ABORT,'injected failure'); END");
    assert.equal((await f.submit()).status,503);
    for(const table of ['make10_players','make10_solution_methods','make10_player_methods']) assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0);
  } finally {f.sql.close();}
});

const saved={date:'2026-09-21',solved:true,method:{expression:'(1 − 3) × (−5) + 0',count:1,youWereFirst:true,alreadySubmitted:false},otherMethods:[]};
test('frontend keeps failed solved expression for retry and claims statistics only after acknowledgement',async()=>{
  let fail=true;const calls=[];
  const save=createSaveController({log:()=>{},fetcher:async(url,options)=>{
    calls.push({url,options});if(url.endsWith('/player'))return {ok:true};if(fail)throw new Error('offline');return {ok:true,json:async()=>saved};
  }});
  assert.equal(save.view.phase,'idle');assert.equal(save.view.result,null);
  await save.start('2026-09-21',source);assert.equal(save.view.phase,'failed');assert.equal(save.view.attempt.expression,source);assert.equal(save.view.result,null);
  fail=false;await save.retry();assert.equal(save.view.phase,'saved');assert.equal(save.view.result.method.count,1);
  const posts=calls.filter(c=>c.url.endsWith('/solutions'));assert.equal(posts.length,2);assert.equal(posts[0].options.body,posts[1].options.body);
  assert.deepEqual(JSON.parse(posts[0].options.body),{date:'2026-09-21',expression:source});
  assert.equal(calls[0].url,'/api/make-10/player');
  save.reset();assert.equal(save.view.phase,'idle');assert.equal(save.view.attempt,null);
});

test('frontend count grammar, first discovery, and invalid server response handling',async()=>{
  assert.equal(methodMessage(saved.method),'First to find this method.');
  assert.equal(methodMessage({...saved.method,youWereFirst:false}),'1 player found this method.');
  assert.equal(methodMessage({...saved.method,youWereFirst:false,count:12}),'12 players found this method.');
  assert.throws(()=>validateSaved({...saved,date:'2026-09-22'},'2026-09-21'));
  assert.throws(()=>validateSaved({...saved,method:{...saved.method,count:-1}},'2026-09-21'));
  const save=createSaveController({log:()=>{},fetcher:async url=>url.endsWith('/player')?{ok:true}:{ok:false,status:400}});
  await save.start('2026-09-21',source);assert.equal(save.view.phase,'failed');assert.equal(save.view.result,null);
});

test('reset ignores late save acknowledgements and clears displayed statistics',async()=>{
  let finish;
  const waiting=new Promise(resolve=>finish=resolve);
  const save=createSaveController({fetcher:async url=>url.endsWith('/player')?{ok:true}:waiting});
  const pending=save.start('2026-09-21',source);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(save.view.phase,'saving');assert.equal(save.view.result,null);
  save.reset();finish({ok:true,json:async()=>saved});await pending;
  assert.equal(save.view.phase,'idle');assert.equal(save.view.result,null);assert.equal(save.view.attempt,null);
});
