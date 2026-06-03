// route-card.ts — Netflix-style curated route shelves (T-028, T-074, T-075, T-076)
// Renders themed horizontally scrolling card shelves instead of a flat list.

import type { RouteIndexEntry } from '../types/route.ts'
import { getUserLocation, sortByProximity, formatProximity } from '../services/geolocation.ts'

// ─── Constants ───────────────────────────────────────────────────────────────

const ROUTE_COLORS: Record<string, string> = {
  pcn: '#22c55e', trail: '#ca8a04', road: '#6366f1', mixed: '#06b6d4',
}

const ROUTE_GRADIENT: Record<string, string> = {
  pcn:   'linear-gradient(135deg, #22c55e22, #16a34a11)',
  trail: 'linear-gradient(135deg, #ca8a0422, #92400e11)',
  road:  'linear-gradient(135deg, #6366f122, #4338ca11)',
  mixed: 'linear-gradient(135deg, #06b6d422, #0e749111)',
}

function difficultyLabel(d: string): string {
  return d.charAt(0).toUpperCase() + d.slice(1)
}
function routeTypeLabel(t: string): string {
  return t === 'pcn' ? 'PCN' : t.charAt(0).toUpperCase() + t.slice(1)
}

// ─── Card Template ────────────────────────────────────────────────────────────

function buildCard(r: RouteIndexEntry, selectedId: string | null, distStr?: string): string {
  const color = ROUTE_COLORS[r.type] ?? '#22c55e'
  const gradient = ROUTE_GRADIENT[r.type] ?? ''
  const isActive = r.id === selectedId
  const distBadge = distStr ? `<span class="card-distance-badge">${distStr}</span>` : ''
  const imageBg = r.images && r.images.length > 0
    ? `background-image: url('${r.images[0]}'); background-size: cover; background-position: center;`
    : `background: ${gradient};`

  return `
    <div class="route-card${isActive ? ' active' : ''}"
         style="--route-color:${color}"
         data-route-id="${r.id}"
         role="button"
         tabindex="0"
         aria-label="View route: ${r.name}">
      <div class="route-card-img" style="${imageBg}">
        <span class="badge badge-type-${r.type} card-type-badge">${routeTypeLabel(r.type)}</span>
        ${distBadge}
      </div>
      <div class="route-card-body">
        <div class="route-card-name">${r.name}</div>
        <div class="route-card-meta">
          <span class="stat-pill"><span class="stat-icon">📏</span>${r.distance_km} km</span>
          <span class="badge badge-difficulty-${r.difficulty}">${difficultyLabel(r.difficulty)}</span>
          ${r.loop ? '<span class="badge badge-loop">🔄 Loop</span>' : ''}
        </div>
        <div class="route-card-footer">
          <span class="card-region">${r.region.charAt(0).toUpperCase() + r.region.slice(1)}</span>
          <span class="card-lighting ${r.lighting === 'well-lit' ? 'lit' : ''}">${r.lighting === 'well-lit' ? '💡' : r.lighting === 'partial' ? '🕯️' : '🌑'}</span>
        </div>
      </div>
    </div>`
}

// ─── Shelf Builder ────────────────────────────────────────────────────────────

function buildShelf(
  title: string,
  emoji: string,
  routes: RouteIndexEntry[],
  selectedId: string | null,
  distMap?: Map<string, string>,
): string {
  if (routes.length === 0) return ''
  const cards = routes
    .slice(0, 20) // max 20 per shelf to keep performance
    .map((r) => buildCard(r, selectedId, distMap?.get(r.id)))
    .join('')

  return `
    <div class="route-shelf">
      <div class="shelf-header">
        <span class="shelf-emoji">${emoji}</span>
        <span class="shelf-title">${title}</span>
        <span class="shelf-count">${routes.length}</span>
      </div>
      <div class="shelf-scroll">
        ${cards}
      </div>
    </div>`
}

// ─── Shelf Definitions (curated themes, FR-04) ───────────────────────────────

function getCuratedShelves(routes: RouteIndexEntry[]) {
  // Curated: top 8 non-PCN routes or highest-rated trails
  const curated = routes.filter((r) => r.type === 'trail' || r.type === 'mixed').slice(0, 8)

  // Waterfront: routes with coastal/waterfront-related tags or names
  const waterfrontKeywords = ['coast', 'sea', 'bay', 'river', 'canal', 'beach', 'marina', 'reservoir', 'changi', 'east coast', 'kallang', 'pandan']
  const waterfront = routes.filter((r) =>
    waterfrontKeywords.some((kw) => r.name.toLowerCase().includes(kw) || r.tags.some((t) => t.includes(kw)))
  )

  // Night runs: well-lit only
  const nightRuns = routes.filter((r) => r.lighting === 'well-lit')

  // Long runs: 10km+
  const longRuns = routes.filter((r) => r.distance_km >= 10).sort((a, b) => b.distance_km - a.distance_km)

  // All PCN paved routes
  const pcn = routes.filter((r) => r.type === 'pcn')

  // Short runs: <5km — great for beginners
  const shortRuns = routes.filter((r) => r.distance_km < 5)

  return { curated, waterfront, nightRuns, longRuns, pcn, shortRuns }
}

// ─── Render ──────────────────────────────────────────────────────────────────

let _allRoutes: RouteIndexEntry[] = []
let _nearMeShelfHtml: string = ''
let _distMap: Map<string, string> = new Map()
let _isFiltered = false

/**
 * Render the curated Netflix-style shelves into the container.
 */
export function renderRouteCards(
  containerEl: HTMLElement,
  routes: RouteIndexEntry[],
  selectedId: string | null,
  onSelect: (routeId: string) => void,
): void {
  _isFiltered = routes.length < _allRoutes.length

  if (routes.length === 0) {
    containerEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-title">No routes found</div>
        <div class="empty-state-desc">Try adjusting your filters or search terms.</div>
      </div>`
    return
  }

  // If filtered, show a simple flat list instead of shelves
  if (_isFiltered) {
    containerEl.innerHTML = `
      <div class="route-shelf">
        <div class="shelf-header">
          <span class="shelf-emoji">🔎</span>
          <span class="shelf-title">Filtered Results</span>
          <span class="shelf-count">${routes.length}</span>
        </div>
        <div class="shelf-scroll">
          ${routes.map((r) => buildCard(r, selectedId)).join('')}
        </div>
      </div>`
    wireCardEvents(containerEl, onSelect)
    return
  }

  _renderShelves(containerEl, routes, selectedId)
  wireCardEvents(containerEl, onSelect)
}

function _renderShelves(containerEl: HTMLElement, routes: RouteIndexEntry[], selectedId: string | null): void {
  const { curated, waterfront, nightRuns, longRuns, pcn, shortRuns } = getCuratedShelves(routes)

  containerEl.innerHTML = `
    ${_nearMeShelfHtml}
    ${buildShelf('Top Curated Trails', '🌲', curated, selectedId)}
    ${buildShelf('Waterfront & Scenic', '🌊', waterfront, selectedId)}
    ${buildShelf('Night Running (Well-Lit)', '🌙', nightRuns, selectedId)}
    ${buildShelf('Long Run Sunday (10km+)', '🏃', longRuns, selectedId)}
    ${buildShelf('Paved Park Connectors', '🏙️', pcn, selectedId)}
    ${buildShelf('Quick Runs (<5km)', '⚡', shortRuns, selectedId)}
  `
}

/**
 * Initialize with all routes reference (needed to distinguish filtered vs full).
 */
export function initRouteCards(allRoutes: RouteIndexEntry[]): void {
  _allRoutes = allRoutes
}

/**
 * Wire "Near Me" shelf after geolocation resolves (T-074, T-075, T-076).
 */
export async function initNearMeShelf(
  containerEl: HTMLElement,
  routes: RouteIndexEntry[],
  selectedId: string | null,
  onSelect: (routeId: string) => void,
): Promise<void> {
  const pos = await getUserLocation()
  if (!pos) {
    // T-076: gracefully hide if denied — no error, no shelf
    return
  }

  const { latitude, longitude } = pos.coords
  const sorted = sortByProximity(routes, latitude, longitude).slice(0, 10)

  _distMap = new Map(sorted.map((r) => [r.route.id, formatProximity(r.distanceKm)]))

  const nearMeRoutes = sorted.map((r) => r.route)
  _nearMeShelfHtml = buildShelf('Nearest Runs to You 📍', '📍', nearMeRoutes, selectedId, _distMap)

  // Re-render shelves with the near-me shelf injected at the top
  if (!_isFiltered && containerEl) {
    _renderShelves(containerEl, routes, selectedId)
    wireCardEvents(containerEl, onSelect)
  }
}

// ─── Active Card State ────────────────────────────────────────────────────────

export function setActiveCard(routeId: string | null): void {
  document.querySelectorAll('.route-card').forEach((el) => {
    el.classList.toggle('active', (el as HTMLElement).dataset['routeId'] === routeId)
  })
}

export function scrollToCard(routeId: string): void {
  const card = document.querySelector(`.route-card[data-route-id="${routeId}"]`)
  card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

// ─── Event Wiring ─────────────────────────────────────────────────────────────

function wireCardEvents(containerEl: HTMLElement, onSelect: (id: string) => void): void {
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
