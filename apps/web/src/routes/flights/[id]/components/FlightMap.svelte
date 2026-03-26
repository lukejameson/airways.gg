<script lang="ts">
  import { browser } from '$app/environment';
  import type { Component } from 'svelte';
  import { airportName, getAirportCoords } from '$lib/airports';
  import { nearestAirport, compassDir, calculateDistance } from '../lib/map';

  interface Position {
    lat: number;
    lon: number;
    heading?: number | null;
    altitudeFt?: number | null;
    groundSpeedKts?: number | null;
    onGround?: boolean | null;
    positionTimestamp: Date | string;
    fr24Id?: string | null;
    originIata?: string | null;
    destIata?: string | null;
  }

  interface Props {
    position: Position;
    departureAirport: string;
    arrivalAirport: string;
    rotationOverridesPosition?: boolean;
    inferredLocation?: { airport: string; source: string } | null;
    isPreDeparture?: boolean;
  }

  let {
    position,
    departureAirport,
    arrivalAirport,
    rotationOverridesPosition = false,
    inferredLocation = null,
    isPreDeparture = false
  }: Props = $props();

  let FlightMapComponent: Component<{
    lat: number;
    lon: number;
    heading: number;
    depAirport: string;
    arrAirport: string;
  }> | null = $state(null);
  let mapExpanded = $state(false);

  const hasPosition = $derived(!!position && position.lat != null && position.lon != null);
  const isInferred = $derived(position?.fr24Id?.startsWith('INFERRED_'));

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

  function timeSince(date: string | Date | null): string {
    if (!date) return '';
    const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
  }

  function getFlightProgressDescription(depCoords: [number, number] | null, arrCoords: [number, number] | null): string {
    if (!position) return 'Location unavailable';
    if (isInferred) {
      const iata = nearestAirport(position.lat, position.lon) ?? position.destIata ?? '—';
      return `On the ground at ${airportName(iata)}`;
    }
    if (position.onGround) {
      const iata = nearestAirport(position.lat, position.lon) ?? position.destIata ?? arrivalAirport;
      return `Currently at ${airportName(iata)}`;
    }
    const dep = airportName(departureAirport);
    const arr = airportName(arrivalAirport);
    const altitude = position.altitudeFt;
    if (altitude != null) {
      if (altitude < 1000) return `Departing ${dep}`;
      if (altitude > 30000) return `Cruising at ${altitude.toLocaleString()} ft`;
      if (altitude < 5000) return `Approaching ${arr}`;
      return `En route from ${dep} to ${arr}`;
    }
    return `En route from ${dep} to ${arr}`;
  }

  function getProgressPercentage(depCoords: [number, number] | null, arrCoords: [number, number] | null): number {
    if (!position || !depCoords || !arrCoords) return 0;
    const totalDistance = calculateDistance(depCoords[0], depCoords[1], arrCoords[0], arrCoords[1]);
    const currentDistance = calculateDistance(position.lat, position.lon, arrCoords[0], arrCoords[1]);
    return Math.max(0, Math.min(100, Math.round((1 - currentDistance / totalDistance) * 100)));
  }

  const depCoords = $derived(position?.originIata ?
    getAirportCoords(position.originIata) :
    getAirportCoords(departureAirport)
  );
  const arrCoords = $derived(position?.destIata ?
    getAirportCoords(position.destIata) :
    getAirportCoords(arrivalAirport)
  );
</script>

{#if hasPosition && !rotationOverridesPosition}
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
              <p class="font-semibold text-foreground">{getFlightProgressDescription(depCoords, arrCoords)}</p>
              {#if !isInferred && position.altitudeFt != null && !position.onGround}
                {@const progress = getProgressPercentage(depCoords, arrCoords)}
                <div class="flex items-center gap-2 mt-1">
                  <span class="text-xs text-muted-foreground">{airportName(departureAirport)} <span class="opacity-50">({departureAirport})</span></span>
                  <div class="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div class="h-full bg-primary rounded-full" style="width: {progress}%"></div>
                  </div>
                  <span class="text-xs text-muted-foreground">{airportName(arrivalAirport)} <span class="opacity-50">({arrivalAirport})</span></span>
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
        <FlightMapComponent
          lat={position.lat}
          lon={position.lon}
          heading={position.heading ?? 0}
          depAirport={departureAirport}
          arrAirport={arrivalAirport}
        />
      {:else if browser}
        <div class="h-72 flex items-center justify-center text-sm text-muted-foreground bg-muted/30">
          Loading map…
        </div>
      {/if}
    {/if}
  </div>
{:else}
  <!-- No live position or rotation overrides it -->
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
      {#if isPreDeparture}
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          <div>
            <p class="font-semibold text-foreground">
              On the ground at {airportName(departureAirport)} <span class="opacity-50 font-normal">({departureAirport})</span>
            </p>
            <p class="text-xs text-muted-foreground mt-0.5">Pre-departure — live tracking starts when airborne</p>
          </div>
        </div>
      {:else}
        <p class="text-sm text-muted-foreground">
          Aircraft not currently tracked by Flightradar24. It may be at {airportName(departureAirport)} ({departureAirport}), {airportName(arrivalAirport)} ({arrivalAirport}), or en route to/from base airport. Live tracking will appear once the aircraft transmits position data.
        </p>
      {/if}
    {/if}
  </div>
{/if}
