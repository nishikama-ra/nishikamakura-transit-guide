import { writeFile } from 'node:fs/promises';

const outputUrl = new URL('../content/car-share.json', import.meta.url);
const topologyUrl = 'https://geoshape.ex.nii.ac.jp/ka/topojson/2020/14/r2ka14204.topojson';
const timesDetailBase = 'https://share.timescar.jp/view/station/detail.jsp?scd=';
const timesAjaxUrl = 'https://share.timescar.jp/view/station/teeda.ajax';
const mitsuiCityUrls = [
  'https://www.carshares.jp/station/kanagawa/kamakura/',
  'https://www.carshares.jp/station/kanagawa/fujisawa/'
];
const orixCityUrls = [
  'https://station.orix-carshare.com/orix-carshare/spot/list?address=14204',
  'https://station.orix-carshare.com/orix-carshare/spot/list?address=14205'
];
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
const alwaysIncludeTimes = new Set(['KT47']);
const alwaysIncludeOrix = new Set(['st02137', 'st07171']);

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
function isInScope(point, rings) {
  return distanceToRings(point, rings) <= 800 || hubs.some(hub => distanceMeters(point, hub) <= 800);
}

// ZDC/Its-moがタイムズ公式地図で使用するTokyo Datum -> WGS84変換と同じ計算。
function geodeticToCartesian(lat, lon, height, majorAxis, eccentricitySquared) {
  const rad = Math.PI / 180;
  lat *= rad; lon *= rad;
  const sinLat = Math.sin(lat), cosLat = Math.cos(lat);
  const primeVertical = majorAxis / Math.sqrt(1 - eccentricitySquared * sinLat * sinLat);
  return [
    (primeVertical + height) * cosLat * Math.cos(lon),
    (primeVertical + height) * cosLat * Math.sin(lon),
    (primeVertical * (1 - eccentricitySquared) + height) * sinLat
  ];
}
function cartesianToGeodetic(x, y, z, majorAxis, eccentricitySquared) {
  const rad = Math.PI / 180;
  const minorRatio = Math.sqrt(1 - eccentricitySquared);
  const horizontal = Math.hypot(x, y);
  const theta = Math.atan2(z, horizontal * minorRatio);
  const sinTheta = Math.sin(theta), cosTheta = Math.cos(theta);
  const lat = Math.atan2(
    z + eccentricitySquared * majorAxis / minorRatio * sinTheta ** 3,
    horizontal - eccentricitySquared * majorAxis * cosTheta ** 3
  );
  const lon = Math.atan2(y, x);
  return [lat / rad, lon / rad];
}
function tokyoDatumToWgs84(lat, lng) {
  const wgsFlattening = 1 / 298.257223;
  const wgsEccentricitySquared = 2 * wgsFlattening - wgsFlattening ** 2;
  const tokyoFlattening = 1 / 299.152813;
  const tokyoEccentricitySquared = 2 * tokyoFlattening - tokyoFlattening ** 2;
  const [x, y, z] = geodeticToCartesian(lat, lng, 0, 6377397.155, tokyoEccentricitySquared);
  const [convertedLat, convertedLng] = cartesianToGeodetic(x - 148, y + 507, z + 681, 6378137, wgsEccentricitySquared);
  return { lat: Math.round(convertedLat * 1e7) / 1e7, lng: Math.round(convertedLng * 1e7) / 1e7 };
}

async function fetchText(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}
function stripTags(value) {
  return value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').trim();
}
async function mapLimit(items, limit, worker) {
  const result = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      result[index] = await worker(items[index], index);
    }
  }));
  return result;
}

async function collectTimes(rings) {
  const referenceUrl = `${timesDetailBase}NB25`;
  const pageResponse = await fetch(referenceUrl);
  if (!pageResponse.ok) throw new Error(`${pageResponse.status} ${referenceUrl}`);
  const html = await pageResponse.text();
  const paramId = html.match(/id="paramId"[^>]+value="([^"]+)/)?.[1];
  const cookies = pageResponse.headers.get('set-cookie')?.split(', ').map(value => value.split(';')[0]).join('; ');
  if (!paramId || !cookies) throw new Error('タイムズ公式地図のセッション情報を取得できませんでした');
  const params = new URLSearchParams({
    component: 'station_detailPage', action: 'ajaxViewMap',
    minlat: '35.207533', maxlat: '35.407533', minlon: '139.385108', maxlon: '139.585108',
    linkLon: '139.485108', linkLat: '35.307533', scd: 'NB25', paramId
  });
  const response = await fetch(timesAjaxUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookies, referer: referenceUrl, 'x-requested-with': 'XMLHttpRequest' },
    body: params
  });
  if (!response.ok) throw new Error(`${response.status} ${timesAjaxUrl}`);
  const candidates = await response.json();
  if (!Array.isArray(candidates)) throw new Error('タイムズ公式地図からステーション一覧を取得できませんでした');
  const included = candidates.map(station => ({ ...station, ...tokyoDatumToWgs84(Number(station.la), Number(station.lo)) }))
    .filter(station => alwaysIncludeTimes.has(station.cd) || isInScope(station, rings));
  return mapLimit(included, 8, async station => {
    const detail = JSON.parse(await fetchText(`${timesAjaxUrl}?${new URLSearchParams({ component: 'station_detailPage', action: 'ajaxStation', scd: station.cd })}`));
    return {
      name: detail.stationNm || station.nm,
      type: 'carShare', provider: 'タイムズカー', address: detail.adr1,
      lat: station.lat, lng: station.lng,
      href: `${timesDetailBase}${station.cd}`
    };
  });
}

async function collectMitsui(rings) {
  const cityPages = await Promise.all(mitsuiCityUrls.map(url => fetchText(url)));
  const hrefs = [...new Set(cityPages.flatMap(html => [...html.matchAll(/href="([^"]+)"/g)]
    .map(match => match[1])
    .filter(href => href.startsWith('/station/kanagawa/') && href.split('/').filter(Boolean).length === 5)
    .map(href => new URL(href, 'https://www.carshares.jp/').href)))];
  const places = await mapLimit(hrefs, 6, async href => {
    const html = await fetchText(href);
    const lat = Number(html.match(/name="lat" value="([^"]+)/)?.[1]);
    const lng = Number(html.match(/name="lng" value="([^"]+)/)?.[1]);
    const name = stripTags(html.match(/<h1[^>]*class="mainTitle01"[^>]*>(.*?)<\/h1>/s)?.[1] || '');
    const address = ['addressRegion', 'addressLocality', 'streetAddress'].map(prop => stripTags(html.match(new RegExp(`<span itemprop="${prop}">(.*?)<\\/span>`, 's'))?.[1] || '')).join('');
    if (!name || !address || !Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error(`三井の個別ページを解析できませんでした: ${href}`);
    return { name: `三井のカーシェアーズ ${name}`, type: 'carShare', provider: '三井のカーシェアーズ', address, lat, lng, href };
  });
  return places.filter(place => isInScope(place, rings));
}

async function collectOrix(rings) {
  const listPages = await Promise.all(orixCityUrls.map(url => fetchText(url)));
  const hrefs = [...new Set(listPages.flatMap(html => [...html.matchAll(/(?:href|data-url)="([^"]*\/spot\/detail\?code=(st\d+)[^"]*)"/g)]
    .map(match => new URL(match[1], 'https://station.orix-carshare.com/').href)))];
  const places = await mapLimit(hrefs, 4, async href => {
    const html = await fetchText(href);
    const code = new URL(href).searchParams.get('code');
    const name = stripTags(html.match(/id="w_1_detail_2_1_2-spot-name"[^>]*>(.*?)<\/h1>/s)?.[1] || '');
    const address = stripTags(html.match(/id="w_1_detail_2_1_2-beforeAddressSpace"[^>]*>(.*?)<\/span>/s)?.[1] || '');
    const coordinates = html.match(/coord:\s*'([\d.]+),([\d.]+)'/);
    const lat = Number(coordinates?.[1]), lng = Number(coordinates?.[2]);
    if (!code || !name || !address || !Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error(`オリックスの個別ページを解析できませんでした: ${href}`);
    const notes = {
      st02137: '24時間。NPC24H大船駅前パーキング6階 No.CS1・2。',
      st07171: '24時間。鎌倉上町屋第2大栄駐車場 No.46。',
      st00168: '24時間。'
    };
    return { name: `オリックスカーシェア ${name}`, type: 'carShare', provider: 'オリックスカーシェア', address, lat, lng, href, ...(notes[code] ? { note: notes[code] } : {}) };
  });
  return places.filter(place => alwaysIncludeOrix.has(new URL(place.href).searchParams.get('code')) || isInScope(place, rings));
}

const topology = await fetch(topologyUrl).then(response => {
  if (!response.ok) throw new Error(`${response.status} ${topologyUrl}`);
  return response.json();
});
const object = Object.values(topology.objects)[0];
const geometries = object.type === 'GeometryCollection' ? object.geometries : [object];
const selected = geometries.filter(geometry => targetNames.has(geometry.properties?.S_NAME));
if (!selected.length) throw new Error('対象町丁の境界を取得できませんでした');
const rings = selected.flatMap(geometry => geometryRings(topology, geometry));
const [times, mitsui, orix] = await Promise.all([collectTimes(rings), collectMitsui(rings), collectOrix(rings)]);
const providerOrder = new Map([['タイムズカー', 0], ['三井のカーシェアーズ', 1], ['オリックスカーシェア', 2]]);
const places = [...times, ...mitsui, ...orix].sort((a, b) => providerOrder.get(a.provider) - providerOrder.get(b.provider) || a.name.localeCompare(b.name, 'ja'));

await writeFile(outputUrl, `${JSON.stringify({
  collectedAt: new Date().toISOString().slice(0, 10),
  scope: '西鎌倉・腰越・津西・手広・鎌倉山の指定地域から800m以内、または藤沢・大船・鎌倉・江の島の各駅から800m以内。指定された鎌倉梶原月極、鎌倉上町屋第2大栄駐車場、NPC大船駅前は必ず掲載。',
  coordinateSources: {
    times: 'official-map-tokyo-datum-converted',
    mitsui: 'official-station-page',
    orix: 'official-station-page'
  },
  source: { times: timesAjaxUrl, mitsui: mitsuiCityUrls, orix: orixCityUrls, boundary: topologyUrl },
  counts: { times: times.length, mitsui: mitsui.length, orix: orix.length, total: places.length },
  places
}, null, 2)}\n`, 'utf8');
console.log(`Car share: Times ${times.length}, Mitsui ${mitsui.length}, Orix ${orix.length}, total ${places.length}`);
