/**
 * Data transformation helpers for stats page
 * Handles data formatting, calculations, and sorting for charts and tables
 */

import type {
	HeroStats,
	DelayDistribution,
	DayOfWeekStats,
	RouteStats,
	FlightNumberStats,
	DelayImpact
} from './types';

// Helper: coerce to number
export function n(v: unknown): number {
	return Number(v) || 0;
}

// Helper: format large numbers
export function fmtBig(v: number): string {
	if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}m`;
	if (v >= 10_000) return `${Math.round(v / 1_000)}k`;
	return v.toLocaleString();
}

// Helper: format money
export function fmtMoney(v: number): string {
	if (v >= 1_000_000) return `£${(v / 1_000_000).toFixed(1)}m`;
	if (v >= 1_000) return `£${Math.round(v / 1_000)}k`;
	return `£${v}`;
}

// Calculate derived hero stats
export interface HeroDerived {
	totalFlights: number;
	totalCancelled: number;
	cancelPct: string;
	onTimePct: string;
	avgDelay: number;
	earliestDate: string | null;
	latestDate: string | null;
}

export function calculateHeroStats(hero: HeroStats): HeroDerived {
	const totalFlights = n(hero.total_flights);
	const totalCancelled = n(hero.total_cancelled);
	const cancelPct = totalFlights ? ((totalCancelled / totalFlights) * 100).toFixed(1) : '0';
	const withOutcome = n(hero.with_outcome);
	const onTimePct = withOutcome ? ((n(hero.on_time) / withOutcome) * 100).toFixed(1) : '0';

	return {
		totalFlights,
		totalCancelled,
		cancelPct,
		onTimePct,
		avgDelay: n(hero.avg_delay_mins),
		earliestDate: hero.earliest_date,
		latestDate: hero.latest_date
	};
}

// Calculate delay distribution total
export function calculateDistTotal(dist: DelayDistribution): number {
	return (
		n(dist.on_time) +
		n(dist.d1_15) +
		n(dist.d16_30) +
		n(dist.d31_60) +
		n(dist.d1_2h) +
		n(dist.d2hplus) +
		n(dist.cancelled)
	);
}

// Calculate delay impact stats
export interface ImpactDerived {
	impactMins: number;
	impactHours: number;
	impactDays: string;
	paxHours: number;
	costLow: number;
	costHigh: number;
}

export function calculateImpactStats(impactData: DelayImpact): ImpactDerived {
	const impactMins = n(impactData.total_delay_mins_gt5);
	const impactHours = Math.round(impactMins / 60);
	const impactDays = (impactMins / 60 / 24).toFixed(1);
	const paxHours = Math.round(n(impactData.pax_weighted_delay_mins) / 60);
	const costLow = Math.round(paxHours * 11.5);
	const costHigh = Math.round(paxHours * 25);

	return {
		impactMins,
		impactHours,
		impactDays,
		paxHours,
		costLow,
		costHigh
	};
}

// Day of week analysis
export interface BestWorstDay {
	best: DayOfWeekStats | null;
	worst: DayOfWeekStats | null;
}

export function analyzeDayOfWeek(days: DayOfWeekStats[]): BestWorstDay {
	if (!days.length) return { best: null, worst: null };

	const withScore = days.map((d) => ({
		...d,
		score: n(d.avg_delay) * 0.5 + (n(d.cancelled) / Math.max(n(d.flights), 1)) * 100 * 0.5
	}));

	const sorted = [...withScore].sort((a, b) => a.score - b.score);

	return {
		best: sorted[0] ?? null,
		worst: sorted[sorted.length - 1] ?? null
	};
}

// Sort routes
export interface SortState {
	col: string;
	dir: 'asc' | 'desc';
}

export function sortRoutes(rows: RouteStats[], sort: SortState): RouteStats[] {
	const { col, dir } = sort;
	return [...rows].sort((a, b) => {
		const av = n(a[col as keyof RouteStats]);
		const bv = n(b[col as keyof RouteStats]);
		return dir === 'desc' ? bv - av : av - bv;
	});
}

// Sort flights
export function sortFlights(rows: FlightNumberStats[], sort: SortState): FlightNumberStats[] {
	const { col, dir } = sort;
	return [...rows].sort((a, b) => {
		const av = n(a[col as keyof FlightNumberStats]);
		const bv = n(b[col as keyof FlightNumberStats]);
		return dir === 'desc' ? bv - av : av - bv;
	});
}

// Color utilities
export function delayColor(pct: unknown): string {
	const p = Number(pct) || 0;
	if (p < 20) return 'text-green-600';
	if (p < 50) return 'text-amber-600';
	return 'text-red-600';
}

export function reliabilityBadge(score: unknown): string {
	const s = Number(score) || 0;
	if (s < 20) return 'bg-green-100 text-green-700';
	if (s < 50) return 'bg-amber-100 text-amber-700';
	return 'bg-red-100 text-red-700';
}

export function cellBg(pct: unknown): string {
	const p = Math.min(Number(pct) || 0, 100);
	return `background: hsl(0 84% 60% / ${(p / 100) * 0.18})`;
}

// Wind direction to cardinal
export function degToCardinal(deg: unknown): string {
	const d = Number(deg) || 0;
	const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
	return directions[Math.round((d % 360) / 22.5) % 16];
}

// Crosswind band color
export function xwBandColor(bandKey: unknown): string {
	const b = String(bandKey);
	if (b.includes('>dry limit')) return 'text-red-600 font-medium';
	if (b.includes('>wet limit')) return 'text-amber-600 font-medium';
	return '';
}

// Tone classes for insight cards
type InsightTone = 'green' | 'amber' | 'red' | 'neutral';

export const toneClasses: Record<
	InsightTone,
	{ card: string; value: string; label: string }
> = {
	green: {
		card: 'border-green-200 bg-green-50',
		value: 'text-green-700',
		label: 'text-green-600'
	},
	amber: {
		card: 'border-amber-200 bg-amber-50',
		value: 'text-amber-700',
		label: 'text-amber-600'
	},
	red: {
		card: 'border-red-200 bg-red-50',
		value: 'text-red-700',
		label: 'text-red-600'
	},
	neutral: {
		card: 'border-border bg-card',
		value: 'text-foreground',
		label: 'text-muted-foreground'
	}
};

// Table styles
export const thBtn =
	'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground cursor-pointer select-none whitespace-nowrap';
export const tdBase = 'px-3 py-2.5 text-sm';

// Route key helper
export function routeKey(dep: string, arr: string): string {
	return `${dep}-${arr}`;
}

// Parse route key
export function parseRouteKey(key: string): { departure: string; arrival: string } {
	const parts = key.split('-');
	const departure = parts[0] ?? '';
	const arrival = parts.slice(1).join('-');
	return { departure, arrival };
}

// Weather labels
export const WX_LABELS: Record<number, string> = {
	0: 'Clear sky',
	1: 'Mainly clear',
	2: 'Partly cloudy',
	3: 'Overcast',
	45: 'Fog',
	48: 'Icy fog',
	51: 'Light drizzle',
	53: 'Moderate drizzle',
	55: 'Dense drizzle',
	61: 'Slight rain',
	63: 'Moderate rain',
	65: 'Heavy rain',
	71: 'Slight snow',
	73: 'Moderate snow',
	75: 'Heavy snow',
	80: 'Slight showers',
	81: 'Moderate showers',
	82: 'Heavy showers',
	95: 'Thunderstorm'
};

// Chart color helpers
export function getDelayColorForRatio(ratio: number): string {
	if (ratio < 0.4) return 'hsl(160 84% 39% / 0.8)';
	if (ratio < 0.7) return 'hsl(38 92% 50% / 0.8)';
	return 'hsl(0 84% 60% / 0.8)';
}

export function getChartColors(style: CSSStyleDeclaration): {
	primary: string;
	destructive: string;
	mutedFg: string;
	border: string;
} {
	return {
		primary: `hsl(${style.getPropertyValue('--primary').trim()})`,
		destructive: `hsl(${style.getPropertyValue('--destructive').trim()})`,
		mutedFg: `hsl(${style.getPropertyValue('--muted-foreground').trim()})`,
		border: `hsl(${style.getPropertyValue('--border').trim()})`
	};
}

// Data availability checks
export function hasData(data: unknown[] | undefined): boolean {
	return Array.isArray(data) && data.length > 0;
}

export function hasNumericValue(value: unknown): boolean {
	return typeof value === 'number' && value > 0;
}
