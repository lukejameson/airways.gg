import { writable, derived } from 'svelte/store';

export type AirportInfo = {
  iataCode: string;
  icaoCode: string | null;
  name: string;
  displayName: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
};

const airportsStore = writable<Record<string, AirportInfo>>({});

export function initAirports(data: Record<string, AirportInfo>) {
  airportsStore.set(data);
}

export const AIRPORTS = derived(airportsStore, $a => $a);

export function airportName(iata: string): string {
  let name = iata;
  const unsub = airportsStore.subscribe(a => {
    const airport = a[iata];
    name = airport?.displayName ?? airport?.name ?? iata;
  });
  unsub();
  return name;
}

export function airportLabel(iata: string): { name: string; code: string } {
  let name = iata;
  const unsub = airportsStore.subscribe(a => {
    const airport = a[iata];
    name = airport?.displayName ?? airport?.name ?? iata;
  });
  unsub();
  return { name, code: iata };
}

export function getAirportCoords(iata: string): [number, number] | null {
  let coords: [number, number] | null = null;
  const unsub = airportsStore.subscribe(a => {
    const airport = a[iata];
    if (airport?.latitude != null && airport?.longitude != null) {
      coords = [airport.latitude, airport.longitude];
    }
  });
  unsub();
  return coords;
}

export function getAirportsForNearestSearch(): Array<{ iata: string; lat: number; lon: number }> {
  const result: Array<{ iata: string; lat: number; lon: number }> = [];
  const unsub = airportsStore.subscribe(a => {
    for (const [iata, info] of Object.entries(a)) {
      if (info.latitude != null && info.longitude != null) {
        result.push({ iata, lat: info.latitude, lon: info.longitude });
      }
    }
  });
  unsub();
  return result;
}
