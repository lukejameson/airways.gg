/** Statuses that indicate a flight has reached a terminal state */
export const TERMINAL_STATUSES = ['Landed', 'Cancelled', 'Completed', 'Diverted'] as const;

/** Type for terminal status values */
export type TerminalStatus = typeof TERMINAL_STATUSES[number];

/**
 * Checks if a flight status is terminal (flight is complete and no longer active).
 * Also checks for statuses that start with 'diverted' (case-insensitive).
 * @param status - The flight status to check
 * @returns True if the status is terminal
 */
export function isTerminalStatus(status: string | null | undefined): boolean {
  if (!status) return false;

  const normalizedStatus = status.toLowerCase();

  // Check for exact terminal status match
  if (TERMINAL_STATUSES.includes(status as TerminalStatus)) {
    return true;
  }

  // Check for diverted variants (e.g., "Diverted to XXX")
  if (normalizedStatus.startsWith('diverted')) {
    return true;
  }

  return false;
}

/**
 * Options for getActiveFlightsToday query building
 */
export interface ActiveFlightsOptions {
  /** The date string (YYYY-MM-DD) to query */
  date: string;
  /** Additional status values to treat as terminal (optional) */
  additionalTerminalStatuses?: string[];
}

/**
 * SQL condition builder options for active flights
 * Note: This returns the conditions that should be used in a WHERE clause.
 * The actual query building is left to the caller since they have access to the ORM.
 */
export interface ActiveFlightConditions {
  /** The flight date to match */
  date: string;
  /** Statuses that should be excluded (terminal statuses) */
  excludedStatuses: readonly string[];
  /** Whether to exclude cancelled flights */
  excludeCancelled: boolean;
}

/**
 * Returns the standard conditions for querying active flights.
 * @param options - Options including date and optional additional terminal statuses
 * @returns Conditions object for building the query
 */
export function getActiveFlightsConditions(options: ActiveFlightsOptions): ActiveFlightConditions {
  const { date, additionalTerminalStatuses = [] } = options;
  return {
    date,
    excludedStatuses: [...TERMINAL_STATUSES, ...additionalTerminalStatuses],
    excludeCancelled: true,
  };
}
