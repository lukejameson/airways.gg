import { describe, it, expect } from 'vitest';
import { canUpgradeStatus, isTerminalStatus } from './statusPriority';

describe('canUpgradeStatus', () => {
  it('allows upgrading from null to any status', () => {
    expect(canUpgradeStatus(null, 'Scheduled')).toBe(true);
    expect(canUpgradeStatus(null, 'Landed')).toBe(true);
  });

  it('returns false when newStatus is null or undefined', () => {
    expect(canUpgradeStatus('Scheduled', null)).toBe(false);
    expect(canUpgradeStatus('Scheduled', undefined)).toBe(false);
  });

  it('allows forward progression through the status ladder', () => {
    expect(canUpgradeStatus('Scheduled', 'Boarding')).toBe(true);
    expect(canUpgradeStatus('Boarding', 'Taxiing')).toBe(true);
    expect(canUpgradeStatus('Taxiing', 'Airborne')).toBe(true);
    expect(canUpgradeStatus('Airborne', 'Landed')).toBe(true);
  });

  it('blocks regression to lower priority status', () => {
    expect(canUpgradeStatus('Airborne', 'Scheduled')).toBe(false);
    expect(canUpgradeStatus('Landed', 'Delayed')).toBe(false);
    expect(canUpgradeStatus('Landed', 'Boarding')).toBe(false);
  });

  it('allows same-priority transitions', () => {
    expect(canUpgradeStatus('Landed', 'Cancelled')).toBe(true);
    expect(canUpgradeStatus('Cancelled', 'Landed')).toBe(true);
  });

  it('treats unknown statuses as priority 0', () => {
    expect(canUpgradeStatus('UnknownStatus', 'Scheduled')).toBe(true);
    expect(canUpgradeStatus('Landed', 'UnknownStatus')).toBe(false);
  });
});

describe('isTerminalStatus', () => {
  it('identifies terminal statuses correctly', () => {
    expect(isTerminalStatus('Landed')).toBe(true);
    expect(isTerminalStatus('Cancelled')).toBe(true);
    expect(isTerminalStatus('Diverted')).toBe(true);
  });

  it('returns false for non-terminal statuses', () => {
    expect(isTerminalStatus('Scheduled')).toBe(false);
    expect(isTerminalStatus('Boarding')).toBe(false);
    expect(isTerminalStatus('Airborne')).toBe(false);
    expect(isTerminalStatus('Delayed')).toBe(false);
  });

  it('returns false for null or undefined', () => {
    expect(isTerminalStatus(null)).toBe(false);
    expect(isTerminalStatus(undefined)).toBe(false);
  });
});
