export const TIME_ZONE = 'Australia/Sydney';
export const RULESET = 'basic-v1';
export const PUZZLE_COUNT = 6891;
const DAY_MS = 86400000;
const formatter = new Intl.DateTimeFormat('en-AU', {
  timeZone: TIME_ZONE, calendar: 'gregory', numberingSystem: 'latn',
  year: 'numeric', month: '2-digit', day: '2-digit',
});

// UTC is only a calendar-coordinate system here, not the production timezone.
function calendarDay(value) {
  if (typeof value !== 'string' || value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day); // Date.UTC treats years 0–99 specially.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.getTime() / DAY_MS;
}

export function isValidDate(value) { return calendarDay(value) !== null; }

export function sydneyDate(instant = Date.now()) {
  const milliseconds = instant instanceof Date ? instant.getTime() : instant;
  if (typeof milliseconds !== 'number' || !Number.isFinite(milliseconds)) throw new RangeError('Invalid timestamp');
  const parts = Object.fromEntries(formatter.formatToParts(new Date(milliseconds)).map(p => [p.type, p.value]));
  const value = `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`;
  if (!isValidDate(value)) throw new RangeError('Sydney date must be in years 0001–9999');
  return value;
}

export function calendarDaysBetween(launchDate, date) {
  const start = calendarDay(launchDate), end = calendarDay(date);
  if (start === null || end === null) throw new RangeError('Expected valid YYYY-MM-DD calendar dates (0001–9999)');
  return end - start;
}

export function resolveSequenceIndex({ launchDate, date, count = PUZZLE_COUNT }) {
  if (!Number.isSafeInteger(count) || count < 1) throw new RangeError('Sequence count must be a positive safe integer');
  const index = calendarDaysBetween(launchDate, date);
  if (index < 0) return { status: 'before-launch', index: null };
  if (index >= count) return { status: 'exhausted', index: null };
  return { status: 'available', index };
}
