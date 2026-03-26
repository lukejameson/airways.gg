/**
 * Type definitions for stats query results
 * Eliminates unsafe Record<string, unknown> casts
 */

// Filter configuration for date ranges
export interface DateRange {
  type: '30' | '90' | 'custom' | 'all';
  dateFrom?: string;
  dateTo?: string;
}

// Filter configuration for all query parameters
export interface FilterConfig {
  range: DateRange;
  airline?: string;
  routes?: Array<{ dep: string; arr: string; key: string }>;
  direction?: 'dep' | 'arr' | '';
  dow?: number;
  season?: 'summer' | 'winter' | 'spring' | 'autumn' | '';
  month?: number;
  year?: number;
  threshold: number;
  minFlightsPerRoute: number;
}

// Hero stats - main KPIs
export interface HeroStats {
  total_flights: number;
  total_cancelled: number;
  operated: number;
  with_outcome: number;
  on_time: number;
  delayed: number;
  avg_delay_mins: number | null;
  earliest_date: string | null;
  latest_date: string | null;
}

// Delay distribution by time buckets
export interface DelayDistribution {
  on_time: number;
  d1_15: number;
  d16_30: number;
  d31_60: number;
  d1_2h: number;
  d2hplus: number;
  cancelled: number;
  no_outcome: number;
}

// Day of week statistics
export interface DayOfWeekStats {
  dow: number;
  day_name: string;
  flights: number;
  cancelled: number;
  avg_delay: number | null;
}

// Hourly departure statistics
export interface HourlyStats {
  hour: number;
  flights: number;
  delayed: number;
  cancelled: number;
  avg_delay: number | null;
}

// Daily statistics (for busiest/worst days)
export interface DailyStats {
  flight_date: string;
  flights: number;
  cancelled: number;
  landed?: number;
  cancel_pct?: number;
  total_flights?: number;
}

// Route statistics
export interface RouteStats {
  route: string;
  departure_airport: string;
  arrival_airport: string;
  flights: number;
  delayed: number;
  cancelled: number;
  avg_delay: number | null;
  max_delay: number | null;
  delay_pct: number | null;
  cancel_pct: number | null;
  reliability_score: number | null;
}

// Flight number statistics
export interface FlightNumberStats {
  flight_number: string;
  operated: number;
  delayed: number;
  cancelled: number;
  delay_pct: number | null;
  avg_delay: number | null;
  worst_delay: number | null;
}

// Aircraft usage statistics
export interface AircraftStats {
  aircraft_registration: string;
  aircraft_type: string | null;
  flights: number;
  cancelled: number;
  delayed: number;
  avg_delay: number | null;
}

// Top delay records
export interface DelayRecord {
  id: number;
  flight_number: string;
  flight_date: string;
  departure_airport: string;
  arrival_airport: string;
  delay_minutes: number;
}

// Daily OTP (On-Time Performance)
export interface DailyOtpStats {
  flight_date: string;
  flights: number;
  cancelled: number;
  with_outcome: number;
  on_time: number;
  otp_pct: number | null;
  cancel_pct: number | null;
}

// Monthly breakdown statistics
export interface MonthlyStats {
  month: string;
  month_sort: string;
  flights: number;
  cancelled: number;
  cancel_pct: number | null;
  avg_delay: number | null;
}

// Weather band statistics
export interface WeatherBandStats {
  band: string;
  band_min: number;
  flights: number;
  delayed: number;
  cancelled: number;
  delay_pct: number | null;
  avg_delay: number | null;
  [key: string]: string | number | null | undefined;
}

// Weather code statistics
export interface WeatherCodeStats {
  weather_code: number | null;
  flights: number;
  delayed: number;
  cancelled: number;
  delay_pct: number | null;
  avg_delay: number | null;
  [key: string]: string | number | null | undefined;
}

// Crosswind band statistics
export interface CrosswindStats {
  xw_band: string;
  band_min: number;
  flights: number;
  delayed: number;
  cancelled: number;
  delay_pct: number | null;
  avg_delay: number | null;
  [key: string]: string | number | null | undefined;
}

// Worst weather days
export interface WorstWeatherDay {
  flight_date: string;
  flights: number;
  cancelled: number;
  delayed: number;
  avg_delay: number | null;
  wind_kn: number | null;
  wind_dir: number | null;
  precip_mm: number | null;
  vis_km: number | null;
}

// Delay impact summary
export interface DelayImpact {
  total_delay_mins: number | null;
  flights_delayed_gt5: number;
  total_delay_mins_gt5: number;
  operated: number;
  total: number;
  cancelled: number;
  avg_delay_when_delayed: number | null;
  avg_delay_all_operated: number | null;
  pax_weighted_delay_mins: number | null;
}

// Worst delay days
export interface WorstDelayDay {
  flight_date: string;
  flights: number;
  total_delay_mins: number;
  avg_delay: number | null;
  pax_weighted_delay_mins: number | null;
}

// Filter options
export interface FilterOptions {
  availableYears: number[];
  availableAirlines: string[];
  availableRoutes: Array<{
    departure: string;
    arrival: string;
    key: string;
  }>;
}

// Available year
export interface AvailableYear {
  year: number;
}

// Available airline
export interface AvailableAirline {
  code: string;
}

// Available route
export interface AvailableRoute {
  departure_airport: string;
  arrival_airport: string;
  route_key: string;
}
