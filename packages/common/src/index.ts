// Environment utilities
export { findEnvFile, loadEnv, type LoadEnvOptions } from './env.js';

// Timezone utilities
export {
  GY_TZ,
  guernseyHour,
  guernseyDateStr,
  guernseyTomorrowStr,
  nextGuernseyTime,
} from './timezone.js';

// Flight utilities
export {
  TERMINAL_STATUSES,
  isTerminalStatus,
  getActiveFlightsConditions,
  type TerminalStatus,
  type ActiveFlightsOptions,
  type ActiveFlightConditions,
} from './flights.js';

// Circuit breaker
export {
  CircuitBreaker,
  CIRCUIT_BREAKER_ENV,
  createCircuitBreakerFromEnv,
  type CircuitBreakerConfig,
  type CircuitBreakerState,
} from './circuit-breaker.js';

// Configuration constants and helpers
export {
  SERVICE_NAMES,
  SERVICE_DISPLAY_NAMES,
  INTERVALS,
  ENV_VARS,
  mins,
  secs,
  type ServiceName,
} from './config.js';

// Types
export type {
  LogLevel,
  HealthStatus,
  ScraperMode,
  SchedulerEventType,
  Result,
  SuccessResult,
  FailureResult,
  TimeEstimateType,
  PositionDirection,
  AircraftStatus,
  TimerState,
  ScraperLogEntry,
  FlightIdentifier,
  FlightTimeEstimates,
  ActiveFlightInfo,
  IntervalCalculation,
  SleepDecision,
  WakeTimeCalculation,
  AirborneEntry,
  ADSBAircraftInfo,
  NotificationType,
  PushNotification,
  WeatherData,
} from './types.js';

export { ServiceError, ValidationError, ConfigError } from './types.js';
