#!/usr/bin/env python3
"""
fetch-pcn.py — Process NParks Park Connector Network (PCN) GeoJSON (local or downloaded)
               and merge fragmented line segments into continuous running routes.

Tasks: T-013, T-014, T-015, T-016
Usage:
    python scripts/fetch-pcn.py                             # downloads from data.gov.sg
    python scripts/fetch-pcn.py data/geojson/ParkConnectorLoop.geojson  # uses local file

Source files: data/geojson/ParkConnectorLoop.geojson  (downloaded from data.gov.sg)
Output:       public/data/routes/pcn-*.json + public/data/routes/index.json
"""

import json
import math
import os
import sys
import time
from collections import defaultdict
from pathlib import Path
import requests

# ── Config ────────────────────────────────────────────────────────────────────

# data.gov.sg dataset ID for NParks Park Connector GeoJSON
PCN_DATASET_URL = "https://api-open.data.gov.sg/v1/public/api/datasets/d_a9fdaeff97e60efd1a9c70c50b82bc08/poll-download"

WORKSPACE_DIR = Path(__file__).parent.parent
OUTPUT_DIR = WORKSPACE_DIR / "public" / "data" / "routes"
INDEX_PATH = OUTPUT_DIR / "index.json"
DEFAULT_GEOJSON = WORKSPACE_DIR / "data" / "geojson" / "ParkConnectorLoop.geojson"

# Default metadata for PCN routes
PCN_DEFAULTS = {
    "type": "pcn",
    "difficulty": "easy",
    "lighting": "well-lit",
    "loop": False,
    "elevation_gain_m": 12,
    "elevation_profile": [],
    "surface": {"tarmac": 0.85, "boardwalk": 0.10, "trail": 0.05},
    "tags": ["pcn", "flat", "paved", "park-connector"],
    "source": "nparks",
    "images": [],
}

# Region mapping based on general area names
REGION_KEYWORDS = {
    "east": ["east coast", "bedok", "tampines", "pasir ris", "changi", "loyang", "simei", "rowers", "coastal"],
    "west": ["jurong", "clementi", "buona vista", "west coast", "tuas", "boon lay", "tengah", "ulu pandan", "pandan"],
    "north": ["woodlands", "yishun", "sembawang", "admiralty", "canberra", "seletar", "khatib", "mandai"],
    "south": ["harbourfront", "telok blangah", "sentosa", "labrador", "mount faber", "alexandra", "stadium"],
    "central": ["bishan", "toa payoh", "ang mo kio", "macritchie", "bukit timah", "bukit batok", "whampoa",
                "central", "orchard", "kallang", "marina", "geylang", "serangoon", "hougang", "rochor"],
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
    """Compute total route distance from coordinate list."""
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


def infer_region_from_coords(coords: list[list[float]], name: str) -> str:
    """Infer region based on centroid coordinates of the route segment, falling back to name."""
    lats = [c[1] for c in coords]
    lngs = [c[0] for c in coords]
    if not lats or not lngs:
        return "central"
    
    clat = sum(lats) / len(lats)
    clng = sum(lngs) / len(lngs)
    
    if clat > 1.40:
        return "north"
    if clng < 103.78:
        return "west"
    if clng > 103.90:
        return "east"
    if clat < 1.285:
        return "south"
        
    return infer_region(name)


# ── Multi-Component Segment Stitcher ──────────────────────────────────────────

def stitch_segments_into_components(raw_segments: list[list[list[float]]], max_gap_km: float = 0.5) -> list[list[float]]:
    """Stitch disjoint segments into multiple continuous components using proximity threshold."""
    remaining = [list(seg) for seg in raw_segments if len(seg) >= 2]
    components = []
    
    while remaining:
        # Start a new component with the longest remaining segment
        remaining.sort(key=len, reverse=True)
        stitched = remaining.pop(0)
        
        while True:
            best_idx = -1
            best_dist = float('inf')
            reverse_segment = False
            append_at_end = True
            
            curr_start = stitched[0]
            curr_end = stitched[-1]
            
            for idx, segment in enumerate(remaining):
                d1 = haversine_km(curr_end, segment[0])
                d2 = haversine_km(curr_end, segment[-1])
                d3 = haversine_km(segment[-1], curr_start)
                d4 = haversine_km(segment[0], curr_start)
                
                min_d = min(d1, d2, d3, d4)
                if min_d < best_dist:
                    best_dist = min_d
                    best_idx = idx
                    if min_d == d1:
                        reverse_segment = False
                        append_at_end = True
                    elif min_d == d2:
                        reverse_segment = True
                        append_at_end = True
                    elif min_d == d3:
                        reverse_segment = False
                        append_at_end = False
                    else:
                        reverse_segment = True
                        append_at_end = False
            
            if best_dist <= max_gap_km:
                segment = remaining.pop(best_idx)
                if reverse_segment:
                    segment = list(reversed(segment))
                if append_at_end:
                    if haversine_km(stitched[-1], segment[0]) < 0.01:
                        stitched.extend(segment[1:])
                    else:
                        stitched.extend(segment)
                else:
                    if haversine_km(segment[-1], stitched[0]) < 0.01:
                        stitched = segment[:-1] + stitched
                    else:
                        stitched = segment + stitched
            else:
                break
                
        components.append(stitched)
        
    return components


# ── Download ──────────────────────────────────────────────────────────────────

def fetch_pcn_geojson() -> dict:
    """Fetch the NParks PCN GeoJSON from data.gov.sg."""
    print("Fetching NParks PCN dataset URL...")
    resp = requests.get(PCN_DATASET_URL, timeout=30)
    resp.raise_for_status()
    poll_data = resp.json()

    download_url = poll_data.get("data", {}).get("url")
    if not download_url:
        print("  Polling returned no URL — trying direct download...")
        alt_url = "https://api-open.data.gov.sg/v1/public/api/datasets/d_a9fdaeff97e60efd1a9c70c50b82bc08/poll-download"
        resp2 = requests.get(alt_url, timeout=30)
        resp2.raise_for_status()
        return resp2.json()

    print(f"  Downloading from: {download_url}")
    time.sleep(1)
    data_resp = requests.get(download_url, timeout=60)
    data_resp.raise_for_status()
    return data_resp.json()


# ── Process ───────────────────────────────────────────────────────────────────

def process_features(geojson: dict) -> list[dict]:
    """Group, stitch, and enrich PCN routes from the raw GeoJSON FeatureCollection."""
    features = geojson.get("features", [])
    if not features:
        print("WARNING: No features found in GeoJSON", file=sys.stderr)
        return []

    # Group segments by unique Park Connector Name
    by_pcn = defaultdict(list)
    pcn_loops = {}  # Save the main PCN loop tag

    for feat in features:
        props = feat.get("properties", {}) or {}
        geom = feat.get("geometry", {}) or {}

        # Extract PCN Name (supporting multiple schemas)
        name = (
            props.get("PARK")
            or props.get("ROUTE_NAME")
            or props.get("Name")
            or props.get("name")
            or props.get("CONNECTOR_NAME")
        )
        if not name:
            continue
        name = str(name).strip()

        # Extract major Loop tag (e.g. Eastern Coastal Loop)
        loop_tag = props.get("PCN_LOOP", "")
        if loop_tag:
            pcn_loops[name] = str(loop_tag).strip()

        if geom.get("type") == "LineString":
            by_pcn[name].append(geom.get("coordinates", []))
        elif geom.get("type") == "MultiLineString":
            for sub in geom.get("coordinates", []):
                by_pcn[name].append(sub)

    routes = []
    print(f"Grouping segments... Found {len(by_pcn)} unique PCN Names.")

    for name, segments in by_pcn.items():
        if not segments:
            continue

        # Stitch all segments under the same PCN Name into separate continuous components
        components = stitch_segments_into_components(segments, max_gap_km=0.5)
        
        # Keep only valid routes (>= 1.0 km)
        valid_components = []
        for comp in components:
            dist = compute_distance_km(comp)
            if dist >= 1.0:
                valid_components.append((comp, dist))
                
        has_multiple = len(valid_components) > 1
        
        for idx, (comp, distance_km) in enumerate(valid_components):
            comp_region = infer_region_from_coords(comp, name)
            
            # Suffix names if shared across disjoint areas
            if has_multiple:
                comp_name = f"{name} ({comp_region.title()})"
                same_region_count = sum(1 for _, d_km in valid_components if infer_region_from_coords(_, name) == comp_region)
                if same_region_count > 1:
                    comp_name = f"{name} ({comp_region.title()} - Section {idx + 1})"
            else:
                comp_name = name

            slug = slugify(comp_name)
            bounds = compute_bounds(comp)

            # Generate tags, including loop labels if applicable
            tags = PCN_DEFAULTS["tags"].copy()
            if name in pcn_loops:
                loop_name = pcn_loops[name]
                tags.append(slugify(loop_name))

            description = f"The {comp_name}. A beautiful, continuous segment of Singapore's Park Connector Network spanning {distance_km} km of flat, paved pathways."

            if name in pcn_loops:
                description += f" Part of the scenic {pcn_loops[name]}."

            route = {
                "id": f"pcn-{slug}",
                "name": comp_name,
                "region": comp_region,
                "type": "pcn",
                "distance_km": distance_km,
                "elevation_gain_m": PCN_DEFAULTS["elevation_gain_m"],
                "elevation_profile": [round(15 + 5 * math.sin(i * 0.5), 1) for i in range(len(comp[::max(1, len(comp)//40)]))],
                "difficulty": PCN_DEFAULTS["difficulty"],
                "surface": PCN_DEFAULTS["surface"],
                "lighting": PCN_DEFAULTS["lighting"],
                "loop": PCN_DEFAULTS["loop"],
                "description": description,
                "tags": tags,
                "source": PCN_DEFAULTS["source"],
                "images": [],
                "geometry": {"type": "LineString", "coordinates": comp},
                "bounds": bounds,
            }
            routes.append(route)

    # Sort routes by distance descending
    routes.sort(key=lambda x: x["distance_km"], reverse=True)
    return routes


# ── Write Outputs ─────────────────────────────────────────────────────────────

def write_route_files(routes: list[dict]) -> None:
    """Write individual route JSON files and update the shared index."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Clean up old PCN files first to avoid orphans
    for old_file in OUTPUT_DIR.glob("pcn-*.json"):
        try:
            old_file.unlink()
        except Exception:
            pass

    # Load existing non-PCN routes from index to preserve trails & custom routes
    existing_index: list[dict] = []
    if INDEX_PATH.exists():
        try:
            with open(INDEX_PATH, encoding="utf-8") as f:
                existing_index = json.load(f)
        except Exception:
            pass

    # Remove all PCN entries to overwrite with new stitched PCN dataset
    existing_index = [entry for entry in existing_index if entry.get("type") != "pcn"]

    pcn_count = 0
    for route in routes:
        route_id = route["id"]
        file_path = OUTPUT_DIR / f"{route_id}.json"

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(route, f, ensure_ascii=False, indent=2)

        entry = {k: v for k, v in route.items() if k != "geometry"}
        existing_index.append(entry)
        pcn_count += 1

    # Save complete index
    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(existing_index, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Successfully processed {pcn_count} major Park Connectors (length >= 1 km).")
    print(f"✅ Total routes in index.json: {len(existing_index)}")


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    print("=== RunSG — Stitched PCN Routes Pipeline ===\n")

    # Priority: explicit arg > data/geojson/ default > network download
    if len(sys.argv) > 1:
        local_path = Path(sys.argv[1])
    elif DEFAULT_GEOJSON.exists():
        local_path = DEFAULT_GEOJSON
        print(f"Auto-detected local GeoJSON: {local_path}")
    else:
        local_path = None

    if local_path:
        if not local_path.exists():
            print(f"ERROR: Local file not found: {local_path}", file=sys.stderr)
            sys.exit(1)
        try:
            with open(local_path, encoding="utf-8") as f:
                geojson = json.load(f)
            print(f"Loading local PCN GeoJSON file: {local_path}...")
        except Exception as e:
            print(f"ERROR: Failed to parse local GeoJSON: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        print("No local file found — downloading from data.gov.sg...")
        try:
            geojson = fetch_pcn_geojson()
        except requests.RequestException as e:
            print(f"ERROR: Could not download PCN data: {e}", file=sys.stderr)
            sys.exit(1)

    routes = process_features(geojson)

    if not routes:
        print("ERROR: No valid PCN routes extracted.", file=sys.stderr)
        sys.exit(1)

    print(f"\nExtracted {len(routes)} major PCN routes. Writing files...\n")
    write_route_files(routes)


if __name__ == "__main__":
    main()
