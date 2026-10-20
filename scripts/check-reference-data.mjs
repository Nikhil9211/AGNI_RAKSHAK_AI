import fs from "fs";
import path from "path";

const file = path.resolve(process.cwd(), "server/data/reference/gihs.geojson");
if (!fs.existsSync(file)) {
  console.log("GIHS reference layer: NOT INSTALLED");
  console.log("Add server/data/reference/gihs.geojson to enable historical industrial heat-source points.");
  process.exit(0);
}
try {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const count = Array.isArray(data.features) ? data.features.length : 0;
  console.log(`GIHS reference layer: AVAILABLE (${count} features)`);
} catch (e) {
  console.error("GIHS reference layer: INVALID GEOJSON", e.message);
  process.exit(1);
}
