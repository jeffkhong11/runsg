// route-card.ts — Route card component (T-028, T-029, T-030)
// Renders the scrollable route card list in the sidebar

import type { RouteIndexEntry } from '../types/route.ts'

// ─── Constants ───────────────────────────────────────────────────────────────

const ROUTE_COLORS: Record<string, string> = {
  pcn: '#22c55e', trail: '#ca8a04', road: '#6366f1', mixed: '#06b6d4',
}

function difficultyLabel(d: string): string {
  return d.charAt(0).toUpperCase() + d.slice(1)
}

function routeTypeLabel(t: string): string {
  return t === 'pcn' ? 'PCN' : t.charAt(0).toUpperCase() + t.slice(1)
}

function sourceLabel(s: string): string {
  return s.toUpperCase()
}

// ─── Render ──────────────────────────────────────────────────────────────────

export function renderRouteCards(
  containerEl: HTMLElement,
  routes: RouteIndexEntry[],
  selectedId: string | null,
  onSelect: (routeId: string) => void
): void {
  if (routes.length === 0) {
    containerEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-title">No routes found</div>
        <div class="empty-state-desc">Try adjusting your filters or search terms.</div>
      </div>`
    return
  }

  containerEl.innerHTML = routes.map((r) => {
    const color = ROUTE_COLORS[r.type] ?? '#22c55e'
    const isActive = r.id === selectedId
    return `
      <div class="route-card${isActive ? ' active' : ''}"
           style="--route-color:${color}"
           data-route-id="${r.id}"
           role="button"
           tabindex="0"
           aria-label="View route: ${r.name}">
        <div class="route-card-header">
          <div class="route-card-name">${r.name}</div>
          <span class="badge badge-source route-card-source">${sourceLabel(r.source)}</span>
        </div>
        <div class="route-card-meta">
          <span class="badge badge-type-${r.type}">${routeTypeLabel(r.type)}</span>
          <span class="badge badge-difficulty-${r.difficulty}">${difficultyLabel(r.difficulty)}</span>
          ${r.loop ? '<span class="badge badge-loop">🔄 Loop</span>' : ''}
        </div>
        <div class="route-card-stats">
          <span class="stat-pill"><span class="stat-icon">📏</span>${r.distance_km} km</span>
          <span class="stat-pill"><span class="stat-icon">⬆️</span>${r.elevation_gain_m} m</span>
          <span class="stat-pill"><span class="stat-icon">${regionIcon(r.region)}</span>${regionLabel(r.region)}</span>
        </div>
      </div>`
  }).join('')

  // Click + keyboard listeners
  containerEl.querySelectorAll('.route-card').forEach((card) => {
    const id = (card as HTMLElement).dataset['routeId']!
    card.addEventListener('click', () => onSelect(id))
    card.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        e.preventDefault()
        onSelect(id)
      }
    })
  })
}

/**
 * Update which card has the active highlight without full re-render.
 */
export function setActiveCard(routeId: string | null): void {
  document.querySelectorAll('.route-card').forEach((el) => {
    el.classList.toggle('active', (el as HTMLElement).dataset['routeId'] === routeId)
  })
}

/**
 * Scroll the given route card into view.
 */
export function scrollToCard(routeId: string): void {
  const card = document.querySelector(`.route-card[data-route-id="${routeId}"]`)
  card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function regionIcon(region: string): string {
  const icons: Record<string, string> = {
    east: '🧭', west: '🧭', north: '🧭', south: '🧭', central: '📍',
  }
  return icons[region] ?? '📍'
}

function regionLabel(region: string): string {
  return region.charAt(0).toUpperCase() + region.slice(1)
}
