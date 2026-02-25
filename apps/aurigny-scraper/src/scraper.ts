import { connect } from 'puppeteer-real-browser';
import { XMLParser } from 'fast-xml-parser';
import { db, flights as flightsTable, flightDelays, flightTimes, flightNotes, scraperLogs } from '@delays/database';
import { eq } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Timezone utility
// ---------------------------------------------------------------------------

const GY_TZ = 'Europe/London'; // Guernsey shares Europe/London (UTC+0 / BST+1)

/**
 * Returns a date string in YYYY-MM-DD format for the given UTC Date converted
 * to Guernsey local time. Defaults to now.
 *
 * Using en-CA locale because it formats as YYYY-MM-DD (ISO date) natively.
 */
export function guernseyDateStr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: GY_TZ }).format(d);
}

// ---------------------------------------------------------------------------
// Proxy helpers
// ---------------------------------------------------------------------------

interface ProxyConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

function getProxyList(): ProxyConfig[] {
  const enabled = process.env.PROXY_ENABLED === 'true';
  if (!enabled) {
    return [];
  }

  const username = process.env.PROXY_USERNAME;
  const password = process.env.PROXY_PASSWORD;
  const hostsStr = process.env.PROXY_HOSTS;

  if (!username || !password || !hostsStr) {
    console.warn('[Aurigny] Proxy enabled but credentials/hosts not configured');
    return [];
  }

  const hosts = hostsStr.split(',').map(h => h.trim()).filter(Boolean);
  
  return hosts.map(host => {
    const [ip, portStr] = host.split(':');
    return {
      host: ip,
      port: parseInt(portStr || '8080'),
      username,
      password,
    };
  });
}

function getRandomProxy(proxies: ProxyConfig[]): ProxyConfig | null {
  if (proxies.length === 0) return null;
  return proxies[Math.floor(Math.random() * proxies.length)];
}

// ---------------------------------------------------------------------------
// Flight parsing types
// ---------------------------------------------------------------------------

interface ParsedDelay {
  code?: string;
  code2?: string;
  minutes: number;
}

interface ParsedTime {
  type: string;
  value: Date;
}

interface ParsedNote {
  timestamp: Date;
  type?: string;
  message: string;
}

interface ScrapedFlight {
  uniqueId: string;
  airlineCode: string;
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  scheduledDeparture: Date;
  scheduledArrival: Date;
  actualDeparture?: Date;
  actualArrival?: Date;
  status: string;
  canceled: boolean;
  aircraftRegistration?: string;
  aircraftType?: string;
  flightDate: string;
  delays: ParsedDelay[];
  times: ParsedTime[];
  notes: ParsedNote[];
}

// ---------------------------------------------------------------------------
// Anti-bot helpers
// ---------------------------------------------------------------------------

function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, ms));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function simulateHumanBehavior(page: any): Promise<void> {
  const scrollCount = Math.floor(Math.random() * 3) + 1;
  for (let i = 0; i < scrollCount; i++) {
    await page.evaluate(new Function('amount', 'window.scrollBy(0, amount)') as (a: number) => void, Math.floor(Math.random() * 300) + 100);
    await randomDelay(500, 1500);
  }
  for (let i = 0; i < Math.floor(Math.random() * 5) + 3; i++) {
    await page.mouse.move(
      Math.floor(Math.random() * 800) + 100,
      Math.floor(Math.random() * 600) + 100,
      { steps: Math.floor(Math.random() * 5) + 3 },
    );
    await randomDelay(200, 800);
  }
}

// ---------------------------------------------------------------------------
// XML parsing
// ---------------------------------------------------------------------------

function parseDate(val: unknown): Date | undefined {
  if (!val) return undefined;
  const d = new Date(val as string);
  return isNaN(d.getTime()) ? undefined : d;
}

function parseFlightXml(xmlData: string): ScrapedFlight[] {
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true, parseAttributeValue: true });
  const result = parser.parse(xmlData);
  const envelope = result?.['soap:Envelope']?.['soap:Body']?.['GetFlightsResponse']?.['GetFlightsResult']?.['Flight'];
  const rawList = Array.isArray(envelope) ? envelope : envelope ? [envelope] : [];
  const parsed: ScrapedFlight[] = [];

  for (const f of rawList) {
    try {
      const scheduledDeparture = parseDate(f.STD);
      const scheduledArrival = parseDate(f.STA);
      if (!scheduledDeparture || !scheduledArrival) continue;

      // Times: API returns <Times><Time><Type>X</Type><DateTime>Y</DateTime></Time>...</Times>
      const timeMap = new Map<string, Date>();
      if (f.Times?.Time) {
        const rawTimes = Array.isArray(f.Times.Time) ? f.Times.Time : [f.Times.Time];
        for (const t of rawTimes) {
          const d = parseDate(t.DateTime);
          if (d && t.Type) timeMap.set(String(t.Type), d);
        }
      }
      const times: ParsedTime[] = Array.from(timeMap.entries()).map(([type, value]) => ({ type, value }));

      // Delays: API returns <Delays><Delay1>...</Delay1><Delay2>...</Delay2></Delays>
      const delays: ParsedDelay[] = [];
      if (f.Delays && typeof f.Delays === 'object') {
        for (const key of Object.keys(f.Delays)) {
          if (key.startsWith('Delay')) {
            const d = f.Delays[key];
            if (d && d.Minutes != null) {
              const mins = Math.round(Number(d.Minutes));
              if (Number.isFinite(mins) && mins >= 0 && mins <= 1440) {
                delays.push({ code: d.Code ? String(d.Code) : undefined, code2: d.Code2 ? String(d.Code2) : undefined, minutes: mins });
              }
            }
          }
        }
      }
      if (delays.length === 0 && f.DelayMinutes != null) {
        const mins = Math.round(Number(f.DelayMinutes));
        if (Number.isFinite(mins) && mins >= 0 && mins <= 1440) {
          delays.push({ minutes: mins });
        }
      }

      const notes: ParsedNote[] = [];
      if (f.Notes?.Note) {
        const raw = Array.isArray(f.Notes.Note) ? f.Notes.Note : [f.Notes.Note];
        for (const n of raw) {
          const ts = parseDate(n.Timestamp);
          if (ts) notes.push({ timestamp: ts, type: n.Type, message: String(n.Message || '') });
        }
      }

      parsed.push({
        uniqueId: String(f.UniqueId || ''),
        airlineCode: String(f.AirlineCode || ''),
        flightNumber: `${f.AirlineCode || ''}${f.FlightNumber || ''}`,
        departureAirport: String(f.DepartureAirportCode || ''),
        arrivalAirport: String(f.ArrivalAirportCode || ''),
        scheduledDeparture, scheduledArrival,
        actualDeparture: timeMap.get('ActualBlockOff'),
        actualArrival: timeMap.get('ActualBlockOn'),
        status: String(f.Status || '').toLowerCase() === 'voyagereported' ? 'Completed' : String(f.Status || ''),
        canceled: f.Canceled === 'true' || f.Canceled === true,
        aircraftRegistration: f.AircraftRegistration ? String(f.AircraftRegistration) : undefined,
        aircraftType: f.Aircraft?.Type ? String(f.Aircraft.Type) : undefined,
        flightDate: f.FlightDate ? String(f.FlightDate).split('T')[0] : guernseyDateStr(),
        delays, times, notes,
      });
    } catch (err) {
      console.error('[Aurigny] Error parsing flight:', err);
    }
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// DB upsert
// ---------------------------------------------------------------------------

async function upsertFlights(scrapedFlights: ScrapedFlight[]): Promise<number> {
  let count = 0;
  for (const flight of scrapedFlights) {
    try {
      // Prefer summed delay codes; fall back to computing from estimated vs scheduled time
      let delayMinutes: number | null = flight.delays.reduce((s, d) => s + d.minutes, 0) || null;
      if (!delayMinutes && flight.actualDeparture && flight.scheduledDeparture) {
        const diff = Math.round((flight.actualDeparture.getTime() - flight.scheduledDeparture.getTime()) / 60000);
        if (diff > 0 && diff <= 1440) delayMinutes = diff;
      }
      // Final sanity guard
      if (delayMinutes != null && (!Number.isFinite(delayMinutes) || delayMinutes < 0 || delayMinutes > 1440)) {
        delayMinutes = null;
      }

      const inserted = await db
        .insert(flightsTable)
        .values({
          uniqueId: flight.uniqueId, flightNumber: flight.flightNumber, airlineCode: flight.airlineCode,
          departureAirport: flight.departureAirport, arrivalAirport: flight.arrivalAirport,
          scheduledDeparture: flight.scheduledDeparture, scheduledArrival: flight.scheduledArrival,
          actualDeparture: flight.actualDeparture, actualArrival: flight.actualArrival,
          status: flight.status, canceled: flight.canceled,
          aircraftRegistration: flight.aircraftRegistration, aircraftType: flight.aircraftType,
          delayMinutes, flightDate: flight.flightDate,
        })
        .onConflictDoUpdate({
          target: flightsTable.uniqueId,
          set: {
            actualDeparture: flight.actualDeparture ?? null,
            actualArrival: flight.actualArrival ?? null,
            status: flight.status, canceled: flight.canceled, delayMinutes, updatedAt: new Date(),
          },
        })
        .returning({ id: flightsTable.id });

      const flightId = inserted[0]?.id;
      if (!flightId) continue;

      for (const t of flight.times) {
        await db.insert(flightTimes)
          .values({ flightId, timeType: t.type, timeValue: t.value })
          .onConflictDoUpdate({ target: [flightTimes.flightId, flightTimes.timeType], set: { timeValue: t.value } });
      }
      for (const d of flight.delays) {
        await db.insert(flightDelays)
          .values({ flightId, delayCode: d.code, delayCode2: d.code2, minutes: d.minutes })
          .onConflictDoNothing();
      }
      for (const n of flight.notes) {
        await db.insert(flightNotes).values({ flightId, timestamp: n.timestamp, noteType: n.type, message: n.message });
      }

      count++;
    } catch (err) {
      console.error(`[Aurigny] Error upserting ${flight.flightNumber}:`, err);
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Core browser session — fetches one or more dates in a single browser launch
// ---------------------------------------------------------------------------

/**
 * Launches a real Chromium browser (with Cloudflare bypass), navigates to the
 * Aurigny arrivals/departures page, then fetches schedule data for every date
 * in `dates` within the same session (reusing the established CF cookies).
 *
 * For the first date, departures XML is captured by intercepting the XHR that
 * the SPA fires on page load. For all dates (including the first), arrivals and
 * any subsequent-date departures are fetched via in-page fetch() calls that
 * inherit the live CF session cookies.
 *
 * Returns the total number of flights upserted across all dates.
 */
async function runBrowserSession(
  dates: string[],
  logId: number,
  maxRetries: number,
): Promise<{ success: boolean; count: number; error?: string }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let browser: any = null;
    try {
      console.log(`[Aurigny] Attempt ${attempt}/${maxRetries} — dates: ${dates.join(', ')}`);
      await randomDelay(3000, 8000);

      const proxies = getProxyList();
      const selectedProxy = getRandomProxy(proxies);
      
      if (selectedProxy) {
        console.log(`[Aurigny] Using proxy: ${selectedProxy.host}:${selectedProxy.port}`);
      } else {
        console.log('[Aurigny] No proxy configured - connecting directly');
      }

      console.log('[Aurigny] Launching browser...');
      
      const isDocker = process.env.CHROME_PATH !== undefined;
      const chromePath = process.env.CHROME_PATH;
      const connectOptions: Record<string, unknown> = {
        headless: false,
        turnstile: true,
        disableXvfb: false,
        args: [
          '--disable-dev-shm-usage',
          '--window-size=1920,1080',
          '--lang=en-GB',
          '--accept-lang=en-GB,en;q=0.9',
          ...(isDocker ? [
            '--no-sandbox',
            '--disable-setuid-sandbox',
          ] : []),
        ],
      };

      if (chromePath) {
        connectOptions.customConfig = { chromePath };
      }

      if (selectedProxy) {
        connectOptions.proxy = {
          host: selectedProxy.host,
          port: selectedProxy.port,
          username: selectedProxy.username,
          password: selectedProxy.password,
        };
      }

      const { browser: b, page } = await connect(connectOptions);
      console.log('[Aurigny] Browser launched successfully');
      browser = b;

      // ---- Phase 1: load the page and capture the first date's departures XML ----
      // The SPA fires a departures XHR on load; we intercept it to get today's data.
      // We use the first date in the list as the "page load" date — subsequent dates
      // are fetched entirely via in-page fetch() calls below.
      const primaryDate = dates[0];
      let primaryDeparturesData: string | null = null;

      let responseCount = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      page.on('response', async (response: any) => {
        try {
          responseCount++;
          const url: string = response.url();
          if (url.includes('/api/schedule') && response.status() === 200) {
            const body = await response.text();
            if (body && body.length > 100 && !url.includes('arr_dep=arr')) {
              primaryDeparturesData = body;
              console.log(`[Aurigny] Captured departures for ${primaryDate} (${body.length} bytes)`);
            }
          }
        } catch { /* ignore */ }
      });

      console.log('[Aurigny] Loading page...');
      page.goto('https://www.aurigny.com/information/arrivals-departures', {
        waitUntil: 'load',
        timeout: 120000,
      }).catch(() => {/* navigation may fail when CF redirects — that's fine */});

      // Wait for departures data with stall-detection and reload
      console.log('[Aurigny] Waiting for departures data (up to 120s)...');
      const depDeadline = Date.now() + 120000;
      let lastResponseCount = 0;
      let staleSince = Date.now();
      let reloadAttempted = false;

      while (Date.now() < depDeadline && !primaryDeparturesData) {
        await randomDelay(3000, 3000);
        const currentUrl: string = page.url();
        console.log(`[Aurigny] responses: ${responseCount}, url: ${currentUrl.substring(0, 70)}, dep: ${primaryDeparturesData !== null}`);

        const title = await page.title().catch(() => '');
        if (title.includes('Just a moment')) {
          console.log('[Aurigny] Waiting for Cloudflare challenge to complete...');
          await randomDelay(10000, 15000);
          continue;
        }

        if (responseCount === lastResponseCount) {
          if (Date.now() - staleSince > 20000 && !reloadAttempted) {
            console.log('[Aurigny] Response count stalled — reloading page to trigger SPA...');
            reloadAttempted = true;
            page.reload({ waitUntil: 'load', timeout: 30000 }).catch(() => {});
            staleSince = Date.now();
          }
        } else {
          lastResponseCount = responseCount;
          staleSince = Date.now();
        }
      }

      if (!primaryDeparturesData) {
        throw new Error('No departures XML captured from /api/schedule');
      }

      // Simulate human behaviour now that the page is loaded
      await simulateHumanBehavior(page);

      // ---- Phase 2: fetch all dates via in-page fetch (reuses CF cookies) ----
      // For the primary date: fetch arrivals in-page (departures already captured above).
      // For additional dates: fetch both departures and arrivals in-page.

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inPageFetch = async (date: string, arrDep: 'arr' | 'dep'): Promise<string | null> => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const body = await page.evaluate(new Function('date', 'arrDep', `
            return fetch('/api/schedule?airport=GCI&arr_dep=' + arrDep + '&date=' + date + '&recaptchaToken=none&recaptchaVerified=false', {
              headers: {
                'Accept': '*/*',
                'Referer': 'https://www.aurigny.com/information/arrivals-departures',
              },
              credentials: 'include',
            }).then(function(r) { return r.ok ? r.text() : null; }).catch(function() { return null; });
          `) as (d: string, a: string) => Promise<string | null>, date, arrDep);

          if (body && body.length > 100) {
            console.log(`[Aurigny] Fetched ${arrDep === 'arr' ? 'arrivals' : 'departures'} for ${date} (${body.length} bytes)`);
            return body;
          }
          console.warn(`[Aurigny] In-page ${arrDep} fetch for ${date} returned empty/null`);
          return null;
        } catch (err) {
          console.warn(`[Aurigny] In-page ${arrDep} fetch for ${date} failed:`, err);
          return null;
        }
      };

      let totalUpserted = 0;

      for (let i = 0; i < dates.length; i++) {
        const date = dates[i];
        let depXml: string | null;
        let arrXml: string | null;

        if (i === 0) {
          // Primary date: departures already captured via XHR intercept
          depXml = primaryDeparturesData;
          arrXml = await inPageFetch(date, 'arr');
        } else {
          // Additional dates: fetch both via in-page fetch
          // Small delay between date requests to avoid hammering the API
          await randomDelay(2000, 4000);
          depXml = await inPageFetch(date, 'dep');
          arrXml = await inPageFetch(date, 'arr');
        }

        const depFlights = depXml ? parseFlightXml(depXml) : [];
        const arrFlights = arrXml ? parseFlightXml(arrXml) : [];
        const all = [...depFlights, ...arrFlights];
        console.log(`[Aurigny] ${date}: parsed ${depFlights.length} departures + ${arrFlights.length} arrivals`);

        if (all.length > 0) {
          const upserted = await upsertFlights(all);
          console.log(`[Aurigny] ${date}: upserted ${upserted} flights`);
          totalUpserted += upserted;
        } else {
          console.warn(`[Aurigny] ${date}: no flights parsed — skipping upsert`);
        }
      }

      await db.update(scraperLogs)
        .set({ status: 'success', recordsScraped: totalUpserted, completedAt: new Date(), retryCount: attempt - 1 })
        .where(eq(scraperLogs.id, logId));

      console.log('[Aurigny] Closing browser...');
      await Promise.race([
        page.close(),
        new Promise(resolve => setTimeout(resolve, 2000)),
      ]).catch(() => {});
      await Promise.race([
        browser.close(),
        new Promise(resolve => setTimeout(resolve, 3000)),
      ]);
      console.log('[Aurigny] Browser closed');

      if (global.gc) {
        global.gc();
      }

      return { success: true, count: totalUpserted };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Aurigny] Attempt ${attempt} failed: ${message}`);
      if (browser) {
        await Promise.race([
          browser.close(),
          new Promise(resolve => setTimeout(resolve, 3000)),
        ]).catch(() => {});
      }

      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 5000 + Math.random() * 5000;
        console.log(`[Aurigny] Retrying in ${Math.round(backoff / 1000)}s...`);
        await randomDelay(backoff, backoff + 5000);
      } else {
        await db.update(scraperLogs)
          .set({ status: 'failure', errorMessage: message, completedAt: new Date(), retryCount: maxRetries })
          .where(eq(scraperLogs.id, logId));
        return { success: false, count: 0, error: message };
      }
    }
  }

  return { success: false, count: 0, error: 'Exhausted retries' };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scrapes schedule data for one or more dates (YYYY-MM-DD) in a single browser
 * session, reusing the Cloudflare session for all date fetches after the first.
 *
 * @param dates   Array of YYYY-MM-DD strings. First date uses page-intercepted
 *                departures XHR; subsequent dates use in-page fetch only.
 * @param service Scraper log service tag. Use 'aurigny_live' for the regular
 *                live loop and 'aurigny_prefetch' for background prefetch runs.
 */
export async function scrapeMultipleDates(
  dates: string[],
  service: 'aurigny_live' | 'aurigny_prefetch' = 'aurigny_prefetch',
): Promise<{ success: boolean; count: number; error?: string }> {
  if (dates.length === 0) {
    return { success: true, count: 0 };
  }

  const logEntry = await db
    .insert(scraperLogs)
    .values({ service, status: 'retry', startedAt: new Date(), retryCount: 0 })
    .returning({ id: scraperLogs.id });
  const logId = logEntry[0].id;

  const maxRetries = parseInt(process.env.SCRAPER_MAX_RETRIES || '3');
  return runBrowserSession(dates, logId, maxRetries);
}

/**
 * Scrapes today's schedule (Guernsey local date). Kept as a thin wrapper around
 * scrapeMultipleDates for backward compatibility with existing callers.
 */
export async function scrapeOnce(): Promise<{ success: boolean; count: number; error?: string }> {
  // Use Guernsey local date — fixes a pre-existing bug where new Date().toISOString()
  // would return yesterday's UTC date during the BST 23:00–00:00 window.
  const today = guernseyDateStr();
  return scrapeMultipleDates([today], 'aurigny_live');
}
