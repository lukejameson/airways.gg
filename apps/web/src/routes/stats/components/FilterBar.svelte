<script lang="ts">
	import { fade } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		panelOpen,
		customModeOpen,
		customDateFrom,
		customDateTo,
		routeSearch,
		AIRLINE_OPTIONS,
		DIRECTION_OPTIONS,
		SEASON_OPTIONS,
		THRESHOLD_OPTIONS,
		MONTH_LABELS,
		DOW_LABELS,
		navigateWithFilter,
		currentRange,
		activeRoutes,
		countActiveFilters
	} from '../lib/stores';
	import { slide } from 'svelte/transition';

	interface Props {
		availableYears: number[];
		availableRoutes: Array<{ departure: string; arrival: string; key: string }>;
		onClearFilters: () => void;
		onRouteToggle: (key: string) => void;
		fmtRoute: (dep: string, arr: string) => string;
	}

	let {
		availableYears,
		availableRoutes,
		onClearFilters,
		onRouteToggle,
		fmtRoute
	}: Props = $props();

	// Current filter values from URL
	const currentRangeValue = $derived($currentRange);
	const activeRoutesValue = $derived($activeRoutes);
	const params = $derived(page.url.searchParams);
	const filterCount = $derived(countActiveFilters({
		airline: params.get('airline') || undefined,
		direction: (params.get('direction') as 'dep' | 'arr' | '') || undefined,
		dow: params.get('dow') ? parseInt(params.get('dow')!, 10) : undefined,
		season: (params.get('season') as 'spring' | 'summer' | 'autumn' | 'winter' | '') || undefined,
		month: params.get('month') ? parseInt(params.get('month')!, 10) : undefined,
		year: params.get('year') ? parseInt(params.get('year')!, 10) : undefined,
		threshold: params.get('threshold') ? parseInt(params.get('threshold')!, 10) : 15,
		range: { type: (currentRangeValue as '30' | '90' | 'custom' | 'all') },
		minFlightsPerRoute: 5
	}));
	const hasActiveFilters = $derived(filterCount > 0);
	const filterAirline = $derived(params.get('airline'));
	const filterDirection = $derived(params.get('direction'));
	const filterThreshold = $derived(params.get('threshold') ? parseInt(params.get('threshold')!, 10) : 15);
	const filterYear = $derived(params.get('year'));
	const filterSeason = $derived(params.get('season'));
	const filterMonth = $derived(params.get('month'));
	const filterDow = $derived(params.get('dow'));

	// Route options
	const topRouteOptions = $derived(availableRoutes.slice(0, 10));
	const otherRoutes = $derived.by(() => {
		const others = availableRoutes.slice(10);
		if (!$routeSearch) return others;
		const searchUpper = $routeSearch.toUpperCase();
		return others.filter((r) => {
			const codes = `${r.departure}${r.arrival}`.toUpperCase();
			const names = `${fmtRoute(r.departure, r.arrival)}`.toUpperCase();
			return codes.includes(searchUpper) || names.includes(searchUpper);
		});
	});
	const selectedOtherRoutes = $derived(
		activeRoutesValue.filter((key) => !topRouteOptions.some((r) => r.key === key))
	);

	// Date range handlers
	function handleRangeSelect(val: string) {
		goto(`/stats?range=${val}`, { noScroll: true });
	}

	function handleCustomDateChange() {
		if ($customDateFrom && $customDateTo) {
			navigateWithFilter({
				range: 'custom',
				dateFrom: $customDateFrom,
				dateTo: $customDateTo
			});
		}
	}

	function handleCustomBack() {
		customModeOpen.set(false);
		customDateFrom.set('');
		customDateTo.set('');
		navigateWithFilter({ range: '30', dateFrom: null, dateTo: null });
	}

	// Filter panel toggle
	function togglePanel() {
		panelOpen.update((v) => !v);
	}

	// Clear all filters
	function clearAll() {
		onClearFilters();
	}

	// Route selection
	let routeInputElement: HTMLInputElement | undefined = $state();

	function selectRoute(key: string) {
		onRouteToggle(key);
		routeSearch.set('');
		if (routeInputElement) routeInputElement.blur();
	}
</script>

<div class="flex flex-col relative">
	<div class="flex items-center gap-2 w-full sm:w-auto">
		<!-- Range buttons / Custom date inputs toggle container -->
		<div class="relative h-[44px] flex-1 sm:w-[320px] sm:flex-none rounded-lg border bg-muted/40 overflow-hidden">
			{#if !$customModeOpen}
				<div
					class="absolute inset-0 flex items-center gap-1 p-1"
					in:fade={{ duration: 150, delay: 75 }}
					out:fade={{ duration: 150 }}
				>
					{#each [['all', 'All'], ['90', '90 Days'], ['30', '30 Days']] as [val, label]}
						<button
							onclick={() => handleRangeSelect(val)}
							class="flex-1 px-2 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap h-[36px] flex items-center justify-center {currentRangeValue === val && !$customModeOpen ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
						>{label}</button>
					{/each}
					<button
						onclick={() => customModeOpen.set(true)}
						class="flex-1 px-2 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap h-[36px] flex items-center justify-center {$currentRange === 'custom' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
					>Custom</button>
				</div>
			{:else}
				<div
					class="absolute inset-0 flex items-center gap-2 p-1.5"
					in:fade={{ duration: 150, delay: 75 }}
					out:fade={{ duration: 150 }}
				>
					<input
						type="date"
						bind:value={$customDateFrom}
						onchange={handleCustomDateChange}
						class="flex-1 min-w-0 h-[36px] px-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
					/>
					<span class="text-sm text-muted-foreground shrink-0">–</span>
					<input
						type="date"
						bind:value={$customDateTo}
						onchange={handleCustomDateChange}
						class="flex-1 min-w-0 h-[36px] px-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
					/>
					<button
						onclick={handleCustomBack}
						class="shrink-0 h-[36px] w-[36px] flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
						title="Back to range selection"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
					</button>
				</div>
			{/if}
		</div>

		<!-- Filters button -->
		<div class="relative h-[44px] w-[44px] sm:w-[90px] rounded-lg border bg-muted/40 overflow-hidden shrink-0">
			<div class="absolute inset-0 flex items-center p-1">
				<button
					onclick={togglePanel}
					class="w-full h-[36px] flex items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors {$panelOpen || hasActiveFilters ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
					<span class="hidden sm:inline">Filters</span>
				</button>
			</div>
		</div>
	</div>

	<!-- Collapsible filter panel - positioned absolutely to not affect layout -->
	{#if $panelOpen}
		<div transition:slide={{ duration: 180 }} class="absolute top-full right-0 mt-2 w-[calc(100vw-2rem)] sm:w-[600px] lg:w-[800px] max-w-full rounded-xl border bg-card p-4 mb-5 space-y-4 z-50 shadow-lg">
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
			<div>
				<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Airline</p>
				<div class="flex flex-wrap gap-1.5">
					{#each AIRLINE_OPTIONS as [val, label]}
						<button
							onclick={() => navigateWithFilter({ airline: val || null })}
							class="px-4 py-2 sm:px-2.5 sm:py-1 rounded-full border text-xs font-medium transition-colors {(val === '' ? filterAirline === null : filterAirline === val) ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/30'}"
						>{label}</button>
					{/each}
				</div>
			</div>
			<div>
				<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Direction</p>
				<div class="flex flex-wrap gap-1.5">
					{#each DIRECTION_OPTIONS as [val, label]}
						<button
							onclick={() => navigateWithFilter({ direction: val || null })}
							class="px-4 py-2 sm:px-2.5 sm:py-1 rounded-full border text-xs font-medium transition-colors {(val === '' ? filterDirection === null : filterDirection === val) ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/30'}"
						>{label}</button>
					{/each}
				</div>
			</div>
			<div>
				<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Delay threshold (on-time)</p>
				<div class="flex flex-wrap gap-1.5">
					{#each THRESHOLD_OPTIONS as [val, label]}
						<button
							onclick={() => navigateWithFilter({ threshold: val === 15 ? null : String(val) })}
							class="px-4 py-2 sm:px-2.5 sm:py-1 rounded-full border text-xs font-medium transition-colors {filterThreshold === val ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/30'}"
						>{label}</button>
					{/each}
				</div>
			</div>
		</div>
		<div>
			<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Route</p>
			<div class="flex flex-wrap gap-1.5 items-center">
				<!-- Selected non-top-10 routes -->
				{#each selectedOtherRoutes as key}
					{@const route = availableRoutes.find((r) => r.key === key)}
					{#if route}
						<button
							onclick={() => onRouteToggle(key)}
							class="px-4 py-2 sm:px-2.5 sm:py-1 rounded-full border text-xs font-medium transition-colors bg-primary text-primary-foreground border-primary"
						>{fmtRoute(route.departure, route.arrival)} ✕</button>
					{/if}
				{/each}
				<!-- Clear all routes button -->
				{#if $activeRoutes.length > 0}
					<button
						onclick={() => navigateWithFilter({ route: [] })}
						class="px-4 py-2 sm:px-2.5 sm:py-1 rounded-full border text-xs font-medium transition-colors bg-muted text-muted-foreground border-border hover:text-foreground"
					>Clear all</button>
				{/if}
				<!-- Top 10 route options -->
				{#each topRouteOptions as route}
					<button
						onclick={() => onRouteToggle(route.key)}
						class="px-4 py-2 sm:px-2.5 sm:py-1 rounded-full border text-xs font-medium transition-colors {$activeRoutes.includes(route.key) ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/30'}"
					>{fmtRoute(route.departure, route.arrival)}</button>
				{/each}
				{#if availableRoutes.length > 10}
					<div class="relative">
						<input
							type="text"
							placeholder="Search other routes..."
							bind:value={$routeSearch}
							bind:this={routeInputElement}
							onblur={() => {
								setTimeout(() => {
									routeSearch.set('');
								}, 200);
							}}
							class="px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-full border border-border bg-background text-xs placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
						/>
						{#if $routeSearch}
							<div class="absolute top-full mt-1 left-0 right-0 max-h-48 overflow-y-auto bg-background border border-border rounded-lg shadow-lg z-50 pointer-events-auto">
								{#if otherRoutes.length > 0}
									{#each otherRoutes as route}
										<button
											type="button"
											onmousedown={(e) => {
												e.preventDefault();
												e.stopPropagation();
												selectRoute(route.key);
											}}
											class="w-full px-4 py-2 text-left text-xs hover:bg-muted transition-colors {$activeRoutes.includes(route.key) ? 'bg-muted text-primary font-medium' : ''}"
										>
											{fmtRoute(route.departure, route.arrival)}
											{#if $activeRoutes.includes(route.key)}<span class="ml-1">✓</span>{/if}
										</button>
									{/each}
								{:else}
									<div class="px-4 py-2 text-xs text-muted-foreground">No routes found</div>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Year</p>
				<div class="flex flex-wrap gap-1.5">
					<button
						onclick={() => navigateWithFilter({ year: null })}
						class="px-4 py-2 sm:px-2.5 sm:py-1 rounded-full border text-xs font-medium transition-colors {filterYear === null ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/30'}"
					>All</button>
					{#each availableYears as year}
						<button
							onclick={() => navigateWithFilter({ year: filterYear === String(year) ? null : String(year) })}
							class="px-4 py-2 sm:px-2.5 sm:py-1 rounded-full border text-xs font-medium transition-colors {filterYear === String(year) ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/30'}"
						>{year}</button>
					{/each}
				</div>
			</div>
			<div>
				<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Season</p>
				<div class="flex flex-wrap gap-1.5">
					{#each SEASON_OPTIONS as [val, label]}
						<button
							onclick={() => navigateWithFilter({ season: val || null, month: null, range: val ? 'all' : null })}
							class="px-4 py-2 sm:px-2.5 sm:py-1 rounded-full border text-xs font-medium transition-colors {(val === '' ? filterSeason === null && filterMonth === null : filterSeason === val && filterMonth === null) ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/30'}"
						>{label}</button>
					{/each}
				</div>
			</div>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Month</p>
				<div class="flex flex-wrap gap-1.5">
					{#each MONTH_LABELS as label, i}
						{@const m = String(i + 1)}
						<button
							onclick={() => navigateWithFilter({ month: filterMonth === m ? null : m, season: null, range: filterMonth === m ? null : 'all' })}
							class="px-4 py-2 sm:px-2.5 sm:py-1 rounded-full border text-xs font-medium transition-colors {filterMonth === m ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/30'}"
						>{label}</button>
					{/each}
				</div>
			</div>
			<div>
				<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Day of week</p>
				<div class="flex flex-wrap gap-1.5">
					<button
						onclick={() => navigateWithFilter({ dow: null })}
						class="px-4 py-2 sm:px-2.5 sm:py-1 rounded-full border text-xs font-medium transition-colors {filterDow === null ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/30'}"
					>All</button>
					{#each DOW_LABELS as label, i}
						<button
							onclick={() => navigateWithFilter({ dow: filterDow === String(i) ? null : String(i) })}
							class="px-4 py-2 sm:px-2.5 sm:py-1 rounded-full border text-xs font-medium transition-colors {filterDow === String(i) ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/30'}"
						>{label}</button>
					{/each}
				</div>
			</div>
		</div>
		{#if hasActiveFilters}
			<div class="pt-1 border-t flex justify-end">
				<button onclick={clearAll} class="text-xs text-muted-foreground hover:text-foreground">Clear all filters ×</button>
			</div>
		{/if}
	</div>
{/if}
</div>
