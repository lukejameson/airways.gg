import { connect } from 'puppeteer-real-browser';
import { XMLParser } from 'fast-xml-parser';
import { db, flights as flightsTable, flightDelays, flightTimes, flightNotes, scraperLogs } from '@delays/database';
import { eq } from 'drizzle-orm';

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

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1280, height: 720 },
];

function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
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
      // Build a map of type → datetime for easy lookup
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
      // Keys are Delay1, Delay2, ... (not Delay)
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
        actualDeparture: timeMap.get('ActualBlockOff') ?? timeMap.get('EstimatedBlockOff'),
        actualArrival: timeMap.get('ActualBlockOn') ?? timeMap.get('EstimatedBlockOn'),
        status: String(f.Status || ''),
        canceled: f.Canceled === 'true' || f.Canceled === true,
        aircraftRegistration: f.AircraftRegistration ? String(f.AircraftRegistration) : undefined,
        aircraftType: f.Aircraft?.Type ? String(f.Aircraft.Type) : undefined,
        flightDate: f.FlightDate ? String(f.FlightDate).split('T')[0] : new Date().toISOString().split('T')[0],
        delays, times, notes,
      });
    } catch (err) {
      console.error('[Aurigny] Error parsing flight:', err);
    }
  }

  return parsed;
}

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
      // Final sanity guard — PostgreSQL integer max is 2147483647, reject anything absurd
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
            actualDeparture: flight.actualDeparture, actualArrival: flight.actualArrival,
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

export async function scrapeOnce(): Promise<{ success: boolean; count: number; error?: string }> {
  const logEntry = await db
    .insert(scraperLogs)
    .values({ service: 'aurigny_live', status: 'retry', startedAt: new Date(), retryCount: 0 })
    .returning({ id: scraperLogs.id });
  const logId = logEntry[0].id;

  const maxRetries = parseInt(process.env.SCRAPER_MAX_RETRIES || '3');

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let browser: any = null;
    try {
      console.log(`[Aurigny] Attempt ${attempt}/${maxRetries}`);
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
        // In Docker we manage Xvfb ourselves via entrypoint; locally let the lib handle it
        disableXvfb: isDocker,
        args: [
          '--disable-dev-shm-usage',
          '--window-size=1920,1080',
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

      let departuresData: string | null = null;
      let arrivalsData: string | null = null;

      // Intercept both dep and arr /api/schedule responses.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let responseCount = 0;
      page.on('response', async (response: any) => {
        try {
          responseCount++;
          const url: string = response.url();
          if (url.includes('/api/schedule') && response.status() === 200) {
            const body = await response.text();
            if (body && body.length > 100) {
              if (url.includes('arr_dep=arr')) {
                arrivalsData = body;
                console.log(`[Aurigny] Captured arrivals (${body.length} bytes)`);
              } else {
                departuresData = body;
                console.log(`[Aurigny] Captured departures (${body.length} bytes)`);
              }
            }
          }
        } catch { /* ignore */ }
      });

      console.log('[Aurigny] Loading page...');
      page.goto('https://www.aurigny.com/information/arrivals-departures', {
        waitUntil: 'load',
        timeout: 120000,
      }).catch(() => {/* navigation may fail when CF redirects — that's fine */});

      // Phase 1: wait for departures data (up to 120s).
      // After the CF challenge resolves the SPA may still need to navigate and boot.
      // If we've been on the same URL for >10s with no new responses and no data,
      // try reloading the page to kick the SPA — sometimes CF passes the challenge
      // cookie but the initial page load was the challenge page itself, not the SPA.
      console.log('[Aurigny] Waiting for departures data (up to 120s)...');
      const depDeadline = Date.now() + 120000;
      let lastResponseCount = 0;
      let staleSince = Date.now();
      let reloadAttempted = false;

      while (Date.now() < depDeadline && !departuresData) {
        await randomDelay(3000, 3000);
        const currentUrl: string = page.url();
        console.log(`[Aurigny] responses: ${responseCount}, url: ${currentUrl.substring(0, 70)}, dep: ${departuresData !== null}`);

        // Check if stuck on Cloudflare challenge
        const title = await page.title().catch(() => '');
        if (title.includes('Just a moment')) {
          console.log('[Aurigny] Waiting for Cloudflare challenge to complete...');
          // Give Turnstile more time - it can take 30-60s
          await randomDelay(10000, 15000);
          continue;
        }

        // Detect stalled state: responses stopped incrementing and still no data
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

      if (!departuresData) {
        throw new Error('No departures XML captured from /api/schedule');
      }

      // Phase 2: use the page's own fetch to call the arrivals endpoint directly.
      // This runs inside the browser context so it carries all CF cookies/headers — no
      // need to simulate a tab click which the SPA may swallow without firing a request.
      console.log('[Aurigny] Fetching arrivals via in-page fetch...');
      try {
        const today = new Date().toISOString().split('T')[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const arrBody = await page.evaluate(new Function('date', `
          return fetch('/api/schedule?airport=GCI&arr_dep=arr&date=' + date + '&recaptchaToken=none&recaptchaVerified=false', {
            headers: {
              'Accept': '*/*',
              'Referer': 'https://www.aurigny.com/information/arrivals-departures',
            },
            credentials: 'include',
          }).then(function(r) { return r.ok ? r.text() : null; }).catch(function() { return null; });
        `) as (d: string) => Promise<string | null>, today);

        if (arrBody && arrBody.length > 100) {
          arrivalsData = arrBody;
          console.log(`[Aurigny] Fetched arrivals directly (${arrBody.length} bytes)`);
        } else {
          console.warn('[Aurigny] In-page arrivals fetch returned empty/null');
        }
      } catch (fetchErr) {
        console.warn('[Aurigny] In-page arrivals fetch failed:', fetchErr);
      }

      if (!arrivalsData) {
        console.warn('[Aurigny] No arrivals data captured — will only store departures');
      }

      // Parse and merge both datasets
      const depFlights = parseFlightXml(departuresData);
      const arrFlights = arrivalsData ? parseFlightXml(arrivalsData) : [];
      console.log(`[Aurigny] Parsed ${depFlights.length} departures + ${arrFlights.length} arrivals`);
      const scrapedFlights = [...depFlights, ...arrFlights];
      console.log(`[Aurigny] Parsed ${scrapedFlights.length} flights`);
      const upsertedCount = await upsertFlights(scrapedFlights);
      console.log(`[Aurigny] Upserted ${upsertedCount} flights`);

      await db.update(scraperLogs)
        .set({ status: 'success', recordsScraped: upsertedCount, completedAt: new Date(), retryCount: attempt - 1 })
        .where(eq(scraperLogs.id, logId));

      await browser.close();
      return { success: true, count: upsertedCount };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Aurigny] Attempt ${attempt} failed: ${message}`);
      if (browser) await browser.close().catch(() => {});

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
