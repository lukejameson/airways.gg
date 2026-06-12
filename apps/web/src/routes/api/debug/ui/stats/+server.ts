import type { RequestHandler } from './$types';
import { debugResponse, debugError } from '$lib/server/debug-helpers';
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
} from '../../../../stats/lib/queries';
import type { FilterConfig } from '../../../../stats/lib/types';

/**
 * Mirrors the stats page load function — reuses all existing query functions.
 * Query params: range, dateFrom, dateTo, airline, route, direction, dow, season, month, year, threshold
 */
export const GET: RequestHandler = async ({ url }) => {
  const t0 = performance.now();
  try {
    const range = url.searchParams.get('range') ?? '90';
    const dateFrom = url.searchParams.get('dateFrom') ?? '';
    const dateTo = url.searchParams.get('dateTo') ?? '';
    const activeAirline = url.searchParams.get('airline') ?? '';
    const activeRoutes = url.searchParams.getAll('route').filter(Boolean);
    const activeDirection = url.searchParams.get('direction') ?? '';
    const activeDow = url.searchParams.get('dow') ?? '';
    const activeSeason = url.searchParams.get('season') ?? '';
    const activeMonth = url.searchParams.get('month') ?? '';
    const activeYear = url.searchParams.get('year') ?? '';
    const thresholdParam = parseInt(url.searchParams.get('threshold') ?? '15', 10);
    const threshold = [0, 15, 30].includes(thresholdParam) ? thresholdParam : 15;
    const minFlightsPerRoute = range === '30' ? 2 : range === '90' ? 3 : 5;

    const parsedRoutes = activeRoutes.map(r => {
      const parts = r.split('-');
      const dep = parts[0] ?? '';
      const arr = parts.slice(1).join('-');
      return { dep, arr, key: r };
    }).filter(r => r.dep && r.arr);

    const dowNum = parseInt(activeDow, 10);
    const monthNum = parseInt(activeMonth, 10);
    const yearNum = parseInt(activeYear, 10);

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
      getFilterOptions(),
      getHeroStats(filterConfig),
      getDelayDistribution(filterConfig),
      getDayOfWeekDistribution(filterConfig),
      getHourDistribution(filterConfig),
      getBusiestDays(filterConfig, 10),
      getWorstDays(filterConfig, 10),
      getRouteStats(filterConfig),
      getFlightNumberStats(filterConfig, 20),
      getAircraftStats(filterConfig),
      getTopDelays(filterConfig, 10),
      getDailyOtpStats(filterConfig),
      getMonthlyBreakdown(filterConfig),
      getWindDelayStats(filterConfig),
      getVisibilityDelayStats(filterConfig),
      getPrecipitationDelayStats(filterConfig),
      getWeatherCodeDelayStats(filterConfig),
      getCrosswindDelayStats(filterConfig),
      getWorstWeatherDays(filterConfig, 10),
      getDelayImpact(filterConfig),
      getWorstDelayDays(filterConfig, 10),
    ]);

    const data = {
      filterConfig,
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
    };

    return debugResponse([data], performance.now() - t0);
  } catch (err) {
    console.error('[debug/ui/stats]', err);
    return debugError('Query failed', 500);
  }
};
