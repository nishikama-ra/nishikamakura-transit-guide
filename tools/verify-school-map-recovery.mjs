import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readText = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const readJson = relative => JSON.parse(readText(relative));

// First run the unchanged regression suite for the original local/nearby map.
await import('./verify-school-map.mjs');

const localData = readJson('content/schools.json');
const manifest = readJson('content/schools-wide.json');
const overrideParts = manifest.overrideFiles.map(filename => readJson(`content/${filename}`));
const overrides = overrideParts.reduce((merged, part) => {
  Object.assign(merged.institutions, part.institutions || {});
  Object.assign(merged.campuses, part.campuses || {});
  return merged;
}, { institutions: {}, campuses: {} });
const rows = manifest.chunkFiles.flatMap(filename => readJson(`content/${filename}`));
const html = readText('school-map-mockup.html');
const script = readText('scripts/school-map-mockup.js');
const recoveryCss = readText('school-map-recovery.css');

assert.equal(localData.meta.campusCount, 68, '既存の地域・周辺68地点が保持されていません');
assert.equal(localData.meta.institutionCount, 91, '既存の地域・周辺91施設が保持されていません');
assert.equal(localData.meta.childcareFacilityCount, 21, '既存の保育施設21件が保持されていません');
assert.equal(localData.meta.reusedPublicSchoolCount, 11, '既存の公立小中学校11校が保持されていません');

assert.equal(manifest.chunkFiles.length, 4);
assert.deepEqual(manifest.chunkFiles.map(filename => readJson(`content/${filename}`).length), [50, 50, 50, 48]);
assert.equal(rows.length, 198);
const compactListings = rows.flatMap(row => row[4]);
assert.equal(compactListings.length, 268);
assert.equal(manifest.overrideFiles.length, 6);
assert.equal(Object.keys(overrides.institutions).length, 268);
assert.equal(Object.values(overrides.institutions).filter(item => item.officialUrl).length, 268);
assert.equal(manifest.meta.officialUrlMissingCount, 0);

const definitions = {
  '16001': ['elementary'], '16002': ['juniorHigh'], '16003': ['juniorHigh', 'high'],
  '16004': ['high'], '16006': ['university'], '16007': ['university'],
  '16014': ['elementary', 'juniorHigh']
};
const counts = { elementary: 0, juniorHigh: 0, high: 0, university: 0 };
for (const listing of compactListings) {
  const [sourceName, ownershipCode, codeText, _urlIndex, institutionId] = listing;
  const patch = overrides.institutions[institutionId];
  assert.ok(patch, `${sourceName} の補正情報がありません`);
  assert.ok(patch.officialUrl, `${sourceName} の公式URLがありません`);
  for (const code of String(codeText).split(',').filter(Boolean)) {
    assert.ok(definitions[code], `未対応の学校分類コードです: ${code}`);
    for (const type of definitions[code]) counts[type] += 1;
  }
  if (ownershipCode === 'm') {
    assert.ok(!String(codeText).split(',').some(code => ['16001', '16002', '16014'].includes(code)), '広域データに市立小中学校が混入しています');
  }
}
assert.deepEqual(counts, { elementary: 22, juniorHigh: 52, high: 150, university: 45 });

const finalName = listing => overrides.institutions[listing[4]]?.name || listing[0];
const byId = Object.fromEntries(compactListings.map(listing => [listing[4], { listing, name: finalName(listing), url: overrides.institutions[listing[4]].officialUrl }]));
assert.equal(byId['F113310102984-04'].name, '慶應義塾大学 矢上キャンパス');
assert.equal(byId['F113310102984-05'].name, '慶應義塾大学 日吉キャンパス');
assert.equal(byId['F113310102984-06'].name, '慶應義塾大学 湘南藤沢キャンパス');
assert.equal(byId['F114310104687-00'].name, '横浜商科大学 つるみキャンパス');
assert.equal(byId['F114310104883-00'].name, '湘南医療大学 東戸塚キャンパス');
assert.equal(byId['F114310104749-00'].name, '鎌倉女子大学 大船キャンパス');
assert.equal(overrides.campuses['B114320500015-00'].address, '神奈川県藤沢市鵠沼松が岡4-1-32');
for (const required of ['神奈川県立鎌倉高等学校', '神奈川県立七里ガ浜高等学校', '湘南白百合学園小学校']) {
  assert.ok(compactListings.some(listing => finalName(listing) === required), `${required} がありません`);
}

assert.match(html, /data-scope="local" aria-pressed="true"/);
assert.match(html, /school-map-recovery\.css/);
assert.match(html, /id="selectRouteOrigin"/);
assert.match(script, /scope:\s*'local'/);
assert.match(script, /fetchJson\('content\/schools\.json'\)/);
assert.match(script, /fetchJson\('content\/schools-wide\.json'\)/);
assert.match(script, /wideManifest\.overrideFiles/);
assert.match(script, /state\.scope === 'wide'/);
assert.match(script, /stroke:\s*false/);
assert.match(script, /interactive:\s*false/);
assert.match(script, /Googleルート検索/);
assert.match(script, /travelmode:\s*'transit'/);
assert.match(script, /params\.set\('origin'/);
assert.ok(!script.includes("慶應義塾大学': '慶應義塾大学 湘南藤沢キャンパス"));
assert.match(recoveryCss, /\.school-list-transit-link,\s*\n\.school-transit-link[\s\S]*font-size:\s*10\.5px/);

console.log('PASS: original 68/91 local data retained; wide 198/268 added with 268 official URLs and campus-specific university names');
