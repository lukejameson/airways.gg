/**
 * Queries free community ADS-B aggregators for live aircraft data by ICAO24 hex address.
 * Primary: adsb.lol — fallback: airplanes.live
 * Both use the readsb/tar1090 JSON format.
 *
 * Rate-limit aware: backs off on HTTP 429, delays between provider calls.
 */

export interface AircraftResult {
  registration: string;
  icao24: string;
  aircraftType: string | null;
  callsign: string | null;
  origIata: string | null;
  destIata: string | null;
  onGround: boolean;
}

const PROVIDERS = [
  'https://api.adsb.lol/v2',
  'https://api.airplanes.live/v2',
];

// Per-provider backoff state: tracks when we can next call each provider
const providerBackoff = new Map<string, { until: number; failures: number }>();

// Base delay between fallback provider calls (ms)
const PROVIDER_DELAY_MS = 1500;

function getBackoffMs(failures: number): number {
  // Exponential backoff: 5s, 10s, 20s, 40s, max 60s
  return Math.min(5000 * Math.pow(2, failures), 60000);
}

export async function lookupByHex(icao24: string): Promise<AircraftResult | null> {
  const now = Date.now();

  for (const base of PROVIDERS) {
    // Check if this provider is in backoff
    const backoff = providerBackoff.get(base);
    if (backoff && now < backoff.until) {
      continue;
    }

    try {
      const url = `${base}/hex/${encodeURIComponent(icao24.trim())}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'airways.gg/1.0 registration-lookup' },
        signal: AbortSignal.timeout(8000),
      });

      if (res.status === 429) {
        const failures = (backoff?.failures ?? 0) + 1;
        const backoffMs = getBackoffMs(failures);
        providerBackoff.set(base, { until: Date.now() + backoffMs, failures });
        console.warn(`[ADSB] ${base}: HTTP 429 for hex ${icao24} — backing off ${backoffMs / 1000}s`);
        await new Promise(r => setTimeout(r, PROVIDER_DELAY_MS));
        continue;
      }

      if (!res.ok) {
        console.warn(`[ADSB] ${base}: HTTP ${res.status} for hex ${icao24}`);
        await new Promise(r => setTimeout(r, PROVIDER_DELAY_MS));
        continue;
      }

      // Success — clear backoff for this provider
      if (providerBackoff.has(base)) {
        providerBackoff.delete(base);
      }

      const data = await res.json() as { ac?: Array<Record<string, unknown>> };
      const ac = data.ac?.[0];
      if (!ac) {
        // No aircraft in response = aircraft not visible to this network.
        // This is NOT an error — don't burn the fallback provider for it.
        console.log(`[ADSB] ${base}: no aircraft in response for hex ${icao24}`);
        return null;
      }

      const onGround = ac.on_ground === 1 || ac.on_ground === true;
      return {
        registration: ((ac.r as string) ?? '').trim(),
        icao24: ((ac.hex as string) ?? icao24).trim(),
        aircraftType: (ac.t as string)?.trim() ?? null,
        callsign: (ac.flight as string)?.trim() ?? null,
        origIata: (ac.orig_iata as string)?.trim() ?? null,
        destIata: (ac.dest_iata as string)?.trim() ?? null,
        onGround,
      };
    } catch (err) {
      console.warn(`[ADSB] ${base} error for hex ${icao24}:`, err instanceof Error ? err.message : err);
      await new Promise(r => setTimeout(r, PROVIDER_DELAY_MS));
    }
  }
  return null;
}
