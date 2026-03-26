<script lang="ts">
	import { browser } from '$app/environment';
	import type { HourlyStats } from '../lib/types';
	import { getChartColors, getDelayColorForRatio } from '../lib/transforms';

	interface Props {
		data: HourlyStats[];
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

			chart = new Chart(canvas, {
				type: 'bar',
				data: {
					labels: data.map((r) => `${String(r.hour).padStart(2, '0')}:00`),
					datasets: [
						{
							label: 'Avg delay (min)',
							data: delays,
							backgroundColor: delays.map((d) => {
								const ratio = d / maxDelay;
								return getDelayColorForRatio(ratio);
							}),
							borderRadius: 4
						}
					]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: { display: false },
						tooltip: {
							backgroundColor: '#fff',
							titleColor: '#111',
							bodyColor: '#555',
							borderColor: colors.border,
							borderWidth: 1,
							callbacks: {
								afterBody: (items) => {
									const idx = items[0]?.dataIndex;
									const row = data[idx];
									if (!row) return '';
									return `${row.flights} flights · ${row.delayed} delayed`;
								}
							}
						}
					},
					scales: {
						x: {
							ticks: { color: colors.mutedFg, maxRotation: 45 },
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
