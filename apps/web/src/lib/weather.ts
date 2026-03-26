import type { DaylightData, WeatherDisplayData } from './types';

/**
 * Finds the closest weather data point to a given timestamp
 * @param weatherArray - Array of weather data points for a location
 * @param targetTime - The target time to find closest weather for
 * @returns The closest weather data point, or null if no data available
 */
export function findClosestWeather(
	weatherArray: WeatherDisplayData[] | undefined,
	targetTime: Date
): WeatherDisplayData | null {
	if (!weatherArray || weatherArray.length === 0) return null;

	const targetMs = targetTime.getTime();

	// Prefer past weather data (before or at target time)
	const past = weatherArray.filter((w) => new Date(w.timestamp).getTime() <= targetMs);

	if (past.length > 0) {
		// Return the most recent past weather
		return past.reduce((a, b) => {
			const aTime = new Date(a.timestamp).getTime();
			const bTime = new Date(b.timestamp).getTime();
			return aTime > bTime ? a : b;
		});
	}

	// If no past data, find the closest by absolute time difference
	return weatherArray.reduce((a: WeatherDisplayData, b: WeatherDisplayData) => {
		const aDiff = Math.abs(new Date(a.timestamp).getTime() - targetMs);
		const bDiff = Math.abs(new Date(b.timestamp).getTime() - targetMs);
		return aDiff <= bDiff ? a : b;
	});
}

/**
 * Formats weather data into a human-readable string
 * @param weather - The weather data to format
 * @returns Formatted weather string (e.g., '18°C · 12mph NE'), or empty string if no data
 */
export function formatWeather(weather: WeatherDisplayData | null | undefined): string {
	if (!weather) return '';

	const parts: string[] = [];

	if (weather.temperature != null) {
		parts.push(`${Math.round(weather.temperature)}°C`);
	}

	if (weather.windSpeed != null) {
		const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
		const dirIndex =
			weather.windDirection != null
				? Math.round(weather.windDirection / 45) % 8
				: null;
		const dir = dirIndex !== null ? dirs[dirIndex] : '';
		parts.push(`${Math.round(weather.windSpeed)}mph ${dir}`.trim());
	}

	return parts.join(' · ');
}

/**
 * Finds the daylight data closest to a target time for a specific location
 * @param daylightArray - Array of daylight data points for a location
 * @param targetTime - The target time to find closest daylight data for
 * @returns The closest daylight data point, or null if no data available
 */
export function findClosestDaylight(
	daylightArray: DaylightData[] | undefined,
	targetTime: Date
): DaylightData | null {
	if (!daylightArray || daylightArray.length === 0) return null;

	const target = new Date(targetTime);

	return daylightArray.reduce((closest: DaylightData | null, current: DaylightData) => {
		if (!closest) return current;

		const closestSunrise = new Date(closest.sunrise);
		const currentSunrise = new Date(current.sunrise);
		const closestDiff = Math.abs(closestSunrise.getTime() - target.getTime());
		const currentDiff = Math.abs(currentSunrise.getTime() - target.getTime());

		return currentDiff < closestDiff ? current : closest;
	}, null);
}
