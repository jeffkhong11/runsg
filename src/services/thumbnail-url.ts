// thumbnail-url.ts — Builds Mapbox Static Images API URLs for route card thumbnails
// The browser fetches these directly from localhost:5173 (allowed origin), so the
// public token's URL restriction is satisfied without any server-side generation.

import type { RouteIndexEntry } from '../types/route.ts'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string
const MAPBOX_STYLE = 'mapbox/light-v11'

// Color per route type — matches design tokens
const ROUTE_COLORS: Record<string, string> = {
  pcn:   '16c95d',
  trail: 'd97706',
  road:  '6366f1',
  mixed: '0891b2',
}

// Padding (degrees) added around route bbox so it isn't flush to card edges
const BBOX_PAD = 0.005

/**
 * Encodes a list of [lng, lat] pairs using Google Encoded Polyline Algorithm.
 * Mapbox Static Images API accepts this format as `enc:...` in the path overlay.
 */
function encodePolyline(coords: [number, number][]): string {
  function encodeVal(val: number): string {
    let v = Math.round(val * 1e5)
    v = v << 1
    if (v < 0) v = ~v
    let result = ''
    while (v >= 32) {
      result += String.fromCharCode((32 | (v & 31)) + 63)
      v >>= 5
    }
    result += String.fromCharCode(v + 63)
    return result
  }
  let prevLat = 0, prevLng = 0
  let out = ''
  for (const [lng, lat] of coords) {
    out += encodeVal(lat - prevLat)
    out += encodeVal(lng - prevLng)
    prevLat = lat; prevLng = lng
  }
  return out
}

/**
 * Uniformly downsample coords to at most maxPoints (keeps first + last).
 */
function simplify(coords: [number, number][], maxPoints = 80): [number, number][] {
  if (coords.length <= maxPoints) return coords
  const stride = (coords.length - 1) / (maxPoints - 1)
  const result: [number, number][] = Array.from({ length: maxPoints - 1 }, (_, i) =>
    coords[Math.round(i * stride)]
  )
  result.push(coords[coords.length - 1])
  return result
}

/**
 * Build a Mapbox Static Images URL using ONLY route index data (no geometry needed).
 * Shows a map centered on the route bbox with a colored pin at the center.
 * This is fast — no extra data fetch, no polyline encoding.
 *
 * @param route  RouteIndexEntry from index.json
 * @returns      Full static image URL string, or '' if token/bounds missing
 */
export function buildIndexThumbnailUrl(route: RouteIndexEntry): string {
  if (!MAPBOX_TOKEN) return ''

  const b = route.bounds
  if (!b || b.length !== 4) return ''

  // bounds = [minLat, minLng, maxLat, maxLng]
  const [minLat, minLng, maxLat, maxLng] = b
  const cLng = (minLng + maxLng) / 2
  const cLat = (minLat + maxLat) / 2

  const color = ROUTE_COLORS[route.type] ?? '16c95d'

  // Pin marker at center: pin-s-attraction+color(lng,lat)
  const marker = `pin-s+${color}(${cLng.toFixed(5)},${cLat.toFixed(5)})`

  const viewport = (
    `[${minLng - BBOX_PAD},${minLat - BBOX_PAD},` +
    `${maxLng + BBOX_PAD},${maxLat + BBOX_PAD}]`
  )

  return (
    `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/` +
    `${marker}/${viewport}/400x200@2x` +
    `?access_token=${MAPBOX_TOKEN}`
  )
}

/**
 * Build a Mapbox Static Images URL for a route.
 * Uses an explicit [minLng,minLat,maxLng,maxLat] viewport (more reliable than 'auto').
 *
 * @param route   RouteIndexEntry from index.json (has bounds field)
 * @param coords  GeoJSON LineString coordinates [[lng,lat],...]
 * @returns       Full URL string, or empty string if data is insufficient
 */
export function buildThumbnailUrl(
  route: RouteIndexEntry,
  coords: [number, number][],
): string {
  if (!MAPBOX_TOKEN || coords.length < 2) return ''

  const color = ROUTE_COLORS[route.type] ?? '16c95d'
  const simplified = simplify(coords as [number, number][], 80)
  const encoded = encodePolyline(simplified)
  const path = `path-5+${color}-0.9(enc:${encoded})`

  // Route bounds from index.json: [minLat, minLng, maxLat, maxLng]
  const b = route.bounds
  let minLng: number, minLat: number, maxLng: number, maxLat: number

  if (b && b.length === 4) {
    [minLat, minLng, maxLat, maxLng] = b
  } else {
    // Fallback: compute from coords
    minLng = Math.min(...coords.map(c => c[0]))
    maxLng = Math.max(...coords.map(c => c[0]))
    minLat = Math.min(...coords.map(c => c[1]))
    maxLat = Math.max(...coords.map(c => c[1]))
  }

  const viewport = `[${minLng - BBOX_PAD},${minLat - BBOX_PAD},${maxLng + BBOX_PAD},${maxLat + BBOX_PAD}]`

  return (
    `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/` +
    `${path}/${viewport}/400x200@2x` +
    `?access_token=${MAPBOX_TOKEN}`
  )
}
