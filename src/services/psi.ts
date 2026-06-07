// psi.ts — Singapore NEA PSI (Pollutant Standards Index) air quality service
// Uses the official data.gov.sg PSI API. Caches result for 30 minutes.
// PSI scale: Good 0–50 · Moderate 51–100 · Unhealthy 101–200 · Very Unhealthy 201–300 · Hazardous 301+
// Source: https://data.gov.sg/datasets/d_51b8f0bfcace96a96f2b6dd9ee3df5c4/view

const PSI_API = 'https://api.data.gov.sg/v1/environment/psi'

// 30-minute cache
let _cache: PsiReading | null = null
let _cacheTime = 0
const CACHE_TTL_MS = 30 * 60 * 1000

export interface PsiReading {
  psi: number           // 24-hr PSI (national)
  level: PsiLevel
  color: string         // hex accent color
  label: string         // human-readable level
  advice: string        // running advice
  pm25?: number         // PM2.5 concentration (µg/m³)
  updatedAt: string     // ISO timestamp from API
}

export type PsiLevel = 'good' | 'moderate' | 'unhealthy' | 'very-unhealthy' | 'hazardous' | 'unknown'

// Regional mapping: RunSG region → NEA PSI region key
const REGION_MAP: Record<string, string> = {
  north:   'north',
  south:   'south',
  east:    'east',
  west:    'west',
  central: 'central',
}

function classifyPsi(psi: number): { level: PsiLevel; color: string; label: string; advice: string } {
  if (psi <= 50)  return { level: 'good',          color: '#16c95d', label: 'Good',          advice: 'Air quality is great — perfect conditions for running.' }
  if (psi <= 100) return { level: 'moderate',       color: '#f59e0b', label: 'Moderate',      advice: 'Air quality is acceptable. Sensitive individuals should take note.' }
  if (psi <= 200) return { level: 'unhealthy',      color: '#ef4444', label: 'Unhealthy',     advice: 'Reduce prolonged outdoor exertion. Wear a mask if possible.' }
  if (psi <= 300) return { level: 'very-unhealthy', color: '#7c3aed', label: 'Very Unhealthy', advice: 'Avoid outdoor exercise. Keep indoor with clean air.' }
  return             { level: 'hazardous',       color: '#1e293b', label: 'Hazardous',     advice: 'Stay indoors. Outdoor exercise is not advised.' }
}

/**
 * Fetch the current PSI reading for a given RunSG region.
 * Results are cached for 30 minutes to avoid hammering the API.
 */
export async function getPsiForRegion(region: string): Promise<PsiReading | null> {
  const now = Date.now()

  // Return cached result if still fresh
  if (_cache && now - _cacheTime < CACHE_TTL_MS) {
    return _cache
  }

  try {
    const res = await fetch(PSI_API, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null

    const json = await res.json() as NeaPsiResponse
    const items = json.items?.[0]
    if (!items) return null

    const readings = items.readings
    const nea_region = REGION_MAP[region.toLowerCase()] ?? 'national'

    // Try regional PSI first, fall back to national
    const psiVal: number = (
      (readings['psi_twenty_four_hourly'] as Record<string, number>)?.[nea_region] ??
      (readings['psi_twenty_four_hourly'] as Record<string, number>)?.['national'] ??
      0
    )

    const pm25Val: number | undefined = (
      (readings['pm25_twenty_four_hourly'] as Record<string, number>)?.[nea_region] ??
      (readings['pm25_twenty_four_hourly'] as Record<string, number>)?.['national']
    )

    const { level, color, label, advice } = classifyPsi(psiVal)

    _cache = {
      psi: Math.round(psiVal),
      level,
      color,
      label,
      advice,
      pm25: pm25Val !== undefined ? Math.round(pm25Val) : undefined,
      updatedAt: items.timestamp ?? new Date().toISOString(),
    }
    _cacheTime = now
    return _cache
  } catch {
    return null
  }
}

// ─── NEA API Types ────────────────────────────────────────────────────────────

interface NeaPsiResponse {
  items?: {
    timestamp: string
    readings: Record<string, unknown>
  }[]
}
