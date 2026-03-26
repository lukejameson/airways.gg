/**
 * Formats a date/time value into a time string (HH:MM format)
 * @param date - The date string, Date object, or null/undefined to format
 * @returns Formatted time string in 'HH:MM' format, or '--:--' if null/undefined
 */
export function formatTime(date: string | Date | null | undefined): string {
	if (!date) return '--:--';
	return new Date(date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Formats a duration in minutes into a human-readable string
 * @param minutes - The duration in minutes
 * @returns Formatted duration string (e.g., '2h 30m', '45m', '1h'), or '—' if zero/invalid
 */
export function formatDuration(minutes: number | null | undefined): string {
	const m = Number(minutes);
	if (!m || m <= 0) return '—';

	const hrs = Math.floor(m / 60);
	const mins = m % 60;

	if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
	if (hrs > 0) return `${hrs}h`;
	return `${mins}m`;
}

/**
 * Formats a date value into a locale-specific date string
 * @param date - The date string, Date object, or null/undefined to format
 * @returns Formatted date string (e.g., '26 Mar 2025'), or '—' if null/invalid
 */
export function formatDate(date: string | Date | null | undefined): string {
	if (!date) return '—';

	const s = String(date).slice(0, 10); // "YYYY-MM-DD" — strip time/tz before parsing
	const [y, m, day] = s.split('-').map(Number);

	if (!y || !m || !day) return '—';

	return new Date(y, m - 1, day).toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});
}

/**
 * Formats a date/time into a full date-time string
 * @param date - The date string or Date object to format
 * @returns Formatted date-time string, or '—' if null/undefined
 */
export function formatDateTime(date: string | Date | null | undefined): string {
	if (!date) return '—';
	const d = new Date(date);
	return `${formatDate(d)} ${formatTime(d)}`;
}
