<script lang="ts">
  import Icon from '$lib/components/Icon.svelte';
  import type { IconName } from '$lib/components/Icon.svelte';
  import { getWeatherIconName } from '$lib/daylight';
  import { airportName } from '$lib/airports';

  interface WeatherData {
    temperature?: number | null;
    windSpeed?: number | null;
    windDirection?: number | null;
    visibility?: number | null;
    cloudCover?: number | null;
    weatherCode?: number | null;
  }

  interface Props {
    depWeather?: WeatherData | null;
    arrWeather?: WeatherData | null;
    departureAirport: string;
    arrivalAirport: string;
    isDayAtDep: boolean;
    isDayAtArr: boolean;
  }

  let {
    depWeather,
    arrWeather,
    departureAirport,
    arrivalAirport,
    isDayAtDep,
    isDayAtArr
  }: Props = $props();

  const depWeatherIcon: IconName = $derived(depWeather ? getWeatherIconName(depWeather.weatherCode, isDayAtDep) : 'cloud');
  const arrWeatherIcon: IconName = $derived(arrWeather ? getWeatherIconName(arrWeather.weatherCode, isDayAtArr) : 'cloud');

  const dirs = ['N','NE','E','SE','S','SW','W','NW'];

  function formatWeatherRow(w: WeatherData): string {
    const parts = [
      w.temperature != null ? `${Math.round(w.temperature)}°C` : null,
      w.windSpeed != null ? `${Math.round(w.windSpeed)}mph ${w.windDirection != null ? dirs[Math.round(w.windDirection/45)%8] : ''}`.trim() : null,
      w.visibility != null ? `${Math.round(w.visibility*10)/10}km vis` : null,
      w.cloudCover != null ? `${w.cloudCover}% cloud` : null,
    ].filter(Boolean);
    return parts.join(' · ');
  }
</script>

{#if depWeather || arrWeather}
  <div class="grid gap-3 mb-6 {depWeather && arrWeather ? 'grid-cols-2' : 'grid-cols-1'}">
    {#if depWeather}
      <div class="rounded-lg border bg-card px-4 py-3">
        <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
          {airportName(departureAirport)} <span class="opacity-60">({departureAirport})</span> · Departure weather
        </p>
        <p class="text-2xl mb-1"><Icon name={depWeatherIcon} size="32px" weather /></p>
        <p class="text-sm text-foreground">{formatWeatherRow(depWeather)}</p>
      </div>
    {/if}
    {#if arrWeather}
      <div class="rounded-lg border bg-card px-4 py-3">
        <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
          {airportName(arrivalAirport)} <span class="opacity-60">({arrivalAirport})</span> · Arrival weather
        </p>
        <p class="text-2xl mb-1"><Icon name={arrWeatherIcon} size="32px" weather /></p>
        <p class="text-sm text-foreground">{formatWeatherRow(arrWeather)}</p>
      </div>
    {/if}
  </div>
{/if}
