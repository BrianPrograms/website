import { isValidDate } from '../schedule/dates.mjs';
import { initialState } from './editor.mjs';

export function validatePuzzle(data, daily = false) {
  if (!data || data.ruleset !== 'basic-v1' || !isValidDate(data.date) ||
      typeof data.puzzle !== 'string' || data.puzzle.length !== 4 || !/^\d{4}$/.test(data.puzzle) ||
      (daily && (!isValidDate(data.launchDate) || data.launchDate > data.date))) throw new Error('Invalid puzzle response');
  return { date: data.date, puzzle: data.puzzle, ruleset: data.ruleset, ...(daily ? { launchDate: data.launchDate } : {}) };
}
export const availableDate = (date, daily) => Boolean(daily && isValidDate(date) && date >= daily.launchDate && date <= daily.date);
export const archiveLabel = (active, daily) => active && daily && active.date !== daily.date ? formatDate(active.date) : '';
const dateObject = date => new Date(`${date}T12:00:00Z`);
export const formatDate = date => new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(dateObject(date));
export const monthTitle = month => new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(dateObject(`${month}-01`));
export function shiftMonth(month, delta) {
  const date = dateObject(`${month}-01`); date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}
export function monthCells(month, daily, active, solvedDates = new Set()) {
  const first = dateObject(`${month}-01`), cells = Array((first.getUTCDay() + 6) % 7).fill(null);
  const date = new Date(first);
  while (date.getUTCMonth() === first.getUTCMonth()) {
    const value = date.toISOString().slice(0, 10);
    cells.push({ date: value, day: date.getUTCDate(), disabled: !availableDate(value, daily), today: value === daily?.date, selected: value === active?.date, solved: availableDate(value,daily) && solvedDates.has(value) });
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return cells;
}

// The API supplies all bounds and puzzle identity. No sequence data/index calculation.
export function createPuzzleController({ fetcher = fetch, onPuzzle = () => {}, onChange = () => {} } = {}) {
  const view = { daily: null, active: null, loading: false, initialError: false, open: false, month: null, busy: false, error: '' };
  let selection = 0, refreshPending = false;
  const emit = () => onChange(view);
  const activate = data => {
    const changed = view.active?.date !== data.date || view.active?.puzzle !== data.puzzle;
    view.active = data;
    if (changed) onPuzzle(initialState(data.puzzle));
  };
  async function request(url, daily = false) {
    const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 15000);
    try {
      const response = await fetcher(url, { cache: 'no-store', signal: abort.signal });
      if (!response.ok) throw new Error('Puzzle unavailable');
      return validatePuzzle(await response.json(), daily);
    } finally { clearTimeout(timeout); }
  }
  async function choose(date) {
    if (date !== null && !availableDate(date, view.daily)) return false;
    const daily = date === null || date === view.daily?.date;
    if (!daily && date === view.active?.date) { close(); return true; }
    const ticket = ++selection;
    view.loading = !view.active; view.initialError = false; view.busy = true; view.error = ''; emit();
    try {
      const data = await request(daily ? '/api/make-10/daily' : `/api/make-10/puzzle?date=${date}`, daily);
      if (ticket !== selection) return false;
      if (!daily && (data.date !== date || !availableDate(data.date, view.daily))) throw new Error('Wrong archive date');
      if (daily) view.daily = data;
      activate(data); view.open = false; view.month = data.date.slice(0, 7);
      return true;
    } catch {
      if (ticket === selection) {
        if (!view.active) view.initialError = true;
        else view.error = "Couldn't load this puzzle. Try again.";
      }
      return false;
    } finally { if (ticket === selection) { view.loading = false; view.busy = false; emit(); } }
  }
  function close() { selection++; view.open = false; view.busy = false; view.error = ''; emit(); }
  return {
    view, start: () => choose(null), today: () => choose(null), selectDate: choose,
    open() { if (!view.daily) return; view.month = view.active.date.slice(0, 7); view.open = true; view.error = ''; emit(); }, close,
    navigate(delta) {
      const next = shiftMonth(view.month, delta);
      if (next < view.daily.launchDate.slice(0, 7) || next > view.daily.date.slice(0, 7)) return;
      view.month = next; emit();
    },
    async refresh() {
      if (!view.daily || view.busy || refreshPending) return;
      const ticket = selection, active = view.active, wasToday = active?.date === view.daily.date;
      refreshPending = true;
      try {
        const data = await request('/api/make-10/daily', true);
        if (ticket !== selection) return;
        view.daily = data;
        if (wasToday && view.active === active) activate(data);
        emit();
      } catch { /* A background network error must not disrupt an active game. */ }
      finally { refreshPending = false; }
    },
  };
}
