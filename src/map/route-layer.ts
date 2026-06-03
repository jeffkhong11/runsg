// route-layer.ts — Route rendering on Mapbox GL JS map
// T-019: Render route polylines from GeoJSON, colour-coded by type
// T-020: Click handlers to select a route
// T-087a: Zoom Render Guard — show pins at low zoom, polylines at high zoom
// Migrated from Leaflet polylines → Mapbox GeoJSON sources + layers

import mapboxgl from 'mapbox-gl'
import type { RouteIndexEntry } from '../types/route.ts'
import { getMap } from './map.ts'

// Colour map by route type
const ROUTE_COLORS: Record<string, string> = {
  pcn: '#22c55e',
  trail: '#ca8a04',
  road: '#6366f1',
  mixed: '#06b6d4',
}

// Source + layer IDs
const ROUTES_SOURCE = 'routes-source'
const ROUTES_LINE_LAYER = 'routes-line'
const ROUTES_LINE_ACTIVE_LAYER = 'routes-line-active'
const ROUTES_PIN_LAYER = 'routes-pins'
const ZOOM_POLYLINE_THRESHOLD = 12.5

// Track state
let activeRouteId: string | null = null
let allRouteEntries: RouteIndexEntry[] = []
let hiddenRouteIds: Set<string> = new Set()

// Callback invoked when a route is selected via map click
type SelectCallback = (routeId: string) => void
let onSelectCallback: SelectCallback | null = null

// Track whether map events have been registered (prevents duplicates on style swap)
let eventsRegistered = false

// GeoJSON FeatureCollection for all routes
let routeFeatureCollection: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
}

/**
 * Register a callback to be called when a route polyline is clicked.
 */
export function onRouteSelected(cb: SelectCallback): void {
  onSelectCallback = cb
}

/**
 * Build initial GeoJSON features from route index entries.
 * Geometry is empty initially — loaded on demand when a route is selected.
 */
function buildFeatures(routes: RouteIndexEntry[]): GeoJSON.Feature[] {
  return routes.map((r) => {
    const centroid = r.bounds
      ? [(r.bounds[1] + r.bounds[3]) / 2, (r.bounds[0] + r.bounds[2]) / 2]
      : [103.8198, 1.3521]

    return {
      type: 'Feature' as const,
      id: hashId(r.id),
      properties: {
        routeId: r.id,
        name: r.name,
        type: r.type,
        difficulty: r.difficulty,
        distance_km: r.distance_km,
        color: ROUTE_COLORS[r.type] ?? '#22c55e',
        hasGeometry: false,
        centroidLng: centroid[0],
        centroidLat: centroid[1],
      },
      geometry: {
        type: 'Point' as const,
        coordinates: centroid,
      },
    }
  })
}

/** Simple hash to create numeric IDs for Mapbox feature state */
function hashId(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

/**
 * Add GeoJSON source + layers to the map.
 * Safe to call repeatedly — skips if already present.
 */
function addSourceAndLayers(map: mapboxgl.Map): void {
  // Add source
  if (map.getSource(ROUTES_SOURCE)) {
    (map.getSource(ROUTES_SOURCE) as mapboxgl.GeoJSONSource).setData(routeFeatureCollection)
  } else {
    map.addSource(ROUTES_SOURCE, {
      type: 'geojson',
      data: routeFeatureCollection,
      promoteId: 'routeId',
    })
  }

  // Line layer — visible only at high zoom, only for features with geometry
  if (!map.getLayer(ROUTES_LINE_LAYER)) {
    map.addLayer({
      id: ROUTES_LINE_LAYER,
      type: 'line',
      source: ROUTES_SOURCE,
      filter: ['==', ['get', 'hasGeometry'], true],
      minzoom: ZOOM_POLYLINE_THRESHOLD,
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], 5,
          3
        ],
        'line-opacity': [
          'case',
          ['boolean', ['feature-state', 'hidden'], false], 0,
          0.85
        ],
      },
    })
  }

  // Active route highlight layer (thicker, on top)
  if (!map.getLayer(ROUTES_LINE_ACTIVE_LAYER)) {
    map.addLayer({
      id: ROUTES_LINE_ACTIVE_LAYER,
      type: 'line',
      source: ROUTES_SOURCE,
      filter: ['==', ['get', 'routeId'], activeRouteId ?? ''],
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 6,
        'line-opacity': 1,
      },
    })
  }

  // Pin layer — visible at low zoom (route start location markers)
  if (!map.getLayer(ROUTES_PIN_LAYER)) {
    map.addLayer({
      id: ROUTES_PIN_LAYER,
      type: 'circle',
      source: ROUTES_SOURCE,
      maxzoom: ZOOM_POLYLINE_THRESHOLD,
      paint: {
        'circle-radius': 5,
        'circle-color': ['get', 'color'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
        'circle-opacity': [
          'case',
          ['boolean', ['feature-state', 'hidden'], false], 0,
          0.85
        ],
        'circle-stroke-opacity': [
          'case',
          ['boolean', ['feature-state', 'hidden'], false], 0,
          1
        ],
      },
    })
  }
}

/**
 * Register map interaction events (hover, click, popup).
 * Called once — guards against duplicate registration.
 */
function registerMapEvents(map: mapboxgl.Map): void {
  if (eventsRegistered) return
  eventsRegistered = true

  let hoveredId: string | null = null

  map.on('mousemove', ROUTES_LINE_LAYER, (e) => {
    if (e.features && e.features.length > 0) {
      const feature = e.features[0]
      const rid = feature.properties?.routeId
      if (hoveredId && hoveredId !== rid) {
        map.setFeatureState({ source: ROUTES_SOURCE, id: hoveredId }, { hover: false })
      }
      hoveredId = rid
      map.setFeatureState({ source: ROUTES_SOURCE, id: rid }, { hover: true })
      map.getCanvas().style.cursor = 'pointer'
    }
  })

  map.on('mouseleave', ROUTES_LINE_LAYER, () => {
    if (hoveredId) {
      map.setFeatureState({ source: ROUTES_SOURCE, id: hoveredId }, { hover: false })
      hoveredId = null
    }
    map.getCanvas().style.cursor = ''
  })

  // Click interactions
  map.on('click', ROUTES_LINE_LAYER, (e) => {
    if (e.features && e.features.length > 0) {
      const routeId = e.features[0].properties?.routeId
      if (routeId) {
        selectRoute(routeId)
        onSelectCallback?.(routeId)
      }
    }
  })

  // Click on pins too
  map.on('click', ROUTES_PIN_LAYER, (e) => {
    if (e.features && e.features.length > 0) {
      const routeId = e.features[0].properties?.routeId
      if (routeId) {
        onSelectCallback?.(routeId)
      }
    }
  })

  map.on('mouseenter', ROUTES_PIN_LAYER, () => {
    map.getCanvas().style.cursor = 'pointer'
  })
  map.on('mouseleave', ROUTES_PIN_LAYER, () => {
    map.getCanvas().style.cursor = ''
  })

  // Popup on hover for lines
  const popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: [0, -8],
    className: 'route-popup',
  })

  map.on('mousemove', ROUTES_LINE_LAYER, (e) => {
    if (e.features && e.features.length > 0) {
      const props = e.features[0].properties!
      popup.setLngLat(e.lngLat)
        .setHTML(`
          <div class="route-popup-name">${props.name}</div>
          <div class="route-popup-meta">${props.distance_km} km · ${props.difficulty}</div>
        `)
        .addTo(map)
    }
  })

  map.on('mouseleave', ROUTES_LINE_LAYER, () => {
    popup.remove()
  })
}

/**
 * Render all routes from the index onto the map.
 */
export function renderRoutes(routes: RouteIndexEntry[]): void {
  allRouteEntries = routes
  const map = getMap()

  const setup = () => {
    routeFeatureCollection = {
      type: 'FeatureCollection',
      features: buildFeatures(routes),
    }
    addSourceAndLayers(map)
    registerMapEvents(map)
  }

  if (map.isStyleLoaded()) {
    setup()
  } else {
    map.on('load', setup)
  }
}

/**
 * Update a route's geometry with actual coordinates.
 * Coordinates are [lng, lat] pairs (GeoJSON format).
 */
export function updateRouteGeometry(
  routeId: string,
  coordinates: [number, number][],
): void {
  const feature = routeFeatureCollection.features.find(
    (f) => f.properties?.routeId === routeId
  )
  if (!feature) return

  // Update geometry from Point to LineString
  feature.geometry = {
    type: 'LineString',
    coordinates,
  }
  feature.properties!.hasGeometry = true

  // Update the source
  const map = getMap()
  const source = map.getSource(ROUTES_SOURCE) as mapboxgl.GeoJSONSource
  if (source) {
    source.setData(routeFeatureCollection)
  }
}

/**
 * Also create/update start pin position. With Mapbox this is handled
 * by the pin layer automatically from the source data.
 */
export function updateRouteStartPin(
  _routeId: string,
  _coordinates: [number, number][],
  _color: string,
): void {
  // No-op in Mapbox — pins are rendered from source data automatically
}

/**
 * Set the active (selected) route — highlights the polyline.
 */
export function selectRoute(routeId: string): void {
  activeRouteId = routeId
  const map = getMap()

  if (map.getLayer(ROUTES_LINE_ACTIVE_LAYER)) {
    map.setFilter(ROUTES_LINE_ACTIVE_LAYER, ['==', ['get', 'routeId'], routeId])
  }
}

/**
 * Deselect the current active route.
 */
export function deselectRoute(): void {
  activeRouteId = null
  const map = getMap()

  if (map.getLayer(ROUTES_LINE_ACTIVE_LAYER)) {
    map.setFilter(ROUTES_LINE_ACTIVE_LAYER, ['==', ['get', 'routeId'], ''])
  }
}

/**
 * Show only routes matching the given IDs; hide others.
 */
export function filterVisibleRoutes(visibleIds: Set<string>): void {
  hiddenRouteIds = new Set<string>()
  const map = getMap()

  for (const entry of allRouteEntries) {
    const isVisible = visibleIds.has(entry.id)
    if (!isVisible) {
      hiddenRouteIds.add(entry.id)
    }
    map.setFeatureState(
      { source: ROUTES_SOURCE, id: entry.id },
      { hidden: !isVisible }
    )
  }
}

/**
 * Show all routes.
 */
export function showAllRoutes(): void {
  hiddenRouteIds.clear()
  const map = getMap()

  for (const entry of allRouteEntries) {
    map.setFeatureState(
      { source: ROUTES_SOURCE, id: entry.id },
      { hidden: false }
    )
  }
}

/**
 * Initialize the Zoom Render Guard (T-087a).
 * With Mapbox, this is handled natively via minzoom/maxzoom on layers.
 */
export function initZoomRenderGuard(): void {
  // No-op — Mapbox handles this via layer minzoom/maxzoom properties
}

export function getActiveRouteId(): string | null {
  return activeRouteId
}

/**
 * Re-add all sources and layers after a style change (dark/light mode).
 * Only re-adds source + layers — does NOT re-register event listeners.
 */
export function reapplyRouteLayers(): void {
  if (allRouteEntries.length === 0) return
  const map = getMap()
  addSourceAndLayers(map)
  if (activeRouteId) {
    selectRoute(activeRouteId)
  }
}
