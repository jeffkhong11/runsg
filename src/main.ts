// main.ts — RunSG entry point
// Phase 2: Wire up filters, route cards, detail panel, hash router
// Phase 4: Amenity metrics (T-069–T-071)
// Phase 5: Near Me shelf (T-074–T-076), zoom render guard (T-087a), quick pills
// Chunk 1: Map-first floating layout, header search, sidebar toggle

import './style.css'
import { svg } from './ui/icon-system.ts'
import { initMap, fitBounds, resetView, setMapTheme } from './map/map.ts'
import {
  renderRoutes, onRouteSelected, selectRoute, updateRouteGeometry,
  deselectRoute, filterVisibleRoutes, showAllRoutes, initZoomRenderGuard,
  updateRouteStartPin, reapplyRouteLayers,
} from './map/route-layer.ts'
import {
  initAmenityControls, setAmenityActiveRoute, getCachedAmenities, ensureAmenityLoaded,
} from './map/amenity-layer.ts'
import { loadRouteIndex, loadRoute } from './services/data-loader.ts'
import { initFilters, renderFilters, getActiveFilterCount, applyFilters } from './ui/filters.ts'
import {
  renderRouteCards, setActiveCard, scrollToCard, initRouteCards, initNearMeShelf,
} from './ui/route-card.ts'
import { renderDetailPanel, closeDetail, setDetailRoute } from './ui/route-detail.ts'
import { renderElevationChart } from './ui/elevation-chart.ts'
import { initRouter, onHashRoute, onHashHome, setRouteHash, clearRouteHash } from './ui/router.ts'
import { computeAmenityMetrics, renderAmenityMetrics } from './services/amenity-metrics.ts'
import { initSearchDropdown } from './ui/search-dropdown.ts'
import type { RouteIndexEntry } from './types/route.ts'

// ─── DOM Setup ───────────────────────────────────────────────────────────────

const appEl = document.getElementById('app')!

appEl.innerHTML = `
  <!-- Header -->
  <header class="app-header">
    <!-- Sidebar toggle (hamburger) -->
    <button class="btn-sidebar-toggle" id="btn-sidebar-toggle" title="Toggle sidebar" aria-label="Toggle sidebar" aria-expanded="true">
      ${svg('Menu', 20)}
    </button>

    <a href="#" class="app-logo" id="logo-home">
      <div class="app-logo-icon">${svg('Activity', 18, 'logo-run-icon')}</div>
      <span class="app-logo-text">Run<span>SG</span></span>
    </a>

    <!-- Always-visible search bar -->
    <div class="header-search-wrap">
      <span class="header-search-icon">
        ${svg('Search', 15)}
      </span>
      <input
        type="text"
        class="header-search"
        id="header-search"
        placeholder="Search routes, tags, region…"
        aria-label="Search routes"
        autocomplete="off"
      />
    </div>

    <div class="header-actions">
      <button class="btn-icon" id="btn-near-me" title="Find runs near me" aria-label="Find runs near me">${svg('MapPin', 18)}</button>
      <button class="btn-icon" id="btn-theme" title="Toggle dark mode" aria-label="Toggle dark mode">${svg('Moon', 18)}</button>
    </div>
  </header>

  <!-- Main —map fills 100%, sidebar + detail float over it -->
  <main class="app-main">
    <!-- Sidebar -->
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-title-row">
          <div class="sidebar-title">Explore Routes</div>
          <button class="btn-icon sidebar-filter-toggle" id="btn-toggle-filters" title="Filters" aria-label="Toggle filters">
            <span id="filter-icon">${svg('SlidersHorizontal', 17)}</span>
          </button>
        </div>
        <div class="sidebar-route-count" id="route-count">Loading routes…</div>
      </div>

      <!-- Filter panel (collapsible) -->
      <div class="sidebar-filters" id="sidebar-filters">
        <div id="filters-container"></div>
      </div>

      <!-- Route shelves -->
      <div class="route-list" id="route-list">
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
      </div>
    </aside>

    <!-- Map container (full width/height) -->
    <div class="map-wrapper">
      <div id="map"></div>
      <div class="map-loading" id="map-loading">
        <div class="spinner"></div>
        <div class="map-loading-text">Loading Singapore routes…</div>
      </div>

      <!-- Quick Filter Pills — floating overlay at map bottom -->
      <div class="map-pills-overlay" id="map-pills-overlay">
        <div class="quick-pills" id="quick-pills" role="group" aria-label="Quick route filters">
          <button class="pill" data-pill="trail" id="pill-trail">${svg('TreePine', 14)} Trails</button>
          <button class="pill" data-pill="pcn"   id="pill-pcn">${svg('Building2', 14)} Paved PCN</button>
          <button class="pill" data-pill="night" id="pill-night">${svg('Moon', 14)} Night Running</button>
          <button class="pill" data-pill="long"  id="pill-long">${svg('Activity', 14)} Long Runs</button>
          <button class="pill" data-pill="easy"  id="pill-easy">${svg('Zap', 14)} Quick Runs</button>
          <button class="pill" data-pill="hilly" id="pill-hilly">${svg('Mountain', 14)} Hilly</button>
        </div>
      </div>
    </div>

    <!-- Route detail panel -->
    <div class="route-detail" id="route-detail">
      <div class="route-detail-accent"></div>
      <div class="route-detail-header">
        <div id="detail-title" class="route-detail-title"></div>
        <button class="route-detail-close" id="btn-detail-close" title="Close" aria-label="Close detail panel">${svg('X', 18)}</button>
      </div>
      <div class="route-detail-body" id="detail-body"></div>
    </div>
  </main>

  <!-- Status toast -->
  <div class="status-bar" id="status-bar"></div>
`

// ─── State ───────────────────────────────────────────────────────────────────

let allRoutes: RouteIndexEntry[] = []
let selectedRouteId: string | null = null
let filtersVisible = false
let activePill: string | null = null
let sidebarCollapsed = false

// ─── DOM Refs ────────────────────────────────────────────────────────────────

const routeListEl = document.getElementById('route-list')!
const routeCountEl = document.getElementById('route-count')!
const filtersContainerEl = document.getElementById('filters-container')!
const sidebarFiltersEl = document.getElementById('sidebar-filters')!
const detailPanelEl = document.getElementById('route-detail')!

// ─── Theme (T-077–T-080) ─────────────────────────────────────────────────────

function initTheme(): void {
  const saved = localStorage.getItem('runsg-theme')
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const theme = saved ?? (prefersDark ? 'dark' : 'light')
  document.documentElement.setAttribute('data-theme', theme)
  updateThemeButton(theme)
}

function toggleTheme(): void {
  const current = document.documentElement.getAttribute('data-theme') ?? 'light'
  const next = current === 'dark' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', next)
  localStorage.setItem('runsg-theme', next)
  updateThemeButton(next)

  // Switch Mapbox style — setStyle() destroys all custom sources/layers
  setMapTheme(next as 'light' | 'dark')

  // Re-add route layers + amenity markers after the new style fully loads
  const map = initMap('map')
  map.once('style.load', () => {
    reapplyRouteLayers()
    // Re-trigger amenity markers if a route was selected
    setAmenityActiveRoute(null)
  })
}

function updateThemeButton(theme: string): void {
  const btn = document.getElementById('btn-theme')
  if (btn) btn.innerHTML = theme === 'dark' ? svg('Sun', 18) : svg('Moon', 18)
}

// ─── Status Toast ────────────────────────────────────────────────────────────

function showStatus(msg: string, durationMs = 2500): void {
  const bar = document.getElementById('status-bar')
  if (!bar) return
  bar.textContent = msg
  bar.classList.add('visible')
  setTimeout(() => bar.classList.remove('visible'), durationMs)
}

// ─── Filter Panel Toggle ─────────────────────────────────────────────────────

function toggleFilters(): void {
  filtersVisible = !filtersVisible
  sidebarFiltersEl.classList.toggle('open', filtersVisible)
  const icon = document.getElementById('filter-icon')
  if (icon) icon.innerHTML = filtersVisible ? svg('X', 17) : svg('SlidersHorizontal', 17)
}

// ─── Sidebar Toggle ───────────────────────────────────────────────────────────

function toggleSidebar(): void {
  sidebarCollapsed = !sidebarCollapsed
  const sidebar = document.getElementById('sidebar')!
  const btn = document.getElementById('btn-sidebar-toggle')!
  sidebar.classList.toggle('collapsed', sidebarCollapsed)
  btn.setAttribute('aria-expanded', String(!sidebarCollapsed))
  // Resize map after transition so Mapbox knows the new viewport
  setTimeout(() => { initMap('map').resize() }, 520)
}

// ─── Route Count ─────────────────────────────────────────────────────────────

function updateRouteCount(showing: number, total: number): void {
  const filterCount = getActiveFilterCount()
  if (filterCount > 0 || activePill) {
    routeCountEl.textContent = `${showing} of ${total} routes`
  } else {
    routeCountEl.textContent = `${total} route${total !== 1 ? 's' : ''}`
  }
}

// ─── Quick Filter Pills (FR-05, T-025, T-026) ─────────────────────────────────

function getPillFilteredRoutes(pill: string | null): RouteIndexEntry[] {
  const base = applyFilters(allRoutes)
  if (!pill) return base
  switch (pill) {
    case 'trail': return base.filter((r) => r.type === 'trail')
    case 'pcn': return base.filter((r) => r.type === 'pcn')
    case 'night': return base.filter((r) => r.lighting === 'well-lit')
    case 'long': return base.filter((r) => r.distance_km >= 10)
    case 'easy': return base.filter((r) => r.distance_km < 5)
    case 'hilly': return base.filter((r) => r.elevation_gain_m >= 80)
    default: return base
  }
}

function initQuickPills(): void {
  document.querySelectorAll('.pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      const key = (pill as HTMLElement).dataset['pill']!
      if (activePill === key) {
        // Deactivate
        activePill = null
        pill.classList.remove('active')
      } else {
        // Activate this pill, deactivate others
        document.querySelectorAll('.pill').forEach((p) => p.classList.remove('active'))
        activePill = key
        pill.classList.add('active')
      }
      const filtered = getPillFilteredRoutes(activePill)
      updateRouteCount(filtered.length, allRoutes.length)
      renderRouteCards(routeListEl, filtered, selectedRouteId, handleRouteSelect)

      const visibleIds = new Set(filtered.map((r) => r.id))
      if (filtered.length === allRoutes.length) {
        showAllRoutes()
      } else {
        filterVisibleRoutes(visibleIds)
      }
    })
  })
}

// ─── Filter Change Handler ───────────────────────────────────────────────────

function handleFilterChange(filtered: RouteIndexEntry[]): void {
  const withPill = getPillFilteredRoutes(activePill)
  const final = activePill ? withPill.filter((r) => filtered.includes(r)) : filtered
  updateRouteCount(final.length, allRoutes.length)
  renderRouteCards(routeListEl, final, selectedRouteId, handleRouteSelect)

  if (final.length === allRoutes.length) {
    showAllRoutes()
  } else {
    const visibleIds = new Set(final.map((r) => r.id))
    filterVisibleRoutes(visibleIds)
  }
}

// ─── Route Selection ─────────────────────────────────────────────────────────

async function handleRouteSelect(routeId: string): Promise<void> {
  selectedRouteId = routeId

  setActiveCard(routeId)
  scrollToCard(routeId)
  selectRoute(routeId)
  setRouteHash(routeId)

  const indexEntry = allRoutes.find((r) => r.id === routeId)
  if (indexEntry) {
    renderDetailPanel(indexEntry, detailPanelEl, handleRouteDeselect)
  }

  try {
    const route = await loadRoute(routeId)
    const map = initMap('map')
    map.resize()

    const routeColor = { pcn: '#22c55e', trail: '#ca8a04', road: '#6366f1', mixed: '#06b6d4' }[route.type] ?? '#22c55e'

    // T-069–T-071: Guarantee amenity files are fully loaded before computing proximity metrics
    await Promise.all([
      ensureAmenityLoaded('water'),
      ensureAmenityLoaded('toilet'),
    ])

    updateRouteGeometry(routeId, route.geometry.coordinates)
    updateRouteStartPin(routeId, route.geometry.coordinates, routeColor)
    setAmenityActiveRoute(route.geometry.coordinates)
    setDetailRoute(route)  // enables GPX export button

    if (indexEntry?.bounds) fitBounds(indexEntry.bounds)
    showStatus(`${route.name} — ${route.distance_km} km`)

    if (route.elevation_profile && route.elevation_profile.length > 0) {
      const elevSlot = detailPanelEl.querySelector('#detail-elevation-slot') as HTMLElement
      if (elevSlot) {
        renderElevationChart(elevSlot, route.elevation_profile, route.distance_km, route.elevation_gain_m)
      }
    }

    const amenitySlot = detailPanelEl.querySelector('#detail-amenity-slot') as HTMLElement
    if (amenitySlot) {
      const { water, toilet } = getCachedAmenities()
      const metrics = computeAmenityMetrics(
        route.geometry.coordinates,
        water,
        toilet,
        route.distance_km,
      )
      renderAmenityMetrics(amenitySlot, metrics)
    }
  } catch (err) {
    console.warn('[RunSG] Could not load route geometry:', err)
  }
}

function handleRouteDeselect(): void {
  closeDetail(detailPanelEl)
  deselectRoute()
  setAmenityActiveRoute(null)
  selectedRouteId = null
  setActiveCard(null)
  clearRouteHash()
}

// ─── Route Not Found (T-036) ─────────────────────────────────────────────────

function showRouteNotFound(routeId: string): void {
  const bodyEl = document.getElementById('detail-body')!
  const titleEl = document.getElementById('detail-title')!
  titleEl.textContent = 'Route Not Found'
  bodyEl.innerHTML = `
    <div class="empty-state" style="padding-top:var(--space-8)">
      <div class="empty-state-icon">🚫</div>
      <div class="empty-state-title">Route not found</div>
      <div class="empty-state-desc">
        No route matches the ID "<strong>${routeId}</strong>".<br/>
        It may have been removed or the link is incorrect.
      </div>
      <button class="btn btn-primary" id="btn-go-home" style="margin-top:var(--space-4)">Browse all routes</button>
    </div>
  `
  detailPanelEl.classList.add('open')
  document.getElementById('btn-go-home')?.addEventListener('click', () => {
    handleRouteDeselect()
  })
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  initTheme()

  const map = initMap('map')
  initAmenityControls(map)

  try {
    allRoutes = await loadRouteIndex()

    initRouteCards(allRoutes)
    initFilters(allRoutes, handleFilterChange)
    renderFilters(filtersContainerEl)

    updateRouteCount(allRoutes.length, allRoutes.length)
    renderRouteCards(routeListEl, allRoutes, selectedRouteId, handleRouteSelect)

    renderRoutes(allRoutes)

    // T-087a: Init zoom render guard after routes are rendered
    initZoomRenderGuard()

    // T-074–T-076: Init Near Me shelf asynchronously (non-blocking)
    initNearMeShelf(routeListEl, allRoutes, selectedRouteId, handleRouteSelect)
      .catch(() => { /* graceful silence if geolocation denied */ })
  } catch {
    routeListEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${svg('CircleAlert', 36)}</div>
        <div class="empty-state-title">Could not load routes</div>
        <div class="empty-state-desc">Route data is not available yet. Run the data pipeline scripts first.</div>
      </div>`
    routeCountEl.textContent = '0 routes'
  }

  const loadingEl = document.getElementById('map-loading')
  if (loadingEl) {
    setTimeout(() => {
      loadingEl.classList.add('hidden')
      map.resize()
    }, 500)
  }

  // Map polyline click → route select
  onRouteSelected((id) => handleRouteSelect(id))

  // Close detail panel button
  document.getElementById('btn-detail-close')?.addEventListener('click', handleRouteDeselect)

  // Filter toggle
  document.getElementById('btn-toggle-filters')?.addEventListener('click', toggleFilters)

  // Sidebar toggle (hamburger)
  document.getElementById('btn-sidebar-toggle')?.addEventListener('click', toggleSidebar)

  // Header search bar: fuzzy dropdown + sidebar filter
  const headerSearchEl = document.getElementById('header-search') as HTMLInputElement | null
  if (headerSearchEl) {
    // Init fuzzy dropdown — fires handleRouteSelect on pick
    initSearchDropdown(headerSearchEl, allRoutes, (id) => {
      handleRouteSelect(id)
      // Expand sidebar if collapsed so card becomes visible
      if (sidebarCollapsed) toggleSidebar()
    })

    // Also filter sidebar list as user types (same as before)
    headerSearchEl.addEventListener('input', () => {
      const q = headerSearchEl.value.trim()
      const filtered = allRoutes.filter((r) => {
        if (!q) return true
        const haystack = `${r.name} ${r.description ?? ''} ${r.tags.join(' ')} ${r.region}`.toLowerCase()
        return haystack.includes(q.toLowerCase())
      })
      updateRouteCount(filtered.length, allRoutes.length)
      renderRouteCards(routeListEl, filtered, selectedRouteId, handleRouteSelect)
      if (filtered.length === allRoutes.length) {
        showAllRoutes()
      } else {
        filterVisibleRoutes(new Set(filtered.map((r) => r.id)))
      }
      if (sidebarCollapsed && q) toggleSidebar()
    })
  }

  // Quick pills
  initQuickPills()

  // Near Me button in header
  document.getElementById('btn-near-me')?.addEventListener('click', async () => {
    showStatus('Finding runs near you…')
    const success = await initNearMeShelf(routeListEl, allRoutes, selectedRouteId, handleRouteSelect)
    if (!success) {
      showStatus('Location permission denied or unavailable.')
    } else {
      showStatus('Found runs near you!')
    }
  })

  // Logo → reset view
  document.getElementById('logo-home')?.addEventListener('click', (e) => {
    e.preventDefault()
    handleRouteDeselect()
    resetView()
  })

  // Theme toggle (T-077–T-080)
  document.getElementById('btn-theme')?.addEventListener('click', toggleTheme)

  // Hash router (T-034, T-035, T-036)
  onHashRoute((routeId) => {
    const exists = allRoutes.some((r) => r.id === routeId)
    if (exists) {
      handleRouteSelect(routeId)
    } else {
      showRouteNotFound(routeId)
    }
  })

  onHashHome(() => {
    handleRouteDeselect()
  })

  initRouter()
}

bootstrap()
