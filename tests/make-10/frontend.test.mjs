import test from 'node:test';
import assert from 'node:assert/strict';
import { createPuzzleController, validatePuzzle, availableDate, archiveLabel, monthCells, shiftMonth } from '../../projects/make-10/ui/puzzles.mjs';
import { initialState, edit, inspect } from '../../projects/make-10/ui/editor.mjs';
import { submit, advance, resume } from '../../projects/make-10/ui/playback.mjs';

const daily = { date:'2026-09-21', puzzle:'0341', ruleset:'basic-v1', launchDate:'2026-09-01' };
const archived = { date:'2026-09-20', puzzle:'0019', ruleset:'basic-v1' };
const response = data => ({ok:true, json:async()=>data});
function harness() {
  let currentDaily = daily, fail = false, state = null, resets = 0;
  const urls = [];
  const controller = createPuzzleController({
    fetcher:async(url, options)=>{ urls.push(url); assert.equal(options.cache,'no-store'); if(fail) throw new Error('private server details'); return response(url.endsWith('/daily') ? currentDaily : archived); },
    onPuzzle(next){state=next;resets++;},
  });
  return {controller, urls, get state(){return state;}, get resets(){return resets;},
    change(action){state=edit(state,action);}, setDaily(value){currentDaily=value;}, setFail(value){fail=value;}};
}

test('daily API supplies a string puzzle including leading zeroes, with no development fallback', async()=>{
  const h=harness(); await h.controller.start();
  assert.deepEqual(h.urls,['/api/make-10/daily']);
  assert.equal(h.state.puzzle,'0341'); assert.deepEqual([...h.state.puzzle],['0','3','4','1']);
  assert.throws(()=>initialState(),TypeError); assert.throws(()=>initialState(341),TypeError);
  const state=['+','+','+'].reduce((s,value,index)=>edit(s,{type:'operator',index,value}),initialState('0019'));
  assert.equal(inspect(state).status,'correct');
  let playback=submit(state); while(playback.phase==='evaluating') playback=advance(playback);
  assert.equal(playback.phase,'solved'); assert.equal(playback.frames.at(-1),'10'); assert.equal(resume(playback),null);
});

test('archive switch resets editor; same date and calendar open/close preserve the attempt', async()=>{
  const h=harness(); await h.controller.start();
  h.change({type:'operator',index:0,value:'+'}); h.change({type:'open',index:0}); h.change({type:'negate-digit',index:2});
  const attempt=structuredClone(h.state);
  h.controller.open(); h.controller.close(); assert.deepEqual(h.state,attempt); assert.equal(h.resets,1);
  h.controller.open(); await h.controller.selectDate('2026-09-20');
  assert.equal(h.urls.at(-1),'/api/make-10/puzzle?date=2026-09-20');
  assert.deepEqual(h.state,initialState('0019')); assert.equal(h.controller.view.open,false);
  assert.equal(archiveLabel(h.controller.view.active,h.controller.view.daily),'20 Sept 2026');
  h.change({type:'operator',index:0,value:'*'}); const archiveAttempt=structuredClone(h.state);
  h.controller.open(); await h.controller.selectDate('2026-09-20'); assert.deepEqual(h.state,archiveAttempt);
  h.controller.open(); await h.controller.today();
  assert.equal(h.urls.at(-1),'/api/make-10/daily'); assert.deepEqual(h.state,initialState('0341'));
  assert.equal(archiveLabel(h.controller.view.active,h.controller.view.daily),'');
  h.change({type:'operator',index:0,value:'+'}); await h.controller.today(); assert.equal(h.state.operators[0],'+');
});

test('calendar enables only server bounds, handles month navigation, and never requests future/pre-launch dates',async()=>{
  const h=harness(); await h.controller.start();
  for (const date of ['2026-08-31','2026-09-22','2099-01-01','2026-02-30']) {
    assert.equal(availableDate(date,daily),false); assert.equal(await h.controller.selectDate(date),false);
  }
  assert.equal(h.urls.length,1);
  const cells=monthCells('2026-09',daily,daily).filter(Boolean);
  assert.equal(cells.length,30); assert.equal(cells.filter(cell=>!cell.disabled).length,21);
  assert.equal(cells.find(cell=>cell.today).date,'2026-09-21'); assert.equal(cells.find(cell=>cell.selected).date,'2026-09-21');
  const midmonth={...daily,launchDate:'2026-09-05'};
  assert(monthCells('2026-09',midmonth,daily).filter(Boolean).filter(c=>c.day<5).every(c=>c.disabled));
  h.controller.open(); h.controller.navigate(-1); assert.equal(h.controller.view.month,'2026-09');
  h.controller.navigate(1); assert.equal(h.controller.view.month,'2026-09');
  assert.equal(shiftMonth('2026-01',-1),'2025-12');
  assert.equal(monthCells('2024-02',{...daily,launchDate:'2024-01-01',date:'2024-03-01'},null).filter(Boolean).length,29);
});

test('initial failure allows retry; failed archive load leaves active puzzle/editor unchanged',async()=>{
  const h=harness(); h.setFail(true); await h.controller.start();
  assert.equal(h.state,null); assert.equal(h.controller.view.initialError,true); assert.equal(h.controller.view.loading,false);
  h.setFail(false); await h.controller.start(); assert.equal(h.controller.view.initialError,false);
  h.change({type:'operator',index:1,value:'-'}); const attempt=structuredClone(h.state);
  h.controller.open(); h.setFail(true); await h.controller.selectDate('2026-09-20');
  assert.deepEqual(h.state,attempt); assert.equal(h.controller.view.active.date,daily.date); assert.equal(h.controller.view.open,true);
  assert.equal(h.controller.view.error,"Couldn't load this puzzle. Try again.");
  h.setFail(false); await h.controller.selectDate('2026-09-20'); assert.equal(h.state.puzzle,'0019');
});

test('daily rollover resets today once, preserves intentional archives, and ignores transient errors',async()=>{
  const h=harness(); await h.controller.start(); h.change({type:'operator',index:0,value:'+'});
  await h.controller.refresh(); assert.equal(h.resets,1); assert.equal(h.state.operators[0],'+');
  h.setFail(true); await h.controller.refresh(); assert.equal(h.resets,1); h.setFail(false);
  h.setDaily({...daily,date:'2026-09-22',puzzle:'0028'}); await h.controller.refresh();
  assert.deepEqual(h.state,initialState('0028')); assert.equal(h.resets,2);
  await h.controller.selectDate('2026-09-20'); h.change({type:'operator',index:0,value:'-'});
  const attempt=structuredClone(h.state);
  h.setDaily({...daily,date:'2026-09-23',puzzle:'0037'}); await h.controller.refresh();
  assert.deepEqual(h.state,attempt); assert.equal(h.controller.view.active.date,'2026-09-20');
  assert.equal(h.controller.view.daily.date,'2026-09-23');
});

test('daily launchDate and response identity must validate before activating a puzzle',async()=>{
  for(const value of [undefined,'2026-9-01','2026-02-30','2026-09-22']) assert.throws(()=>validatePuzzle({...daily,launchDate:value},true));
  for(const value of [341,'341','0341\n','0x41']) assert.throws(()=>validatePuzzle({...daily,puzzle:value},true));
  assert.throws(()=>validatePuzzle({...daily,ruleset:'other'},true));
  const h=harness(); h.setDaily({...daily,launchDate:'invalid'}); await h.controller.start();
  assert.equal(h.controller.view.initialError,true); assert.equal(h.state,null);
  const c=createPuzzleController({fetcher:async url=>response(url.endsWith('/daily')?daily:{...archived,date:'2026-09-19'})});
  await c.start(); await c.selectDate('2026-09-20'); assert.equal(c.view.active.date,daily.date); assert(c.view.error);
});

test('late archive responses cannot override Today or a cancelled selection',async()=>{
  let deliver;
  const c=createPuzzleController({fetcher:url=>url.endsWith('/daily')?Promise.resolve(response(daily)):new Promise(resolve=>{deliver=resolve;})});
  await c.start(); c.open(); const pending=c.selectDate('2026-09-20');
  await c.today(); deliver(response(archived)); await pending; assert.equal(c.view.active.date,daily.date);
  c.open(); const cancelled=c.selectDate('2026-09-20'); c.close(); deliver(response(archived)); await cancelled;
  assert.equal(c.view.active.date,daily.date); assert.equal(c.view.busy,false);
});
