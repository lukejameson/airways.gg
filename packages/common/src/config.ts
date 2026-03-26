/** Service name constants for use in logging and identification */
export const SERVICE_NAMES = {
  /** Guernsey Airport scraper service */
  GUERNSEY: 'guernsey',
  /** FlightRadar24 scraper service */
  FR24: 'fr24',
  /** Aircraft position tracking service */
  POSITION: 'position',
  /** Weather data service */
  WEATHER: 'weather',
  /** ADS-B registration lookup service */
  ADSB: 'adsb',
  /** Push notification service */
  NOTIFICATION: 'notification',
} as const;

/** Service name type for type safety */
export type ServiceName = typeof SERVICE_NAMES[keyof typeof SERVICE_NAMES];

/** Display names for services in logs */
export const SERVICE_DISPLAY_NAMES: Record<ServiceName, string> = {
  [SERVICE_NAMES.GUERNSEY]: 'Guernsey',
  [SERVICE_NAMES.FR24]: 'FR24',
  [SERVICE_NAMES.POSITION]: 'Position',
  [SERVICE_NAMES.WEATHER]: 'Weather',
  [SERVICE_NAMES.ADSB]: 'ADSB',
  [SERVICE_NAMES.NOTIFICATION]: 'Notification',
};

/** Common intervals used across services (in milliseconds) */
export const INTERVALS = {
  /** 1 minute */
  ONE_MINUTE: 60_000,
  /** 2 minutes */
  TWO_MINUTES: 2 * 60_000,
  /** 5 minutes */
  FIVE_MINUTES: 5 * 60_000,
  /** 10 minutes */
  TEN_MINUTES: 10 * 60_000,
  /** 15 minutes */
  FIFTEEN_MINUTES: 15 * 60_000,
  /** 30 minutes */
  THIRTY_MINUTES: 30 * 60_000,
  /** 1 hour */
  ONE_HOUR: 60 * 60_000,
  /** 6 hours */
  SIX_HOURS: 6 * 60 * 60_000,
  /** Default poll interval for live mode (2 minutes) */
  DEFAULT_LIVE_POLL: 2 * 60_000,
  /** Default idle interval (15 minutes) */
  DEFAULT_IDLE: 15 * 60_000,
} as const;

/** Environment variable names for common configuration */
export const ENV_VARS = {
  /** Scraper mode: 'live', 'backfill', 'link-only', etc. */
  SCRAPER_MODE: 'SCRAPER_MODE',
  /** Cutoff hour for sleep mode (0-23) */
  CUTOFF_HOUR: 'SCRAPER_CUTOFF_HOUR',
  /** Minutes before first flight to wake */
  WAKE_OFFSET_MINS: 'SCRAPER_WAKE_OFFSET_MINS',
  /** High frequency interval minutes */
  INTERVAL_HIGH_MINS: 'SCRAPER_INTERVAL_HIGH_MINS',
  /** Medium frequency interval minutes */
  INTERVAL_MEDIUM_MINS: 'SCRAPER_INTERVAL_MEDIUM_MINS',
  /** Low frequency interval minutes */
  INTERVAL_LOW_MINS: 'SCRAPER_INTERVAL_LOW_MINS',
  /** Idle interval minutes */
  INTERVAL_IDLE_MINS: 'SCRAPER_INTERVAL_IDLE_MINS',
  /** Tomorrow scrape interval minutes */
  INTERVAL_TOMORROW_MINS: 'SCRAPER_INTERVAL_TOMORROW_MINS',
  /** Backfill start date */
  BACKFILL_START_DATE: 'BACKFILL_START_DATE',
  /** Backfill end date */
  BACKFILL_END_DATE: 'BACKFILL_END_DATE',
  /** Position poll interval seconds */
  POSITION_INTERVAL_SECS: 'POSITION_INTERVAL_LIVE_SECS',
  /** Weather refresh interval ms */
  WEATHER_INTERVAL_MS: 'WEATHER_INTERVAL_MS',
  /** ADS-B poll interval ms */
  ADSB_INTERVAL_MS: 'ADSB_INTERVAL_MS',
  /** Notification poll interval ms */
  NOTIFY_POLL_INTERVAL_MS: 'NOTIFY_POLL_INTERVAL_MS',
  /** FR24 API token */
  FR24_API_TOKEN: 'FR24_API_TOKEN',
  /** VAPID public key for push notifications */
  VAPID_PUBLIC_KEY: 'VAPID_PUBLIC_KEY',
  /** VAPID private key for push notifications */
  VAPID_PRIVATE_KEY: 'VAPID_PRIVATE_KEY',
  /** VAPID subject for push notifications */
  VAPID_SUBJECT: 'VAPID_SUBJECT',
} as const;

/**
 * Helper to convert minutes to milliseconds
 * @param minutes - Number of minutes
 * @returns Milliseconds
 */
export function mins(minutes: number): number {
  return minutes * 60_000;
}

/**
 * Helper to convert seconds to milliseconds
 * @param seconds - Number of seconds
 * @returns Milliseconds
 */
export function secs(seconds: number): number {
  return seconds * 1_000;
}
