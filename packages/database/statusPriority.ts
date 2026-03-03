const STATUS_PRIORITY: Record<string, number> = {
  Scheduled: 10,
  'Check-In Open': 15,
  Delayed: 20,
  Boarding: 30,
  Taxiing: 35,
  Airborne: 40,
  Landed: 50,
  Cancelled: 50,
  Diverted: 50,
};

function priority(status: string | null | undefined): number {
  if (!status) return 0;
  return STATUS_PRIORITY[status] ?? 0;
}

/** Returns true if `newStatus` is equal or higher priority than `currentStatus`. */
export function canUpgradeStatus(
  currentStatus: string | null | undefined,
  newStatus: string | null | undefined,
): boolean {
  if (!newStatus) return false;
  return priority(newStatus) >= priority(currentStatus);
}

/** Returns true if the status represents a terminal state (no further movement expected). */
export function isTerminalStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const p = priority(status);
  return p >= 50;
}
