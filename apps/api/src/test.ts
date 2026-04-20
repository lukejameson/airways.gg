import * as dotenv from 'dotenv';
dotenv.config();

import type { TestResult, ComparisonResult } from './test/types';

const API_BASE = process.env.API_URL || 'http://localhost:3001';
const WEB_BASE = process.env.WEB_URL || 'http://localhost:5173';

async function fetchJson(url: string, options?: RequestInit) {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { status: res.status, data: null, isHtml: true };
    }
    const data = await res.json();
    return { status: res.status, data, isHtml: false };
  } catch (err) {
    return { status: 0, data: null, isHtml: true, error: String(err) };
  }
}

async function fetchSvelteKitData(path: string) {
  try {
    const res = await fetch(`${WEB_BASE}${path}/__data.json`);
    if (!res.ok) return { success: false, data: null };
    
    const json = await res.json();
    if (json.type === 'data' && json.nodes && json.nodes[0]?.data) {
      return { success: true, data: json.nodes[0].data };
    }
    return { success: false, data: null };
  } catch {
    return { success: false, data: null };
  }
}

function compareValues(api: unknown, web: unknown, path: string): ComparisonResult[] {
  const results: ComparisonResult[] = [];
  
  if (api === web) {
    results.push({ field: path, apiValue: api, webValue: web, match: true });
    return results;
  }
  
  if (api === null || api === undefined) {
    results.push({ field: path, apiValue: api, webValue: web, match: false, note: 'API is null/undefined' });
    return results;
  }
  
  if (web === null || web === undefined) {
    results.push({ field: path, apiValue: api, webValue: web, match: false, note: 'Web is null/undefined' });
    return results;
  }
  
  const apiType = typeof api;
  const webType = typeof web;
  
  if (apiType !== webType) {
    results.push({ field: path, apiValue: api, webValue: web, match: false, note: `Type mismatch: ${apiType} vs ${webType}` });
    return results;
  }
  
  if (apiType === 'number' || apiType === 'string' || apiType === 'boolean') {
    results.push({ field: path, apiValue: api, webValue: web, match: String(api) === String(web) });
    return results;
  }
  
  if (Array.isArray(api) && Array.isArray(web)) {
    if (api.length !== web.length) {
      results.push({ field: path + '.length', apiValue: api.length, webValue: web.length, match: false, note: 'Array length mismatch' });
    }
    const minLen = Math.min(api.length, web.length);
    for (let i = 0; i < minLen; i++) {
      results.push(...compareValues(api[i], web[i], `${path}[${i}]`));
    }
    return results;
  }
  
  if (typeof api === 'object' && typeof web === 'object') {
    const apiObj = api as Record<string, unknown>;
    const webObj = web as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(apiObj), ...Object.keys(webObj)]);
    
    for (const key of allKeys) {
      if (!(key in apiObj)) {
        results.push({ field: path + '.' + key, apiValue: undefined, webValue: webObj[key], match: false, note: 'Key only in web' });
      } else if (!(key in webObj)) {
        results.push({ field: path + '.' + key, apiValue: apiObj[key], webValue: undefined, match: false, note: 'Key only in API' });
      } else {
        results.push(...compareValues(apiObj[key], webObj[key], `${path}.${key}`));
      }
    }
    return results;
  }
  
  results.push({ field: path, apiValue: api, webValue: web, match: false });
  return results;
}

function normalizeFlight(flight: any) {
  return {
    id: flight.id,
    flightNumber: flight.flightNumber,
    departureAirport: flight.departureAirport,
    arrivalAirport: flight.arrivalAirport,
    scheduledDeparture: flight.scheduledDeparture,
    scheduledArrival: flight.scheduledArrival,
    actualDeparture: flight.actualDeparture,
    actualArrival: flight.actualArrival,
    status: flight.status,
    canceled: flight.canceled,
    aircraftType: flight.aircraftType,
    delayMinutes: flight.delayMinutes,
    flightDate: flight.flightDate,
  };
}

async function testFlightBoard(date: string): Promise<TestResult> {
  const result: TestResult = { name: `Flight Board - ${date}`, passed: true, comparisons: [] };
  
  const [apiRes, webDataResult] = await Promise.all([
    fetchJson(`${API_BASE}/flights?date=${date}`),
    fetchSvelteKitData('/'),
  ]);
  
  if (apiRes.error) {
    result.passed = false;
    result.error = apiRes.error;
    return result;
  }
  
  if (apiRes.isHtml || apiRes.status !== 200) {
    result.passed = false;
    result.error = `API error: ${apiRes.status}`;
    return result;
  }
  
  const apiData = apiRes.data;
  
  result.comparisons!.push(...compareValues(Array.isArray(apiData.flights), true, 'flights.isArray'));
  result.comparisons!.push(...compareValues(apiData.displayDate, date, 'displayDate'));
  
  if (apiData.flights?.length > 0) {
    const sample = normalizeFlight(apiData.flights[0]);
    result.comparisons!.push(...compareValues(typeof sample.id, 'number', 'sampleFlight.id.type'));
    result.comparisons!.push(...compareValues(typeof sample.flightNumber, 'string', 'sampleFlight.flightNumber.type'));
    result.comparisons!.push(...compareValues(sample.departureAirport?.length, 3, 'sampleFlight.departureAirport.length'));
    result.comparisons!.push(...compareValues(sample.arrivalAirport?.length, 3, 'sampleFlight.arrivalAirport.length'));
  }
  
  result.comparisons!.push(...compareValues(typeof apiData.weather, 'object', 'weather.type'));
  result.comparisons!.push(...compareValues(typeof apiData.weatherMap, 'object', 'weatherMap.type'));
  result.comparisons!.push(...compareValues(typeof apiData.daylightMap, 'object', 'daylightMap.type'));
  const nonMatching = result.comparisons!.filter(c => !c.match);
  result.passed = nonMatching.length === 0;
  
  return result;
}

async function testFlightDetail(id: number): Promise<TestResult> {
  const result: TestResult = { name: `Flight Detail - ID ${id}`, passed: true, comparisons: [] };
  
  const [apiRes, webDataResult] = await Promise.all([
    fetchJson(`${API_BASE}/flights/${id}`),
    fetchSvelteKitData(`/flights/${id}`),
  ]);
  
  if (apiRes.error || apiRes.isHtml || apiRes.status !== 200) {
    result.passed = false;
    result.error = apiRes.error || `API ${apiRes.status}`;
    return result;
  }
  
  const apiData = apiRes.data;
  
  result.comparisons!.push(...compareValues(typeof apiData.flight, 'object', 'flight.type'));
  result.comparisons!.push(...compareValues(apiData.flight?.id, id, 'flight.id'));
  result.comparisons!.push(...compareValues(typeof apiData.flight?.flightNumber, 'string', 'flight.flightNumber.type'));
  result.comparisons!.push(...compareValues(Array.isArray(apiData.statusHistory), true, 'statusHistory.isArray'));
  result.comparisons!.push(...compareValues(typeof apiData.weatherMap, 'object', 'weatherMap.type'));
  result.comparisons!.push(...compareValues(typeof apiData.daylightMap, 'object', 'daylightMap.type'));
  result.comparisons!.push(...compareValues(typeof apiData.position, 'object', 'position.type (nullable)'));
  result.comparisons!.push(...compareValues(Array.isArray(apiData.rotationFlights), true, 'rotationFlights.isArray'));
  result.comparisons!.push(...compareValues(Array.isArray(apiData.times), true, 'times.isArray'));
  
  if (webDataResult.success && webDataResult.data?.flight) {
    result.comparisons!.push(...compareValues(
      apiData.flight?.id,
      webDataResult.data.flight?.id,
      'flight.id (web comparison)'
    ));
  }
  
  const nonMatching = result.comparisons!.filter(c => !c.match && !c.note?.includes('web comparison'));
  result.passed = nonMatching.length === 0;
  
  return result;
}

async function testSearch(params: Record<string, string>): Promise<TestResult> {
  const paramStr = new URLSearchParams(params).toString();
  const result: TestResult = { name: `Search - ${params.q || params.from || params.to || 'empty'}`, passed: true, comparisons: [] };
  
  const apiRes = await fetchJson(`${API_BASE}/flights/search?${paramStr}`);
  
  if (apiRes.error || apiRes.isHtml || apiRes.status !== 200) {
    result.passed = false;
    result.error = apiRes.error || `API ${apiRes.status}`;
    return result;
  }
  
  const apiData = apiRes.data;
  
  result.comparisons!.push(...compareValues(Array.isArray(apiData.results), true, 'results.isArray'));
  result.comparisons!.push(...compareValues(apiData.query, params.q || '', 'query echo'));
  result.comparisons!.push(...compareValues(apiData.from, params.from || '', 'from echo'));
  result.comparisons!.push(...compareValues(apiData.to, params.to || '', 'to echo'));
  
  if (apiData.results?.length > 0) {
    const sample = normalizeFlight(apiData.results[0]);
    result.comparisons!.push(...compareValues(typeof sample.id, 'number', 'sampleResult.id.type'));
    result.comparisons!.push(...compareValues(sample.departureAirport?.length, 3, 'sampleResult.departureAirport.length'));
  }
  
  const nonMatching = result.comparisons!.filter(c => !c.match);
  result.passed = nonMatching.length === 0;
  
  return result;
}

async function testAirportWeather(code: string): Promise<TestResult> {
  const result: TestResult = { name: `Airport Weather - ${code}`, passed: true, comparisons: [] };
  
  const apiRes = await fetchJson(`${API_BASE}/airports/${code}/weather`);
  
  if (apiRes.error || apiRes.isHtml || apiRes.status !== 200) {
    result.passed = false;
    result.error = apiRes.error || `API ${apiRes.status}`;
    return result;
  }
  
  const data = apiRes.data;
  result.comparisons!.push(...compareValues(data.airportCode, code.toUpperCase(), 'airportCode'));
  result.comparisons!.push(...compareValues(typeof data.timestamp, 'string', 'timestamp.type'));
  const tempType = data.temperature === null ? 'null' : typeof data.temperature;
  result.comparisons!.push(...compareValues(tempType === 'null' || tempType === 'number', true, 'temperature.type (null|number)'));
  result.comparisons!.push(...compareValues(typeof data.windSpeed, 'number', 'windSpeed.type'));
  result.comparisons!.push(...compareValues(typeof data.windDirection, 'number', 'windDirection.type'));
  result.comparisons!.push(...compareValues(typeof data.weatherCode, 'number', 'weatherCode.type'));
  
  const nonMatching = result.comparisons!.filter(c => !c.match);
  result.passed = nonMatching.length === 0;
  
  return result;
}

async function testApnsEndpoints(): Promise<TestResult> {
  const result: TestResult = { name: 'APNs Push Endpoints', passed: true, comparisons: [] };
  
  const testToken = 'test_token_' + Date.now();
  const testFlightId = 38310;
  const testFlightCode = 'GR671';
  const testFlightDate = new Date().toISOString().split('T')[0];
  
  const subscribeRes = await fetchJson(`${API_BASE}/push/apns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceToken: testToken,
      flightId: testFlightId,
      flightCode: testFlightCode,
      flightDate: testFlightDate,
    }),
  });
  
  result.comparisons!.push(...compareValues(subscribeRes.status, 200, 'subscribe.status'));
  result.comparisons!.push(...compareValues(subscribeRes.data?.ok, true, 'subscribe.ok'));
  
  const checkRes = await fetchJson(`${API_BASE}/push/apns/check/${testFlightId}?token=${testToken}`);
  result.comparisons!.push(...compareValues(checkRes.status, 200, 'check.status'));
  result.comparisons!.push(...compareValues(checkRes.data?.subscribed, true, 'check.subscribed'));
  
  const unsubscribeRes = await fetchJson(`${API_BASE}/push/apns`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceToken: testToken,
      flightId: testFlightId,
    }),
  });
  
  result.comparisons!.push(...compareValues(unsubscribeRes.status, 200, 'unsubscribe.status'));
  result.comparisons!.push(...compareValues(unsubscribeRes.data?.ok, true, 'unsubscribe.ok'));
  
  const checkAfterRes = await fetchJson(`${API_BASE}/push/apns/check/${testFlightId}?token=${testToken}`);
  result.comparisons!.push(...compareValues(checkAfterRes.data?.subscribed, false, 'checkAfter.subscribed'));
  
  const nonMatching = result.comparisons!.filter(c => !c.match);
  result.passed = nonMatching.length === 0;
  
  return result;
}

async function main() {
  console.log('=== Airways API vs Web Data Comparison Tests ===\n');
  console.log('API base: ' + API_BASE);
  console.log('Web base: ' + WEB_BASE + '\n');

  const results: TestResult[] = [];
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  console.log('Running comparison tests...\n');

  results.push(await testFlightBoard(today));
  results.push(await testFlightBoard(tomorrow));

  const boardRes = await fetchJson(`${API_BASE}/flights?date=${today}`);
  const flights = (boardRes.data as any)?.flights || [];
  if (flights.length > 0) {
    results.push(await testFlightDetail(flights[0].id));
  }

  results.push(await testSearch({ q: 'GR' }));
  results.push(await testSearch({ from: 'GCI' }));
  results.push(await testSearch({ to: 'LGW' }));
  results.push(await testSearch({ date: today }));
  results.push(await testSearch({ q: 'GR', from: 'GCI', date: today }));

  results.push(await testAirportWeather('GCI'));
  results.push(await testAirportWeather('LGW'));
  results.push(await testAirportWeather('JER'));

  results.push(await testApnsEndpoints());

  console.log('\n=== Test Results ===\n');
  
  let passedCount = 0;
  let failedCount = 0;
  let totalComparisons = 0;
  let matchingComparisons = 0;

  for (const test of results) {
    const status = test.passed ? 'PASS' : 'FAIL';
    console.log(status + ' ' + test.name);
    if (test.error) {
      console.log('   Error: ' + test.error);
    }
    if (test.comparisons) {
      for (const comp of test.comparisons) {
        totalComparisons++;
        if (comp.match) matchingComparisons++;
        const icon = comp.match ? '✓' : '✗';
        console.log(`   ${icon} ${comp.field}: API=${JSON.stringify(comp.apiValue)} WEB=${JSON.stringify(comp.webValue)}${comp.note ? ' (' + comp.note + ')' : ''}`);
      }
    }
    console.log('');
    
    if (test.passed) passedCount++;
    else failedCount++;
  }

  const matchPercent = totalComparisons > 0 ? ((matchingComparisons / totalComparisons) * 100).toFixed(1) : '0';
  console.log('=== Summary: ' + passedCount + ' tests passed, ' + failedCount + ' tests failed ===');
  console.log('=== Data Match: ' + matchingComparisons + '/' + totalComparisons + ' (' + matchPercent + '%) ===\n');
  
  process.exit(failedCount > 0 ? 1 : 0);
}

main().catch(console.error);
