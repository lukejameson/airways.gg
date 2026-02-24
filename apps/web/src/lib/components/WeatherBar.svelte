<script lang="ts">
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

  interface Props {
    weather: Weather | null;
    label?: string;
  }

  let { weather, label = 'GCI' }: Props = $props();

  function windDir(deg: number | null): string {
    if (deg == null) return '';
    return ['N','NE','E','SE','S','SW','W','NW'][Math.round(deg / 45) % 8];
  }

  function icon(code: number | null): string {
    if (code == null) return '–';
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
</script>

{#if weather}
  <div class="inline-flex items-center gap-2.5 text-sm">
    <span class="font-medium text-muted-foreground text-xs">{label}</span>
    <span>{icon(weather.weatherCode)}</span>
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
