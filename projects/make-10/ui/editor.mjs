import { parse, evaluate, reductionSteps } from '../engine/expression.mjs';
import { equal, rational, text } from '../engine/rational.mjs';

export const DIGITS = Object.freeze([1, 3, 5, 0]);
export const OPERATORS = Object.freeze(['+', '-', '*', '/']);
export const symbols = source => source.replaceAll('*', '×').replaceAll('/', '÷').replaceAll('-', '−');
export const initialState = () => ({ operators: [null, null, null], negative: [false, false, false, false], groups: [], pending: [], nextId: 1 });
const crosses = (a, b) => (a.start < b.start && b.start <= a.end && a.end < b.end) ||
  (b.start < a.start && a.start <= b.end && b.end < a.end);

export function canOpen(state, index) {
  return Number.isInteger(index) && index >= 0 && index < 4 && state.groups.length + state.pending.length < 3 &&
    (!state.pending.length || index >= state.pending.at(-1).start);
}
export function canClose(state, index) {
  const pending = state.pending.at(-1);
  if (!pending || !Number.isInteger(index) || index < pending.start || index > 3) return false;
  const group = { ...pending, end: index };
  // An older pending opening must contain any newer, completed group.
  return state.groups.every(g => !crosses(group, g) &&
    !(g.id > pending.id && g.start >= pending.start && g.end > index));
}

// Immutable editing operations; all mathematical interpretation belongs to the engine.
export function edit(state, action) {
  const next = structuredClone(state);
  const index = action.index;
  switch (action.type) {
    case 'reset': return initialState();
    case 'operator':
      if (Number.isInteger(index) && index >= 0 && index < 3 && (action.value === null || OPERATORS.includes(action.value))) next.operators[index] = action.value;
      break;
    case 'negate-digit':
      if (Number.isInteger(index) && index >= 0 && index < 4) next.negative[index] = !next.negative[index];
      break;
    case 'open':
      if (canOpen(state, index)) next.pending.push({ id: next.nextId++, start: index, negative: false });
      break;
    case 'close':
      if (canClose(state, index)) next.groups.push({ ...next.pending.pop(), end: index });
      break;
    case 'remove-group':
      next.groups = next.groups.filter(g => g.id !== action.id);
      next.pending = next.pending.filter(g => g.id !== action.id);
      break;
    case 'negate-group': {
      const group = next.groups.find(g => g.id === action.id);
      if (group) group.negative = !group.negative;
      break;
    }
  }
  return next;
}

export function expression(state) {
  return DIGITS.map((d, i) => {
    const opens = state.groups.filter(g => g.start === i).sort((a, b) => b.end - a.end || a.id - b.id);
    const closes = state.groups.filter(g => g.end === i);
    return opens.map(g => g.negative ? '-(' : '(').join('') +
      (state.negative[i] ? `(-${d})` : d) + ')'.repeat(closes.length) +
      (i < 3 ? ` ${state.operators[i] ?? '□'} ` : '');
  }).join('');
}

export function inspect(state) {
  const missing = state.operators.filter(op => op === null).length;
  const unclosed = state.pending.length;
  const source = expression(state);
  if (missing || unclosed) return { status: 'incomplete', source, missing, unclosed };
  try {
    const ast = parse(source, '1350');
    const value = evaluate(ast);
    if (value === null) return { status: 'undefined', source };
    return { status: equal(value, rational(10)) ? 'correct' : 'different', source, result: text(value), steps: reductionSteps(ast) };
  } catch {
    return { status: 'invalid', source };
  }
}
