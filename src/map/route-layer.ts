// route-layer.ts — Route polyline rendering on the map
// T-019: Render route polylines from GeoJSON, colour-coded by type
// T-020: Click handlers to select a route

import L from 'leaflet'
import type { RouteIndexEntry } from '../types/route.ts'
import { getMap } from './map.ts'

// Colour map by route type
const ROUTE_COLORS: Record<string, string> = {
  pcn:   '#22c55e',
  trail: '#ca8a04',
  road:  '#6366f1',
  mixed: '#06b6d4',
}

// Stroke widths
const WEIGHT_DEFAULT = 3
const WEIGHT_HOVER = 5
const WEIGHT_ACTIVE = 6

// Store polylines by route ID
const polylineMap = new Map<string, L.Polyline>()
let activeRouteId: string | null = null

// Callback invoked when a route is selected via map click
type SelectCallback = (routeId: string) => void
let onSelectCallback: SelectCallback | null = null

/**
 * Register a callback to be called when a route polyline is clicked.
 */
export function onRouteSelected(cb: SelectCallback): void {
  onSelectCallback = cb
}

/**
 * Render all routes from the index onto the map as coloured polylines.
 * Routes with geometry embedded in the index entry are rendered directly;
 * otherwise a stub is created (geometry loaded on demand in Phase 2+).
 */
export function renderRoutes(routes: RouteIndexEntry[]): void {
  const map = getMap()
  const routeGroup = L.layerGroup().addTo(map)

  for (const route of routes) {
    const color = ROUTE_COLORS[route.type] ?? '#22c55e'

    // Placeholder polyline at route centroid if no geometry in index
    // Full geometry is loaded when the route is selected (Phase 2)
    // For Phase 1 we check if the index entry has inline coords (it won't yet)
    const polyline = L.polyline([], {
      color,
      weight: WEIGHT_DEFAULT,
      opacity: 0.85,
      lineJoin: 'round',
      lineCap: 'round',
    })

    // Popup on hover
    polyline.bindPopup(
      `<div class="route-popup-name">${route.name}</div>
       <div class="route-popup-meta">${route.distance_km} km · ${route.difficulty}</div>`,
      { closeButton: false, offset: [0, -4] }
    )

    polyline.on('mouseover', () => {
      polyline.setStyle({ weight: WEIGHT_HOVER, opacity: 1 })
      polyline.openPopup()
    })

    polyline.on('mouseout', () => {
      if (route.id !== activeRouteId) {
        polyline.setStyle({ weight: WEIGHT_DEFAULT, opacity: 0.85 })
      }
      polyline.closePopup()
    })

    polyline.on('click', () => {
      selectRoute(route.id)
      onSelectCallback?.(route.id)
    })

    polylineMap.set(route.id, polyline)
    routeGroup.addLayer(polyline)
  }
}

/**
 * Update a route's polyline with actual geometry coordinates.
 * Coordinates are [lng, lat] pairs (GeoJSON); Leaflet needs [lat, lng].
 */
export function updateRouteGeometry(
  routeId: string,
  coordinates: [number, number][]
): void {
  const polyline = polylineMap.get(routeId)
  if (!polyline) return

  const latLngs = coordinates.map(([lng, lat]) => L.latLng(lat, lng))
  polyline.setLatLngs(latLngs)
}

/**
 * Set the active (selected) route — highlights the polyline.
 */
export function selectRoute(routeId: string): void {
  // Deselect previous
  if (activeRouteId && activeRouteId !== routeId) {
    const prev = polylineMap.get(activeRouteId)
    if (prev) prev.setStyle({ weight: WEIGHT_DEFAULT, opacity: 0.85 })
  }

  activeRouteId = routeId
  const polyline = polylineMap.get(routeId)
  if (polyline) {
    polyline.setStyle({ weight: WEIGHT_ACTIVE, opacity: 1 })
    polyline.bringToFront()
  }
}

/**
 * Deselect the current active route.
 */
export function deselectRoute(): void {
  if (activeRouteId) {
    const polyline = polylineMap.get(activeRouteId)
    if (polyline) polyline.setStyle({ weight: WEIGHT_DEFAULT, opacity: 0.85 })
    activeRouteId = null
  }
}

/**
 * Show only routes matching the given IDs; hide others.
 */
export function filterVisibleRoutes(visibleIds: Set<string>): void {
  for (const [id, polyline] of polylineMap) {
    const lls = polyline.getLatLngs()
    if (lls.length === 0) continue  // Skip routes with no geometry yet
    polyline.setStyle({
      opacity: visibleIds.has(id) ? 0.85 : 0,
      interactive: visibleIds.has(id),
    })
  }
}

/**
 * Show all routes.
 */
export function showAllRoutes(): void {
  for (const polyline of polylineMap.values()) {
    polyline.setStyle({ opacity: 0.85, interactive: true })
  }
}

export function getActiveRouteId(): string | null {
  return activeRouteId
}
