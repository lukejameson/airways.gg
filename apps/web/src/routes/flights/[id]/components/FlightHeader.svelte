<script lang="ts">
  import { airportName } from '$lib/airports';
  import type { IconName } from '$lib/components/Icon.svelte';
  import { shortenStatus, extractDelayReason, isFlightCompleted } from '$lib/status';
  import { getStatusTone, STATUS_TEXT_CLASSES, STATUS_DOT_CLASSES } from '$lib/statusConfig';
  import DelayCounter from '$lib/components/DelayCounter.svelte';

  interface Props {
    flightNumber: string;
    airlineCode: string;
    departureAirport: string;
    arrivalAirport: string;
    isDeparture: boolean;
    scheduledDeparture: Date | string | null;
    actualDeparture: Date | string | null;
    estimatedDeparture: Date | string | null;
    actualArrival: Date | string | null;
    estimatedArrival: Date | string | null;
    delayMinutes: number | null;
    status: string | null;
    canceled: boolean | null;
    isCompleted: boolean;
    flightDate: Date | string | null;
    onShare?: () => void;
    shareSuccess?: boolean;
    returnTab?: string;
  }

  let {
    flightNumber,
    airlineCode,
    departureAirport,
    arrivalAirport,
    isDeparture,
    scheduledDeparture,
    actualDeparture,
    estimatedDeparture,
    actualArrival,
    estimatedArrival,
    delayMinutes,
    status,
    canceled,
    isCompleted,
    flightDate,
    onShare,
    shareSuccess = false,
    returnTab = ''
  }: Props = $props();

  const otherAirport = $derived(isDeparture ? arrivalAirport : departureAirport);
  const scheduledTime = $derived(isDeparture ? scheduledDeparture : null);
  const actualTime = $derived(isDeparture ? actualDeparture : actualArrival);
  const estimatedTime = $derived(isDeparture ? estimatedDeparture : estimatedArrival);

  // Calculate our own status when external source is unreliable
  const calculatedStatus = $derived.by(() => {
    const currentStatus = status?.toLowerCase() ?? '';
    if (currentStatus.includes('landed') || currentStatus.includes('completed') ||
        currentStatus.includes('airborne') || currentStatus.includes('taxiing') ||
        currentStatus.includes('boarding') || currentStatus.includes('cancel')) {
      return status;
    }
    return status || 'Scheduled';
  });

  const getStatusColor = (s: string | null | undefined, canc?: boolean | null) =>
    STATUS_TEXT_CLASSES[getStatusTone(s, canc)];
  const getStatusDotColor = (s: string | null | undefined, canc?: boolean | null) =>
    STATUS_DOT_CLASSES[getStatusTone(s, canc)];

  function shortDate(date: string | Date | null | undefined): string {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }
</script>

<!-- Top row: Back + Share -->
<div class="flex items-center justify-between mb-4">
  <a
    href="/{returnTab ? `?tab=${returnTab}` : ''}"
    class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
  >
    ← Back
  </a>

  <div class="flex items-center gap-1">
    <button
      onclick={onShare}
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
</div>

<!-- Flight Info Header -->
<div class="mb-6">
  <div class="flex items-baseline gap-2 mb-1">
    <h1 class="text-3xl sm:text-4xl font-bold tracking-tight">{flightNumber}</h1>
    <span class="rounded-full border px-2 py-0.5 text-xs sm:text-sm font-medium text-muted-foreground">
      {airlineCode}
    </span>
  </div>

  <p class="text-base sm:text-lg text-muted-foreground">
    {isDeparture ? 'to' : 'from'}
    <span class="font-semibold text-foreground">{airportName(otherAirport)}</span>
    <span class="hidden sm:inline text-muted-foreground/50">({otherAirport})</span>
  </p>

  <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
    <span class="text-muted-foreground">{shortDate(flightDate)}</span>
    <span class="opacity-30 hidden sm:inline">·</span>
    {#if !canceled}
      <DelayCounter
        scheduledTime={scheduledTime}
        estimatedTime={estimatedTime}
        actualTime={actualTime}
        isCompleted={isCompleted}
        class="text-sm"
      />
    {/if}
    <div class="flex items-center gap-1.5">
      <span class="h-2 w-2 rounded-full {getStatusDotColor(calculatedStatus, canceled)}"></span>
      <span class="font-medium {getStatusColor(calculatedStatus, canceled)}">
        {shortenStatus(calculatedStatus)}
      </span>
    </div>
    {#if !canceled && delayMinutes !== null && delayMinutes <= 15}
      <span class="opacity-30 hidden sm:inline">·</span>
      <span class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
        On Time
      </span>
    {/if}
  </div>
</div>
