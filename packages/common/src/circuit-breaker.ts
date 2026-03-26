/** Configuration options for the circuit breaker */
export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit (default: 5) */
  threshold: number;
  /** Time in milliseconds before attempting to reset (default: 60000) */
  resetTimeoutMs: number;
  /** Service name for logging */
  serviceName: string;
}

/** State of the circuit breaker */
export interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number | null;
  isOpen: boolean;
}

/**
 * Circuit breaker pattern implementation for handling transient failures.
 * After a threshold of failures, the circuit opens and operations are skipped
 * until the reset timeout has passed.
 */
export class CircuitBreaker {
  private failures: number;
  private lastFailureTime: number | null;
  private isOpen: boolean;
  private readonly threshold: number;
  private readonly resetTimeoutMs: number;
  private readonly serviceName: string;

  constructor(config: CircuitBreakerConfig) {
    this.threshold = config.threshold;
    this.resetTimeoutMs = config.resetTimeoutMs;
    this.serviceName = config.serviceName;
    this.failures = 0;
    this.lastFailureTime = null;
    this.isOpen = false;
  }

  /**
   * Checks if the circuit breaker allows operations to proceed.
   * If the circuit is open but the reset timeout has passed, it will reset and allow.
   * @returns True if operations should proceed, false if they should be skipped
   */
  check(): boolean {
    if (this.isOpen) {
      const now = Date.now();
      if (this.lastFailureTime && now - this.lastFailureTime > this.resetTimeoutMs) {
        this.isOpen = false;
        this.failures = 0;
        console.log(`[${this.serviceName}] Circuit breaker reset, resuming operations`);
        return true;
      }
      console.log(`[${this.serviceName}] Circuit breaker is OPEN, skipping operation`);
      return false;
    }
    return true;
  }

  /**
   * Records a failure. If failures reach the threshold, the circuit opens.
   */
  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.threshold) {
      this.isOpen = true;
      console.error(`[${this.serviceName}] Circuit breaker OPENED after ${this.failures} failures`);
    }
  }

  /**
   * Records a success. Decrements the failure count (with a floor of 0).
   */
  recordSuccess(): void {
    if (this.failures > 0) {
      this.failures = Math.max(0, this.failures - 1);
    }
  }

  /**
   * Gets the current state of the circuit breaker.
   * @returns The current state
   */
  getState(): CircuitBreakerState {
    return {
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      isOpen: this.isOpen,
    };
  }

  /**
   * Manually resets the circuit breaker to closed state.
   */
  reset(): void {
    this.isOpen = false;
    this.failures = 0;
    this.lastFailureTime = null;
    console.log(`[${this.serviceName}] Circuit breaker manually reset`);
  }
}

/**
 * Environment variable names for circuit breaker configuration
 */
export const CIRCUIT_BREAKER_ENV = {
  /** Environment variable for failure threshold */
  THRESHOLD: 'CIRCUIT_BREAKER_THRESHOLD',
  /** Environment variable for reset timeout in milliseconds */
  RESET_MS: 'CIRCUIT_BREAKER_RESET_MS',
  /** Environment variable for scraper-specific failure threshold */
  SCRAPER_THRESHOLD: 'SCRAPER_CIRCUIT_BREAKER_THRESHOLD',
  /** Environment variable for scraper-specific reset timeout */
  SCRAPER_RESET_MS: 'SCRAPER_CIRCUIT_BREAKER_RESET_MS',
} as const;

/**
 * Creates a CircuitBreaker instance from environment variables with defaults.
 * @param serviceName - The service name for logging
 * @param defaultThreshold - Default failure threshold (default: 5)
 * @param defaultResetMs - Default reset timeout in ms (default: 60000)
 * @returns A configured CircuitBreaker instance
 */
export function createCircuitBreakerFromEnv(
  serviceName: string,
  defaultThreshold = 5,
  defaultResetMs = 60000,
): CircuitBreaker {
  const threshold = parseInt(
    process.env[CIRCUIT_BREAKER_ENV.SCRAPER_THRESHOLD] ??
      process.env[CIRCUIT_BREAKER_ENV.THRESHOLD] ??
      String(defaultThreshold),
    10,
  );

  const resetTimeoutMs = parseInt(
    process.env[CIRCUIT_BREAKER_ENV.SCRAPER_RESET_MS] ??
      process.env[CIRCUIT_BREAKER_ENV.RESET_MS] ??
      String(defaultResetMs),
    10,
  );

  return new CircuitBreaker({
    serviceName,
    threshold,
    resetTimeoutMs,
  });
}
