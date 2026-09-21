import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState as createState, edit, inspect, expression, canClose, canOpen } from '../../projects/make-10/ui/editor.mjs';
const initialState = () => createState('1350');
const operators = (ops) => ops.reduce((s,value,index) => edit(s,{type:'operator',index,value}), initialState());
const group = (s,start,end) => edit(edit(s,{type:'open',index:start}),{type:'close',index:end});

test('fixed editor: incomplete, exact result, replace, remove, reset', () => {
  assert.equal(inspect(initialState()).status,'incomplete');
  let state = operators(['+','+','+']);
  assert.equal(inspect(state).result,'9');
  assert.equal(inspect(state).status,'different');
  assert.equal(inspect(state).steps.length,4);
  state = edit(state,{type:'operator',index:1,value:'*'});
  assert.equal(inspect(state).result,'16');
  state = edit(state,{type:'operator',index:1,value:null});
  assert.equal(inspect(state).status,'incomplete');
  assert.deepEqual(edit(state,{type:'reset'}),initialState());
});
test('winning expression, digit negation, group negation and removal', () => {
  let state = group(operators(['-','*','+']),0,1);
  state = edit(state,{type:'negate-digit',index:2});
  assert.equal(expression(state),'(1 - 3) * (-5) + 0');
  assert.equal(inspect(state).status,'correct');
  assert.equal(state.groups.length,1,'automatic negative wrapper is not a manual pair');
  state = edit(state,{type:'negate-digit',index:2});
  assert.equal(inspect(state).result,'-10');
  state = edit(state,{type:'negate-group',id:1});
  assert.equal(inspect(state).status,'correct');
  assert.equal(expression(state),'-(1 - 3) * 5 + 0');
  state = edit(state,{type:'remove-group',id:1});
  assert.equal(inspect(state).result,'-14');
});
test('balanced nested brackets, close eligibility, cap and cancellation', () => {
  let state = operators(['-','*','+']);
  assert.equal(canClose(state,0),false);
  state = edit(state,{type:'open',index:0});
  state = edit(state,{type:'open',index:0});
  state = edit(state,{type:'close',index:1});
  assert.equal(canClose(state,0),false,'outer cannot end before completed inner');
  state = edit(state,{type:'close',index:2});
  assert.equal(expression(state),'((1 - 3) * 5) + 0');
  state = group(state,0,3);
  assert.equal(canOpen(state,0),false);
  assert.equal(inspect(state).status,'different');
  state = edit(state,{type:'remove-group',id:2});
  assert.equal(canOpen(state,0),true);
  state = edit(state,{type:'open',index:2});
  assert.equal(canClose(state,1),false);
  assert.equal(inspect(state).unclosed,1);
  state = edit(state,{type:'remove-group',id:4});
  assert.equal(inspect(state).status,'different');
});
test('prevent crossing intervals and allow wrapping an existing group', () => {
  let state = group(operators(['+','*','+']),1,2);
  state = edit(state,{type:'open',index:0});
  assert.equal(canClose(state,1),false);
  assert.equal(canClose(state,3),true);
  state = edit(state,{type:'close',index:3});
  assert.equal(expression(state),'(1 + (3 * 5) + 0)');
});
test('undefined arithmetic, fractional results, invalid syntax fallback', () => {
  assert.equal(inspect(operators(['+','+','/'])).status,'undefined');
  assert.equal(inspect(operators(['/','+','+'])).result,'16/3');
  const state = operators(['+','+','+']);
  state.operators[1] = '?';
  assert.equal(inspect(state).status,'invalid');
});
test('all reachable bracket edits remain syntactically valid once completed', () => {
  function walk(state, remaining) {
    if (!state.pending.length) assert.notEqual(inspect(state).status,'invalid',expression(state));
    if (!remaining) return;
    for (let i=0;i<4;i++) {
      if (canOpen(state,i)) walk(edit(state,{type:'open',index:i}),remaining-1);
      if (canClose(state,i)) walk(edit(state,{type:'close',index:i}),remaining-1);
    }
  }
  walk(operators(['-','/','*']),6);
});
