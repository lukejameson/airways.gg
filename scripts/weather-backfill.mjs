#!/usr/bin/env node
import { Pool } from 'pg';

const AIRPORTS = {
  GCI: { lat: 49.4350, lon: -2.6014, icao: 'EGJB' },
  JER: { lat: 49.2079, lon: -2.1955, icao: 'EGJJ' },
  LGW: { lat: 51.1481, lon: -0.1903, icao: 'EGKK' },
  LCY: { lat: 51.5048, lon:  0.0495, icao: 'EGLC' },
  MAN: { lat: 53.3537, lon: -2.2750, icao: 'EGCC' },
  BRS: { lat: 51.3827, lon: -2.7191, icao: 'EGGD' },
  SOU: { lat: 50.9503, lon: -1.3568, icao: 'EGHI' },
  EXT: { lat: 50.7344, lon: -3.4139, icao: 'EGTE' },
  BHX: { lat: 52.4539, lon: -1.7480, icao: 'EGBB' },
  CDG: { lat: 49.0097, lon:  2.5479, icao: 'LFPG' },
  EMA: { lat: 52.8311, lon: -1.3282, icao: 'EGNX' },
  DUB: { lat: 53.4213, lon: -6.2700, icao: 'EIDW' },
  EDI: { lat: 55.9500, lon: -3.3725, icao: 'EGPH' },
  ACI: { lat: 49.7061, lon: -2.2147, icao: 'EGJA' },
};

const OPEN_METEO_URL = 'https://archive-api.open-meteo.com/v1/archive';
const IEM_URL = 'https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py';

const HOURLY_VARS = [
  'temperature_2m',
  'wind_speed_10m',
  'wind_direction_10m',
  'cloud_cover',
  'precipitation',
  'surface_pressure',
  'weather_code',
].join(',');

function parseArgs() {
  const args = process.argv.slice(2);
  let start, end, airports, patchVisibility = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--start') start = args[++i];
    else if (args[i] === '--end') end = args[++i];
    else if (args[i] === '--airports') airports = args[++i].split(',').map(s => s.trim().toUpperCase());
    else if (args[i] === '--patch-visibility') patchVisibility = true;
  }
  if (!start || !end) {
    console.error('Usage: node weather-backfill.mjs --start YYYY-MM-DD --end YYYY-MM-DD [--airports GCI,JER,LGW] [--patch-visibility]');
    process.exit(1);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    console.error('Dates must be in YYYY-MM-DD format');
    process.exit(1);
  }
  return { start, end, airports: airports || Object.keys(AIRPORTS), patchVisibility };
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
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchIemVisibility(icao, start, end) {
  const endDate = new Date(end + 'T00:00:00Z');
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const endStr = endDate.toISOString().split('T')[0];

  const [sy, sm, sd] = start.split('-');
  const [ey, em, ed] = endStr.split('-');

  const params = new URLSearchParams({
    station: icao,
    data: 'vsby',
    year1: sy, month1: sm, day1: sd,
    year2: ey, month2: em, day2: ed,
    tz: 'UTC',
    format: 'onlycomma',
    latlon: 'no',
    elev: 'no',
    missing: 'null',
    trace: 'null',
    direct: 'no',
    report_type: '3,4',
  });

  const url = `${IEM_URL}?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`IEM ${res.status}: ${await res.text()}`);
  const text = await res.text();

  const visMap = new Map();
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line || line.startsWith('#') || line.startsWith('station')) continue;
    const parts = line.split(',');
    if (parts.length < 3) continue;
    const validStr = parts[1]?.trim();
    const vsbyStr = parts[2]?.trim();
    if (!validStr || !vsbyStr || vsbyStr === 'null') continue;
    const ts = new Date(validStr);
    if (isNaN(ts.getTime())) continue;
    const vsby = parseFloat(vsbyStr);
    if (isNaN(vsby)) continue;
    const hour = new Date(ts);
    hour.setUTCMinutes(0, 0, 0);
    const key = hour.toISOString();
    if (!visMap.has(key)) visMap.set(key, []);
    visMap.get(key).push(vsby);
  }

  const hourlyVis = new Map();
  for (const [key, values] of visMap) {
    const avgMiles = values.reduce((a, b) => a + b, 0) / values.length;
    hourlyVis.set(key, Math.min(avgMiles * 1.60934, 10));
  }
  return hourlyVis;
}

async function insertRows(pool, airportCode, data, visMap) {
  const times = data.hourly.time;
  const temp  = data.hourly.temperature_2m;
  const wind  = data.hourly.wind_speed_10m;
  const wdir  = data.hourly.wind_direction_10m;
  const cloud = data.hourly.cloud_cover;
  const precip = data.hourly.precipitation;
  const pres  = data.hourly.surface_pressure;
  const wcode = data.hourly.weather_code;

  const rows = times.map((t, i) => {
    const ts = new Date(t + ':00.000Z');
    const visKey = ts.toISOString();
    return {
      airport_code: airportCode,
      timestamp: ts,
      temperature: temp[i] ?? null,
      wind_speed: wind[i] ?? null,
      wind_direction: wdir[i] ?? null,
      visibility: visMap?.get(visKey) ?? null,
      cloud_cover: cloud[i] ?? null,
      precipitation: precip[i] ?? null,
      pressure: pres[i] ?? null,
      weather_code: wcode[i] ?? null,
    };
  });

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
         visibility     = COALESCE(EXCLUDED.visibility, historical_weather.visibility),
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

async function patchVisibilityForRange(pool, airportCode, icao, start, end) {
  console.log(`[${airportCode}] Fetching METAR visibility from IEM for ${start} → ${end}...`);
  const visMap = await fetchIemVisibility(icao, start, end);
  if (!visMap.size) {
    console.log(`[${airportCode}] No visibility data returned from IEM`);
    return 0;
  }
  const entries = [...visMap.entries()];
  const BATCH = 100;
  let updated = 0;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    for (const [tsIso, vis] of batch) {
      await pool.query(
        `UPDATE historical_weather SET visibility = $1 WHERE airport_code = $2 AND timestamp = $3`,
        [vis, airportCode, new Date(tsIso)],
      );
      updated++;
    }
  }
  return updated;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const { start, end, airports, patchVisibility } = parseArgs();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error('DATABASE_URL is not set'); process.exit(1); }

  const pool = new Pool({ connectionString: dbUrl, max: 3 });
  const allDates = dateRange(start, end);

  console.log(`Date range: ${start} → ${end} (${allDates.length} days)`);
  console.log(`Airports: ${airports.join(', ')}`);

  const unknown = airports.filter(a => !AIRPORTS[a]);
  if (unknown.length) { console.error(`Unknown airports: ${unknown.join(', ')}`); process.exit(1); }

  let totalInserted = 0;

  if (patchVisibility) {
    console.log('Mode: patch visibility only');
    for (const code of airports) {
      const { icao } = AIRPORTS[code];
      try {
        const updated = await patchVisibilityForRange(pool, code, icao, start, end);
        console.log(`[${code}] Updated ${updated} rows with visibility`);
      } catch (err) {
        console.error(`[${code}] Visibility patch failed: ${err.message}`);
      }
      await sleep(500);
    }
    console.log('\nDone.');
    await pool.end();
    return;
  }

  for (const code of airports) {
    const { icao } = AIRPORTS[code];
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
        const [meteoData, visMap] = await Promise.all([
          fetchOpenMeteo(code, range.start, range.end),
          fetchIemVisibility(icao, range.start, range.end).catch(err => {
            console.warn(`[${code}] IEM visibility fetch failed: ${err.message} — continuing without visibility`);
            return new Map();
          }),
        ]);
        const visCount = visMap.size;
        const inserted = await insertRows(pool, code, meteoData, visMap);
        totalInserted += inserted;
        console.log(`[${code}] Inserted ${inserted} rows (${visCount} hourly visibility readings from METAR)`);
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
