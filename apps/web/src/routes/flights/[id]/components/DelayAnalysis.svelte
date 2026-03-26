<script lang="ts">
  import { airportName } from '$lib/airports';
  import { statusHasDetail, extractDelayReason, isFlightCompleted } from '$lib/status';
  import { getStatusTone, STATUS_TEXT_CLASSES, STATUS_DOT_CLASSES, STATUS_PILL_CLASSES } from '$lib/statusConfig';
  import { shortenStatus } from '$lib/status';

  interface StatusHistoryEntry {
    id: number;
    statusMessage: string;
    statusTimestamp: Date | string;
    source: string;
  }

  interface Props {
    status: string | null;
    canceled: boolean | null;
    isDeparture: boolean;
    statusHistory: StatusHistoryEntry[];
    delayMinutes: number | null;
    depWeather?: { visibility?: number | null } | null;
    arrWeather?: { visibility?: number | null } | null;
    departureAirport: string;
    arrivalAirport: string;
  }

  let {
    status,
    canceled,
    isDeparture,
    statusHistory,
    delayMinutes,
    depWeather,
    arrWeather,
    departureAirport,
    arrivalAirport
  }: Props = $props();

  const calculatedStatus = $derived(status || 'Scheduled');
  const showFullStatus = $derived(statusHasDetail(calculatedStatus));

  const delayReason = $derived.by(() => {
    if (!isDeparture) return null;
    const s = status?.toLowerCase() ?? '';
    if (s.includes('airborne') || s.includes('landed') || s.includes('completed') || s.includes('taxiing') || s.includes('diverted') || s.includes('diverting')) return null;
    const fromStatus = extractDelayReason(status);
    if (fromStatus) return fromStatus;
    const guernseyEntries = statusHistory.filter((e: { source: string }) => e.source === 'guernsey_airport');
    for (const entry of [...guernseyEntries].reverse()) {
      const r = extractDelayReason((entry as { statusMessage: string }).statusMessage);
      if (r) return r;
    }
    return null;
  });

  const fogAirport = $derived.by(() => {
    if (depWeather?.visibility != null && depWeather.visibility <= 5) return { code: departureAirport, visibility: depWeather.visibility };
    if (arrWeather?.visibility != null && arrWeather.visibility <= 5) return { code: arrivalAirport, visibility: arrWeather.visibility };
    return null;
  });
  const showFogWarning = $derived(!canceled && fogAirport != null);

  const getStatusColor = (s: string | null | undefined, canc?: boolean | null) =>
    STATUS_TEXT_CLASSES[getStatusTone(s, canc)];
  const getStatusDotColor = (s: string | null | undefined, canc?: boolean | null) =>
    STATUS_DOT_CLASSES[getStatusTone(s, canc)];
</script>

<!-- Full status detail -->
{#if showFullStatus}
  <div class="mb-4 flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
    <span class="mt-0.5 h-2 w-2 shrink-0 rounded-full {getStatusDotColor(calculatedStatus, canceled)}"></span>
    <span class="text-foreground">{calculatedStatus}</span>
  </div>
{/if}

<!-- Delay reason -->
{#if delayReason && !canceled}
  <div class="mb-4 flex items-start gap-3 rounded-lg border px-4 py-3
    {delayReason.reason === 'weather' ? 'border-blue-300 bg-blue-100' :
     delayReason.reason === 'holding' ? 'border-blue-300 bg-blue-100' :
     'border-amber-300 bg-amber-100'}">
    <div class="shrink-0 mt-0.5">
      {#if delayReason.reason === 'weather'}
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-600 dark:text-blue-400">
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
          <path d="M22 10a3 3 0 0 0-3-3h-2.207a5.502 5.502 0 0 0-10.702.5"/>
        </svg>
      {:else if delayReason.reason === 'holding'}
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-600 dark:text-blue-400">
          <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21 4 19 2c-2-2-4-2-5.5-.5L10 5 1.8 6.2l5 5L5 13l2 2 2-2 5 5Z"/>
        </svg>
      {:else if delayReason.reason === 'indefinite'}
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-amber-600 dark:text-amber-400">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-amber-600 dark:text-amber-400">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      {/if}
    </div>
    <div>
      <p class="text-sm font-semibold
        {delayReason.reason === 'weather' || delayReason.reason === 'holding' ? 'text-blue-900' : 'text-amber-900'}">
        {delayReason.label}
      </p>
      {#if delayReason.reason === 'weather' && delayReason.nextInfo}
        <p class="text-xs mt-0.5 text-blue-700">Next update expected at {delayReason.nextInfo}</p>
      {/if}
    </div>
  </div>
{/if}

<!-- Fog warning -->
{#if showFogWarning}
  <div class="mb-4 flex items-start gap-3 rounded-lg border border-slate-300 bg-slate-100 px-4 py-3">
    <div class="shrink-0 mt-0.5">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-500">
        <line x1="3" y1="10" x2="21" y2="10"/>
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="14" x2="21" y2="14"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </div>
    <div>
      <p class="text-sm font-semibold text-slate-900">Low visibility at {airportName(fogAirport!.code)}</p>
      <p class="text-xs mt-0.5 text-slate-600">
        Current visibility {Math.round(fogAirport!.visibility * 10) / 10}km — fog or low cloud may affect operations
      </p>
    </div>
  </div>
{/if}
