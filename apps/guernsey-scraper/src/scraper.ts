import * as cheerio from 'cheerio';
import { db, flights, flightStatusHistory, scraperLogs } from '@delays/database';
import { eq, and, isNull } from 'drizzle-orm';

interface StatusUpdate {
  flightCode: string;
  flightDate: string; // YYYY-MM-DD
  statusTimestamp: Date;
  statusMessage: string;
}

interface ScrapedFlight {
  airline: string;
  location: string;
  codes: string[]; // may be multiple for codeshare flights e.g. "GR670, LM670"
  scheduledTime: Date;
  flightDate: string; // YYYY-MM-DD
  type: 'arrivals' | 'departures';
  statusUpdates: StatusUpdate[];
}

const BASE_URL = process.env.GUERNSEY_AIRPORT_URL || 'https://www.airport.gg';

// Map Guernsey Airport location display names → IATA codes
const LOCATION_TO_IATA: Record<string, string> = {
  'Alderney': 'ACI',
  'Jersey': 'JER',
  'London Gatwick': 'LGW',
  'Gatwick': 'LGW',
  'London City': 'LCY',
  'Manchester': 'MAN',
  'Bristol': 'BRS',
  'Bristol, Exeter': 'BRS',
  'Exeter, Bristol': 'BRS',
  'Exeter': 'EXT',
  'Birmingham': 'BHX',
  'Southampton': 'SOU',
  'Paris': 'CDG',
  'Paris - Charles De Gaulle': 'CDG',
  'Paris Charles De Gaulle': 'CDG',
  'East Midlands': 'EMA',
  'Dublin': 'DUB',
  'Edinburgh': 'EDI',
  'Guernsey': 'GCI',
};

function locationToIata(location: string): string {
  // Exact match first
  if (LOCATION_TO_IATA[location]) return LOCATION_TO_IATA[location];
  // Partial match — handles multi-stop strings like "Bristol, Exeter"
  for (const [name, iata] of Object.entries(LOCATION_TO_IATA)) {
    if (location.toLowerCase().includes(name.toLowerCase())) return iata;
  }
  // Unknown — return a truncated slug so it still stores
  return location.slice(0, 10).toUpperCase().replace(/\s+/g, '');
}

// Derive airline code from the primary flight code (first two non-numeric chars)
function airlineCode(flightCode: string): string {
  const match = flightCode.match(/^([A-Z]{2})/);
  return match ? match[1] : 'XX';
}

async function fetchDayHtml(date: Date): Promise<string> {
  // airport.gg uses DDMMYYYY in the URL path under /arrivals-departures/history/
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const formattedDate = `${day}${month}${year}`;

  const url = `${BASE_URL}/arrivals-departures/history/${formattedDate}`;
  const dateStr = `${year}-${month}-${day}`;

  console.log(`[Guernsey] Fetching ${dateStr} → ${url}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-GB,en;q=0.5',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.text();
}

function parseFlightHtml(html: string, date: Date, type: 'arrivals' | 'departures'): ScrapedFlight[] {
  const $ = cheerio.load(html);
  const tableId = type === 'arrivals' ? '#table-arrivals' : '#table-departures';

  const results: ScrapedFlight[] = [];
  const flightDate = date.toISOString().split('T')[0];

  $(`${tableId} tbody.list tr[data-search="true"]`).each((_, row) => {
    try {
      const cells = $(row).find('td').toArray();
      if (cells.length < 5) return;

      const airline = $(cells[0]).find('span').first().text().trim() || $(cells[0]).text().trim() || 'Unknown';
      const timeStr = $(cells[1]).text().trim();
      const [hh, mm] = timeStr.split(':').map(Number);

      if (isNaN(hh) || isNaN(mm)) return;

      const scheduledTime = new Date(date);
      scheduledTime.setHours(hh, mm, 0, 0);

      const location = $(cells[2]).text().trim();

      // Codeshare rows show multiple codes separated by commas e.g. "GR670, LM670"
      // Split and trim each, keep only non-empty codes within varchar(20) limit
      const codes = $(cells[3]).text().trim()
        .split(',')
        .map(c => c.trim())
        .filter(c => c.length > 0 && c.length <= 20);

      if (codes.length === 0) return;

      const statusUpdates: StatusUpdate[] = [];

      // Each status update has a separate span.datetime and span.comment
      // e.g. <span class="datetime">23/02/2026 09:16:</span> <span class="comment">Delayed To 10:40</span>
      $(cells[4]).find('div.status-change').each((_, div) => {
        const datetimeRaw = $(div).find('span.datetime').text().trim();
        const comment = $(div).find('span.comment').text().trim();

        if (!comment) return;

        // Parse "DD/MM/YYYY HH:MM:" from the dedicated datetime span
        const tsMatch = datetimeRaw.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
        if (tsMatch) {
          const [, d, mo, y, h, mi] = tsMatch;
          const statusTimestamp = new Date(
            parseInt(y), parseInt(mo) - 1, parseInt(d), parseInt(h), parseInt(mi), 0,
          );
          if (!isNaN(statusTimestamp.getTime())) {
            for (const flightCode of codes) {
              statusUpdates.push({ flightCode, flightDate, statusTimestamp, statusMessage: comment });
            }
          }
          return;
        }

        // Fallback: no parseable datetime — use time of scrape
        for (const flightCode of codes) {
          statusUpdates.push({
            flightCode,
            flightDate,
            statusTimestamp: new Date(),
            statusMessage: comment,
          });
        }
      });

      results.push({ airline, location, codes, scheduledTime, flightDate, type, statusUpdates });
    } catch (err) {
      console.error('[Guernsey] Error parsing row:', err);
    }
  });

  return results;
}

/**
 * Derive final status from status updates.
 * Picks the most meaningful terminal status from the update list.
 */
function deriveStatus(updates: StatusUpdate[]): string | null {
  if (updates.length === 0) return null;
  const last = updates[updates.length - 1].statusMessage.toLowerCase();
  if (last.includes('landed')) return 'Landed';
  if (last.includes('airborne')) return 'Airborne';
  if (last.includes('cancelled') || last.includes('canceled')) return 'Cancelled';
  if (last.includes('voyagereported')) return 'Completed';
  return updates[updates.length - 1].statusMessage;
}

/**
 * Extract actual time from status messages like "Landed 12:14" or "Airborne at 06:49".
 */
function extractActualTime(updates: StatusUpdate[], keyword: string): Date | null {
  for (const u of [...updates].reverse()) {
    if (u.statusMessage.toLowerCase().includes(keyword.toLowerCase())) {
      const match = u.statusMessage.match(/(\d{1,2}):(\d{2})/);
      if (match) {
        const t = new Date(u.statusTimestamp);
        t.setHours(parseInt(match[1]), parseInt(match[2]), 0, 0);
        return t;
      }
    }
  }
  return null;
}

/**
 * Upsert a flight into the flights table and return its id.
 * Uses flight_number + flight_date as the natural key for historical data
 * (we don't have Aurigny's unique_id for historical flights).
 */
async function upsertFlight(scrapedFlight: ScrapedFlight): Promise<number | null> {
  // Use the primary (first) flight code — codeshares share the same flight record
  const primaryCode = scrapedFlight.codes[0];
  const otherIata = locationToIata(scrapedFlight.location);

  const departureAirport = scrapedFlight.type === 'departures' ? 'GCI' : otherIata;
  const arrivalAirport   = scrapedFlight.type === 'departures' ? otherIata : 'GCI';

  // Scheduled arrival: we only have scheduled departure time from the site.
  // Estimate +1h for arrival (we'll get real times from status updates).
  const scheduledDeparture = scrapedFlight.scheduledTime;
  const scheduledArrival   = new Date(scheduledDeparture.getTime() + 60 * 60 * 1000);

  const actualDeparture = scrapedFlight.type === 'departures'
    ? extractActualTime(scrapedFlight.statusUpdates, 'Airborne')
    : null;
  const actualArrival = scrapedFlight.type === 'arrivals'
    ? extractActualTime(scrapedFlight.statusUpdates, 'Landed')
    : null;

  const status = deriveStatus(scrapedFlight.statusUpdates);

  // unique_id for historical flights: "<flightNumber>_<flightDate>"
  // Aurigny scraper uses its own unique_id format — these won't clash since
  // Aurigny's format is derived from their internal XML UniqueId field.
  const uniqueId = `${primaryCode}_${scrapedFlight.flightDate}`;

  // Build the conflict update set — only include fields we actually have values for
  const updateSet: Record<string, unknown> = {};
  if (actualDeparture) updateSet.actualDeparture = actualDeparture;
  if (actualArrival)   updateSet.actualArrival   = actualArrival;
  if (status)          updateSet.status          = status;

  try {
    let result: { id: number }[];

    if (Object.keys(updateSet).length > 0) {
      result = await db
        .insert(flights)
        .values({
          uniqueId,
          flightNumber: primaryCode,
          airlineCode: airlineCode(primaryCode),
          departureAirport,
          arrivalAirport,
          scheduledDeparture,
          scheduledArrival,
          actualDeparture: actualDeparture ?? undefined,
          actualArrival:   actualArrival ?? undefined,
          status:          status ?? undefined,
          flightDate:      scrapedFlight.flightDate,
        })
        .onConflictDoUpdate({ target: flights.uniqueId, set: updateSet as any })
        .returning({ id: flights.id });
    } else {
      // No actual times/status yet — insert if new, skip if already exists
      result = await db
        .insert(flights)
        .values({
          uniqueId,
          flightNumber: primaryCode,
          airlineCode: airlineCode(primaryCode),
          departureAirport,
          arrivalAirport,
          scheduledDeparture,
          scheduledArrival,
          flightDate: scrapedFlight.flightDate,
        })
        .onConflictDoNothing()
        .returning({ id: flights.id });

      // If onConflictDoNothing fired (row already existed), fetch its id
      if (result.length === 0) {
        const existing = await db
          .select({ id: flights.id })
          .from(flights)
          .where(eq(flights.uniqueId, uniqueId))
          .limit(1);
        result = existing;
      }
    }

    return result[0]?.id ?? null;
  } catch (err) {
    console.error(`[Guernsey] Error upserting flight ${primaryCode} on ${scrapedFlight.flightDate}:`, err);
    return null;
  }
}

async function saveStatusUpdates(updates: StatusUpdate[], flightId: number | null): Promise<number> {
  let saved = 0;
  for (const u of updates) {
    try {
      await db
        .insert(flightStatusHistory)
        .values({
          flightCode:      u.flightCode,
          flightDate:      u.flightDate,
          statusTimestamp: u.statusTimestamp,
          statusMessage:   u.statusMessage,
          source:          'guernsey_airport',
          flightId:        flightId ?? undefined,
        })
        .onConflictDoNothing();
      saved++;
    } catch (err) {
      console.error(`[Guernsey] Error saving update for ${u.flightCode}:`, err);
    }
  }
  return saved;
}

/**
 * One-shot linker: for any existing flight_status_history rows where flight_id
 * is NULL, attempt to match them to a flights row by flight_code + flight_date.
 */
export async function linkOrphanedStatusHistory(): Promise<number> {
  console.log('[Guernsey] Linking orphaned flight_status_history rows...');

  // Get all distinct (flight_code, flight_date) pairs that are unlinked
  const orphans = await db
    .selectDistinct({
      flightCode: flightStatusHistory.flightCode,
      flightDate: flightStatusHistory.flightDate,
    })
    .from(flightStatusHistory)
    .where(isNull(flightStatusHistory.flightId));

  console.log(`[Guernsey] Found ${orphans.length} unlinked (flight_code, flight_date) pairs`);

  let linked = 0;
  for (const orphan of orphans) {
    const match = await db
      .select({ id: flights.id })
      .from(flights)
      .where(
        and(
          eq(flights.flightNumber, orphan.flightCode),
          eq(flights.flightDate,   orphan.flightDate),
        ),
      )
      .limit(1);

    if (match.length === 0) continue;

    await db
      .update(flightStatusHistory)
      .set({ flightId: match[0].id })
      .where(
        and(
          eq(flightStatusHistory.flightCode, orphan.flightCode),
          eq(flightStatusHistory.flightDate, orphan.flightDate),
        ),
      );

    linked++;
  }

  console.log(`[Guernsey] Linked ${linked} / ${orphans.length} pairs`);
  return linked;
}

async function scrapeDateRange(
  startDate: Date,
  endDate: Date,
  onProgress?: (current: Date, total: number, completed: number) => void,
): Promise<{ totalFlights: number; totalUpdates: number }> {
  const dates: Date[] = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d));
  }

  console.log(`[Guernsey] Scraping ${dates.length} days: ${startDate.toISOString().split('T')[0]} → ${endDate.toISOString().split('T')[0]}`);

  let totalFlights = 0;
  let totalUpdates = 0;

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const dateStr = date.toISOString().split('T')[0];

    if (onProgress) onProgress(date, dates.length, i + 1);
    console.log(`[Guernsey] ${dateStr} (${i + 1}/${dates.length})`);

    // Polite delay between days — avoid rate-limiting
    if (i > 0) {
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
    }

    try {
      // Fetch once per day — both arrivals and departures are on the same page
      const html = await fetchDayHtml(date);

      for (const type of ['arrivals', 'departures'] as const) {
        const scrapedFlights = await parseFlightHtml(html, date, type);
        console.log(`  ${type}: ${scrapedFlights.length} flights`);
        totalFlights += scrapedFlights.length;

        for (const flight of scrapedFlights) {
          // 1. Upsert the flight record → get its DB id
          const flightId = await upsertFlight(flight);
          // 2. Save status updates, linked to the flight
          totalUpdates += await saveStatusUpdates(flight.statusUpdates, flightId);
        }
      }
    } catch (err) {
      const msg = `Error on ${dateStr}: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[Guernsey] ${msg}`);

      await db.insert(scraperLogs).values({
        service: 'guernsey_historical',
        status: 'failure',
        errorMessage: msg,
        startedAt: new Date(),
        completedAt: new Date(),
      });
      // Continue to next day rather than aborting the whole backfill
    }
  }

  return { totalFlights, totalUpdates };
}

export async function runBackfill(
  startDateStr?: string,
  endDateStr?: string,
  onProgress?: (current: Date, total: number, completed: number) => void,
): Promise<void> {
  const startDate = new Date(startDateStr || '2019-01-01');
  const endDate   = new Date(endDateStr   || new Date().toISOString().split('T')[0]);

  console.log(`[Guernsey] Starting historical backfill: ${startDate.toISOString().split('T')[0]} → ${endDate.toISOString().split('T')[0]}`);

  const logEntry = await db
    .insert(scraperLogs)
    .values({ service: 'guernsey_historical', status: 'retry', startedAt: new Date() })
    .returning({ id: scraperLogs.id });
  const logId = logEntry[0].id;

  try {
    const t0 = Date.now();
    const { totalFlights, totalUpdates } = await scrapeDateRange(startDate, endDate, onProgress);

    // Link any status rows whose flight_id is still null (e.g. codeshare codes
    // that don't have their own flights row)
    await linkOrphanedStatusHistory();

    const duration = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[Guernsey] Backfill done in ${duration}s — flights: ${totalFlights}, updates: ${totalUpdates}`);

    await db
      .update(scraperLogs)
      .set({ status: 'success', recordsScraped: totalUpdates, completedAt: new Date() })
      .where(eq(scraperLogs.id, logId));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Guernsey] Backfill failed:', message);

    await db
      .update(scraperLogs)
      .set({ status: 'failure', errorMessage: message, completedAt: new Date() })
      .where(eq(scraperLogs.id, logId));

    throw err;
  }
}
