// pace-estimator.ts — Estimated run time based on user pace (T-049, T-050, T-051)

const PACE_OPTIONS = [
  { label: '4:30 min/km', value: 4.5 },
  { label: '5:00 min/km', value: 5.0 },
  { label: '5:30 min/km', value: 5.5 },
  { label: '6:00 min/km', value: 6.0 },
  { label: '6:30 min/km', value: 6.5 },
  { label: '7:00 min/km', value: 7.0 },
  { label: '7:30 min/km', value: 7.5 },
  { label: '8:00 min/km', value: 8.0 },
]

const LS_KEY = 'runsg-pace'

function getStoredPace(): number {
  const saved = localStorage.getItem(LS_KEY)
  return saved ? parseFloat(saved) : 6.0
}

function storePace(pace: number): void {
  localStorage.setItem(LS_KEY, String(pace))
}

function formatTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = Math.round(totalMinutes % 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}

/**
 * Render estimated run time section with pace selector.
 */
export function renderPaceEstimator(containerEl: HTMLElement, distanceKm: number): void {
  const currentPace = getStoredPace()
  const estTime = distanceKm * currentPace

  containerEl.innerHTML = `
    <div class="detail-section-title">Estimated Time</div>
    <div class="pace-estimator">
      <div class="pace-result">
        <span class="pace-time" id="pace-time">${formatTime(estTime)}</span>
        <span class="pace-subtext">at <span id="pace-display">${currentPace.toFixed(1)}</span> min/km</span>
      </div>
      <div class="pace-selector-row">
        <label for="pace-select" class="pace-label">Pace</label>
        <select id="pace-select" class="pace-select">
          ${PACE_OPTIONS.map(p => `<option value="${p.value}" ${p.value === currentPace ? 'selected' : ''}>${p.label}</option>`).join('')}
        </select>
      </div>
    </div>
  `

  const selectEl = containerEl.querySelector('#pace-select') as HTMLSelectElement
  const timeEl = containerEl.querySelector('#pace-time') as HTMLElement
  const displayEl = containerEl.querySelector('#pace-display') as HTMLElement

  selectEl?.addEventListener('change', () => {
    const pace = parseFloat(selectEl.value)
    storePace(pace)
    const est = distanceKm * pace
    if (timeEl) timeEl.textContent = formatTime(est)
    if (displayEl) displayEl.textContent = pace.toFixed(1)
  })
}
