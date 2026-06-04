/**
 * Timezone utilities — always uses Guernsey local time (Europe/London).
 * Uses native Intl.DateTimeFormat instead of Luxon because Luxon's
 * DateTime.fromFormat with zone parameter fails to resolve Europe/London
 * in Alpine Docker containers (both with and without tzdata).
 *
 * The native Intl API is verified to work correctly in all containers
 * (the web display layer uses it in formatGuernseyTime).
 */

export const GY_TZ = 'Europe/London';

/** Cache UTC offsets per date string to avoid redundant Intl calls. */
const offsetCache = new Map<string, number>();

/**
 * Get the UTC offset (in hours) for Europe/London on a given date string.
 * e.g. "2026-06-03" (BST) → 1, "2026-01-15" (GMT) → 0.
 *
 * Uses Intl.DateTimeFormat.formatToParts which queries the IANA timezone
 * through Node.js's built-in ICU data. This is the same API used by the
 * web app's formatGuernseyTime, verified to work in production.
 */
function getUtcOffset(dateStr: string): number {
  const cached = offsetCache.get(dateStr);
  if (cached !== undefined) return cached;

  const [y, m, d] = dateStr.split('-').map(Number);
  // Use noon UTC as reference to avoid DST ambiguity at midnight
  const noon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: GY_TZ,
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(noon);

  const localHour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '12', 10);
  const offset = localHour - 12; // noon UTC → local hour = offset (1 for BST, 0 for GMT)

  offsetCache.set(dateStr, offset);
  return offset;
}

/**
 * Convert a Guernsey local time (HH:MM on dateStr) to a UTC Date.
 *
 * During BST (UTC+1): localToUtc('2026-06-03', 9, 15) = 2026-06-03T08:15:00.000Z
 * During GMT (UTC+0): localToUtc('2026-01-15', 9, 15) = 2026-01-15T09:15:00.000Z
 */
export function localToUtc(dateStr: string, hh: number, mm: number): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const offset = getUtcOffset(dateStr);
  return new Date(Date.UTC(y, m - 1, d, hh - offset, mm, 0));
}

/**
 * Today's date as YYYY-MM-DD in Guernsey local time.
 */
export function guernseyTodayStr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: GY_TZ }).format(d);
}

/**
 * Tomorrow's date as YYYY-MM-DD in Guernsey local time.
 */
export function guernseyTomorrowStr(d: Date = new Date()): string {
  const today = guernseyTodayStr(d);
  const [y, m, day] = today.split('-').map(Number);
  // Advance by adding a day at noon UTC to avoid DST boundary issues
  const date = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().split('T')[0];
}

/**
 * Current hour (0–23) in Guernsey local time.
 */
export function guernseyHour(d: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: GY_TZ,
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(d);
  return parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
}

/**
 * Returns a UTC Date for the next occurrence of the given local time.
 * If the time is still in the future today, returns today's occurrence.
 * If it has already passed, returns tomorrow's occurrence.
 *
 * Example on June 15 (BST): nextGuernseyTime(15, 0, 13:00Z) = 15:00 BST = 14:00Z
 */
export function nextGuernseyTime(hour: number, minute: number, from: Date = new Date()): Date {
  const todayGY = guernseyTodayStr(from);
  const candidate = localToUtc(todayGY, hour, minute);

  if (candidate > from) return candidate;

  // Advance to next day
  const [y, m, d] = todayGY.split('-').map(Number);
  const nextDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const nextGY = nextDate.toISOString().split('T')[0];
  return localToUtc(nextGY, hour, minute);
}
