// route-detail.ts — Route detail panel component (T-031, T-032, T-033)
// Phase 3: Elevation chart, pace estimator
// Phase 4: Weather widget, amenity metrics (T-069–T-071)
// Phase 5: Image carousel (T-081)
// Chunk 5: GPX export, Share, PSI air quality

import type { RouteIndexEntry } from '../types/route.ts'
import type { Route } from '../types/route.ts'
import { renderElevationChart } from './elevation-chart.ts'
import { renderPaceEstimator } from './pace-estimator.ts'
import { renderWeatherWidget } from './weather-widget.ts'
import { renderAmenityMetrics } from '../services/amenity-metrics.ts'
import { svg } from './icon-system.ts'
import { getPsiForRegion } from '../services/psi.ts'

// ─── Constants ───────────────────────────────────────────────────────────────

const ROUTE_COLORS: Record<string, string> = {
  pcn: '#16c95d', trail: '#d97706', road: '#6366f1', mixed: '#0891b2',
}

const SURFACE_COLORS: Record<string, { color: string; label: string }> = {
  tarmac:    { color: '#6366f1', label: 'Tarmac' },
  boardwalk: { color: '#f59e0b', label: 'Boardwalk' },
  trail:     { color: '#84cc16', label: 'Trail' },
  gravel:    { color: '#94a3b8', label: 'Gravel' },
}

function routeTypeLabel(t: string): string {
  return t === 'pcn' ? 'PCN' : t.charAt(0).toUpperCase() + t.slice(1)
}

function regionLabel(r: string): string {
  return r.charAt(0).toUpperCase() + r.slice(1)
}

// Track cleanup functions
let cleanupChart: (() => void) | null = null
// Track current route for GPX/Share actions
let _currentRoute: Route | null = null

// ─── Render ──────────────────────────────────────────────────────────────────

export function renderDetailPanel(
  route: RouteIndexEntry,
  panelEl: HTMLElement,
  onClose: () => void
): void {
  const titleEl = panelEl.querySelector('#detail-title') as HTMLElement
  const bodyEl = panelEl.querySelector('#detail-body') as HTMLElement
  const closeBtn = panelEl.querySelector('#btn-detail-close') as HTMLElement

  if (!titleEl || !bodyEl) return

  // Cleanup previous chart
  if (cleanupChart) {
    cleanupChart()
    cleanupChart = null
  }

  titleEl.textContent = route.name

  const color = ROUTE_COLORS[route.type] ?? '#16c95d'

  // Set accent bar color on the panel
  const accentEl = panelEl.querySelector('.route-detail-accent') as HTMLElement
  if (accentEl) accentEl.style.background = color
  panelEl.style.setProperty('--route-detail-color', color)

  const lightingIcon = {
    'well-lit': svg('Lamp', 15),
    partial: svg('MoonStar', 15),
    dark: svg('Moon', 15),
  }[route.lighting] ?? svg('Lamp', 15)
  const lightingClass = `lighting-${route.lighting}`

  // Surface breakdown bar
  const surfaceData = route.surface as unknown as Record<string, number>
  const surfaceBar = buildSurfaceBar(surfaceData)
  const surfaceLegend = buildSurfaceLegend(surfaceData)

  bodyEl.innerHTML = `
    <!-- Action buttons row (GPX export + Share) -->
    <div class="detail-actions">
      <button class="detail-action-btn" id="btn-gpx-export" title="Download GPX file">
        ${svg('Download', 14)}
        <span>GPX</span>
      </button>
      <button class="detail-action-btn" id="btn-share-route" title="Share this route">
        ${svg('Share2', 14)}
        <span>Share</span>
      </button>
    </div>

    <!-- Stats grid -->
    <div class="detail-section">
      <div class="detail-stats-grid">
        <div class="detail-stat">
          <div class="detail-stat-label">Distance</div>
          <div class="detail-stat-value">${route.distance_km}<span class="detail-stat-unit">km</span></div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-label">Elevation Gain</div>
          <div class="detail-stat-value">${route.elevation_gain_m}<span class="detail-stat-unit">m</span></div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-label">Type</div>
          <div class="detail-stat-value" style="font-size:1.1rem;color:${color}">${routeTypeLabel(route.type)}</div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-label">Region</div>
          <div class="detail-stat-value" style="font-size:1.1rem">${regionLabel(route.region)}</div>
        </div>
      </div>
    </div>

    <!-- Loop + Lighting -->
    <div class="detail-section">
      <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap">
        <span class="lighting-tag ${lightingClass}">${lightingIcon} ${route.lighting.charAt(0).toUpperCase() + route.lighting.slice(1)}</span>
        ${route.loop
          ? `<span class="badge badge-loop" style="font-size:0.8rem;padding:4px 10px">${svg('RotateCcw', 13)} Loop Route</span>`
          : `<span class="badge badge-source" style="font-size:0.8rem;padding:4px 10px">${svg('ChevronRight', 13)} Point-to-Point</span>`
        }
      </div>
    </div>

    <!-- Surface breakdown -->
    <div class="detail-section">
      <div class="detail-section-title">Surface Breakdown</div>
      ${surfaceBar}
      ${surfaceLegend}
    </div>

    <!-- Elevation profile (Phase 3) -->
    <div class="detail-section" id="detail-elevation-slot"></div>

    <!-- Estimated time (Phase 3) -->
    <div class="detail-section" id="detail-pace-slot"></div>

    <!-- Description -->
    <div class="detail-section">
      <div class="detail-section-title">About This Route</div>
      <p style="font-size:0.875rem;color:var(--text-secondary);line-height:1.65">${route.description}</p>
    </div>

    <!-- Tags -->
    ${route.tags.length > 0 ? `
    <div class="detail-section">
      <div class="detail-section-title">Tags</div>
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-1)">
        ${route.tags.map((t) => `<span class="badge badge-source">${t}</span>`).join('')}
      </div>
    </div>` : ''}

    <!-- Weather (Phase 4) -->
    <div class="detail-section" id="detail-weather-slot"></div>

    <!-- PSI Air Quality (Chunk 5) -->
    <div class="detail-section" id="detail-psi-slot"></div>

    <!-- Amenity Metrics (Phase 4, T-069–T-071) -->
    <div class="detail-section" id="detail-amenity-slot"></div>

    <!-- Images (Phase 5, T-081) -->
    ${(route.images && route.images.length > 0) ? `
    <div class="detail-section">
      <div class="detail-section-title">Photos</div>
      <div class="route-image-carousel">
        ${route.images.map((img, i) => `
          <div class="route-image-slide${i === 0 ? ' active' : ''}">
            <img src="${img}" alt="${route.name} photo ${i + 1}" loading="lazy" class="route-image"/>
          </div>
        `).join('')}
        ${route.images.length > 1 ? `
          <div class="carousel-controls">
            <button class="carousel-btn" id="carousel-prev" aria-label="Previous photo">‹</button>
            <span class="carousel-counter" id="carousel-counter">1 / ${route.images.length}</span>
            <button class="carousel-btn" id="carousel-next" aria-label="Next photo">›</button>
          </div>` : ''}
      </div>
    </div>` : ''}

    <!-- Source -->
    <div class="detail-section">
      <div class="detail-section-title">Data Source</div>
      <span class="badge badge-source">${route.source.toUpperCase()}</span>
    </div>
  `

  // Open panel
  panelEl.classList.add('open')

  // Close button
  closeBtn?.addEventListener('click', onClose, { once: true })

  // --- Phase 3: Render elevation chart ---
  const elevSlot = bodyEl.querySelector('#detail-elevation-slot') as HTMLElement
  if (elevSlot) {
    const profile = route.elevation_profile ?? []
    cleanupChart = renderElevationChart(elevSlot, profile, route.distance_km, route.elevation_gain_m)
  }

  // --- Phase 3: Render pace estimator ---
  const paceSlot = bodyEl.querySelector('#detail-pace-slot') as HTMLElement
  if (paceSlot) {
    renderPaceEstimator(paceSlot, route.distance_km)
  }

  // --- Phase 4: Render weather widget ---
  const weatherSlot = bodyEl.querySelector('#detail-weather-slot') as HTMLElement
  if (weatherSlot) {
    renderWeatherWidget(weatherSlot, route.region)
  }

  // --- Chunk 5: Render PSI air quality ---
  const psiSlot = bodyEl.querySelector('#detail-psi-slot') as HTMLElement
  if (psiSlot) {
    renderPsiBanner(psiSlot, route.region)
  }

  // --- Phase 4 T-069–T-071: Render amenity metrics placeholder ---
  // Metrics are populated by main.ts after route geometry and amenity data are loaded
  const amenitySlot = bodyEl.querySelector('#detail-amenity-slot') as HTMLElement
  if (amenitySlot) {
    amenitySlot.innerHTML = `
      <div class="detail-section-title">Amenities Along Route</div>
      <div class="amenity-metrics-loading">
        <div class="spinner-sm"></div>
        <span>Computing amenity data…</span>
      </div>`
  }

  // --- Chunk 5: Wire action buttons ---
  _wireActionButtons(bodyEl, route)

  // --- Phase 5 T-081: Wire image carousel ---
  _initCarousel(panelEl)
}

// ─── Chunk 5: Action Buttons (GPX + Share) ───────────────────────────────────

/**
 * Called by main.ts once the full Route (with geometry) is loaded.
 * Enables the GPX export button.
 */
export function setDetailRoute(route: Route): void {
  _currentRoute = route
  const btn = document.getElementById('btn-gpx-export') as HTMLButtonElement | null
  if (btn) {
    btn.disabled = false
    btn.title = `Download ${route.name} as GPX`
  }
}

function _wireActionButtons(bodyEl: HTMLElement, indexEntry: RouteIndexEntry): void {
  // GPX Export — requires full geometry, enable once setDetailRoute() is called
  const gpxBtn = bodyEl.querySelector('#btn-gpx-export') as HTMLButtonElement | null
  if (gpxBtn) {
    gpxBtn.disabled = true // enabled by setDetailRoute() once geometry loads
    gpxBtn.addEventListener('click', async () => {
      if (!_currentRoute) return
      const { downloadGpx } = await import('../services/gpx-export.ts')
      downloadGpx(_currentRoute)
      gpxBtn.textContent = ''
      gpxBtn.appendChild(Object.assign(document.createElement('span'), { textContent: '✓ Downloaded' }))
      setTimeout(() => {
        gpxBtn.innerHTML = `${svg('Download', 14)} <span>GPX</span>`
      }, 2500)
    })
  }

  // Share — Web Share API with clipboard fallback
  const shareBtn = bodyEl.querySelector('#btn-share-route') as HTMLButtonElement | null
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const url = `${window.location.origin}${window.location.pathname}#/route/${indexEntry.id}`
      const shareData = {
        title: `${indexEntry.name} — RunSG`,
        text: `${indexEntry.distance_km}km ${indexEntry.type.toUpperCase()} route in ${indexEntry.region} Singapore`,
        url,
      }
      try {
        if (navigator.share && navigator.canShare?.(shareData)) {
          await navigator.share(shareData)
        } else {
          await navigator.clipboard.writeText(url)
          shareBtn.innerHTML = `${svg('Check', 14)} <span>Copied!</span>`
          setTimeout(() => { shareBtn.innerHTML = `${svg('Share2', 14)} <span>Share</span>` }, 2500)
        }
      } catch {
        // User cancelled or API unsupported — silent fail
      }
    })
  }
}

// ─── Chunk 5: PSI Air Quality Banner ─────────────────────────────────────────

async function renderPsiBanner(containerEl: HTMLElement, region: string): Promise<void> {
  // Placeholder while fetching
  containerEl.innerHTML = `
    <div class="psi-loading">
      <div class="spinner-sm"></div>
      <span>Fetching air quality…</span>
    </div>`

  const psi = await getPsiForRegion(region)

  if (!psi) {
    containerEl.innerHTML = '' // hide slot if data unavailable
    return
  }

  const pm25Str = psi.pm25 !== undefined ? `<span class="psi-pm25">PM2.5 · ${psi.pm25} µg/m³</span>` : ''

  containerEl.innerHTML = `
    <div class="psi-banner" style="--psi-color:${psi.color}">
      <div class="psi-header">
        <div class="psi-dot" style="background:${psi.color}"></div>
        <span class="psi-title">Air Quality</span>
        <span class="psi-level" style="color:${psi.color}">${psi.label}</span>
        <span class="psi-value">PSI ${psi.psi}</span>
        ${pm25Str}
      </div>
      <div class="psi-advice">${psi.advice}</div>
    </div>`
}

function _initCarousel(panelEl: HTMLElement): void {
  const slides = panelEl.querySelectorAll('.route-image-slide')
  if (slides.length <= 1) return

  let currentIdx = 0

  const update = () => {
    slides.forEach((s, i) => s.classList.toggle('active', i === currentIdx))
    const counter = panelEl.querySelector('#carousel-counter')
    if (counter) counter.textContent = `${currentIdx + 1} / ${slides.length}`
  }

  panelEl.querySelector('#carousel-prev')?.addEventListener('click', () => {
    currentIdx = (currentIdx - 1 + slides.length) % slides.length
    update()
  })
  panelEl.querySelector('#carousel-next')?.addEventListener('click', () => {
    currentIdx = (currentIdx + 1) % slides.length
    update()
  })
}

/**
 * Called from main.ts after route geometry + amenity data are loaded.
 * Injects computed amenity metrics into the detail panel slot.
 */
export { renderAmenityMetrics }

export function closeDetail(panelEl: HTMLElement): void {
  panelEl.classList.remove('open')
  if (cleanupChart) {
    cleanupChart()
    cleanupChart = null
  }
}

// ─── Surface Helpers ─────────────────────────────────────────────────────────

function buildSurfaceBar(surface: Record<string, number>): string {
  const segments = Object.entries(surface)
    .filter(([, pct]) => pct > 0)
    .map(([type, pct]) => {
      const info = SURFACE_COLORS[type]
      if (!info) return ''
      return `<div class="surface-segment-${type}" style="width:${pct * 100}%" title="${info.label}: ${Math.round(pct * 100)}%"></div>`
    })
    .join('')

  return `<div class="surface-bar">${segments}</div>`
}

function buildSurfaceLegend(surface: Record<string, number>): string {
  const items = Object.entries(surface)
    .filter(([, pct]) => pct > 0)
    .map(([type, pct]) => {
      const info = SURFACE_COLORS[type]
      if (!info) return ''
      return `
        <div class="surface-legend-item">
          <span class="surface-legend-dot" style="background:${info.color}"></span>
          ${info.label} ${Math.round(pct * 100)}%
        </div>`
    })
    .join('')

  return `<div class="surface-legend">${items}</div>`
}
