import { describe, it, expect } from 'vitest';
import { isDaytime, getWeatherIconName } from './daylight';

describe('isDaytime', () => {
  const sunrise = new Date('2024-06-15T05:00:00Z');
  const sunset = new Date('2024-06-15T21:00:00Z');

  it('returns true when timestamp is between sunrise and sunset', () => {
    const noon = new Date('2024-06-15T12:00:00Z');
    expect(isDaytime(sunrise, sunset, noon)).toBe(true);
  });

  it('returns true at exactly sunrise', () => {
    expect(isDaytime(sunrise, sunset, sunrise)).toBe(true);
  });

  it('returns false at exactly sunset', () => {
    expect(isDaytime(sunrise, sunset, sunset)).toBe(false);
  });

  it('returns false before sunrise', () => {
    const beforeSunrise = new Date('2024-06-15T03:00:00Z');
    expect(isDaytime(sunrise, sunset, beforeSunrise)).toBe(false);
  });

  it('returns false after sunset', () => {
    const afterSunset = new Date('2024-06-15T23:00:00Z');
    expect(isDaytime(sunrise, sunset, afterSunset)).toBe(false);
  });
});

describe('getWeatherIconName', () => {
  it('returns cloud for null weather code', () => {
    expect(getWeatherIconName(null, true)).toBe('cloud');
    expect(getWeatherIconName(null, false)).toBe('cloud');
  });

  it('returns sun for clear sky during day', () => {
    expect(getWeatherIconName(0, true)).toBe('sun');
  });

  it('returns moon for clear sky at night', () => {
    expect(getWeatherIconName(0, false)).toBe('moon');
  });

  it('returns sunCloud for partly cloudy during day', () => {
    expect(getWeatherIconName(1, true)).toBe('sunCloud');
    expect(getWeatherIconName(2, true)).toBe('sunCloud');
  });

  it('returns moonCloud for partly cloudy at night', () => {
    expect(getWeatherIconName(1, false)).toBe('moonCloud');
  });

  it('returns cloud for overcast', () => {
    expect(getWeatherIconName(3, true)).toBe('cloud');
    expect(getWeatherIconName(3, false)).toBe('cloud');
  });

  it('returns fog for fog/mist codes', () => {
    expect(getWeatherIconName(45, true)).toBe('fog');
    expect(getWeatherIconName(49, true)).toBe('fog');
  });

  it('returns cloudDrizzle for drizzle codes', () => {
    expect(getWeatherIconName(51, true)).toBe('cloudDrizzle');
    expect(getWeatherIconName(59, true)).toBe('cloudDrizzle');
  });

  it('returns cloudRain for rain codes', () => {
    expect(getWeatherIconName(61, true)).toBe('cloudRain');
    expect(getWeatherIconName(69, true)).toBe('cloudRain');
  });

  it('returns cloudSnow for snow codes', () => {
    expect(getWeatherIconName(71, true)).toBe('cloudSnow');
    expect(getWeatherIconName(79, true)).toBe('cloudSnow');
  });

  it('returns cloudShowers for shower codes', () => {
    expect(getWeatherIconName(80, true)).toBe('cloudShowers');
    expect(getWeatherIconName(86, true)).toBe('cloudShowers');
  });

  it('returns cloudBolt for thunderstorm codes', () => {
    expect(getWeatherIconName(95, true)).toBe('cloudBolt');
    expect(getWeatherIconName(99, true)).toBe('cloudBolt');
  });

  it('returns cloud for unknown high codes', () => {
    expect(getWeatherIconName(100, true)).toBe('cloud');
  });
});
