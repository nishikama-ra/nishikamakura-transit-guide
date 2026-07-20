import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readText = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const data = JSON.parse(readText('content/schools.json'));
const campuses = data.chunkFiles.flatMap(filename => JSON.parse(readText(`content/${filename}`)));
const html = readText('school-map-mockup.html');
const script = readText('scripts/school-map-mockup.js');
const css = readText('school-map-mockup.css');
const builder = readText('tools/build-school-map-data.mjs');

const municipalities = ['横浜市', '横須賀市', '逗子市', '三浦市', '葉山町', '鎌倉市', '藤沢市', '大和市', '綾瀬市', '茅ヶ崎市'];
assert.equal(data.meta.schemaVersion, 3);
assert.equal(data.meta.institutionCount, 268);
assert.equal(data.meta.campusCount, 198);
assert.equal(campuses.length, 198);
assert.deepEqual(data.meta.targetMunicipalities, municipalities);
assert.deepEqual(data.meta.countsByType, { elementary: 22, juniorHigh: 52, high: 150, university: 45 });
assert.ok(municipalities.every(name => data.meta.countsByMunicipality[name] > 0));

const listings = campuses.flatMap(campus => campus[4]);
const names = new Set(listings.map(listing => listing[0]));
for (const required of ['神奈川県立鎌倉高等学校', '神奈川県立七里ガ浜高等学校', '湘南白百合学園小学校']) {
  assert.ok(names.has(required), `${required} がありません`);
}
assert.ok(!campuses.some(campus => campus[0].includes('玉川学園')));
assert.ok(!listings.some(listing => listing[1] === 'm' && String(listing[2]).split(',').some(code => ['16001', '16002', '16014'].includes(code))));
assert.ok(listings.every(listing => ['m', 'p', 'n', 'r'].includes(listing[1])));
assert.ok(listings.every(listing => String(listing[2]).split(',').every(code => ['16001', '16002', '16003', '16004', '16006', '16007', '16014'].includes(code))));

assert.match(script, /scope:\s*'wide'/);
assert.match(script, /wide:\s*\{\s*center:\s*\[35\.3860,\s*139\.5840\],\s*zoom:\s*12\s*\}/);
assert.match(script, /center:\s*\[35\.3245,\s*139\.5290\]/);
assert.match(script, /radiusMeters:\s*2300/);
assert.match(script, /interactive:\s*false/);
assert.match(script, /pane:\s*'schoolMarkerPane'/);
assert.match(script, /travelmode:\s*'transit'/);
assert.match(script, /params\.set\('origin'/);
assert.ok(!script.includes('campus.viewModes.includes(state.scope)'));
assert.ok(html.includes('id="selectRouteOrigin"'));
assert.ok(html.includes('id="clearRouteOrigin"'));
assert.ok(html.includes('data-scope="wide" aria-pressed="true"'));
assert.ok(css.includes('.school-route-tools'));
assert.ok(css.includes('.school-list-transit-link'));
assert.ok(builder.includes('schemaVersion: 3'));

console.log('PASS: school map data, viewport, focus circle, and Google transit links');
