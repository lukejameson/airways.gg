/**
 * Calculates the delay in minutes between a scheduled time and an actual/estimated time
 * @param scheduledTime - The originally scheduled time
 * @param actualOrEstimatedTime - The actual or estimated time
 * @returns The delay in minutes (positive = delayed, negative = early, 0 = no data)
 */
export function calculateDelayMinutes(
	scheduledTime: string | Date | null | undefined,
	actualOrEstimatedTime: string | Date | null | undefined
): number {
	if (!scheduledTime || !actualOrEstimatedTime) return 0;

	const scheduled = new Date(scheduledTime).getTime();
	const actual = new Date(actualOrEstimatedTime).getTime();

	if (Number.isNaN(scheduled) || Number.isNaN(actual)) return 0;

	return Math.round((actual - scheduled) / 60000);
}

/**
 * Formats a delay duration into a human-readable string
 * @param delayMinutes - The delay in minutes
 * @returns Formatted delay string (e.g., '2h 30m', '45m'), or null if not delayed
 */
export function formatDelay(delayMinutes: number): string | null {
	if (delayMinutes <= 0) return null;

	const hrs = Math.floor(delayMinutes / 60);
	const mins = delayMinutes % 60;

	if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
	if (hrs > 0) return `${hrs}h`;
	return `${mins}m`;
}

/**
 * Formats an "early" duration into a human-readable string (negative prefix)
 * @param delayMinutes - The delay in minutes (negative value indicates early)
 * @param thresholdMinutes - The threshold below which to consider "early" (default: -5)
 * @returns Formatted early string (e.g., '-16m', '-1h 5m'), or null if not early enough
 */
export function formatEarly(
	delayMinutes: number,
	thresholdMinutes = -5
): string | null {
	if (delayMinutes >= thresholdMinutes) return null;

	const absMins = Math.abs(delayMinutes);
	const hrs = Math.floor(absMins / 60);
	const mins = absMins % 60;

	if (hrs > 0 && mins > 0) return `-${hrs}h ${mins}m`;
	if (hrs > 0) return `-${hrs}h`;
	return `-${mins}m`;
}

/**
 * Checks if a flight is delayed based on calculated delay minutes
 * @param delayMinutes - The delay in minutes
 * @param thresholdMinutes - The threshold above which to consider delayed (default: 15)
 * @returns True if the flight is considered delayed
 */
export function isDelayed(delayMinutes: number, thresholdMinutes = 15): boolean {
	return delayMinutes > thresholdMinutes;
}

/**
 * Checks if a flight is early based on calculated delay minutes
 * @param delayMinutes - The delay in minutes
 * @param thresholdMinutes - The threshold below which to consider early (default: -5)
 * @returns True if the flight is considered early
 */
export function isEarly(delayMinutes: number, thresholdMinutes = -5): boolean {
	return delayMinutes < thresholdMinutes;
}
