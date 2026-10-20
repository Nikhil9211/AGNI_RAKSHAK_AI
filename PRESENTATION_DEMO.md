# Presentation Snapshot

The default application remains real-data driven. No demo data is injected automatically.

For a presentation-only snapshot, open:

`http://localhost:5173/?demo=1`

In presentation mode, simulated data is generated once per browser session and clearly labelled `PRESENTATION SNAPSHOT · SIMULATED DATA · NOT NASA LIVE DATA`. It is isolated from the live FIRMS/OSM/database paths and is never written to the database or sent to NASA.

The demo snapshot is available across Command Center, Thermal Operations, Intelligence and Alerts so the complete judge flow can be demonstrated without contaminating live data.


Response Orchestrator

The demo path also exposes a Response Orchestrator inside Intelligence. It converts the selected event evidence into four reviewable actions (verify event, check industrial context, watch/monitor persistence, prepare response) and can create a labelled demo response package without writing to live FIRMS data.
