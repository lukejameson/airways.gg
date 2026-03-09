<script lang="ts">
  import type { flights, weatherData } from '@airways/database';
  import { airportName } from '$lib/airports';
  import Icon, { type IconName } from './Icon.svelte';
  import { getWeatherIconName, isDaytime } from '$lib/daylight';
  import { shortenStatus } from '$lib/status';
  import DelayCounter from './DelayCounter.svelte';

  type Flight = typeof flights.$inferSelect & {
    estimatedDeparture?: string | null;
    estimatedArrival?: string | null;
  };

  interface DaylightData {
    sunrise: Date;
    sunset: Date;
  }

  type WeatherRow = typeof weatherData.$inferSelect;

  interface Props {
    flight: Flight;
    weatherMap?: Record<string, WeatherRow[]>;
    daylightMap?: Record<string, DaylightData[]>;
    returnTab?: string;
  }

  let { flight, weatherMap = {}, daylightMap = {}, returnTab }: Props = $props();

  function fmt(date: string | Date | null | undefined): string {
    if (!date) return '--:--';
    return new Date(date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  // Find weather closest to a given timestamp
  function findClosestWeather(airportCode: string, targetTime: Date) {
    const weatherArray = weatherMap[airportCode];
    if (!weatherArray || weatherArray.length === 0) return null;
    const targetMs = targetTime.getTime();
    const past = weatherArray.filter(w => new Date(w.timestamp).getTime() <= targetMs);
    if (past.length > 0) {
      return past.reduce((a, b) => new Date(a.timestamp).getTime() > new Date(b.timestamp).getTime() ? a : b);
    }
    return weatherArray.reduce((a: WeatherRow, b: WeatherRow) =>
      Math.abs(new Date(a.timestamp).getTime() - targetMs) <= Math.abs(new Date(b.timestamp).getTime() - targetMs) ? a : b
    );
  }

  // Find daylight data for a specific date
  function findDaylight(airportCode: string, targetTime: Date): DaylightData | null {
    const daylightArray = daylightMap[airportCode];
    if (!daylightArray || daylightArray.length === 0) return null;
    
    const target = new Date(targetTime);
    
    // Find the daylight data closest to the target time
    return daylightArray.reduce((closest: DaylightData | null, current: DaylightData) => {
      if (!closest) return current;
      const closestSunrise = new Date(closest.sunrise);
      const currentSunrise = new Date(current.sunrise);
      const closestDiff = Math.abs(closestSunrise.getTime() - target.getTime());
      const currentDiff = Math.abs(currentSunrise.getTime() - target.getTime());
      return currentDiff < closestDiff ? current : closest;
    }, null);
  }

  // Determine if it's currently daytime at a given airport.
  // Uses the current wall-clock time, not the flight's scheduled time — the
  // weather strip shows current conditions, so the icon should reflect right now.
  function getIsDay(airportCode: string): boolean {
    const daylight = findDaylight(airportCode, new Date());
    if (!daylight) return true; // Default to day if no daylight data
    return isDaytime(new Date(daylight.sunrise), new Date(daylight.sunset), new Date());
  }

  // Get weather icon name based on code and current time of day at the airport
  function getWeatherIcon(airportCode: string, weatherCode: number | null): IconName {
    const isDay = getIsDay(airportCode);
    return getWeatherIconName(weatherCode, isDay);
  }

  function fmtWeather(w: WeatherRow): string {
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
  const estimatedTime = $derived(isDeparture ? flight.estimatedDeparture : flight.estimatedArrival);
  
  // Check if estimated time has passed but flight hasn't landed yet
  const estimatedTimeExpired = $derived.by(() => {
    if (!estimatedTime || actualTime) return false;
    const status = flight.status?.toLowerCase() ?? '';
    // If flight has landed, diverted, or cancelled, estimated time is still valid
    if (status.includes('landed') || status.includes('completed') || status.includes('cancel') || status.includes('diverted')) return false;
    // Check if estimated time has passed
    return new Date(estimatedTime).getTime() < Date.now();
  });
  
  // Use estimated time only if it hasn't expired, otherwise fall back to scheduled
  const effectiveEstimatedTime = $derived(estimatedTime && scheduledTime && new Date(estimatedTime).getTime() !== new Date(scheduledTime).getTime() ? estimatedTime : null);
  const displayTime = $derived(actualTime ?? effectiveEstimatedTime);
  const otherAirport = $derived(isDeparture ? flight.arrivalAirport : flight.departureAirport);
  const delayMinutes = $derived(flight.delayMinutes ?? 0);
  const isEstimate = $derived(!actualTime && !!effectiveEstimatedTime && !estimatedTimeExpired && new Date(effectiveEstimatedTime).getTime() > Date.now());

  const isCompleted = $derived.by(() => {
    const s = flight.status?.toLowerCase() ?? '';
    return s === 'landed' || s === 'completed' || s.includes('diverted') || flight.canceled === true;
  });

  // Calculate delay from available data (display time takes precedence over stored delayMinutes)
  const calculatedDelayMinutes = $derived.by(() => {
    if (displayTime && scheduledTime) {
      return Math.round((new Date(displayTime).getTime() - new Date(scheduledTime).getTime()) / 60000);
    }
    return delayMinutes;
  });

  // Calculate our own status when external source is unreliable
  const calculatedStatus = $derived.by(() => {
    // If flight is already landed/airborne/boarding/cancelled, trust that status
    const currentStatus = flight.status?.toLowerCase() ?? '';
    if (currentStatus.includes('landed') || currentStatus.includes('completed') ||
        currentStatus.includes('airborne') || currentStatus.includes('taxiing') ||
        currentStatus.includes('boarding') || currentStatus.includes('cancel')) {
      return flight.status;
    }

    // Check calculated delay from times
    if (calculatedDelayMinutes > 15) {
      return 'Delayed';
    }

    // If the estimated arrival/departure is early, the flight must be airborne
    if (calculatedDelayMinutes < -5 && new Date(flight.scheduledDeparture).getTime() <= Date.now()) {
      return 'Airborne';
    }

    // Otherwise trust the external status
    return flight.status || 'Scheduled';
  });

  // Format early arrival for display (e.g., "-16m" or "-1h 5m")
  const formattedEarly = $derived.by(() => {
    if (calculatedDelayMinutes >= -5) return null;
    const absMins = Math.abs(calculatedDelayMinutes);
    const hrs = Math.floor(absMins / 60);
    const mins = absMins % 60;
    if (hrs > 0 && mins > 0) return `-${hrs}h ${mins}m`;
    if (hrs > 0) return `-${hrs}h`;
    return `-${mins}m`;
  });

  // Format delay for display (e.g., "5h 35m" or "45m")
  const formattedDelay = $derived.by(() => {
    if (calculatedDelayMinutes <= 0) return null;
    const hrs = Math.floor(calculatedDelayMinutes / 60);
    const mins = calculatedDelayMinutes % 60;
    if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
    if (hrs > 0) return `${hrs}h`;
    return `${mins}m`;
  });

  type BadgeTone = 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'orange' | 'gray';
  const tone = $derived.by((): BadgeTone => {
    const s = calculatedStatus?.toLowerCase() ?? '';
    // Diverted must be checked before yellow — "Flight Diverted to X Next Info HH:MM" contains both
    if (s.includes('diverted') || s.includes('diverting')) return 'orange';
    if (s.includes('cancel'))    return 'red';
    // Delayed: explicit delay, approx times, new ETD, expected, indefinite
    if (s.includes('delayed') || s.startsWith('approx') || s.includes('new etd') ||
        s.includes('expected at') || s.includes('indefini') || s.includes('next info')) return 'yellow';
    // Door and gate closed = pushed back, post-boarding → blue
    if (s.includes('landed') || s.includes('airborne') || s.includes('taxiing') ||
        s.includes('completed') || s.includes('holding') || s.includes('door and gate')) return 'blue';
    // Boarding: check-in, go to gate/departures, final call, gate closed, wait in lounge
    if (s.includes('boarding') || s.includes('check in open') || s.includes('check-in open') ||
        s.includes('go to') || s.includes('final call') || s.includes('gate closed') ||
        s.includes('wait in lounge')) return 'purple';
    if (s.includes('on time') || s === 'scheduled') return 'green';
    // PAX transfer messages are informational — gray, not green
    if (s.includes('pax') || s.includes('passengers')) return 'gray';
    return 'gray';
  });

  // Weather for dep and arr airports - find closest to scheduled times
  const depWeather = $derived(findClosestWeather(flight.departureAirport, flight.scheduledDeparture));
  const arrWeather = $derived(findClosestWeather(flight.arrivalAirport, flight.scheduledArrival));
  const hasWeather = $derived(!!depWeather || !!arrWeather);

  // Get weather icons — always reflect the current time of day, not flight time
  const depWeatherIcon = $derived(
    depWeather ? getWeatherIcon(flight.departureAirport, depWeather.weatherCode) : 'cloud'
  );
  const arrWeatherIcon = $derived(
    arrWeather ? getWeatherIcon(flight.arrivalAirport, arrWeather.weatherCode) : 'cloud'
  );
</script>

<a href="/flights/{flight.id}{returnTab ? `?tab=${returnTab}` : ''}" class="group block {isCompleted ? 'opacity-60 hover:opacity-80' : ''}" style="-webkit-tap-highlight-color: transparent;">
  <div class="rounded-lg border border-border bg-card transition-colors hover:border-primary/40 hover:bg-accent/30">

    <!-- Main row - responsive layout -->
    <div class="flex items-center gap-3 sm:gap-4 px-4 py-3">

      <!-- Time -->
      <div class="w-16 shrink-0 text-center">
        {#if displayTime}
          <p class="text-xs tabular-nums text-muted-foreground line-through leading-none">{fmt(scheduledTime)}</p>
          <p class="text-lg font-bold tabular-nums leading-none {calculatedDelayMinutes > 0 ? 'text-red-500' : 'text-foreground'} mt-1">{fmt(displayTime)}</p>
          {#if isEstimate}
            <p class="text-[10px] text-muted-foreground leading-none mt-0.5">est.</p>
          {/if}
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
        <DelayCounter
          scheduledTime={scheduledTime}
          estimatedTime={estimatedTime}
          actualTime={actualTime}
          isCompleted={isCompleted}
          class="text-sm"
        />
        {#if !isCompleted && formattedEarly}
          <span class="text-sm font-bold text-green-600">{formattedEarly}</span>
        {/if}

        <!-- Status badge -->
        <div class="shrink-0">
          {#if tone === 'yellow'}
            <span class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
              <span class="h-2 w-2 rounded-full bg-amber-500"></span>{shortenStatus(calculatedStatus)}
            </span>
          {:else if tone === 'red'}
            <span class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold bg-red-100 text-red-800 border border-red-300">
              <span class="h-2 w-2 rounded-full bg-red-500"></span>{shortenStatus(calculatedStatus)}
            </span>
          {:else if tone === 'orange'}
            <span class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-300">
              <span class="h-2 w-2 rounded-full bg-orange-500"></span>{shortenStatus(calculatedStatus)}
            </span>
          {:else if tone === 'blue'}
            <span class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
              <span class="h-2 w-2 rounded-full bg-blue-500"></span>{shortenStatus(calculatedStatus)}
            </span>
          {:else if tone === 'purple'}
            <span class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-300">
              <span class="h-2 w-2 rounded-full bg-purple-500"></span>{shortenStatus(calculatedStatus)}
            </span>
          {:else if tone === 'green'}
            <span class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold bg-green-100 text-green-800 border border-green-300">
              <span class="h-2 w-2 rounded-full bg-green-500"></span>{shortenStatus(calculatedStatus)}
            </span>
          {:else}
            <span class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-300">
              <span class="h-2 w-2 rounded-full bg-gray-400"></span>{shortenStatus(calculatedStatus)}
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
            <Icon name={depWeatherIcon} size="16px" weather class="flex-shrink-0" />
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
            <Icon name={arrWeatherIcon} size="16px" weather class="flex-shrink-0" />
            <span>{fmtWeather(arrWeather)}</span>
          </span>
        {/if}
      </div>
    {/if}

  </div>
</a>
