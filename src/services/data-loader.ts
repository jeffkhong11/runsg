// data-loader.ts — Fetch and cache route/amenity JSON
// T-018: loads index.json and individual route files

import type { RouteIndexEntry, Route } from '../types/route.ts'
import type { Amenity } from '../types/amenity.ts'

// Base path for data files (works both in dev and on GitHub Pages)
const DATA_BASE = import.meta.env.BASE_URL + 'data'

// In-memory cache
const routeCache = new Map<string, Route>()
let indexCache: RouteIndexEntry[] | null = null

/**
 * Load the route index (lightweight metadata, no geometry).
 * Cached after first fetch.
 */
export async function loadRouteIndex(): Promise<RouteIndexEntry[]> {
  if (indexCache) return indexCache

  const res = await fetch(`${DATA_BASE}/routes/index.json`)
  if (!res.ok) throw new Error(`Failed to load route index: ${res.status}`)

  const data = (await res.json()) as RouteIndexEntry[]
  indexCache = data
  return data
}

/**
 * Load a specific route by ID (includes full geometry).
 * Cached after first fetch.
 */
export async function loadRoute(id: string): Promise<Route> {
  if (routeCache.has(id)) return routeCache.get(id)!

  const res = await fetch(`${DATA_BASE}/routes/${id}.json`)
  if (!res.ok) throw new Error(`Failed to load route "${id}": ${res.status}`)

  const route = (await res.json()) as Route
  routeCache.set(id, route)
  return route
}

/**
 * Load all amenities of a given type.
 */
export async function loadAmenities(type: 'water-points' | 'toilets' | 'shelters'): Promise<Amenity[]> {
  const res = await fetch(`${DATA_BASE}/amenities/${type}.json`)
  if (!res.ok) {
    console.warn(`Amenity data not available: ${type}`)
    return []
  }
  return (await res.json()) as Amenity[]
}

/**
 * Invalidate the index cache (call after data updates).
 */
export function invalidateCache(): void {
  indexCache = null
  routeCache.clear()
}
