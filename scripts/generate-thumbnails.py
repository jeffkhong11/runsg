#!/usr/bin/env python3
"""
generate-thumbnails.py — RunSG route thumbnail generator
Generates static map preview images for all 121 routes using the Mapbox Static Images API.
Images are saved to public/data/images/routes/{route-id}.png

Usage:
    python scripts/generate-thumbnails.py

Requires:
    - VITE_MAPBOX_TOKEN in .env file (or MAPBOX_TOKEN env var)
    - pip install requests

Rate limits:
    - Mapbox free tier: 100,000 static image requests/month
    - This script: max 2 requests/second, skips already-generated images
"""

import json
import os
import sys
import time
from pathlib import Path

import requests

# ─── Configuration ────────────────────────────────────────────────────────────

REPO_ROOT = Path(__file__).parent.parent
ROUTES_DIR = REPO_ROOT / "public" / "data" / "routes"
INDEX_FILE = ROUTES_DIR / "index.json"
OUTPUT_DIR = REPO_ROOT / "public" / "data" / "images" / "routes"

# Image dimensions (400x200 @2x = 800x400 actual rendered pixels)
IMG_WIDTH = 400
IMG_HEIGHT = 200

# Mapbox style — light map for crisp route lines on cards
MAPBOX_STYLE = "mapbox/light-v11"

# Route type accent colors (match CSS design tokens)
ROUTE_COLORS = {
    "pcn":   "16c95d",  # emerald green
    "trail": "d97706",  # amber
    "road":  "6366f1",  # indigo
    "mixed": "0891b2",  # cyan
}

# Padding in degrees to add around route bounding box (~500m)
BBOX_PADDING = 0.005

# Polyline stroke
STROKE_WIDTH = 5
STROKE_OPACITY = 0.9

# Rate limiting: 2 req/s is safe for Mapbox free tier
DELAY_SECONDS = 0.55

# ─── Helpers ──────────────────────────────────────────────────────────────────

def load_token() -> str:
    """Load Mapbox token from env or .env file."""
    token = os.environ.get("MAPBOX_TOKEN") or os.environ.get("VITE_MAPBOX_TOKEN")
    if token and token.startswith("pk."):
        return token

    env_file = REPO_ROOT / ".env"
    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line.startswith("VITE_MAPBOX_TOKEN="):
                    token = line.split("=", 1)[1].strip().strip('"').strip("'")
                    if token and token.startswith("pk."):
                        return token

    raise RuntimeError(
        "No Mapbox token found.\n"
        "  Set VITE_MAPBOX_TOKEN=pk.xxx in your .env file, or\n"
        "  export MAPBOX_TOKEN=pk.xxx"
    )


def encode_polyline(coords: list) -> str:
    """
    Encode [lng, lat] coordinate pairs using Google Encoded Polyline Algorithm.
    Mapbox Static Images API accepts 'enc:...' in the path overlay.
    """
    def _encode(val: float) -> str:
        val = round(val * 1e5)
        val = val << 1
        if val < 0:
            val = ~val
        result = []
        while val >= 32:
            result.append(chr((32 | (val & 31)) + 63))
            val >>= 5
        result.append(chr(val + 63))
        return ''.join(result)

    out = []
    prev_lat = prev_lng = 0
    for coord in coords:
        lng, lat = coord[0], coord[1]
        out.append(_encode(lat - prev_lat))
        out.append(_encode(lng - prev_lng))
        prev_lat, prev_lng = lat, lng
    return ''.join(out)


def simplify_coords(coords: list, max_points: int = 80) -> list:
    """Uniformly downsample to at most max_points (keeps first+last)."""
    if len(coords) <= max_points:
        return coords
    stride = (len(coords) - 1) / (max_points - 1)
    result = [coords[round(i * stride)] for i in range(max_points - 1)]
    result.append(coords[-1])
    return result


def build_url(token: str, coords: list, route_type: str, bounds: list) -> str:
    """
    Build a Mapbox Static Images URL using an explicit bounding-box viewport.
    
    Viewport format: [minLng,minLat,maxLng,maxLat]
    This is more reliable than 'auto' (which can fail with small or sparse geometries).
    """
    color = ROUTE_COLORS.get(route_type, "16c95d")
    simplified = simplify_coords(coords, 80)
    encoded = encode_polyline(simplified)

    # Polyline path overlay (no URL encoding — Mapbox accepts raw polyline chars)
    path = f"path-{STROKE_WIDTH}+{color}-{STROKE_OPACITY}(enc:{encoded})"

    # Bounding box from route index bounds field: [minLat, minLng, maxLat, maxLng]
    # Convert to Mapbox format:              [minLng, minLat, maxLng, maxLat]
    if bounds and len(bounds) == 4:
        min_lat, min_lng, max_lat, max_lng = bounds
    else:
        # Compute from coords as fallback
        lngs = [c[0] for c in coords]
        lats = [c[1] for c in coords]
        min_lng, max_lng = min(lngs), max(lngs)
        min_lat, max_lat = min(lats), max(lats)

    # Add padding so the route isn't flush against the edges
    viewport = (
        f"[{min_lng - BBOX_PADDING:.6f},"
        f"{min_lat - BBOX_PADDING:.6f},"
        f"{max_lng + BBOX_PADDING:.6f},"
        f"{max_lat + BBOX_PADDING:.6f}]"
    )

    url = (
        f"https://api.mapbox.com/styles/v1/{MAPBOX_STYLE}/static/"
        f"{path}/"
        f"{viewport}/"
        f"{IMG_WIDTH}x{IMG_HEIGHT}@2x"
        f"?access_token={token}"
    )
    return url


# Headers that satisfy Mapbox public token URL restrictions (token allows localhost:5173)
HEADERS = {
    "Referer": "http://localhost:5173",
    "Origin":  "http://localhost:5173",
    "User-Agent": "RunSG-Thumbnail-Generator/1.0",
}

def download(url: str, output_path: Path) -> bool:
    """Download image from URL to output_path. Returns True on success."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        if resp.status_code == 200:
            output_path.write_bytes(resp.content)
            return True
        else:
            print(f"  ✗ HTTP {resp.status_code}: {resp.text[:300]}")
            return False
    except Exception as e:
        print(f"  ✗ Error: {e}")
        return False


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("╔══════════════════════════════════════════════════╗")
    print("║  RunSG — Route Thumbnail Generator               ║")
    print("╚══════════════════════════════════════════════════╝\n")

    try:
        token = load_token()
        print(f"✓ Token loaded: {token[:14]}…")
    except RuntimeError as e:
        print(f"✗ {e}")
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"✓ Output dir:   {OUTPUT_DIR.relative_to(REPO_ROOT)}")

    with open(INDEX_FILE) as f:
        routes = json.load(f)
    print(f"✓ Routes:       {len(routes)} in index.json\n")

    success = skip = fail = 0
    index_changed = False

    for i, route in enumerate(routes, 1):
        route_id = route["id"]
        route_type = route.get("type", "pcn")
        out_path = OUTPUT_DIR / f"{route_id}.png"
        thumb_rel = f"data/images/routes/{route_id}.png"

        prefix = f"[{i:3d}/{len(routes)}] {route_id[:40]:<40}"

        # Skip already-generated
        if out_path.exists() and out_path.stat().st_size > 2000:
            print(f"{prefix} ⏭  exists")
            skip += 1
            if route.get("thumbnail") != thumb_rel:
                route["thumbnail"] = thumb_rel
                index_changed = True
            continue

        # Load geometry from individual route file
        route_file = ROUTES_DIR / f"{route_id}.json"
        if not route_file.exists():
            print(f"{prefix} ✗  no route file")
            fail += 1
            continue

        with open(route_file) as f:
            route_data = json.load(f)

        coords = route_data.get("geometry", {}).get("coordinates", [])
        if len(coords) < 2:
            print(f"{prefix} ✗  <2 coords")
            fail += 1
            continue

        bounds = route.get("bounds", [])
        url = build_url(token, coords, route_type, bounds)

        print(f"{prefix} ↓  fetching…", end="", flush=True)
        ok = download(url, out_path)
        if ok:
            size_kb = out_path.stat().st_size / 1024
            print(f" ✓ {size_kb:.0f}KB")
            route["thumbnail"] = thumb_rel
            index_changed = True
            success += 1
        else:
            fail += 1

        time.sleep(DELAY_SECONDS)

    # Persist thumbnail paths in index.json
    if index_changed:
        with open(INDEX_FILE, "w") as f:
            json.dump(routes, f, indent=2, ensure_ascii=False)
        print(f"\n✓ index.json updated with thumbnail paths")

    print(f"\n{'─' * 54}")
    print(f"  Generated : {success}")
    print(f"  Skipped   : {skip}")
    print(f"  Failed    : {fail}")
    print(f"  Total     : {len(routes)}")
    print(f"{'─' * 54}")

    if fail > 0:
        print(f"\n⚠  {fail} routes failed — check errors above")
        sys.exit(1)
    else:
        print(f"\n✓  All thumbnails ready in {OUTPUT_DIR.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
