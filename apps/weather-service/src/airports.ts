import { db, airports } from '@airways/database';
import { inArray, sql } from 'drizzle-orm';

const OURAIRPORTS_URL = 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv';
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(field.trim());
      field = '';
    } else {
      field += char;
    }
  }
  fields.push(field.trim());
  
  return fields;
}

async function fetchOurAirportsData(): Promise<Map<string, {
  icao: string;
  name: string;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  elevationFt: number | null;
}>> {
  console.log('[Airports] Downloading OurAirports data...');
  
  const res = await fetch(OURAIRPORTS_URL);
  if (!res.ok) throw new Error(`OurAirports fetch failed: ${res.status}`);
  
  const text = await res.text();
  const lines = text.split('\n');
  const headers = parseCSVLine(lines[0]);
  
  const iataIndex = headers.indexOf('iata_code');
  const icaoIndex = headers.indexOf('gps_code');
  const nameIndex = headers.indexOf('name');
  const cityIndex = headers.indexOf('municipality');
  const countryIndex = headers.indexOf('iso_country');
  const latIndex = headers.indexOf('latitude_deg');
  const lonIndex = headers.indexOf('longitude_deg');
  const elevIndex = headers.indexOf('elevation_ft');
  
  const results = new Map<string, {
    icao: string;
    name: string;
    city: string | null;
    country: string | null;
    latitude: number | null;
    longitude: number | null;
    elevationFt: number | null;
  }>();
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const fields = parseCSVLine(lines[i]);
    const iata = fields[iataIndex];
    const icao = fields[icaoIndex];
    
    if (!iata || iata.length !== 3) continue;
    if (!icao || icao.length !== 4) continue;
    
    const lat = fields[latIndex] ? parseFloat(fields[latIndex]) : null;
    const lon = fields[lonIndex] ? parseFloat(fields[lonIndex]) : null;
    const elev = fields[elevIndex] ? parseInt(fields[elevIndex]) : null;
    
    results.set(iata, {
      icao,
      name: fields[nameIndex] || `${iata} Airport`,
      city: fields[cityIndex] || null,
      country: fields[countryIndex] || null,
      latitude: isNaN(lat!) ? null : lat,
      longitude: isNaN(lon!) ? null : lon,
      elevationFt: isNaN(elev!) ? null : elev,
    });
  }
  
  console.log(`[Airports] Parsed ${results.size} airports with IATA codes`);
  return results;
}

export async function syncAirports(): Promise<number> {
  const data = await fetchOurAirportsData();
  
  const entries = Array.from(data.entries());
  console.log(`[Airports] Upserting ${entries.length} airports...`);
  
  let upserted = 0;
  
  for (let i = 0; i < entries.length; i += 500) {
    const batch = entries.slice(i, i + 500);
    
    const values = batch.map(([iata, info]) => ({
      iataCode: iata,
      icaoCode: info.icao,
      name: info.name,
      city: info.city,
      country: info.country,
      latitude: info.latitude,
      longitude: info.longitude,
      elevationFt: info.elevationFt,
    }));
    
    try {
      await db.insert(airports)
        .values(values)
        .onConflictDoUpdate({
          target: airports.iataCode,
          set: {
            icaoCode: sql`EXCLUDED.icao_code`,
            name: sql`EXCLUDED.name`,
            city: sql`EXCLUDED.city`,
            country: sql`EXCLUDED.country`,
            latitude: sql`EXCLUDED.latitude`,
            longitude: sql`EXCLUDED.longitude`,
            elevationFt: sql`EXCLUDED.elevation_ft`,
            updatedAt: sql`NOW()`,
          },
        });
      upserted += batch.length;
      console.log(`[Airports] Progress: ${upserted}/${entries.length}`);
    } catch (err) {
      console.error(`[Airports] Batch ${i}-${i + batch.length} failed:`, err);
    }
  }
  
  console.log(`[Airports] Synced ${upserted} airports to database`);
  return upserted;
}

export async function getIcaoMapping(iataCodes: string[]): Promise<Map<string, string>> {
  if (iataCodes.length === 0) return new Map();
  
  const result = await db.select()
    .from(airports)
    .where(inArray(airports.iataCode, iataCodes));
  
  const mapping = new Map<string, string>();
  for (const airport of result) {
    if (airport.icaoCode) {
      mapping.set(airport.iataCode, airport.icaoCode);
    }
  }
  
  return mapping;
}

export async function ensureAirportsSynced(): Promise<void> {
  const result = await db.select({ count: sql<number>`COUNT(*)::int` }).from(airports);
  const count = result[0]?.count ?? 0;
  
  if (count === 0) {
    console.log('[Airports] No airports in database, syncing...');
    await syncAirports();
  } else {
    console.log(`[Airports] Database has ${count} airports`);
  }
}

export function startAirportSyncScheduler(): void {
  setInterval(async () => {
    try {
      await syncAirports();
    } catch (err) {
      console.error('[Airports] Sync failed:', err);
    }
  }, SYNC_INTERVAL_MS);
}
