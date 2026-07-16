import { writeFile } from 'node:fs/promises';

const projectUrl = new URL('../content/hello-cycling.json', import.meta.url);
const cityUrls = [
  'https://www.hellocycling.jp/station/kanagawa/%E9%8E%8C%E5%80%89%E5%B8%82',
  'https://www.hellocycling.jp/station/kanagawa/%E8%97%A4%E6%B2%A2%E5%B8%82'
];
const topologyUrl = 'https://geoshape.ex.nii.ac.jp/ka/topojson/2020/14/r2ka14204.topojson';
const targetNames = new Set([
  '腰越一丁目', '腰越二丁目', '腰越三丁目', '腰越四丁目', '腰越五丁目', '腰越・津',
  '西鎌倉一丁目', '西鎌倉二丁目', '西鎌倉三丁目', '西鎌倉四丁目',
  '津西一丁目', '津西二丁目', '手広', '手広一丁目', '手広二丁目', '手広三丁目',
  '手広四丁目', '手広五丁目', '手広六丁目', '鎌倉山一丁目', '鎌倉山二丁目',
  '鎌倉山三丁目', '鎌倉山四丁目'
]);
const hubs = [
  { lat: 35.3389, lng: 139.4873 }, { lat: 35.3535, lng: 139.5311 },
  { lat: 35.3193, lng: 139.5504 }, { lat: 35.3102, lng: 139.4860 }
];

function decodeArc(topology, index) {
  const reverse = index < 0;
  const arc = topology.arcs[reverse ? ~index : index];
  if (!topology.transform) return reverse ? [...arc].reverse() : arc;
  const { scale, translate } = topology.transform;
  let x = 0, y = 0;
  const decoded = arc.map(([dx, dy]) => {
    x += dx; y += dy;
    return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
  });
  return reverse ? decoded.reverse() : decoded;
}
function joinArcs(topology, indexes) {
  return indexes.flatMap((index, i) => {
    const arc = decodeArc(topology, index);
    return i ? arc.slice(1) : arc;
  });
}
function geometryRings(topology, geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.arcs] : geometry.arcs;
  return polygons.flatMap(polygon => polygon.map(ring => joinArcs(topology, ring)));
}
function pointInRing([lng, lat], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distanceMeters(a, b) {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.hypot(x, y) * 6371000;
}
function segmentDistanceMeters(point, a, b) {
  const lat0 = point.lat * Math.PI / 180;
  const toXY = ([lng, lat]) => [(lng - point.lng) * Math.PI / 180 * Math.cos(lat0) * 6371000, (lat - point.lat) * Math.PI / 180 * 6371000];
  const [ax, ay] = toXY(a), [bx, by] = toXY(b);
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(ax + t * dx, ay + t * dy);
}
function distanceToRings(point, rings) {
  if (rings.some(ring => pointInRing([point.lng, point.lat], ring))) return 0;
  let closest = Infinity;
  for (const ring of rings) for (let i = 1; i < ring.length; i++) closest = Math.min(closest, segmentDistanceMeters(point, ring[i - 1], ring[i]));
  return closest;
}
async function getStations(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const match = (await response.text()).match(/const data = (\{.*?\});/s);
  if (!match) throw new Error(`station data not found: ${url}`);
  return Object.values(JSON.parse(match[1])).flat();
}

const topology = await fetch(topologyUrl).then(response => response.json());
const object = Object.values(topology.objects)[0];
const geometries = object.type === 'GeometryCollection' ? object.geometries : [object];
const selected = geometries.filter(geometry => targetNames.has(geometry.properties?.S_NAME));
if (!selected.length) throw new Error('対象町丁の境界を取得できませんでした');
const rings = selected.flatMap(geometry => geometryRings(topology, geometry));
const stations = (await Promise.all(cityUrls.map(getStations))).flat();
const included = stations.filter(station => {
  const point = { lat: Number(station.lat), lng: Number(station.lng) };
  return distanceToRings(point, rings) <= 800 || hubs.some(hub => distanceMeters(point, hub) <= 800);
}).map(station => ({
  name: station.name, type: 'shareCycle', provider: 'HELLO CYCLING', address: station.address,
  capacity: Number(station.num_bikes_limit), lat: Number(station.lat), lng: Number(station.lng),
  href: 'https://www.hellocycling.jp/station/'
})).sort((a, b) => a.name.localeCompare(b.name, 'ja'));

await writeFile(projectUrl, `${JSON.stringify({
  collectedAt: new Date().toISOString().slice(0, 10),
  scope: '指定地域の行政区域から800m以内、または藤沢・大船・鎌倉・江の島の各駅エリアから800m以内',
  coordinateSource: 'official-station-data',
  source: cityUrls,
  places: included
}, null, 2)}\n`, 'utf8');
console.log(`HELLO CYCLING: ${included.length} stations`);
