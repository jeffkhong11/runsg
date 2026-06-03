# RunSG — Data Source Files

This directory contains raw source data files used by the build pipeline scripts.
These files are inputs to the pipeline — **do not edit them directly**.

---

## Directory Structure

```
data/
├── gpx/          ← GPX track files for nature trails
└── geojson/      ← Government GeoJSON datasets for PCN routes
```

---

## `data/gpx/` — Trail GPX Files

High-accuracy GPS recordings of trail routes. These are preferred over ORS API snapping for forest/nature trails because routing engines often detour around restricted zones (military land, private golf courses, one-way boardwalks) in nature reserves.

**Source:** Download from [AllTrails](https://www.alltrails.com/), [Strava](https://www.strava.com/), or export from a Garmin/Apple Watch run.

| File | Trail | Source | Status |
|---|---|---|---|
| `Rail_Corridor_Full_Trail.gpx` | Rail Corridor (Full) | AllTrails | ✅ Loaded |
| `MacRitchie_Reservoir_Loop.gpx` | MacRitchie Reservoir Loop | AllTrails / Strava | ⬜ Needed |
| `Bukit_Timah_Summit.gpx` | Bukit Timah Summit Trail | AllTrails | ⬜ Needed |
| `Southern_Ridges.gpx` | Southern Ridges | AllTrails | ⬜ Needed |
| `Coney_Island_Loop.gpx` | Coney Island Loop | AllTrails | ⬜ Needed |

**How to add a new trail GPX:**
1. Download the `.gpx` file and place it here with the filename matching the `gpx_file` field in `scripts/fetch-trails.py`
2. Run `python scripts/fetch-trails.py` — the pipeline auto-detects and loads it

---

## `data/geojson/` — Government GeoJSON Datasets

Official datasets from Singapore government open data portals. These are large files (~2–3 MB each) used to generate all PCN route entries.

**Source:** [data.gov.sg](https://data.gov.sg) / NParks

| File | Contents | Source | Size |
|---|---|---|---|
| `ParkConnectorLoop.geojson` | All PCN route segments in Singapore | NParks / data.gov.sg | ~2 MB |
| `CyclingPathNetworkGEOJSON.geojson` | Cycling path network by town | LTA / data.gov.sg | ~2.9 MB |

**How to refresh PCN data:**
```bash
# Uses the local file automatically if present:
python scripts/fetch-pcn.py

# Or force a re-download from data.gov.sg:
python scripts/fetch-pcn.py --download
```

---

## Git Strategy

| Path | Committed? | Reason |
|---|---|---|
| `data/gpx/*.gpx` | ✅ Yes | Small files (~50–200 KB), needed to reproduce the build |
| `data/geojson/*.geojson` | ⚠️ Recommended: Git LFS | Large binary files (2–3 MB each); use `git lfs track "data/geojson/*.geojson"` |
| `public/data/routes/` | ✅ Yes | Generated outputs — committed so the site works without running scripts |

---

## Rebuild All Route Data

To regenerate every route file from scratch:

```bash
# 1. PCN routes (108 connectors from NParks GeoJSON)
python scripts/fetch-pcn.py

# 2. Trail routes (GPX preferred, ORS fallback, curated fallback)
python scripts/fetch-trails.py

# 3. Road / mixed routes (ORS API)
python scripts/generate-route.py

# 4. Rebuild the site
npm run build
```
