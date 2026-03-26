import type { PageServerLoad } from './$types';
import {
  getFilterOptions,
  getHeroStats,
  getDelayDistribution,
  getDayOfWeekDistribution,
  getHourDistribution,
  getBusiestDays,
  getWorstDays,
  getRouteStats,
  getFlightNumberStats,
  getAircraftStats,
  getTopDelays,
  getDailyOtpStats,
  getMonthlyBreakdown,
  getWindDelayStats,
  getVisibilityDelayStats,
  getPrecipitationDelayStats,
  getWeatherCodeDelayStats,
  getCrosswindDelayStats,
  getWorstWeatherDays,
  getDelayImpact,
  getWorstDelayDays,
} from './lib/queries';
import type { FilterConfig } from './lib/types';

export const load: PageServerLoad = async ({ url }) => {
  const range = url.searchParams.get('range') ?? '90';
  const dateFrom = url.searchParams.get('dateFrom') ?? '';
  const dateTo = url.searchParams.get('dateTo') ?? '';
  const activeAirline = url.searchParams.get('airline') ?? '';
  // Support multiple routes: ?route=GCI-LGW&route=GCI-EXT
  const activeRoutes = url.searchParams.getAll('route').filter(Boolean);
  const activeDirection = url.searchParams.get('direction') ?? '';
  const activeDow = url.searchParams.get('dow') ?? '';
  const activeSeason = url.searchParams.get('season') ?? '';
  const activeMonth = url.searchParams.get('month') ?? '';
  const activeYear = url.searchParams.get('year') ?? '';
  const thresholdParam = parseInt(url.searchParams.get('threshold') ?? '15', 10);
  const threshold = [0, 15, 30].includes(thresholdParam) ? thresholdParam : 15;
  const minFlightsPerRoute = range === '30' ? 2 : range === '90' ? 3 : 5;

  // Parse multiple routes into array of {dep, arr} objects
  const parsedRoutes = activeRoutes.map(r => {
    const parts = r.split('-');
    const dep = parts[0] ?? '';
    const arr = parts.slice(1).join('-');
    return { dep, arr, key: r };
  }).filter(r => r.dep && r.arr);

  const dowNum = parseInt(activeDow, 10);
  const monthNum = parseInt(activeMonth, 10);
  const yearNum = parseInt(activeYear, 10);

  // Build filter configuration
  const filterConfig: FilterConfig = {
    range: {
      type: range as '30' | '90' | 'custom' | 'all',
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    },
    airline: activeAirline || undefined,
    routes: parsedRoutes.length > 0 ? parsedRoutes : undefined,
    direction: activeDirection as 'dep' | 'arr' | '' || undefined,
    dow: activeDow !== '' && !isNaN(dowNum) && dowNum >= 0 && dowNum <= 6 ? dowNum : undefined,
    season: activeSeason as 'summer' | 'winter' | 'spring' | 'autumn' | '' || undefined,
    month: activeMonth !== '' && !isNaN(monthNum) && monthNum >= 1 && monthNum <= 12 ? monthNum : undefined,
    year: activeYear !== '' && !isNaN(yearNum) && yearNum >= 2000 && yearNum <= 2100 ? yearNum : undefined,
    threshold,
    minFlightsPerRoute,
  };

  // Get filter options and all stats data in parallel
  const [
    filterOptions,
    heroStats,
    delayDistribution,
    dayOfWeek,
    departureHour,
    busiestDays,
    worstDays,
    worstRoutes,
    flightNumbers,
    aircraftUsage,
    topDelays,
    dailyOtp,
    monthlyBreakdown,
    windDelays,
    visibilityDelays,
    precipDelays,
    weatherCodeDelays,
    crosswindDelays,
    worstWeatherDays,
    delayImpact,
    worstDelayDays,
  ] = await Promise.all([
    getFilterOptions().catch((e) => { console.error('[Stats] getFilterOptions failed:', e); return { availableYears: [] as number[], availableAirlines: [] as string[], availableRoutes: [] as Array<{ departure: string; arrival: string; key: string }> }; }),
    getHeroStats(filterConfig).catch((e) => { console.error('[Stats] getHeroStats failed:', e); return { total_flights: 0, total_cancelled: 0, operated: 0, with_outcome: 0, on_time: 0, delayed: 0, avg_delay_mins: null, earliest_date: null, latest_date: null }; }),
    getDelayDistribution(filterConfig).catch((e) => { console.error('[Stats] getDelayDistribution failed:', e); return { on_time: 0, d1_15: 0, d16_30: 0, d31_60: 0, d1_2h: 0, d2hplus: 0, cancelled: 0, no_outcome: 0 }; }),
    getDayOfWeekDistribution(filterConfig).catch((e) => { console.error('[Stats] getDayOfWeekDistribution failed:', e); return []; }),
    getHourDistribution(filterConfig).catch((e) => { console.error('[Stats] getHourDistribution failed:', e); return []; }),
    getBusiestDays(filterConfig, 10).catch((e) => { console.error('[Stats] getBusiestDays failed:', e); return []; }),
    getWorstDays(filterConfig, 10).catch((e) => { console.error('[Stats] getWorstDays failed:', e); return []; }),
    getRouteStats(filterConfig).catch((e) => { console.error('[Stats] getRouteStats failed:', e); return []; }),
    getFlightNumberStats(filterConfig, 20).catch((e) => { console.error('[Stats] getFlightNumberStats failed:', e); return []; }),
    getAircraftStats(filterConfig).catch((e) => { console.error('[Stats] getAircraftStats failed:', e); return []; }),
    getTopDelays(filterConfig, 10).catch((e) => { console.error('[Stats] getTopDelays failed:', e); return []; }),
    getDailyOtpStats(filterConfig).catch((e) => { console.error('[Stats] getDailyOtpStats failed:', e); return []; }),
    getMonthlyBreakdown(filterConfig).catch((e) => { console.error('[Stats] getMonthlyBreakdown failed:', e); return []; }),
    getWindDelayStats(filterConfig).catch((e) => { console.error('[Stats] getWindDelayStats failed:', e); return []; }),
    getVisibilityDelayStats(filterConfig).catch((e) => { console.error('[Stats] getVisibilityDelayStats failed:', e); return []; }),
    getPrecipitationDelayStats(filterConfig).catch((e) => { console.error('[Stats] getPrecipitationDelayStats failed:', e); return []; }),
    getWeatherCodeDelayStats(filterConfig).catch((e) => { console.error('[Stats] getWeatherCodeDelayStats failed:', e); return []; }),
    getCrosswindDelayStats(filterConfig).catch((e) => { console.error('[Stats] getCrosswindDelayStats failed:', e); return []; }),
    getWorstWeatherDays(filterConfig, 10).catch((e) => { console.error('[Stats] getWorstWeatherDays failed:', e); return []; }),
    getDelayImpact(filterConfig).catch((e) => { console.error('[Stats] getDelayImpact failed:', e); return { total_delay_mins: null, flights_delayed_gt5: 0, total_delay_mins_gt5: 0, operated: 0, total: 0, cancelled: 0, avg_delay_when_delayed: null, avg_delay_all_operated: null, pax_weighted_delay_mins: null }; }),
    getWorstDelayDays(filterConfig, 10).catch((e) => { console.error('[Stats] getWorstDelayDays failed:', e); return []; }),
  ]);

  const wxFlightCount = windDelays.reduce(
    (s: number, r) => s + Number(r.flights),
    0,
  );

  return {
    range,
    dateFrom,
    dateTo,
    activeAirline,
    activeRoutes,
    activeDirection,
    activeDow,
    activeSeason,
    activeMonth,
    activeYear,
    threshold,
    availableYears: filterOptions.availableYears,
    availableAirlines: filterOptions.availableAirlines,
    availableRoutes: filterOptions.availableRoutes,
    heroStats,
    delayDistribution,
    dayOfWeek,
    departureHour,
    busiestDays,
    worstDays,
    worstRoutes,
    flightNumbers,
    aircraftUsage,
    topDelays,
    dailyOtp,
    monthlyBreakdown,
    windDelays,
    visibilityDelays,
    precipDelays,
    weatherCodeDelays,
    crosswindDelays,
    worstWeatherDays,
    wxFlightCount,
    delayImpact,
    worstDelayDays,
  };
};
