// route-detail.ts — Route detail panel component (T-031, T-032, T-033)

import type { RouteIndexEntry } from '../types/route.ts'

// ─── Constants ───────────────────────────────────────────────────────────────

const ROUTE_COLORS: Record<string, string> = {
  pcn: '#22c55e', trail: '#ca8a04', road: '#6366f1', mixed: '#06b6d4',
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

  titleEl.textContent = route.name

  const color = ROUTE_COLORS[route.type] ?? '#22c55e'
  const lightingIcon = { 'well-lit': '💡', partial: '🕯️', dark: '🌑' }[route.lighting] ?? '💡'
  const lightingClass = `lighting-${route.lighting}`

  // Surface breakdown bar
  const surfaceData = route.surface as unknown as Record<string, number>
  const surfaceBar = buildSurfaceBar(surfaceData)
  const surfaceLegend = buildSurfaceLegend(surfaceData)

  bodyEl.innerHTML = `
    <!-- Stats grid -->
    <div class="detail-section">
      <div class="detail-stats-grid">
        <div class="detail-stat">
          <div class="detail-stat-label">Distance</div>
          <div class="detail-stat-value">${route.distance_km} <span style="font-size:0.75rem;font-weight:500;color:var(--text-muted)">km</span></div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-label">Elevation Gain</div>
          <div class="detail-stat-value">${route.elevation_gain_m} <span style="font-size:0.75rem;font-weight:500;color:var(--text-muted)">m</span></div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-label">Type</div>
          <div class="detail-stat-value" style="font-size:1rem;color:${color}">${routeTypeLabel(route.type)}</div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-label">Region</div>
          <div class="detail-stat-value" style="font-size:1rem">${regionLabel(route.region)}</div>
        </div>
      </div>
    </div>

    <!-- Loop + Lighting -->
    <div class="detail-section">
      <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap">
        <span class="lighting-tag ${lightingClass}">${lightingIcon} ${route.lighting.charAt(0).toUpperCase() + route.lighting.slice(1)}</span>
        ${route.loop ? '<span class="badge badge-loop" style="font-size:0.8rem;padding:4px 10px">🔄 Loop Route</span>' : '<span class="badge badge-source" style="font-size:0.8rem;padding:4px 10px">➡️ Point-to-Point</span>'}
      </div>
    </div>

    <!-- Surface breakdown -->
    <div class="detail-section">
      <div class="detail-section-title">Surface</div>
      ${surfaceBar}
      ${surfaceLegend}
    </div>

    <!-- Description -->
    <div class="detail-section">
      <div class="detail-section-title">Description</div>
      <p style="font-size:0.875rem;color:var(--text-secondary);line-height:1.6">${route.description}</p>
    </div>

    <!-- Tags -->
    ${route.tags.length > 0 ? `
    <div class="detail-section">
      <div class="detail-section-title">Tags</div>
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-1)">
        ${route.tags.map((t) => `<span class="badge badge-source">${t}</span>`).join('')}
      </div>
    </div>` : ''}

    <!-- Source -->
    <div class="detail-section">
      <div class="detail-section-title">Data Source</div>
      <span class="badge badge-source">${route.source.toUpperCase()}</span>
    </div>

    <!-- Phase 3: Elevation profile -->
    <div class="detail-section" id="detail-elevation-slot">
      <div class="placeholder-card">
        <span class="placeholder-icon">📈</span>
        <span class="placeholder-text">Elevation profile — Phase 3</span>
      </div>
    </div>

    <!-- Phase 4: Weather widget -->
    <div class="detail-section" id="detail-weather-slot">
      <div class="placeholder-card">
        <span class="placeholder-icon">🌤️</span>
        <span class="placeholder-text">Weather — Phase 4</span>
      </div>
    </div>

    <!-- Phase 4: Amenity summary -->
    <div class="detail-section" id="detail-amenity-slot">
      <div class="placeholder-card">
        <span class="placeholder-icon">💧</span>
        <span class="placeholder-text">Amenities — Phase 4</span>
      </div>
    </div>
  `

  // Open panel
  panelEl.classList.add('open')

  // Close button
  closeBtn?.addEventListener('click', onClose, { once: true })
}

export function closeDetail(panelEl: HTMLElement): void {
  panelEl.classList.remove('open')
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
