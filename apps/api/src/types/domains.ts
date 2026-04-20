export interface Flight {
  id: number;
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  scheduledDeparture: Date;
  scheduledArrival: Date;
  actualDeparture: Date | null;
  actualArrival: Date | null;
  status: string | null;
  canceled: boolean | null;
  aircraftType: string | null;
  delayMinutes: number | null;
  flightDate: string;
  estimatedDeparture?: string | null;
  estimatedArrival?: string | null;
}

export interface WeatherData {
  airportCode: string;
  timestamp: Date | string;
  temperature: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  weatherCode: number | null;
}

export interface DaylightData {
  airportCode: string;
  date: string;
  sunrise: Date;
  sunset: Date;
}

export interface FlightStatusHistoryEntry {
  id: number;
  flightCode: string;
  flightDate: string;
  statusTimestamp: Date;
  statusMessage: string;
  source: 'aurigny' | 'guernsey_airport' | 'fr24';
  flightId: number | null;
  createdAt: Date;
}

export interface AircraftPosition {
  id: number;
  flightId: number | null;
  lat: number;
  lon: number;
  altitudeFt: number | null;
  groundSpeedKts: number | null;
  heading: number | null;
  positionTimestamp: Date;
}

export interface FlightTime {
  id: number;
  flightId: number;
  timeType: string;
  timeValue: Date;
}

export interface FlightBoardResult {
  flights: Flight[];
  weather: WeatherData | null;
  weatherMap: Record<string, WeatherData[]>;
  daylightMap: Record<string, DaylightData[]>;
  lastUpdated: Date | null;
  displayDate: string;
  todayStr: string;
  tomorrowStr: string;
  autoAdvanced: boolean;
  recentlyViewed: RecentlyViewed[];
}

export interface RecentlyViewed {
  id: number;
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  scheduledDeparture: string;
  viewedAt: string;
}

export interface FlightDetailResult {
  flight: Flight;
  statusHistory: FlightStatusHistoryEntry[];
  weatherMap: Record<string, WeatherData>;
  daylightMap: Record<string, DaylightData[]>;
  position: AircraftPosition | null;
  rotationFlights: Omit<Flight, 'estimatedDeparture' | 'estimatedArrival'>[];
  times: FlightTime[];
}

export interface SearchResult {
  results: Flight[];
  query: string;
  date: string;
  from: string;
  to: string;
}
