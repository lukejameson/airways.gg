import * as cheerio from 'cheerio';
import { db, flights, flightStatusHistory, flightTimes, scraperLogs, canUpgradeStatus, routeFlightMinutes, locationToIata } from '@airways/database';
import { eq, and, isNull, sql, count } from 'drizzle-orm';

interface StatusUpdate {
  flightCode: string;
  flightDate: string; // YYYY-MM-DD
  statusTimestamp: Date;
  statusMessage: string;
}

interface ScrapedFlight {
  location: string;
  codes: string[]; // may be multiple for codeshare flights e.g. "GR670, LM670"
  scheduledTime: Date;
  flightDate: string; // YYYY-MM-DD
  type: 'arrivals' | 'departures';
  statusUpdates: StatusUpdate[];
}

const BASE_URL = process.env.GUERNSEY_AIRPORT_URL || 'https://www.airport.gg';
const API_URL = process.env.GUERNSEY_API_URL || 'https://www.airport.gg/arr-dep/json';
const API_KEY = process.env.GUERNSEY_API_KEY;
if (!API_KEY) throw new Error('GUERNSEY_API_KEY environment variable is required');

interface ApiFlightEntry {
  flight_time: string;
  flight_comment: string;
  flight_date: string;
  last_updated: string;
  flight_numbers: string[];
  flight_locations: string[];
  airlines: string[];
}

interface ApiResponse {
  arrivals: ApiFlightEntry[];
  departures: ApiFlightEntry[];
}

async function fetchApiData(): Promise<ApiResponse> {
  const url = `${API_URL}?key=${API_KEY}`;
  console.log(`[Guernsey] Fetching API data → ${url}`);
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from Guernsey API`);
  }
  return response.json() as Promise<ApiResponse>;
}

function mapApiEntriesToScrapedFlights(
  entries: ApiFlightEntry[],
  type: 'arrivals' | 'departures',
  filterDate?: string,
): ScrapedFlight[] {
  const results: ScrapedFlight[] = [];
  for (const entry of entries) {
    if (filterDate && entry.flight_date !== filterDate) continue;
    if (!entry.flight_numbers || entry.flight_numbers.length === 0) continue;

    const timeParts = entry.flight_time.match(/^(\d{1,2}):(\d{2})$/);
    if (!timeParts) continue;
    const hh = parseInt(timeParts[1]);
    const mm = parseInt(timeParts[2]);

    const scheduledTime = new Date(`${entry.flight_date}T00:00:00Z`);
    scheduledTime.setUTCHours(hh, mm, 0, 0);

    const location = entry.flight_locations.join(', ');
    const codes = entry.flight_numbers;
    const statusUpdates: StatusUpdate[] = [];

    if (entry.flight_comment) {
      const lastUpdated = parseInt(entry.last_updated, 10);
      const statusTimestamp = isNaN(lastUpdated) ? new Date() : new Date(lastUpdated * 1000);
      for (const flightCode of codes) {
        statusUpdates.push({
          flightCode,
          flightDate: entry.flight_date,
          statusTimestamp,
          statusMessage: entry.flight_comment,
        });
      }
    }

    results.push({
      location,
      codes,
      scheduledTime,
      flightDate: entry.flight_date,
      type,
      statusUpdates,
    });
  }
  return results;
}

// Known typical flight times in minutes for routes from/to GCI.
// Used to estimate scheduledDeparture/scheduledArrival when only one end is known.


// Map Guernsey Airport location display names → IATA codes

// Derive airline code from the primary flight code (first two non-numeric chars)
// Skybus (SI) and Blue Islands AT6 series (AT) are codeshares under Aurigny (GR)
function airlineCode(flightCode: string): string {
  const match = flightCode.match(/^([A-Z]{2})/);
  const code = match ? match[1] : 'XX';
  if (code === 'SI' || code === 'AT') return 'GR';
  return code;
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

      results.push({ location, codes, scheduledTime, flightDate, type, statusUpdates });
    } catch (err) {
      console.error('[Guernsey] Error parsing row:', err);
    }
  });

  return results;
}

/**
 * Extract hours and minutes from a time string.
 * Handles both "HH:MM" (e.g. "12:10") and "HHMM" (e.g. "1210") formats,
 * since airport.gg inconsistently uses both.
 */
function parseHHMM(text: string): { hh: number; mm: number } | null {
  // Try colon-separated first: "12:10", "9:05"
  const colonMatch = text.match(/(\d{1,2}):(\d{2})/);
  if (colonMatch) return { hh: parseInt(colonMatch[1]), mm: parseInt(colonMatch[2]) };
  // Try 4-digit no-colon: "1210", "0905" — only match standalone 4-digit groups
  // to avoid matching dates or other numbers
  const noColonMatch = text.match(/(?<!\d)(\d{2})(\d{2})(?!\d)/);
  if (noColonMatch) {
    const hh = parseInt(noColonMatch[1]);
    const mm = parseInt(noColonMatch[2]);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) return { hh, mm };
  }
  return null;
}

/**
 * Parse an HH:MM or HHMM time from a status message and return it as a Date
 * on the same day as the reference date, or null if no time found.
 */
function parseTimeFromMessage(message: string, referenceDate: Date): Date | null {
  const parsed = parseHHMM(message);
  if (!parsed) return null;
  const t = new Date(referenceDate);
  t.setHours(parsed.hh, parsed.mm, 0, 0);
  return t;
}

/**
 * Derive a normalised status string from status updates.
 * Maps raw airport.gg messages to a normalised vocabulary:
 * Scheduled, On Time, Boarding, Delayed, Airborne, Landed, Cancelled.
 *
 * Priority: scan ALL updates for terminal statuses first (landed/airborne/cancelled),
 * then derive from the most recent update.
 *
 * For "Approx HH:MM" messages, compares the time against scheduledTime to determine
 * whether the flight is actually delayed, on time, or early.
 */
function deriveStatus(updates: StatusUpdate[], scheduledTime: Date): string | null {
  if (updates.length === 0) return null;

  // Scan all updates for terminal/important statuses (latest wins)
  for (const u of [...updates].reverse()) {
    const msg = u.statusMessage.toLowerCase();
    if (msg.includes('landed') || msg.includes('voyagereported')) return 'Landed';
    if (msg.includes('airborne')) return 'Airborne';
    // Preserve diversion details — the raw message carries the destination
    if (msg.includes('diverted')) return u.statusMessage;
    if (msg.includes('diverting')) return u.statusMessage;
  }

  // Now check the latest update for non-terminal statuses
  const last = updates[updates.length - 1].statusMessage.toLowerCase();
  if (last.includes('cancelled') || last.includes('canceled') || last.includes('flight cancelled')) return 'Cancelled';

  // For "Approx HH:MM" without an explicit "delayed" keyword, compare the time
  // to the scheduled time — it might be on time or even early.
  if (last.includes('approx') && !last.includes('delayed')) {
    const approxTime = parseTimeFromMessage(updates[updates.length - 1].statusMessage, scheduledTime);
    if (approxTime) {
      const diffMs = approxTime.getTime() - scheduledTime.getTime();
      const diffMins = Math.round(diffMs / 60_000);
      // Allow a 5-minute tolerance — anything within 5 mins of scheduled is "on time"
      if (diffMins <= 5) return 'Scheduled';
      return 'Delayed';
    }
    // No time in the message — fall through to generic delay handling
  }

  // Delay indicators: "Flight Delayed", "Delayed To HH:MM", "Expected at HH:MM",
  // "New ETD HH:MM", "Next Info HH:MM", "Indefinite Delay", "Boarding Expected HH:MM"
  if (last.includes('delayed') || last.includes('expected at') ||
      last.includes('new etd') || last.includes('next info') || last.includes('indefini') ||
      last.includes('boarding expected')) return 'Delayed';
  // Check-in phase — distinct from Boarding (passengers aren't at the gate yet)
  if (last.includes('check in open') || last.includes('check-in open') ||
      last.includes('go to departure')) return 'Check-In Open';
  // Boarding-related: "Final Call", "Go To Door/Gate", "Door and Gate Closed",
  // "Wait In Lounge"
  if (last.includes('final call') || last.includes('go to door') || last.includes('go to gate') ||
      last.includes('gate closed') || last.includes('door and gate') ||
      last.includes('wait in lounge')) return 'Boarding';
  if (last.includes('check in suspended') || last.includes('check in closes') ||
      last.includes('check-in closes') || last.includes('check in opens')) return 'Delayed';
  if (last.includes('holding overhead') || last.includes('holding in')) return 'Airborne';
  if (last.includes('on time')) return 'Scheduled';
  if (last.includes('pax on') || last.includes('pax from') || last.includes('passengers on') ||
      last.includes('passengers from')) return 'Scheduled';

  // Return the raw message for anything truly unknown
  return updates[updates.length - 1].statusMessage;
}

/**
 * Extract actual time from status messages like "Landed 12:14" or "Airborne at 06:49".
 */
function extractActualTime(updates: StatusUpdate[], keyword: string): Date | null {
  for (const u of [...updates].reverse()) {
    if (u.statusMessage.toLowerCase().includes(keyword.toLowerCase())) {
      const parsed = parseHHMM(u.statusMessage);
      if (parsed) {
        const t = new Date(u.statusTimestamp);
        t.setHours(parsed.hh, parsed.mm, 0, 0);
        return t;
      }
    }
  }
  return null;
}

/** Returns true if any status message indicates the flight was cancelled. */
function extractCanceled(updates: StatusUpdate[]): boolean {
  return updates.some(u => {
    const msg = u.statusMessage.toLowerCase();
    return msg.includes('cancelled') || msg.includes('canceled');
  });
}

/**
 * Scans status updates in reverse for time-bearing messages:
 *   - "Delayed To HH:MM"
 *   - "Approx HH:MM" (estimated arrival/departure time from the airport board)
 *
 * Returns the delay in minutes relative to scheduledTime (can be 0 for on-time,
 * negative values are clamped to 0), or null if no time-bearing message found.
 */
function extractDelayMinutes(updates: StatusUpdate[], scheduledTime: Date): number | null {
  for (const u of [...updates].reverse()) {
    const msg = u.statusMessage.toLowerCase();
    // Match any time-bearing delay message: "Delayed To HH:MM", "Approx HH:MM",
    // "New ETD HH:MM", "Expected at HH:MM", "Delayed until HH:MM", "Boarding Expected HH:MM"
    if (msg.includes('delayed to') || msg.startsWith('approx') || msg.includes('new etd') ||
        msg.includes('expected at') || msg.includes('delayed until') || msg.includes('boarding expected') ||
        msg.includes('flight delayed to approx')) {
      const parsed = parseHHMM(u.statusMessage);
      if (parsed) {
        const estimatedTime = new Date(scheduledTime);
        estimatedTime.setHours(parsed.hh, parsed.mm, 0, 0);
        const diffMs = estimatedTime.getTime() - scheduledTime.getTime();
        const diffMins = Math.round(diffMs / 60_000);
        // Within 5 minutes of scheduled is considered on-time (not delayed)
        if (diffMins <= 5) return 0;
        return diffMins;
      }
    }
  }
  return null;
}

/**
 * Extract estimated time from "Delayed To HH:MM" or "Approx HH:MM" messages.
 * Returns the absolute estimated time for use in flightTimes (EstimatedBlockOff/On).
 * Returns the time even if it's earlier than scheduled (early arrival/departure).
 */
function extractEstimatedTime(updates: StatusUpdate[], scheduledTime: Date): Date | null {
  for (const u of [...updates].reverse()) {
    const msg = u.statusMessage.toLowerCase();
    // Match any time-bearing delay/estimate message
    if (msg.includes('delayed to') || msg.startsWith('approx') || msg.includes('new etd') ||
        msg.includes('expected at') || msg.includes('delayed until') || msg.includes('boarding expected') ||
        msg.includes('flight delayed to approx')) {
      const parsed = parseHHMM(u.statusMessage);
      if (parsed) {
        const estimated = new Date(scheduledTime);
        estimated.setHours(parsed.hh, parsed.mm, 0, 0);
        return estimated;
      }
    }
  }
  return null;
}

/** Inserts or updates a flightTimes row keyed on (flightId, timeType). */
async function upsertFlightTime(flightId: number, timeType: string, timeValue: Date): Promise<void> {
  await db
    .insert(flightTimes)
    .values({ flightId, timeType, timeValue })
    .onConflictDoUpdate({
      target: [flightTimes.flightId, flightTimes.timeType],
      set: { timeValue },
    });
}

/**
 * Upsert a flight into the flights table and return its id.
 * Uses flight_number + flight_date as the natural key for historical data
 * (historical flights use flightNumber_date format for unique_id).
 */
async function upsertFlight(scrapedFlight: ScrapedFlight): Promise<number | null> {
  // Use the primary (first) flight code — codeshares share the same flight record
  const primaryCode = scrapedFlight.codes[0];
  const otherIata = locationToIata(scrapedFlight.location);

  const departureAirport = scrapedFlight.type === 'departures' ? 'GCI' : otherIata;
  const arrivalAirport   = scrapedFlight.type === 'departures' ? otherIata : 'GCI';

  // airport.gg shows the relevant endpoint time:
  //   departures → scheduled departure time from GCI
  //   arrivals   → scheduled arrival time at GCI
  // Use route-specific flight duration to estimate the other end.
  const flightMins = routeFlightMinutes(otherIata);
  let scheduledDeparture: Date;
  let scheduledArrival: Date;
  if (scrapedFlight.type === 'departures') {
    scheduledDeparture = scrapedFlight.scheduledTime;
    scheduledArrival   = new Date(scheduledDeparture.getTime() + flightMins * 60_000);
  } else {
    scheduledArrival   = scrapedFlight.scheduledTime;
    scheduledDeparture = new Date(scheduledArrival.getTime() - flightMins * 60_000);
  }

  const actualDeparture = scrapedFlight.type === 'departures'
    ? extractActualTime(scrapedFlight.statusUpdates, 'Airborne')
    : null;
  const actualArrival = scrapedFlight.type === 'arrivals'
    ? extractActualTime(scrapedFlight.statusUpdates, 'Landed')
    : null;

  const status = deriveStatus(scrapedFlight.statusUpdates, scrapedFlight.scheduledTime);
  const canceled = extractCanceled(scrapedFlight.statusUpdates);
  // For departures, "Delayed To HH:MM" / "Approx HH:MM" refers to the new departure time.
  // For arrivals, it refers to the new arrival time.
  const delayBaseTime = scrapedFlight.type === 'departures' ? scheduledDeparture : scheduledArrival;
  const delayMinutes = extractDelayMinutes(scrapedFlight.statusUpdates, delayBaseTime);
  const estimatedTime = extractEstimatedTime(scrapedFlight.statusUpdates, delayBaseTime);

  // Build the update set — only include fields that have data to avoid
  // overwriting richer data from other scrapers with nulls.
  const updateSet: Record<string, unknown> = {
    updatedAt: new Date(),
  };
  if (actualDeparture)        updateSet.actualDeparture = actualDeparture;
  if (actualArrival)          updateSet.actualArrival   = actualArrival;
  if (status)                 updateSet.status          = status;
  if (canceled)               updateSet.canceled        = canceled;
  if (delayMinutes !== null)  updateSet.delayMinutes    = delayMinutes;

  try {
    // First check if a flight already exists for this flight_number + flight_date.
    // This catches records created by other scrapers (e.g. numeric unique_ids from fr24)
    // and avoids creating duplicates.
    const existing = await db
      .select({ id: flights.id, status: flights.status })
      .from(flights)
      .where(
        and(
          eq(flights.flightNumber, primaryCode),
          eq(flights.flightDate, scrapedFlight.flightDate),
        ),
      )
      .limit(1);

    let flightId: number | null;

    if (existing.length > 0) {
      // Safety net: don't downgrade status (e.g. stale re-parse overwriting Landed)
      // Exception: allow "Delayed" → "Scheduled" when the approx time shows the flight
      // is actually on-time (corrects earlier mis-classification)
      const isDelayedCorrection = existing[0].status === 'Delayed' && status === 'Scheduled';
      if (status && !isDelayedCorrection && !canUpgradeStatus(existing[0].status, status)) {
        delete updateSet.status;
      }
      if (isDelayedCorrection && delayMinutes === 0) {
        updateSet.delayMinutes = 0;
      }

      // Update the existing record (may have been created by another scraper or a previous guernsey scrape)
      flightId = existing[0].id;
      if (Object.keys(updateSet).length > 1) { // > 1 because updatedAt is always present
        await db
          .update(flights)
          .set(updateSet)
          .where(eq(flights.id, flightId));
      }
    } else {
      // No existing record — insert a new one with guernsey unique_id
      const uniqueId = `${primaryCode}_${scrapedFlight.flightDate}`;
      const result = await db
        .insert(flights)
        .values({
          uniqueId,
          flightNumber: primaryCode,
          airlineCode: airlineCode(primaryCode),
          departureAirport,
          arrivalAirport,
          scheduledDeparture,
          scheduledArrival,
          actualDeparture:  actualDeparture ?? undefined,
          actualArrival:    actualArrival ?? undefined,
          status:           status ?? undefined,
          canceled,
          delayMinutes:     delayMinutes ?? undefined,
          flightDate:       scrapedFlight.flightDate,
        })
        .onConflictDoUpdate({ target: flights.uniqueId, set: updateSet as any })
        .returning({ id: flights.id });
      flightId = result[0]?.id ?? null;
    }

    // Write estimated time to flightTimes so the web app can display it.
    // Departures use EstimatedBlockOff (pushback time), arrivals use EstimatedBlockOn (landing time).
    if (flightId !== null && estimatedTime !== null) {
      const timeType = scrapedFlight.type === 'departures' ? 'EstimatedBlockOff' : 'EstimatedBlockOn';
      await upsertFlightTime(flightId, timeType, estimatedTime);
    }

    return flightId;
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

/**
 * One-shot deduplication: when multiple scrapers created rows for the same
 * flight_number + flight_date (e.g. numeric unique_id from fr24 and
 * flightNumber_date unique_id from guernsey), keep the numeric-id record
 * (typically richer data) and delete the guernsey duplicate.
 * Also repoints any flight_status_history rows.
 */
export async function deduplicateFlights(): Promise<number> {
  console.log('[Guernsey] Deduplicating flights (overlapping scraper records)...');

  // Find guernsey records (unique_id contains '_') that have a matching
  // numeric-id record for the same flight_number + flight_date
  const guernseyRecords = await db
    .select({
      id: flights.id,
      flightNumber: flights.flightNumber,
      flightDate: flights.flightDate,
    })
    .from(flights)
    .where(sql`position('_' in ${flights.uniqueId}) > 0`);

  if (guernseyRecords.length === 0) {
    console.log('[Guernsey] No guernsey-format records found');
    return 0;
  }

  // For each guernsey record, check if a numeric-id record exists
  const dupes: { guernseyId: number; keepId: number }[] = [];
  for (const g of guernseyRecords) {
    const numericMatch = await db
      .select({ id: flights.id })
      .from(flights)
      .where(
        and(
          eq(flights.flightNumber, g.flightNumber),
          eq(flights.flightDate, g.flightDate),
          sql`position('_' in ${flights.uniqueId}) = 0`,
        ),
      )
      .limit(1);

    if (numericMatch.length > 0) {
      dupes.push({ guernseyId: g.id, keepId: numericMatch[0].id });
    }
  }

  if (dupes.length === 0) {
    console.log('[Guernsey] No duplicates found');
    return 0;
  }

  console.log(`[Guernsey] Found ${dupes.length} duplicate pairs`);

  let deleted = 0;
  for (const { guernseyId: guernsey_id, keepId: keep_id } of dupes) {
    // Repoint status history from guernsey record to the kept record
    await db
      .update(flightStatusHistory)
      .set({ flightId: keep_id })
      .where(eq(flightStatusHistory.flightId, guernsey_id));

    // Delete guernsey flight_times (can't just update — may conflict on unique constraint)
    await db.delete(flightTimes).where(eq(flightTimes.flightId, guernsey_id));

    // Delete the guernsey duplicate flight
    await db.delete(flights).where(eq(flights.id, guernsey_id));
    deleted++;
  }

  console.log(`[Guernsey] Deleted ${deleted} duplicate guernsey records`);
  return deleted;
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

/**
 * Scrape all arrivals and departures for a single date.
 * Used by live mode to poll today (and optionally tomorrow).
 */
export async function scrapeDayFlights(date: Date): Promise<{ flights: number; updates: number }> {
  const html = await fetchDayHtml(date);
  let totalFlights = 0;
  let totalUpdates = 0;

  for (const type of ['arrivals', 'departures'] as const) {
    const scrapedFlights = parseFlightHtml(html, date, type);
    totalFlights += scrapedFlights.length;

    for (const flight of scrapedFlights) {
      const flightId = await upsertFlight(flight);
      totalUpdates += await saveStatusUpdates(flight.statusUpdates, flightId);
    }
  }

  return { flights: totalFlights, updates: totalUpdates };
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
