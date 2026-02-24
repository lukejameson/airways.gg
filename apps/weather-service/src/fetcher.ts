import { db, weatherData } from '@delays/database';

// Airports to track: GCI plus key Aurigny destinations
// Coords from OpenMeteo-compatible lat/lon
const AIRPORTS: { code: string; lat: number; lon: number }[] = [
  { code: 'GCI', lat: 49.4348, lon: -2.5986 }, // Guernsey
  { code: 'JER', lat: 49.2079, lon: -2.1955 }, // Jersey
  { code: 'LGW', lat: 51.1481, lon: -0.1903 }, // London Gatwick
  { code: 'LCY', lat: 51.5048, lon:  0.0495 }, // London City
  { code: 'MAN', lat: 53.3537, lon: -2.2750 }, // Manchester
  { code: 'BRS', lat: 51.3827, lon: -2.7191 }, // Bristol
  { code: 'BHX', lat: 52.4539, lon: -1.7480 }, // Birmingham
  { code: 'SOU', lat: 50.9503, lon: -1.3568 }, // Southampton
  { code: 'ACI', lat: 49.7061, lon: -2.2147 }, // Alderney
  { code: 'CDG', lat: 49.0097, lon:  2.5478 }, // Paris CDG
];

const OPENMETEO_BASE = process.env.OPENMETEO_API_URL || 'https://api.open-meteo.com/v1/forecast';

// WMO weather code → human-readable description
export function describeWeatherCode(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code <= 49) return 'Foggy';
  if (code <= 59) return 'Drizzle';
  if (code <= 69) return 'Rain';
  if (code <= 79) return 'Snow';
  if (code <= 82) return 'Rain showers';
  if (code <= 86) return 'Snow showers';
  if (code <= 99) return 'Thunderstorm';
  return 'Unknown';
}

interface OpenMeteoResponse {
  hourly: {
    time: string[];
    temperature_2m: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
    precipitation: number[];
    visibility: number[];
    cloud_cover: number[];
    surface_pressure: number[];
    weather_code: number[];
  };
}

async function fetchWeatherForAirport(airport: { code: string; lat: number; lon: number }): Promise<number> {
  const params = new URLSearchParams({
    latitude: airport.lat.toString(),
    longitude: airport.lon.toString(),
    hourly: 'temperature_2m,wind_speed_10m,wind_direction_10m,precipitation,visibility,cloud_cover,surface_pressure,weather_code',
    wind_speed_unit: 'mph',
    forecast_days: '2', // today + tomorrow
    timezone: 'UTC',
  });

  const url = `${OPENMETEO_BASE}?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenMeteo ${res.status} for ${airport.code}`);

  const data = (await res.json()) as OpenMeteoResponse;
  const { hourly } = data;

  // Upsert each hourly reading
  let upserted = 0;
  for (let i = 0; i < hourly.time.length; i++) {
    const timestamp = new Date(hourly.time[i] + ':00Z'); // ISO with explicit UTC
    await db
      .insert(weatherData)
      .values({
        airportCode: airport.code,
        timestamp,
        temperature: hourly.temperature_2m[i] ?? null,
        windSpeed: hourly.wind_speed_10m[i] ?? null,
        windDirection: hourly.wind_direction_10m[i] != null ? Math.round(hourly.wind_direction_10m[i]) : null,
        precipitation: hourly.precipitation[i] ?? null,
        visibility: hourly.visibility[i] != null ? hourly.visibility[i] / 1000 : null, // m → km
        cloudCover: hourly.cloud_cover[i] != null ? Math.round(hourly.cloud_cover[i]) : null,
        pressure: hourly.surface_pressure[i] ?? null,
        weatherCode: hourly.weather_code[i] != null ? Math.round(hourly.weather_code[i]) : null,
      })
      .onConflictDoUpdate({
        target: [weatherData.airportCode, weatherData.timestamp],
        set: {
          temperature: hourly.temperature_2m[i] ?? null,
          windSpeed: hourly.wind_speed_10m[i] ?? null,
          windDirection: hourly.wind_direction_10m[i] != null ? Math.round(hourly.wind_direction_10m[i]) : null,
          precipitation: hourly.precipitation[i] ?? null,
          visibility: hourly.visibility[i] != null ? hourly.visibility[i] / 1000 : null,
          cloudCover: hourly.cloud_cover[i] != null ? Math.round(hourly.cloud_cover[i]) : null,
          pressure: hourly.surface_pressure[i] ?? null,
          weatherCode: hourly.weather_code[i] != null ? Math.round(hourly.weather_code[i]) : null,
        },
      });
    upserted++;
  }
  return upserted;
}

export async function fetchAllWeather(): Promise<void> {
  console.log(`[Weather] Fetching weather for ${AIRPORTS.length} airports...`);
  let total = 0;
  const errors: string[] = [];

  for (const airport of AIRPORTS) {
    try {
      const n = await fetchWeatherForAirport(airport);
      console.log(`[Weather] ${airport.code}: ${n} hourly records upserted`);
      total += n;
      // Small pause between requests to be polite
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Weather] Failed to fetch ${airport.code}: ${msg}`);
      errors.push(`${airport.code}: ${msg}`);
    }
  }

  console.log(`[Weather] Done. ${total} total records, ${errors.length} errors.`);
  if (errors.length) console.error('[Weather] Errors:', errors.join('; '));
}
