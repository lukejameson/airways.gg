import { getAirportsForNearestSearch } from '$lib/airports';

/**
 * Calculate distance between two lat/lon points using Haversine formula
 * @returns Distance in kilometers
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Find the nearest airport IATA code from a lat/lon using the known AIRPORTS table.
 * @returns IATA code or null if no airport within 30km
 */
export function nearestAirport(lat: number, lon: number): string | null {
  const airports = getAirportsForNearestSearch();
  if (airports.length === 0) return null;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const { iata, lat: aLat, lon: aLon } of airports) {
    const d = calculateDistance(lat, lon, aLat, aLon);
    if (d < bestDist) { bestDist = d; best = iata; }
  }
  // Only trust if within 30 km of a known airport
  return bestDist < 30 ? best : null;
}

/**
 * Get compass direction from degrees (0-360)
 */
export function compassDir(deg: number | null): string {
  if (deg == null) return '—';
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

/**
 * Calculate flight progress percentage based on position
 */
export function getProgressPercentage(
  position: { lat: number; lon: number } | null,
  depCoords: [number, number] | null,
  arrCoords: [number, number] | null
): number {
  if (!position || !depCoords || !arrCoords) return 0;
  const totalDistance = calculateDistance(depCoords[0], depCoords[1], arrCoords[0], arrCoords[1]);
  const currentDistance = calculateDistance(position.lat, position.lon, arrCoords[0], arrCoords[1]);
  return Math.max(0, Math.min(100, Math.round((1 - currentDistance / totalDistance) * 100)));
}
