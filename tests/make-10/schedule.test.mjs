import test from 'node:test';
import assert from 'node:assert/strict';
import { TIME_ZONE, sydneyDate, isValidDate, calendarDaysBetween, resolveSequenceIndex } from '../../projects/make-10/schedule/dates.mjs';

test('launch, next day, before-launch, final day and exhaustion never wrap', () => {
  const resolve = date => resolveSequenceIndex({ launchDate: '2026-01-01', date });
  assert.deepEqual(resolve('2026-01-01'), { status: 'available', index: 0 });
  assert.deepEqual(resolve('2026-01-02'), { status: 'available', index: 1 });
  assert.deepEqual(resolve('2025-12-31'), { status: 'before-launch', index: null });
  assert.deepEqual(resolve('2044-11-12'), { status: 'available', index: 6890 });
  assert.deepEqual(resolve('2044-11-13'), { status: 'exhausted', index: null });
  assert.deepEqual(resolve('2099-01-01'), { status: 'exhausted', index: null });
  assert.equal(resolveSequenceIndex({ launchDate: '2027-02-03', date: '2027-02-03' }).index, 0);
});

test('calendar arithmetic handles leap years, centuries, months and years', () => {
  for (const [start, end, days] of [
    ['2024-02-28', '2024-03-01', 2], ['2023-02-28', '2023-03-01', 1],
    ['2000-02-28', '2000-03-01', 2], ['1900-02-28', '1900-03-01', 1],
    ['2026-04-30', '2026-05-01', 1], ['2026-12-31', '2027-01-01', 1],
    ['0099-12-31', '0100-01-01', 1], ['0001-01-01', '0001-01-02', 1],
  ]) {
    assert.equal(calendarDaysBetween(start, end), days);
    assert.equal(calendarDaysBetween(end, start), -days);
  }
});

test('strict validation rejects malformed and impossible dates without normalization', () => {
  for (const date of ['2024-02-29', '2000-02-29', '0001-01-01', '9999-12-31']) assert.equal(isValidDate(date), true);
  for (const date of [undefined, null, 20260921, new Date(0), '', '2026-2-03', '26-02-03',
    '2026/02/03', ' 2026-02-03', '2026-02-03\n', '2026-02-03T00:00:00Z',
    '2026-02-30', '2025-02-29', '1900-02-29', '2026-04-31', '2026-00-01',
    '2026-13-01', '2026-01-00', '2026-01-32', '0000-01-01', '10000-01-01']) {
    assert.equal(isValidDate(date), false, String(date));
    assert.throws(() => calendarDaysBetween('2026-01-01', date), RangeError);
    assert.throws(() => resolveSequenceIndex({ launchDate: date, date: '2026-01-01' }), RangeError);
  }
  for (const count of [0, -1, 1.5, NaN, Infinity, '6891', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => resolveSequenceIndex({ launchDate: '2026-01-01', date: '2026-01-01', count }), RangeError);
  }
});

test('Sydney date extraction uses explicit instants and the permanent IANA timezone', () => {
  assert.equal(TIME_ZONE, 'Australia/Sydney');
  for (const [instant, expected] of [
    ['2026-01-01T12:59:59.999Z', '2026-01-01'], ['2026-01-01T13:00:00Z', '2026-01-02'],
    ['2026-07-01T13:59:59.999Z', '2026-07-01'], ['2026-07-01T14:00:00Z', '2026-07-02'],
    ['2026-12-31T13:00:00Z', '2027-01-01'], ['2024-02-28T13:00:00Z', '2024-02-29'],
    ['2026-04-04T15:59:59Z', '2026-04-05'], ['2026-04-04T16:00:00Z', '2026-04-05'],
    ['2026-10-03T15:59:59Z', '2026-10-04'], ['2026-10-03T16:00:00Z', '2026-10-04'],
  ]) {
    assert.equal(sydneyDate(new Date(instant)), expected);
    assert.equal(sydneyDate(Date.parse(instant)), expected);
  }
  for (const value of [null, '2026-01-01', NaN, Infinity, new Date(NaN), 1e20]) {
    assert.throws(() => sydneyDate(value), RangeError);
  }
});

test('Sydney 23-hour and 25-hour calendar days each advance the schedule exactly once', () => {
  for (const [launchDate, midnight, nextMidnight, hours] of [
    ['2026-04-05', '2026-04-04T13:00:00Z', '2026-04-05T14:00:00Z', 25],
    ['2026-10-04', '2026-10-03T14:00:00Z', '2026-10-04T13:00:00Z', 23],
  ]) {
    const start = Date.parse(midnight), end = Date.parse(nextMidnight);
    assert.equal((end - start) / 3600000, hours);
    assert.equal(resolveSequenceIndex({ launchDate, date: sydneyDate(start) }).index, 0);
    assert.equal(resolveSequenceIndex({ launchDate, date: sydneyDate(end - 1) }).index, 0);
    assert.equal(resolveSequenceIndex({ launchDate, date: sydneyDate(end) }).index, 1);
  }
});
