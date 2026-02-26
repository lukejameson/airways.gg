/** Icon names available for weather icons */
export type WeatherIconName =
	| 'sun'
	| 'moon'
	| 'sunCloud'
	| 'moonCloud'
	| 'cloud'
	| 'cloudDrizzle'
	| 'cloudDrizzleHeavy'
	| 'cloudRain'
	| 'cloudShowers'
	| 'cloudSleet'
	| 'cloudSnow'
	| 'cloudBolt'
	| 'cloudBoltSun'
	| 'fog'
	| 'smog'
	| 'snowflake'
	| 'snowflakes';

/** Check if a timestamp is during daytime (between sunrise and sunset) */
export function isDaytime(sunrise: Date, sunset: Date, timestamp: Date): boolean {
	return timestamp >= sunrise && timestamp < sunset;
}

/** Map weather code to icon name, considering time of day */
export function getWeatherIconName(
	weatherCode: number | null,
	isDay: boolean
): WeatherIconName {
	if (weatherCode == null) return 'cloud';

	// Clear sky
	if (weatherCode === 0) return isDay ? 'sun' : 'moon';

	// Partly cloudy (1-2)
	if (weatherCode <= 2) return isDay ? 'sunCloud' : 'moonCloud';

	// Overcast
	if (weatherCode === 3) return 'cloud';

	// Foggy
	if (weatherCode <= 49) return 'fog';

	// Drizzle
	if (weatherCode <= 59) return 'cloudDrizzle';

	// Rain
	if (weatherCode <= 69) return 'cloudRain';

	// Snow
	if (weatherCode <= 79) return 'cloudSnow';

	// Showers (rain/snow)
	if (weatherCode <= 86) return 'cloudShowers';

	// Thunderstorm
	if (weatherCode <= 99) return 'cloudBolt';

	return 'cloud';
}
