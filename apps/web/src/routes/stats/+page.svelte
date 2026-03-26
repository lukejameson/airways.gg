<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { navigating } from '$app/state';
	import { formatDate } from '$lib/time';
	import type { PageData } from './$types';
	import {
		activeRoutes,
		navigateWithFilter,
		buildFilterUrl,
		routeSort,
		flightSort,
		toggleSort,
		sortIcon,
		getFilterState
	} from './lib/stores';
	import {
		calculateDistTotal,
		calculateImpactStats,
		analyzeDayOfWeek,
		sortRoutes,
		sortFlights,
		n,
		fmtBig,
		fmtMoney,
		cellBg,
		toneClasses,
		delayColor,
		reliabilityBadge,
		degToCardinal,
		xwBandColor,
		thBtn,
		tdBase,
		WX_LABELS,
		routeKey as makeRouteKey,
		hasData
	} from './lib/transforms';
	import type { SortState } from './lib/stores';

	// Component imports
	import HeroStats from './components/HeroStats.svelte';
	import FilterBar from './components/FilterBar.svelte';
	import TrendChart from './components/TrendChart.svelte';
	import DayOfWeekChart from './components/DayOfWeekChart.svelte';
	import HourChart from './components/HourChart.svelte';
	import DelayDistributionChart from './components/DelayDistributionChart.svelte';

	let { data }: { data: PageData } = $props();

	// Loading state
	const isLoading = $derived(!!navigating && navigating.to?.url.pathname === '/stats');
	const sk = 'animate-pulse rounded bg-muted';

	// Route formatter using data.airports
	const FREETEXT_NAMES: Record<string, string> = {
		GRANCANAR: 'Gran Canaria',
		GRENOBLE: 'Grenoble',
		MALAGA: 'Málaga',
		BELGIUM: 'Belgium',
		'SPAIN(CAN': 'Spain (Canaries)',
		LONDONSTA: 'London Stansted',
		NEWCASTLE: 'Newcastle'
	};

	function airportName(code: string): string {
		if (FREETEXT_NAMES[code]) return FREETEXT_NAMES[code];
		const rec = (data.airports as Record<string, { name: string } | undefined>)[code];
		if (rec?.name) return rec.name.replace(/\s+(International\s+)?Airport$/i, '').trim();
		return code;
	}

	function fmtRoute(dep: string, arr: string): string {
		return `${airportName(dep)} → ${airportName(arr)}`;
	}

	// Hero stats
	const hero = $derived(data.heroStats);
	const dist = $derived(data.delayDistribution);

	const totalFlights = $derived(n(hero.total_flights));
	const cancelPct = $derived(totalFlights ? ((n(hero.total_cancelled) / totalFlights) * 100).toFixed(1) : '0');
	const onTimePct = $derived((() => {
		const withOutcome = n(hero.with_outcome);
		return withOutcome ? ((n(hero.on_time) / withOutcome) * 100).toFixed(1) : '0';
	})());
	const avgDelay = $derived(n(hero.avg_delay_mins));

	// Best/worst day calculations for At a Glance
	const _dayAnalysis = $derived(analyzeDayOfWeek(data.dayOfWeek ?? []));
	const bestDay = $derived(_dayAnalysis.best);
	const worstDay = $derived(_dayAnalysis.worst);

	// At a Glance insights (excluding duplicates from HeroStats)
	const insights = $derived.by(() => {
		const list: Array<{
			label: string;
			value: string;
			sub: string;
			tone: 'green' | 'amber' | 'red' | 'neutral';
		}> = [];

		// Guard against undefined data or stores not ready
		if (!data || !filterRoutes) return list;

		// Only show best/worst day cards when not filtering by day of week
		if (bestDay && !filterDow) {
			list.push({
				label: 'Best day to fly',
				value: String(bestDay.day_name).trim(),
				sub: `${bestDay.avg_delay ?? '—'}m avg delay · ${bestDay.cancelled} cancellations`,
				tone: 'green',
			});
		}

		if (worstDay && !filterDow) {
			list.push({
				label: 'Most disrupted day',
				value: String(worstDay.day_name).trim(),
				sub: `${worstDay.avg_delay ?? '—'}m avg delay · ${worstDay.cancelled} cancellations`,
				tone: 'red',
			});
		}

		// Only show "Most delayed route" when not filtering to specific route(s)
		const worstRoutes = data.worstRoutes;
		if (worstRoutes?.length && filterRoutes?.length === 0) {
			const topRoute = worstRoutes.find((r) => n(r.flights) >= 10 && n(r.avg_delay) > 0);
			if (topRoute) {
				list.push({
					label: 'Most delayed route',
					value: fmtRoute(String(topRoute.departure_airport), String(topRoute.arrival_airport)),
					sub: `${topRoute.avg_delay ?? '—'}m avg · ${topRoute.delay_pct ?? '—'}% delay rate`,
					tone: 'amber',
				});
			}
		}

		const visibilityDelays = data.visibilityDelays;
		if (visibilityDelays?.length) {
			const fogRow = visibilityDelays.find((r) => String(r.vis_band).startsWith('<1'));
			if (fogRow && n(fogRow.flights) > 0) {
				const delayPct = fogRow.delay_pct != null ? `${fogRow.delay_pct}% delayed` : 'No delay data';
				list.push({
					label: 'Fog impact',
					value: delayPct,
					sub: `${fogRow.flights} flights in fog · ${fogRow.cancelled} cancelled`,
					tone: 'red',
				});
			}
		}

		const windDelays = data.windDelays;
		if (windDelays?.length) {
			const worstWind = [...windDelays].sort((a, b) => n(b.avg_delay) - n(a.avg_delay))[0];
			if (worstWind && n(worstWind.avg_delay) > 0) {
				list.push({
					label: 'Wind impact',
					value: `${worstWind.avg_delay}m`,
					sub: `Avg delay in ${worstWind.wind_band} winds`,
					tone: 'amber',
				});
			}
		}

		return list;
	});

	// Data availability checks
	const hasResults = $derived(totalFlights > 0);
	const hasRoutes = $derived(hasData(data.worstRoutes));
	const hasFlights = $derived(hasData(data.flightNumbers));
	const hasDailyOtp = $derived(hasData(data.dailyOtp));
	const hasDayOfWeek = $derived(hasData(data.dayOfWeek));
	const hasDepartureHour = $derived(hasData(data.departureHour));
	const hasDelayDistribution = $derived(calculateDistTotal(dist) > 0);
	const hasBusiestDays = $derived(hasData(data.busiestDays));
	const hasWorstDays = $derived(hasData(data.worstDays));
	const hasTopDelays = $derived(hasData(data.topDelays));
	const hasMonthlyBreakdown = $derived(hasData(data.monthlyBreakdown));
	const hasAircraftUsage = $derived(hasData(data.aircraftUsage));
	const hasWeatherData = $derived(hasData(data.windDelays));
	const hasWorstWeatherDays = $derived(hasData(data.worstWeatherDays));
	const hasWorstDelayDays = $derived(hasData(data.worstDelayDays));

	// Impact stats
	const impact = $derived(calculateImpactStats(data.delayImpact));

	// Sorting
	const sortedRoutes = $derived(sortRoutes(data.worstRoutes, $routeSort));
	const sortedFlights = $derived(sortFlights(data.flightNumbers, $flightSort));

	// Filter handlers
	function setRouteFilter(key: string) {
		const current = $activeRoutes;
		const isSelected = current.includes(key);
		const newRoutes = isSelected ? current.filter((r) => r !== key) : [...current, key];
		navigateWithFilter({ route: newRoutes });
	}

	function clearAllFilters() {
		navigateWithFilter({
			route: [],
			airline: null,
			direction: null,
			dow: null,
			season: null,
			month: null,
			year: null,
			threshold: null,
			dateFrom: null,
			dateTo: null
		});
	}

	function nav(href: string) {
		goto(href);
	}

	// Disclaimer state
	const DISCLAIMER_KEY = 'stats_disclaimer_seen';
	let showDisclaimer = $state(false);

	$effect(() => {
		if (!browser) return;
		if (!localStorage.getItem(DISCLAIMER_KEY)) {
			showDisclaimer = true;
		}
	});

	function dismissDisclaimer() {
		localStorage.setItem(DISCLAIMER_KEY, '1');
		showDisclaimer = false;
	}

	// Empty state snippet
	function emptyState(title: string, description: string) {
		return `
			<div class="flex flex-col items-center justify-center py-12 sm:py-16 text-center px-4">
				<div class="text-muted-foreground/50 mb-4">
					<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
				</div>
				<h3 class="text-lg font-semibold text-foreground mb-2">${title}</h3>
				<p class="text-sm text-muted-foreground mb-4 max-w-sm">${description}</p>
			</div>
		`;
	}

	// Filter config for UI state
	const filterConfig = $derived(getFilterState());
	const filterDow = $derived(filterConfig.dow);
	const filterRoutes = $activeRoutes;
</script>

<svelte:head>
	<title>Guernsey Airport Flight Statistics — Delays, Cancellations & Routes | airways.gg</title>
	<meta name="description" content="Guernsey Airport (GCI) flight statistics: on-time performance, delay rates, cancellations by route, weather impact, and monthly breakdowns for Aurigny and Blue Islands." />
	<link rel="canonical" href="{data.siteUrl}/stats" />
	<meta name="robots" content="index, follow" />
	<meta property="og:title" content="Guernsey Airport Flight Statistics | airways.gg" />
	<meta property="og:description" content="On-time rates, delay stats, cancellation data, and weather impact for Guernsey Airport (GCI) flights." />
	<meta property="og:url" content="{data.siteUrl}/stats" />
	<meta name="twitter:title" content="Guernsey Airport Flight Statistics | airways.gg" />
	<meta name="twitter:description" content="On-time rates, delay stats, cancellation data, and weather impact for Guernsey Airport (GCI) flights." />
</svelte:head>

{#if showDisclaimer}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
		<div class="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl">
			<h2 id="disclaimer-title" class="mb-1 text-base font-semibold text-foreground">Before you explore</h2>
			<p class="mb-4 text-sm text-muted-foreground">Please take a moment to read the following.</p>
			<ul class="mb-6 space-y-3 text-sm text-foreground">
				<li class="flex gap-2">
					<span class="mt-0.5 shrink-0 text-muted-foreground">1.</span>
					<span>This data is not 100% accurate. Records may be incomplete and outliers exist — treat all figures as indicative, not definitive.</span>
				</li>
				<li class="flex gap-2">
					<span class="mt-0.5 shrink-0 text-muted-foreground">2.</span>
					<span>This is not a witch hunt and is not intended to discredit the hard work carried out at the airport. It is purely a data analysis exercise.</span>
				</li>
			</ul>
			<button
				onclick={dismissDisclaimer}
				class="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
			>
				I understand
			</button>
		</div>
	</div>
{/if}

<div class="container max-w-5xl px-4 py-6 sm:py-8">
	<!-- Header -->
	<div class="flex flex-col gap-4 mb-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl sm:text-3xl font-bold tracking-tight">Flight Statistics</h1>
			<p class="text-sm text-muted-foreground mt-1">
				Guernsey Airport (GCI)
				{#if hero.earliest_date && hero.latest_date}· {formatDate(hero.earliest_date)} – {formatDate(hero.latest_date)}{/if}
				· {totalFlights.toLocaleString()} flights
			</p>
		</div>

		<FilterBar
			availableYears={data.availableYears}
			availableRoutes={data.availableRoutes}
			onClearFilters={clearAllFilters}
			onRouteToggle={setRouteFilter}
			{fmtRoute}
		/>
	</div>

	<!-- Hero Stats -->
	<HeroStats
		data={hero}
		{isLoading}
		daysTracked={data.dailyOtp.length}
		skeletonClass={sk}
	/>

	<!-- At a Glance -->
	{#if hasResults && insights.length > 0}
		<div class="mb-6">
			<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">At a Glance</h2>
			{#if isLoading}
				<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
					{#each [1, 2, 3, 4, 5] as _}
						<div class="rounded-xl border bg-card p-3.5">
							<div class="{sk} h-3 w-20 mb-2"></div>
							<div class="{sk} h-6 w-14 mb-2"></div>
							<div class="{sk} h-3 w-28"></div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
					{#each insights as insight}
						{@const cls = toneClasses[insight.tone]}
						<div class="rounded-xl border p-3.5 {cls.card}">
							<p class="text-xs font-medium {cls.label} mb-1.5 leading-tight">{insight.label}</p>
							<p class="text-lg sm:text-xl font-bold tabular-nums leading-tight {cls.value}">{insight.value}</p>
							<p class="text-xs {cls.label} mt-1 leading-snug opacity-80">{insight.sub}</p>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Daily OTP Trend -->
	<div class="rounded-xl border bg-card p-4 mb-4">
		<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Daily OTP Trend</h2>
		{#if isLoading}
			<div class="{sk} h-48 sm:h-56 w-full rounded-lg"></div>
		{:else if !hasDailyOtp}
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<p class="text-muted-foreground">No trend data available</p>
			</div>
		{:else}
			<TrendChart data={data.dailyOtp} />
		{/if}
	</div>

	<!-- Charts Grid -->
	<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
		<div class="rounded-xl border bg-card p-4">
			<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Day of Week</h2>
			{#if isLoading}
				<div class="{sk} h-48 w-full rounded-lg"></div>
			{:else if !hasDayOfWeek}
				<div class="flex flex-col items-center justify-center py-12 text-center">
					<p class="text-muted-foreground">No day data available</p>
				</div>
			{:else}
				<DayOfWeekChart data={data.dayOfWeek} />
			{/if}
		</div>
		<div class="rounded-xl border bg-card p-4">
			<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Delay by Departure Hour</h2>
			{#if isLoading}
				<div class="{sk} h-48 w-full rounded-lg"></div>
			{:else if !hasDepartureHour}
				<div class="flex flex-col items-center justify-center py-12 text-center">
					<p class="text-muted-foreground">No hour data available</p>
				</div>
			{:else}
				<HourChart data={data.departureHour} />
			{/if}
		</div>
	</div>

	<!-- Delay Distribution -->
	<div class="rounded-xl border bg-card p-4 mb-6">
		<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Delay Distribution</h2>
		{#if isLoading}
			<div class="{sk} h-32 w-full rounded-lg"></div>
		{:else if !hasDelayDistribution}
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<p class="text-muted-foreground">No delay data available</p>
			</div>
		{:else}
			<DelayDistributionChart data={dist} />
		{/if}
	</div>

	<!-- Delay Impact -->
	<div class="rounded-xl border bg-card mb-6 overflow-hidden">
		<div class="px-4 pt-4 pb-3 border-b">
			<h2 class="text-sm font-semibold text-foreground">Cumulative Delay Impact</h2>
			<p class="text-xs text-muted-foreground mt-0.5">Based on exact recorded delay minutes for flights delayed &gt;5 min · 15 pax (Alderney routes) · 50 pax (all other routes)</p>
		</div>
		{#if isLoading}
			<div class="grid grid-cols-2 sm:grid-cols-4 p-4 gap-4">
				{#each [1, 2, 3, 4] as _}
					<div class="{sk} h-20 w-full rounded-lg"></div>
				{/each}
			</div>
		{:else}
			<div class="grid grid-cols-2 sm:grid-cols-4">
				<div class="p-3 sm:p-4 border-r border-b sm:border-b-0">
					<p class="text-xs font-medium text-muted-foreground mb-1">Total delay time</p>
					<p class="text-xl sm:text-2xl font-bold tabular-nums text-red-600">{impact.impactHours.toLocaleString()}<span class="text-sm sm:text-base font-semibold ml-0.5">h</span></p>
					<p class="text-xs text-muted-foreground mt-1">{impact.impactDays} days</p>
				</div>
				<div class="p-3 sm:p-4 border-b sm:border-b-0 sm:border-r">
					<p class="text-xs font-medium text-muted-foreground mb-1">Flights delayed &gt;5 min</p>
					<p class="text-xl sm:text-2xl font-bold tabular-nums">{fmtBig(n(data.delayImpact.flights_delayed_gt5))}</p>
					<p class="text-xs text-muted-foreground mt-1">of {fmtBig(n(data.delayImpact.operated))} operated</p>
				</div>
				<div class="p-3 sm:p-4 border-r">
					<p class="text-xs font-medium text-muted-foreground mb-1">Est. pax-hours lost</p>
					<p class="text-xl sm:text-2xl font-bold tabular-nums text-amber-600">{fmtBig(impact.paxHours)}</p>
					<p class="text-xs text-muted-foreground mt-1">15 pax (ACI) / 50 pax (other)</p>
				</div>
				<div class="p-3 sm:p-4">
					<p class="text-xs font-medium text-muted-foreground mb-1">Est. economic cost</p>
					<p class="text-xl sm:text-2xl font-bold tabular-nums">{fmtMoney(impact.costLow)}<span class="text-sm font-normal text-muted-foreground">–</span>{fmtMoney(impact.costHigh)}</p>
					<p class="text-xs text-muted-foreground mt-1">£11.50–£25/hr</p>
				</div>
			</div>
		{/if}
	</div>

	<!-- Routes -->
	<div class="rounded-xl border bg-card mb-4 overflow-hidden">
		<div class="flex items-center justify-between px-4 pt-4 pb-2">
			<h2 class="text-sm font-semibold text-foreground">Routes</h2>
			<span class="text-xs text-muted-foreground hidden sm:block">Click row to filter · ↗ to browse</span>
		</div>
		{#if isLoading}
			<div class="p-4">
				<div class="{sk} h-64 w-full rounded-lg"></div>
			</div>
		{:else if !hasRoutes}
			<div class="px-4 py-8 text-center">
				<p class="text-muted-foreground">No route data available</p>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="border-y bg-muted/30">
						<tr>
							<th class="{thBtn} pl-4">Route</th>
							<th class="{thBtn}" onclick={() => routeSort.update(s => toggleSort(s, 'flights'))}>Flights {sortIcon($routeSort, 'flights')}</th>
							<th class="{thBtn}" onclick={() => routeSort.update(s => toggleSort(s, 'delay_pct'))}>Delay% {sortIcon($routeSort, 'delay_pct')}</th>
							<th class="{thBtn}" onclick={() => routeSort.update(s => toggleSort(s, 'avg_delay'))}>Avg Delay {sortIcon($routeSort, 'avg_delay')}</th>
							<th class="{thBtn}" onclick={() => routeSort.update(s => toggleSort(s, 'cancelled'))}>Cancelled {sortIcon($routeSort, 'cancelled')}</th>
							<th class="{thBtn} pr-4" onclick={() => routeSort.update(s => toggleSort(s, 'reliability_score'))}>Score {sortIcon($routeSort, 'reliability_score')}</th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each sortedRoutes as row}
							{@const key = makeRouteKey(row.departure_airport, row.arrival_airport)}
							<tr
								onclick={() => setRouteFilter(key)}
								class="transition-colors cursor-pointer {$activeRoutes.includes(key) ? 'bg-primary/5' : 'hover:bg-muted/30'}"
							>
								<td class="{tdBase} pl-4 font-semibold whitespace-nowrap">
									{fmtRoute(row.departure_airport, row.arrival_airport)}
									{#if $activeRoutes.includes(key)}
										<span class="ml-1.5 text-xs text-primary">✓</span>
									{/if}
									<a href="/search?from={row.departure_airport}&to={row.arrival_airport}" onclick={(e) => e.stopPropagation()} class="ml-1.5 text-xs font-normal text-muted-foreground hover:text-foreground">↗</a>
								</td>
								<td class="{tdBase} tabular-nums">{row.flights}</td>
								<td class="{tdBase} tabular-nums" style="{cellBg(row.delay_pct)}"><span class="{delayColor(row.delay_pct)}">{row.delay_pct ?? '—'}%</span></td>
								<td class="{tdBase} tabular-nums">{row.avg_delay ?? '—'}m</td>
								<td class="{tdBase} tabular-nums">{row.cancelled}</td>
								<td class="{tdBase} pr-4"><span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {reliabilityBadge(row.reliability_score)}">{row.reliability_score ?? '—'}</span></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	<!-- Flight numbers -->
	<div class="rounded-xl border bg-card mb-4 overflow-hidden">
		<div class="flex items-center justify-between px-4 pt-4 pb-2">
			<h2 class="text-sm font-semibold text-foreground">Most Delayed Flights</h2>
		</div>
		{#if isLoading}
			<div class="p-4">
				<div class="{sk} h-48 w-full rounded-lg"></div>
			</div>
		{:else if !hasFlights}
			<div class="px-4 py-8 text-center">
				<p class="text-muted-foreground">No flight data available</p>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="border-y bg-muted/30">
						<tr>
							<th class="{thBtn} pl-4">Flight</th>
							<th class="{thBtn}" onclick={() => flightSort.update(s => toggleSort(s, 'operated'))}>Ops {sortIcon($flightSort, 'operated')}</th>
							<th class="{thBtn}" onclick={() => flightSort.update(s => toggleSort(s, 'delay_pct'))}>Delay% {sortIcon($flightSort, 'delay_pct')}</th>
							<th class="{thBtn}" onclick={() => flightSort.update(s => toggleSort(s, 'avg_delay'))}>Avg {sortIcon($flightSort, 'avg_delay')}</th>
							<th class="{thBtn} pr-4" onclick={() => flightSort.update(s => toggleSort(s, 'cancelled'))}>Cancelled {sortIcon($flightSort, 'cancelled')}</th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each sortedFlights as row}
							<tr onclick={() => nav(`/search?q=${row.flight_number}`)} class="hover:bg-muted/30 transition-colors cursor-pointer">
								<td class="{tdBase} pl-4 font-semibold">{row.flight_number}</td>
								<td class="{tdBase} tabular-nums">{row.operated}</td>
								<td class="{tdBase} tabular-nums" style="{cellBg(row.delay_pct)}"><span class="{delayColor(row.delay_pct)}">{row.delay_pct ?? '—'}%</span></td>
								<td class="{tdBase} tabular-nums">{row.avg_delay ?? '—'}m</td>
								<td class="{tdBase} pr-4 tabular-nums">{row.cancelled}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	<!-- Busiest + worst days -->
	<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
		<div class="rounded-xl border bg-card overflow-hidden">
			<div class="px-4 pt-4 pb-2"><h2 class="text-sm font-semibold text-foreground">Busiest Days</h2></div>
			{#if isLoading}
				<div class="p-4">
					<div class="{sk} h-48 w-full rounded-lg"></div>
				</div>
			{:else if !hasBusiestDays}
				<div class="px-4 py-8 text-center">
					<p class="text-muted-foreground">No data available</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead class="border-y bg-muted/30">
							<tr>
								<th class="{thBtn} pl-4">Date</th>
								<th class="{thBtn}">Flights</th>
								<th class="{thBtn}">Cancelled</th>
								<th class="{thBtn} pr-4">Landed</th>
							</tr>
						</thead>
						<tbody class="divide-y">
							{#each data.busiestDays as row}
								<tr onclick={() => nav(`/search?date=${row.flight_date}`)} class="hover:bg-muted/30 transition-colors cursor-pointer">
									<td class="{tdBase} pl-4">{formatDate(row.flight_date)}</td>
									<td class="{tdBase} tabular-nums">{row.flights}</td>
									<td class="{tdBase} tabular-nums {Number(row.cancelled) > 5 ? 'text-red-600' : ''}">{row.cancelled}</td>
									<td class="{tdBase} pr-4 tabular-nums">{row.landed}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
		<div class="rounded-xl border bg-card overflow-hidden">
			<div class="px-4 pt-4 pb-2"><h2 class="text-sm font-semibold text-foreground">Worst Cancellation Days</h2></div>
			{#if isLoading}
				<div class="p-4">
					<div class="{sk} h-48 w-full rounded-lg"></div>
				</div>
			{:else if !hasWorstDays}
				<div class="px-4 py-8 text-center">
					<p class="text-muted-foreground">No data available</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead class="border-y bg-muted/30">
							<tr>
								<th class="{thBtn} pl-4">Date</th>
								<th class="{thBtn}">Cancelled</th>
								<th class="{thBtn}">Total</th>
								<th class="{thBtn} pr-4">Cancel%</th>
							</tr>
						</thead>
						<tbody class="divide-y">
							{#each data.worstDays as row}
								<tr onclick={() => nav(`/search?date=${row.flight_date}`)} class="hover:bg-muted/30 transition-colors cursor-pointer">
									<td class="{tdBase} pl-4">{formatDate(row.flight_date)}</td>
									<td class="{tdBase} tabular-nums text-red-600 font-semibold">{row.cancelled}</td>
									<td class="{tdBase} tabular-nums">{row.total_flights}</td>
									<td class="{tdBase} pr-4" style="{cellBg(row.cancel_pct)}"><span class="{delayColor(row.cancel_pct)}">{row.cancel_pct}%</span></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>

	<!-- Top delays -->
	<div class="rounded-xl border bg-card mb-4 overflow-hidden">
		<div class="px-4 pt-4 pb-2"><h2 class="text-sm font-semibold text-foreground">Longest Individual Delays</h2></div>
		{#if isLoading}
			<div class="p-4">
				<div class="{sk} h-48 w-full rounded-lg"></div>
			</div>
		{:else if !hasTopDelays}
			<div class="px-4 py-8 text-center">
				<p class="text-muted-foreground">No delay records available</p>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="border-y bg-muted/30">
						<tr>
							<th class="{thBtn} pl-4">Flight</th>
							<th class="{thBtn}">Date</th>
							<th class="{thBtn}">Route</th>
							<th class="{thBtn} pr-4">Delay</th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each data.topDelays as row}
							<tr onclick={() => nav(`/flights/${row.id}`)} class="hover:bg-muted/30 transition-colors cursor-pointer">
								<td class="{tdBase} pl-4 font-semibold">{row.flight_number}</td>
								<td class="{tdBase}">{formatDate(row.flight_date)}</td>
								<td class="{tdBase} whitespace-nowrap">{fmtRoute(row.departure_airport, row.arrival_airport)}</td>
								<td class="{tdBase} pr-4 font-bold tabular-nums text-red-600">{row.delay_minutes}m</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	<!-- Monthly + Aircraft -->
	<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
		<div class="rounded-xl border bg-card overflow-hidden">
			<div class="px-4 pt-4 pb-2"><h2 class="text-sm font-semibold text-foreground">Monthly Breakdown</h2></div>
			{#if isLoading}
				<div class="p-4">
					<div class="{sk} h-48 w-full rounded-lg"></div>
				</div>
			{:else if !hasMonthlyBreakdown}
				<div class="px-4 py-8 text-center">
					<p class="text-muted-foreground">No monthly data available</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead class="border-y bg-muted/30">
							<tr>
								<th class="{thBtn} pl-4">Month</th>
								<th class="{thBtn}">Flights</th>
								<th class="{thBtn}">Cancelled</th>
								<th class="{thBtn}">Cancel%</th>
								<th class="{thBtn} pr-4">Avg Delay</th>
							</tr>
						</thead>
						<tbody class="divide-y">
							{#each data.monthlyBreakdown as row}
								<tr>
									<td class="{tdBase} pl-4 font-medium">{row.month}</td>
									<td class="{tdBase} tabular-nums">{row.flights}</td>
									<td class="{tdBase} tabular-nums">{row.cancelled}</td>
									<td class="{tdBase}" style="{cellBg(row.cancel_pct)}"><span class="{delayColor(row.cancel_pct)}">{row.cancel_pct}%</span></td>
									<td class="{tdBase} pr-4 tabular-nums">{row.avg_delay ?? '—'}m</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
		<div class="rounded-xl border bg-card overflow-hidden">
			<div class="px-4 pt-4 pb-2"><h2 class="text-sm font-semibold text-foreground">Aircraft Usage</h2></div>
			{#if isLoading}
				<div class="p-4">
					<div class="{sk} h-48 w-full rounded-lg"></div>
				</div>
			{:else if !hasAircraftUsage}
				<div class="px-4 py-8 text-center">
					<p class="text-muted-foreground">No aircraft data available</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead class="border-y bg-muted/30">
							<tr>
								<th class="{thBtn} pl-4">Reg</th>
								<th class="{thBtn}">Type</th>
								<th class="{thBtn}">Flights</th>
								<th class="{thBtn}">Cancelled</th>
								<th class="{thBtn} pr-4">Avg Delay</th>
							</tr>
						</thead>
						<tbody class="divide-y">
							{#each data.aircraftUsage as row}
								<tr>
									<td class="{tdBase} pl-4 font-mono font-semibold text-sm">{row.aircraft_registration}</td>
									<td class="{tdBase}">{row.aircraft_type}</td>
									<td class="{tdBase} tabular-nums">{row.flights}</td>
									<td class="{tdBase} tabular-nums">{row.cancelled}</td>
									<td class="{tdBase} pr-4 tabular-nums">{row.avg_delay ?? '—'}m</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>

	<!-- Weather Impact -->
	<div class="rounded-xl border bg-card mb-4 overflow-hidden">
		<div class="px-4 pt-4 pb-3 border-b">
			<h2 class="text-sm font-semibold text-foreground">Weather Impact</h2>
			<p class="text-xs text-muted-foreground mt-0.5">Based on {data.wxFlightCount} flights matched to hourly GCI weather</p>
		</div>
		{#if isLoading}
			<div class="p-4">
				<div class="{sk} h-64 w-full rounded-lg"></div>
			</div>
		{:else if !hasWeatherData}
			<div class="px-4 py-8 text-center">
				<p class="text-muted-foreground">No weather data available</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x">
				{#each [
					{ title: 'By Wind Speed', rows: data.windDelays, bandKey: 'band' },
					{ title: 'By Crosswind (RWY 09/27)', rows: data.crosswindDelays, bandKey: 'xw_band' },
					{ title: 'By Visibility', rows: data.visibilityDelays, bandKey: 'band' },
					{ title: 'By Precipitation', rows: data.precipDelays, bandKey: 'band' },
					{ title: 'By Weather Condition', rows: data.weatherCodeDelays, bandKey: 'weather_code', isCode: true },
				] as section}
					<div class="p-4">
						<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{section.title}</h3>
						<table class="w-full">
							<thead>
								<tr class="border-b">
									<th class="text-left text-xs text-muted-foreground pb-1.5 font-medium">Condition</th>
									<th class="text-right text-xs text-muted-foreground pb-1.5 font-medium">Flights</th>
									<th class="text-right text-xs text-muted-foreground pb-1.5 font-medium">Delay%</th>
									<th class="text-right text-xs text-muted-foreground pb-1.5 font-medium hidden sm:table-cell">Avg</th>
								</tr>
							</thead>
							<tbody class="divide-y">
								{#each section.rows as row}
									<tr>
										<td class="py-2 pr-2 text-sm {section.bandKey === 'xw_band' ? xwBandColor(row[section.bandKey]) : ''}">
											{section.isCode ? (WX_LABELS[Number(row[section.bandKey])] ?? `Code ${row[section.bandKey]}`) : row[section.bandKey]}
										</td>
										<td class="py-2 text-right text-sm tabular-nums">{row.flights}</td>
										<td class="py-2 text-right text-sm tabular-nums" style="{cellBg(row.delay_pct)}"><span class="{delayColor(row.delay_pct)}">{row.delay_pct ?? '—'}%</span></td>
										<td class="py-2 text-right text-sm tabular-nums hidden sm:table-cell">{row.avg_delay ?? '—'}m</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Worst weather days -->
	<div class="rounded-xl border bg-card mb-4 overflow-hidden">
		<div class="px-4 pt-4 pb-2"><h2 class="text-sm font-semibold text-foreground">Worst Weather Days</h2></div>
		{#if isLoading}
			<div class="p-4">
				<div class="{sk} h-48 w-full rounded-lg"></div>
			</div>
		{:else if !hasWorstWeatherDays}
			<div class="px-4 py-8 text-center">
				<p class="text-muted-foreground">No weather days data available</p>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="border-y bg-muted/30">
						<tr>
							<th class="{thBtn} pl-4">Date</th>
							<th class="{thBtn}">Flights</th>
							<th class="{thBtn}">Cancelled</th>
							<th class="{thBtn}">Avg Delay</th>
							<th class="{thBtn}">Wind</th>
							<th class="{thBtn}">Vis Km</th>
							<th class="{thBtn} pr-4">Precip mm</th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each data.worstWeatherDays as row}
							<tr onclick={() => nav(`/search?date=${row.flight_date}`)} class="hover:bg-muted/30 transition-colors cursor-pointer">
								<td class="{tdBase} pl-4">{formatDate(row.flight_date)}</td>
								<td class="{tdBase} tabular-nums">{row.flights}</td>
								<td class="{tdBase} tabular-nums text-red-600 font-medium">{row.cancelled}</td>
								<td class="{tdBase} tabular-nums">{row.avg_delay ?? '—'}m</td>
								<td class="{tdBase} tabular-nums {Number(row.wind_kn) > 30 ? 'text-red-600 font-medium' : Number(row.wind_kn) > 25 ? 'text-amber-600' : ''}">{row.wind_kn}kn {degToCardinal(row.wind_dir)}</td>
								<td class="{tdBase} tabular-nums {Number(row.vis_km) < 3 ? 'text-red-600 font-medium' : Number(row.vis_km) < 5 ? 'text-amber-600' : ''}">{row.vis_km}</td>
								<td class="{tdBase} pr-4 tabular-nums">{row.precip_mm}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>
