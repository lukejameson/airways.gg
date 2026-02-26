<script lang="ts">
  import Icon from './Icon.svelte';
  import { getWeatherIconName, isDaytime } from '$lib/daylight';

  interface Weather {
    temperature: number | null;
    windSpeed: number | null;
    windDirection: number | null;
    precipitation: number | null;
    visibility: number | null;
    cloudCover: number | null;
    weatherCode: number | null;
    timestamp: string | Date;
  }

  interface DaylightData {
    sunrise: Date;
    sunset: Date;
  }

  interface Props {
    weather: Weather | null;
    label?: string;
    daylight?: DaylightData | null;
  }

  let { weather, label = 'GCI', daylight }: Props = $props();

  function windDir(deg: number | null): string {
    if (deg == null) return '';
    return ['N','NE','E','SE','S','SW','W','NW'][Math.round(deg / 45) % 8];
  }

  // Determine if it's currently daytime
  const isDay = $derived.by(() => {
    if (!daylight) return true; // Default to day icons if no daylight data
    const now = new Date();
    return isDaytime(daylight.sunrise, daylight.sunset, now);
  });

  // Get appropriate icon name based on weather code and time of day
  const iconName = $derived(
    weather ? getWeatherIconName(weather.weatherCode, isDay) : 'cloud' as const
  );
</script>

{#if weather}
  <div class="inline-flex items-center gap-2.5 text-sm">
    <span class="font-medium text-muted-foreground text-xs">{label}</span>
    <Icon name={iconName as any} size="20px" weather class="flex-shrink-0" />
    {#if weather.temperature != null}
      <span class="font-semibold">{Math.round(weather.temperature)}°C</span>
    {/if}
    {#if weather.windSpeed != null}
      <span class="text-muted-foreground">
        {Math.round(weather.windSpeed)}mph {windDir(weather.windDirection)}
      </span>
    {/if}
    {#if weather.visibility != null}
      <span class="text-muted-foreground">{Math.round(weather.visibility * 10) / 10}km vis</span>
    {/if}
    {#if weather.precipitation != null && weather.precipitation > 0}
      <span class="text-blue-500">💧{Math.round(weather.precipitation * 10) / 10}mm</span>
    {/if}
  </div>
{/if}
