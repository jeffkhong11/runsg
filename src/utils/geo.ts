// geo.ts — Geospatial utilities (Haversine, bounding box, centroid)

const EARTH_RADIUS_KM = 6371

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Haversine distance between two [lng, lat] coordinate pairs, in km.
 */
export function haversineKm(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number]
): number {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

/**
 * Compute total distance of a route from its GeoJSON coordinate array.
 * Coordinates are [lng, lat] pairs.
 */
export function computeRouteDistanceKm(coordinates: [number, number][]): number {
  let total = 0
  for (let i = 1; i < coordinates.length; i++) {
    total += haversineKm(coordinates[i - 1], coordinates[i])
  }
  return Math.round(total * 100) / 100
}

/**
 * Compute bounding box [south, west, north, east] from coordinate array.
 */
export function computeBounds(
  coordinates: [number, number][]
): [number, number, number, number] {
  let minLat = Infinity, maxLat = -Infinity
  let minLng = Infinity, maxLng = -Infinity
  for (const [lng, lat] of coordinates) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
  }
  return [minLat, minLng, maxLat, maxLng]
}

/**
 * Compute centroid [lat, lng] of a coordinate array.
 */
export function computeCentroid(coordinates: [number, number][]): [number, number] {
  const sumLat = coordinates.reduce((s, [, lat]) => s + lat, 0)
  const sumLng = coordinates.reduce((s, [lng]) => s + lng, 0)
  return [sumLat / coordinates.length, sumLng / coordinates.length]
}

/**
 * Distance from a point to the nearest coordinate in a route, in km.
 */
export function distanceToRoute(
  point: [number, number],
  coordinates: [number, number][]
): number {
  return Math.min(...coordinates.map((c) => haversineKm(point, c)))
}
