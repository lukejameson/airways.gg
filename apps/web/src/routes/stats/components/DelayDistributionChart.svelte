<script lang="ts">
	import { browser } from '$app/environment';
	import type { DelayDistribution } from '../lib/types';
	import { getChartColors, n } from '../lib/transforms';

	interface Props {
		data: DelayDistribution;
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

			chart = new Chart(canvas, {
				type: 'bar',
				data: {
					labels: [''],
					datasets: [
						{
							label: 'On-time (≤15 min)',
							data: [n(data.on_time)],
							backgroundColor: 'hsl(160 84% 39% / 0.85)',
							borderRadius: 4
						},
						{
							label: '1–15 min',
							data: [n(data.d1_15)],
							backgroundColor: 'hsl(38 92% 50% / 0.7)',
							borderRadius: 0
						},
						{
							label: '16–30 min',
							data: [n(data.d16_30)],
							backgroundColor: 'hsl(30 92% 50% / 0.8)',
							borderRadius: 0
						},
						{
							label: '31–60 min',
							data: [n(data.d31_60)],
							backgroundColor: 'hsl(0 84% 60% / 0.7)',
							borderRadius: 0
						},
						{
							label: '1–2 hours',
							data: [n(data.d1_2h)],
							backgroundColor: 'hsl(0 84% 45% / 0.8)',
							borderRadius: 0
						},
						{
							label: '2+ hours',
							data: [n(data.d2hplus)],
							backgroundColor: 'hsl(0 84% 30% / 0.9)',
							borderRadius: 0
						},
						{
							label: 'Cancelled',
							data: [n(data.cancelled)],
							backgroundColor: 'hsl(215 20% 60% / 0.6)',
							borderRadius: 4
						}
					]
				},
				options: {
					indexAxis: 'y',
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: {
							position: 'bottom',
							labels: {
								color: colors.mutedFg,
								boxWidth: 12,
								padding: 12,
								font: { size: 11 }
							}
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
							stacked: true,
							ticks: { color: colors.mutedFg },
							grid: { color: colors.border }
						},
						y: {
							stacked: true,
							ticks: { display: false },
							grid: { display: false }
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

<div class="relative h-32">
	<canvas bind:this={canvas}></canvas>
</div>
