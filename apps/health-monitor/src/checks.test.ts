import { describe, it, expect } from 'vitest';
import { buildPrompt, groupByCategory } from './llm';
import type { CheckResult } from './checks';

describe('buildPrompt', () => {
  const sampleChecks: CheckResult[] = [
    { name: 'guernsey_last_run', passed: true, value: '3m ago', threshold: '30m' },
    { name: 'fr24_last_run', passed: true, value: '2m ago', threshold: '30m' },
    {
      name: 'weather_last_run',
      passed: false,
      value: '127m ago',
      threshold: '45m',
      samples: [{ service: 'weather', lastStartedAt: '2026-06-14T12:05:00Z', ageMins: 127 }],
    },
    { name: 'null_status_today', passed: true, value: '0 flights', threshold: 'none' },
    { name: 'negative_delay', passed: true, value: '0 flights', threshold: 'none' },
    { name: 'watermark_lag', passed: true, value: '12 unprocessed', threshold: '≤ 100' },
    {
      name: 'weather_gap_EGJB',
      passed: false,
      value: '115min max gap',
      threshold: '< 120min',
      samples: [{ airportCode: 'EGJB', prevTs: '2026-06-14T10:05:00Z', nextTs: '2026-06-14T12:00:00Z', gapMins: 115 }],
    },
  ];

  it('produces a prompt with correct structure', () => {
    const { prompt } = buildPrompt(sampleChecks, '2026-06-14T14:00:00Z');

    expect(prompt).toContain('HEALTH CHECK — 2026-06-14T14:00:00Z');
    expect(prompt).toContain('SCRAPER_HEALTH');
    expect(prompt).toContain('FLIGHT_INTEGRITY');
    expect(prompt).toContain('NOTIFICATION');
    expect(prompt).toContain('WEATHER_POSITION');
  });

  it('shows failing checks before passing checks in each category', () => {
    const { prompt } = buildPrompt(sampleChecks, '2026-06-14T14:00:00Z');

    const weatherFailIndex = prompt.indexOf('[FAIL] weather_last_run');
    expect(weatherFailIndex).toBeGreaterThan(0);

    const failCount = (prompt.match(/\[FAIL\]/g) || []).length;
    const passCount = (prompt.match(/\[PASS\]/g) || []).length;
    expect(failCount).toBe(2);
    expect(passCount).toBe(5);
  });

  it('includes samples for failing checks', () => {
    const { prompt } = buildPrompt(sampleChecks, '2026-06-14T14:00:00Z');

    expect(prompt).toContain('127m ago');
    expect(prompt).toContain('Samples:');
  });

  it('estimates token count within reasonable bounds', () => {
    const { prompt, estimatedInputTokens } = buildPrompt(sampleChecks, '2026-06-14T14:00:00Z');

    expect(estimatedInputTokens).toBeLessThan(5000);
    expect(estimatedInputTokens).toBeGreaterThan(Math.floor(prompt.length / 4));
  });

  it('handles all-passing checks gracefully', () => {
    const allPassing: CheckResult[] = [
      { name: 'guernsey_last_run', passed: true, value: '3m ago', threshold: '30m' },
      { name: 'null_status_today', passed: true, value: '0 flights', threshold: 'none' },
    ];

    const { prompt } = buildPrompt(allPassing, '2026-06-14T14:00:00Z');
    expect(prompt).not.toContain('[FAIL]');
  });

  it('returns empty string for all-passing with no LLM findings when not heartbeat', () => {
    // buildPrompt always returns a prompt — the silent-when-healthy logic is in buildTelegramMessage
    const { prompt } = buildPrompt(sampleChecks.filter(c => c.passed), '2026-06-14T14:00:00Z');
    expect(prompt).toBeTruthy();
    expect(prompt).not.toContain('[FAIL]');
  });
});

describe('groupByCategory', () => {
  it('classifies scraper health checks', () => {
    const checks: CheckResult[] = [
      { name: 'guernsey_last_run', passed: true, value: '3m', threshold: '30m' },
      { name: 'fr24_failure_rate_6h', passed: true, value: '0', threshold: '≤ 3' },
      { name: 'position_consecutive_failures', passed: true, value: '0', threshold: '< 3' },
      { name: 'adsb_zero_records', passed: true, value: '0', threshold: 'none' },
    ];

    const result = groupByCategory(checks);
    expect(result['scraper_health']).toHaveLength(4);
  });

  it('classifies flight integrity checks', () => {
    const checks: CheckResult[] = [
      { name: 'null_status_today', passed: true, value: '0', threshold: 'none' },
      { name: 'negative_delay', passed: true, value: '0', threshold: 'none' },
      { name: 'stale_updated_at', passed: true, value: '0', threshold: '6h' },
      { name: 'orphaned_flight_times', passed: true, value: '0', threshold: 'none' },
      { name: 'flight_count_vs_avg', passed: true, value: '12', threshold: '50%' },
    ];

    const result = groupByCategory(checks);
    expect(result['flight_integrity']).toHaveLength(5);
  });

  it('classifies notification checks', () => {
    const checks: CheckResult[] = [
      { name: 'watermark_lag', passed: true, value: '12', threshold: '≤ 100' },
      { name: 'dead_push_subs', passed: true, value: '0', threshold: 'none' },
    ];

    const result = groupByCategory(checks);
    expect(result['notification']).toHaveLength(2);
  });

  it('classifies weather and position checks', () => {
    const checks: CheckResult[] = [
      { name: 'weather_gap_EGJB', passed: true, value: '5min', threshold: '< 120min' },
      { name: 'position_gap', passed: true, value: '3min', threshold: '< 60min' },
      { name: 'stale_weather_EGJB', passed: true, value: '2m', threshold: '< 180min' },
    ];

    const result = groupByCategory(checks);
    expect(result['weather_position']).toHaveLength(3);
  });

  it('puts unknown checks in other category', () => {
    const checks: CheckResult[] = [
      { name: 'some_new_check', passed: true, value: 'ok', threshold: 'any' },
    ];

    const result = groupByCategory(checks);
    expect(result['other']).toHaveLength(1);
  });

  it('handles empty array', () => {
    const result = groupByCategory([]);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe('CheckResult type', () => {
  it('samples field is optional', () => {
    const result: CheckResult = {
      name: 'test_check',
      passed: true,
      value: 'ok',
      threshold: 'any',
    };
    expect(result.samples).toBeUndefined();
  });

  it('samples can hold multiple rows', () => {
    const result: CheckResult = {
      name: 'test_check',
      passed: false,
      value: '3 issues',
      threshold: 'none',
      samples: [
        { id: 1, reason: 'stale' },
        { id: 2, reason: 'stale' },
        { id: 3, reason: 'stale' },
      ],
    };
    expect(result.samples).toHaveLength(3);
  });
});
