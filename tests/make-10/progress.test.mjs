import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleProgress, dateAtIndex } from '../../lib/make10/progress.mjs';
import { handlePlayer } from '../../lib/make10/identity.mjs';
import { handleSolutions } from '../../lib/make10/solutions.mjs';
import { createAttempts, attemptKey } from '../../projects/make-10/ui/attempts.mjs';
import { initialState, edit } from '../../projects/make-10/ui/editor.mjs';
import { createPuzzleController, monthCells } from '../../projects/make-10/ui/puzzles.mjs';
import { createHistory, linkedDate } from '../../projects/make-10/ui/history.mjs';
import { createProgress } from '../../projects/make-10/ui/progress.mjs';
import { createSaveController } from '../../projects/make-10/ui/save.mjs';

const daily={date:'2026-09-21',launchDate:'2026-09-01',ruleset:'basic-v1',puzzle:'1350'};
const archive={date:'2026-09-20',ruleset:'basic-v1',puzzle:'0019'};
const response=data=>({ok:true,json:async()=>data});
const saved={date:daily.date,solved:true,methodsFound:2,method:{expression:'(1 − 3) × (−5) + 0',count:2,youWereFirst:true,alreadySubmitted:true},otherMethods:[]};
function storage(){const data=new Map();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}
function edited(puzzle){let s=initialState(puzzle);for(const a of [{type:'operator',index:0,value:'-'},{type:'negate-digit',index:2},{type:'open',index:0},{type:'close',index:1},{type:'negate-group',id:1},{type:'open',index:2}])s=edit(s,a);return s;}

test('versioned structured attempts restore operators, unary/group negation and unmatched parentheses across reloads',()=>{
  const memory=storage(),attempts=createAttempts(memory),state=edited(daily.puzzle);
  attempts.save(daily,{...state,drag:{x:1},playerId:'must not persist',playback:'evaluating'});
  assert.deepEqual(createAttempts(memory).load(daily),state);
  assert.equal(attemptKey(daily),'make10:v1:attempt:basic-v1:2026-09-21');
  const raw=memory.getItem(attemptKey(daily));assert(!raw.includes('playerId'));assert(!raw.includes('drag'));assert(!raw.includes('playback'));
});
test('malformed, incompatible, oversized, wrong-puzzle and crossing stored states are discarded',()=>{
  const memory=storage(),attempts=createAttempts(memory);
  for(const raw of ['{','null','x'.repeat(4097),JSON.stringify({version:2,editor:initialState('1350')}),JSON.stringify({version:1,editor:initialState('0019')}),JSON.stringify({version:1,editor:{...initialState('1350'),operators:['bad',null,null]}}),JSON.stringify({version:1,editor:{...initialState('1350'),nextId:3,groups:[{id:1,start:0,end:2,negative:false},{id:2,start:1,end:3,negative:false}]}})]) {
    memory.setItem(attemptKey(daily),raw);assert.deepEqual(attempts.load(daily),initialState(daily.puzzle));assert.equal(memory.getItem(attemptKey(daily)),null);
  }
  const broken=createAttempts({getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();}});
  assert.doesNotThrow(()=>broken.save(daily,initialState('1350')));assert.deepEqual(broken.load(daily),initialState('1350'));
});
test('attempts remain independent by date even with identical digits; trash and fresh attempts affect only active date',()=>{
  const memory=storage(),attempts=createAttempts(memory),second={...daily,date:archive.date};
  attempts.save(daily,edited('1350'));attempts.save(second,edit(initialState('1350'),{type:'operator',index:1,value:'*'}));
  attempts.clear(daily);assert.equal(memory.getItem(attemptKey(daily)),null);assert.equal(attempts.load(second).operators[1],'*');
  attempts.save(daily,initialState('1350'));assert.deepEqual(attempts.load(daily),initialState('1350'));assert(memory.getItem(attemptKey(daily)));
});
function navigationHarness(href='https://game.test/projects/make-10/') {
  const location={href},entries=[href];let position=0,state;const calls=[],memory=storage(),attempts=createAttempts(memory);
  const history={pushState(_s,_t,url){location.href=new URL(url,location.href).href;entries.splice(++position);entries.push(location.href);},replaceState(_s,_t,url){location.href=new URL(url,location.href).href;entries[position]=location.href;}};
  const controller=createPuzzleController({fetcher:async url=>{calls.push(url);return response(url.endsWith('/daily')?daily:archive);},onPuzzle(){state=attempts.load(controller.view.active);}});
  const nav=createHistory(controller,{location,history});
  return {nav,controller,location,calls,entries,get state(){return state;},change(action){state=edit(state,action);attempts.save(controller.view.active,state);},async back(){location.href=entries[--position];await nav.pop();},async forward(){location.href=entries[++position];await nav.pop();}};
}
test('valid archive deep link loads correct puzzle and today links normalize without an archive label',async()=>{
  const h=navigationHarness('https://game.test/projects/make-10/?date=2026-09-20');await h.nav.start();assert.equal(h.state.puzzle,'0019');assert.equal(h.controller.view.active.date,archive.date);assert.equal(h.entries.length,1);
  const t=navigationHarness('https://game.test/projects/make-10/?date=2026-09-21');await t.nav.start();assert(!t.location.href.includes('date='));
});
test('malformed, duplicated, future and pre-launch deep links safely fall back without requesting an archive puzzle',async()=>{
  for(const query of ['date=wrong','date=2026-09-22','date=2026-08-31','date=2026-02-30','date=2026-09-20&date=2026-09-19']) {
    const h=navigationHarness(`https://game.test/projects/make-10/?${query}`);await h.nav.start();assert.equal(h.controller.view.active.date,daily.date);assert(h.calls.every(url=>url.endsWith('/daily')));assert(!h.location.href.includes('date='));
  }
  assert.equal(linkedDate('https://game.test/?date=2026-09-20',daily),archive.date);
});
test('History API selections, Today, Back and Forward restore independent editable attempts without reload',async()=>{
  const h=navigationHarness();await h.nav.start();h.change({type:'operator',index:0,value:'-'});
  await h.nav.selectDate(archive.date);assert(h.location.href.endsWith('?date=2026-09-20'));h.change({type:'negate-digit',index:1});
  await h.nav.today();assert(!h.location.href.includes('date='));assert.equal(h.state.operators[0],'-');
  await h.back();assert.equal(h.controller.view.active.date,archive.date);assert.equal(h.state.negative[1],true);
  await h.back();assert.equal(h.state.operators[0],'-');await h.forward();assert.equal(h.state.negative[1],true);assert.equal(h.entries.length,3);
});
test('server-confirmed restored solve overrides and clears stale local attempt and restores existing save UI state',async()=>{
  const memory=storage(),attempts=createAttempts(memory);attempts.save(daily,edited('1350'));
  const save=createSaveController({onChange(view){if(view.phase==='saved')attempts.clear(daily);}});
  const progress=createProgress({fetcher:async()=>response(saved),onSolved:data=>save.restore(data)});
  await progress.restore(daily);assert.equal(save.view.phase,'saved');assert.equal(save.view.result.methodsFound,2);assert.equal(memory.getItem(attemptKey(daily)),null);assert(progress.solvedDates.has(daily.date));
  save.reset();attempts.save(daily,initialState('1350'));assert.equal(save.view.phase,'idle');assert.deepEqual(attempts.load(daily),initialState('1350'));
});
test('acknowledged solve marks archive immediately and stale progress fetch cannot remove it',async()=>{
  let finish;const progress=createProgress({fetcher:()=>new Promise(resolve=>finish=resolve)});
  const pending=progress.refresh(daily);progress.mark(daily.date);finish(response({solvedDates:[]}));await pending;
  const cells=monthCells('2026-09',daily,daily,progress.solvedDates).filter(Boolean);assert(cells.find(c=>c.today).solved);
  progress.solvedDates.add('2026-09-22');assert(!monthCells('2026-09',daily,daily,progress.solvedDates).find(c=>c?.day===22).solved);
});
test('late status cannot replace another date or an explicitly reset attempt; errors do not invent solves',async()=>{
  let finish,restores=0;const progress=createProgress({fetcher:()=>new Promise(resolve=>finish=resolve),onSolved:()=>restores++});
  const pending=progress.restore(daily);progress.cancel();finish(response(saved));await pending;assert.equal(restores,0);
  const failed=createProgress({fetcher:async()=>{throw Error('offline');},onSolved:()=>restores++});await failed.restore(daily);assert.equal(restores,0);
});
test('late unsolved status cannot undo a newly acknowledged solve',async()=>{
  let finish;const progress=createProgress({fetcher:()=>new Promise(resolve=>finish=resolve)});
  const pending=progress.restore(daily);progress.mark(daily.date);finish(response({date:daily.date,solved:false,methodsFound:0}));await pending;
  assert(progress.solvedDates.has(daily.date));
});

function backend() {
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
  for(const name of ['0001_schedule.sql','0002_solutions.sql'])sql.exec(readFileSync(new URL(`../../make10-migrations/${name}`,import.meta.url),'utf8'));
  sql.exec("INSERT INTO make10_puzzles VALUES('basic-v1',0,'1350'),('basic-v1',1,'0019'),('basic-v1',2,'0446')");
  const db={prepare(query){return {bind(...args){return {query,args,first:async()=>sql.prepare(query).get(...args),all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>sql.prepare(query).run(...args)};}};},async batch(statements){return statements.map(s=>({results:sql.prepare(s.query).all(...s.args),meta:{changes:sql.prepare('SELECT changes() n').get().n}}));}};
  const env={make10_db:db,MAKE10_LAUNCH_DATE:'2026-09-19'},options={now:()=>Date.parse('2026-09-21T00:00:00Z'),log:()=>{}};
  const req=(path,cookie='',body)=>new Request(`https://game.test/api/make-10/${path}`,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  return {sql,env,options,async player(){return (await handlePlayer(new Request('https://game.test/api/make-10/player',{method:'POST'}),env,options)).headers.get('set-cookie').split(';')[0];},submit:(cookie,date,expression)=>handleSolutions(req('solutions',cookie,{date,expression}),env,options),get:(cookie,mode,date)=>handleProgress(req(mode+(date?`?date=${date}`:''),cookie),env,mode,options)};
}
test('status gates expressions by cookie ownership; broad progress is own solved dates only',async()=>{
  const f=backend();try {
    const a=await f.player(),b=await f.player();await f.submit(a,'2026-09-19','(1-3)*(-5)+0');await f.submit(a,'2026-09-19','-(1-3)*5+0');await f.submit(b,'2026-09-20','0+0+1+9');
    const status=await f.get(a,'status','2026-09-19');assert.equal(status.headers.get('cache-control'),'no-store');const data=await status.json();assert.equal(data.solved,true);assert.equal(data.methodsFound,2);assert.equal(data.otherMethods.length,1);assert(!JSON.stringify(data).includes(a.split('=')[1]));
    assert.deepEqual(await (await f.get(b,'status','2026-09-19')).json(),{date:'2026-09-19',solved:false,methodsFound:0});
    assert.deepEqual(await (await f.get(a,'progress')).json(),{solvedDates:['2026-09-19']});assert.deepEqual(await (await f.get(b,'progress')).json(),{solvedDates:['2026-09-20']});
  }finally{f.sql.close();}
});
test('unknown/malformed cookies get empty progress without minting identities or accepting URL identity',async()=>{
  const f=backend();try {
    const a=await f.player();await f.submit(a,'2026-09-19','(1-3)*(-5)+0');
    for(const cookie of ['', 'make10_player=bad',`make10_player=${crypto.randomUUID()}`]) {
      const r=await f.get(cookie,'progress');assert.equal(r.headers.get('set-cookie'),null);assert.deepEqual(await r.json(),{solvedDates:[]});assert.equal((await (await f.get(cookie,'status','2026-09-19')).json()).solved,false);
    }
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM make10_players').get().n,1);
  }finally{f.sql.close();}
});
test('status rejects future, pre-launch and malformed dates; progress filters future rows server-side',async()=>{
  const f=backend();try {
    const a=await f.player();await f.submit(a,'2026-09-21','0*4+4+6');f.options.now=()=>Date.parse('2026-09-20T00:00:00Z');
    assert.deepEqual(await (await f.get(a,'progress')).json(),{solvedDates:[]});
    for(const date of ['2026-09-21','2026-09-18'])assert.equal((await f.get(a,'status',date)).status,404);
    assert.equal((await f.get(a,'status','invalid')).status,400);
    assert.equal(dateAtIndex('2024-02-28',1),'2024-02-29');
  }finally{f.sql.close();}
});
