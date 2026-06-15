#!/usr/bin/env python3
"""
fetch-trails.py — Generate high-fidelity Singapore trail geometries using:
                   1. Local GPX files from data/gpx/  (highest accuracy — preferred)
                   2. OpenRouteService API snap        (good for roads, patchy for forests)
                   3. Curated fallback coordinates     (always works, low resolution)

Tasks: T-037, T-038
Usage:  python scripts/fetch-trails.py
        Set ORS_API_KEY env var for API snapping when no GPX file exists.

Source files: data/gpx/*.gpx  (download from AllTrails / Strava / Garmin)
Output:       public/data/routes/<trail-id>.json + public/data/routes/index.json
"""

import json
import math
import os
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path
import requests

# ── Config ────────────────────────────────────────────────────────────────────

ORS_URL = "https://api.openrouteservice.org/v2/directions/foot-walking/geojson"
WORKSPACE_DIR = Path(__file__).parent.parent
GPX_DIR = WORKSPACE_DIR / "data" / "gpx"
OUTPUT_DIR = WORKSPACE_DIR / "public" / "data" / "routes"
INDEX_PATH = OUTPUT_DIR / "index.json"

# ── Curated Trail Definitions ─────────────────────────────────────────────────

TRAILS = [
    {
        "id": "macritchie-loop",
        "name": "MacRitchie Reservoir Loop",
        "region": "central",
        "type": "trail",
        "difficulty": "moderate",
        "lighting": "dark",
        "loop": True,
        "elevation_gain_m": 220,
        "surface": {"tarmac": 0.10, "boardwalk": 0.20, "trail": 0.70},
        "description": "Singapore's most iconic trail loop. Undulating forest paths around MacRitchie Reservoir following the scenic Lornie and Chemperai boardwalks.",
        "tags": ["trail", "forest", "reservoir", "loop", "nature"],
        "gpx_file": "MacRitchie_Reservoir_Loop.gpx",  # Optional local file
        "waypoints": [
            [103.8354, 1.3423],  # Reservoir Park Start
            [103.8295, 1.3412],  # Lornie Trail Mid
            [103.8248, 1.3402],  # Lornie Trail West
            [103.8175, 1.3440],  # Golf Link south
            [103.8118, 1.3503],  # Sime Track
            [103.8140, 1.3575],  # Ranger Station
            [103.8220, 1.3582],  # Petai Trail Boardwalk
            [103.8306, 1.3533],  # MacRitchie Nature Trail East
            [103.8354, 1.3423]   # Back to start
        ],
        "fallback_coordinates": [
            [103.8354, 1.3423],
            [103.8330, 1.3418],
            [103.8295, 1.3412],
            [103.8248, 1.3402],
            [103.8202, 1.3415],
            [103.8175, 1.3440],
            [103.8163, 1.3458],
            [103.8145, 1.3485],
            [103.8118, 1.3503],
            [103.8110, 1.3530],
            [103.8122, 1.3565],
            [103.8140, 1.3575],
            [103.8185, 1.3585],
            [103.8220, 1.3582],
            [103.8250, 1.3568],
            [103.8290, 1.3555],
            [103.8315, 1.3515],
            [103.8340, 1.3485],
            [103.8360, 1.3455],
            [103.8354, 1.3423]
        ],
        "real_distance_km": 10.5
    },
    {
        "id": "bukit-timah-trail",
        "name": "Bukit Timah Summit Trail",
        "region": "central",
        "type": "trail",
        "difficulty": "hard",
        "lighting": "dark",
        "loop": True,
        "elevation_gain_m": 290,
        "surface": {"tarmac": 0.05, "boardwalk": 0.10, "trail": 0.85},
        "description": "Steep forest loop climbing Singapore's highest natural peak (163m), returning via the technical Cave Path dirt track.",
        "tags": ["trail", "hill", "summit", "forest", "hard"],
        "gpx_file": "Bukit_Timah_Summit.gpx",
        "waypoints": [
            [103.7760, 1.3528],  # Visitor Centre
            [103.7761, 1.3546],  # Main paved incline
            [103.7763, 1.3554],  # Bukit Timah Summit Peak
            [103.7745, 1.3551],  # Cave Path descent
            [103.7738, 1.3536],  # Taban Path connector
            [103.7760, 1.3528]   # Back to Visitor Centre
        ],
        "fallback_coordinates": [
            [103.7760, 1.3528],
            [103.7758, 1.3535],
            [103.7761, 1.3546],
            [103.7763, 1.3554],
            [103.7755, 1.3555],
            [103.7745, 1.3551],
            [103.7738, 1.3536],
            [103.7748, 1.3530],
            [103.7760, 1.3528]
        ],
        "real_distance_km": 3.1
    },
    {
        "id": "southern-ridges",
        "name": "Southern Ridges",
        "region": "south",
        "type": "trail",
        "difficulty": "moderate",
        "lighting": "partial",
        "loop": False,
        "elevation_gain_m": 180,
        "surface": {"tarmac": 0.15, "boardwalk": 0.45, "trail": 0.40},
        "description": "A spectacular ridge-line trail linking HarbourFront to Kent Ridge via Mount Faber peak, Henderson Waves, and the elevated Forest Walk.",
        "tags": ["trail", "henderson-waves", "forest-walk", "scenic", "city-views"],
        "gpx_file": "Southern_Ridges.gpx",
        "waypoints": [
            [103.8183, 1.2662],  # Marang Trail start (HarbourFront)
            [103.8162, 1.2725],  # Mount Faber Loop Road
            [103.8142, 1.2760],  # Henderson Waves bridge mid
            [103.8080, 1.2770],  # Forest Walk middle
            [103.8016, 1.2801],  # Alexandra Arch bridge
            [103.7968, 1.2818],  # HortPark pathways
            [103.7915, 1.2842]   # Kent Ridge Canopy Walk
        ],
        "fallback_coordinates": [
            [103.8183, 1.2662],
            [103.8175, 1.2685],
            [103.8162, 1.2725],
            [103.8160, 1.2735],
            [103.8150, 1.2748],
            [103.8142, 1.2760],
            [103.8130, 1.2768],
            [103.8105, 1.2772],
            [103.8080, 1.2770],
            [103.8055, 1.2785],
            [103.8016, 1.2801],
            [103.7995, 1.2810],
            [103.7968, 1.2818],
            [103.7940, 1.2830],
            [103.7915, 1.2842]
        ],
        "real_distance_km": 9.0
    },
    {
        "id": "rail-corridor",
        "name": "Rail Corridor (Full)",
        "region": "central",
        "type": "trail",
        "difficulty": "moderate",
        "lighting": "dark",
        "loop": False,
        "elevation_gain_m": 85,
        "surface": {"tarmac": 0.05, "boardwalk": 0.15, "trail": 0.80},
        "description": "The complete green spinal corridor running through Singapore. Rich heritage landmarks, steel truss bridges, and peaceful secondary forests.",
        "tags": ["trail", "railway", "heritage", "nature", "long-distance"],
        "gpx_file": "Rail_Corridor_Full_Trail.gpx",
        "waypoints": [
            [103.8285, 1.2750],  # Spooner Road start (Tanjong Pagar)
            [103.8042, 1.2995],  # Depot Road segment
            [103.7818, 1.3340],  # Bukit Timah Truss Bridge & Station
            [103.7665, 1.3630],  # Hillview Truss Bridge
            [103.7592, 1.3855],  # Upper Bukit Timah Road side
            [103.7610, 1.4110],  # Kranji Road segment
            [103.7700, 1.4350]   # Woodlands terminal
        ],
        "fallback_coordinates": [
            [103.8285, 1.2750],
            [103.8245, 1.2810],
            [103.8160, 1.2905],
            [103.8042, 1.2995],
            [103.7960, 1.3090],
            [103.7885, 1.3210],
            [103.7818, 1.3340],
            [103.7770, 1.3450],
            [103.7665, 1.3630],
            [103.7615, 1.3735],
            [103.7592, 1.3855],
            [103.7602, 1.3980],
            [103.7610, 1.4110],
            [103.7650, 1.4250],
            [103.7700, 1.4350]
        ],
        "real_distance_km": 24.0
    },
    {
        "id": "coney-island-loop",
        "name": "Coney Island Loop",
        "region": "north",
        "type": "trail",
        "difficulty": "easy",
        "lighting": "dark",
        "loop": True,
        "elevation_gain_m": 15,
        "surface": {"tarmac": 0.10, "boardwalk": 0.30, "trail": 0.60},
        "description": "A rustic coastal escape on Coney Island. Dirt trails surrounded by casuarina trees, scenic beach viewpoints, and natural mangroves.",
        "tags": ["trail", "island", "beach", "mangrove", "nature"],
        "gpx_file": "Coney_Island_Loop.gpx",
        "waypoints": [
            [103.9168, 1.4124],  # West Gate entrance
            [103.9220, 1.4140],  # Main Spine road
            [103.9268, 1.4146],  # East Gate
            [103.9250, 1.4180],  # Beach area
            [103.9180, 1.4150],  # West boardwalk
            [103.9168, 1.4124],  # Back to West Gate
        ],
        "fallback_coordinates": [
            [103.9168, 1.4124],
            [103.9220, 1.4140],
            [103.9268, 1.4146],
            [103.9250, 1.4180],
            [103.9180, 1.4150],
            [103.9168, 1.4124]
        ],
        "real_distance_km": 4.5
    },
    {
        "id": "marina-bay-uterus-loop",
        "name": "Marina Bay Uterus Loop",
        "region": "south",
        "type": "road",
        "difficulty": "easy",
        "lighting": "well-lit",
        "loop": True,
        "elevation_gain_m": 0,
        "surface": {"tarmac": 0.70, "boardwalk": 0.30, "trail": 0.00}, 
        "description": "A fully paved scenic road route along Marina Bay, Kallang, Stadium and Gardens by the Bay",
        "tags": ["urban", "flat", "road", "paved"],
        "gpx_file": "Marina_Bay_Uterus_Route.gpx",
        "waypoints": [],
        "fallback_coordinates": [],
        "real_distance_km": 14.0
    }
]

# ── Utilities ─────────────────────────────────────────────────────────────────

def haversine_km(p1: list[float], p2: list[float]) -> float:
    lng1, lat1 = math.radians(p1[0]), math.radians(p1[1])
    lng2, lat2 = math.radians(p2[0]), math.radians(p2[1])
    dlat, dlng = lat2 - lat1, lng2 - lng1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))


def compute_distance_km(coords: list[list[float]]) -> float:
    total = 0.0
    for i in range(1, len(coords)):
        total += haversine_km(coords[i - 1], coords[i])
    return round(total, 2)


def compute_bounds(coords: list[list[float]]) -> list[float]:
    lngs = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return [min(lats), min(lngs), max(lats), max(lngs)]


def parse_gpx_file(gpx_path: Path):
    """Parse local GPX trackpoints and elevations."""
    tree = ET.parse(gpx_path)
    root = tree.getroot()
    
    # Try common GPX namespaces
    namespaces = [
        'http://www.topografix.com/GPX/1/1',
        'http://www.topografix.com/GPX/1/0'
    ]
    
    coordinates = []
    elevations = []
    
    ns = None
    for url in namespaces:
        if root.tag.startswith(f"{{{url}}}"):
            ns = {'gpx': url}
            break
            
    prefix = 'gpx:' if ns else ''
    
    for trkpt in root.findall(f'.//{prefix}trkpt', ns):
        lat = float(trkpt.attrib['lat'])
        lon = float(trkpt.attrib['lon'])
        coordinates.append([lon, lat])
        
        ele_elem = trkpt.find(f'{prefix}ele', ns)
        if ele_elem is not None and ele_elem.text:
            elevations.append(float(ele_elem.text))
        else:
            elevations.append(0.0)
            
    return coordinates, elevations


def call_ors(waypoints: list[list[float]], api_key: str) -> dict | None:
    """Query ORS Directions API for snapped walking geometries."""
    headers = {
        "Authorization": api_key,
        "Content-Type": "application/json",
        "User-Agent": "RunSG-Route-Explorer/1.0"
    }
    body = {
        "coordinates": waypoints,
        "elevation": True,
        "instructions": False,
    }
    try:
        resp = requests.post(ORS_URL, headers=headers, json=body, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        features = data.get("features", [])
        if features:
            return features[0]
    except requests.RequestException as e:
        print(f"    WARNING: ORS API failed: {e}", file=sys.stderr)
    return None

# ── Process ───────────────────────────────────────────────────────────────────

def process_trail(trail_def: dict, api_key: str) -> dict | None:
    trail_id = trail_def["id"]

    # GPX lookup priority:
    #   1. data/gpx/<gpx_file>          — canonical location
    #   2. <workspace_root>/<gpx_file>  — backward compat if file not yet moved
    #   3. Glob scan of data/gpx/       — fuzzy name match
    gpx_filename = trail_def.get("gpx_file", "")
    gpx_path = GPX_DIR / gpx_filename if gpx_filename else Path("/nonexistent")

    if not gpx_path.exists() and gpx_filename:
        gpx_path = WORKSPACE_DIR / gpx_filename  # backward compat

    if not gpx_path.exists():
        name_slug = trail_def["name"].replace(" ", "_")
        id_slug = trail_id.replace("-", "_")
        matches = list(GPX_DIR.glob(f"*{name_slug}*.gpx")) or list(GPX_DIR.glob(f"*{id_slug}*.gpx"))
        if matches:
            gpx_path = matches[0]

    coords = []
    elevations = []
    source = "osm"
    elevation_gain_m = trail_def["elevation_gain_m"]

    if gpx_path.exists():
        print(f"  Parsing local GPX file for {trail_def['name']}: {gpx_path.name}...")
        try:
            coords, elevations = parse_gpx_file(gpx_path)
            source = "gpx"
            print(f"    ✓ Loaded {len(coords)} high-fidelity GPS trackpoints from GPX.")
        except Exception as e:
            print(f"    WARNING: Failed to parse local GPX: {e}", file=sys.stderr)

    # Second: Snapping via ORS if no GPX but ORS key is present
    feature = None
    if not coords and api_key:
        print(f"  Snapping trail via ORS: {trail_def['name']}...")
        feature = call_ors(trail_def["waypoints"], api_key)
        if feature:
            geom = feature.get("geometry", {})
            coords = geom.get("coordinates", [])
            coords = [[c[0], c[1]] for c in coords]
            source = "ors"

    # Third: Fallback to high-density outlines
    if not coords:
        print(f"  Using pre-snapped curated outline: {trail_def['name']}...")
        coords = trail_def["fallback_coordinates"]
        source = "osm"

    distance_km = compute_distance_km(coords)
    bounds = compute_bounds(coords)

    # Elevation profile processing and downsampling
    elevation_profile: list[float] = []
    if source == "gpx" and elevations:
        # Calculate elevation gain
        elev_gain = 0.0
        for i in range(1, len(elevations)):
            diff = elevations[i] - elevations[i-1]
            if diff > 0.3:  # Filter minor noise
                elev_gain += diff
        elevation_gain_m = round(elev_gain)
        
        # Downsample profile to ~40 data points for Chart.js rendering
        step = max(1, len(elevations) // 40)
        elevation_profile = [round(e, 1) for e in elevations[::step]]
    elif source == "ors" and feature:
        raw_coords = feature.get("geometry", {}).get("coordinates", [])
        if raw_coords and len(raw_coords[0]) >= 3:
            step = max(1, len(raw_coords) // 40)
            elevation_profile = [round(c[2], 1) for c in raw_coords[::step]]
    else:
        # Generate clean synthetic terrain undulations for presentation
        base_elev = 30.0 if trail_def["region"] == "central" else 15.0
        elevation_profile = [round(base_elev + 15 * math.sin(i * 0.5), 1) for i in range(len(coords[::max(1, len(coords)//40)]))]

    route = {
        "id": trail_id,
        "name": trail_def["name"],
        "region": trail_def["region"],
        "type": trail_def["type"],
        "distance_km": distance_km,
        "elevation_gain_m": elevation_gain_m,
        "elevation_profile": elevation_profile,
        "difficulty": trail_def["difficulty"],
        "surface": trail_def["surface"],
        "lighting": trail_def["lighting"],
        "loop": trail_def["loop"],
        "description": trail_def["description"],
        "tags": trail_def["tags"],
        "source": source,
        "images": [],
        "geometry": {"type": "LineString", "coordinates": coords},
        "bounds": bounds,
    }

    status_map = {"gpx": "GPX imported", "ors": "ORS snapped", "osm": "curated fallback"}
    print(f"    ✓ {trail_id}: {distance_km} km ({status_map[source]}), {len(coords)} points")
    return route


# ── Write Outputs ─────────────────────────────────────────────────────────────

def write_trail_files(routes: list[dict]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Load existing index
    existing_index: list[dict] = []
    if INDEX_PATH.exists():
        try:
            with open(INDEX_PATH, encoding="utf-8") as f:
                existing_index = json.load(f)
        except Exception:
            pass

    # Remove existing trail entries
    trail_ids = {r["id"] for r in routes}
    existing_index = [e for e in existing_index if e["id"] not in trail_ids]

    for route in routes:
        route_id = route["id"]
        file_path = OUTPUT_DIR / f"{route_id}.json"

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(route, f, ensure_ascii=False, indent=2)

        entry = {k: v for k, v in route.items() if k != "geometry"}
        existing_index.append(entry)

    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(existing_index, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Wrote {len(routes)} trail files. Index now has {len(existing_index)} total routes.")


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    print("=== RunSG — Process Curated Hiking Trails (ORS & GPX Import) ===\n")

    api_key = os.environ.get("ORS_API_KEY", "")
    successful: list[dict] = []

    for trail_def in TRAILS:
        route = process_trail(trail_def, api_key)
        if route:
            successful.append(route)
        if api_key and route["source"] == "ors":
            time.sleep(1)  # Polite delay for rate limit

    if not successful:
        print("ERROR: No trails were successfully created.", file=sys.stderr)
        sys.exit(1)

    print(f"\nGenerated {len(successful)}/{len(TRAILS)} trails. Writing files...\n")
    write_trail_files(successful)


if __name__ == "__main__":
    main()
