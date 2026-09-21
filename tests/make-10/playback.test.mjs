import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState as createState, edit } from '../../projects/make-10/ui/editor.mjs';
const initialState = () => createState('1350');
import { idle, submit, advance, resume } from '../../projects/make-10/ui/playback.mjs';
const ops=values=>values.reduce((state,value,index)=>edit(state,{type:'operator',index,value}),initialState());
test('submission rejects incomplete and undefined expressions',()=>{
  assert.deepEqual(submit(initialState()),idle());
  assert.deepEqual(submit(ops(['+','+','/'])),idle());
  assert.deepEqual(submit(edit(ops(['+','+','+']),{type:'open',index:0})),idle());
});
test('incorrect playback ends with exact result and restores original attempt',()=>{
  const state=ops(['+','+','+']);
  let p=submit(state);
  assert.deepEqual(p.frames,['1 + 3 + 5 + 0','4 + 5 + 0','9 + 0','9']);
  assert.equal(resume(p),null);
  while(p.phase==='evaluating')p=advance(p);
  assert.equal(p.phase,'incorrect');
  assert.deepEqual(resume(p),{playback:idle(),editor:state});
  assert.notEqual(resume(p).editor,state);
  assert.deepEqual(advance(p),p);
});
test('winning playback preserves signs and brackets and stays solved',()=>{
  let state=ops(['-','*','+']);
  state=edit(edit(state,{type:'open',index:0}),{type:'close',index:1});
  state=edit(state,{type:'negate-digit',index:2});
  const original=structuredClone(state);
  let p=submit(state);
  assert.deepEqual(p.frames,['(1 − 3) × (−5) + 0','(−2) × (−5) + 0','10 + 0','10']);
  while(p.phase==='evaluating')p=advance(p);
  assert.equal(p.phase,'solved');
  assert.equal(resume(p),null);
  assert.deepEqual(state,original);
});
