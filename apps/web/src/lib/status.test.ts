import { describe, it, expect } from 'vitest';
import { shortenStatus, statusHasDetail, extractDelayReason, isFlightCompleted } from './status';

describe('shortenStatus', () => {
  it('returns Scheduled for null/undefined', () => {
    expect(shortenStatus(null)).toBe('Scheduled');
    expect(shortenStatus(undefined)).toBe('Scheduled');
  });

  it('returns Diverted for diverted statuses', () => {
    expect(shortenStatus('Flight Diverted to JER')).toBe('Diverted');
    expect(shortenStatus('Diverting to Southampton')).toBe('Diverting');
  });

  it('returns Delayed for delayed statuses', () => {
    expect(shortenStatus('Delayed due to weather')).toBe('Delayed');
    expect(shortenStatus('New ETD 14:30')).toBe('Delayed');
  });

  it('extracts Approx time', () => {
    expect(shortenStatus('Approx 15:30')).toBe('Approx 15:30');
    expect(shortenStatus('Approx 9:00')).toBe('Approx 9:00');
  });

  it('returns Boarding for go to gate', () => {
    expect(shortenStatus('Go to Gate 1')).toBe('Boarding');
  });

  it('returns Check-In Open for check-in open', () => {
    expect(shortenStatus('Check In Open')).toBe('Check-In Open');
    expect(shortenStatus('Check-In Open')).toBe('Check-In Open');
  });

  it('returns Holding for holding', () => {
    expect(shortenStatus('Aircraft Holding')).toBe('Holding');
  });

  it('passes through unknown statuses unchanged', () => {
    expect(shortenStatus('Landed')).toBe('Landed');
    expect(shortenStatus('Airborne')).toBe('Airborne');
  });
});

describe('statusHasDetail', () => {
  it('returns true when shortenStatus changes the value', () => {
    expect(statusHasDetail('Delayed due to weather - Next info at 14:00')).toBe(true);
    expect(statusHasDetail('Go to Gate 2')).toBe(true);
  });

  it('returns false when status is already short', () => {
    expect(statusHasDetail('Landed')).toBe(false);
    expect(statusHasDetail(null)).toBe(false);
  });
});

describe('extractDelayReason', () => {
  it('returns null for non-delay statuses', () => {
    expect(extractDelayReason('Landed')).toBeNull();
    expect(extractDelayReason('Airborne')).toBeNull();
    expect(extractDelayReason(null)).toBeNull();
  });

  it('detects weather delays with next info time', () => {
    const result = extractDelayReason('Delayed due to weather. Next info at 15:30');
    expect(result?.reason).toBe('weather');
    expect((result as { nextInfo: string | null })?.nextInfo).toBe('15:30');
  });

  it('detects weather delays without next info', () => {
    const result = extractDelayReason('Delayed due to weather');
    expect(result?.reason).toBe('weather');
    expect((result as { nextInfo: string | null })?.nextInfo).toBeNull();
  });

  it('detects indefinite delays', () => {
    const result = extractDelayReason('Indefinitely delayed');
    expect(result?.reason).toBe('indefinite');
  });

  it('detects holding', () => {
    const result = extractDelayReason('Aircraft holding overhead');
    expect(result?.reason).toBe('holding');
  });

  it('detects check-in suspended', () => {
    const result = extractDelayReason('Check in suspended');
    expect(result?.reason).toBe('check_in_suspended');
  });
});

describe('isFlightCompleted', () => {
  const futureDate = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
  const pastDate = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  const recentDate = new Date(Date.now() - 30 * 60_000).toISOString();

  it('returns true for landed status', () => {
    expect(isFlightCompleted({
      status: 'Landed',
      canceled: false,
      scheduledDeparture: pastDate,
      scheduledArrival: pastDate,
    })).toBe(true);
  });

  it('returns true for diverted status', () => {
    expect(isFlightCompleted({
      status: 'Diverted to JER',
      canceled: false,
      scheduledDeparture: pastDate,
      scheduledArrival: pastDate,
    })).toBe(true);
  });

  it('returns false for canceled flights before their scheduled departure + 1h', () => {
    expect(isFlightCompleted({
      status: 'Cancelled',
      canceled: true,
      scheduledDeparture: futureDate,
      scheduledArrival: futureDate,
    })).toBe(false);
  });

  it('returns true for canceled flights after scheduled departure + 1h', () => {
    expect(isFlightCompleted({
      status: 'Cancelled',
      canceled: true,
      scheduledDeparture: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
      scheduledArrival: pastDate,
    })).toBe(true);
  });

  it('returns true when actualArrival is set', () => {
    expect(isFlightCompleted({
      status: 'Airborne',
      canceled: false,
      actualArrival: pastDate,
      scheduledDeparture: pastDate,
      scheduledArrival: pastDate,
    })).toBe(true);
  });

  it('returns false for active flights with delay/boarding status', () => {
    expect(isFlightCompleted({
      status: 'Delayed due to weather',
      canceled: false,
      scheduledDeparture: futureDate,
      scheduledArrival: futureDate,
    })).toBe(false);
  });

  it('returns true when scheduledArrival is more than 45min in the past with no activity', () => {
    expect(isFlightCompleted({
      status: 'Scheduled',
      canceled: false,
      scheduledDeparture: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
      scheduledArrival: new Date(Date.now() - 60 * 60_000).toISOString(),
    })).toBe(true);
  });

  it('returns false when scheduledArrival is recent', () => {
    expect(isFlightCompleted({
      status: 'Scheduled',
      canceled: false,
      scheduledDeparture: pastDate,
      scheduledArrival: recentDate,
    })).toBe(false);
  });
});
