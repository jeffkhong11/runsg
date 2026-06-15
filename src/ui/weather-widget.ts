// weather-widget.ts — Weather display in route detail panel (T-060, T-061, T-062)

import { getWeatherForRegion } from '../services/weather.ts'
import { getRunningWindows } from '../services/best-time.ts'

// Weather icon mapping
const WEATHER_ICONS: Record<string, string> = {
  'Fair': '☀️',
  'Fair (Day)': '☀️',
  'Fair (Night)': '🌙',
  'Fair & Warm': '🌡️',
  'Partly Cloudy': '⛅',
  'Partly Cloudy (Day)': '⛅',
  'Partly Cloudy (Night)': '☁️',
  'Cloudy': '☁️',
  'Hazy': '🌫️',
  'Slightly Hazy': '🌫️',
  'Windy': '💨',
  'Mist': '🌫️',
  'Light Rain': '🌦️',
  'Moderate Rain': '🌧️',
  'Heavy Rain': '⛈️',
  'Passing Showers': '🌦️',
  'Light Showers': '🌦️',
  'Showers': '🌧️',
  'Heavy Showers': '⛈️',
  'Thundery Showers': '⛈️',
  'Heavy Thundery Showers': '⛈️',
  'Heavy Thundery Showers with Gusty Winds': '🌪️',
}

function getWeatherIcon(forecast: string): string {
  return WEATHER_ICONS[forecast] ?? '🌤️'
}

/**
 * Render weather widget into the container.
 */
export async function renderWeatherWidget(containerEl: HTMLElement, region: string): Promise<void> {
  // Show loading state
  containerEl.innerHTML = `
    <div class="detail-section-title">Weather Now</div>
    <div class="weather-loading">
      <div class="weather-loading-spinner"></div>
      <span>Fetching weather…</span>
    </div>
  `

  const weather = await getWeatherForRegion(region)

  if (!weather) {
    containerEl.innerHTML = `
      <div class="detail-section-title">Weather Now</div>
      <div class="weather-unavailable">
        <span>🌐</span> Weather data unavailable
      </div>
    `
    return
  }

  const icon = getWeatherIcon(weather.forecast)
  const tempStr = weather.temperature
    ? `${weather.temperature.low}–${weather.temperature.high}°C`
    : '—'
  const humidStr = weather.humidity
    ? `${weather.humidity.low}–${weather.humidity.high}%`
    : '—'

  // Calculate Singapore Running Windows
  const currentTempHigh = weather.temperature?.high ?? 30
  const runningWindows = getRunningWindows(currentTempHigh, weather.forecast, weather.isRainy)

  const windowsHtml = runningWindows
    .map(
      w => `
      <div class="best-time-chip best-time-${w.score}">
        <div class="best-time-header">
          <span class="best-time-name">${w.name}</span>
          <span class="best-time-time">${w.timeRange}</span>
        </div>
        <div class="best-time-badge">${w.advice}</div>
        <div class="best-time-reason">${w.reason}</div>
      </div>
    `
    )
    .join('')

  containerEl.innerHTML = `
    <div class="detail-section-title">Weather Now</div>
    <div class="weather-widget">
      <div class="weather-main">
        <span class="weather-icon">${icon}</span>
        <div class="weather-info">
          <div class="weather-forecast">${weather.forecast}</div>
          <div class="weather-area">${weather.area}</div>
        </div>
      </div>
      <div class="weather-details">
        <div class="weather-detail-item">
          <span class="weather-detail-icon">🌡️</span>
          <div>
            <div class="weather-detail-value">${tempStr}</div>
            <div class="weather-detail-label">Temperature</div>
          </div>
        </div>
        <div class="weather-detail-item">
          <span class="weather-detail-icon">💧</span>
          <div>
            <div class="weather-detail-value">${humidStr}</div>
            <div class="weather-detail-label">Humidity</div>
          </div>
        </div>
      </div>

      <!-- Heat index warnings -->
      <div class="heat-index-banner" style="background:${weather.heatIndex.color}15; border-left: 3px solid ${weather.heatIndex.color}">
        <div class="heat-index-header">
          <span class="heat-index-dot" style="background:${weather.heatIndex.color}"></span>
          <span class="heat-index-level" style="color:${weather.heatIndex.color}">${weather.heatIndex.level} Heat Index</span>
        </div>
        <div class="heat-index-advice">${weather.heatIndex.advice}</div>
      </div>

      <!-- Rain-free window status -->
      <div class="rain-window-banner" style="background:${weather.isRainy ? '#ef4444' : '#22c55e'}15; border-left: 3px solid ${weather.isRainy ? '#ef4444' : '#22c55e'}">
        <div class="rain-window-header">
          <span class="rain-window-dot" style="background:${weather.isRainy ? '#ef4444' : '#22c55e'}"></span>
          <span class="rain-window-level" style="color:${weather.isRainy ? '#ef4444' : '#22c55e'}">
            ${weather.isRainy ? 'Rain Alert' : 'Rain-Free Window'}
          </span>
        </div>
        <div class="rain-window-advice">${weather.rainAdvice}</div>
      </div>
    </div>

    <!-- Best Time to Run recommendations -->
    <div class="detail-section-title" style="margin-top: var(--space-4)">Best Time to Run</div>
    <div class="best-time-grid">
      ${windowsHtml}
    </div>
  `
}
