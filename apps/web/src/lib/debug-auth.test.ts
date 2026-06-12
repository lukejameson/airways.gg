import { describe, it, expect } from 'vitest';
import { validateDebugToken } from './server/debug-helpers';

describe('validateDebugToken', () => {
  const token = 'test-token-abc123';

  it('returns true for valid Bearer token', () => {
    expect(validateDebugToken('Bearer test-token-abc123', token)).toBe(true);
  });

  it('returns false for wrong token', () => {
    expect(validateDebugToken('Bearer wrong-token', token)).toBe(false);
  });

  it('returns false for missing Authorization header', () => {
    expect(validateDebugToken(null, token)).toBe(false);
  });

  it('returns false for missing expected token (env not set)', () => {
    expect(validateDebugToken('Bearer some-token', undefined)).toBe(false);
    expect(validateDebugToken(null, undefined)).toBe(false);
  });

  it('returns false for empty Authorization header', () => {
    expect(validateDebugToken('', token)).toBe(false);
  });

  it('returns false for non-Bearer auth scheme', () => {
    expect(validateDebugToken('Basic dGVzdDp0ZXN0', token)).toBe(false);
  });

  it('returns false for token with extra whitespace', () => {
    expect(validateDebugToken('Bearer  test-token-abc123', token)).toBe(false);
  });

  it('returns false for token without Bearer prefix', () => {
    expect(validateDebugToken('test-token-abc123', token)).toBe(false);
  });
});
