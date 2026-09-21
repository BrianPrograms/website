import { RULESET, isValidDate, sydneyDate, resolveSequenceIndex } from '../../projects/make-10/schedule/dates.mjs';

const json = (body, status = 200, extra = {}) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', ...extra },
});
const unavailable = () => json({ error: 'not_available' }, 404);

// Clock injection is only a function argument for tests, never request/config input.
export async function handlePuzzleRequest(request, env, mode, { now = Date.now, log = console.error } = {}) {
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
  const launchDate = env.MAKE10_LAUNCH_DATE;
  if (!isValidDate(launchDate)) return json({ error: 'launch_date_not_configured' }, 503);
  try {
    const today = sydneyDate(now());
    let date = today;
    if (mode === 'archive') {
      const values = new URL(request.url).searchParams.getAll('date');
      if (values.length !== 1 || !isValidDate(values[0])) return json({ error: 'invalid_date' }, 400);
      date = values[0];
    }
    // Strict ISO calendar strings sort chronologically. Reject before touching D1.
    if (date > today) return unavailable();
    const resolved = resolveSequenceIndex({ launchDate, date });
    if (resolved.status !== 'available') return unavailable();
    const row = await env.make10_db.prepare(
      'SELECT puzzle_code FROM make10_puzzles WHERE ruleset = ? AND sequence_index = ? LIMIT 1'
    ).bind(RULESET, resolved.index).first();
    if (!row || typeof row.puzzle_code !== 'string' || row.puzzle_code.length !== 4 || !/^\d{4}$/.test(row.puzzle_code)) {
      log('Make 10: scheduled puzzle row missing or invalid', { date, index: resolved.index });
      return json({ error: 'puzzle_unavailable' }, 503);
    }
    return json({ date, puzzle: row.puzzle_code, ruleset: RULESET, ...(mode === 'daily' ? { launchDate } : {}) });
  } catch (error) {
    log('Make 10: database/request failure', error);
    return json({ error: 'service_unavailable' }, 503);
  }
}
