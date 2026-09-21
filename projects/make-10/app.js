import { OPERATORS, initialState, edit, canOpen, canClose, inspect, symbols, expression } from './ui/editor.mjs';
import { idle, submit, advance, resume } from './ui/playback.mjs';
import { createPuzzleController, archiveLabel } from './ui/puzzles.mjs';
import { setupArchive } from './ui/archive.mjs';
import { createSaveController, methodMessage } from './ui/save.mjs';
import { createAttempts } from './ui/attempts.mjs';
import { createHistory } from './ui/history.mjs';
import { createProgress } from './ui/progress.mjs';

const $ = id => document.getElementById(id);
const names = { '+':'Add', '-':'Minus', '*':'Multiply', '/':'Divide', '(':'Open parenthesis', ')':'Close parenthesis' };
let state = null;
let selected = null;
let erasing = false;
let playback = idle();
let timer = null;
let drag = null;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const attempts = createAttempts();

function button(label, value, className, key) {
  const el = document.createElement('button');
  el.type = 'button'; el.textContent = value; el.className = className;
  el.setAttribute('aria-label',label); el.title = label;
  if (key) el.dataset.key = key;
  return el;
}
function commit(action) {
  if (playback.phase !== 'editing') return;
  const previousUnclosed = state.pending.length;
  state = edit(state,action); selected = null; render();
  attempts.save(puzzles.view.active,state);
  const unclosed = state.pending.length;
  if (unclosed !== previousUnclosed) {
    const matched = action.type === 'close' ? 'Parenthesis matched. ' : '';
    $('announcement').textContent = matched + (unclosed ? `${unclosed} unmatched opening ${unclosed === 1 ? 'parenthesis' : 'parentheses'}.` : 'No unmatched parentheses.');
  }
}
function allowed(type,index) {
  if (erasing || playback.phase !== 'editing') return false;
  if (type === 'operator') return OPERATORS.includes(selected);
  if (type === 'open') return selected === '(' && canOpen(state,index);
  if (type === 'close') return selected === ')' && canClose(state,index);
  if (type === 'negate-digit') return selected === '-' && !state.negative[index];
  return selected === '-' && state.groups.some(g => g.id === index && !g.negative);
}
function place(type,index) {
  if (!allowed(type,index)) return;
  commit(type === 'operator' ? { type,index,value:selected } : type === 'negate-group' ? { type,id:index } : {type,index});
}
function insertion(type,index,label,content,className) {
  if (!allowed(type,index)) return null;
  const el = button(label,content,`insertion ${className}`,`${type}-${index}`);
  el.dataset.target = type; el.dataset.index = index;
  el.addEventListener('click',()=>place(type,index));
  return el;
}
function append(parent,child) { if (child) parent.append(child); }
function removable(label,content,action,extra='') {
  const el = button(label,content,`symbol ${extra} ${erasing ? 'erasable' : ''}`,`${action.type}-${action.id ?? action.index}-${content}`);
  el.tabIndex = erasing ? 0 : -1;
  el.setAttribute('aria-disabled',String(!erasing));
  el.addEventListener('click',()=>{ if (erasing) commit(action); });
  return el;
}

function renderEquation() {
  const row = $('equation');
  const pristine = state.operators.every(op=>op===null) && !state.negative.some(Boolean) && !state.groups.length && !state.pending.length;
  row.classList.toggle('pristine',pristine);
  row.replaceChildren();
  const digits = [...state.puzzle];
  digits.forEach((digit,index)=>{
    const operand = document.createElement('span'); operand.className = 'operand';
    const opens = [...state.groups,...state.pending].filter(g=>g.start===index).sort((a,b)=>(b.end??4)-(a.end??4)||a.id-b.id);
    opens.forEach((g,lane)=>{
      const wrapper = document.createElement('span'); wrapper.className = 'group-open';
      if (g.negative) wrapper.append(removable(`Remove minus from group ${g.id}`,'−',{type:'negate-group',id:g.id}));
      const signTarget = insertion('negate-group',g.id,`Negate group ${g.id}`,'−','neg-group');
      if (signTarget) { signTarget.style.setProperty('--lane',lane); wrapper.append(signTarget); }
      wrapper.append(removable(`Remove parenthesis pair ${g.id}`,'(',{type:'remove-group',id:g.id},`manual ${g.end === undefined ? 'pending' : ''}`));
      operand.append(wrapper);
    });
    const atom = document.createElement('span'); atom.className = 'atom';
    append(atom,insertion('negate-digit',index,`Negate digit ${index+1} (${digit})`,'−','neg-digit'));
    if (state.negative[index]) {
      const visual = document.createElement('span'); visual.className = 'auto'; visual.textContent = '('; atom.append(visual);
      atom.append(removable(`Remove minus from digit ${index+1}`,'−',{type:'negate-digit',index}));
    }
    const number = document.createElement('span'); number.className = 'digit'; number.textContent = digit; number.draggable = false; atom.append(number);
    if (state.negative[index]) { const visual = document.createElement('span'); visual.className = 'auto'; visual.textContent = ')'; atom.append(visual); }
    operand.append(atom);
    const closes = state.groups.filter(g=>g.end===index).sort((a,b)=>b.start-a.start||b.id-a.id);
    for (const g of closes) operand.append(removable(`Remove parenthesis pair ${g.id}`,')',{type:'remove-group',id:g.id},'manual'));
    append(operand,insertion('open',index,`Open before digit ${index+1} (${digit})`,'(','before'));
    append(operand,insertion('close',index,`Close after digit ${index+1} (${digit})`,')','after'));
    row.append(operand);
    if (index < 3) {
      const value = state.operators[index];
      const active = allowed('operator',index);
      const slot = button(`Operator ${index+1}, between ${digit} and ${digits[index+1]}${value ? `: ${symbols(value)}` : ': empty'}`,value ? symbols(value) : '',`binary ${value ? '' : 'empty'} ${active ? 'target' : ''} ${erasing && value ? 'erasable' : ''}`,`operator-${index}`);
      slot.tabIndex = active || (erasing && value) ? 0 : -1;
      slot.setAttribute('aria-disabled',String(!active && !(erasing && value)));
      slot.dataset.target='operator'; slot.dataset.index=index;
      slot.addEventListener('click',()=> erasing && value ? commit({type:'operator',index,value:null}) : place('operator',index));
      row.append(slot);
    }
  });
  const checked = inspect(state);
  if (['correct','different'].includes(checked.status)) {
    const equals = button('Evaluate expression','=','equals','equals');
    equals.addEventListener('click',evaluateAttempt); row.append(equals);
  }
  $('notice').textContent = erasing ? 'Erase mode' : checked.unclosed ? '' : checked.status === 'undefined' ? 'Cannot divide by zero' : checked.status === 'invalid' ? 'Check the expression' : '';
  // Keep contextual targets inside the viewport even beside nested edge groups.
  for (const target of row.querySelectorAll('.insertion')) {
    const rect=target.getBoundingClientRect();
    const shift=rect.left<6 ? 6-rect.left : rect.right>innerWidth-6 ? innerWidth-6-rect.right : 0;
    if (shift) target.style.transform=`translateX(${shift}px)`;
  }
}

function render() {
  const focusKey = document.activeElement?.dataset.key;
  const editing = Boolean(state) && playback.phase === 'editing';
  $('equation').hidden = !editing;
  $('evaluation').hidden = !state || editing;
  for (const tool of $('tools').children) { tool.disabled=!editing; tool.setAttribute('aria-pressed',String(selected===tool.dataset.tool)); }
  $('erase').disabled=!editing; $('erase').setAttribute('aria-pressed',String(erasing));
  $('reset').disabled = !state;
  if (!state) return;
  if (editing) {
    renderEquation();
    if (focusKey && focusKey.indexOf('tool-') !== 0) {
      const replacement = [...$('equation').querySelectorAll('[data-key]')].find(el=>el.dataset.key===focusKey && el.tabIndex>=0);
      if (replacement) replacement.focus();
      else if (selected === null) (erasing ? $('erase') : $('tools').querySelector('button')).focus();
    }
  } else {
    const final = playback.phase === 'solved' || playback.phase === 'incorrect';
    const text = playback.frames[playback.index];
    const announcement = final ? `${playback.correct ? 'Correct' : 'Incorrect'}. The result is ${text}.` : text;
    $('evaluation').textContent=text;
    $('evaluation').className=`evaluation ${playback.phase === 'solved' ? 'won' : playback.phase === 'incorrect' ? 'missed' : ''} step-in`;
    $('evaluation').setAttribute('aria-label',playback.phase === 'incorrect' ? `${announcement} Return to your expression` : announcement);
    $('evaluation').tabIndex = playback.phase === 'incorrect' ? 0 : -1;
    $('notice').textContent=''; $('announcement').textContent=announcement;
    if (!reducedMotion.matches) $('evaluation').animate([{opacity:.35,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'ease-out'});
  }
}
function schedule() {
  clearTimeout(timer);
  if (playback.phase === 'evaluating') timer=setTimeout(()=>{playback=advance(playback);render();schedule();},reducedMotion.matches ? 350 : 850);
  else if (playback.phase === 'incorrect') timer=setTimeout(returnToAttempt,1800);
  else if (playback.phase === 'solved' && saving.view.phase === 'idle') void saving.start(puzzles.view.active.date,expression(playback.attempt));
}
function evaluateAttempt() {
  if (playback.phase !== 'editing') return;
  playback=submit(state);
  if (playback.phase==='editing') return;
  selected=null; erasing=false; render(); schedule();
}
function returnToAttempt() {
  const restored=resume(playback);
  if (!restored) return;
  clearTimeout(timer); state=restored.editor; playback=restored.playback; render();
  $('equation').querySelector('.equals')?.focus();
}
$('evaluation').addEventListener('click',returnToAttempt);

function finishDrag(cancel=false) {
  if (!drag) return;
  const current=drag; drag=null; $('drag-preview').hidden=true;
  if (current.el.hasPointerCapture(current.id)) current.el.releasePointerCapture(current.id);
  if (current.moved || cancel) { selected=null; render(); }
}
function movePreview(event) {
  const preview=$('drag-preview');
  const touch=event.pointerType==='touch';
  const width=preview.offsetWidth, height=preview.offsetHeight;
  const centredX=event.clientX-width/2;
  const x=touch ? Math.max(4,Math.min(innerWidth-width-4,centredX)) : centredX;
  const y=touch ? Math.max(4,event.clientY-height-26) : event.clientY-height/2;
  preview.style.transform=`translate3d(${x}px,${y}px,0)`;
}
for (const tool of [...OPERATORS,'(',')']) {
  let suppressClick=false;
  const el=button(names[tool],symbols(tool),'tool',`tool-${tool}`); el.dataset.tool=tool;
  el.addEventListener('click',()=>{
    if (suppressClick) { suppressClick=false; return; }
    erasing=false; selected=selected===tool ? null : tool; render();
    $('announcement').textContent=selected ? `${names[tool]} selected. Choose an insertion point.` : 'Selection cancelled.';
  });
  el.addEventListener('pointerdown',event=>{
    if (event.button!==0 || playback.phase!=='editing' || drag) return;
    suppressClick=false;
    drag={el,id:event.pointerId,x:event.clientX,y:event.clientY,moved:false}; el.setPointerCapture(event.pointerId);
  });
  el.addEventListener('pointermove',event=>{
    if (!drag || drag.id!==event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>5) {
      drag.moved=true; suppressClick=true; erasing=false; selected=tool;
      $('drag-preview').textContent=symbols(tool); $('drag-preview').hidden=false; render();
    }
    if (drag.moved) movePreview(event);
  });
  el.addEventListener('pointerup',event=>{
    if (!drag || drag.id!==event.pointerId) return;
    if (drag.moved) {
      const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-target]');
      if (target) place(target.dataset.target,Number(target.dataset.index));
    }
    finishDrag();
  });
  el.addEventListener('pointercancel',()=>{suppressClick=true;finishDrag(true);});
  el.addEventListener('lostpointercapture',()=>{if(drag?.el===el)finishDrag(true);});
  $('tools').append(el);
}
$('erase').addEventListener('click',()=>{selected=null;erasing=!erasing;render();});
$('reset').addEventListener('click',()=>{
  progress.cancel(); attempts.clear(puzzles.view.active);
  saving.reset();
  clearTimeout(timer);finishDrag(true);state=initialState(state.puzzle);playback=idle();selected=null;erasing=false;render();$('announcement').textContent='Expression cleared.';
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape' && !$('calendar').open){finishDrag(true);selected=null;erasing=false;render();}
});
window.addEventListener('blur',()=>finishDrag(true));
let archive;
const puzzles = createPuzzleController({
  onPuzzle(nextState) {
    saving.reset();
    clearTimeout(timer); timer=null; finishDrag(true);
    state=attempts.load(puzzles.view.active); playback=idle(); selected=null; erasing=false;
    render();
    if (!reducedMotion.matches) $('equation').animate([{opacity:0},{opacity:1}], {duration:220});
    $('announcement').textContent = 'Puzzle loaded.';
    void progress.restore(puzzles.view.active);
  },
  onChange(view) {
    $('load-state').hidden = Boolean(view.active);
    $('load-message').textContent = view.initialError ? "Couldn't load today's puzzle" : 'Loading…';
    $('retry').hidden = !view.initialError; $('retry').disabled = view.loading;
    $('archive').disabled = !view.daily;
    const label = archiveLabel(view.active, view.daily);
    $('archive-date').textContent = label; $('archive-date').hidden = !label;
    archive?.render(view);
  },
});
const saving = createSaveController({onChange(view) {
  $('saved-result').hidden = view.phase === 'idle';
  $('save-message').textContent = view.phase==='saving' ? 'Saving…' : view.phase==='failed' ? "Couldn't save result" : view.phase==='saved' ? methodMessage(view.result.method) : '';
  $('save-retry').hidden = view.phase!=='failed';
  $('other-solutions').hidden = view.phase!=='saved';
  $('try-another').hidden = view.phase!=='saved';
  $('other-methods').hidden=true; $('other-methods').replaceChildren(); $('other-solutions').setAttribute('aria-expanded','false');
  if(view.phase==='saved') {
    attempts.clear(puzzles.view.active);progress.mark(puzzles.view.active.date);
    if(!view.result.otherMethods.length) {
      const empty=document.createElement('p');empty.textContent='No other methods discovered yet.';$('other-methods').append(empty);
    }
    for(const method of view.result.otherMethods) {
      const row=document.createElement('div'); row.className='method-row';
      const expr=document.createElement('span'); expr.textContent=method.expression;
      const count=document.createElement('small');count.textContent=`${method.count} ${method.count===1?'player':'players'}`;
      row.append(expr,count);$('other-methods').append(row);
    }
  }
}});
$('save-retry').addEventListener('click',()=>saving.retry());
$('other-solutions').addEventListener('click',()=>{
  $('other-methods').hidden=!$('other-methods').hidden;
  $('other-solutions').setAttribute('aria-expanded',String(!$('other-methods').hidden));
});
const progress = createProgress({
  onChange(){puzzles.view.solvedDates=progress.solvedDates;archive?.render(puzzles.view);},
  onSolved(data,active){
    if(puzzles.view.active!==active)return;
    clearTimeout(timer);finishDrag(true);selected=null;erasing=false;
    playback={phase:'solved',correct:true,frames:['10'],index:0};
    saving.restore(data);render();
  },
});
const navigation=createHistory(puzzles);
$('try-another').addEventListener('click',()=>{$('reset').click();attempts.save(puzzles.view.active,state);$('tools').querySelector('button').focus();});
archive = setupArchive(navigation);
$('retry').addEventListener('click', () => navigation.start().then(()=>progress.refresh(puzzles.view.daily)));
window.addEventListener('popstate',()=>void navigation.pop());
let lastCheck = 0;
function checkDaily() {
  if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 30000) return;
  lastCheck = Date.now(); void puzzles.refresh();
}
window.addEventListener('focus', checkDaily);
document.addEventListener('visibilitychange', checkDaily);
setInterval(checkDaily, 5 * 60 * 1000);
render();
void navigation.start().then(()=>{if(puzzles.view.daily)void progress.refresh(puzzles.view.daily);});
