import { describe, it, expect } from 'vitest';
import {
  GY_TZ,
  localToUtc,
  guernseyTodayStr,
  guernseyTomorrowStr,
  guernseyHour,
  nextGuernseyTime,
  checkTimezoneOffset,
} from './time';
import { DateTime } from 'luxon';

// ── localToUtc ─────────────────────────────────────────────────────────────

describe('localToUtc', () => {
  it('converts GMT winter date correctly (local == UTC)', () => {
    // January 15, 2026 — firmly in GMT
    const result = localToUtc('2026-01-15', 10, 30);
    expect(result.toISOString()).toBe('2026-01-15T10:30:00.000Z');
  });

  it('converts BST summer date correctly (local = UTC+1)', () => {
    // June 15, 2026 — firmly in BST
    const result = localToUtc('2026-06-15', 10, 30);
    expect(result.toISOString()).toBe('2026-06-15T09:30:00.000Z');
  });

  it('converts day after fall-back (Oct 26) correctly as GMT', () => {
    // Clocks go back on October 25, 2026. October 26 is GMT.
    const result = localToUtc('2026-10-26', 10, 30);
    expect(result.toISOString()).toBe('2026-10-26T10:30:00.000Z');
  });

  it('converts day after spring-forward (Mar 30) correctly as BST', () => {
    // Clocks go forward on March 29, 2026. March 30 is BST.
    const result = localToUtc('2026-03-30', 10, 30);
    expect(result.toISOString()).toBe('2026-03-30T09:30:00.000Z');
  });

  it('handles midnight correctly in winter', () => {
    const result = localToUtc('2026-01-15', 0, 0);
    expect(result.toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });

  it('handles midnight correctly in summer', () => {
    // Midnight BST on June 15 = 23:00 UTC on June 14
    const result = localToUtc('2026-06-15', 0, 0);
    expect(result.toISOString()).toBe('2026-06-14T23:00:00.000Z');
  });

  it('round-trips through formatGuernseyTime (UTC → local display → UTC)', () => {
    // Store a BST time as UTC, then verify the local display matches the original
    const utc = localToUtc('2026-06-15', 14, 45);
    // 14:45 BST → 13:45 UTC
    expect(utc.toISOString()).toBe('2026-06-15T13:45:00.000Z');

    // Display back in Guernsey local — should be 14:45
    const displayed = DateTime.fromJSDate(utc, { zone: 'UTC' })
      .setZone(GY_TZ)
      .toFormat('HH:mm');
    expect(displayed).toBe('14:45');
  });

  it('round-trips through formatGuernseyTime (GMT winter)', () => {
    const utc = localToUtc('2026-01-15', 14, 45);
    expect(utc.toISOString()).toBe('2026-01-15T14:45:00.000Z');

    const displayed = DateTime.fromJSDate(utc, { zone: 'UTC' })
      .setZone(GY_TZ)
      .toFormat('HH:mm');
    expect(displayed).toBe('14:45');
  });
});

// ── guernseyTodayStr / guernseyTomorrowStr ─────────────────────────────────

describe('guernseyTodayStr', () => {
  it('returns YYYY-MM-DD format', () => {
    const dateStr = guernseyTodayStr();
    expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns Guernsey local date for a winter UTC moment', () => {
    // Jan 15, 2026 23:00 UTC = Jan 15, 2026 23:00 GMT (same day)
    const d = new Date('2026-01-15T23:00:00Z');
    expect(guernseyTodayStr(d)).toBe('2026-01-15');
  });

  it('returns correct Guernsey local date for a summer midnight-UTC moment', () => {
    // June 15, 2026 23:30 UTC = June 16, 2026 00:30 BST (next day in Guernsey)
    const d = new Date('2026-06-15T23:30:00Z');
    expect(guernseyTodayStr(d)).toBe('2026-06-16');
  });
});

describe('guernseyTomorrowStr', () => {
  it('returns the day after guernseyTodayStr', () => {
    const d = new Date('2026-01-15T12:00:00Z');
    expect(guernseyTomorrowStr(d)).toBe('2026-01-16');
  });

  it('handles month boundary', () => {
    const d = new Date('2026-01-31T12:00:00Z');
    expect(guernseyTomorrowStr(d)).toBe('2026-02-01');
  });
});

// ── guernseyHour ────────────────────────────────────────────────────────────

describe('guernseyHour', () => {
  it('returns Guernsey local hour (GMT)', () => {
    // 12:00 UTC = 12:00 GMT
    expect(guernseyHour(new Date('2026-01-15T12:00:00Z'))).toBe(12);
  });

  it('returns Guernsey local hour (BST)', () => {
    // 12:00 UTC = 13:00 BST
    expect(guernseyHour(new Date('2026-06-15T12:00:00Z'))).toBe(13);
  });
});

// ── nextGuernseyTime ────────────────────────────────────────────────────────

describe('nextGuernseyTime', () => {
  it('returns today at the given time when it is still in the future', () => {
    // 15:00 BST = 14:00 UTC on June 15
    const from = new Date('2026-06-15T12:00:00Z'); // 13:00 BST
    const result = nextGuernseyTime(15, 0, from);
    expect(result.toISOString()).toBe('2026-06-15T14:00:00.000Z');
  });

  it('returns tomorrow at the given time when it has already passed today', () => {
    // 10:00 BST = 09:00 UTC on June 15
    const from = new Date('2026-06-15T10:00:00Z'); // 11:00 BST — past 10:00
    const result = nextGuernseyTime(10, 0, from);
    expect(result.toISOString()).toBe('2026-06-16T09:00:00.000Z');
  });

  it('handles midnight boundary in winter', () => {
    // 23:30 GMT on Jan 15 — nextGuernseyTime 00:15 should be Jan 16
    const from = new Date('2026-01-15T23:30:00Z');
    const result = nextGuernseyTime(0, 15, from);
    expect(result.toISOString()).toBe('2026-01-16T00:15:00.000Z');
  });

  it('handles midnight boundary in summer', () => {
    // 23:30 BST = 22:30 UTC on June 15 — nextGuernseyTime 00:15 should be June 16 00:15 BST
    const from = new Date('2026-06-15T22:30:00Z'); // 23:30 BST
    const result = nextGuernseyTime(0, 15, from);
    // 00:15 BST on June 16 = 23:15 UTC on June 15
    expect(result.toISOString()).toBe('2026-06-15T23:15:00.000Z');
  });
});

// ── Cross-boundary: BST ↔ GMT transitions ───────────────────────────────────

describe('DST boundary — spring forward (GMT → BST)', () => {
  // 2026: clocks go forward Sunday March 29 at 01:00 GMT → 02:00 BST
  // Before: 00:30 GMT = 00:30 UTC. After: 02:30 BST = 01:30 UTC.

  it('converts correctly on the day before spring-forward (still GMT)', () => {
    // March 28, 2026 — still GMT
    const result = localToUtc('2026-03-28', 12, 0);
    expect(result.toISOString()).toBe('2026-03-28T12:00:00.000Z');
  });

  it('converts correctly on the day after spring-forward (now BST)', () => {
    // March 30, 2026 — now BST
    const result = localToUtc('2026-03-30', 12, 0);
    expect(result.toISOString()).toBe('2026-03-30T11:00:00.000Z');
  });
});

describe('DST boundary — fall back (BST → GMT)', () => {
  // 2026: clocks go back Sunday October 25 at 02:00 BST → 01:00 GMT
  // Before: 01:30 BST = 00:30 UTC. After: 01:30 GMT = 01:30 UTC.

  it('converts correctly on the day before fall-back (still BST)', () => {
    // October 24, 2026 — still BST
    const result = localToUtc('2026-10-24', 12, 0);
    expect(result.toISOString()).toBe('2026-10-24T11:00:00.000Z');
  });

  it('converts correctly on the day after fall-back (now GMT)', () => {
    // October 26, 2026 — now GMT
    const result = localToUtc('2026-10-26', 12, 0);
    expect(result.toISOString()).toBe('2026-10-26T12:00:00.000Z');
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('localToUtc handles single-digit hours and minutes', () => {
    const result = localToUtc('2026-06-15', 9, 5);
    expect(result.toISOString()).toBe('2026-06-15T08:05:00.000Z');
  });

  it('localToUtc handles 23:59 correctly', () => {
    const result = localToUtc('2026-01-15', 23, 59);
    expect(result.toISOString()).toBe('2026-01-15T23:59:00.000Z');
  });

  it('guernseyHour at exactly midnight UTC gives correct hour', () => {
    // 00:00 UTC summer = 01:00 BST
    expect(guernseyHour(new Date('2026-06-15T00:00:00Z'))).toBe(1);
    // 00:00 UTC winter = 00:00 GMT
    expect(guernseyHour(new Date('2026-01-15T00:00:00Z'))).toBe(0);
  });
});

// ── Regression: production bug (2026-06-03 GR634) ──────────────────────────

describe('regression: BST scheduled times must store as true UTC', () => {
  it('GR634 scenario: 09:15 BST on 2026-06-03 stores as 08:15Z', () => {
    // This was the exact bug: scheduled departure showed 10:15 instead of 09:15.
    // If localToUtc incorrectly treats zone as UTC, it returns 09:15Z instead of 08:15Z.
    const result = localToUtc('2026-06-03', 9, 15);
    expect(result.toISOString()).toBe('2026-06-03T08:15:00.000Z');
  });

  it('15:45 BST stores as 14:45Z (afternoon BST window)', () => {
    const result = localToUtc('2026-06-03', 15, 45);
    expect(result.toISOString()).toBe('2026-06-03T14:45:00.000Z');
  });

  it('winter (GMT) times are unchanged by the fix', () => {
    // Ensure the tzdata fix doesn't break GMT winter dates
    const result = localToUtc('2026-01-15', 10, 30);
    expect(result.toISOString()).toBe('2026-01-15T10:30:00.000Z');
  });
});

// ── Round-trip: scraper write → web display ────────────────────────────────

describe('round-trip: localToUtc → display', () => {
  it('BST time round-trips through UTC storage and back to local display', () => {
    // Simulate the full pipeline:
    //   1. Scraper calls localToUtc('2026-06-03', 9, 15) → stores UTC in DB
    //   2. DB stores as timestamp without tz (value: '2026-06-03 08:15:00')
    //   3. Web reads via pg type parser (appends 'Z'): 2026-06-03T08:15:00.000Z
    //   4. formatGuernseyTime(new Date('2026-06-03T08:15:00.000Z')) → '09:15'

    const utc = localToUtc('2026-06-03', 9, 15);
    // Step 3: simulate what the pg type parser does (appends 'Z')
    const dbTimestamp = utc.toISOString(); // 2026-06-03T08:15:00.000Z
    const readBack = new Date(dbTimestamp);

    // Step 4: simulate formatGuernseyTime using native Intl (same API as web app)
    const displayed = readBack.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: GY_TZ,
    });
    expect(displayed).toBe('09:15');
  });

  it('round-trip produces correct display for GMT winter date', () => {
    const utc = localToUtc('2026-01-15', 14, 45);
    const readBack = new Date(utc.toISOString());
    const displayed = readBack.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: GY_TZ,
    });
    expect(displayed).toBe('14:45');
  });

  it('native Intl and Luxon produce the same display for BST', () => {
    // Verify the two code paths agree — this is the asymmetry that caused the bug.
    // If they differ, one of them has broken timezone data.
    const utc = localToUtc('2026-06-03', 9, 15);

    const nativeDisplay = new Date(utc.toISOString()).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: GY_TZ,
    });

    const luxonDisplay = DateTime.fromJSDate(utc, { zone: 'UTC' })
      .setZone(GY_TZ)
      .toFormat('HH:mm');

    expect(nativeDisplay).toBe(luxonDisplay);
  });
});

// ── checkTimezoneOffset ────────────────────────────────────────────────────

describe('checkTimezoneOffset', () => {
  it('passes during BST (June)', () => {
    const result = checkTimezoneOffset();
    // On a BST date the BST test must pass
    expect(result.detectedOffset).toBe(1);
    expect(result.ok).toBe(true);
    expect(result.details).toContain('OK');
  });
});
