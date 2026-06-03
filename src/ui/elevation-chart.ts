// elevation-chart.ts — Interactive elevation profile chart using Chart.js (T-043, T-045)

import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip } from 'chart.js'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip)

let chartInstance: Chart | null = null

/**
 * Render an elevation profile chart into the given container element.
 * Returns a cleanup function to destroy the chart.
 */
export function renderElevationChart(
  containerEl: HTMLElement,
  elevationProfile: number[],
  distanceKm: number,
  elevationGainM: number
): () => void {
  // Don't render if insufficient data
  if (!elevationProfile || elevationProfile.length < 3) {
    containerEl.innerHTML = `
      <div class="detail-section-title">Elevation Profile</div>
      <div class="elevation-empty">No elevation data available for this route.</div>
    `
    return () => {}
  }

  // Compute stats
  let gain = 0
  let loss = 0
  for (let i = 1; i < elevationProfile.length; i++) {
    const diff = elevationProfile[i] - elevationProfile[i - 1]
    if (diff > 0) gain += diff
    else loss += Math.abs(diff)
  }
  const minElev = Math.min(...elevationProfile)
  const maxElev = Math.max(...elevationProfile)
  const displayGain = elevationGainM > 0 ? elevationGainM : Math.round(gain)

  // Generate distance labels
  const labels = elevationProfile.map((_, i) => {
    const d = (distanceKm * i) / (elevationProfile.length - 1)
    return d.toFixed(1)
  })

  // Build DOM
  containerEl.innerHTML = `
    <div class="detail-section-title">Elevation Profile</div>
    <div class="elevation-stats-row">
      <div class="elevation-stat">
        <span class="elevation-stat-icon">📈</span>
        <div>
          <div class="elevation-stat-value">+${displayGain}m</div>
          <div class="elevation-stat-label">Gain</div>
        </div>
      </div>
      <div class="elevation-stat">
        <span class="elevation-stat-icon">📉</span>
        <div>
          <div class="elevation-stat-value">-${Math.round(loss)}m</div>
          <div class="elevation-stat-label">Loss</div>
        </div>
      </div>
      <div class="elevation-stat">
        <span class="elevation-stat-icon">⛰️</span>
        <div>
          <div class="elevation-stat-value">${maxElev.toFixed(0)}m</div>
          <div class="elevation-stat-label">Max</div>
        </div>
      </div>
      <div class="elevation-stat">
        <span class="elevation-stat-icon">🏖️</span>
        <div>
          <div class="elevation-stat-value">${minElev.toFixed(0)}m</div>
          <div class="elevation-stat-label">Min</div>
        </div>
      </div>
    </div>
    <div class="elevation-chart-wrapper">
      <canvas id="elevation-canvas"></canvas>
    </div>
  `

  const canvas = containerEl.querySelector('#elevation-canvas') as HTMLCanvasElement
  if (!canvas) return () => {}

  // Destroy previous instance
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }

  // Detect theme
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    || (window.matchMedia('(prefers-color-scheme: dark)').matches
        && !document.documentElement.hasAttribute('data-theme'))

  const gridColor = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(0,0,0,0.06)'
  const textColor = isDark ? '#94a3b8' : '#64748b'

  chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: elevationProfile,
        borderColor: '#22c55e',
        backgroundColor: isDark
          ? 'rgba(34,197,94,0.12)'
          : 'rgba(34,197,94,0.15)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#22c55e',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        fill: true,
        tension: 0.35,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        tooltip: {
          backgroundColor: isDark ? '#1e293b' : '#0f172a',
          titleColor: '#f8fafc',
          bodyColor: '#94a3b8',
          titleFont: { family: "'Inter', sans-serif", weight: 'bold', size: 12 },
          bodyFont: { family: "'Inter', sans-serif", size: 11 },
          padding: { x: 10, y: 8 },
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            title: (items) => `${items[0].label} km`,
            label: (item) => `${(item.raw as number).toFixed(1)} m elevation`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: textColor,
            font: { family: "'Inter', sans-serif", size: 10 },
            maxTicksLimit: 6,
            callback: (_, i) => {
              // Show every nth label
              const step = Math.max(1, Math.floor(elevationProfile.length / 5))
              if (i % step === 0 || i === elevationProfile.length - 1) {
                return labels[i] + ' km'
              }
              return ''
            },
          },
          title: { display: false },
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            font: { family: "'Inter', sans-serif", size: 10 },
            callback: (val) => val + 'm',
          },
          title: { display: false },
          suggestedMin: Math.max(0, minElev - 5),
        },
      },
    },
  })

  return () => {
    if (chartInstance) {
      chartInstance.destroy()
      chartInstance = null
    }
  }
}
