import { describe, it, expect } from 'vitest';
import { parsePagination } from './server/debug-helpers';

describe('parsePagination', () => {
  it('returns defaults when no params provided', () => {
    const params = new URLSearchParams();
    const { limit, offset } = parsePagination(params);
    expect(limit).toBe(100);
    expect(offset).toBe(0);
  });

  it('parses custom limit', () => {
    const params = new URLSearchParams('limit=50');
    const { limit } = parsePagination(params);
    expect(limit).toBe(50);
  });

  it('caps limit at max (default 1000)', () => {
    const params = new URLSearchParams('limit=5000');
    const { limit } = parsePagination(params);
    expect(limit).toBe(1000);
  });

  it('respects custom default and max', () => {
    const params = new URLSearchParams();
    const { limit } = parsePagination(params, { defaultLimit: 50, maxLimit: 200 });
    expect(limit).toBe(50);

    const params2 = new URLSearchParams('limit=500');
    const { limit: capped } = parsePagination(params2, { defaultLimit: 50, maxLimit: 200 });
    expect(capped).toBe(200);
  });

  it('clamps limit to at least 1', () => {
    const params = new URLSearchParams('limit=0');
    const { limit } = parsePagination(params);
    expect(limit).toBe(1);

    const params2 = new URLSearchParams('limit=-5');
    const { limit: limit2 } = parsePagination(params2);
    expect(limit2).toBe(1);
  });

  it('parses offset', () => {
    const params = new URLSearchParams('offset=50');
    const { offset } = parsePagination(params);
    expect(offset).toBe(50);
  });

  it('clamps offset to at least 0', () => {
    const params = new URLSearchParams('offset=-10');
    const { offset } = parsePagination(params);
    expect(offset).toBe(0);
  });

  it('handles non-numeric values gracefully', () => {
    const params = new URLSearchParams('limit=abc&offset=xyz');
    const { limit, offset } = parsePagination(params);
    expect(limit).toBe(100); // falls back to default
    expect(offset).toBe(0);
  });
});
