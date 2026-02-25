<script lang="ts">
  import { invalidateAll, replaceState } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { FlightBoard } from '$lib/components';
  import FlightCardSkeleton from '$lib/components/FlightCardSkeleton.svelte';
  import { airportName } from '$lib/airports';

  let { data } = $props();

  let activeTab = $state<'departures' | 'arrivals'>(
    $page.url.searchParams.get('tab') === 'arrivals' ? 'arrivals' : 'departures'
  );
  let showCompleted = $state($page.url.searchParams.get('completed') === '1');
  let searchQuery = $state('');
  let lastUpdated = $state(new Date());
  let isLoading = $state(true);

  // Sync state from URL only when the URL path/search actually changes (back/forward nav)
  let lastSeenUrl = $state($page.url.href);
  $effect(() => {
    const currentUrl = $page.url.href;
    if (currentUrl === lastSeenUrl) return;
    lastSeenUrl = currentUrl;
    const tab = $page.url.searchParams.get('tab');
    activeTab = tab === 'arrivals' ? 'arrivals' : 'departures';
    showCompleted = $page.url.searchParams.get('completed') === '1';
  });

  // Simulate loading state
  $effect(() => {
    if (data.flights.length > 0) {
      isLoading = false;
    }
  });

  function setTab(tab: 'departures' | 'arrivals') {
    activeTab = tab;
    updateUrl();
  }

  function toggleCompleted() {
    showCompleted = !showCompleted;
    updateUrl();
  }

  function updateUrl() {
    const params = new URLSearchParams();
    if (activeTab !== 'departures') params.set('tab', activeTab);
    if (showCompleted) params.set('completed', '1');
    const query = params.toString();
    replaceState(query ? `?${query}` : '/', {});
  }

  const isCompleted = (f: (typeof data.flights)[0]) => {
    const s = f.status?.toLowerCase() ?? '';
    return s === 'completed' || f.canceled === true;
  };

  const departures = $derived(
    data.flights.filter((f: (typeof data.flights)[0]) => f.departureAirport === 'GCI'),
  );
  const arrivals = $derived(
    data.flights.filter((f: (typeof data.flights)[0]) => f.arrivalAirport === 'GCI'),
  );

  const activeFlights = $derived(activeTab === 'departures' ? departures : arrivals);
  const visibleFlights = $derived.by(() => {
    let flights = activeFlights;
    if (!showCompleted) flights = flights.filter((f: (typeof data.flights)[0]) => !isCompleted(f));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      flights = flights.filter((f: (typeof data.flights)[0]) => {
        const depName = airportName(f.departureAirport).toLowerCase();
        const arrName = airportName(f.arrivalAirport).toLowerCase();
        return (
          f.flightNumber.toLowerCase().includes(q) ||
          f.departureAirport.toLowerCase().includes(q) ||
          f.arrivalAirport.toLowerCase().includes(q) ||
          depName.includes(q) ||
          arrName.includes(q) ||
          f.airlineCode?.toLowerCase().includes(q) ||
          f.status?.toLowerCase().includes(q)
        );
      });
    }
    return flights;
  });
  const completedCount = $derived(activeFlights.filter((f: (typeof data.flights)[0]) => isCompleted(f)).length);

  // Quick filters state
  let activeFilters = $state<string[]>([]);
  let recentlyViewed = $state<Array<{id: number; flightNumber: string; departureAirport: string; arrivalAirport: string; scheduledDeparture: string; viewedAt: string}>>([]);

  const now = new Date();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

  const filteredFlights = $derived.by(() => {
    let flights = visibleFlights;

    if (activeFilters.includes('next-hour')) {
      flights = flights.filter((f: (typeof data.flights)[0]) => {
        const depTime = new Date(f.scheduledDeparture);
        return depTime >= now && depTime <= oneHourFromNow;
      });
    }

    if (activeFilters.includes('delayed')) {
      flights = flights.filter((f: (typeof data.flights)[0]) =>
        f.status?.toLowerCase().includes('delayed') || (f.delayMinutes && f.delayMinutes > 0)
      );
    }

    return flights;
  });

  function toggleFilter(filter: string) {
    if (activeFilters.includes(filter)) {
      activeFilters = activeFilters.filter(f => f !== filter);
    } else {
      activeFilters = [...activeFilters, filter];
    }
  }

  function clearFilters() {
    activeFilters = [];
  }

  onMount(() => {
    // Load recently viewed from localStorage
    try {
      const stored = localStorage.getItem('recentlyViewedFlights');
      if (stored) {
        recentlyViewed = JSON.parse(stored);
      }
    } catch {
      // ignore localStorage errors
    }

    const interval = setInterval(async () => {
      await invalidateAll();
      lastUpdated = new Date();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  });
</script>

<svelte:head>
  <title>delays.gg — Live Flight Board</title>
  <meta name="description" content="Live departures and arrivals for Guernsey Airport (GCI) with real-time delay tracking and AI-powered delay predictions." />
  <link rel="canonical" href={data.siteUrl} />

  <meta property="og:title" content="delays.gg — Live Flight Board" />
  <meta property="og:description" content="Live departures and arrivals for Guernsey Airport (GCI) with real-time delay tracking and AI-powered delay predictions." />
  <meta property="og:url" content={data.siteUrl} />
  <meta property="og:type" content="website" />

  <meta name="twitter:title" content="delays.gg — Live Flight Board" />
  <meta name="twitter:description" content="Live departures and arrivals for Guernsey Airport (GCI) with real-time delay tracking and AI-powered delay predictions." />
</svelte:head>

<div class="mx-auto max-w-4xl px-4 py-4 sm:py-8">
  <!-- Compact Header -->
  <header class="mb-4 sm:mb-6">
    <div class="flex items-center justify-between gap-2">
      <div class="min-w-0">
        <h1 class="text-xl sm:text-2xl font-bold tracking-tight">delays.gg</h1>
        <p class="text-sm text-muted-foreground mt-0.5 sm:mt-1">
          Guernsey (GCI)
          {#if data.weather}
            <span class="mx-1 opacity-40">·</span>
            <span class="inline-flex items-center gap-1">
              <span>{data.weather.weatherCode !== null && data.weather.weatherCode <= 2 ? '☀️' : data.weather.weatherCode !== null && data.weather.weatherCode <= 3 ? '☁️' : data.weather.weatherCode !== null && data.weather.weatherCode <= 67 ? '🌧️' : '🌤️'}</span>
              {#if data.weather.temperature != null}
                <span class="font-medium">{Math.round(data.weather.temperature)}°C</span>
              {/if}
              {#if data.weather.windSpeed != null}
                <span class="text-muted-foreground/70 hidden sm:inline">{Math.round(data.weather.windSpeed)}mph</span>
              {/if}
            </span>
          {/if}
        </p>
      </div>
      <div class="flex items-center gap-1.5 shrink-0 text-right">
        <span class="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
        <span class="text-sm text-muted-foreground">Live</span>
        <span class="text-xs text-muted-foreground/70 ml-1 tabular-nums">
          {lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  </header>

  <!-- Recently Viewed -->
  {#if recentlyViewed.length > 0 && !searchQuery}
    <div class="mb-4">
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-sm font-medium text-muted-foreground">Recently viewed</h2>
        <button
          onclick={() => { recentlyViewed = []; localStorage.removeItem('recentlyViewedFlights'); }}
          class="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear
        </button>
      </div>
      <div class="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {#each recentlyViewed as flight}
          <a
            href="/flights/{flight.id}"
            class="flex-shrink-0 flex items-center gap-2 rounded-lg border border-border/50 bg-card/50 px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
          >
            <span class="font-semibold">{flight.flightNumber}</span>
            <span class="text-muted-foreground text-xs">
              {flight.departureAirport} → {flight.arrivalAirport}
            </span>
          </a>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Search -->
  <div class="mb-4">
    <div class="relative">
      <svg class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
      </svg>
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search flights..."
        class="w-full rounded-md border border-input bg-background pl-9 pr-9 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
      {#if searchQuery}
        <button
          onclick={() => searchQuery = ''}
          class="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label="Clear search"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
          </svg>
        </button>
      {/if}
    </div>
    {#if searchQuery}
      <p class="text-xs text-muted-foreground mt-1.5">
        {visibleFlights.length} result{visibleFlights.length !== 1 ? 's' : ''} for "{searchQuery}"
      </p>
    {/if}
  </div>

  <!-- Tabs + Filters Row -->
  <div class="flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-border pb-2 mb-4">
    <!-- Tabs -->
    <div class="flex">
      <button
        onclick={() => setTab('departures')}
        class="relative min-h-[44px] px-4 sm:px-5 py-2.5 text-sm font-medium transition-colors rounded-t-md
          {activeTab === 'departures'
            ? 'text-foreground bg-muted/50 border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground'}"
      >
        <span class="hidden sm:inline">Departures</span>
        <span class="sm:hidden">Dep</span>
        <span class="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums">
          {departures.filter((f) => !isCompleted(f)).length}
        </span>
      </button>
      <button
        onclick={() => setTab('arrivals')}
        class="relative min-h-[44px] px-4 sm:px-5 py-2.5 text-sm font-medium transition-colors rounded-t-md
          {activeTab === 'arrivals'
            ? 'text-foreground bg-muted/50 border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground'}"
      >
        <span class="hidden sm:inline">Arrivals</span>
        <span class="sm:hidden">Arr</span>
        <span class="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums">
          {arrivals.filter((f) => !isCompleted(f)).length}
        </span>
      </button>
    </div>

    <!-- Spacer -->
    <div class="flex-1"></div>

    <!-- Filters -->
    {#if !searchQuery && !isLoading}
      <div class="flex items-center gap-1.5">
        <button
          onclick={() => toggleFilter('next-hour')}
          class="min-h-[36px] px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-full border transition-colors
            {activeFilters.includes('next-hour')
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground border-border hover:border-muted-foreground'}"
        >
          <span class="hidden sm:inline">Next hour</span>
          <span class="sm:hidden">1hr</span>
        </button>
        <button
          onclick={() => toggleFilter('delayed')}
          class="min-h-[36px] px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-full border transition-colors
            {activeFilters.includes('delayed')
              ? 'bg-amber-500 text-white border-amber-500'
              : 'bg-background text-muted-foreground border-border hover:border-muted-foreground'}"
        >
          Delayed
        </button>
        <button
          onclick={toggleCompleted}
          disabled={completedCount === 0}
          class="min-h-[36px] px-2.5 py-1.5 flex items-center gap-1.5 rounded-full border transition-colors text-xs font-medium
            {showCompleted
              ? 'bg-muted text-foreground border-muted-foreground/50'
              : completedCount > 0
                ? 'text-muted-foreground hover:text-foreground hover:bg-muted/60 border-border'
                : 'text-muted-foreground/30 cursor-not-allowed border-border'}"
          aria-label="{showCompleted ? 'Hide completed flights' : 'Show completed flights'} ({completedCount})"
          title="{showCompleted ? 'Hide' : 'Show'} {completedCount} completed"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            {#if showCompleted}
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
            {:else}
              <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>
            {/if}
          </svg>
          <span class="hidden sm:inline">{showCompleted ? 'Hide' : 'Show'} done</span>
        </button>
        {#if activeFilters.length > 0}
          <button
            onclick={clearFilters}
            class="min-h-[36px] px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Board -->
  {#if isLoading}
    <div class="space-y-3">
      <FlightCardSkeleton count={6} />
    </div>
  {:else}
    <FlightBoard flights={filteredFlights} weatherMap={data.weatherMap} returnTab={activeTab} />
  {/if}
</div>
