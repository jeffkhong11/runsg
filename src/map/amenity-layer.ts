// amenity-layer.ts — Route-proximity filtered Amenity map overlay (T-066, T-067, T-068)
// Migrated from Leaflet markers → Mapbox GL JS HTML markers

import mapboxgl from 'mapbox-gl'
import { loadAmenities } from '../services/data-loader.ts'
import type { Amenity } from '../types/amenity.ts'
import { svg } from '../ui/icon-system.ts'

// Only support water and toilets (completely excluded shelters as requested)
export type SelectedAmenityType = 'water' | 'toilet'

// Track active layers checked in panel — now active by default (T-066)
const activeToggles: Record<SelectedAmenityType, boolean> = {
  water: true,
  toilet: true,
}

// Cached OSM amenity lists
const cachedAmenities: Record<SelectedAmenityType, Amenity[]> = {
  water: [],
  toilet: [],
}

/**
 * Get the currently cached amenity arrays (for amenity metrics computation).
 */
export function getCachedAmenities(): { water: Amenity[]; toilet: Amenity[] } {
  return { water: cachedAmenities.water, toilet: cachedAmenities.toilet }
}

// UI configuration
const AMENITY_CONFIG = {
  water: {
    emoji: svg('Droplets', 13),
    color: '#0284c7',
    label: 'Water Points',
    fileName: 'water-points' as const,
  },
  toilet: {
    emoji: svg('Compass', 13),
    color: '#7c3aed',
    label: 'Toilets',
    fileName: 'toilets' as const,
  },
}

// Track active route geometry coordinates [lng, lat] for proximity filtering
let activeRouteCoords: [number, number][] | null = null

// Keep map instance reference
let mapInstance: mapboxgl.Map | null = null

// Store active markers for removal
const activeMarkers: mapboxgl.Marker[] = []

/**
 * Great-circle distance helper (Haversine formula) in meters.
 */
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Proximity helper: Checks if an amenity coordinate is within X meters of any route coordinate.
 */
function isNearRoute(lat: number, lng: number, routeCoords: [number, number][], maxDistanceMeters = 150): boolean {
  for (const [rlng, rlat] of routeCoords) {
    if (getDistanceMeters(lat, lng, rlat, rlng) <= maxDistanceMeters) {
      return true
    }
  }
  return false
}

/**
 * Set the currently active route coordinates for filtering amenities.
 */
export function setAmenityActiveRoute(coords: [number, number][] | null): void {
  activeRouteCoords = coords
  updatePanelMessage()

  if (mapInstance) {
    Object.keys(AMENITY_CONFIG).forEach((type) => {
      updateAmenityLayer(type as SelectedAmenityType)
    })
  }
}

/**
 * Update the info message in the layers panel.
 */
function updatePanelMessage(): void {
  const warning = document.getElementById('zoom-warning')
  if (!warning) return

  const hasRoute = activeRouteCoords !== null

  // Disable/enable checkboxes and add/remove disabled class on labels
  Object.keys(AMENITY_CONFIG).forEach((type) => {
    const checkbox = document.getElementById(`toggle-${type}`) as HTMLInputElement | null
    const label = document.getElementById(`toggle-label-${type}`) as HTMLElement | null
    if (checkbox && label) {
      checkbox.disabled = !hasRoute
      label.classList.toggle('disabled', !hasRoute)
    }
  })

  if (!hasRoute) {
    warning.textContent = 'Select a route to view amenities'
    warning.style.color = 'var(--text-muted)'
    warning.style.background = 'transparent'
  } else {
    warning.textContent = '✓ Showing facilities along route'
    warning.style.color = 'var(--color-brand)'
    warning.style.background = 'rgba(22, 201, 93, 0.1)'
  }
}

/**
 * Initialize and insert the amenity toggle control box onto the map.
 */
export function initAmenityControls(map: mapboxgl.Map): void {
  mapInstance = map

  // Create floating panel UI as a custom control
  const controlDiv = document.createElement('div')
  controlDiv.className = 'amenity-control-panel'
  controlDiv.innerHTML = `
    <div class="amenity-panel-header">
      <span class="panel-icon">${svg('Layers', 15)}</span>
      <span class="panel-title">Map Layers</span>
    </div>
    <div class="amenity-toggles">
      ${Object.entries(AMENITY_CONFIG).map(([type, cfg]) => `
        <label class="amenity-toggle-item active" id="toggle-label-${type}">
          <input type="checkbox" id="toggle-${type}" class="amenity-checkbox" checked>
          <span class="toggle-emoji">${cfg.emoji}</span>
          <span class="toggle-label">${cfg.label}</span>
          <span class="toggle-count" id="count-${type}"></span>
          <span class="toggle-switch">
            <span class="toggle-switch-track"></span>
            <span class="toggle-switch-thumb"></span>
          </span>
        </label>
      `).join('')}
    </div>
    <div class="amenity-zoom-warning" id="zoom-warning">
      Select a route to view amenities
    </div>
  `

  // Prevent map interactions when clicking the control
  controlDiv.addEventListener('click', (e) => e.stopPropagation())
  controlDiv.addEventListener('mousedown', (e) => e.stopPropagation())
  controlDiv.addEventListener('wheel', (e) => e.stopPropagation())

  // Add as a Mapbox IControl
  class AmenityControl implements mapboxgl.IControl {
    onAdd(): HTMLElement {
      return controlDiv
    }
    onRemove(): void {
      controlDiv.remove()
    }
    getDefaultPosition(): mapboxgl.ControlPosition {
      return 'top-right'
    }
  }

  map.addControl(new AmenityControl(), 'top-right')

  // Attach layer toggle events
  Object.keys(AMENITY_CONFIG).forEach((type) => {
    const key = type as SelectedAmenityType
    const checkbox = controlDiv.querySelector(`#toggle-${key}`) as HTMLInputElement
    const label = controlDiv.querySelector(`#toggle-label-${key}`) as HTMLElement

    checkbox?.addEventListener('change', async () => {
      activeToggles[key] = checkbox.checked
      label.classList.toggle('active', checkbox.checked)

      if (checkbox.checked) {
        await ensureAmenityLoaded(key)
      }

      updateAmenityLayer(key)
    })
  })

  // Pre-load all water and toilet amenities silently at start
  ensureAmenityLoaded('water')
  ensureAmenityLoaded('toilet')

  updatePanelMessage()
}

/**
 * Helper to dynamically load raw amenity files into the frontend client memory cache.
 */
export async function ensureAmenityLoaded(type: SelectedAmenityType): Promise<void> {
  if (cachedAmenities[type].length > 0) return

  const fileKey = AMENITY_CONFIG[type].fileName
  try {
    const data = await loadAmenities(fileKey)
    cachedAmenities[type] = data

    const countEl = document.getElementById(`count-${type}`)
    if (countEl) countEl.textContent = `(${data.length})`
  } catch (err) {
    console.error(`[RunSG] Failed to load ${type} data:`, err)
  }
}

/**
 * Clear all active markers from the map.
 */
function clearMarkers(): void {
  activeMarkers.forEach((m) => m.remove())
  activeMarkers.length = 0
}

/**
 * Filter and render markers onto the Mapbox map.
 */
function updateAmenityLayer(_type: SelectedAmenityType): void {
  // Clear existing markers of this type
  clearMarkers()

  // Re-render all active types
  Object.keys(AMENITY_CONFIG).forEach((t) => {
    const key = t as SelectedAmenityType
    if (!activeToggles[key] || !activeRouteCoords) return

    const data = cachedAmenities[key]
    const config = AMENITY_CONFIG[key]

    const filtered = data.filter((item) => isNearRoute(item.lat, item.lng, activeRouteCoords!))

    filtered.forEach((item) => {
      const el = document.createElement('div')
      el.className = 'custom-amenity-marker'
      el.innerHTML = `
        <div class="amenity-marker-glow" style="background: ${config.color}33"></div>
        <div class="amenity-marker-inner" style="background: ${config.color}; border: 2px solid white">
          ${config.emoji}
        </div>
      `

      const titleStr = item.name ? `<strong>${item.name}</strong>` : `Unnamed ${config.label.slice(0, -1)}`

      const lastVerifiedDate = new Date(item.last_verified)
      const diffTime = Math.abs(new Date().getTime() - lastVerifiedDate.getTime())
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      const verifiedStr = `Verified ${diffDays} day${diffDays === 1 ? '' : 's'} ago`

      const popup = new mapboxgl.Popup({
        closeButton: false,
        offset: [0, -14],
        className: 'amenity-leaflet-popup',
      }).setHTML(`
        <div class="amenity-popup">
          <div class="amenity-popup-header" style="color: ${config.color}">
            <span style="margin-right: 4px">${config.emoji}</span>
            ${config.label.slice(0, -1)}
          </div>
          <div class="amenity-popup-title">${titleStr}</div>
          <div class="amenity-popup-meta">${verifiedStr}</div>
        </div>
      `)

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([item.lng, item.lat])
        .setPopup(popup)
        .addTo(mapInstance!)

      activeMarkers.push(marker)
    })
  })
}
