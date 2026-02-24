<script lang="ts">
  import FlightCard from './FlightCard.svelte';

  interface Props {
    flights: any[];
    weatherMap?: Record<string, any>;
    returnTab?: string;
  }

  let { flights, weatherMap = {}, returnTab }: Props = $props();
</script>

{#if flights.length === 0}
  <div class="flex flex-col items-center justify-center py-20 text-center">
    <svg class="mb-4 h-12 w-12 text-muted-foreground/20" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
    </svg>
    <p class="text-sm font-medium text-muted-foreground">No flights to show</p>
    <p class="text-xs text-muted-foreground/60 mt-1">Check back later for updated flight information.</p>
  </div>
{:else}
  <div class="flex flex-col gap-1.5">
    {#each flights as flight (flight.id)}
      <FlightCard {flight} {weatherMap} {returnTab} />
    {/each}
  </div>
  <p class="mt-3 text-center text-xs text-muted-foreground/60">
    {flights.length} flight{flights.length === 1 ? '' : 's'}
  </p>
{/if}
