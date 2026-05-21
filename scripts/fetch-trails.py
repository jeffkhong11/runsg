#!/usr/bin/env python3
"""
fetch-trails.py — Download Singapore trail data from Overpass API (OSM)
                   and convert to RunSG route JSON files.

Tasks: T-037, T-038
Output: public/data/routes/<trail-id>.json + updates index.json

Trails targeted:
  - MacRitchie Reservoir Loop
  - Bukit Timah Summit Trail
  - Southern Ridges (Henderson Waves → Mount Faber)
  - Rail Corridor (Green Corridor)
  - Thomson Nature Park
  - Coney Island Loop
"""

import json
import math
import sys
import time
from pathlib import Path
import requests

# ── Config ────────────────────────────────────────────────────────────────────

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OUTPUT_DIR = Path(__file__).parent.parent / "public" / "data" / "routes"
INDEX_PATH = OUTPUT_DIR / "index.json"

# Delay between Overpass queries (be polite)
QUERY_DELAY_S = 2

# ── Trail Definitions ─────────────────────────────────────────────────────────
# Each entry defines an Overpass query to find the trail geometry,
# plus metadata that can't be inferred from OSM alone.

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
        "description": "Singapore's most iconic trail run. Undulating forest paths around MacRitchie Reservoir with the famous Treetop Walk suspension bridge as a highlight.",
        "tags": ["trail", "forest", "reservoir", "treetop-walk", "loop", "nature"],
        "query": """
            [out:json][timeout:30];
            (
              relation["name"~"MacRitchie"]["route"="hiking"](1.33,103.81,1.37,103.85);
              way["name"~"MacRitchie"]["highway"](1.33,103.81,1.37,103.85);
              way["name"~"MacRitchie Reservoir"]["highway"](1.33,103.81,1.37,103.85);
            );
            out geom;
        """,
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
        "description": "The hardest short trail in Singapore. Steep, technical paths up to Singapore's highest peak (163.63m). Dense primary rainforest with macaques and hornbills.",
        "tags": ["trail", "hill", "summit", "forest", "hard", "wildlife"],
        "query": """
            [out:json][timeout:30];
            (
              way["name"~"Bukit Timah"]["highway"](1.34,103.76,1.37,103.79);
              way["name"~"Summit Trail"]["highway"](1.34,103.76,1.37,103.79);
            );
            out geom;
        """,
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
        "description": "A connected ridgeline trail linking HortPark to VivoCity via the iconic Henderson Waves bridge and Forest Walk. Stunning city skyline views.",
        "tags": ["trail", "henderson-waves", "forest-walk", "scenic", "city-views"],
        "query": """
            [out:json][timeout:30];
            (
              way["name"~"Southern Ridges"]["highway"](1.27,103.80,1.30,103.84);
              way["name"~"Henderson Waves"](1.27,103.80,1.30,103.84);
              way["name"~"Forest Walk"]["highway"](1.27,103.80,1.30,103.84);
              way["name"~"Canopy Walk"]["highway"](1.27,103.80,1.30,103.84);
            );
            out geom;
        """,
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
        "description": "The former KTM railway corridor, now a 24km green spine running through Singapore's heartland. A unique urban escape through kampung landscapes and secondary forest.",
        "tags": ["trail", "railway", "heritage", "nature", "long-distance"],
        "query": """
            [out:json][timeout:30];
            (
              way["name"~"Rail Corridor"]["highway"](1.25,103.76,1.43,103.82);
              way["name"~"Green Corridor"]["highway"](1.25,103.76,1.43,103.82);
              relation["name"~"Rail Corridor"]["route"](1.25,103.76,1.43,103.82);
            );
            out geom;
        """,
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
        "description": "A rustic island loop in Punggol. Peaceful beach stretches, casuarina groves, and boardwalks through mangroves. Best visited early morning.",
        "tags": ["trail", "island", "beach", "mangrove", "nature"],
        "query": """
            [out:json][timeout:30];
            (
              way["name"~"Coney Island"]["highway"](1.40,103.90,1.42,103.93);
              way["highway"]["leisure"="nature_reserve"](1.40,103.90,1.42,103.93);
            );
            out geom;
        """,
    },
]


# ── Utilities ─────────────────────────────────────────────────────────────────

def haversine_km(p1: list[float], p2: list[float]) -> float:
    """Haversine distance between [lng,lat] pairs in km."""
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


# ── Overpass Query ────────────────────────────────────────────────────────────

def query_overpass(overpass_ql: str) -> dict:
    """Execute an Overpass QL query and return JSON response."""
    resp = requests.post(
        OVERPASS_URL,
        data={"data": overpass_ql.strip()},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def extract_way_coords(elements: list[dict]) -> list[list[float]]:
    """
    Extract ordered coordinates from Overpass way elements.
    Stitches multi-segment ways into a single LineString (T-038).
    """
    all_coords: list[list[float]] = []

    for elem in elements:
        if elem.get("type") != "way":
            continue
        geom = elem.get("geometry", [])
        way_coords = [[pt["lon"], pt["lat"]] for pt in geom if "lon" in pt and "lat" in pt]
        if not way_coords:
            continue

        if not all_coords:
            all_coords.extend(way_coords)
        else:
            # Try to stitch: check if end of current matches start of new segment
            last = all_coords[-1]
            first_new = way_coords[0]
            last_new = way_coords[-1]

            d_forward = haversine_km(last, first_new)
            d_reverse = haversine_km(last, last_new)

            if d_forward < 0.1:
                # Append in order (skip first point to avoid duplicate)
                all_coords.extend(way_coords[1:])
            elif d_reverse < 0.1:
                # Append reversed
                all_coords.extend(reversed(way_coords[:-1]))
            else:
                # Gap too large — append as-is (may create a jump)
                all_coords.extend(way_coords)

    return all_coords


# ── Process Trails ────────────────────────────────────────────────────────────

def process_trail(trail_def: dict) -> dict | None:
    """Query Overpass for a trail and build the route JSON."""
    trail_id = trail_def["id"]
    print(f"  Querying Overpass for: {trail_def['name']}...")

    try:
        result = query_overpass(trail_def["query"])
    except requests.RequestException as e:
        print(f"    ERROR: Overpass query failed: {e}", file=sys.stderr)
        return None

    elements = result.get("elements", [])
    if not elements:
        print(f"    WARNING: No elements found for {trail_id}")
        return None

    coords = extract_way_coords(elements)
    if len(coords) < 2:
        print(f"    WARNING: Insufficient coordinates for {trail_id} ({len(coords)} points)")
        return None

    distance_km = compute_distance_km(coords)
    bounds = compute_bounds(coords)

    route = {
        "id": trail_id,
        "name": trail_def["name"],
        "region": trail_def["region"],
        "type": trail_def["type"],
        "distance_km": distance_km,
        "elevation_gain_m": trail_def["elevation_gain_m"],
        "elevation_profile": [],
        "difficulty": trail_def["difficulty"],
        "surface": trail_def["surface"],
        "lighting": trail_def["lighting"],
        "loop": trail_def["loop"],
        "description": trail_def["description"],
        "tags": trail_def["tags"],
        "source": "osm",
        "images": [],
        "geometry": {"type": "LineString", "coordinates": coords},
        "bounds": bounds,
    }

    print(f"    ✓ {trail_id}: {distance_km} km, {len(coords)} coordinate points")
    return route


# ── Write Outputs ─────────────────────────────────────────────────────────────

def write_trail_files(routes: list[dict]) -> None:
    """Write individual trail JSON files and merge into index.json."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Load existing index
    existing_index: list[dict] = []
    if INDEX_PATH.exists():
        with open(INDEX_PATH, encoding="utf-8") as f:
            existing_index = json.load(f)

    # Remove existing trail entries (we'll replace them)
    trail_ids = {r["id"] for r in routes}
    existing_index = [e for e in existing_index if e["id"] not in trail_ids]

    for route in routes:
        route_id = route["id"]
        file_path = OUTPUT_DIR / f"{route_id}.json"

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(route, f, ensure_ascii=False, indent=2)

        # Add to index (without geometry)
        entry = {k: v for k, v in route.items() if k != "geometry"}
        existing_index.append(entry)

    # Write merged index
    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(existing_index, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Wrote {len(routes)} trail files. Index now has {len(existing_index)} total routes.")


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    print("=== RunSG — Fetch Trail Routes (Overpass/OSM) ===\n")

    successful: list[dict] = []

    for trail_def in TRAILS:
        route = process_trail(trail_def)
        if route:
            successful.append(route)
        time.sleep(QUERY_DELAY_S)

    if not successful:
        print("ERROR: No trails were successfully fetched.", file=sys.stderr)
        sys.exit(1)

    print(f"\nFetched {len(successful)}/{len(TRAILS)} trails. Writing files...\n")
    write_trail_files(successful)


if __name__ == "__main__":
    main()
