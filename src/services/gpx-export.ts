// gpx-export.ts — Generate and download GPX files for routes
// Produces a valid GPX 1.1 document with route name, description, and trk/trkpt elements.

import type { Route } from '../types/route.ts'

/**
 * Build a GPX 1.1 XML string from a route.
 */
function buildGpx(route: Route): string {
  const now = new Date().toISOString()
  const pts = route.geometry.coordinates
    .map(([lng, lat]) => `    <trkpt lat="${lat.toFixed(7)}" lon="${lng.toFixed(7)}"></trkpt>`)
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1"
     creator="RunSG — Singapore Running Routes"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escXml(route.name)}</name>
    <desc>${escXml(route.description)}</desc>
    <time>${now}</time>
    <link href="https://jeffkhong11.github.io/runsg/#/route/${route.id}">
      <text>View on RunSG</text>
    </link>
  </metadata>
  <trk>
    <name>${escXml(route.name)}</name>
    <type>${escXml(route.type)}</type>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>`
}

function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Trigger a GPX file download for the given route.
 * Creates a Blob URL, simulates a click, and revokes the URL.
 */
export function downloadGpx(route: Route): void {
  const gpxContent = buildGpx(route)
  const blob = new Blob([gpxContent], { type: 'application/gpx+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${route.id}.gpx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
