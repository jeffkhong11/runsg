// Route types — RunSG
// PRD §4.2

export type Region = 'east' | 'west' | 'north' | 'south' | 'central'
export type RouteType = 'pcn' | 'trail' | 'road' | 'mixed'
export type Difficulty = 'easy' | 'moderate' | 'hard'
export type Lighting = 'well-lit' | 'partial' | 'dark'
export type DataSource = 'nparks' | 'osm' | 'ors' | 'gpx'

export interface SurfaceBreakdown {
  tarmac: number     // 0.0–1.0
  boardwalk: number
  trail: number
  gravel?: number
}

export interface Route {
  id: string                       // e.g. "east-coast-pcn"
  name: string                     // e.g. "East Coast Park Connector"
  region: Region
  type: RouteType
  distance_km: number              // Computed from geometry (Haversine)
  elevation_gain_m: number         // From ORS or elevation data
  difficulty: Difficulty
  surface: SurfaceBreakdown
  lighting: Lighting
  loop: boolean
  description: string
  tags: string[]
  source: DataSource               // Data provenance
  geometry: GeoJSONLineString      // Actual route coordinates
  elevation_profile: number[]      // Elevation samples at regular intervals
  images?: string[]                // Optional route photos
}

// Minimal GeoJSON types to avoid @types/geojson dependency
export interface GeoJSONLineString {
  type: 'LineString'
  coordinates: [number, number][]  // [lng, lat] pairs
}

// Route index entry (lightweight, no geometry)
export interface RouteIndexEntry {
  id: string
  name: string
  region: Region
  type: RouteType
  distance_km: number
  elevation_gain_m: number
  difficulty: Difficulty
  surface: SurfaceBreakdown
  lighting: Lighting
  loop: boolean
  description: string
  tags: string[]
  source: DataSource
  elevation_profile?: number[]  // Elevation samples for chart rendering
  images?: string[]
  // Bounding box for map fitting [south, west, north, east]
  bounds?: [number, number, number, number]
}
