export const ROUTE_FLIGHT_MINUTES: Record<string, number> = {
  ACI: 10,
  JER: 15,
  LGW: 55,
  LCY: 55,
  MAN: 60,
  BRS: 40,
  SOU: 30,
  EXT: 40,
  BHX: 65,
  CDG: 45,
  EMA: 65,
  DUB: 60,
  EDI: 75,
};

export function routeFlightMinutes(iata: string): number {
  return ROUTE_FLIGHT_MINUTES[iata] ?? 60;
}

export const LOCATION_TO_IATA: Record<string, string> = {
  'Alderney': 'ACI',
  'Jersey': 'JER',
  'London Gatwick': 'LGW',
  'Gatwick': 'LGW',
  'London City': 'LCY',
  'Manchester': 'MAN',
  'Bristol': 'BRS',
  'Bristol, Exeter': 'BRS',
  'Exeter, Bristol': 'BRS',
  'Exeter': 'EXT',
  'Birmingham': 'BHX',
  'Southampton': 'SOU',
  'Paris': 'CDG',
  'Paris - Charles De Gaulle': 'CDG',
  'Paris Charles De Gaulle': 'CDG',
  'East Midlands': 'EMA',
  'Dublin': 'DUB',
  'Edinburgh': 'EDI',
  'Guernsey': 'GCI',
};

export function locationToIata(location: string): string {
  if (LOCATION_TO_IATA[location]) return LOCATION_TO_IATA[location];
  for (const [name, iata] of Object.entries(LOCATION_TO_IATA)) {
    if (location.toLowerCase().includes(name.toLowerCase())) return iata;
  }
  return location.slice(0, 10).toUpperCase().replace(/\s+/g, '');
}
