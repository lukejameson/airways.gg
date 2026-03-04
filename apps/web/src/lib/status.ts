/**
 * Derives a short, badge-friendly label from a verbose flight status string.
 * Returns only the primary state word — no secondary detail (ETD times,
 * destination codes, gate numbers). That detail is surfaced separately on
 * the flight detail page via statusHasDetail / the full status callout.
 */
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
