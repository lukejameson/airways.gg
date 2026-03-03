export interface Aircraft {
  registration: string;
  icao24: string;
  type: string;
}

// Aurigny ATR 72-600 fleet (all routes)
export const AURIGNY_FLEET: Aircraft[] = [
  { registration: 'G-ISLP', icao24: '408281', type: 'AT76' },
  { registration: 'G-OATR', icao24: '40782b', type: 'AT76' },
  { registration: 'G-OGFC', icao24: '40788c', type: 'AT76' },
  { registration: 'G-ORAI', icao24: '4078db', type: 'AT76' },
  { registration: 'G-PBOT', icao24: '408170', type: 'AT76' },
  { registration: 'G-PEMB', icao24: '40814a', type: 'AT76' },
  { registration: 'G-NETS', icao24: '408336', type: 'AT76' },
];
