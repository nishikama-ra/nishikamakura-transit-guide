import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputDir = path.resolve(process.argv[2] || path.join(
  repoRoot,
  "agent-history/codex/2026-07-17-school-districts/inputs",
));

const datasets = [
  {
    source: "A27-23_14.geojson",
    output: "content/school-districts-elementary.geojson",
    idProperty: "A27_003",
    ids: [
      "B114220420069",
      "B114220420078",
      "B114220420050",
      "B114220420087",
      "B114220420103",
      "B114220420096",
      "B114220520095",
    ],
  },
  {
    source: "A32-23_14.geojson",
    output: "content/school-districts-juniorHigh.geojson",
    idProperty: "A32_003",
    ids: [
      "C114220420049",
      "C114220420067",
      "C114220420058",
      "C114220520057",
    ],
  },
];

// 国土地理院住所検索と自治体公式ページの地図座標で確認した学校所在地。
const schoolLocations = {
  B114220420069: [139.493027, 35.312405],
  B114220420078: [139.508926, 35.319958],
  B114220420050: [139.512085, 35.311428],
  B114220420087: [139.520447, 35.331036],
  B114220420103: [139.535873, 35.336777],
  B114220420096: [139.521484, 35.337311],
  B114220520095: [139.487529, 35.319923],
  C114220420049: [139.497269, 35.312283],
  C114220420067: [139.505203, 35.325424],
  C114220420058: [139.523544, 35.330566],
  C114220520057: [139.493258, 35.322216],
};

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

for (const dataset of datasets) {
  const sourcePath = path.join(inputDir, dataset.source);
  const outputPath = path.join(repoRoot, dataset.output);
  const source = readJson(sourcePath);
  const current = readJson(outputPath);
  const sourceById = new Map(source.features.map((feature) => [feature.properties[dataset.idProperty], feature]));
  const displayPropertiesById = new Map(current.features.map((feature) => [feature.properties.id, feature.properties]));

  const features = dataset.ids.map((id) => {
    const sourceFeature = sourceById.get(id);
    const displayProperties = displayPropertiesById.get(id);
    const schoolLocation = schoolLocations[id];
    if (!sourceFeature || !displayProperties || !schoolLocation) {
      throw new Error(`Required school data is missing: ${id}`);
    }
    return {
      type: "Feature",
      properties: {
        ...displayProperties,
        schoolLng: schoolLocation[0],
        schoolLat: schoolLocation[1],
      },
      geometry: sourceFeature.geometry,
    };
  });

  const output = {...current, features};
  for (const feature of output.features) {
    const sourceFeature = sourceById.get(feature.properties.id);
    if (JSON.stringify(feature.geometry.coordinates) !== JSON.stringify(sourceFeature.geometry.coordinates)) {
      throw new Error(`Geometry changed while copying: ${feature.properties.id}`);
    }
  }
  fs.writeFileSync(outputPath, `${JSON.stringify(output)}\n`, "utf8");
  console.log(`${dataset.output}: ${features.length} schools, ${features.reduce((sum, feature) => sum + pointCount(feature.geometry), 0)} points`);
}
