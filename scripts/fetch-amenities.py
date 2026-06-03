#!/usr/bin/env python3
"""
fetch-amenities.py — Query OpenStreetMap Overpass for running-relevant amenities
                     in Singapore: drinking water, toilets, and shelters.

Tasks: T-063, T-064, T-065
Usage:  python scripts/fetch-amenities.py
Output: public/data/amenities/water-points.json
        public/data/amenities/toilets.json
        public/data/amenities/shelters.json
"""

import json
import os
import sys
import time
from datetime import date
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: 'requests' is required. Install with: pip install requests", file=sys.stderr)
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────

WORKSPACE_DIR = Path(__file__).parent.parent
OUTPUT_DIR = WORKSPACE_DIR / "public" / "data" / "amenities"

# Overpass API endpoint
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Singapore bounding box (south, west, north, east)
SG_BBOX = "1.15,103.60,1.47,104.10"

# Amenity queries
AMENITY_QUERIES = {
    "water-points": {
        "overpass_tags": '["amenity"="drinking_water"]',
        "type": "water",
        "description": "Drinking water fountains and coolers",
    },
    "toilets": {
        "overpass_tags": '["amenity"="toilets"]',
        "type": "toilet",
        "description": "Public toilets",
    },
    "shelters": {
        "overpass_tags": '["amenity"="shelter"]',
        "type": "shelter",
        "description": "Rain shelters and covered rest areas",
    },
}


def query_overpass(tags: str) -> list[dict]:
    """Query Overpass API for nodes/ways matching tags within Singapore."""
    query = f"""
    [out:json][timeout:30];
    (
      node{tags}({SG_BBOX});
      way{tags}({SG_BBOX});
    );
    out center;
    """

    print(f"    Querying Overpass API...", end=" ", flush=True)
    try:
        headers = {
            "User-Agent": "RunSG-Route-Explorer/1.0 (github.com/jeffkhong/runsg)",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        resp = requests.post(OVERPASS_URL, data={"data": query}, headers=headers, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        elements = data.get("elements", [])
        print(f"✓ {len(elements)} results")
        return elements
    except requests.RequestException as e:
        print(f"✗ Failed: {e}", file=sys.stderr)
        return []


def extract_amenities(elements: list[dict], amenity_type: str) -> list[dict]:
    """Convert Overpass elements to our amenity format."""
    today = date.today().isoformat()
    amenities = []

    for elem in elements:
        # Get coordinates (center for ways, direct for nodes)
        if elem["type"] == "node":
            lat = elem.get("lat")
            lng = elem.get("lon")
        elif "center" in elem:
            lat = elem["center"].get("lat")
            lng = elem["center"].get("lon")
        else:
            continue

        if lat is None or lng is None:
            continue

        tags = elem.get("tags", {})
        name = tags.get("name", tags.get("description", ""))

        amenities.append({
            "id": f"{amenity_type}-{elem['id']}",
            "type": amenity_type,
            "name": name if name else None,
            "lat": round(lat, 6),
            "lng": round(lng, 6),
            "source": "osm",
            "last_verified": today,
        })

    return amenities


def main() -> None:
    print("=== RunSG — Fetch Amenities from OpenStreetMap ===\n")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    total = 0

    for filename, config in AMENITY_QUERIES.items():
        print(f"  [{config['type'].upper()}] {config['description']}...")

        elements = query_overpass(config["overpass_tags"])

        if not elements:
            print(f"    ⚠ No results — writing empty file")
            amenities = []
        else:
            amenities = extract_amenities(elements, config["type"])

        # Write output file
        out_path = OUTPUT_DIR / f"{filename}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(amenities, f, separators=(",", ":"))

        print(f"    ✓ Wrote {len(amenities)} amenities → {out_path.name}")
        total += len(amenities)

        # Rate-limit Overpass requests
        time.sleep(1.5)

    print(f"\n✅ Done. {total} total amenities written to public/data/amenities/")


if __name__ == "__main__":
    main()
