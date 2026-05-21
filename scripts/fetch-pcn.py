#!/usr/bin/env python3
"""
fetch-pcn.py — Download NParks Park Connector Network GeoJSON from data.gov.sg
               and split into individual route JSON files.

Tasks: T-013, T-014, T-015, T-016
Output: public/data/routes/pcn-*.json + public/data/routes/index.json
"""

import json
import math
import os
import sys
import time
from pathlib import Path
import requests

# ── Config ────────────────────────────────────────────────────────────────────

# data.gov.sg dataset ID for NParks Park Connector GeoJSON
# Check https://data.gov.sg/datasets for the current resource ID
PCN_DATASET_URL = "https://api-open.data.gov.sg/v1/public/api/datasets/d_a9fdaeff97e60efd1a9c70c50b82bc08/poll-download"

OUTPUT_DIR = Path(__file__).parent.parent / "public" / "data" / "routes"
INDEX_PATH = OUTPUT_DIR / "index.json"

# Default metadata for PCN routes (will be enriched manually or by tags)
PCN_DEFAULTS = {
    "type": "pcn",
    "difficulty": "easy",
    "lighting": "well-lit",
    "loop": False,
    "elevation_gain_m": 10,
    "elevation_profile": [],
    "surface": {"tarmac": 0.7, "boardwalk": 0.2, "trail": 0.1},
    "tags": ["pcn", "park-connector", "flat", "paved"],
    "source": "nparks",
    "images": [],
}

# Region mapping based on general area names in PCN data
REGION_KEYWORDS = {
    "east": ["east coast", "bedok", "tampines", "pasir ris", "changi", "loyang", "simei"],
    "west": ["jurong", "clementi", "buona vista", "west coast", "tuas", "boon lay", "tengah"],
    "north": ["woodlands", "yishun", "sembawang", "admiralty", "canberra", "seletar"],
    "south": ["harbourfront", "telok blangah", "sentosa", "labrador", "mount faber", "alexandra"],
    "central": ["bishan", "toa payoh", "ang mo kio", "macritchie", "bukit timah", "bukit batok",
                "central", "orchard", "kallang", "marina", "geylang", "serangoon", "hougang"],
}


# ── Utilities ─────────────────────────────────────────────────────────────────

def haversine_km(p1: list[float], p2: list[float]) -> float:
    """Haversine distance between [lng,lat] pairs in km."""
    lng1, lat1 = math.radians(p1[0]), math.radians(p1[1])
    lng2, lat2 = math.radians(p2[0]), math.radians(p2[1])
    dlat, dlng = lat2 - lat1, lng2 - lng1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))


def compute_distance_km(coords: list[list[float]]) -> float:
    """Compute total route distance from GeoJSON coordinate list."""
    total = 0.0
    for i in range(1, len(coords)):
        total += haversine_km(coords[i - 1], coords[i])
    return round(total, 2)


def compute_bounds(coords: list[list[float]]) -> list[float]:
    """Return [south, west, north, east] bounding box."""
    lngs = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return [min(lats), min(lngs), max(lats), max(lngs)]


def slugify(name: str) -> str:
    """Convert route name to a file-safe slug."""
    return (
        name.lower()
        .replace(" ", "-")
        .replace("/", "-")
        .replace("(", "")
        .replace(")", "")
        .replace(",", "")
        .replace("'", "")
        .strip("-")
    )


def infer_region(name: str) -> str:
    """Infer region from route name using keyword matching."""
    name_lower = name.lower()
    for region, keywords in REGION_KEYWORDS.items():
        if any(kw in name_lower for kw in keywords):
            return region
    return "central"  # Default


# ── Download ──────────────────────────────────────────────────────────────────

def fetch_pcn_geojson() -> dict:
    """Fetch the NParks PCN GeoJSON from data.gov.sg."""
    print("Fetching NParks PCN dataset URL...")

    # Step 1: Poll for download URL
    resp = requests.get(PCN_DATASET_URL, timeout=30)
    resp.raise_for_status()
    poll_data = resp.json()

    download_url = poll_data.get("data", {}).get("url")
    if not download_url:
        # Some endpoints return direct GeoJSON; try alternate approach
        print("  Polling returned no URL — trying direct download...")
        # Fallback: try the static GeoJSON endpoint
        alt_url = "https://api-open.data.gov.sg/v1/public/api/datasets/d_a9fdaeff97e60efd1a9c70c50b82bc08/poll-download"
        resp2 = requests.get(alt_url, timeout=30)
        resp2.raise_for_status()
        return resp2.json()

    print(f"  Downloading from: {download_url}")
    time.sleep(1)  # Polite delay
    data_resp = requests.get(download_url, timeout=60)
    data_resp.raise_for_status()
    return data_resp.json()


# ── Process ───────────────────────────────────────────────────────────────────

def process_features(geojson: dict) -> list[dict]:
    """Extract and enrich route features from the GeoJSON FeatureCollection."""
    features = geojson.get("features", [])
    if not features:
        print("WARNING: No features found in GeoJSON", file=sys.stderr)
        return []

    routes = []
    seen_slugs: dict[str, int] = {}

    for feat in features:
        props = feat.get("properties", {}) or {}
        geom = feat.get("geometry", {}) or {}

        if geom.get("type") != "LineString":
            # Handle MultiLineString by taking the longest segment
            if geom.get("type") == "MultiLineString":
                coords_list = geom.get("coordinates", [])
                coords = max(coords_list, key=len) if coords_list else []
            else:
                continue
        else:
            coords = geom.get("coordinates", [])

        if len(coords) < 2:
            continue

        # Extract name from common NParks PCN property names
        name = (
            props.get("ROUTE_NAME")
            or props.get("Name")
            or props.get("name")
            or props.get("CONNECTOR_NAME")
            or f"PCN Route {len(routes) + 1}"
        )
        name = str(name).strip()

        slug = slugify(name)
        if slug in seen_slugs:
            seen_slugs[slug] += 1
            slug = f"{slug}-{seen_slugs[slug]}"
        else:
            seen_slugs[slug] = 0

        distance_km = compute_distance_km(coords)
        bounds = compute_bounds(coords)
        region = infer_region(name)

        route = {
            "id": f"pcn-{slug}",
            "name": name,
            "region": region,
            "distance_km": distance_km,
            "elevation_gain_m": PCN_DEFAULTS["elevation_gain_m"],
            "elevation_profile": PCN_DEFAULTS["elevation_profile"],
            "difficulty": PCN_DEFAULTS["difficulty"],
            "surface": PCN_DEFAULTS["surface"],
            "lighting": PCN_DEFAULTS["lighting"],
            "loop": PCN_DEFAULTS["loop"],
            "description": f"{name} — part of Singapore's Park Connector Network. {distance_km} km of mostly paved paths.",
            "tags": PCN_DEFAULTS["tags"].copy(),
            "source": PCN_DEFAULTS["source"],
            "images": [],
            "geometry": {"type": "LineString", "coordinates": coords},
            "bounds": bounds,
        }
        routes.append(route)

    return routes


# ── Write Outputs ─────────────────────────────────────────────────────────────

def write_route_files(routes: list[dict]) -> None:
    """Write individual route JSON files and the index."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    index_entries = []

    for route in routes:
        route_id = route["id"]
        file_path = OUTPUT_DIR / f"{route_id}.json"

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(route, f, ensure_ascii=False, indent=2)

        # Index entry: all fields except full geometry (to keep index small)
        entry = {k: v for k, v in route.items() if k != "geometry"}
        index_entries.append(entry)

        print(f"  ✓ {route_id} ({route['distance_km']} km, {route['region']})")

    # Write index
    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(index_entries, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Wrote {len(routes)} route files + index.json")


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    print("=== RunSG — Fetch PCN Routes ===\n")

    try:
        geojson = fetch_pcn_geojson()
    except requests.RequestException as e:
        print(f"ERROR: Could not download PCN data: {e}", file=sys.stderr)
        sys.exit(1)

    routes = process_features(geojson)

    if not routes:
        print("ERROR: No valid routes extracted.", file=sys.stderr)
        sys.exit(1)

    print(f"\nExtracted {len(routes)} PCN routes. Writing files...\n")
    write_route_files(routes)


if __name__ == "__main__":
    main()
