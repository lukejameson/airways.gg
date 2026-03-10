/**
 * Derives a short, badge-friendly label from a verbose flight status string.
 * Returns only the primary state word — no secondary detail (ETD times,
 * destination codes, gate numbers). That detail is surfaced separately on
 * the flight detail page via statusHasDetail / the full status callout.
 */export type FlightLike = {
  status?: string | null;
  canceled?: boolean | null;
  actualArrival?: string | Date | null;
  actualDeparture?: string | Date | null;
  scheduledArrival: string | Date;
  scheduledDeparture: string | Date;
};

export function isFlightCompleted(f: FlightLike): boolean {
  if (f.canceled === true) {
    return Date.now() > new Date(f.scheduledDeparture).getTime() + 60 * 60_000;
  }
  const s = f.status?.toLowerCase() ?? '';
  if (s.includes('landed') || s.includes('completed') || s.includes('diverted')) return true;
  if (f.actualArrival) return true;
  if (
    !f.actualDeparture &&
    (s.includes('delayed') || s.includes('etd') || s.includes('next info') ||
      s.includes('indefini') || s.includes('check in') || s.includes('check-in') ||
      s.includes('boarding') || s.includes('go to') || s.includes('approx'))
  ) return false;
  if (new Date(f.scheduledArrival).getTime() < Date.now() - 45 * 60_000) return true;
  return false;
}

export type DelayReason =
  | { reason: 'weather'; label: string; nextInfo: string | null }
  | { reason: 'indefinite'; label: string }
  | { reason: 'holding'; label: string }
  | { reason: 'check_in_suspended'; label: string };

export function extractDelayReason(status: string | null | undefined): DelayReason | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (!s.includes('delay') && !s.includes('indefini') && !s.includes('holding') && !s.includes('check in suspend') && !s.includes('check-in suspend')) return null;
  if (s.includes('weather') || (s.includes('due') && s.includes('weather')) || s.match(/due\s+weather/)) {
    const nextInfoMatch = status.match(/next\s+info(?:\s+at)?\s+([0-9]{1,2}:[0-9]{2})/i);
    return { reason: 'weather', label: 'Delayed due to weather', nextInfo: nextInfoMatch ? nextInfoMatch[1] : null };
  }
  if (s.includes('indefini')) {
    if (s.includes('weather')) {
      return { reason: 'weather', label: 'Indefinitely delayed due to weather', nextInfo: null };
    }
    return { reason: 'indefinite', label: 'Indefinitely delayed' };
  }
  if (s.includes('holding')) {
    return { reason: 'holding', label: 'Aircraft holding overhead' };
  }
  if (s.includes('check in suspend') || s.includes('check-in suspend')) {
    return { reason: 'check_in_suspended', label: 'Check-in suspended' };
  }
  return null;
}

export function shortenStatus(status: string | null | undefined): string {
  if (!status) return 'Scheduled';

  const s = status.toLowerCase();

  // Diverted must be checked before delayed — some strings contain both
  if (s.includes('diverted')) return 'Diverted';
  if (s.includes('diverting')) return 'Diverting';

  if (s.includes('delayed') || s.includes('new etd')) return 'Delayed';

  // "Approx HH:MM" — already a recognised short form used in the existing
  // yellow-tone handling; keep as-is (it's ≤ 12 chars)
  if (s.startsWith('approx')) {
    const t = status.match(/([0-9]{1,2}:[0-9]{2}(?:\s*[AP]M)?)/i);
    return t ? `Approx ${t[1]}` : 'Approx';
  }

  // Check-in messages — may also signal a delay or gate direction
  if (s.includes('check in') || s.includes('check-in')) {
    if (s.includes('delayed') || s.includes('etd')) return 'Delayed';
    return 'Check-In Open';
  }

  // Go to gate / departures → Boarding
  if (s.includes('go to')) return 'Boarding';

  // "Estimated dep. 4:45 PM" / "Estimated 12:54 PM"
  if (s.includes('estimated')) return 'Estimated';

  // PAX transfer messages
  if (s.includes('pax') || s.includes('passengers')) return 'Pax Transfer';

  // Holding overhead
  if (s.includes('holding')) return 'Holding';

  return status;
}

/**
 * Returns true when the full status string carries more detail than the
 * shortened badge label — used to decide whether to show the full text
 * as a secondary element on the detail page.
 */
export function statusHasDetail(status: string | null | undefined): boolean {
  if (!status) return false;
  return shortenStatus(status) !== status;
}
