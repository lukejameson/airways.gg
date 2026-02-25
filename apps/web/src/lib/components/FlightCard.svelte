<script lang="ts">
  import type { flights, delayPredictions } from '@delays/database';
  import { airportName } from '$lib/airports';

  type Flight = typeof flights.$inferSelect & {
    prediction: (typeof delayPredictions.$inferSelect) | null;
  };

  interface Props {
    flight: Flight;
    weatherMap?: Record<string, any>;
    returnTab?: string;
  }

  let { flight, weatherMap = {}, returnTab }: Props = $props();

  function fmt(date: string | Date | null | undefined): string {
    if (!date) return '--:--';
    return new Date(date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  // Find weather closest to a given timestamp
  function findClosestWeather(airportCode: string, targetTime: Date) {
    const weatherArray = weatherMap[airportCode];
    if (!weatherArray || weatherArray.length === 0) return null;
    
    return weatherArray.reduce((closest: any, current: any) => {
      const closestDiff = Math.abs(new Date(closest.timestamp).getTime() - targetTime.getTime());
      const currentDiff = Math.abs(new Date(current.timestamp).getTime() - targetTime.getTime());
      return currentDiff < closestDiff ? current : closest;
    });
  }

  function weatherIcon(code: number | null): string {
    if (code == null) return '';
    if (code === 0) return '☀️';
    if (code <= 2)  return '🌤️';
    if (code === 3) return '☁️';
    if (code <= 49) return '🌫️';
    if (code <= 67) return '🌧️';
    if (code <= 77) return '❄️';
    if (code <= 82) return '🌦️';
    if (code <= 86) return '🌨️';
    return '⛈️';
  }

  function fmtWeather(w: any): string {
    if (!w) return '';
    const parts: string[] = [];
    if (w.temperature != null) parts.push(`${Math.round(w.temperature)}°C`);
    if (w.windSpeed != null) {
      const dirs = ['N','NE','E','SE','S','SW','W','NW'];
      const dir = w.windDirection != null ? dirs[Math.round(w.windDirection / 45) % 8] : '';
      parts.push(`${Math.round(w.windSpeed)}mph ${dir}`.trim());
    }
    return parts.join(' · ');
  }

  const isDeparture = $derived(flight.departureAirport === 'GCI');
  const scheduledTime = $derived(isDeparture ? flight.scheduledDeparture : flight.scheduledArrival);
  const actualTime = $derived(isDeparture ? flight.actualDeparture : flight.actualArrival);
  const otherAirport = $derived(isDeparture ? flight.arrivalAirport : flight.departureAirport);
  const delayMinutes = $derived(flight.delayMinutes ?? 0);

  const isCompleted = $derived.by(() => {
    const s = flight.status?.toLowerCase() ?? '';
    return s === 'completed' || flight.canceled === true;
  });
  const isDelayed = $derived(flight.status?.toLowerCase() === 'delayed');
  const showEstimate = $derived(isDelayed && !!actualTime);

  type BadgeTone = 'green' | 'yellow' | 'red' | 'blue' | 'gray';
  const tone = $derived.by((): BadgeTone => {
    const s = flight.status?.toLowerCase() ?? '';
    if (s.includes('delayed'))   return 'yellow';
    if (s.includes('cancel'))    return 'red';
    if (s.includes('landed') || s.includes('airborne') || s.includes('completed')) return 'blue';
    if (s.includes('on time') || s.includes('scheduled')) return 'green';
    return 'gray';
  });

  // Weather for dep and arr airports - find closest to scheduled times
  const depWeather = $derived(findClosestWeather(flight.departureAirport, flight.scheduledDeparture));
  const arrWeather = $derived(findClosestWeather(flight.arrivalAirport, flight.scheduledArrival));
  const hasWeather = $derived(!!depWeather || !!arrWeather);
</script>

<a href="/flights/{flight.id}{returnTab ? `?tab=${returnTab}` : ''}" class="group block {isCompleted ? 'opacity-60 hover:opacity-80' : ''}" style="-webkit-tap-highlight-color: transparent;">
  <div class="rounded-lg border border-border bg-card transition-colors hover:border-primary/40 hover:bg-accent/30">

    <!-- Main row - responsive layout -->
    <div class="flex items-center gap-3 sm:gap-4 px-4 py-3">

      <!-- Time -->
      <div class="w-16 shrink-0 text-center">
        {#if showEstimate}
          <p class="text-xs tabular-nums text-muted-foreground line-through leading-none">{fmt(scheduledTime)}</p>
          <p class="text-lg font-bold tabular-nums leading-none text-amber-600 mt-1">{fmt(actualTime)}</p>
          <p class="text-[10px] text-amber-500 leading-none mt-0.5">est.</p>
        {:else if actualTime && delayMinutes > 0}
          <p class="text-xs tabular-nums text-muted-foreground line-through leading-none">{fmt(scheduledTime)}</p>
          <p class="text-lg font-bold tabular-nums leading-none text-red-500 mt-1">{fmt(actualTime)}</p>
        {:else}
          <p class="text-lg font-bold tabular-nums leading-none text-foreground">{fmt(scheduledTime)}</p>
        {/if}
      </div>

      <!-- Divider - desktop only -->
      <div class="hidden sm:block h-10 w-px shrink-0 bg-border"></div>

      <!-- Flight + route -->
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-2">
          <span class="text-base font-semibold leading-none">{flight.flightNumber}</span>
          {#if flight.aircraftType}
            <span class="text-xs text-muted-foreground">{flight.aircraftType}</span>
          {/if}
        </div>
        <p class="mt-0.5 text-sm text-muted-foreground truncate">
          {isDeparture ? 'to' : 'from'}
          <span class="font-medium text-foreground">{airportName(otherAirport)}</span>
          <span class="text-muted-foreground/60 hidden sm:inline">({otherAirport})</span>
        </p>
      </div>

      <!-- Status & Delay - fixed width on mobile to prevent jumping -->
      <div class="flex items-center gap-2 shrink-0 ml-auto">
        {#if delayMinutes > 0}
          <span class="text-xs font-bold text-red-600 dark:text-red-400">+{delayMinutes}m</span>
        {/if}

        <!-- Status badge -->
        <div class="shrink-0">
          {#if tone === 'yellow'}
            <span class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
              <span class="h-2 w-2 rounded-full bg-amber-500"></span>{flight.status || 'Scheduled'}
            </span>
          {:else if tone === 'red'}
            <span class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300 border border-red-300 dark:border-red-700">
              <span class="h-2 w-2 rounded-full bg-red-500"></span>{flight.status || 'Scheduled'}
            </span>
          {:else if tone === 'blue'}
            <span class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 border border-blue-300 dark:border-blue-700">
              <span class="h-2 w-2 rounded-full bg-blue-500"></span>{flight.status || 'Scheduled'}
            </span>
          {:else if tone === 'green'}
            <span class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300 border border-green-300 dark:border-green-700">
              <span class="h-2 w-2 rounded-full bg-green-500"></span>{flight.status || 'Scheduled'}
            </span>
          {:else}
            <span class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-300 dark:border-gray-600">
              <span class="h-2 w-2 rounded-full bg-gray-400"></span>{flight.status || 'Scheduled'}
            </span>
          {/if}
        </div>
      </div>
    </div>

    <!-- Weather strip — desktop only, hidden on mobile -->
    {#if hasWeather}
      <div class="hidden sm:flex sm:items-center gap-2 sm:gap-4 border-t border-border/60 px-4 py-1.5">
        {#if depWeather}
          <span class="text-xs text-muted-foreground flex items-center gap-1">
            <span class="font-medium">{airportName(flight.departureAirport)}</span>
            <span class="opacity-50">({flight.departureAirport})</span>
            <span>{weatherIcon(depWeather.weatherCode)}</span>
            <span>{fmtWeather(depWeather)}</span>
          </span>
        {/if}
        {#if depWeather && arrWeather}
          <span class="text-muted-foreground/40 text-xs">→</span>
        {/if}
        {#if arrWeather}
          <span class="text-xs text-muted-foreground flex items-center gap-1">
            <span class="font-medium">{airportName(flight.arrivalAirport)}</span>
            <span class="opacity-50">({flight.arrivalAirport})</span>
            <span>{weatherIcon(arrWeather.weatherCode)}</span>
            <span>{fmtWeather(arrWeather)}</span>
          </span>
        {/if}
      </div>
    {/if}

  </div>
</a>