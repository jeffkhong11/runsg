// Amenity types — RunSG
// PRD §4.3

export type AmenityType = 'water' | 'toilet' | 'shelter'
export type AmenitySource = 'osm' | 'nparks'

export interface Amenity {
  id: string
  type: AmenityType
  name?: string
  lat: number
  lng: number
  source: AmenitySource
  last_verified: string   // ISO date — auto-set to weekly cron scrape date
}
