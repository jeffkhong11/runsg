// search-dropdown.ts — Fuzzy search typeahead dropdown for the header search bar
// Shows up to 6 instant suggestions as the user types, with keyboard navigation.
// Fuzzy matching: ranks by (1) name prefix > (2) name contains > (3) tag/region match.

import type { RouteIndexEntry } from '../types/route.ts'
import { svg } from '../ui/icon-system.ts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
  route: RouteIndexEntry
  score: number        // higher = better match
  matchField: string   // 'name' | 'tag' | 'region' | 'desc'
  highlight: string    // HTML with match highlighted
}

// ─── Fuzzy Scoring ────────────────────────────────────────────────────────────

const MAX_RESULTS = 6

function score(route: RouteIndexEntry, query: string): SearchResult | null {
  const q = query.toLowerCase().trim()
  if (!q) return null

  const name    = route.name.toLowerCase()
  const region  = route.region.toLowerCase()
  const tags    = route.tags.join(' ').toLowerCase()
  const desc    = (route.description ?? '').toLowerCase()

  let matchScore = 0
  let matchField = ''

  // Tier 1: Name starts with query
  if (name.startsWith(q)) {
    matchScore = 100 + (q.length / name.length) * 50
    matchField = 'name'
  }
  // Tier 2: Name contains query word
  else if (name.includes(q)) {
    matchScore = 70 + (q.length / name.length) * 30
    matchField = 'name'
  }
  // Tier 3: Any word in name starts with query
  else if (name.split(' ').some(w => w.startsWith(q))) {
    matchScore = 60
    matchField = 'name'
  }
  // Tier 4: Tags match
  else if (tags.includes(q)) {
    matchScore = 40
    matchField = 'tag'
  }
  // Tier 5: Region match
  else if (region.includes(q)) {
    matchScore = 30
    matchField = 'region'
  }
  // Tier 6: Description contains (partial, last resort)
  else if (desc.includes(q)) {
    matchScore = 15
    matchField = 'desc'
  }

  if (matchScore === 0) return null

  // Highlight the matching portion in the route name
  const highlight = highlightMatch(route.name, query)

  return { route, score: matchScore, matchField, highlight }
}

function highlightMatch(text: string, query: string): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return escHtml(text)
  return (
    escHtml(text.slice(0, idx)) +
    `<mark>${escHtml(text.slice(idx, idx + query.length))}</mark>` +
    escHtml(text.slice(idx + query.length))
  )
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ─── Fuzzy Search ─────────────────────────────────────────────────────────────

export function fuzzySearch(routes: RouteIndexEntry[], query: string): SearchResult[] {
  if (!query.trim()) return []

  return routes
    .map(r => score(r, query))
    .filter((r): r is SearchResult => r !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
}

// ─── Route Type Colors ────────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  pcn:   '#16c95d',
  trail: '#d97706',
  road:  '#6366f1',
  mixed: '#0891b2',
}

const TYPE_LABEL: Record<string, string> = {
  pcn: 'PCN', trail: 'Trail', road: 'Road', mixed: 'Mixed',
}

// ─── Dropdown UI ──────────────────────────────────────────────────────────────

let _dropdownEl: HTMLElement | null = null
let _results: SearchResult[] = []
let _activeIdx = -1
let _onSelect: ((id: string) => void) | null = null

/**
 * Initialise the search dropdown and wire it to the header search input.
 * @param inputEl     The #header-search <input> element
 * @param routes      All routes (from index.json)
 * @param onSelect    Callback when user picks a result (route id)
 */
export function initSearchDropdown(
  inputEl: HTMLInputElement,
  routes: RouteIndexEntry[],
  onSelect: (id: string) => void,
): void {
  _onSelect = onSelect

  // Create dropdown container
  _dropdownEl = document.createElement('div')
  _dropdownEl.className = 'search-dropdown'
  _dropdownEl.id = 'search-dropdown'
  _dropdownEl.setAttribute('role', 'listbox')
  _dropdownEl.setAttribute('aria-label', 'Route suggestions')
  _dropdownEl.hidden = true

  // Insert after the input's parent (.header-search-wrap)
  const wrap = inputEl.closest('.header-search-wrap')
  if (wrap) wrap.appendChild(_dropdownEl)

  // ── Input: fuzzy search on each keystroke ──
  inputEl.addEventListener('input', () => {
    const q = inputEl.value
    _results = fuzzySearch(routes, q)
    _activeIdx = -1
    renderDropdown(q)
  })

  // ── Keyboard navigation ──
  inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
    if (!_dropdownEl || _dropdownEl.hidden) return
    const items = _dropdownEl.querySelectorAll<HTMLElement>('.search-item')

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      _activeIdx = Math.min(_activeIdx + 1, items.length - 1)
      updateActive(items)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      _activeIdx = Math.max(_activeIdx - 1, -1)
      updateActive(items)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (_activeIdx >= 0 && _results[_activeIdx]) {
        pickResult(_results[_activeIdx].route.id, inputEl)
      }
    } else if (e.key === 'Escape') {
      closeDropdown()
    }
  })

  // ── Close on outside click ──
  document.addEventListener('click', (e) => {
    if (!_dropdownEl) return
    const wrap = inputEl.closest('.header-search-wrap')
    if (wrap && !wrap.contains(e.target as Node)) {
      closeDropdown()
    }
  })

  // ── Re-open on focus if there's a query ──
  inputEl.addEventListener('focus', () => {
    if (inputEl.value.trim()) {
      _results = fuzzySearch(routes, inputEl.value)
      renderDropdown(inputEl.value)
    }
  })
}

function renderDropdown(query: string): void {
  if (!_dropdownEl) return

  if (_results.length === 0 || !query.trim()) {
    closeDropdown()
    return
  }

  _dropdownEl.innerHTML = _results.map((res, i) => {
    const color = TYPE_COLOR[res.route.type] ?? '#16c95d'
    const label = TYPE_LABEL[res.route.type] ?? res.route.type.toUpperCase()
    const regionCap = res.route.region.charAt(0).toUpperCase() + res.route.region.slice(1)
    const distKm = res.route.distance_km

    return `
      <div class="search-item${i === _activeIdx ? ' active' : ''}"
           role="option"
           data-route-id="${res.route.id}"
           aria-selected="${i === _activeIdx}">
        <div class="search-item-icon" style="color:${color}">
          ${svg('MapPin', 14)}
        </div>
        <div class="search-item-body">
          <div class="search-item-name">${res.highlight}</div>
          <div class="search-item-meta">
            <span class="search-item-badge" style="background:${color}22;color:${color}">${label}</span>
            <span class="search-item-region">${regionCap}</span>
            <span class="search-item-dist">${distKm} km</span>
          </div>
        </div>
        <div class="search-item-arrow">${svg('ChevronRight', 13)}</div>
      </div>`
  }).join('')

  // Wire click events
  _dropdownEl.querySelectorAll<HTMLElement>('.search-item').forEach((el) => {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault() // prevent blur before click
      const id = el.dataset['routeId']!
      const inputEl = document.getElementById('header-search') as HTMLInputElement
      pickResult(id, inputEl)
    })
  })

  _dropdownEl.hidden = false
}

function updateActive(items: NodeListOf<HTMLElement>): void {
  items.forEach((el, i) => {
    el.classList.toggle('active', i === _activeIdx)
    el.setAttribute('aria-selected', String(i === _activeIdx))
  })
}

function pickResult(id: string, inputEl: HTMLInputElement): void {
  const route = _results.find(r => r.route.id === id)?.route
  if (route && inputEl) {
    inputEl.value = route.name
    inputEl.blur()
  }
  closeDropdown()
  _onSelect?.(id)
}

function closeDropdown(): void {
  if (_dropdownEl) _dropdownEl.hidden = true
  _activeIdx = -1
}

/** Update the routes list (e.g. after data reload). */
export function updateSearchRoutes(_routes: RouteIndexEntry[]): void {
  // Routes reference is closed over; call initSearchDropdown again if needed.
}
