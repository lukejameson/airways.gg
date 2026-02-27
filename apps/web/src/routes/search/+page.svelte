<script lang="ts">
  import { goto } from '$app/navigation';
  import { FlightBoard } from '$lib/components';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let queryInput = $state(data.query ?? '');
  let dateInput = $state(data.date ?? '');

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (queryInput) params.set('q', queryInput);
    if (dateInput) params.set('date', dateInput);
    goto(`/search?${params.toString()}`);
  }

  function clearSearch() {
    queryInput = '';
    dateInput = '';
    goto('/search');
  }

  const hasSearch = $derived(!!data.query || !!data.date);
  const resultLabel = $derived(
    data.results.length === 1 ? '1 flight found' : `${data.results.length} flights found`,
  );
</script>

<svelte:head>
  <title>{hasSearch ? `"${data.query || data.date}" — Search · airways.gg` : 'Search Flights — airways.gg'}</title>
  <meta name="description" content="Search Guernsey Airport flights by flight number, airline, or airport code. Find live status and delay predictions for any Aurigny or connecting flight." />
  <link rel="canonical" href="{data.siteUrl}/search" />
  <!-- Don't index search result pages — only the bare /search UI -->
  {#if hasSearch}
    <meta name="robots" content="noindex, follow" />
  {/if}

  <meta property="og:title" content="Search Flights — airways.gg" />
  <meta property="og:description" content="Search Guernsey Airport flights by flight number, airline, or airport code." />
  <meta property="og:url" content="{data.siteUrl}/search" />

  <meta name="twitter:title" content="Search Flights — airways.gg" />
  <meta name="twitter:description" content="Search Guernsey Airport flights by flight number, airline, or airport code." />
</svelte:head>

<div class="container py-6 max-w-3xl">
  <div class="mb-8">
    <h1 class="text-3xl font-bold tracking-tight mb-1">Search Flights</h1>
    <p class="text-muted-foreground">Search by flight number, airline code, or airport (e.g. GCI, LGW, GR100)</p>
  </div>

  <form onsubmit={handleSubmit} class="mb-8">
    <div class="flex flex-col sm:flex-row gap-3">
      <div class="flex-1 relative">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
        </svg>
        <input
          type="text"
          name="q"
          bind:value={queryInput}
          placeholder="Flight number, airline, or airport…"
          class="w-full rounded-md border border-input bg-background pl-9 pr-4 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>

      <input
        type="date"
        name="date"
        bind:value={dateInput}
        class="rounded-md border border-input bg-background px-3 py-2.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />

      <button
        type="submit"
        class="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Search
      </button>
    </div>
  </form>

  {#if hasSearch}
    <div class="flex items-center justify-between mb-4">
      <p class="text-sm text-muted-foreground">
        {#if data.query}Showing results for <strong class="text-foreground">"{data.query}"</strong>{/if}
        {#if data.query && data.date} on {/if}
        {#if data.date}<strong class="text-foreground">{data.date}</strong>{/if}
        {#if data.results.length > 0} — {resultLabel}{/if}
      </p>
      <button
        type="button"
        onclick={clearSearch}
        class="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
      >
        Clear
      </button>
    </div>

    {#if data.results.length === 0}
      <div class="flex flex-col items-center justify-center py-16 text-center">
        <div class="mb-4 text-5xl opacity-30">✈</div>
        <h3 class="text-lg font-semibold mb-1">No flights found</h3>
        <p class="text-sm text-muted-foreground">Try a different flight number, airline code, or date.</p>
      </div>
    {:else}
      <FlightBoard flights={data.results} />
    {/if}
  {:else}
    <div class="flex flex-col items-center justify-center py-16 text-center">
      <div class="mb-4 text-5xl opacity-20">✈</div>
      <p class="text-sm text-muted-foreground">Enter a flight number, airline, or airport code above to search.</p>
    </div>
  {/if}
</div>
