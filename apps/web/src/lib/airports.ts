export interface AirportInfo {
  name: string;       // Human-readable full name
  city: string;       // Short city name for compact display
  coords: [number, number]; // [lat, lon]
}

export const AIRPORTS: Record<string, AirportInfo> = {
  GCI: { name: 'Guernsey',              city: 'Guernsey',      coords: [49.4348, -2.5986] },
  JER: { name: 'Jersey',                city: 'Jersey',        coords: [49.2079, -2.1955] },
  ACI: { name: 'Alderney',              city: 'Alderney',      coords: [49.7061, -2.2147] },
  LGW: { name: 'London Gatwick',        city: 'London Gatwick',coords: [51.1481, -0.1903] },
  LCY: { name: 'London City',           city: 'London City',   coords: [51.5048,  0.0495] },
  MAN: { name: 'Manchester',            city: 'Manchester',    coords: [53.3537, -2.2750] },
  BRS: { name: 'Bristol',               city: 'Bristol',       coords: [51.3827, -2.7191] },
  BHX: { name: 'Birmingham',            city: 'Birmingham',    coords: [52.4539, -1.7480] },
  SOU: { name: 'Southampton',           city: 'Southampton',   coords: [50.9503, -1.3568] },
  EXT: { name: 'Exeter',                city: 'Exeter',        coords: [50.7344, -3.4139] },
  EMA: { name: 'East Midlands',         city: 'East Midlands', coords: [52.8311, -1.3280] },
  CDG: { name: 'Paris Charles de Gaulle', city: 'Paris',       coords: [49.0097,  2.5478] },
  DUB: { name: 'Dublin',                city: 'Dublin',        coords: [53.4213, -6.2700] },
  EDI: { name: 'Edinburgh',             city: 'Edinburgh',     coords: [55.9500, -3.3725] },
};

/**
 * Returns the human-readable city/name for an IATA code.
 * Falls back to the raw code if unknown.
 */
export function airportName(iata: string): string {
  return AIRPORTS[iata]?.name ?? iata;
}

/**
 * Returns a formatted label: "London Gatwick (LGW)"
 * with the code muted — for use in templates via the helper below.
 */
export function airportLabel(iata: string): { name: string; code: string } {
  return { name: AIRPORTS[iata]?.name ?? iata, code: iata };
}
