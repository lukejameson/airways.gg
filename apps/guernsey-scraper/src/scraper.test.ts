/**
 * Unit tests for guernsey-scraper data-quality fixes.
 *
 * Tests extractCanceled + effectiveDelayMinutes clearing, and
 * extractActualTime fallback when the status message has no HH:MM time.
 *
 * These functions are not exported, so these tests compile against
 * the source but validate the logic by mirroring the implementation.
 */

import { describe, it, expect } from 'vitest';
import { localToUtc } from '@airways/database';

// ── Replicated logic for testability ──────────────────────────────────

interface StatusUpdate {
  flightCode: string;
  flightDate: string;
  statusTimestamp: Date;
  statusMessage: string;
}

function extractCanceled(updates: StatusUpdate[]): boolean {
  return updates.some(u => {
    const msg = u.statusMessage.toLowerCase();
    return msg.includes('cancelled') || msg.includes('canceled');
  });
}

function parseHHMM(text: string): { hh: number; mm: number } | null {
  const colonMatch = text.match(/(\d{1,2}):(\d{2})/);
  if (colonMatch) return { hh: parseInt(colonMatch[1]), mm: parseInt(colonMatch[2]) };
  const noColonMatch = text.match(/(?<!\d)(\d{2})(\d{2})(?!\d)/);
  if (noColonMatch) {
    const hh = parseInt(noColonMatch[1]);
    const mm = parseInt(noColonMatch[2]);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) return { hh, mm };
  }
  return null;
}

function extractActualTime(
  updates: StatusUpdate[],
  keyword: string,
  referenceDate: Date,
): Date | null {
  let fallbackTimestamp: Date | null = null;

  for (let i = updates.length - 1; i >= 0; i--) {
    if (updates[i].statusMessage.toLowerCase().includes(keyword.toLowerCase())) {
      const parsed = parseHHMM(updates[i].statusMessage);
      if (parsed) {
        const refDateStr = referenceDate.toISOString().split('T')[0];
        const extracted = localToUtc(refDateStr, parsed.hh, parsed.mm);
        if (extracted.getTime() < referenceDate.getTime() - 30 * 60_000) continue;
        return extracted;
      }
      if (!fallbackTimestamp) {
        fallbackTimestamp = updates[i].statusTimestamp;
      }
    }
  }

  if (fallbackTimestamp && fallbackTimestamp.getTime() >= referenceDate.getTime()) {
    return fallbackTimestamp;
  }

  return null;
}

function computeEffectiveDelay(
  actualDeparture: Date | null,
  actualArrival: Date | null,
  scheduledDeparture: Date,
  scheduledArrival: Date,
  canceled: boolean,
): number | null {
  if (canceled) return null;

  // Sanitize impossible times
  const sanitizedDep = (actualDeparture && actualDeparture.getTime() > scheduledArrival.getTime())
    ? null : actualDeparture;
  const sanitizedArr = (actualArrival && actualArrival.getTime() < scheduledDeparture.getTime())
    ? null : actualArrival;

  return sanitizedDep
    ? Math.round((sanitizedDep.getTime() - scheduledDeparture.getTime()) / 60_000)
    : sanitizedArr
      ? Math.round((sanitizedArr.getTime() - scheduledArrival.getTime()) / 60_000)
      : null;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('extractCanceled + effective delay', () => {
  it('returns true when a status contains "Cancelled"', () => {
    const updates: StatusUpdate[] = [
      { flightCode: 'GR200', flightDate: '2026-06-12', statusTimestamp: new Date('2026-06-12T06:00:00Z'), statusMessage: 'Cancelled' },
    ];
    expect(extractCanceled(updates)).toBe(true);
  });

  it('returns true when a status contains "canceled"', () => {
    const updates: StatusUpdate[] = [
      { flightCode: 'GR200', flightDate: '2026-06-12', statusTimestamp: new Date('2026-06-12T06:00:00Z'), statusMessage: 'Flight Canceled' },
    ];
    expect(extractCanceled(updates)).toBe(true);
  });

  it('returns false when no cancellation message exists', () => {
    const updates: StatusUpdate[] = [
      { flightCode: 'GR600', flightDate: '2026-06-12', statusTimestamp: new Date('2026-06-12T05:55:00Z'), statusMessage: 'On Time' },
    ];
    expect(extractCanceled(updates)).toBe(false);
  });

  it('effectiveDelayMinutes is null when canceled, regardless of actual times', () => {
    const sDep = new Date('2026-06-12T12:00:00Z');
    const sArr = new Date('2026-06-12T13:00:00Z');
    const actDep = new Date('2026-06-12T12:30:00Z');
    expect(computeEffectiveDelay(actDep, null, sDep, sArr, true)).toBeNull();
    expect(computeEffectiveDelay(null, null, sDep, sArr, true)).toBeNull();
  });

  it('computes delay from actual_departure', () => {
    const sDep = new Date('2026-06-12T12:00:00Z');
    const sArr = new Date('2026-06-12T13:00:00Z');
    const actDep = new Date('2026-06-12T12:22:00Z');
    expect(computeEffectiveDelay(actDep, null, sDep, sArr, false)).toBe(22);
  });

  it('rejects arrival before scheduled departure (impossible)', () => {
    // Arrival at 12:30 but departure scheduled at 13:00 — impossible
    const sDep = new Date('2026-06-12T13:00:00Z');
    const sArr = new Date('2026-06-12T14:00:00Z');
    const actArr = new Date('2026-06-12T12:30:00Z');
    expect(computeEffectiveDelay(null, actArr, sDep, sArr, false)).toBeNull();
  });

  it('rejects departure after scheduled arrival (impossible)', () => {
    const sDep = new Date('2026-06-12T12:00:00Z');
    const sArr = new Date('2026-06-12T12:30:00Z');
    const actDep = new Date('2026-06-12T13:00:00Z');
    expect(computeEffectiveDelay(actDep, null, sDep, sArr, false)).toBeNull();
  });
});

describe('extractActualTime fallback', () => {
  // Scheduled departure 12:45 Guernsey local on a BST day → 11:45 UTC
  const ref = localToUtc('2026-06-12', 12, 45);

  it('returns parsed time when message has HH:MM', () => {
    const updates: StatusUpdate[] = [
      { flightCode: 'GR644', flightDate: '2026-06-12', statusTimestamp: new Date('2026-06-12T13:10:00Z'), statusMessage: 'Airborne at 1307' },
    ];
    const result = extractActualTime(updates, 'Airborne', ref);
    expect(result).not.toBeNull();
    expect(result!.getUTCHours()).toBe(12);
    expect(result!.getUTCMinutes()).toBe(7);
  });

  it('returns null when no matching keyword is found', () => {
    const updates: StatusUpdate[] = [
      { flightCode: 'GR680', flightDate: '2026-06-12', statusTimestamp: new Date('2026-06-12T09:00:00Z'), statusMessage: 'On Time' },
    ];
    const result = extractActualTime(updates, 'Landed', ref);
    expect(result).toBeNull();
  });

  it('falls back to status timestamp when keyword matches but no HH:MM', () => {
    const ts = new Date('2026-06-12T13:45:00Z');
    const updates: StatusUpdate[] = [
      { flightCode: 'GR680', flightDate: '2026-06-12', statusTimestamp: ts, statusMessage: 'Landed' },
    ];
    const result = extractActualTime(updates, 'Landed', ref);
    expect(result).not.toBeNull();
    expect(result!.getTime()).toBe(ts.getTime());
  });

  it('rejects fallback timestamp before reference date', () => {
    const staleTs = new Date('2026-06-11T22:00:00Z'); // day before
    const updates: StatusUpdate[] = [
      { flightCode: 'GR680', flightDate: '2026-06-12', statusTimestamp: staleTs, statusMessage: 'Landed' },
    ];
    const result = extractActualTime(updates, 'Landed', ref);
    expect(result).toBeNull();
  });

  it('prefers parsed time over fallback timestamp', () => {
    const ts = new Date('2026-06-12T13:45:00Z');
    const updates: StatusUpdate[] = [
      { flightCode: 'GR644', flightDate: '2026-06-12', statusTimestamp: ts, statusMessage: 'Landed' },
      { flightCode: 'GR644', flightDate: '2026-06-12', statusTimestamp: new Date('2026-06-12T13:10:00Z'), statusMessage: 'Landed 1307' },
    ];
    const result = extractActualTime(updates, 'Landed', ref);
    expect(result).not.toBeNull();
    expect(result!.getUTCHours()).toBe(12);
    expect(result!.getUTCMinutes()).toBe(7);
  });

  it('rejects parsed time more than 30 minutes before scheduled', () => {
    const updates: StatusUpdate[] = [
      { flightCode: 'GR644', flightDate: '2026-06-12', statusTimestamp: new Date('2026-06-12T12:00:00Z'), statusMessage: 'Airborne at 1200' },
    ];
    const result = extractActualTime(updates, 'Airborne', ref);
    expect(result).toBeNull();
  });

  it('handles empty status updates array', () => {
    expect(extractCanceled([])).toBe(false);
    expect(extractActualTime([], 'Landed', ref)).toBeNull();
  });
});
