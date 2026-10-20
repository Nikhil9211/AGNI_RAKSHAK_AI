# Historical industrial heat-source reference layer

Source: Global remote industrial heat sources (GIHS), Zenodo DOI 10.5281/zenodo.8308133.
Dataset scope: global continental region, 25,544 industrial heat-source objects, 2012-2021, WGS84.
Reference paper: https://www.nature.com/articles/s41597-024-03461-3
Dataset: https://zenodo.org/records/8308133

Place an exported GeoJSON FeatureCollection converted from the GIHS shapefile here as:
`gihs.geojson`

The application will automatically expose and map these historical reference points.
If the file is absent, the application will report that the reference layer is unavailable rather than inventing points.

## Map behavior

The map also has a separate `Stored FIRMS History (30D)` layer. This uses previously ingested real NASA FIRMS observations from the server store and may show incidents outside Jhansi when India/Global scope is selected. It is distinct from the GIHS historical industrial-source layer.
