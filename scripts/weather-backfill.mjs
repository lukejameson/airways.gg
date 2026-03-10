#!/usr/bin/env node
import { Pool } from 'pg';

const AIRPORTS = {
  GCI: { lat: 49.4350, lon: -2.6014 },
  JER: { lat: 49.2079, lon: -2.1955 },
  LGW: { lat: 51.1481, lon: -0.1903 },
  LCY: { lat: 51.5048, lon: 0.0495 },
  MAN: { lat: 53.3537, lon: -2.2750 },
  BRS: { lat: 51.3827, lon: -2.7191 },
  SOU: { lat: 50.9503, lon: -1.3568 },
  EXT: { lat: 50.7344, lon: -3.4139 },
  BHX: { lat: 52.4539, lon: -1.7480 },
  CDG: { lat: 49.0097, lon:  2.5479 },
  EMA: { lat: 52.8311, lon: -1.3282 },
  DUB: { lat: 53.4213, lon: -6.2700 },
  EDI: { lat: 55.9500, lon: -3.3725 },
  ACI: { lat: 49.7061, lon: -2.2147 },
};

const OPEN_METEO_URL = 'https://archive-api.open-meteo.com/v1/archive';
const HOURLY_VARS = [
  'temperature_2m',
  'wind_speed_10m',
  'wind_direction_10m',
  'visibility',
  'cloud_cover',
  'precipitation',
  'surface_pressure',
  'weather_code',
].join(',');

function parseArgs() {
  const args = process.argv.slice(2);
  let start, end, airports;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--start') start = args[++i];
    else if (args[i] === '--end') end = args[++i];
    else if (args[i] === '--airports') airports = args[++i].split(',').map(s => s.trim().toUpperCase());
  }

  if (!start || !end) {
    console.error('Usage: node weather-backfill.mjs --start YYYY-MM-DD --end YYYY-MM-DD [--airports GCI,JER,LGW]');
    process.exit(1);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    console.error('Dates must be in YYYY-MM-DD format');
    process.exit(1);
  }

  return { start, end, airports: airports || Object.keys(AIRPORTS) };
}

async function getExistingDates(pool, airportCode) {
  const res = await pool.query(
    `SELECT DISTINCT DATE(timestamp) AS d FROM historical_weather WHERE airport_code = $1`,
    [airportCode],
  );
  return new Set(res.rows.map(r => r.d.toISOString().split('T')[0]));
}

function dateRange(start, end) {
  const dates = [];
  const cur = new Date(start + 'T00:00:00Z');
  const last = new Date(end + 'T00:00:00Z');
  while (cur <= last) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

function missingRanges(allDates, existingDates) {
  const missing = allDates.filter(d => !existingDates.has(d));
  if (!missing.length) return [];
  const ranges = [];
  let rangeStart = missing[0];
  let prev = missing[0];
  for (let i = 1; i < missing.length; i++) {
    const cur = missing[i];
    const prevDate = new Date(prev + 'T00:00:00Z');
    prevDate.setUTCDate(prevDate.getUTCDate() + 1);
    if (prevDate.toISOString().split('T')[0] !== cur) {
      ranges.push({ start: rangeStart, end: prev });
      rangeStart = cur;
    }
    prev = cur;
  }
  ranges.push({ start: rangeStart, end: prev });
  return ranges;
}

async function fetchOpenMeteo(airportCode, start, end) {
  const { lat, lon } = AIRPORTS[airportCode];
  const url = `${OPEN_METEO_URL}?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end}&hourly=${HOURLY_VARS}&timezone=UTC&wind_speed_unit=kn`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Open-Meteo ${res.status}: ${body}`);
  }
  return res.json();
}

function visibilityMetresToKm(metres) {
  if (metres == null) return null;
  return Math.min(metres / 1000, 10);
}

async function insertRows(pool, airportCode, data) {
  const times = data.hourly.time;
  const temp = data.hourly.temperature_2m;
  const wind = data.hourly.wind_speed_10m;
  const wdir = data.hourly.wind_direction_10m;
  const vis  = data.hourly.visibility;
  const cloud = data.hourly.cloud_cover;
  const precip = data.hourly.precipitation;
  const pres  = data.hourly.surface_pressure;
  const wcode = data.hourly.weather_code;

  const rows = times.map((t, i) => ({
    airport_code: airportCode,
    timestamp: new Date(t + ':00.000Z'),
    temperature: temp[i] ?? null,
    wind_speed: wind[i] ?? null,
    wind_direction: wdir[i] ?? null,
    visibility: visibilityMetresToKm(vis[i]),
    cloud_cover: cloud[i] ?? null,
    precipitation: precip[i] ?? null,
    pressure: pres[i] ?? null,
    weather_code: wcode[i] ?? null,
  }));

  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const values = batch.map((_, j) => {
      const base = j * 10;
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10})`;
    }).join(',');
    const params = batch.flatMap(r => [
      r.airport_code, r.timestamp, r.temperature, r.wind_speed,
      r.wind_direction, r.visibility, r.cloud_cover, r.precipitation,
      r.pressure, r.weather_code,
    ]);
    await pool.query(
      `INSERT INTO historical_weather
         (airport_code, timestamp, temperature, wind_speed, wind_direction,
          visibility, cloud_cover, precipitation, pressure, weather_code)
       VALUES ${values}
       ON CONFLICT (airport_code, timestamp) DO UPDATE SET
         temperature    = EXCLUDED.temperature,
         wind_speed     = EXCLUDED.wind_speed,
         wind_direction = EXCLUDED.wind_direction,
         visibility     = EXCLUDED.visibility,
         cloud_cover    = EXCLUDED.cloud_cover,
         precipitation  = EXCLUDED.precipitation,
         pressure       = EXCLUDED.pressure,
         weather_code   = EXCLUDED.weather_code`,
      params,
    );
    inserted += batch.length;
  }
  return inserted;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const { start, end, airports } = parseArgs();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: dbUrl, max: 3 });

  const allDates = dateRange(start, end);
  console.log(`Date range: ${start} → ${end} (${allDates.length} days)`);
  console.log(`Airports: ${airports.join(', ')}`);

  const unknown = airports.filter(a => !AIRPORTS[a]);
  if (unknown.length) {
    console.error(`Unknown airports: ${unknown.join(', ')}`);
    process.exit(1);
  }

  let totalInserted = 0;

  for (const code of airports) {
    console.log(`\n[${code}] Checking existing data...`);
    const existing = await getExistingDates(pool, code);
    const alreadyHave = allDates.filter(d => existing.has(d)).length;
    const ranges = missingRanges(allDates, existing);

    if (!ranges.length) {
      console.log(`[${code}] Already complete — skipping`);
      continue;
    }

    console.log(`[${code}] ${alreadyHave}/${allDates.length} days already present, fetching ${allDates.length - alreadyHave} missing days in ${ranges.length} range(s)`);

    for (const range of ranges) {
      console.log(`[${code}] Fetching ${range.start} → ${range.end}...`);
      try {
        const data = await fetchOpenMeteo(code, range.start, range.end);
        const inserted = await insertRows(pool, code, data);
        totalInserted += inserted;
        console.log(`[${code}] Inserted ${inserted} rows`);
      } catch (err) {
        console.error(`[${code}] Failed for ${range.start}→${range.end}: ${err.message}`);
      }
      await sleep(500);
    }
  }

  console.log(`\nDone. Total rows inserted/updated: ${totalInserted}`);
  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
