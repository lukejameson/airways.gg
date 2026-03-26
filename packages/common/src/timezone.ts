/** Guernsey timezone - Europe/London (UTC+0 winter, UTC+1 summer/BST) */
export const GY_TZ = 'Europe/London';

/**
 * Returns the current hour (0-23) in Guernsey local time.
 * @param d - Date to get the hour for (defaults to now)
 * @returns Hour as a number (0-23)
 */
export function guernseyHour(d: Date = new Date()): number {
  return parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone: GY_TZ, hour: 'numeric', hour12: false }).format(d),
    10,
  );
}

/**
 * Returns the current date as YYYY-MM-DD in Guernsey local time.
 * @param d - Date to format (defaults to now)
 * @returns Date string in en-CA format (YYYY-MM-DD)
 */
export function guernseyDateStr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: GY_TZ }).format(d);
}

/**
 * Returns tomorrow's date string (YYYY-MM-DD) in Guernsey local time.
 * Adds 1 day in UTC first, then converts — correctly handles BST boundary.
 * @returns Tomorrow's date as YYYY-MM-DD
 */
export function guernseyTomorrowStr(): string {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return new Intl.DateTimeFormat('en-CA', { timeZone: GY_TZ }).format(tomorrow);
}

/**
 * Returns the next UTC Date at which Guernsey local time will be `hour:minute`.
 * If that time today is already past, returns tomorrow's occurrence.
 * @param hour - Target hour (0-23)
 * @param minute - Target minute (0-59)
 * @returns The next UTC Date matching the specified Guernsey local time
 */
export function nextGuernseyTime(hour: number, minute: number): Date {
  const todayGY = guernseyDateStr();
  const pad = (n: number) => String(n).padStart(2, '0');
  const candidateStr = `${todayGY}T${pad(hour)}:${pad(minute)}:00`;

  const now = new Date();
  const nowGYStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: GY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);

  // en-GB format: "DD/MM/YYYY, HH:MM:SS"
  const [datePart, timePart] = nowGYStr.split(', ');
  const [dd, mm, yyyy] = datePart.split('/');
  const gyWallNow = new Date(`${yyyy}-${mm}-${dd}T${timePart}Z`); // treat as UTC for arithmetic
  const offsetMs = now.getTime() - gyWallNow.getTime();

  const targetGYWall = new Date(`${candidateStr}Z`);
  let targetUTC = new Date(targetGYWall.getTime() + offsetMs);

  if (targetUTC <= now) {
    targetUTC = new Date(targetUTC.getTime() + 24 * 60 * 60 * 1000);
  }

  return targetUTC;
}
