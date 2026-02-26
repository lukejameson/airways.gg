<script lang="ts">
  import type { PageData } from './$types';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { airportName, getAirportCoords, getAirportsForNearestSearch } from '$lib/airports';
  import Icon from '$lib/components/Icon.svelte';
  import { getWeatherIconName, isDaytime } from '$lib/daylight';

  let { data }: { data: PageData } = $props();
  
  // Get return tab from URL query param
  const returnTab = $derived($page.url.searchParams.get('tab') ?? '');

  const { flight, statusHistory, prediction, weatherMap, daylightMap, position, rotationFlights, times } = $derived(data);
  const depWeather = $derived(weatherMap?.[flight.departureAirport] ?? null);
  const arrWeather = $derived(weatherMap?.[flight.arrivalAirport] ?? null);

  // Determine if it's daytime at departure and arrival airports
  const depIsDay = $derived.by(() => {
    const daylight = daylightMap?.[flight.departureAirport]?.[0];
    if (!daylight) return true;
    return isDaytime(new Date(daylight.sunrise), new Date(daylight.sunset), new Date(flight.scheduledDeparture));
  });
  const arrIsDay = $derived.by(() => {
    const daylight = daylightMap?.[flight.arrivalAirport]?.[0];
    if (!daylight) return true;
    return isDaytime(new Date(daylight.sunrise), new Date(daylight.sunset), new Date(flight.scheduledArrival));
  });

  // Get weather icons with day/night awareness
  const depWeatherIcon = $derived(depWeather ? getWeatherIconName(depWeather.weatherCode, depIsDay) : 'cloud');
  const arrWeatherIcon = $derived(arrWeather ? getWeatherIconName(arrWeather.weatherCode, arrIsDay) : 'cloud');

  // SEO
  const seoTitle = $derived(`${flight.flightNumber} · ${flight.departureAirport} → ${flight.arrivalAirport} — delays.gg`);
  const seoDate = $derived(
    flight.scheduledDeparture
      ? new Date(flight.scheduledDeparture).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : ''
  );
  const seoDescription = $derived(
    `${flight.flightNumber} from ${flight.departureAirport} to ${flight.arrivalAirport}${seoDate ? ` on ${seoDate}` : ''}${flight.status ? ` · ${flight.status}` : ''}${flight.delayMinutes && flight.delayMinutes > 0 ? ` · Delayed ${flight.delayMinutes} min` : ''}. Track live flight status and delay predictions on delays.gg.`
  );
  const seoCanonical = $derived(`${data.siteUrl}/flights/${flight.id}`);

  const hasPosition = $derived(!!position && position.lat != null && position.lon != null);

  let FlightMapComponent: any = $state(null);
  let mapExpanded = $state(false);
  let rotationExpanded = $state(false);
  let rotationScrollEl: HTMLDivElement | undefined = $state();

  function toggleRotation() {
    rotationExpanded = !rotationExpanded;
    if (rotationExpanded) {
      // After DOM updates, scroll the current flight into view
      setTimeout(() => {
        const el = rotationScrollEl?.querySelector('[data-current="true"]') as HTMLElement | null;
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 50);
    }
  }

  function rotationStatusTone(status: string | null): string {
    const s = status?.toLowerCase() ?? '';
    if (s.includes('completed') || s.includes('landed')) return 'blue';
    if (s.includes('airborne')) return 'green';
    if (s.includes('delayed')) return 'yellow';
    if (s.includes('cancel')) return 'red';
    return 'gray';
  }

  $effect(() => {
    if (browser && hasPosition && !FlightMapComponent) {
      import('$lib/components/FlightMap.svelte').then(m => {
        FlightMapComponent = m.default;
      });
    }
  });

  function toggleMap() {
    mapExpanded = !mapExpanded;
  }

  /** Find the nearest airport IATA code from a lat/lon using the known AIRPORTS table. */
  function nearestAirport(lat: number, lon: number): string | null {
    const airports = getAirportsForNearestSearch();
    let best: string | null = null;
    let bestDist = Infinity;
    for (const { iata, lat: aLat, lon: aLon } of airports) {
      const d = calculateDistance(lat, lon, aLat, aLon);
      if (d < bestDist) { bestDist = d; best = iata; }
    }
    // Only trust if within 30 km of a known airport
    return bestDist < 30 ? best : null;
  }

  /** 
   * Find the most recently completed flight in the rotation before the current flight.
   * Uses actual_arrival if available, otherwise falls back to scheduled_arrival for ordering.
   */
  function getMostRecentCompletedRotationFlight() {
    if (!rotationFlights || rotationFlights.length === 0) return null;
    
    const currentFlightDep = new Date(flight.scheduledDeparture).getTime();
    
    const completedBefore = rotationFlights.filter(f => {
      const status = f.status?.toLowerCase() || '';
      const isCompleted = status.includes('completed') || status.includes('landed');
      // Must have departed before the current flight
      const depTime = new Date(f.scheduledDeparture).getTime();
      return isCompleted && depTime < currentFlightDep;
    });
    
    if (completedBefore.length === 0) return null;
    
    // Sort by actual_arrival desc (most recently landed first), fall back to scheduled
    return completedBefore.sort((a, b) => {
      const aTime = a.actualArrival ? new Date(a.actualArrival).getTime() : new Date(a.scheduledArrival).getTime();
      const bTime = b.actualArrival ? new Date(b.actualArrival).getTime() : new Date(b.scheduledArrival).getTime();
      return bTime - aTime;
    })[0];
  }

  /** 
   * Return the best known location for the aircraft.
   * Rotation data is more up-to-date than stale inferred positions,
   * so if the most recent completed rotation flight arrived AFTER the
   * stored inferred position was recorded, prefer the rotation result.
   */
  function getInferredLocationFromRotation(): { airport: string; source: 'rotation' } | null {
    const mostRecent = getMostRecentCompletedRotationFlight();
    if (!mostRecent) return null;
    return { airport: mostRecent.arrivalAirport, source: 'rotation' };
  }

  /**
   * True when the stored inferred position is stale compared to rotation data.
   * e.g. position says ACI (from GR202) but rotation shows GR205 completed at GCI after that.
   */
  const rotationOverridesPosition = $derived.by(() => {
    if (!position) return false;
    // Only applies to inferred positions — live positions are always trusted
    if (!position.fr24Id?.startsWith('INFERRED_')) return false;
    
    const mostRecent = getMostRecentCompletedRotationFlight();
    if (!mostRecent) return false;
    
    // Compare arrival time of the rotation's most recent flight vs the inferred position timestamp
    const rotationArrival = mostRecent.actualArrival
      ? new Date(mostRecent.actualArrival).getTime()
      : new Date(mostRecent.scheduledArrival).getTime();
    const inferredAt = new Date(position.positionTimestamp).getTime();
    
    // Rotation is newer if the flight arrived after the inferred position was recorded,
    // OR if the inferred position airport doesn't match the rotation's conclusion
    const rotationAirport = mostRecent.arrivalAirport;
    const inferredAirport = position.destIata ?? null;
    
    return rotationArrival > inferredAt || rotationAirport !== inferredAirport;
  });

  function getFlightProgressDescription(): string {
    if (!position || !hasPosition) return 'Location unavailable';
    const isInferred = position.fr24Id?.startsWith('INFERRED_');
    if (isInferred) {
      const iata = nearestAirport(position.lat, position.lon) ?? position.destIata ?? '—';
      return `On the ground at ${airportName(iata)}`;
    }
    if (position.onGround) {
      const iata = nearestAirport(position.lat, position.lon) ?? position.destIata ?? flight.arrivalAirport;
      return `Currently at ${airportName(iata)}`;
    }
    const dep = airportName(flight.departureAirport);
    const arr = airportName(flight.arrivalAirport);
    const altitude = position.altitudeFt;
    if (altitude != null) {
      if (altitude < 1000) return `Departing ${dep}`;
      if (altitude > 30000) return `Cruising at ${altitude.toLocaleString()} ft`;
      if (altitude < 5000) return `Approaching ${arr}`;
      return `En route from ${dep} to ${arr}`;
    }
    return `En route from ${dep} to ${arr}`;
  }

  function getProgressPercentage(): number {
    if (!position || !hasPosition || !depCoords || !arrCoords) return 0;
    // Simple distance-based progress
    const totalDistance = calculateDistance(depCoords[0], depCoords[1], arrCoords[0], arrCoords[1]);
    const currentDistance = calculateDistance(position.lat, position.lon, arrCoords[0], arrCoords[1]);
    return Math.max(0, Math.min(100, Math.round((1 - currentDistance / totalDistance) * 100)));
  }

  function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  const depCoords = $derived(
    position?.originIata ? getAirportCoords(position.originIata) : getAirportCoords(flight.departureAirport)
  );
  const arrCoords = $derived(
    position?.destIata ? getAirportCoords(position.destIata) : getAirportCoords(flight.arrivalAirport)
  );

  function compassDir(deg: number | null): string {
    if (deg == null) return '—';
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
  }

  function timeSince(date: string | Date | null): string {
    if (!date) return '';
    const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
  }

  const isDeparture = $derived(flight.departureAirport === 'GCI');
  const scheduledTime = $derived(isDeparture ? flight.scheduledDeparture : flight.scheduledArrival);
  const actualTime = $derived(isDeparture ? flight.actualDeparture : flight.actualArrival);
  const estimatedTime = $derived(() => {
    const timeType = isDeparture ? 'EstimatedBlockOff' : 'EstimatedBlockOn';
    return times?.find((t: { timeType: string }) => t.timeType === timeType)?.timeValue ?? null;
  });
  const displayTime = $derived(actualTime ?? estimatedTime());
  const isEstimate = $derived(!actualTime && !!estimatedTime());
  const otherAirport = $derived(isDeparture ? flight.arrivalAirport : flight.departureAirport);
  const delayMinutes = $derived(flight.delayMinutes ?? 0);

  function formatTime(date: string | Date | null | undefined): string {
    if (!date) return '--:--';
    return new Date(date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDateTime(date: string | Date | null | undefined): string {
    if (!date) return '—';
    return new Date(date).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatDate(date: string | Date | null | undefined): string {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  function shortDate(date: string | Date | null | undefined): string {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }

  function getStatusColor(status: string | null | undefined): string {
    const s = status?.toLowerCase() || '';
    if (s.includes('on time')) return 'text-green-600';
    if (s.includes('delayed')) return 'text-yellow-600';
    if (s.includes('cancelled')) return 'text-red-600';
    if (s.includes('landed') || s.includes('airborne')) return 'text-blue-600';
    return 'text-muted-foreground';
  }

  function getStatusDotColor(status: string | null | undefined): string {
    const s = status?.toLowerCase() || '';
    if (s.includes('on time')) return 'bg-green-500';
    if (s.includes('delayed')) return 'bg-yellow-500';
    if (s.includes('cancelled')) return 'bg-red-500';
    if (s.includes('landed') || s.includes('airborne')) return 'bg-blue-500';
    return 'bg-gray-400';
  }

  const predictionPct = $derived(
    prediction ? Math.round((prediction.probability ?? 0) * 100) : null,
  );

  function getPredictionColor(pct: number): string {
    if (pct >= 70) return 'text-red-600';
    if (pct >= 40) return 'text-yellow-600';
    return 'text-green-600';
  }

  function getPredictionBarColor(pct: number): string {
    if (pct >= 70) return 'bg-red-500';
    if (pct >= 40) return 'bg-yellow-500';
    return 'bg-green-500';
  }

  let shareSuccess = $state(false);

  // Save to recently viewed
  $effect(() => {
    if (browser) {
      const key = 'recentlyViewedFlights';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const flightInfo = {
        id: flight.id,
        flightNumber: flight.flightNumber,
        departureAirport: flight.departureAirport,
        arrivalAirport: flight.arrivalAirport,
        scheduledDeparture: flight.scheduledDeparture,
        viewedAt: new Date().toISOString(),
      };
      // Remove if already exists to move to front
      const filtered = existing.filter((f: any) => f.id !== flight.id);
      // Add to front, keep only last 5
      const updated = [flightInfo, ...filtered].slice(0, 5);
      localStorage.setItem(key, JSON.stringify(updated));
    }
  });

  async function shareFlight() {
    const shareData = {
      title: `${flight.flightNumber} — delays.gg`,
      text: `Track ${flight.flightNumber} from ${airportName(flight.departureAirport)} to ${airportName(flight.arrivalAirport)}`,
      url: window.location.href,
    };
    
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled or share failed
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(window.location.href);
        shareSuccess = true;
        setTimeout(() => shareSuccess = false, 2000);
      } catch {
        // Clipboard failed
      }
    }
  }
</script>

<svelte:head>
  <title>{seoTitle}</title>
  <meta name="description" content={seoDescription} />
  <link rel="canonical" href={seoCanonical} />

  <meta property="og:title" content={seoTitle} />
  <meta property="og:description" content={seoDescription} />
  <meta property="og:url" content={seoCanonical} />
  <meta property="og:type" content="website" />

  <meta name="twitter:title" content={seoTitle} />
  <meta name="twitter:description" content={seoDescription} />
</svelte:head>

<div class="container py-4 sm:py-6 max-w-3xl">
  <!-- Top row: Back + Share -->
  <div class="flex items-center justify-between mb-4">
    <a 
      href="/{returnTab ? `?tab=${returnTab}` : ''}"
      class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      ← Back
    </a>
    
    <button
      onclick={shareFlight}
      class="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors rounded-md px-2 py-1"
      aria-label="Share this flight"
    >
      {#if shareSuccess}
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-500">
          <path d="M20 6 9 17l-5-5"/>
        </svg>
        <span class="text-green-600 text-xs">Copied!</span>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16,6 12,2 8,6"/><line x1="12" x2="12" y1="2" y2="15"/>
        </svg>
        Share
      {/if}
    </button>
  </div>

  <!-- Flight Info Header -->
  <div class="mb-6">
    <div class="flex items-baseline gap-2 mb-1">
      <h1 class="text-3xl sm:text-4xl font-bold tracking-tight">{flight.flightNumber}</h1>
      <span class="rounded-full border px-2 py-0.5 text-xs sm:text-sm font-medium text-muted-foreground">
        {flight.airlineCode}
      </span>
    </div>
    
    <p class="text-base sm:text-lg text-muted-foreground">
      {isDeparture ? 'to' : 'from'}
      <span class="font-semibold text-foreground">{airportName(otherAirport)}</span>
      <span class="hidden sm:inline text-muted-foreground/50">({otherAirport})</span>
    </p>
    
    <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span class="text-muted-foreground">{shortDate(flight.flightDate)}</span>
      <span class="opacity-30 hidden sm:inline">·</span>
      <div class="flex items-center gap-1.5">
        <span class="h-2 w-2 rounded-full {getStatusDotColor(flight.status)}"></span>
        <span class="font-medium {getStatusColor(flight.status)}">
          {flight.status || 'Scheduled'}
        </span>
      </div>
      {#if delayMinutes > 0}
        <span class="opacity-30 hidden sm:inline">·</span>
        <span class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
          +{delayMinutes}m
        </span>
      {:else if delayMinutes < 0}
        <span class="opacity-30 hidden sm:inline">·</span>
        <span class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
          {Math.abs(delayMinutes)}m early
        </span>
      {:else if flight.status?.toLowerCase().includes('delayed')}
        <span class="opacity-30 hidden sm:inline">·</span>
        <span class="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700">
          Delay TBC
        </span>
      {:else}
        <span class="opacity-30 hidden sm:inline">·</span>
        <span class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
          On Time
        </span>
      {/if}
    </div>
  </div>

  <!-- Times grid -->
  <div class="grid grid-cols-2 gap-4 mb-6">
    <div class="rounded-lg border bg-card p-4">
      <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Scheduled {isDeparture ? 'Departure' : 'Arrival'}</p>
      <p class="text-3xl font-bold tabular-nums">{formatTime(scheduledTime)}</p>
      <p class="text-sm text-muted-foreground mt-1">
        {airportName(isDeparture ? flight.departureAirport : flight.arrivalAirport)}
        <span class="opacity-50">({isDeparture ? flight.departureAirport : flight.arrivalAirport})</span>
      </p>
    </div>

    <div class="rounded-lg border bg-card p-4">
      {#if displayTime}
        <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
          {isEstimate ? 'Estimated' : 'Actual'} {isDeparture ? 'Departure' : 'Arrival'}
        </p>
        <p class="text-3xl font-bold tabular-nums {isEstimate ? 'text-yellow-500' : delayMinutes > 0 ? 'text-red-500' : delayMinutes < 0 ? 'text-green-500' : ''}">
          {formatTime(displayTime)}
        </p>
        {#if isEstimate}
          <p class="text-xs text-yellow-600 mt-1">Estimated — subject to change</p>
        {:else}
          <p class="text-sm text-muted-foreground mt-1">
            {airportName(isDeparture ? flight.departureAirport : flight.arrivalAirport)}
            <span class="opacity-50">({isDeparture ? flight.departureAirport : flight.arrivalAirport})</span>
          </p>
        {/if}
      {:else}
        <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
          {isDeparture ? 'Departure' : 'Arrival'} Time
        </p>
        <p class="text-3xl font-bold tabular-nums text-muted-foreground">—</p>
        <p class="text-sm text-muted-foreground mt-1">Not yet available</p>
      {/if}
    </div>
  </div>

  <!-- Live position -->
  {#if hasPosition && position && !rotationOverridesPosition}
    {@const isInferred = position.fr24Id?.startsWith('INFERRED_')}
    <div class="rounded-lg border bg-card mb-6 overflow-hidden">
      <!-- Header with toggle -->
      <button 
        class="w-full px-4 py-3 flex items-center justify-between gap-4 hover:bg-muted/50 transition-colors text-left"
        onclick={toggleMap}
      >
        <div class="flex-1">
          {#if !mapExpanded}
            <!-- Collapsed: Show clean summary -->
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
              </div>
              <div>
                <p class="font-semibold text-foreground">{getFlightProgressDescription()}</p>
                {#if !isInferred && position.altitudeFt != null && !position.onGround}
                  {@const progress = getProgressPercentage()}
                  <div class="flex items-center gap-2 mt-1">
                    <span class="text-xs text-muted-foreground">{airportName(flight.departureAirport)} <span class="opacity-50">({flight.departureAirport})</span></span>
                    <div class="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div class="h-full bg-primary rounded-full" style="width: {progress}%"></div>
                    </div>
                    <span class="text-xs text-muted-foreground">{airportName(flight.arrivalAirport)} <span class="opacity-50">({flight.arrivalAirport})</span></span>
                  </div>
                {:else if isInferred}
                  <p class="text-xs text-amber-600 mt-0.5">Last known position • {timeSince(position.positionTimestamp)}</p>
                {:else}
                  <p class="text-xs text-muted-foreground mt-0.5">Updated {timeSince(position.positionTimestamp)}</p>
                {/if}
              </div>
            </div>
          {:else}
            <!-- Expanded: Show section title -->
            <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {#if isInferred}
                Last Known Position
                <span class="ml-2 text-amber-600 font-normal normal-case">(inferred)</span>
              {:else}
                Live Position
              {/if}
            </p>
            <div class="flex flex-wrap gap-x-5 gap-y-1 text-sm mt-2">
              {#if isInferred}
                {@const iata = nearestAirport(position.lat, position.lon) ?? position.destIata ?? '—'}
                <span class="font-semibold text-amber-600">
                  On the ground at {airportName(iata)} <span class="opacity-60 font-normal">({iata})</span>
                </span>
              {:else}
                {#if position.altitudeFt != null}
                  <span><span class="text-muted-foreground">Altitude</span> <span class="font-semibold">{position.altitudeFt.toLocaleString()} ft</span></span>
                {/if}
                {#if position.groundSpeedKts != null}
                  <span><span class="text-muted-foreground">Speed</span> <span class="font-semibold">{position.groundSpeedKts} kts</span></span>
                {/if}
                {#if position.heading != null}
                  <span><span class="text-muted-foreground">Heading</span> <span class="font-semibold">{position.heading}° {compassDir(position.heading)}</span></span>
                {/if}
              {/if}
            </div>
          {/if}
        </div>
        <div class="flex items-center gap-2 shrink-0">
          {#if mapExpanded}
            <span class="text-xs text-muted-foreground">{timeSince(position.positionTimestamp)}</span>
          {/if}
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="20" 
            height="20" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            stroke-width="2" 
            stroke-linecap="round" 
            stroke-linejoin="round"
            class="text-muted-foreground transition-transform duration-200 {mapExpanded ? 'rotate-180' : ''}"
          >
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </div>
      </button>

      <!-- Map — only shown when expanded -->
      {#if mapExpanded}
        {#if browser && FlightMapComponent}
          <svelte:component
            this={FlightMapComponent}
            lat={position.lat}
            lon={position.lon}
            heading={position.heading ?? 0}
            originIata={position.originIata}
            destIata={position.destIata}
            depAirport={flight.departureAirport}
            arrAirport={flight.arrivalAirport}
          />
        {:else if browser}
          <div class="h-72 flex items-center justify-center text-sm text-muted-foreground bg-muted/30">
            Loading map…
          </div>
        {/if}
      {/if}
    </div>
  {:else}
    {@const inferredLocation = getInferredLocationFromRotation()}
    <!-- No live position -->
    <div class="rounded-lg border bg-card px-4 py-3 mb-6">
      <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Aircraft Location</p>
      {#if inferredLocation}
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-amber-600">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          <div>
            <p class="font-semibold text-foreground">
              On the ground at {airportName(inferredLocation.airport)} <span class="opacity-50 font-normal">({inferredLocation.airport})</span>
            </p>
            <p class="text-xs text-amber-600 mt-0.5">Inferred from flight history</p>
          </div>
        </div>
      {:else}
        <p class="text-sm text-muted-foreground">
          Aircraft not currently tracked by Flightradar24. It may be at {airportName(flight.departureAirport)} ({flight.departureAirport}), {airportName(flight.arrivalAirport)} ({flight.arrivalAirport}), or en route to/from base airport. Live tracking will appear once the aircraft transmits position data.
        </p>
      {/if}
    </div>
  {/if}

  <!-- Aircraft rotation history -->
  {#if rotationFlights && rotationFlights.length > 1 && flight.aircraftRegistration}
    <div class="rounded-lg border bg-card mb-6 overflow-hidden">
      <button
        class="w-full px-4 py-3 flex items-center justify-between gap-4 hover:bg-muted/50 transition-colors text-left"
        onclick={toggleRotation}
      >
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>
            </svg>
          </div>
          <div>
            <p class="font-semibold text-foreground">{flight.aircraftRegistration} · Today's rotation</p>
            <p class="text-xs text-muted-foreground mt-0.5">
              {rotationFlights.length} flight{rotationFlights.length !== 1 ? 's' : ''} in the last 24h
            </p>
          </div>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20" height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-muted-foreground transition-transform duration-200 shrink-0 {rotationExpanded ? 'rotate-180' : ''}"
        >
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>

      {#if rotationExpanded}
        <div class="border-t border-border">
          <div bind:this={rotationScrollEl} class="max-h-72 overflow-y-auto">
            <!-- Desktop Table -->
            <table class="hidden md:table w-full text-sm">
              <thead class="sticky top-0 bg-muted/80 backdrop-blur-sm">
                <tr class="text-xs text-muted-foreground uppercase tracking-wide">
                  <th class="px-4 py-2 text-left font-medium">Flight</th>
                  <th class="px-3 py-2 text-center font-medium">From</th>
                  <th class="px-3 py-2 text-center font-medium">To</th>
                  <th class="px-3 py-2 text-center font-medium">Dep</th>
                  <th class="px-3 py-2 text-center font-medium">Act Dep</th>
                  <th class="px-3 py-2 text-center font-medium">Arr</th>
                  <th class="px-3 py-2 text-center font-medium">Act Arr</th>
                  <th class="px-3 py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {#each rotationFlights as rf}
                  {@const isCurrent = rf.id === flight.id}
                  {@const tone = rotationStatusTone(rf.status)}
                  <tr
                    data-current={isCurrent}
                    class="border-t border-border/50 transition-colors
                      {isCurrent ? 'bg-primary/8 border-l-2 border-l-primary' : 'hover:bg-muted/30'}"
                  >
                    <td class="px-4 py-2.5">
                      <a href="/flights/{rf.id}" class="font-semibold {isCurrent ? 'text-primary' : 'hover:text-primary transition-colors'}">
                        {rf.flightNumber}
                      </a>
                      {#if isCurrent}
                        <span class="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-primary opacity-70">this flight</span>
                      {/if}
                    </td>
                    <td class="px-3 py-2.5 text-center">
                      <span class="font-medium">{rf.departureAirport}</span>
                    </td>
                    <td class="px-3 py-2.5 text-center">
                      <span class="font-medium">{rf.arrivalAirport}</span>
                    </td>
                    <td class="px-3 py-2.5 text-center tabular-nums text-muted-foreground">
                      {formatTime(rf.scheduledDeparture)}
                    </td>
                    <td class="px-3 py-2.5 text-center tabular-nums">
                      {#if rf.actualDeparture}
                        <span class="{rf.actualDeparture > rf.scheduledDeparture ? 'text-amber-600' : 'text-green-600'} font-medium">
                          {formatTime(rf.actualDeparture)}
                        </span>
                      {:else}
                        <span class="text-muted-foreground">—</span>
                      {/if}
                    </td>
                    <td class="px-3 py-2.5 text-center tabular-nums text-muted-foreground">
                      {formatTime(rf.scheduledArrival)}
                    </td>
                    <td class="px-3 py-2.5 text-center tabular-nums">
                      {#if rf.actualArrival}
                        <span class="{rf.actualArrival > rf.scheduledArrival ? 'text-amber-600' : 'text-green-600'} font-medium">
                          {formatTime(rf.actualArrival)}
                        </span>
                      {:else}
                        <span class="text-muted-foreground">—</span>
                      {/if}
                    </td>
                    <td class="px-4 py-2.5 text-right">
                      {#if tone === 'blue'}
                        <span class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700">{rf.status}</span>
                      {:else if tone === 'green'}
                        <span class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-green-100 text-green-700">{rf.status}</span>
                      {:else if tone === 'yellow'}
                        <span class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">{rf.status}</span>
                      {:else if tone === 'red'}
                        <span class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700">{rf.status}</span>
                      {:else}
                        <span class="text-muted-foreground text-xs">{rf.status ?? 'Scheduled'}</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>

            <!-- Mobile Cards -->
            <div class="md:hidden divide-y divide-border">
              {#each rotationFlights as rf}
                {@const isCurrent = rf.id === flight.id}
                {@const tone = rotationStatusTone(rf.status)}
                {@const depShort = airportName(rf.departureAirport)}
                {@const arrShort = airportName(rf.arrivalAirport)}
                <a
                  href="/flights/{rf.id}"
                  data-current={isCurrent}
                  class="block px-4 py-3 transition-colors {isCurrent ? 'bg-primary/8' : 'hover:bg-muted/30'}"
                >
                  <!-- Header: Flight + Status -->
                  <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                      <span class="font-semibold {isCurrent ? 'text-primary' : 'text-foreground'}">{rf.flightNumber}</span>
                      {#if isCurrent}
                        <span class="text-[10px] font-bold uppercase tracking-wide text-primary opacity-70">this flight</span>
                      {/if}
                    </div>
                    {#if tone === 'blue'}
                      <span class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700">{rf.status}</span>
                    {:else if tone === 'green'}
                      <span class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-green-100 text-green-700">{rf.status}</span>
                    {:else if tone === 'yellow'}
                      <span class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">{rf.status}</span>
                    {:else if tone === 'red'}
                      <span class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700">{rf.status}</span>
                    {:else}
                      <span class="text-muted-foreground text-xs">{rf.status ?? 'Scheduled'}</span>
                    {/if}
                  </div>

                  <!-- Route: From -> To -->
                  <div class="flex items-center gap-2 text-sm mb-2">
                    <span class="font-medium text-foreground">{depShort}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground">
                      <path d="M5 12h14"/>
                      <path d="m12 5 7 7-7 7"/>
                    </svg>
                    <span class="font-medium text-foreground">{arrShort}</span>
                  </div>

                  <!-- Times: Act Dep -> Act Arr -->
                  <div class="flex items-center gap-3 text-sm">
                    <div class="flex items-center gap-1.5">
                      <span class="text-xs text-muted-foreground">Dep</span>
                      {#if rf.actualDeparture}
                        <span class="tabular-nums font-medium {rf.actualDeparture > rf.scheduledDeparture ? 'text-amber-600' : 'text-green-600'}">
                          {formatTime(rf.actualDeparture)}
                        </span>
                      {:else if rf.scheduledDeparture}
                        <span class="tabular-nums text-muted-foreground">{formatTime(rf.scheduledDeparture)}</span>
                      {:else}
                        <span class="text-muted-foreground">—</span>
                      {/if}
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground">
                      <path d="M5 12h14"/>
                      <path d="m12 5 7 7-7 7"/>
                    </svg>
                    <div class="flex items-center gap-1.5">
                      <span class="text-xs text-muted-foreground">Arr</span>
                      {#if rf.actualArrival}
                        <span class="tabular-nums font-medium {rf.actualArrival > rf.scheduledArrival ? 'text-amber-600' : 'text-green-600'}">
                          {formatTime(rf.actualArrival)}
                        </span>
                      {:else if rf.scheduledArrival}
                        <span class="tabular-nums text-muted-foreground">{formatTime(rf.scheduledArrival)}</span>
                      {:else}
                        <span class="text-muted-foreground">—</span>
                      {/if}
                    </div>
                  </div>
                </a>
              {/each}
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Weather: dep + arr side by side -->
  {#if depWeather || arrWeather}
    {@const dirs = ['N','NE','E','SE','S','SW','W','NW']}
    {@const wRow = (w: any) => [
      w.temperature != null ? `${Math.round(w.temperature)}°C` : null,
      w.windSpeed != null ? `${Math.round(w.windSpeed)}mph ${w.windDirection != null ? dirs[Math.round(w.windDirection/45)%8] : ''}`.trim() : null,
      w.visibility != null ? `${Math.round(w.visibility*10)/10}km vis` : null,
      w.precipitation > 0 ? `${Math.round(w.precipitation*10)/10}mm` : null,
      w.cloudCover != null ? `${w.cloudCover}% cloud` : null,
    ].filter(Boolean).join(' · ')}
    <div class="grid gap-3 mb-6 {depWeather && arrWeather ? 'grid-cols-2' : 'grid-cols-1'}">
      {#if depWeather}
        <div class="rounded-lg border bg-card px-4 py-3">
          <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            {airportName(flight.departureAirport)} <span class="opacity-60">({flight.departureAirport})</span> · Departure weather
          </p>
          <p class="text-2xl mb-1"><Icon name={depWeatherIcon as any} size="32px" weather /></p>
          <p class="text-sm text-foreground">{wRow(depWeather)}</p>
        </div>
      {/if}
      {#if arrWeather}
        <div class="rounded-lg border bg-card px-4 py-3">
          <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            {airportName(flight.arrivalAirport)} <span class="opacity-60">({flight.arrivalAirport})</span> · Arrival weather
          </p>
          <p class="text-2xl mb-1"><Icon name={arrWeatherIcon as any} size="32px" weather /></p>
          <p class="text-sm text-foreground">{wRow(arrWeather)}</p>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Flight info + prediction side by side -->
  <div class="grid gap-4 mb-6 {prediction ? 'md:grid-cols-2' : ''}">

    <!-- Flight details -->
    <div class="rounded-lg border bg-card p-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Flight Details</h2>
      <dl class="space-y-2 text-sm">
        <div class="flex justify-between">
          <dt class="text-muted-foreground">Route</dt>
          <dd class="font-medium">
            {airportName(flight.departureAirport)} <span class="text-muted-foreground font-normal">({flight.departureAirport})</span>
            →
            {airportName(flight.arrivalAirport)} <span class="text-muted-foreground font-normal">({flight.arrivalAirport})</span>
          </dd>
        </div>
        {#if flight.aircraftType}
          <div class="flex justify-between">
            <dt class="text-muted-foreground">Aircraft</dt>
            <dd class="font-medium">{flight.aircraftType}</dd>
          </div>
        {/if}
        {#if flight.aircraftRegistration}
          <div class="flex justify-between">
            <dt class="text-muted-foreground">Registration</dt>
            <dd class="font-medium font-mono">{flight.aircraftRegistration}</dd>
          </div>
        {/if}
        <div class="flex justify-between">
          <dt class="text-muted-foreground">Scheduled departure</dt>
          <dd class="font-medium">{formatTime(flight.scheduledDeparture)}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-muted-foreground">Scheduled arrival</dt>
          <dd class="font-medium">{formatTime(flight.scheduledArrival)}</dd>
        </div>
        {#if flight.actualDeparture}
          <div class="flex justify-between">
            <dt class="text-muted-foreground">Actual departure</dt>
            <dd class="font-medium">{formatTime(flight.actualDeparture)}</dd>
          </div>
        {/if}
        {#if flight.actualArrival}
          <div class="flex justify-between">
            <dt class="text-muted-foreground">Actual arrival</dt>
            <dd class="font-medium">{formatTime(flight.actualArrival)}</dd>
          </div>
        {/if}
        <div class="flex justify-between">
          <dt class="text-muted-foreground">Last updated</dt>
          <dd class="text-muted-foreground">{formatDateTime(flight.updatedAt)}</dd>
        </div>
      </dl>
    </div>

    <!-- Delay prediction -->
    {#if prediction && predictionPct !== null}
      <div class="rounded-lg border bg-card p-4">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Delay Prediction</h2>

        <div class="mb-4">
          <div class="flex items-end justify-between mb-1">
            <span class="text-sm text-muted-foreground">Probability of delay</span>
            <span class="text-2xl font-bold {getPredictionColor(predictionPct)}">{predictionPct}%</span>
          </div>
          <div class="h-2 rounded-full bg-muted overflow-hidden">
            <div
              class="h-full rounded-full transition-all {getPredictionBarColor(predictionPct)}"
              style="width: {predictionPct}%"
            ></div>
          </div>
        </div>

        <dl class="space-y-2 text-sm">
          {#if prediction.predictedDelayMinutes > 0}
            <div class="flex justify-between">
              <dt class="text-muted-foreground">Predicted delay</dt>
              <dd class="font-medium">{prediction.predictedDelayMinutes} min</dd>
            </div>
          {/if}
          <div class="flex justify-between">
            <dt class="text-muted-foreground">Confidence</dt>
            <dd class="font-medium capitalize">{prediction.confidence}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-muted-foreground">Model version</dt>
            <dd class="font-medium font-mono text-xs">{prediction.modelVersion}</dd>
          </div>
        </dl>

        <p class="text-xs text-muted-foreground mt-3">
          Expires {formatDateTime(prediction.expiresAt)}
        </p>
      </div>
    {/if}
  </div>

  <!-- Status history -->
  {#if statusHistory.length > 0}
    <div class="rounded-lg border bg-card p-4 mb-6">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Status History</h2>
      <ol class="relative border-l border-border ml-2 space-y-4">
        {#each statusHistory as entry (entry.id)}
          <li class="pl-5 relative">
            <span class="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background"></span>
            <p class="text-sm font-medium">{entry.statusMessage}</p>
            <p class="text-xs text-muted-foreground">
              {formatDateTime(entry.statusTimestamp)}
              <span class="ml-2 rounded border px-1 py-0.5 text-[10px] uppercase tracking-wide">{entry.source}</span>
            </p>
          </li>
        {/each}
      </ol>
    </div>
  {/if}


</div>
