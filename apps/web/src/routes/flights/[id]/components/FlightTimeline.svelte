<script lang="ts">
  import { airportName } from '$lib/airports';
  import DelayCounter from '$lib/components/DelayCounter.svelte';

  interface Props {
    isDeparture: boolean;
    departureAirport: string;
    arrivalAirport: string;
    scheduledDeparture: Date | string | null;
    scheduledArrival: Date | string | null;
    actualDeparture: Date | string | null;
    actualArrival: Date | string | null;
    estimatedDeparture: Date | string | null;
    estimatedArrival: Date | string | null;
    delayMinutes: number | null;
    canceled: boolean | null;
    isCompleted: boolean;
  }

  let {
    isDeparture,
    departureAirport,
    arrivalAirport,
    scheduledDeparture,
    scheduledArrival,
    actualDeparture,
    actualArrival,
    estimatedDeparture,
    estimatedArrival,
    delayMinutes,
    canceled,
    isCompleted
  }: Props = $props();

  const scheduledTime = $derived(isDeparture ? scheduledDeparture : scheduledArrival);
  const actualTime = $derived(isDeparture ? actualDeparture : actualArrival);
  const estimatedTime = $derived(isDeparture ? estimatedDeparture : estimatedArrival);
  const displayTime = $derived(actualTime ?? estimatedTime);
  const isEstimate = $derived(!actualTime && !!estimatedTime);

  const airportCode = $derived(isDeparture ? departureAirport : arrivalAirport);

  function formatTime(date: string | Date | null | undefined): string {
    if (!date) return '--:--';
    return new Date(date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="grid grid-cols-2 gap-4 mb-6">
  <div class="rounded-lg border bg-card p-4">
    <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Scheduled {isDeparture ? 'Departure' : 'Arrival'}</p>
    <p class="text-3xl font-bold tabular-nums">{formatTime(scheduledTime)}</p>
    <p class="text-sm text-muted-foreground mt-1">
      {airportName(airportCode)}
      <span class="opacity-50">({airportCode})</span>
    </p>
  </div>

  <div class="rounded-lg border bg-card p-4">
    {#if displayTime}
      <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
        {isEstimate ? 'Estimated' : 'Actual'} {isDeparture ? 'Departure' : 'Arrival'}
      </p>
      <p class="text-3xl font-bold tabular-nums {isEstimate ? 'text-yellow-500' : (delayMinutes ?? 0) > 0 ? 'text-red-500' : (delayMinutes ?? 0) < 0 ? 'text-green-500' : ''}">
        {formatTime(displayTime)}
      </p>
      {#if isEstimate}
        <p class="text-xs text-yellow-600 mt-1">Estimated — subject to change</p>
      {:else}
        <p class="text-sm text-muted-foreground mt-1">
          {airportName(airportCode)}
          <span class="opacity-50">({airportCode})</span>
        </p>
      {/if}
    {:else}
      <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
        {isDeparture ? 'Departure' : 'Arrival'} Time
      </p>
      <p class="text-3xl font-bold tabular-nums text-muted-foreground">—</p>
      <p class="text-sm text-muted-foreground mt-1">Not yet available</p>
    {/if}
    {#if !canceled}
      <DelayCounter
        scheduledTime={scheduledTime}
        estimatedTime={estimatedTime}
        actualTime={actualTime}
        isCompleted={isCompleted}
        class="text-sm mt-2 block"
      />
    {/if}
  </div>
</div>
