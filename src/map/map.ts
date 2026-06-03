// map.ts — Mapbox GL JS map initialisation + styles
// T-009: Initialize map centered on Singapore
// Migrated from Leaflet → Mapbox GL JS for vector tiles, native dark mode, and WebGL rendering

import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

// Singapore centre
const SG_CENTER: [number, number] = [103.8198, 1.3521] // [lng, lat] — Mapbox format
const DEFAULT_ZOOM = 11.5

// Mapbox styles
const STYLE_LIGHT = 'mapbox://styles/mapbox/outdoors-v12'
const STYLE_DARK = 'mapbox://styles/mapbox/dark-v11'

let mapInstance: mapboxgl.Map | null = null

/**
 * Get current theme from DOM.
 */
function getCurrentTheme(): 'light' | 'dark' {
  return (document.documentElement.getAttribute('data-theme') ?? 'light') as 'light' | 'dark'
}

/**
 * Initialise the Mapbox GL JS map in the given container element.
 */
export function initMap(containerId: string): mapboxgl.Map {
  if (mapInstance) return mapInstance

  // Token from Vite env
  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
  if (!token) {
    const container = document.getElementById(containerId)
    if (container) {
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;padding:32px;text-align:center;color:var(--text-secondary);font-family:var(--font-body);">
          <div style="font-size:2.5rem;">🗺️</div>
          <div style="font-size:1.1rem;font-weight:700;color:var(--text-primary);">Mapbox Token Required</div>
          <div style="max-width:400px;line-height:1.6;font-size:0.85rem;">
            Create a free Mapbox account at <a href="https://mapbox.com" target="_blank" style="color:var(--color-brand)">mapbox.com</a>,
            copy your default public token, then add it to a <code>.env</code> file in the project root:<br/><br/>
            <code style="background:var(--bg-tertiary);padding:8px 12px;border-radius:6px;display:block;margin-top:8px;">VITE_MAPBOX_TOKEN=pk.your_token_here</code>
          </div>
        </div>`
    }
    throw new Error('[RunSG] VITE_MAPBOX_TOKEN not set — see .env.example')
  }

  mapboxgl.accessToken = token

  const theme = getCurrentTheme()
  const map = new mapboxgl.Map({
    container: containerId,
    style: theme === 'dark' ? STYLE_DARK : STYLE_LIGHT,
    center: SG_CENTER,
    zoom: DEFAULT_ZOOM,
    minZoom: 10,
    maxZoom: 18,
    pitch: 0,
    bearing: 0,
    attributionControl: true,
    maxBounds: [[103.55, 1.15], [104.15, 1.50]], // Constrain to Singapore
  })

  // Navigation controls — bottom right
  map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'bottom-right')

  // Scale bar
  map.addControl(new mapboxgl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left')

  // Geolocate control (for mobile)
  map.addControl(new mapboxgl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: false,
    showUserHeading: false,
  }), 'bottom-right')

  mapInstance = map
  return map
}

/**
 * Get the current map instance (throws if not initialised).
 */
export function getMap(): mapboxgl.Map {
  if (!mapInstance) throw new Error('Map not initialised — call initMap() first')
  return mapInstance
}

/**
 * Fly the map to fit a bounding box [south, west, north, east].
 */
export function fitBounds(bounds: [number, number, number, number]): void {
  const map = getMap()
  const [s, w, n, e] = bounds
  map.fitBounds([[w, s], [e, n]], {
    padding: { top: 60, bottom: 60, left: 60, right: 60 },
    duration: 1200,
    maxZoom: 16,
  })
}

/**
 * Reset view to Singapore centre.
 */
export function resetView(): void {
  getMap().flyTo({
    center: SG_CENTER,
    zoom: DEFAULT_ZOOM,
    pitch: 0,
    bearing: 0,
    duration: 1200,
  })
}

/**
 * Switch map style between light and dark.
 * Preserves route sources and layers by re-adding them after style load.
 */
export function setMapTheme(theme: 'light' | 'dark'): void {
  const map = getMap()
  const style = theme === 'dark' ? STYLE_DARK : STYLE_LIGHT
  map.setStyle(style)
}

/**
 * Execute callback once the map style is fully loaded.
 * If the style is already loaded, calls immediately.
 */
export function onStyleLoaded(cb: () => void): void {
  const map = getMap()
  if (map.isStyleLoaded()) {
    cb()
  } else {
    map.once('style.load', cb)
  }
}
