import { describe, it, expect } from 'vitest';
import { validateSqlQuery } from './server/debug-helpers';

describe('validateSqlQuery', () => {
  it('allows SELECT', () => {
    expect(validateSqlQuery('SELECT * FROM flights')).toEqual({ valid: true });
  });

  it('allows SELECT with uppercase columns', () => {
    expect(validateSqlQuery('SELECT ID, FLIGHT_NUMBER FROM flights')).toEqual({ valid: true });
  });

  it('allows SELECT with WHERE, JOIN, ORDER BY', () => {
    expect(validateSqlQuery(
      'SELECT f.*, w.temperature FROM flights f JOIN weather_data w ON f.departure_airport = w.airport_code WHERE f.flight_date = \'2026-01-01\' ORDER BY f.scheduled_departure',
    )).toEqual({ valid: true });
  });

  it('allows EXPLAIN', () => {
    expect(validateSqlQuery('EXPLAIN SELECT * FROM flights')).toEqual({ valid: true });
  });

  it('allows SHOW', () => {
    expect(validateSqlQuery('SHOW timezone')).toEqual({ valid: true });
  });

  it('allows DESCRIBE', () => {
    expect(validateSqlQuery('DESCRIBE flights')).toEqual({ valid: true });
  });

  it('allows WITH (CTE)', () => {
    expect(validateSqlQuery('WITH recent AS (SELECT * FROM flights LIMIT 10) SELECT * FROM recent')).toEqual({ valid: true });
  });

  it('rejects INSERT', () => {
    const result = validateSqlQuery('INSERT INTO flights (flight_number) VALUES (\'GR123\')');
    expect(result.valid).toBe(false);
    expect('error' in result).toBe(true);
    if (!result.valid) expect(result.error).toContain('INSERT');
  });

  it('rejects UPDATE', () => {
    const result = validateSqlQuery('UPDATE flights SET status = \'delayed\'');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('UPDATE');
  });

  it('rejects DELETE', () => {
    const result = validateSqlQuery('DELETE FROM flights');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('DELETE');
  });

  it('rejects DROP', () => {
    const result = validateSqlQuery('DROP TABLE flights');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('DROP');
  });

  it('rejects ALTER', () => {
    const result = validateSqlQuery('ALTER TABLE flights ADD COLUMN foo text');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('ALTER');
  });

  it('rejects TRUNCATE', () => {
    const result = validateSqlQuery('TRUNCATE flights');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('TRUNCATE');
  });

  it('rejects CREATE', () => {
    const result = validateSqlQuery('CREATE TABLE foo (id int)');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('CREATE');
  });

  it('rejects INSERT hidden inside SELECT (subquery injection attempt)', () => {
    // Keyword detection should catch INSERT even inside a SELECT
    const result = validateSqlQuery(
      "SELECT * FROM flights; INSERT INTO flights (flight_number) VALUES ('EVIL')",
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('INSERT');
  });

  it('rejects DROP hidden inside SELECT', () => {
    const result = validateSqlQuery(
      "SELECT * FROM flights WHERE 1=1; DROP TABLE flights",
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('DROP');
  });

  it('rejects empty string', () => {
    const result = validateSqlQuery('');
    expect(result.valid).toBe(false);
  });

  it('rejects unknown command', () => {
    const result = validateSqlQuery('GRANT ALL ON flights TO user');
    expect(result.valid).toBe(false);
  });

  it('allows lowercase select', () => {
    expect(validateSqlQuery('select * from flights')).toEqual({ valid: true });
  });

  it('allows mixed case select', () => {
    expect(validateSqlQuery('Select * From flights')).toEqual({ valid: true });
  });
});
