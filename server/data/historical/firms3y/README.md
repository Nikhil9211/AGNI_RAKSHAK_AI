# NASA FIRMS 3-Year India Archive — 2022–2024

This directory contains the user-supplied NASA FIRMS India archive used in Phase 6. The raw source files are compressed under `raw/`; compact derived files (`manifest.json`, `india_map_sample.json`, `jhansi_points.json`) are used at runtime so the web server does not parse 3.7M rows on every request.

## Included source files
- MODIS C6.1: 2022, 2023, 2024
- VIIRS NOAA-20 / JPSS-1: 2022, 2023, 2024
- VIIRS Suomi-NPP: 2022, 2023, 2024

## Verified totals
- India total: 3,733,680 observations
- Jhansi bbox (78.30,25.20,78.85,25.70): 3,661 observations

The archive is historical observation data. It is not presented as current/NRT activity.
