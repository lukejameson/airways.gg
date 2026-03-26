<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import type { DailyOtpStats } from '../lib/types';
	import { getChartColors } from '../lib/transforms';

	interface Props {
		data: DailyOtpStats[];
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

			// Set defaults
			Chart.defaults.font.family = 'Space Grotesk, system-ui, sans-serif';
			Chart.defaults.font.size = 11;

			const style = getComputedStyle(document.documentElement);
			const colors = getChartColors(style);

			chart = new Chart(canvas, {
				type: 'line',
				data: {
					labels: data.map((r) => {
						const d = new Date(r.flight_date);
						return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
					}),
					datasets: [
						{
							label: 'On-time %',
							data: data.map((r) => r.otp_pct ?? 0),
							borderColor: colors.primary,
							backgroundColor: colors.primary.replace(')', ' / 0.1)').replace('hsl(', 'hsl('),
							fill: true,
							tension: 0.3,
							pointRadius: 3,
							borderWidth: 2
						},
						{
							label: 'Cancellation %',
							data: data.map((r) => r.cancel_pct ?? 0),
							borderColor: colors.destructive,
							backgroundColor: 'transparent',
							fill: false,
							tension: 0.3,
							pointRadius: 3,
							borderWidth: 2
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
							ticks: { color: colors.mutedFg, maxTicksLimit: 10 },
							grid: { color: colors.border }
						},
						y: {
							min: 0,
							max: 100,
							ticks: {
								color: colors.mutedFg,
								callback: (v) => `${v}%`
							},
							grid: { color: colors.border }
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

<div class="relative h-48 sm:h-56">
	<canvas bind:this={canvas}></canvas>
</div>
