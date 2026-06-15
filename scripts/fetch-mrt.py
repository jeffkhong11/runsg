#!/usr/bin/env python3
"""
fetch-mrt.py — Fetch Singapore MRT and LRT station exits from LTA/data.gov.sg
               and map them to lines using helper stop codes.

Usage:  python scripts/fetch-mrt.py
Output: public/data/mrt-stations.json
"""

import json
import re
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: 'requests' is required. Install with: pip install requests", file=sys.stderr)
    sys.exit(1)

WORKSPACE_DIR = Path(__file__).parent.parent
OUTPUT_DIR = WORKSPACE_DIR / "public" / "data"
OUTPUT_FILE = OUTPUT_DIR / "mrt-stations.json"

DATASET_ID = "d_b39d3a0871985372d7e1637193335da5"
POLL_URL = f"https://api-open.data.gov.sg/v1/public/api/datasets/{DATASET_ID}/poll-download"
MAPPING_URL = "https://raw.githubusercontent.com/xkjyeah/singapore-postal-codes/master/mrt_stations.json"


def clean_station_name(raw_name: str) -> str:
    """Clean and normalize MRT/LRT station names for matching."""
    name = raw_name.upper().strip()
    # Remove suffix variations
    name = re.sub(r"\s+(MRT|LRT)?\s*STATION$", "", name)
    name = re.sub(r"\s+STATION\s+(MRT|LRT)$", "", name)
    return name.strip()


def get_station_lines(codes: list[str]) -> list[str]:
    """Extract line prefixes from station codes (e.g. 'NS1' -> 'NS', 'EW24' -> 'EW')."""
    lines = set()
    for code in codes:
        # Match letters at start of code
        match = re.match(r"^([a-zA-Z]+)", code)
        if match:
            line = match.group(1).upper()
            # Normalize interchanges / branches
            if line == "CG":  # Changi Airport branch
                lines.add("EW")
            elif line == "CE":  # Circle Line extension
                lines.add("CC")
            else:
                lines.add(line)
    return sorted(list(lines))


def main():
    print("=== RunSG — Fetch MRT/LRT Station Exits Pipeline ===\n")
    
    # 1. Fetch station code mapping from xkjyeah
    print(f"Fetching station code mapping dictionary from GitHub...")
    try:
        resp = requests.get(MAPPING_URL, timeout=30)
        resp.raise_for_status()
        mapping_data = resp.json()
    except Exception as e:
        print(f"ERROR: Failed to fetch mapping: {e}", file=sys.stderr)
        sys.exit(1)

    # Build name -> codes lookup
    # e.g. "JURONG EAST" -> ["NS1", "EW24"]
    name_to_codes = {}
    for entry in mapping_data:
        raw_name = entry.get("Station Name", "")
        station_code = entry.get("Station", "")
        if not raw_name or not station_code:
            continue
        clean_name = clean_station_name(raw_name)
        if clean_name not in name_to_codes:
            name_to_codes[clean_name] = []
        name_to_codes[clean_name].append(station_code)

    print(f"  Loaded {len(name_to_codes)} station name mappings.")

    # 2. Poll & download LTA MRT Exit GeoJSON from data.gov.sg
    print(f"Polling LTA MRT Exit dataset download URL from data.gov.sg...")
    try:
        resp = requests.get(POLL_URL, timeout=30)
        resp.raise_for_status()
        poll_res = resp.json()
        if poll_res.get("code") != 0:
            print(f"ERROR: Poll API returned error: {poll_res.get('errMsg')}", file=sys.stderr)
            sys.exit(1)
        download_url = poll_res["data"]["url"]
    except Exception as e:
        print(f"ERROR: Failed to poll dataset: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Downloading LTA MRT Exit GeoJSON...")
    try:
        resp = requests.get(download_url, timeout=60)
        resp.raise_for_status()
        geojson_data = resp.json()
    except Exception as e:
        print(f"ERROR: Failed to download GeoJSON: {e}", file=sys.stderr)
        sys.exit(1)

    features = geojson_data.get("features", [])
    print(f"  Parsed {len(features)} exit features from GeoJSON.")

    # 3. Clean and process exits
    processed_exits = []
    skipped_count = 0
    matched_count = 0

    for feat in features:
        geom = feat.get("geometry", {})
        coords = geom.get("coordinates", [])
        if not coords or len(coords) < 2:
            continue
        
        props = feat.get("properties", {})
        raw_station_na = props.get("STATION_NA", "")
        exit_code = props.get("EXIT_CODE", "").strip()

        if not raw_station_na:
            continue

        clean_name = clean_station_name(raw_station_na)
        
        # Get codes and lines
        codes = name_to_codes.get(clean_name, [])
        if not codes:
            # Fallback deduction based on station names if not matched in the mapping
            # E.g., for newer TEL stations not yet in the xkjyeah dataset
            if "THOMSON" in clean_name or "BRIGHT HILL" in clean_name or "CALDECOTT" in clean_name or "NAPIER" in clean_name or "MAXWELL" in clean_name or "SHENTON" in clean_name or "GARDENS BY THE BAY" in clean_name or "GREAT WORLD" in clean_name or "HAVELOCK" in clean_name or "UPPER THOMSON" in clean_name:
                lines = ["TE"]
                codes = ["TE-FB"]
            elif "CANBERRA" in clean_name:
                lines = ["NS"]
                codes = ["NS12"]
            else:
                lines = ["MRT"]
                codes = []
            skipped_count += 1
        else:
            lines = get_station_lines(codes)
            matched_count += 1

        # Format display name to Title Case nicely (e.g. "Bright Hill")
        display_name = " ".join([w.capitalize() for w in clean_name.split()])

        processed_exits.append({
            "stationName": display_name,
            "exitCode": exit_code,
            "lat": coords[1],
            "lng": coords[0],
            "lines": lines,
            "codes": codes
        })

    print(f"  Matched {matched_count} stations, fell back on {skipped_count} newer stations.")

    # Sort processed exits by stationName and exitCode
    processed_exits.sort(key=lambda x: (x["stationName"], x["exitCode"]))

    # Save to file
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(processed_exits, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Successfully wrote {len(processed_exits)} MRT/LRT exits to {OUTPUT_FILE.relative_to(WORKSPACE_DIR)}")


if __name__ == "__main__":
    main()
