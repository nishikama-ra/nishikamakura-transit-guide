import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readText = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const readJson = relative => JSON.parse(readText(relative));

const sourceBytes = fs.readFileSync(path.join(root, 'content/schools-source.geojson'));
const source = JSON.parse(sourceBytes.toString('utf8'));
const data = readJson('content/schools.json');
const html = readText('school-map-mockup.html');
const script = readText('scripts/school-map-mockup.js');
const builder = readText('tools/build-school-map-data.mjs');
const proposal = readText('docs/school-scope-proposal.md');

const formalSchoolTypeLabels = {
  '16001': '小学校',
  '16002': '中学校',
  '16003': '中等教育学校',
  '16004': '高等学校',
  '16005': '高等専門学校',
  '16006': '短期大学',
  '16007': '大学',
  '16011': '幼稚園',
  '16012': '特別支援学校',
  '16013': '幼保連携型認定こども園',
  '16014': '義務教育学校',
  '16015': '各種学校',
  '16016': '専修学校'
};

assert.equal(crypto.createHash('sha256').update(sourceBytes).digest('hex').toUpperCase(), 'F95ECA848B703A0DC91595F73B6DD90780B2AC9020BD5377377763E95C435DEA');
assert.equal(source.features.length, 58);
assert.equal(data.meta.sourceFeatureCount, 58);
assert.equal(data.meta.reusedPublicSchoolCount, 11);
assert.equal(data.meta.officialSupplementCount, 1);
assert.equal(data.meta.childcareFacilityCount, 21);
assert.equal(data.meta.institutionCount, 91);
assert.equal(data.meta.campusCount, 68);
assert.equal(data.campuses.length, 68);

const campusIds = new Set(data.campuses.map(campus => campus.id));
const institutions = data.campuses.flatMap(campus => campus.institutions);
const institutionIds = new Set(institutions.map(institution => institution.id));
assert.equal(campusIds.size, data.campuses.length);
assert.equal(institutionIds.size, institutions.length);
assert.equal(institutions.length, 91);
assert.ok(institutions.every(item => Number.isFinite(item.lat) && Number.isFinite(item.lng)));
assert.ok(institutions.every(item => ['municipal', 'prefectural', 'national', 'private'].includes(item.ownership)));
assert.ok(institutions.every(item => item.officialUrl || item.verificationStatus === 'unverified'));
assert.ok(institutions.every(item => item.formalTypeLabel), '正式種別を設定できていない施設があります');
assert.ok(data.campuses.every(campus => Array.isArray(campus.viewModes) && campus.viewModes.length));
assert.ok(data.campuses.every(campus => campus.listings?.length));

const sourceInstitutions = institutions.filter(item => item.source === 'content/schools-source.geojson');
assert.equal(sourceInstitutions.length, 58);
for (const [index, feature] of source.features.entries()) {
  const institution = sourceInstitutions.find(item => item.id === `source-${String(index + 1).padStart(2, '0')}`);
  const code = String(feature.properties.P29_003 ?? '').trim();
  assert.ok(formalSchoolTypeLabels[code], `不明な学校分類コードです: ${code || '(空)'}`);
  assert.equal(institution?.sourceName, feature.properties.P29_004);
  assert.equal(institution?.formalTypeCode, code);
  assert.equal(institution?.formalTypeLabel, formalSchoolTypeLabels[code]);
}
assert.ok(builder.includes('if (!label) throw new Error(`不明な学校分類コードです:'));

const formalTypeOrder = ['nursery', 'kindergarten', 'elementary', 'juniorHigh', 'high', 'specialSupport', 'university', 'vocational'];
for (const campus of data.campuses) {
  for (const listing of campus.listings) {
    const listingInstitutions = listing.institutionIds.map(id => campus.institutions.find(item => item.id === id));
    assert.ok(listingInstitutions.every(Boolean), `${campus.name} の統合施設参照が不正です`);
    const expectedFormalTypes = [...new Map(listingInstitutions.map(item => [`${item.type}\u0000${item.formalTypeCode || ''}\u0000${item.formalTypeLabel}`, {
      type: item.type,
      code: item.formalTypeCode,
      label: item.formalTypeLabel
    }])).values()];
    expectedFormalTypes.sort((a, b) => formalTypeOrder.indexOf(a.type) - formalTypeOrder.indexOf(b.type));
    assert.deepEqual(listing.formalTypeCodes, expectedFormalTypes.map(item => item.code).filter(Boolean));
    assert.deepEqual(listing.formalTypeLabels, expectedFormalTypes.map(item => item.label));
    assert.deepEqual(listing.formalTypes, expectedFormalTypes);
  }
}
assert.ok(!institutions.some(item => ['幼稚園・こども園', '大学・短期大学'].includes(item.formalTypeLabel)));

const campusByName = name => data.campuses.find(campus => campus.name === name);
assert.equal(campusByName('横浜国立大学教育学部附属鎌倉小・中学校').institutions.length, 2);
assert.equal(campusByName('認定こども園アワーキッズ鎌倉 本園・分園').institutions.length, 4);
assert.equal(campusByName('慶應義塾SFC（大学・中等部・高等部）').institutions.length, 3);
assert.equal(campusByName('鎌倉女子大学 岩瀬キャンパス').institutions.length, 4);
assert.equal(campusByName('日本大学藤沢キャンパス').institutions.length, 2);
assert.equal(campusByName('北鎌倉女子学園中学校高等学校').institutions.length, 2);
assert.equal(campusByName('湘南白百合学園中学・高等学校').institutions.length, 2);

const viewCounts = Object.fromEntries(['local', 'nearby', 'wide'].map(mode => [mode, {
  campuses: data.campuses.filter(campus => campus.viewModes.includes(mode)).length,
  listings: data.campuses.filter(campus => campus.viewModes.includes(mode)).flatMap(campus => campus.listings).length
}]));
assert.deepEqual(viewCounts, {
  local: { campuses: 68, listings: 77 },
  nearby: { campuses: 68, listings: 77 },
  wide: { campuses: 32, listings: 39 }
});
const localCampusIds = data.campuses.filter(campus => campus.viewModes.includes('local')).map(campus => campus.id).sort();
const nearbyCampusIds = data.campuses.filter(campus => campus.viewModes.includes('nearby')).map(campus => campus.id).sort();
assert.deepEqual(localCampusIds, nearbyCampusIds, '地域と周辺の施設集合が一致しません');
assert.equal(localCampusIds.length, data.campuses.length, '地域・周辺に全施設が含まれていません');

for (const name of ['湘南白百合学園小学校', '湘南白百合学園中学・高等学校']) {
  assert.ok(campusByName(name).viewModes.includes('local'), `${name} が地域地図にありません`);
}
assert.ok(campusByName('湘南白百合学園小学校').viewModes.includes('wide'), '広域に私立小学校がありません');
assert.ok(campusByName('湘南白百合学園中学・高等学校').viewModes.includes('wide'), '広域に中高一貫校がありません');
assert.ok(institutions.some(item => item.sourceName === '湘南白百合学園中学校' && item.source === 'official-site-supplement'));

const childcare = institutions.filter(item => item.type === 'nursery');
assert.equal(childcare.length, 21);
assert.ok(childcare.every(item => item.formalTypeCode === null && item.formalTypeLabel === item.childcareCategory));
assert.deepEqual(new Set(childcare.map(item => item.district)), new Set(['腰越', '深沢', '片瀬']));
assert.equal(childcare.filter(item => item.source === 'kamakura-licensed-childcare-pdf').length, 16);
assert.equal(childcare.filter(item => item.source === 'kamakura-unlicensed-childcare-pdf').length, 4);
assert.equal(childcare.filter(item => item.source === 'fujisawa-licensed-childcare-page').length, 1);
assert.equal(data.campuses.filter(campus => campus.types.includes('nursery')).length, 20);
assert.equal(data.campuses.filter(campus => campus.types.includes('nursery')).flatMap(campus => campus.listings.filter(listing => listing.types.includes('nursery'))).length, 21);
assert.ok(data.campuses.filter(campus => campus.types.includes('nursery')).every(campus => campus.viewModes.includes('local') && campus.viewModes.includes('nearby')));
assert.ok(childcare.every(item => !data.campuses.find(campus => campus.institutions.some(institution => institution.id === item.id)).viewModes.includes('wide')), '広域に保育施設が残っています');
for (const name of ['キディ腰越保育園', '深沢保育園', '富士見保育園', 'ののはな', '鎌倉山インターナショナルスクール']) {
  assert.ok(institutions.some(item => item.displayName === name && item.type === 'nursery'), `${name} がありません`);
}

for (const name of ['腰越小学校', '西鎌倉小学校', '七里ガ浜小学校', '深沢小学校', '山崎小学校', '富士塚小学校', '片瀬小学校', '腰越中学校', '手広中学校', '深沢中学校', '片瀬中学校']) {
  assert.ok(!campusByName(name).viewModes.includes('wide'), `${name} を広域に出してはいけません`);
}
assert.ok(campusByName('横浜国立大学教育学部附属鎌倉小・中学校').viewModes.includes('wide'), '広域に国立小中学校がありません');

const keio = campusByName('慶應義塾SFC（大学・中等部・高等部）');
assert.deepEqual(keio.listings.map(item => item.name).sort(), ['慶應義塾大学 湘南藤沢キャンパス', '慶應義塾湘南藤沢中等部・高等部'].sort());
assert.deepEqual(keio.listings.find(item => item.name.includes('中等部')).types, ['juniorHigh', 'high']);
assert.deepEqual(keio.listings.find(item => item.name.includes('大学')).types, ['university']);

const ynu = campusByName('横浜国立大学教育学部附属鎌倉小・中学校');
assert.ok(ynu.listings.some(item => item.officialUrl === 'https://kamachu.ynu.ac.jp/'));
assert.ok(ynu.listings.some(item => item.officialUrl === 'https://www.kamakurasho.ynu.ac.jp/'));

const normalizeAddress = value => String(value || '').normalize('NFKC').replace(/[\s　]/g, '').replace(/−/g, '-');
for (const campus of data.campuses) {
  const juniorHighs = campus.institutions.filter(item => item.type === 'juniorHigh');
  const highs = campus.institutions.filter(item => item.type === 'high');
  for (const juniorHigh of juniorHighs) {
    const sameSiteHigh = highs.find(high => high.officialUrl === juniorHigh.officialUrl && normalizeAddress(high.address) === normalizeAddress(juniorHigh.address));
    if (!sameSiteHigh) continue;
    const combined = campus.listings.find(listing => listing.institutionIds.includes(juniorHigh.id) && listing.institutionIds.includes(sameSiteHigh.id));
    assert.ok(combined?.types.includes('juniorHigh') && combined.types.includes('high'), `${campus.name} の中高表示が統合されていません`);
    assert.deepEqual(combined?.formalTypeLabels, ['中学校', '高等学校'], `${campus.name} の中高正式種別が保持されていません`);
  }
}

for (const name of ['腰越小学校', '西鎌倉小学校', '七里ガ浜小学校', '深沢小学校', '山崎小学校', '富士塚小学校', '片瀬小学校', '腰越中学校', '手広中学校', '深沢中学校', '片瀬中学校']) {
  assert.ok(institutions.some(item => item.displayName === name && item.ownership === 'municipal'), `${name} がありません`);
}
const districtSchools = institutions.filter(item => item.source.startsWith('content/school-districts-'));
assert.ok(districtSchools.every(item => item.formalTypeCode === null));
assert.ok(districtSchools.every(item => item.formalTypeLabel === (item.type === 'elementary' ? '小学校' : '中学校')));

const iwase = campusByName('鎌倉女子大学 岩瀬キャンパス');
const kamakuraJuniorHigh = iwase.institutions.find(item => item.sourceName === '鎌倉女子大学中等部');
const kamakuraHigh = iwase.institutions.find(item => item.sourceName === '鎌倉女子大学高等部');
assert.equal(kamakuraJuniorHigh.displayName, '鎌倉国際文理中学校');
assert.equal(kamakuraJuniorHigh.formalTypeCode, '16002');
assert.equal(kamakuraJuniorHigh.formalTypeLabel, '中学校');
assert.equal(kamakuraJuniorHigh.nameVerificationStatus, 'verified-current-official-name');
assert.equal(kamakuraHigh.displayName, '鎌倉国際文理高等学校');
assert.equal(kamakuraHigh.formalTypeCode, '16004');
assert.equal(kamakuraHigh.formalTypeLabel, '高等学校');
assert.equal(kamakuraHigh.nameVerificationStatus, 'verified-current-official-name');
assert.equal(kamakuraJuniorHigh.officialUrl, 'https://www.kamakura-u-j.ed.jp/');
assert.equal(kamakuraHigh.officialUrl, 'https://www.kamakura-u-j.ed.jp/');
const kamakuraSecondaryListing = iwase.listings.find(item => item.name === '鎌倉国際文理中学校・高等学校');
assert.deepEqual(kamakuraSecondaryListing?.formalTypeLabels, ['中学校', '高等学校']);

assert.ok(html.includes('content/schools.json') === false, 'HTMLにデータパスを直書きせずJSから読み込む構成です');
assert.ok(script.includes("fetch('content/schools.json')"));
assert.ok(script.includes('item.formalTypes.filter(formalType => state.types.has(formalType.type))'));
assert.ok(script.includes('tileUrl:'));
assert.ok(script.includes('campus.viewModes.includes(state.scope)'));
assert.ok(script.includes("local: { center: [35.3230, 139.5050], zoom: 14 }"));
assert.ok(script.includes("nearby: { center: [35.3300, 139.5050], zoom: 13 }"));
assert.ok(script.includes("wide: { center: [35.3475, 139.4950], zoom: 12 }"));
assert.ok(script.includes("container.classList.toggle('map-tone-detail', zoom === 15)"));
assert.ok(script.includes("container.classList.toggle('map-tone-close', zoom === 16)"));
assert.ok(script.includes("container.classList.toggle('map-tone-closest', zoom >= 17)"));
assert.ok(script.includes("state.map.on('zoomend', syncMapTileTone)"));
assert.ok(readText('school-map-mockup.css').includes('.school-map.map-tone-detail .leaflet-tile-pane'));
assert.ok(readText('school-map-mockup.css').includes('.school-map.map-tone-close .leaflet-tile-pane'));
assert.ok(readText('school-map-mockup.css').includes('.school-map.map-tone-closest .leaflet-tile-pane'));
assert.ok(readText('school-map-mockup.css').includes('filter: saturate(.25) contrast(.58) brightness(1.25);'));
assert.ok(readText('school-map-mockup.css').includes('filter: saturate(.12) contrast(.48) brightness(1.34);'));
assert.ok(readText('school-map-mockup.css').includes('filter: saturate(.05) contrast(.40) brightness(1.42);'));
assert.ok(script.includes('ownershipToneClass(campus)'));
assert.ok(html.includes('school-districts.html'));
assert.ok(!html.includes('fitVisibleSchools'));
assert.ok(!script.includes('fitVisible()'));
assert.ok(html.includes('<h1>学校・幼稚園・保育施設</h1>'));
assert.ok(html.includes('<title>学校・幼稚園・保育施設｜にしかま周辺 まちノート</title>'));
assert.ok(html.includes('aria-label="学校・幼稚園・保育施設の地図"'));
assert.ok(html.includes('すべての施設種類を表示'));
assert.ok(html.includes('施設種類（複数選択）'));
assert.ok(!/施設種(?!類)/u.test(`${html}\n${script}\n${proposal}`));
assert.ok(!/校種/u.test(`${html}\n${script}\n${proposal}`));
assert.ok(!html.includes('mapSummary'));
assert.ok(!html.includes('地域・周辺は同じ全施設を表示し'));
assert.ok(!html.includes('私立・国立'));
assert.ok(!html.includes('市立・県立'));
assert.ok(!script.includes('mapSummary'));
assert.ok(proposal.includes('地域・周辺・広域は学校の排他的な分類ではなく'));
assert.ok(proposal.includes('湘南白百合学園中学校'));
assert.ok(proposal.includes('| 表示される地図 | キャンパス | 施設種類 |'));

const artifactHashes = {
  'agent-history/codex/2026-07-18-school-map-mockup/sources/kamakura-childcare-list-2026-04-01.pdf': '4CADE9F85FCDCAD6FF69C90C7E0933A84362E73675A1CA23069A19D8F8B21FC2',
  'agent-history/codex/2026-07-18-school-map-mockup/sources/kamakura-unlicensed-childcare-2025-12-15.pdf': '096A2D6D9A10530E074D7B69315648B2F92F14B9AA11A4FE402CE0DFEF77851B',
  'agent-history/codex/2026-07-18-school-map-mockup/sources/fujisawa-childcare-list-2026-06-18.pdf': 'D856A0C1453D658F8327FDC2ECB6E4E3C7A6758319652336E79103D2DBFD578E',
  'agent-history/codex/2026-07-18-school-map-mockup/sources/ui-feedback-brand.png': 'E0E19AE64D5D3F5F63C28AF9B4E7FF55F6FD04839B37E8A41641BAFAB21901CD'
};
for (const [relative, expected] of Object.entries(artifactHashes)) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex').toUpperCase();
  assert.equal(actual, expected, `${relative} のSHA-256が一致しません`);
}

console.log(JSON.stringify({
  sourceSha256: crypto.createHash('sha256').update(sourceBytes).digest('hex').toUpperCase(),
  sourceFeatures: source.features.length,
  publicSchoolsReused: data.meta.reusedPublicSchoolCount,
  childcareFacilities: childcare.length,
  institutions: institutions.length,
  campuses: data.campuses.length,
  viewCounts,
  formalTypeMissing: institutions.filter(item => !item.formalTypeLabel).map(item => item.displayName),
  unverified: institutions.filter(item => item.verificationStatus === 'unverified').map(item => item.displayName)
}, null, 2));
