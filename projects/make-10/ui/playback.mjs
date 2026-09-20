import { inspect, symbols } from './editor.mjs';
import { format } from '../engine/expression.mjs';

export const idle = () => ({ phase:'editing' });
export function submit(editor) {
  const checked = inspect(editor);
  if (!['correct','different'].includes(checked.status)) return idle();
  return {
    phase:'evaluating', index:0, correct:checked.status === 'correct',
    frames:checked.steps.map(step => symbols(format(step))),
    attempt:structuredClone(editor),
  };
}
export function advance(playback) {
  if (playback.phase !== 'evaluating') return playback;
  const index = playback.index + 1;
  if (index >= playback.frames.length - 1) return { ...playback, index:playback.frames.length-1, phase:playback.correct ? 'solved' : 'incorrect' };
  return { ...playback, index };
}
export function resume(playback) {
  return playback.phase === 'incorrect' ? { playback:idle(), editor:structuredClone(playback.attempt) } : null;
}
