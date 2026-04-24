import { DateTime } from 'luxon';

export const GY_TZ = 'Europe/London';

export function localToUtc(dateStr: string, hh: number, mm: number): Date {
  return DateTime.fromFormat(
    `${dateStr} ${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`,
    'yyyy-MM-dd HH:mm',
    { zone: GY_TZ }
  ).toUTC().toJSDate();
}

export function guernseyTodayStr(d: Date = new Date()): string {
  return DateTime.fromJSDate(d, { zone: GY_TZ }).toFormat('yyyy-MM-dd');
}

export function guernseyTomorrowStr(d: Date = new Date()): string {
  return DateTime.fromJSDate(d, { zone: GY_TZ }).plus({ days: 1 }).toFormat('yyyy-MM-dd');
}

export function guernseyHour(d: Date = new Date()): number {
  return DateTime.fromJSDate(d, { zone: GY_TZ }).hour;
}

export function nextGuernseyTime(hour: number, minute: number, from: Date = new Date()): Date {
  const todayGY = guernseyTodayStr(from);
  const today = DateTime.fromFormat(
    `${todayGY} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
    'yyyy-MM-dd HH:mm',
    { zone: GY_TZ }
  );
  if (today.toJSDate() <= from) {
    return today.plus({ days: 1 }).toUTC().toJSDate();
  }
  return today.toUTC().toJSDate();
}
