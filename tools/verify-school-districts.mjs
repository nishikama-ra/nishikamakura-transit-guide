import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputDir = path.resolve(process.argv[2] || path.join(
  repoRoot,
  "agent-history/codex/2026-07-17-school-districts/inputs",
));

const datasets = [
  ["A27-23_14.geojson", "content/school-districts-elementary.geojson", "A27_003", 7],
  ["A32-23_14.geojson", "content/school-districts-juniorHigh.geojson", "A32_003", 4],
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function pointCount(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.reduce(
    (polygonTotal, polygon) => polygonTotal + polygon.reduce((ringTotal, ring) => ringTotal + ring.length, 0),
    0,
  );
}

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function contains(geometry, point) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((polygon) => inRing(point, polygon[0]) && !polygon.slice(1).some((ring) => inRing(point, ring)));
}

for (const [sourceName, outputName, idProperty, expectedSchools] of datasets) {
  const source = readJson(path.join(inputDir, sourceName));
  const outputPath = path.join(repoRoot, outputName);
  const output = readJson(outputPath);
  const sourceById = new Map(source.features.map((feature) => [feature.properties[idProperty], feature]));
  if (output.features.length !== expectedSchools) throw new Error(`${outputName}: unexpected school count`);

  let points = 0;
  for (const feature of output.features) {
    const sourceFeature = sourceById.get(feature.properties.id);
    if (!sourceFeature) throw new Error(`${feature.properties.id}: source feature not found`);
    if (JSON.stringify(feature.geometry.coordinates) !== JSON.stringify(sourceFeature.geometry.coordinates)) {
      throw new Error(`${feature.properties.id}: coordinates differ from source`);
    }
    const schoolPoint = [feature.properties.schoolLng, feature.properties.schoolLat];
    if (!schoolPoint.every(Number.isFinite)) throw new Error(`${feature.properties.id}: school coordinates missing`);
    if (!contains(feature.geometry, schoolPoint)) throw new Error(`${feature.properties.id}: school point is outside its district`);
    points += pointCount(feature.geometry);
  }

  console.log(JSON.stringify({
    file: outputName,
    bytes: fs.statSync(outputPath).size,
    schools: output.features.length,
    points,
  }));
}
