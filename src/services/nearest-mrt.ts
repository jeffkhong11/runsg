// nearest-mrt.ts — Find the closest Singapore MRT/LRT station exit
// Uses the data.gov.sg/LTA MRT station exits dataset

import { haversineKm } from '../utils/haversine.ts'

export interface MrtStationExit {
  stationName: string
  exitCode: string
  lat: number
  lng: number
  lines: string[]
  codes: string[]
}

export interface NearestMrtResult {
  stationName: string
  exitCode: string
  distanceKm: number
  lines: string[]
}

// Global cache for exits JSON
let cachedExits: MrtStationExit[] | null = null

/**
 * Load the parsed LTA MRT exits dataset.
 */
async function loadMrtExits(): Promise<MrtStationExit[]> {
  if (cachedExits) return cachedExits

  try {
    const baseUrl = import.meta.env.BASE_URL || '/'
    const dataUrl = `${baseUrl}data/mrt-stations.json`.replace(/\/+/g, '/')
    
    const resp = await fetch(dataUrl)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    
    cachedExits = (await resp.json()) as MrtStationExit[]
    return cachedExits
  } catch (err) {
    console.warn('[RunSG] Failed to load MRT exits:', err)
    return []
  }
}

/**
 * Find the nearest MRT station exit from a given latitude/longitude.
 */
export async function findNearestMrt(lat: number, lng: number): Promise<NearestMrtResult | null> {
  const exits = await loadMrtExits()
  if (exits.length === 0) return null

  let nearestExit: MrtStationExit | null = null
  let minDistance = Infinity

  for (const exit of exits) {
    const dist = haversineKm(lat, lng, exit.lat, exit.lng)
    if (dist < minDistance) {
      minDistance = dist
      nearestExit = exit
    }
  }

  if (!nearestExit) return null

  return {
    stationName: nearestExit.stationName,
    exitCode: nearestExit.exitCode,
    distanceKm: minDistance,
    lines: nearestExit.lines
  }
}

export interface LineStyle {
  name: string
  color: string
}

/**
 * Get display name and hex color for a given MRT line abbreviation.
 */
export function getLineStyle(line: string): LineStyle {
  const lineUpper = line.toUpperCase()
  switch (lineUpper) {
    case 'NS':
      return { name: 'North-South Line', color: '#dc2626' } // Red
    case 'EW':
      return { name: 'East-West Line', color: '#16a34a' } // Green
    case 'NE':
      return { name: 'North-East Line', color: '#7c3aed' } // Purple
    case 'CC':
      return { name: 'Circle Line', color: '#ea580c' } // Orange
    case 'DT':
      return { name: 'Downtown Line', color: '#0284c7' } // Blue
    case 'TE':
      return { name: 'Thomson-East Coast Line', color: '#854d0e' } // Brown
    default:
      return { name: 'LRT / Regional Line', color: '#6b7280' } // Grey
  }
}
