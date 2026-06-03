// haversine.ts — Great-circle distance utility
// Used for "Near Me" proximity sorting (T-075) and amenity density (T-070)

/**
 * Calculate the great-circle distance in kilometers between two coordinates.
 * Input: decimal degrees. Uses the Haversine formula for spherical Earth.
 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371 // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * R * Math.asin(Math.sqrt(a))
}

/**
 * Calculate the centroid (average position) of a GeoJSON coordinate array [lng, lat].
 */
export function routeCentroid(coords: [number, number][]): [number, number] {
  if (coords.length === 0) return [103.8198, 1.3521] // SG default
  const lngSum = coords.reduce((s, c) => s + c[0], 0)
  const latSum = coords.reduce((s, c) => s + c[1], 0)
  return [lngSum / coords.length, latSum / coords.length]
}
