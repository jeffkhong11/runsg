// router.ts — Hash-based route sharing (T-034, T-035, T-036)
// URL format: #/route/{route-id}

type RouteHandler = (routeId: string) => void
type HomeHandler = () => void

let onRouteHandler: RouteHandler | null = null
let onHomeHandler: HomeHandler | null = null

/**
 * Parse the current hash and return the route ID if the format matches.
 */
export function parseHash(): string | null {
  const hash = window.location.hash
  const match = hash.match(/^#\/route\/(.+)$/)
  return match ? decodeURIComponent(match[1]) : null
}

/**
 * Set the URL hash to a route (T-035).
 */
export function setRouteHash(routeId: string): void {
  const newHash = `#/route/${encodeURIComponent(routeId)}`
  if (window.location.hash !== newHash) {
    history.pushState(null, '', newHash)
  }
}

/**
 * Clear the route hash (back to home).
 */
export function clearRouteHash(): void {
  if (window.location.hash) {
    history.pushState(null, '', window.location.pathname + window.location.search)
  }
}

/**
 * Register handlers for route navigation events.
 */
export function onHashRoute(handler: RouteHandler): void {
  onRouteHandler = handler
}

export function onHashHome(handler: HomeHandler): void {
  onHomeHandler = handler
}

/**
 * Initialize the hash router.
 * - Parses the initial URL on page load
 * - Listens for popstate (back/forward)
 */
export function initRouter(): void {
  // Handle back/forward navigation
  window.addEventListener('popstate', () => {
    handleHashChange()
  })

  // Handle initial hash on page load
  handleHashChange()
}

function handleHashChange(): void {
  const routeId = parseHash()
  if (routeId) {
    onRouteHandler?.(routeId)
  } else {
    onHomeHandler?.()
  }
}
