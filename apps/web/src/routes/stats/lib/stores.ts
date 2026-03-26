/**
 * Filter state stores and utilities for stats page
 * Centralizes filter state management and URL synchronization
 */

import { derived, writable, type Readable } from 'svelte/store';
import { browser } from '$app/environment';
import { page } from '$app/state';
import { goto } from '$app/navigation';
import type { DateRange, FilterConfig } from './types';

// Create a readable store that tracks page URL changes
// Only works on client side - returns dummy store on server
function createPageStore(): Readable<URL> {
	// On server, return a dummy store with a default URL
	if (!browser) {
		return {
			subscribe(fn: (value: URL) => void) {
				fn(new URL('http://localhost/stats'));
				return () => {};
			}
		};
	}

	// On client, create the actual store
	const { subscribe, set } = writable<URL>(page.url);

	// Use a simple interval to check for URL changes
	// This is necessary because $app/state page is not a store in legacy Svelte store contexts.
	// The interval runs for the lifetime of the module (singleton store) — do NOT clearInterval
	// on unsubscribe, as that would permanently kill the interval for all future subscribers.
	let lastUrl = page.url.href;
	setInterval(() => {
		if (page.url.href !== lastUrl) {
			lastUrl = page.url.href;
			set(page.url);
		}
	}, 50);

	// Also update immediately when the store is subscribed
	return {
		subscribe(fn: (value: URL) => void) {
			set(page.url);
			return subscribe(fn);
		}
	};
}

const pageUrlStore = createPageStore();

// Constants
export const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const AIRLINE_OPTIONS = [
	['', 'All'],
	['GR', 'Aurigny'],
	['BA', 'British Airways'],
	['LM', 'Loganair']
] as const;

export const DIRECTION_OPTIONS = [
	['', 'All'],
	['dep', 'Departures'],
	['arr', 'Arrivals']
] as const;

export const SEASON_OPTIONS = [
	['', 'All'],
	['spring', 'Spring'],
	['summer', 'Summer'],
	['autumn', 'Autumn'],
	['winter', 'Winter']
] as const;

export const THRESHOLD_OPTIONS = [
	[0, '0 min'],
	[15, '15 min'],
	[30, '30 min']
] as const;

// Panel open state
export const panelOpen = writable(false);

// Custom date range state
export const customModeOpen = writable(false);
export const customDateFrom = writable('');
export const customDateTo = writable('');

// Route search state
export const routeSearch = writable('');

// Sort state
export type SortDir = 'asc' | 'desc';
export interface SortState {
	col: string;
	dir: SortDir;
}

export const routeSort = writable<SortState>({ col: 'avg_delay', dir: 'desc' });
export const flightSort = writable<SortState>({ col: 'delay_pct', dir: 'desc' });

// Get filter state from current page URL
// Only call this on the client side or during component initialization
export function getFilterState(): FilterConfig {
	// Return default config on server
	if (!browser) {
		return {
			range: { type: '90' },
			airline: undefined,
			direction: undefined,
			dow: undefined,
			season: undefined,
			month: undefined,
			year: undefined,
			threshold: 15,
			minFlightsPerRoute: 5
		};
	}

	const params = page.url.searchParams;

	// Parse date range
	const rangeType = (params.get('range') as DateRange['type']) || '90';
	const dateRange: DateRange = {
		type: rangeType,
		dateFrom: params.get('dateFrom') || undefined,
		dateTo: params.get('dateTo') || undefined
	};

	// Parse month
	const monthParam = params.get('month');

	// Parse year
	const yearParam = params.get('year');

	// Parse day of week
	const dowParam = params.get('dow');

	// Parse season
	const seasonParam = params.get('season') as FilterConfig['season'];

	// Parse threshold
	const thresholdParam = params.get('threshold');

	return {
		range: dateRange,
		airline: params.get('airline') || undefined,
		direction: (params.get('direction') as FilterConfig['direction']) || undefined,
		dow: dowParam ? parseInt(dowParam, 10) : undefined,
		season: seasonParam || undefined,
		month: monthParam ? parseInt(monthParam, 10) : undefined,
		year: yearParam ? parseInt(yearParam, 10) : undefined,
		threshold: thresholdParam ? parseInt(thresholdParam, 10) : 15,
		minFlightsPerRoute: 5
	};
}

// Derived store for filter state
export const filterState = derived(
	pageUrlStore,
	(): FilterConfig => getFilterState()
);

// Count active filters
export function countActiveFilters(filters: FilterConfig): number {
	let count = 0;
	if (filters.airline) count++;
	if (filters.direction) count++;
	if (filters.dow !== undefined) count++;
	if (filters.season) count++;
	if (filters.month !== undefined) count++;
	if (filters.year !== undefined) count++;
	if (filters.threshold !== 15) count++;
	return count;
}

// Active routes from URL - as a readable store
export const activeRoutes = derived(
	pageUrlStore,
	($url) => $url.searchParams.getAll('route')
);

// Current range from URL - as a readable store
export const currentRange = derived(
	pageUrlStore,
	($url) => $url.searchParams.get('range') ?? '90'
);

// Build filter URL with updates
export function buildFilterUrl(
	currentParams: URLSearchParams,
	updates: Record<string, string | null | string[]>
): string {
	const p = new URLSearchParams(currentParams);

	for (const [key, value] of Object.entries(updates)) {
		if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
			p.delete(key);
		} else if (Array.isArray(value)) {
			p.delete(key);
			for (const item of value) {
				p.append(key, item);
			}
		} else {
			p.set(key, value);
		}
	}

	return `/stats?${p}`;
}

// Toggle sort helper
export function toggleSort(current: SortState, col: string): SortState {
	if (current.col === col) {
		return { col, dir: current.dir === 'desc' ? 'asc' : 'desc' };
	}
	return { col, dir: 'desc' };
}

// Sort icon helper
export function sortIcon(current: SortState, col: string): string {
	if (current.col !== col) return '↕';
	return current.dir === 'desc' ? '↓' : '↑';
}

// Navigation helper for filter updates
export function navigateWithFilter(
	updates: Record<string, string | null | string[]>,
	options: { noScroll?: boolean; keepFocus?: boolean } = {}
): void {
	const url = buildFilterUrl(page.url.searchParams, updates);
	goto(url, { noScroll: options.noScroll ?? true, keepFocus: options.keepFocus ?? false });
}
