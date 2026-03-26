<script lang="ts">
	import { browser } from '$app/environment';
	import type { DayOfWeekStats } from '../lib/types';
	import { getChartColors, getDelayColorForRatio } from '../lib/transforms';

	interface Props {
		data: DayOfWeekStats[];
	}

	let { data }: Props = $props();

	let canvas = $state<HTMLCanvasElement | undefined>();
	let chart: import('chart.js').Chart | null = null;

	$effect(() => {
		if (!browser || !canvas) return;

		// Clean up previous chart
		if (chart) {
			chart.destroy();
			chart = null;
		}

		import('chart.js/auto').then(({ Chart }) => {
			if (!canvas) return;

			const style = getComputedStyle(document.documentElement);
			const colors = getChartColors(style);

			const delays = data.map((r) => r.avg_delay ?? 0);
			const maxDelay = Math.max(...delays, 1);

			const barColors = delays.map((d) => {
				const ratio = d / maxDelay;
				return getDelayColorForRatio(ratio);
			});

			chart = new Chart(canvas, {
				type: 'bar',
				data: {
					labels: data.map((r) => String(r.day_name).trim().slice(0, 3)),
					datasets: [
						{
							label: 'Avg delay (min)',
							data: delays,
							backgroundColor: barColors,
							borderRadius: 4,
							yAxisID: 'y'
						},
						{
							label: 'Cancellations',
							data: data.map((r) => r.cancelled),
							backgroundColor: colors.destructive.replace(')', ' / 0.25)').replace('hsl(', 'hsl('),
							borderColor: colors.destructive.replace(')', ' / 0.6)').replace('hsl(', 'hsl('),
							borderWidth: 1,
							borderRadius: 4,
							yAxisID: 'y2'
						}
					]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					interaction: { mode: 'index', intersect: false },
					plugins: {
						legend: {
							labels: { color: colors.mutedFg, boxWidth: 12, padding: 16 }
						},
						tooltip: {
							backgroundColor: '#fff',
							titleColor: '#111',
							bodyColor: '#555',
							borderColor: colors.border,
							borderWidth: 1
						}
					},
					scales: {
						x: {
							ticks: { color: colors.mutedFg },
							grid: { color: colors.border }
						},
						y: {
							ticks: { color: colors.mutedFg },
							grid: { color: colors.border },
							title: {
								display: true,
								text: 'Avg delay (min)',
								color: colors.mutedFg
							}
						},
						y2: {
							position: 'right',
							ticks: { color: colors.mutedFg },
							grid: { drawOnChartArea: false },
							title: {
								display: true,
								text: 'Cancellations',
								color: colors.mutedFg
							}
						}
					}
				}
			});
		});

		return () => {
			chart?.destroy();
			chart = null;
		};
	});
</script>

<div class="relative h-48">
	<canvas bind:this={canvas}></canvas>
</div>
