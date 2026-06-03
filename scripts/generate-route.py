#!/usr/bin/env python3
"""
generate-route.py — Generate road/mixed custom routes from waypoints using ORS Directions API.

Tasks: T-039, T-040
Usage:  python scripts/generate-route.py
        Set ORS_API_KEY env var (free at openrouteservice.org) for snapped geometries.
        Without key: straight-line fallback coordinates are written (basic accuracy).

Output: public/data/routes/<route-id>.json + public/data/routes/index.json
"""

import json
import math
import os
import sys
import time
from pathlib import Path
import requests

# ── Config ────────────────────────────────────────────────────────────────────

ORS_URL = "https://api.openrouteservice.org/v2/directions/foot-walking/geojson"
WORKSPACE_DIR = Path(__file__).parent.parent
OUTPUT_DIR = WORKSPACE_DIR / "public" / "data" / "routes"
INDEX_PATH = OUTPUT_DIR / "index.json"

# ── Custom Route Definitions (T-040) ─────────────────────────────────────────
# Waypoints are [lng, lat] pairs that define the intended path.
# ORS will snap them to actual walkable paths and return real geometry.

CUSTOM_ROUTES = [
    {
        "id": "marina-bay-loop",
        "name": "Marina Bay Loop",
        "region": "central",
        "type": "road",
        "difficulty": "easy",
        "lighting": "well-lit",
        "loop": True,
        "elevation_gain_m": 15,
        "surface": {"tarmac": 0.90, "boardwalk": 0.10},
        "description": "A flat, scenic 5km loop around Marina Bay. Pass the Merlion, Helix Bridge, ArtScience Museum, and Gardens by the Bay. Ideal for evening runs with iconic skyline views.",
        "tags": ["urban", "flat", "scenic", "night-run", "marina-bay", "loop"],
        "waypoints": [
            [103.8543, 1.2866],  # Merlion Park
            [103.8613, 1.2834],  # Helix Bridge
            [103.8694, 1.2816],  # Marina Bay Sands
            [103.8653, 1.2773],  # Gardens by the Bay
            [103.8560, 1.2795],  # Marina Barrage
            [103.8543, 1.2866],  # Back to Merlion
        ],
    },
    {
        "id": "punggol-waterway-pcn",
        "name": "Punggol Waterway PCN",
        "region": "north",
        "type": "pcn",
        "difficulty": "easy",
        "lighting": "well-lit",
        "loop": True,
        "elevation_gain_m": 10,
        "surface": {"tarmac": 0.85, "boardwalk": 0.15},
        "description": "A popular HDB-town running loop along the Punggol Waterway. Flat, well-lit, with multiple water points. A favourite for weeknight group runs.",
        "tags": ["pcn", "waterway", "flat", "well-lit", "family-friendly"],
        "waypoints": [
            [103.9057, 1.4059],  # Punggol MRT
            [103.9131, 1.4083],  # Waterway Point
            [103.9200, 1.4030],  # Punggol Waterway
            [103.9150, 1.3990],  # Punggol Park
            [103.9057, 1.4059],  # Back to MRT
        ],
    },
    {
        "id": "sentosa-boardwalk-run",
        "name": "Sentosa Boardwalk Run",
        "region": "south",
        "type": "road",
        "difficulty": "easy",
        "lighting": "well-lit",
        "loop": False,
        "elevation_gain_m": 25,
        "surface": {"tarmac": 0.50, "boardwalk": 0.50},
        "description": "From VivoCity across the Sentosa Boardwalk to Palawan Beach and back. A unique run with harbour views and a beach finish.",
        "tags": ["boardwalk", "beach", "sentosa", "coastal", "scenic"],
        "waypoints": [
            [103.8215, 1.2642],  # VivoCity
            [103.8301, 1.2558],  # Sentosa Gateway
            [103.8285, 1.2497],  # Palawan Beach
        ],
    },
    {
        "id": "upper-seletar-loop",
        "name": "Upper Seletar Reservoir Loop",
        "region": "north",
        "type": "mixed",
        "difficulty": "moderate",
        "lighting": "partial",
        "loop": True,
        "elevation_gain_m": 55,
        "surface": {"tarmac": 0.40, "boardwalk": 0.10, "trail": 0.50},
        "description": "A peaceful reservoir loop in the north. Mix of paved paths and forest trails, with views of the rocket tower and surrounding nature reserve.",
        "tags": ["reservoir", "mixed", "nature", "loop", "quiet"],
        "waypoints": [
            [103.8050, 1.4010],  # Mandai Rd entrance
            [103.8100, 1.4080],  # Dam area
            [103.8180, 1.4050],  # East bank
            [103.8130, 1.3980],  # South shore
            [103.8050, 1.4010],  # Back to start
        ],
    },
    {
        "id": "bishan-amk-pcn",
        "name": "Bishan–Ang Mo Kio Park PCN",
        "region": "central",
        "type": "pcn",
        "difficulty": "easy",
        "lighting": "well-lit",
        "loop": True,
        "elevation_gain_m": 12,
        "surface": {"tarmac": 0.80, "boardwalk": 0.15, "trail": 0.05},
        "description": "A lush riverside loop through the naturalized Kallang River section of Bishan-AMK Park. Flat tarmac paths, playground stops, and dog-watching opportunities.",
        "tags": ["pcn", "park", "flat", "family-friendly", "riverside"],
        "waypoints": [
            [103.8476, 1.3600],  # Bishan MRT entrance
            [103.8472, 1.3650],  # Pond area
            [103.8490, 1.3700],  # AMK section
            [103.8510, 1.3650],  # River meander
            [103.8476, 1.3600],  # Back to start
        ],
    },
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


# ── ORS API ───────────────────────────────────────────────────────────────────

def call_ors(waypoints: list[list[float]], api_key: str) -> dict | None:
    """Call ORS Directions API with waypoints, return GeoJSON feature."""
    headers = {
        "Authorization": api_key,
        "Content-Type": "application/json",
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
        print(f"    ERROR: ORS API failed: {e}", file=sys.stderr)

    return None


# ── Process ───────────────────────────────────────────────────────────────────

def process_custom_route(route_def: dict, api_key: str) -> dict | None:
    """Generate a route from waypoints via ORS."""
    route_id = route_def["id"]
    print(f"  Generating: {route_def['name']}...")

    feature = call_ors(route_def["waypoints"], api_key)
    if not feature:
        print(f"    WARNING: Could not generate route for {route_id}")
        # Fall back to straight-line waypoints
        coords = route_def["waypoints"]
    else:
        geom = feature.get("geometry", {})
        coords = geom.get("coordinates", [])
        # ORS returns [lng, lat, elevation] — strip elevation for storage
        coords = [[c[0], c[1]] for c in coords]

    if len(coords) < 2:
        print(f"    ERROR: Insufficient coordinates for {route_id}")
        return None

    distance_km = compute_distance_km(coords)
    bounds = compute_bounds(coords)

    # Extract elevation profile if available
    elevation_profile: list[float] = []
    if feature:
        raw_coords = feature.get("geometry", {}).get("coordinates", [])
        if raw_coords and len(raw_coords[0]) >= 3:
            # Sample every N points for a reasonable profile
            step = max(1, len(raw_coords) // 50)
            elevation_profile = [round(c[2], 1) for c in raw_coords[::step]]

    route = {
        "id": route_id,
        "name": route_def["name"],
        "region": route_def["region"],
        "type": route_def["type"],
        "distance_km": distance_km,
        "elevation_gain_m": route_def["elevation_gain_m"],
        "elevation_profile": elevation_profile,
        "difficulty": route_def["difficulty"],
        "surface": route_def["surface"],
        "lighting": route_def["lighting"],
        "loop": route_def["loop"],
        "description": route_def["description"],
        "tags": route_def["tags"],
        "source": "ors",
        "images": [],
        "geometry": {"type": "LineString", "coordinates": coords},
        "bounds": bounds,
    }

    print(f"    ✓ {route_id}: {distance_km} km, {len(coords)} points")
    return route


# ── Write Outputs ─────────────────────────────────────────────────────────────

def write_route_files(routes: list[dict]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Load existing index
    existing_index: list[dict] = []
    if INDEX_PATH.exists():
        with open(INDEX_PATH, encoding="utf-8") as f:
            existing_index = json.load(f)

    # Remove existing custom entries
    custom_ids = {r["id"] for r in routes}
    existing_index = [e for e in existing_index if e["id"] not in custom_ids]

    for route in routes:
        route_id = route["id"]
        file_path = OUTPUT_DIR / f"{route_id}.json"

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(route, f, ensure_ascii=False, indent=2)

        entry = {k: v for k, v in route.items() if k != "geometry"}
        existing_index.append(entry)

    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(existing_index, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Wrote {len(routes)} custom route files. Index now has {len(existing_index)} total routes.")


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    print("=== RunSG — Generate Custom Routes (ORS) ===\n")

    api_key = os.environ.get("ORS_API_KEY", "")
    if not api_key:
        print("WARNING: ORS_API_KEY not set. Routes will use straight-line waypoints.\n"
              "Get a free key at https://openrouteservice.org/dev/#/signup\n",
              file=sys.stderr)

    successful: list[dict] = []

    for route_def in CUSTOM_ROUTES:
        route = process_custom_route(route_def, api_key)
        if route:
            successful.append(route)
        time.sleep(1)  # Rate-limit

    if not successful:
        print("ERROR: No routes were generated.", file=sys.stderr)
        sys.exit(1)

    print(f"\nGenerated {len(successful)}/{len(CUSTOM_ROUTES)} routes. Writing files...\n")
    write_route_files(successful)


if __name__ == "__main__":
    main()
