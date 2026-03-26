<script lang="ts">
  import { airportName } from '$lib/airports';
  import { shortenStatus } from '$lib/status';
  import { getStatusTone, STATUS_PILL_CLASSES } from '$lib/statusConfig';

  interface RotationFlight {
    id: number;
    flightNumber: string;
    departureAirport: string;
    arrivalAirport: string;
    scheduledDeparture: Date | string;
    scheduledArrival: Date | string;
    actualDeparture?: Date | string | null;
    actualArrival?: Date | string | null;
    status?: string | null;
    canceled?: boolean | null;
    delayMinutes?: number | null;
  }

  interface Props {
    rotationFlights: RotationFlight[];
    aircraftRegistration: string;
    currentFlightId: number;
  }

  let { rotationFlights, aircraftRegistration, currentFlightId }: Props = $props();

  let rotationExpanded = $state(false);
  let rotationScrollEl: HTMLDivElement | undefined = $state();

  function toggleRotation() {
    rotationExpanded = !rotationExpanded;
    if (rotationExpanded) {
      setTimeout(() => {
        const el = rotationScrollEl?.querySelector('[data-current="true"]') as HTMLElement | null;
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 50);
    }
  }

  function rotationDelayDelta(delayMinutes: number | null): string | null {
    if (!delayMinutes || delayMinutes <= 0) return null;
    const hrs = Math.floor(delayMinutes / 60);
    const mins = delayMinutes % 60;
    if (hrs > 0 && mins > 0) return `+${hrs}h ${mins}m`;
    if (hrs > 0) return `+${hrs}h`;
    return `+${mins}m`;
  }

  function formatTime(date: string | Date | null | undefined): string {
    if (!date) return '—';
    return new Date(date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  const rotationStatusTone = (status: string | null, canceled?: boolean | null) =>
    getStatusTone(status, canceled);
</script>

{#if rotationFlights && rotationFlights.length > 1}
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
          <p class="font-semibold text-foreground">{aircraftRegistration} · Today's rotation</p>
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
                {@const isCurrent = rf.id === currentFlightId}
                {@const tone = rotationStatusTone(rf.status, rf.canceled)}
                {@const delayDelta = rotationDelayDelta(rf.delayMinutes)}
                <tr
                  data-current={isCurrent}
                  class="border-t border-border/50 transition-colors
                    {isCurrent ? 'bg-primary/8 border-l-2 border-l-primary' : 'hover:bg-muted/30'}
                    {rf.canceled ? 'opacity-60' : ''}"
                >
                  <td class="px-4 py-2.5">
                    <a href="/flights/{rf.id}" class="font-semibold {isCurrent ? 'text-primary' : 'hover:text-primary transition-colors'} {rf.canceled ? 'line-through' : ''}">
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
                    <span class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium {STATUS_PILL_CLASSES[tone]}">
                      {shortenStatus(rf.status) ?? 'Scheduled'}{#if delayDelta} · {delayDelta}{/if}
                    </span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>

          <!-- Mobile Cards -->
          <div class="md:hidden divide-y divide-border">
            {#each rotationFlights as rf}
              {@const isCurrent = rf.id === currentFlightId}
              {@const tone = rotationStatusTone(rf.status, rf.canceled)}
              {@const delayDelta = rotationDelayDelta(rf.delayMinutes)}
              {@const depShort = airportName(rf.departureAirport)}
              {@const arrShort = airportName(rf.arrivalAirport)}
              <a
                href="/flights/{rf.id}"
                data-current={isCurrent}
                class="block px-4 py-3 transition-colors {isCurrent ? 'bg-primary/8' : 'hover:bg-muted/30'} {rf.canceled ? 'opacity-60' : ''}"
              >
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <span class="font-semibold {isCurrent ? 'text-primary' : 'text-foreground'} {rf.canceled ? 'line-through' : ''}">{rf.flightNumber}</span>
                    {#if isCurrent}
                      <span class="text-[10px] font-bold uppercase tracking-wide text-primary opacity-70">this flight</span>
                    {/if}
                  </div>
                  <div>
                    <span class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium {STATUS_PILL_CLASSES[tone]}">
                      {shortenStatus(rf.status) ?? 'Scheduled'}{#if delayDelta} · {delayDelta}{/if}
                    </span>
                  </div>
                </div>
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
