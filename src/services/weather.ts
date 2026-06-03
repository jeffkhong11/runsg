// weather.ts — NEA 2-hour weather nowcast service (T-056, T-057, T-058, T-059)

export interface WeatherForecast {
  area: string
  forecast: string
  timestamp: string
}

export interface WeatherResponse {
  forecasts: WeatherForecast[]
  validPeriod: { start: string; end: string }
  temperature?: { low: number; high: number }
  humidity?: { low: number; high: number }
}

// NEA 2-hour nowcast API
const NOWCAST_URL = 'https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast'

// Cache: 5-minute TTL
let cachedResponse: WeatherResponse | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 5 * 60 * 1000

// Map route regions to nearest NEA forecast areas
const REGION_AREA_MAP: Record<string, string[]> = {
  east:    ['Bedok', 'Tampines', 'Pasir Ris', 'Changi', 'Marine Parade', 'Geylang'],
  west:    ['Jurong East', 'Jurong West', 'Clementi', 'Bukit Batok', 'Choa Chu Kang', 'Boon Lay'],
  north:   ['Woodlands', 'Yishun', 'Sembawang', 'Sengkang', 'Punggol', 'Ang Mo Kio'],
  south:   ['Queenstown', 'Bukit Merah', 'Sentosa', 'Southern Islands', 'HarbourFront'],
  central: ['Bishan', 'Toa Payoh', 'Novena', 'Bukit Timah', 'City', 'Orchard'],
}

/**
 * Fetch 2-hour weather nowcast from NEA (data.gov.sg).
 * Caches responses for 5 minutes.
 */
async function fetchNowcast(): Promise<WeatherResponse | null> {
  const now = Date.now()
  if (cachedResponse && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedResponse
  }

  try {
    const resp = await fetch(NOWCAST_URL)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const raw = await resp.json()

    // NEA v2 API: data.items[0].forecasts[]
    const items = raw?.data?.items ?? []
    if (items.length === 0) return null

    const latest = items[0]
    const forecasts: WeatherForecast[] = (latest.forecasts ?? []).map((f: { area: string; forecast: string }) => ({
      area: f.area,
      forecast: f.forecast,
      timestamp: latest.timestamp ?? new Date().toISOString(),
    }))

    const validPeriod = latest.valid_period ?? latest.validPeriod ?? { start: '', end: '' }

    // Temperature/humidity are not in the 2-hour forecast endpoint;
    // use typical SG daytime ranges as defaults for heat index calculation
    const result: WeatherResponse = {
      forecasts,
      validPeriod: { start: validPeriod.start ?? '', end: validPeriod.end ?? '' },
      temperature: { low: 25, high: 33 },
      humidity: { low: 65, high: 95 },
    }

    cachedResponse = result
    cacheTimestamp = now
    return result
  } catch (err) {
    console.warn('[RunSG] Weather fetch failed:', err)
    return null
  }
}

/**
 * Get weather forecast for a specific route region.
 */
export async function getWeatherForRegion(region: string): Promise<{
  forecast: string
  area: string
  temperature?: { low: number; high: number }
  humidity?: { low: number; high: number }
  heatIndex: { level: string; color: string; advice: string }
} | null> {
  const data = await fetchNowcast()
  if (!data || data.forecasts.length === 0) return null

  // Find best matching area
  const candidateAreas = REGION_AREA_MAP[region] ?? REGION_AREA_MAP.central
  const match = data.forecasts.find(f =>
    candidateAreas.some(area => f.area.toLowerCase().includes(area.toLowerCase()))
  )
  const forecast = match ?? data.forecasts[0]

  // Calculate heat index tier using a realistic concurrent humidity (typically 60-65% at peak daily temperature)
  const tempHigh = data.temperature?.high ?? 32
  const humAtPeak = 65 // Peak daily temperature occurs at minimum relative humidity
  const heatIndex = computeHeatIndex(tempHigh, humAtPeak)

  return {
    forecast: forecast.forecast,
    area: forecast.area,
    temperature: data.temperature,
    humidity: data.humidity,
    heatIndex,
  }
}

/**
 * Steadman heat index approximation with tiered advisories (T-061).
 */
function computeHeatIndex(tempC: number, humidity: number): {
  level: string; color: string; advice: string
} {
  // Simplified Steadman formula
  const T = tempC * 9 / 5 + 32  // Convert to Fahrenheit
  const RH = humidity
  let HI = 0.5 * (T + 61.0 + ((T - 68.0) * 1.2) + (RH * 0.094))

  if (HI > 79) {
    HI = -42.379 + 2.04901523 * T + 10.14333127 * RH
      - 0.22475541 * T * RH - 0.00683783 * T * T
      - 0.05481717 * RH * RH + 0.00122874 * T * T * RH
      + 0.00085282 * T * RH * RH - 0.00000199 * T * T * RH * RH
  }

  const hiC = (HI - 32) * 5 / 9  // Back to Celsius

  if (hiC < 28) return { level: 'Comfortable', color: '#22c55e', advice: 'Great conditions for running!' }
  if (hiC < 33) return { level: 'Warm', color: '#f59e0b', advice: 'Stay hydrated. Consider early AM or late PM runs.' }
  if (hiC < 40) return { level: 'Hot', color: '#f97316', advice: 'Caution: risk of heat exhaustion. Take breaks, carry water.' }
  return { level: 'Danger', color: '#ef4444', advice: 'Avoid outdoor exercise. Extreme heat risk.' }
}
