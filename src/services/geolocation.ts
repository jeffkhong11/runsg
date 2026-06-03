// geolocation.ts — "Near Me" geolocation proximity shelf (T-074, T-075, T-076)
// Requests user location once and injects a dynamically sorted "Nearest Runs to You" shelf.

import type { RouteIndexEntry } from '../types/route.ts'
import { haversineKm } from '../utils/haversine.ts'

export interface RouteWithDistance {
  route: RouteIndexEntry
  distanceKm: number
}

let cachedPosition: GeolocationPosition | null = null

/**
 * Get user location via Geolocation API.
 * Returns null if denied or unavailable.
 */
export async function getUserLocation(): Promise<GeolocationPosition | null> {
  if (cachedPosition) return cachedPosition
  if (!navigator.geolocation) return null

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        cachedPosition = pos
        resolve(pos)
      },
      () => resolve(null),
      { timeout: 8000, maximumAge: 60_000 },
    )
  })
}

/**
 * Get the approximate start point of a route from its bounding box centroid or bounds.
 * GeoJSON bounds are [south, west, north, east].
 */
function routeStartApprox(route: RouteIndexEntry): [number, number] | null {
  if (route.bounds) {
    const [s, w, n, e] = route.bounds
    // Use SW corner as a rough approximation of start location
    return [(s + n) / 2, (w + e) / 2]
  }
  return null
}

/**
 * Sort routes by distance from user position.
 * Routes without bounds are placed at the end.
 */
export function sortByProximity(
  routes: RouteIndexEntry[],
  userLat: number,
  userLng: number,
): RouteWithDistance[] {
  const withDist: RouteWithDistance[] = routes.map((route) => {
    const start = routeStartApprox(route)
    if (!start) return { route, distanceKm: Infinity }
    const [lat, lng] = start
    return { route, distanceKm: haversineKm(userLat, userLng, lat, lng) }
  })

  return withDist.sort((a, b) => a.distanceKm - b.distanceKm)
}

/**
 * Format a distance in km for display.
 */
export function formatProximity(km: number): string {
  if (!isFinite(km)) return ''
  if (km < 1) return `${Math.round(km * 1000)}m away`
  return `${km.toFixed(1)}km away`
}
