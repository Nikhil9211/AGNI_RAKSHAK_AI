# NASA FIRMS MODIS C6.1 Historical India Archives

These compressed CSV files were supplied for the AGNI RAKSHAK AI prototype and are treated as historical NASA FIRMS MODIS C6.1 observations for India.

Legacy compatibility files:
- modis_2022_India.csv.gz
- modis_2023_India.csv.gz
- modis_2024_India.csv.gz

The complete 2022–2024 archive used by the current Phase 6 UI is under `server/data/historical/firms3y/raw/` and includes MODIS, NOAA-20 (JPSS-1), and Suomi-NPP VIIRS.

Observed row counts before compression:
- 2022: 81,525
- 2023: 78,425
- 2024: 74,029
- Total: 233,979

Official FIRMS MODIS field definitions:
https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_MODIS_Firehotspots.html

Archive download information:
https://firms.modaps.eosdis.nasa.gov/download/

The application keeps this historical archive separate from the current VIIRS NRT/WMS layer. It is used for historical mapping, persistence context and analytics; it is not represented as a current fire feed.
