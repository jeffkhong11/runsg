// main.ts — RunSG entry point
// Phase 2: Wire up filters, route cards, detail panel, hash router

import './style.css'
import { initMap, fitBounds, resetView } from './map/map.ts'
import { renderRoutes, onRouteSelected, selectRoute, updateRouteGeometry, deselectRoute, filterVisibleRoutes, showAllRoutes } from './map/route-layer.ts'
import { loadRouteIndex, loadRoute } from './services/data-loader.ts'
import { initFilters, renderFilters, getActiveFilterCount } from './ui/filters.ts'
import { renderRouteCards, setActiveCard, scrollToCard } from './ui/route-card.ts'
import { renderDetailPanel, closeDetail } from './ui/route-detail.ts'
import { initRouter, onHashRoute, onHashHome, setRouteHash, clearRouteHash } from './ui/router.ts'
import type { RouteIndexEntry } from './types/route.ts'

// ─── DOM Setup ───────────────────────────────────────────────────────────────

const appEl = document.getElementById('app')!

appEl.innerHTML = `
  <!-- Header -->
  <header class="app-header">
    <a href="#" class="app-logo" id="logo-home">
      <div class="app-logo-icon">🏃</div>
      <span class="app-logo-text">Run<span>SG</span></span>
    </a>
    <div class="header-spacer"></div>
    <div class="header-actions">
      <button class="btn-icon" id="btn-theme" title="Toggle dark mode" aria-label="Toggle dark mode">🌙</button>
    </div>
  </header>

  <!-- Main -->
  <main class="app-main">
    <!-- Sidebar -->
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-title-row">
          <div class="sidebar-title">🗺️ Routes</div>
          <button class="btn-icon sidebar-filter-toggle" id="btn-toggle-filters" title="Toggle filters" aria-label="Toggle filters">
            <span id="filter-icon">⚙️</span>
          </button>
        </div>
        <div class="sidebar-route-count" id="route-count">Loading…</div>
      </div>

      <!-- Filter panel (collapsible) -->
      <div class="sidebar-filters" id="sidebar-filters">
        <div id="filters-container"></div>
      </div>

      <!-- Route list -->
      <div class="route-list" id="route-list">
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
      </div>
    </aside>

    <!-- Map container -->
    <div class="map-wrapper">
      <div id="map"></div>
      <div class="map-loading" id="map-loading">
        <div class="spinner"></div>
        <div class="map-loading-text">Loading Singapore routes…</div>
      </div>
    </div>

    <!-- Route detail panel -->
    <div class="route-detail" id="route-detail">
      <div class="route-detail-header">
        <div id="detail-title" class="route-detail-title"></div>
        <button class="route-detail-close" id="btn-detail-close" title="Close" aria-label="Close detail panel">✕</button>
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

// ─── DOM Refs ────────────────────────────────────────────────────────────────

const routeListEl = document.getElementById('route-list')!
const routeCountEl = document.getElementById('route-count')!
const filtersContainerEl = document.getElementById('filters-container')!
const sidebarFiltersEl = document.getElementById('sidebar-filters')!
const detailPanelEl = document.getElementById('route-detail')!

// ─── Theme ───────────────────────────────────────────────────────────────────

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
}

function updateThemeButton(theme: string): void {
  const btn = document.getElementById('btn-theme')
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙'
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
  if (icon) icon.textContent = filtersVisible ? '✕' : '⚙️'
}

// ─── Route Count ─────────────────────────────────────────────────────────────

function updateRouteCount(showing: number, total: number): void {
  const filterCount = getActiveFilterCount()
  if (filterCount > 0) {
    routeCountEl.textContent = `${showing} of ${total} routes (${filterCount} filter${filterCount !== 1 ? 's' : ''} active)`
  } else {
    routeCountEl.textContent = `${total} route${total !== 1 ? 's' : ''}`
  }
}

// ─── Filter Change Handler ───────────────────────────────────────────────────

function handleFilterChange(filtered: RouteIndexEntry[]): void {
  updateRouteCount(filtered.length, allRoutes.length)
  renderRouteCards(routeListEl, filtered, selectedRouteId, handleRouteSelect)

  // Update map visibility
  if (filtered.length === allRoutes.length) {
    showAllRoutes()
  } else {
    const visibleIds = new Set(filtered.map((r) => r.id))
    filterVisibleRoutes(visibleIds)
  }
}

// ─── Route Selection ─────────────────────────────────────────────────────────

async function handleRouteSelect(routeId: string): Promise<void> {
  selectedRouteId = routeId

  // Update card active state
  setActiveCard(routeId)
  scrollToCard(routeId)

  // Highlight polyline on map
  selectRoute(routeId)

  // Update URL hash (T-035)
  setRouteHash(routeId)

  // Find index entry + open detail panel
  const indexEntry = allRoutes.find((r) => r.id === routeId)
  if (indexEntry) {
    renderDetailPanel(indexEntry, detailPanelEl, handleRouteDeselect)
  }

  // Load full geometry
  try {
    const route = await loadRoute(routeId)
    const map = initMap('map')
    map.invalidateSize()
    updateRouteGeometry(routeId, route.geometry.coordinates)
    if (indexEntry?.bounds) fitBounds(indexEntry.bounds)
    showStatus(`${route.name} — ${route.distance_km} km`)
  } catch (err) {
    console.warn('[RunSG] Could not load route geometry:', err)
  }
}

function handleRouteDeselect(): void {
  closeDetail(detailPanelEl)
  deselectRoute()
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

  // Init map
  const map = initMap('map')

  // Load route index
  try {
    allRoutes = await loadRouteIndex()

    // Init filters (T-025, T-026)
    initFilters(allRoutes, handleFilterChange)
    renderFilters(filtersContainerEl)

    // Render initial route list (T-028)
    updateRouteCount(allRoutes.length, allRoutes.length)
    renderRouteCards(routeListEl, allRoutes, selectedRouteId, handleRouteSelect)

    // Render polylines on map (T-019)
    renderRoutes(allRoutes)
  } catch {
    routeListEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-title">Could not load routes</div>
        <div class="empty-state-desc">Route data is not available yet. Run the data pipeline scripts first.</div>
      </div>`
    routeCountEl.textContent = '0 routes'
  }

  // Hide loading overlay
  const loadingEl = document.getElementById('map-loading')
  if (loadingEl) {
    setTimeout(() => {
      loadingEl.classList.add('hidden')
      map.invalidateSize()
    }, 500)
  }

  // Map polyline click → route select
  onRouteSelected((id) => handleRouteSelect(id))

  // Close detail panel button
  document.getElementById('btn-detail-close')?.addEventListener('click', handleRouteDeselect)

  // Filter toggle
  document.getElementById('btn-toggle-filters')?.addEventListener('click', toggleFilters)

  // Logo → reset view
  document.getElementById('logo-home')?.addEventListener('click', (e) => {
    e.preventDefault()
    handleRouteDeselect()
    resetView()
  })

  // Theme toggle
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
