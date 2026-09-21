import { initialState, OPERATORS } from './editor.mjs';
export const attemptKey = active => `make10:v1:attempt:${active.ruleset}:${active.date}`;
export function validateAttempt(value,puzzle) {
  if(!value||value.version!==1||!value.editor)throw new Error('Invalid attempt');
  const s=value.editor;
  if(s.puzzle!==puzzle||!Array.isArray(s.operators)||s.operators.length!==3||!s.operators.every(o=>o===null||OPERATORS.includes(o))||
    !Array.isArray(s.negative)||s.negative.length!==4||!s.negative.every(n=>typeof n==='boolean')||
    !Array.isArray(s.groups)||!Array.isArray(s.pending)||s.groups.length+s.pending.length>3||!Number.isSafeInteger(s.nextId)||s.nextId<1)throw new Error('Invalid editor');
  const ids=new Set(),digit=n=>Number.isInteger(n)&&n>=0&&n<=3;
  for(const [groups,closed] of [[s.groups,true],[s.pending,false]])for(const g of groups) {
    if(!g||!Number.isSafeInteger(g.id)||g.id<1||g.id>=s.nextId||ids.has(g.id)||!digit(g.start)||typeof g.negative!=='boolean'||
      (closed?(!digit(g.end)||g.end<g.start):(g.end!==undefined||g.negative)))throw new Error('Invalid group');
    ids.add(g.id);
  }
  for(const a of s.groups)for(const b of s.groups)if(a.start<b.start&&b.start<=a.end&&a.end<b.end)throw new Error('Crossing groups');
  for(let i=0;i<s.pending.length;i++) {
    const p=s.pending[i],previous=s.pending[i-1];
    if(previous&&(p.id<=previous.id||p.start<previous.start))throw new Error('Invalid pending order');
  }
  // Copy only editor fields, never transient UI state or arbitrary stored keys.
  return {puzzle,operators:[...s.operators],negative:[...s.negative],groups:s.groups.map(({id,start,end,negative})=>({id,start,end,negative})),pending:s.pending.map(({id,start,negative})=>({id,start,negative})),nextId:s.nextId};
}
export function createAttempts(storage) {
  if(storage===undefined)try{storage=globalThis.localStorage;}catch{storage=null;}
  const clear=active=>{try{storage?.removeItem(attemptKey(active));}catch{/* Storage may be disabled. */}};
  return {
    clear,
    save(active,editor){try{storage?.setItem(attemptKey(active),JSON.stringify({version:1,editor:validateAttempt({version:1,editor},active.puzzle)}));}catch{/* Quota/privacy mode must not interrupt play. */}},
    load(active){try{const raw=storage?.getItem(attemptKey(active));if(raw){if(raw.length>4096)throw new Error('Oversized attempt');return validateAttempt(JSON.parse(raw),active.puzzle);}}catch{clear(active);}return initialState(active.puzzle);},
  };
}
