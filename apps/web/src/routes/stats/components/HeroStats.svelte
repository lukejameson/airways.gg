<script lang="ts">
	import type { HeroStats } from '../lib/types';
	import { calculateHeroStats, n } from '../lib/transforms';

	interface Props {
		data: HeroStats;
		isLoading: boolean;
		daysTracked: number;
		skeletonClass: string;
	}

	let { data, isLoading, daysTracked, skeletonClass }: Props = $props();

	const stats = $derived(calculateHeroStats(data));
</script>

<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
	{#if isLoading}
		{#each [1, 2, 3, 4] as _}
			<div class="rounded-xl border bg-card p-4">
				<div class="{skeletonClass} h-3 w-24 mb-3"></div>
				<div class="{skeletonClass} h-8 w-16 mb-2"></div>
				<div class="{skeletonClass} h-3 w-32"></div>
			</div>
		{/each}
	{:else}
		{@const cards = [
			{
				label: 'Total Flights',
				value: stats.totalFlights.toLocaleString(),
				sub: `${daysTracked} days tracked`,
				color: ''
			},
			{
				label: 'On-Time Rate',
				value: `${stats.onTimePct}%`,
				sub: `${n(data.with_outcome)} flights with data`,
				color: Number(stats.onTimePct) > 80 ? 'text-green-600' : Number(stats.onTimePct) > 60 ? 'text-amber-600' : 'text-red-600'
			},
			{
				label: 'Cancellation Rate',
				value: `${stats.cancelPct}%`,
				sub: `${stats.totalCancelled} cancelled`,
				color: Number(stats.cancelPct) > 15 ? 'text-red-600' : Number(stats.cancelPct) > 8 ? 'text-amber-600' : 'text-green-600'
			},
			{
				label: 'Avg Delay (when late)',
				value: `${stats.avgDelay}m`,
				sub: 'exact from records',
				color: stats.avgDelay > 120 ? 'text-red-600' : stats.avgDelay > 60 ? 'text-amber-600' : ''
			}
		]}
		{#each cards as card}
			<div class="rounded-xl border bg-card p-4">
				<p class="text-xs font-medium text-muted-foreground mb-1.5 leading-tight">{card.label}</p>
				<p class="text-2xl sm:text-3xl font-bold tabular-nums leading-none {card.color}">{card.value}</p>
				<p class="text-xs text-muted-foreground mt-1.5">{card.sub}</p>
			</div>
		{/each}
	{/if}
</div>
