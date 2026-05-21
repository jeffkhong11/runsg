// format.ts — Formatting utilities

/**
 * Format distance with appropriate unit.
 * e.g. 5.2 → "5.2 km", 0.35 → "350 m"
 */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

/**
 * Format elevation in metres.
 */
export function formatElevation(m: number): string {
  return `${Math.round(m)} m`
}

/**
 * Format estimated run time from distance and pace.
 * @param distanceKm Route distance in km
 * @param paceMinPerKm Pace in minutes per km (e.g. 5.5 for 5:30/km)
 */
export function formatEstimatedTime(distanceKm: number, paceMinPerKm: number): string {
  const totalMin = distanceKm * paceMinPerKm
  const h = Math.floor(totalMin / 60)
  const m = Math.round(totalMin % 60)
  if (h === 0) return `${m} min`
  return `${h}h ${m}m`
}

/**
 * Format a percentage as a display string. e.g. 0.75 → "75%"
 */
export function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

/**
 * Format an ISO date string as "X days ago" or the date.
 */
export function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return '1 day ago'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  return date.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Capitalise the first letter of a string.
 */
export function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Convert a route type slug to display name.
 */
export function routeTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    pcn: 'PCN', trail: 'Trail', road: 'Road', mixed: 'Mixed',
  }
  return labels[type] ?? capitalise(type)
}
