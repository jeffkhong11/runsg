// amenity-metrics.ts — Compute nearest amenity + density for route detail (T-069, T-070, T-071)

import type { Amenity } from '../types/amenity.ts'
import { haversineKm } from '../utils/haversine.ts'

export interface AmenityMetrics {
  nearestWaterM: number | null   // nearest water point distance in meters from route start
  nearestToiletM: number | null  // nearest toilet distance in meters from route start
  waterDensity: number | null    // water points within 500m corridor / route km
  toiletDensity: number | null   // toilets within 500m corridor / route km
  waterCount: number             // count of water points within 500m of route
  toiletCount: number            // count of toilets within 500m of route
}

/**
 * Point-to-segment minimum distance in km.
 * Approximates distance from amenity to the nearest segment of the route polyline.
 */
function distanceToPolylineKm(
  lat: number,
  lng: number,
  routeCoords: [number, number][], // [lng, lat]
): number {
  let minDist = Infinity
  for (const [rlng, rlat] of routeCoords) {
    const d = haversineKm(lat, lng, rlat, rlng)
    if (d < minDist) minDist = d
  }
  return minDist
}

/**
 * Compute amenity metrics for a selected route.
 *
 * @param routeCoords - GeoJSON [lng, lat] coordinate array of the route polyline
 * @param waterPoints - array of water amenity objects
 * @param toilets - array of toilet amenity objects
 * @param routeDistanceKm - total route length in km
 * @param corridorKm - proximity threshold for "along route" amenities (default 0.5km)
 */
export function computeAmenityMetrics(
  routeCoords: [number, number][],
  waterPoints: Amenity[],
  toilets: Amenity[],
  routeDistanceKm: number,
  corridorKm = 0.5,
): AmenityMetrics {
  if (routeCoords.length === 0) {
    return { nearestWaterM: null, nearestToiletM: null, waterDensity: null, toiletDensity: null, waterCount: 0, toiletCount: 0 }
  }

  // Find minimum distance from each amenity to the route polyline
  function computeNearest(amenities: Amenity[]): { nearestM: number | null; countInCorridor: number } {
    if (amenities.length === 0) return { nearestM: null, countInCorridor: 0 }

    let nearestKm = Infinity
    let countInCorridor = 0

    for (const a of amenities) {
      const distKm = distanceToPolylineKm(a.lat, a.lng, routeCoords)
      if (distKm < nearestKm) nearestKm = distKm
      if (distKm <= corridorKm) countInCorridor++
    }

    return {
      nearestM: nearestKm === Infinity ? null : Math.round(nearestKm * 1000),
      countInCorridor,
    }
  }

  const waterResult = computeNearest(waterPoints)
  const toiletResult = computeNearest(toilets)

  return {
    nearestWaterM: waterResult.nearestM,
    nearestToiletM: toiletResult.nearestM,
    waterCount: waterResult.countInCorridor,
    toiletCount: toiletResult.countInCorridor,
    waterDensity: routeDistanceKm > 0 ? Math.round((waterResult.countInCorridor / routeDistanceKm) * 10) / 10 : null,
    toiletDensity: routeDistanceKm > 0 ? Math.round((toiletResult.countInCorridor / routeDistanceKm) * 10) / 10 : null,
  }
}

/**
 * Format a distance in meters to a human-readable string.
 */
export function formatDistanceM(meters: number | null): string {
  if (meters === null) return 'None nearby'
  if (meters < 100) return `${meters}m`
  if (meters < 1000) return `${Math.round(meters / 10) * 10}m`
  return `${(meters / 1000).toFixed(1)}km`
}

/**
 * Render the amenity metrics block into a slot element (T-071).
 */
export function renderAmenityMetrics(slotEl: HTMLElement, metrics: AmenityMetrics): void {
  if (!slotEl) return

  const waterIcon = '💧'
  const toiletIcon = '🚻'

  const nearWaterStr = formatDistanceM(metrics.nearestWaterM)
  const nearToiletStr = formatDistanceM(metrics.nearestToiletM)
  const waterDensityStr = metrics.waterDensity !== null ? `${metrics.waterDensity}/km` : '—'
  const toiletDensityStr = metrics.toiletDensity !== null ? `${metrics.toiletDensity}/km` : '—'

  slotEl.innerHTML = `
    <div class="detail-section-title">Amenities Along Route</div>
    <div class="amenity-metrics-grid">
      <div class="amenity-metric-card">
        <div class="amenity-metric-icon">${waterIcon}</div>
        <div class="amenity-metric-content">
          <div class="amenity-metric-label">Nearest Water</div>
          <div class="amenity-metric-value">${nearWaterStr}</div>
        </div>
      </div>
      <div class="amenity-metric-card">
        <div class="amenity-metric-icon">${toiletIcon}</div>
        <div class="amenity-metric-content">
          <div class="amenity-metric-label">Nearest Toilet</div>
          <div class="amenity-metric-value">${nearToiletStr}</div>
        </div>
      </div>
      <div class="amenity-metric-card">
        <div class="amenity-metric-icon">${waterIcon}</div>
        <div class="amenity-metric-content">
          <div class="amenity-metric-label">Water Density</div>
          <div class="amenity-metric-value">${waterDensityStr}</div>
          <div class="amenity-metric-sub">${metrics.waterCount} within 500m</div>
        </div>
      </div>
      <div class="amenity-metric-card">
        <div class="amenity-metric-icon">${toiletIcon}</div>
        <div class="amenity-metric-content">
          <div class="amenity-metric-label">Toilet Density</div>
          <div class="amenity-metric-value">${toiletDensityStr}</div>
          <div class="amenity-metric-sub">${metrics.toiletCount} within 500m</div>
        </div>
      </div>
    </div>
  `
}
