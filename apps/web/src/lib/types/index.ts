export interface DaylightData {
	sunrise: Date;
	sunset: Date;
}

export interface WeatherDisplayData {
	timestamp: Date;
	temperature?: number | null;
	windSpeed?: number | null;
	windDirection?: number | null;
	weatherCode?: number | null;
}
