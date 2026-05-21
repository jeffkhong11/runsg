// map.ts — Leaflet map initialisation + tile layers
// T-009: Initialize map centered on Singapore
// T-010: OneMap primary tiles + auto-fallback to OSM

import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Singapore centre
const SG_CENTER: L.LatLngExpression = [1.3521, 103.8198]
const DEFAULT_ZOOM = 12

// Tile layer URLs
const ONEMAP_URL = 'https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png'
const ONEMAP_ATTR = '© <a href="https://www.onemap.gov.sg/" target="_blank">OneMap</a> © <a href="https://www.sla.gov.sg/" target="_blank">Singapore Land Authority</a>'

const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTR = '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'

let mapInstance: L.Map | null = null

/**
 * Initialise the Leaflet map in the given container element.
 * Returns the map instance.
 */
export function initMap(containerId: string): L.Map {
  if (mapInstance) return mapInstance

  const map = L.map(containerId, {
    center: SG_CENTER,
    zoom: DEFAULT_ZOOM,
    zoomControl: false,   // We add it manually for positioning
    attributionControl: true,
  })

  // Zoom control — bottom right
  L.control.zoom({ position: 'bottomright' }).addTo(map)

  // Scale bar
  L.control.scale({ position: 'bottomleft', metric: true, imperial: false }).addTo(map)

  // Primary: OneMap tile layer
  const oneMapLayer = L.tileLayer(ONEMAP_URL, {
    maxZoom: 19,
    attribution: ONEMAP_ATTR,
  })

  // Fallback: OSM tile layer
  const osmLayer = L.tileLayer(OSM_URL, {
    maxZoom: 19,
    attribution: OSM_ATTR,
  })

  // Add OneMap; fall back to OSM on error
  oneMapLayer.addTo(map)

  oneMapLayer.on('tileerror', () => {
    if (map.hasLayer(oneMapLayer)) {
      console.warn('[RunSG] OneMap tiles failed — falling back to OpenStreetMap')
      map.removeLayer(oneMapLayer)
      osmLayer.addTo(map)
    }
  })

  mapInstance = map
  return map
}

/**
 * Get the current map instance (throws if not initialised).
 */
export function getMap(): L.Map {
  if (!mapInstance) throw new Error('Map not initialised — call initMap() first')
  return mapInstance
}

/**
 * Fly the map to fit a bounding box [south, west, north, east].
 */
export function fitBounds(bounds: [number, number, number, number]): void {
  const map = getMap()
  const [s, w, n, e] = bounds
  map.flyToBounds([[s, w], [n, e]], { padding: [40, 40], duration: 0.8 })
}

/**
 * Reset view to Singapore centre.
 */
export function resetView(): void {
  getMap().flyTo(SG_CENTER, DEFAULT_ZOOM, { duration: 0.8 })
}
