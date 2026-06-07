// filters.ts — Filter sidebar component (T-025, T-026, T-027)
// Renders filter UI and applies filter logic to route list + map

import type { RouteIndexEntry } from '../types/route.ts'
import { svg } from './icon-system.ts'

// ─── Filter State ────────────────────────────────────────────────────────────

export interface FilterState {
  search: string
  distanceBuckets: Set<string>    // '<5' | '5-10' | '10-20' | '20+'
  regions: Set<string>            // 'east' | 'west' | 'north' | 'south' | 'central'
  types: Set<string>              // 'pcn' | 'trail' | 'road' | 'mixed'
  difficulties: Set<string>       // 'easy' | 'moderate' | 'hard'
  lighting: Set<string>           // 'well-lit' | 'partial' | 'dark'
}

export function createDefaultFilters(): FilterState {
  return {
    search: '',
    distanceBuckets: new Set(),
    regions: new Set(),
    types: new Set(),
    difficulties: new Set(),
    lighting: new Set(),
  }
}

let currentFilters: FilterState = createDefaultFilters()
let onFilterChangeCallback: ((filtered: RouteIndexEntry[]) => void) | null = null
let allRoutes: RouteIndexEntry[] = []

// ─── Filter Logic (T-026) ────────────────────────────────────────────────────

function matchesDistanceBucket(km: number, bucket: string): boolean {
  switch (bucket) {
    case '<5':    return km < 5
    case '5-10':  return km >= 5 && km < 10
    case '10-20': return km >= 10 && km < 20
    case '20+':   return km >= 20
    default:      return true
  }
}

export function applyFilters(routes: RouteIndexEntry[]): RouteIndexEntry[] {
  const f = currentFilters

  return routes.filter((r) => {
    // Text search (T-027)
    if (f.search) {
      const q = f.search.toLowerCase()
      const searchable = `${r.name} ${r.description} ${r.tags.join(' ')} ${r.region}`.toLowerCase()
      if (!searchable.includes(q)) return false
    }

    // Distance buckets
    if (f.distanceBuckets.size > 0) {
      let matchesAny = false
      for (const bucket of f.distanceBuckets) {
        if (matchesDistanceBucket(r.distance_km, bucket)) { matchesAny = true; break }
      }
      if (!matchesAny) return false
    }

    // Region
    if (f.regions.size > 0 && !f.regions.has(r.region)) return false

    // Type
    if (f.types.size > 0 && !f.types.has(r.type)) return false

    // Difficulty
    if (f.difficulties.size > 0 && !f.difficulties.has(r.difficulty)) return false

    // Lighting
    if (f.lighting.size > 0 && !f.lighting.has(r.lighting)) return false

    return true
  })
}

function emitFilterChange(): void {
  const filtered = applyFilters(allRoutes)
  onFilterChangeCallback?.(filtered)
}

// ─── Render Filter UI (T-025) ────────────────────────────────────────────────

function createCheckboxGroup(
  label: string,
  groupId: string,
  options: { value: string; label: string; color?: string }[],
  stateSet: Set<string>
): string {
  const items = options.map((opt) => {
    const colorDot = opt.color
      ? `<span class="filter-color-dot" style="background:${opt.color}"></span>`
      : ''
    return `
      <label class="filter-checkbox" data-group="${groupId}" data-value="${opt.value}">
        <input type="checkbox" ${stateSet.has(opt.value) ? 'checked' : ''} />
        ${colorDot}
        <span>${opt.label}</span>
      </label>`
  }).join('')

  return `
    <div class="filter-group" id="filter-${groupId}">
      <div class="filter-group-title">${label}</div>
      <div class="filter-group-options">${items}</div>
    </div>`
}

export function renderFilters(containerEl: HTMLElement): void {
  const f = currentFilters

  containerEl.innerHTML = `
    <!-- Search (T-027) -->
    <div class="filter-search-wrap">
      <span class="filter-search-icon">${svg('Search', 14)}</span>
      <input
        type="text"
        class="filter-search"
        id="filter-search"
        placeholder="Search routes, tags…"
        value="${f.search}"
        aria-label="Search routes"
      />
      ${f.search ? '<button class="filter-search-clear" id="filter-search-clear" title="Clear search">✕</button>' : ''}
    </div>

    <!-- Distance buckets -->
    ${createCheckboxGroup('Distance', 'distance', [
      { value: '<5', label: '< 5 km' },
      { value: '5-10', label: '5–10 km' },
      { value: '10-20', label: '10–20 km' },
      { value: '20+', label: '20+ km' },
    ], f.distanceBuckets)}

    <!-- Region -->
    ${createCheckboxGroup('Region', 'region', [
      { value: 'east', label: 'East' },
      { value: 'west', label: 'West' },
      { value: 'north', label: 'North' },
      { value: 'south', label: 'South' },
      { value: 'central', label: 'Central' },
    ], f.regions)}

    <!-- Type -->
    ${createCheckboxGroup('Type', 'type', [
      { value: 'pcn', label: 'PCN', color: '#22c55e' },
      { value: 'trail', label: 'Trail', color: '#ca8a04' },
      { value: 'road', label: 'Road', color: '#6366f1' },
      { value: 'mixed', label: 'Mixed', color: '#06b6d4' },
    ], f.types)}

    <!-- Difficulty -->
    ${createCheckboxGroup('Difficulty', 'difficulty', [
      { value: 'easy', label: 'Easy', color: '#22c55e' },
      { value: 'moderate', label: 'Moderate', color: '#f59e0b' },
      { value: 'hard', label: 'Hard', color: '#ef4444' },
    ], f.difficulties)}

    <!-- Lighting -->
    ${createCheckboxGroup('Lighting', 'lighting', [
      { value: 'well-lit', label: '💡 Well-lit' },
      { value: 'partial', label: '🕯️ Partial' },
      { value: 'dark', label: '🌑 Dark' },
    ], f.lighting)}

    <!-- Reset button -->
    <button class="btn btn-ghost filter-reset" id="filter-reset">
      ↺ Reset all filters
    </button>
  `

  // Wire up event listeners
  wireFilterEvents(containerEl)
}

function wireFilterEvents(containerEl: HTMLElement): void {
  // Search input
  const searchInput = containerEl.querySelector('#filter-search') as HTMLInputElement | null
  searchInput?.addEventListener('input', () => {
    currentFilters.search = searchInput.value.trim()
    emitFilterChange()
    // Re-render to show/hide clear button
    const clearBtn = containerEl.querySelector('#filter-search-clear')
    if (currentFilters.search && !clearBtn) {
      const wrap = containerEl.querySelector('.filter-search-wrap')
      if (wrap) {
        const btn = document.createElement('button')
        btn.className = 'filter-search-clear'
        btn.id = 'filter-search-clear'
        btn.title = 'Clear search'
        btn.textContent = '✕'
        btn.addEventListener('click', () => {
          currentFilters.search = ''
          searchInput.value = ''
          btn.remove()
          emitFilterChange()
        })
        wrap.appendChild(btn)
      }
    } else if (!currentFilters.search && clearBtn) {
      clearBtn.remove()
    }
  })

  // Clear search button
  containerEl.querySelector('#filter-search-clear')?.addEventListener('click', () => {
    currentFilters.search = ''
    if (searchInput) searchInput.value = ''
    containerEl.querySelector('#filter-search-clear')?.remove()
    emitFilterChange()
  })

  // Checkbox groups
  const stateMap: Record<string, Set<string>> = {
    distance: currentFilters.distanceBuckets,
    region: currentFilters.regions,
    type: currentFilters.types,
    difficulty: currentFilters.difficulties,
    lighting: currentFilters.lighting,
  }

  containerEl.querySelectorAll('.filter-checkbox input[type="checkbox"]').forEach((input) => {
    input.addEventListener('change', () => {
      const label = input.closest('.filter-checkbox') as HTMLElement
      const group = label.dataset['group']!
      const value = label.dataset['value']!
      const set = stateMap[group]
      if (!set) return

      if ((input as HTMLInputElement).checked) {
        set.add(value)
      } else {
        set.delete(value)
      }
      emitFilterChange()
    })
  })

  // Reset button
  containerEl.querySelector('#filter-reset')?.addEventListener('click', () => {
    currentFilters = createDefaultFilters()
    renderFilters(containerEl)
    emitFilterChange()
  })
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function initFilters(
  routes: RouteIndexEntry[],
  onChange: (filtered: RouteIndexEntry[]) => void
): void {
  allRoutes = routes
  onFilterChangeCallback = onChange
}

export function getFilterState(): FilterState {
  return currentFilters
}

export function getActiveFilterCount(): number {
  const f = currentFilters
  let count = 0
  if (f.search) count++
  count += f.distanceBuckets.size
  count += f.regions.size
  count += f.types.size
  count += f.difficulties.size
  count += f.lighting.size
  return count
}
