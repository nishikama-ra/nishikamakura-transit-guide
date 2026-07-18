import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const normalizeAddress = value => String(value || '').normalize('NFKC').replace(/[\s　]/g, '').replace(/−/g, '-');

const source = readJson('content/schools-source.geojson');
const districtFiles = [
  readJson('content/school-districts-elementary.geojson'),
  readJson('content/school-districts-juniorHigh.geojson')
];

const typeOrder = ['nursery', 'kindergarten', 'elementary', 'juniorHigh', 'high', 'specialSupport', 'university', 'vocational'];
const typeLabels = {
  nursery: '保育施設', kindergarten: '幼稚園・こども園', elementary: '小学校', juniorHigh: '中学校', high: '高校',
  specialSupport: '特別支援学校', university: '大学・短期大学', vocational: '専門学校'
};
const scopeLabels = { local: '地域', nearby: '周辺', wide: '広域' };
const ownershipLabels = { municipal: '市立', prefectural: '県立', national: '国立', private: '私立' };
const officialUrls = {
  '片岡幼稚園': 'https://www.kataoka-gakuen.jp/',
  '江ノ島ともだち幼稚園': 'https://www.kamakurayyhp.com/',
  '七里が浜楓幼稚園': 'https://www.kaede.ac.jp/',
  '西鎌倉幼稚園': 'https://www.nky.ed.jp/',
  '認定こども園アワーキッズ鎌倉　（分園）': 'https://ourkids.jp/fukasawa/',
  '認定こども園アワーキッズ鎌倉　(本園)': 'https://ourkids.jp/kamakura/',
  'モンタナ幼稚園': 'https://www.montana-youchien.com/',
  '片瀬のぞみ幼稚園': 'https://katase-church.sakura.ne.jp/nozomi/',
  '湘南白百合学園幼稚園': 'https://youchien.shonan-shirayuri.ac.jp/',
  '湘南白百合学園小学校': 'https://syougakkou.shonan-shirayuri.ac.jp/',
  '湘南白百合学園高等学校': 'https://chukou.shonan-shirayuri.ac.jp/',
  '鎌倉女子大学幼稚部': 'https://www.kamakura-u.ac.jp/kindergarten/',
  '鎌倉女子大学初等部': 'https://www.kamakura-u.ac.jp/elementary/',
  '鎌倉女子大学中等部': 'https://www.kamakura-u-j.ed.jp/',
  '鎌倉女子大学高等部': 'https://www.kamakura-u-j.ed.jp/',
  '鎌倉女子大学': 'https://www.kamakura-u.ac.jp/',
  '鎌倉女子大学短期大学部': 'https://www.kamakura-u.ac.jp/',
  '清泉小学校': 'https://seisen-e.ac.jp/',
  '横浜国立大学教育学部附属鎌倉小学校': 'https://www.kamakurasho.ynu.ac.jp/',
  '横浜国立大学教育学部附属鎌倉中学校': 'https://kamachu.ynu.ac.jp/',
  '鎌倉女学院中学校': 'https://www.kamajo.ac.jp/',
  '鎌倉女学院高等学校': 'https://www.kamajo.ac.jp/',
  '栄光学園中学校': 'https://ekh.jp/',
  '栄光学園高等学校': 'https://ekh.jp/',
  '鎌倉学園中学校': 'https://www.kamagaku.ac.jp/',
  '鎌倉学園高等学校': 'https://www.kamagaku.ac.jp/',
  '北鎌倉女子学園中学校': 'https://www.kitakama.ac.jp/',
  '北鎌倉女子学園高等学校': 'https://www.kitakama.ac.jp/',
  '清泉女学院中学校': 'https://www.seisen-h.ed.jp/',
  '清泉女学院高等学校': 'https://www.seisen-h.ed.jp/',
  '湘南学園小学校': 'https://www.shogak.ac.jp/elementary/',
  '湘南学園中学校': 'https://www.shogak.ac.jp/highschool/',
  '湘南学園高等学校': 'https://www.shogak.ac.jp/highschool/',
  '聖園女学院中学校': 'https://www.misono.jp/',
  '聖園女学院高等学校': 'https://www.misono.jp/',
  '慶應義塾湘南藤沢中等部': 'https://www.sfc-js.keio.ac.jp/',
  '慶應義塾湘南藤沢高等部': 'https://www.sfc-js.keio.ac.jp/',
  '慶應義塾大学': 'https://www.sfc.keio.ac.jp/',
  '藤嶺学園藤沢中学校': 'https://www.tohrei-fujisawa.ed.jp/',
  '藤嶺学園藤沢高等学校': 'https://www.tohrei-fujisawa.ed.jp/',
  '湘南工科大学': 'https://www.shonan-it.ac.jp/',
  '湘南工科大学附属高等学校': 'https://www.sh.shonan-it.ac.jp/',
  '日本大学': 'https://www.brs.nihon-u.ac.jp/',
  '日本大学藤沢高等学校': 'https://www.fujisawa.hs.nihon-u.ac.jp/',
  '多摩大学': 'https://www.tama.ac.jp/guide/campus/shonan.html',
  '湘南鎌倉医療大学': 'https://www.sku.ac.jp/',
  '鎌倉早見美容芸術専門学校': 'https://www.hayami.ac.jp/',
  '日本ガーデンデザイン専門学校': 'https://www.jp-garden-design.com/',
  '湘南看護専門学校': 'https://www.shounankango.ac.jp/',
  '専門学校国際新堀芸術学院': 'https://niibori.ac.jp/ma/',
  '鵠沼高等学校': 'https://kugenuma.ed.jp/',
  '藤沢翔陵高等学校': 'https://shoryo.ed.jp/',
  '神奈川県立鎌倉高等学校': 'https://www.pen-kanagawa.ed.jp/kamakura-h/',
  '神奈川県立七里ガ浜高等学校': 'https://www.pen-kanagawa.ed.jp/shichirigahama-h/',
  '神奈川県立大船高等学校': 'https://www.pen-kanagawa.ed.jp/ofuna-h/',
  '神奈川県立湘南高等学校': 'https://www.pen-kanagawa.ed.jp/shonan-h/zennichi/',
  '神奈川県立藤沢清流高等学校': 'https://www.pen-kanagawa.ed.jp/fujisawaseiryu-h/',
  '神奈川県立鎌倉支援学校': 'https://www.pen-kanagawa.ed.jp/kamakura-sh/'
};

const displayNames = {
  '認定こども園アワーキッズ鎌倉　（分園）': '認定こども園アワーキッズ鎌倉（分園）',
  '認定こども園アワーキッズ鎌倉　(本園)': '認定こども園アワーキッズ鎌倉（本園）',
  '日本大学': '日本大学 生物資源科学部',
  '慶應義塾大学': '慶應義塾大学 湘南藤沢キャンパス',
  '多摩大学': '多摩大学 湘南キャンパス'
};

const combinedListingNames = {
  '鎌倉女学院中学校': '鎌倉女学院',
  '鎌倉女学院高等学校': '鎌倉女学院',
  '栄光学園中学校': '栄光学園中学高等学校',
  '栄光学園高等学校': '栄光学園中学高等学校',
  '鎌倉学園中学校': '鎌倉学園 中学校・高等学校',
  '鎌倉学園高等学校': '鎌倉学園 中学校・高等学校',
  '北鎌倉女子学園中学校': '北鎌倉女子学園中学校高等学校',
  '北鎌倉女子学園高等学校': '北鎌倉女子学園中学校高等学校',
  '清泉女学院中学校': '清泉女学院中学高等学校',
  '清泉女学院高等学校': '清泉女学院中学高等学校',
  '湘南学園中学校': '湘南学園中学校高等学校',
  '湘南学園高等学校': '湘南学園中学校高等学校',
  '聖園女学院中学校': '聖園女学院中学校・高等学校',
  '聖園女学院高等学校': '聖園女学院中学校・高等学校',
  '藤嶺学園藤沢中学校': '藤嶺学園藤沢中学校・高等学校',
  '藤嶺学園藤沢高等学校': '藤嶺学園藤沢中学校・高等学校',
  '湘南白百合学園中学校': '湘南白百合学園中学・高等学校',
  '湘南白百合学園高等学校': '湘南白百合学園中学・高等学校',
  '鎌倉女子大学中等部': '鎌倉女子大学中等部・高等部',
  '鎌倉女子大学高等部': '鎌倉女子大学中等部・高等部',
  '慶應義塾湘南藤沢中等部': '慶應義塾湘南藤沢中等部・高等部',
  '慶應義塾湘南藤沢高等部': '慶應義塾湘南藤沢中等部・高等部'
};

const correctedAddresses = {
  '湘南学園小学校': '神奈川県藤沢市鵠沼松が岡4-1-32'
};

function typeFor(name) {
  if (/支援学校/.test(name)) return 'specialSupport';
  if (/幼稚園|幼稚部|こども園/.test(name)) return 'kindergarten';
  if (/小学校|初等部/.test(name)) return 'elementary';
  if (/中学校|中等部/.test(name)) return 'juniorHigh';
  if (/高等学校|高等部/.test(name)) return 'high';
  if (/専門学校/.test(name)) return 'vocational';
  if (/大学|短期大学/.test(name)) return 'university';
  throw new Error(`校種を判定できません: ${name}`);
}

function ownershipFor(name) {
  if (/^神奈川県立/.test(name)) return 'prefectural';
  if (/^横浜国立大学/.test(name)) return 'national';
  return 'private';
}

function campusGroupFor(name, address) {
  if (/^慶應義塾(湘南藤沢|大学)/.test(name)) return 'keio-sfc';
  if (/^認定こども園アワーキッズ鎌倉/.test(name)) return 'ourkids-kamakura';
  if (/^七里が浜楓幼稚園/.test(name)) return 'kaede-shichirigahama';
  if (/^北鎌倉女子学園/.test(name)) return 'kitakamakura-jogakuen';
  return `address:${normalizeAddress(address)}`;
}

const institutions = source.features.map((feature, index) => {
  const sourceName = feature.properties.P29_004.trim();
  const sourceAddress = feature.properties.P29_005.trim();
  const displayName = displayNames[sourceName] || sourceName;
  const address = correctedAddresses[sourceName] || sourceAddress;
  const ownership = ownershipFor(sourceName);
  const [lng, lat] = feature.geometry.coordinates;
  return {
    id: `source-${String(index + 1).padStart(2, '0')}`,
    sourceName,
    displayName,
    listingName: combinedListingNames[sourceName] || displayName,
    nameVerificationStatus: officialUrls[sourceName] ? 'verified' : 'unverified',
    sourceAddress,
    address,
    addressVerificationStatus: correctedAddresses[sourceName] ? 'verified-corrected' : 'source',
    lat,
    lng,
    type: typeFor(sourceName),
    ownership,
    officialUrl: officialUrls[sourceName] || null,
    verificationStatus: officialUrls[sourceName] ? 'verified' : 'unverified',
    campusGroup: campusGroupFor(sourceName, address),
    source: 'content/schools-source.geojson'
  };
});

institutions.push({
  id: 'official-supplement-shonan-shirayuri-junior-high',
  sourceName: '湘南白百合学園中学校',
  displayName: '湘南白百合学園中学校',
  listingName: '湘南白百合学園中学・高等学校',
  nameVerificationStatus: 'verified-official-supplement',
  sourceAddress: '神奈川県藤沢市片瀬目白山4-1',
  address: '神奈川県藤沢市片瀬目白山4-1',
  addressVerificationStatus: 'verified',
  lat: 35.3160451,
  lng: 139.4907829,
  type: 'juniorHigh',
  ownership: 'private',
  officialUrl: 'https://chukou.shonan-shirayuri.ac.jp/',
  verificationStatus: 'verified',
  campusGroup: campusGroupFor('湘南白百合学園中学校', '神奈川県藤沢市片瀬目白山4-1'),
  source: 'official-site-supplement'
});

const KAMAKURA_CHILDCARE_SOURCE = 'https://www.city.kamakura.kanagawa.jp/hoiku/documents/r8_kamakurahoikusyo.pdf';
const KAMAKURA_UNLICENSED_SOURCE = 'https://www.city.kamakura.kanagawa.jp/hoiku/documents/ninkagai.pdf';
const FUJISAWA_CHILDCARE_SOURCE = 'https://www.city.fujisawa.kanagawa.jp/hoiku/kenko/kosodate/hoikuen/ninka-ichiran.html';
const childcareFacilities = [
  { name: 'キディ腰越保育園', address: '神奈川県鎌倉市腰越5-11-17', lat: 35.311390, lng: 139.493393, district: '腰越', category: '認可保育所', url: 'https://www.shinkoufukushikai.com/hoiku/210/', source: 'kamakura-licensed-childcare-pdf', sourceUrl: KAMAKURA_CHILDCARE_SOURCE },
  { name: '七里が浜楓幼稚園', address: '神奈川県鎌倉市七里ガ浜東3-14-6（1・2歳児）／七里ガ浜東3-13-12（3歳児以上）', lat: 35.311718, lng: 139.519455, district: '腰越', category: '認定こども園', url: 'https://www.kaede.ac.jp/', source: 'kamakura-licensed-childcare-pdf', sourceUrl: KAMAKURA_CHILDCARE_SOURCE },
  { name: 'てつなぐ腰越保育室', address: '神奈川県鎌倉市腰越5-2-1', lat: 35.313732, lng: 139.491577, district: '腰越', category: '小規模保育施設', url: 'https://tetsunagu-works.com/', source: 'kamakura-licensed-childcare-pdf', sourceUrl: KAMAKURA_CHILDCARE_SOURCE },
  { name: 'キンダークリッペ西鎌倉', address: '神奈川県鎌倉市西鎌倉2-17-1', lat: 35.324795, lng: 139.503998, district: '腰越', category: '小規模保育施設', url: 'https://www.nky.ed.jp/krippe/', source: 'kamakura-licensed-childcare-pdf', sourceUrl: KAMAKURA_CHILDCARE_SOURCE },
  { name: 'きみのまま保育園', address: '神奈川県鎌倉市津西1-5-15', lat: 35.314236, lng: 139.500992, district: '腰越', category: '小規模保育施設', url: 'https://www.kiminomama.com/', source: 'kamakura-licensed-childcare-pdf', sourceUrl: KAMAKURA_CHILDCARE_SOURCE },
  { name: '深沢保育園', address: '神奈川県鎌倉市梶原2-33-2', lat: 35.328674, lng: 139.530533, district: '深沢', category: '認可保育所', ownership: 'municipal', url: 'https://www.city.kamakura.kanagawa.jp/annai/shisetsu/35_fukasawa_ns.html', source: 'kamakura-licensed-childcare-pdf', sourceUrl: KAMAKURA_CHILDCARE_SOURCE },
  { name: '梶原の森たんぽぽ保育園', address: '神奈川県鎌倉市梶原4-2-10', lat: 35.326996, lng: 139.527496, district: '深沢', category: '認可保育所', url: 'https://k-tanpopo.or.jp/kajiwara/', source: 'kamakura-licensed-childcare-pdf', sourceUrl: KAMAKURA_CHILDCARE_SOURCE },
  { name: '寺分保育園', address: '神奈川県鎌倉市寺分418-10', lat: 35.335526, lng: 139.520065, district: '深沢', category: '認可保育所', url: 'https://yukarifukushikai.or.jp/terabun/', source: 'kamakura-licensed-childcare-pdf', sourceUrl: KAMAKURA_CHILDCARE_SOURCE },
  { name: '山崎保育園', address: '神奈川県鎌倉市山崎1148', lat: 35.343735, lng: 139.527206, district: '深沢', category: '認可保育所', url: 'https://www.k-roufukukyo.jp/pages/11/', source: 'kamakura-licensed-childcare-pdf', sourceUrl: KAMAKURA_CHILDCARE_SOURCE },
  { name: 'たんぽぽ共同保育園', address: '神奈川県鎌倉市手広2-18-27', lat: 35.327549, lng: 139.510651, district: '深沢', category: '認可保育所', url: 'https://k-tanpopo.or.jp/tanpopo/', source: 'kamakura-licensed-childcare-pdf', sourceUrl: KAMAKURA_CHILDCARE_SOURCE },
  { name: 'まんまる保育園', address: '神奈川県鎌倉市手広5-5-5', lat: 35.324677, lng: 139.506744, district: '深沢', category: '認可保育所', url: 'https://manmarusmile.com/', source: 'kamakura-licensed-childcare-pdf', sourceUrl: KAMAKURA_CHILDCARE_SOURCE },
  { name: 'ピヨピヨ保育園', address: '神奈川県鎌倉市常盤666', lat: 35.323765, lng: 139.530762, district: '深沢', category: '認可保育所', url: 'https://piyo-kamakura.wixsite.com/my-site', source: 'kamakura-licensed-childcare-pdf', sourceUrl: KAMAKURA_CHILDCARE_SOURCE },
  { name: '認定こども園アワーキッズ鎌倉（本園）', address: '神奈川県鎌倉市寺分1-13-5', lat: 35.333679, lng: 139.522003, district: '深沢', category: '認定こども園', url: 'https://ourkids.jp/kamakura/', source: 'kamakura-licensed-childcare-pdf', sourceUrl: KAMAKURA_CHILDCARE_SOURCE },
  { name: '認定こども園アワーキッズ鎌倉（分園）', address: '神奈川県鎌倉市寺分1-15-4', lat: 35.334412, lng: 139.521454, district: '深沢', category: '認定こども園', url: 'https://ourkids.jp/fukasawa/', source: 'kamakura-licensed-childcare-pdf', sourceUrl: KAMAKURA_CHILDCARE_SOURCE },
  { name: 'アトリエし～はうす保育園', address: '神奈川県鎌倉市常盤64-5', lat: 35.331497, lng: 139.517990, district: '深沢', category: '小規模保育施設', url: 'https://www.atelier-c-house.com/', source: 'kamakura-licensed-childcare-pdf', sourceUrl: KAMAKURA_CHILDCARE_SOURCE },
  { name: 'しあわせいっぱい保育園深沢', address: '神奈川県鎌倉市常盤362-7', lat: 35.325657, lng: 139.524445, district: '深沢', category: '小規模保育施設', url: 'https://shiawase-hoiku.com/introduction/fukazawa/', source: 'kamakura-licensed-childcare-pdf', sourceUrl: KAMAKURA_CHILDCARE_SOURCE },
  { name: 'ののはな', address: '神奈川県鎌倉市笛田4-8-9', lat: 35.324741, lng: 139.523056, district: '深沢', category: '届出保育施設', url: 'https://www.city.kamakura.kanagawa.jp/hoiku/bf510.html', source: 'kamakura-unlicensed-childcare-pdf', sourceUrl: KAMAKURA_UNLICENSED_SOURCE },
  { name: 'モンテッソーリ鎌倉こどもの家', address: '神奈川県鎌倉市梶原58-3', lat: 35.331310, lng: 139.514954, district: '深沢', category: '届出保育施設', url: 'https://www.city.kamakura.kanagawa.jp/hoiku/bf510.html', source: 'kamakura-unlicensed-childcare-pdf', sourceUrl: KAMAKURA_UNLICENSED_SOURCE },
  { name: '鎌倉山インターナショナルスクール', address: '神奈川県鎌倉市鎌倉山1-19-24', lat: 35.316196, lng: 139.522873, district: '深沢', category: '届出保育施設', url: 'https://www.city.kamakura.kanagawa.jp/hoiku/bf510.html', source: 'kamakura-unlicensed-childcare-pdf', sourceUrl: KAMAKURA_UNLICENSED_SOURCE },
  { name: '送迎付病児保育室エルダーフラワー', address: '神奈川県鎌倉市梶原1-5-12 ピュア湘南405', lat: 35.332127, lng: 139.518204, district: '深沢', category: '届出・病児保育施設', url: 'https://www.city.kamakura.kanagawa.jp/hoiku/bf510.html', source: 'kamakura-unlicensed-childcare-pdf', sourceUrl: KAMAKURA_UNLICENSED_SOURCE },
  { name: '富士見保育園', address: '神奈川県藤沢市片瀬5-13-15', lat: 35.317123, lng: 139.484528, district: '片瀬', category: '認可保育所', url: 'https://www.ans.co.jp/u/fujisawa/fujimi.htm', source: 'fujisawa-licensed-childcare-page', sourceUrl: FUJISAWA_CHILDCARE_SOURCE }
];

childcareFacilities.forEach((facility, index) => {
  institutions.push({
    id: `childcare-${String(index + 1).padStart(2, '0')}`,
    sourceName: facility.name,
    displayName: facility.name,
    listingName: facility.name,
    nameVerificationStatus: 'verified-official-source',
    sourceAddress: facility.address,
    address: facility.address,
    addressVerificationStatus: 'verified-official-source',
    lat: facility.lat,
    lng: facility.lng,
    type: 'nursery',
    ownership: facility.ownership || 'private',
    officialUrl: facility.url,
    verificationStatus: 'verified',
    campusGroup: campusGroupFor(facility.name, facility.address),
    source: facility.source,
    sourceUrl: facility.sourceUrl,
    district: facility.district,
    childcareCategory: facility.category
  });
});

for (const collection of districtFiles) {
  for (const feature of collection.features) {
    const p = feature.properties;
    institutions.push({
      id: `district-${p.id}`,
      sourceName: p.name,
      displayName: p.name,
      listingName: p.name,
      nameVerificationStatus: 'verified',
      sourceAddress: p.address,
      address: p.address,
      addressVerificationStatus: 'verified',
      lat: p.schoolLat,
      lng: p.schoolLng,
      type: p.level === 'elementary' ? 'elementary' : 'juniorHigh',
      ownership: 'municipal',
      officialUrl: p.schoolUrl || null,
      verificationStatus: p.schoolUrl ? 'verified' : 'unverified',
      campusGroup: `district:${p.id}`,
      source: p.level === 'elementary'
        ? 'content/school-districts-elementary.geojson'
        : 'content/school-districts-juniorHigh.geojson'
    });
  }
}

const campusNamesByAddress = new Map(Object.entries({
  '神奈川県鎌倉市岩瀬1420': '鎌倉女子大学 岩瀬キャンパス',
  '神奈川県鎌倉市大船6-1-3': '鎌倉女子大学 大船キャンパス',
  '神奈川県鎌倉市雪ノ下3-5-10': '横浜国立大学教育学部附属鎌倉小・中学校',
  '神奈川県鎌倉市由比ガ浜2-10-4': '鎌倉女学院中学校・高等学校',
  '神奈川県鎌倉市玉縄4-1-1': '栄光学園中学校・高等学校',
  '神奈川県鎌倉市山ノ内110': '鎌倉学園中学校・高等学校',
  '神奈川県鎌倉市山之内913': '北鎌倉女子学園中学校・高等学校',
  '神奈川県鎌倉市城廻200': '清泉女学院中学校・高等学校',
  '神奈川県藤沢市鵠沼松が岡3-4-27': '湘南学園中学校・高等学校',
  '神奈川県藤沢市みその台1-4': '聖園女学院中学校・高等学校',
  '神奈川県藤沢市西富1-7-1': '藤嶺学園藤沢中学校・高等学校',
  '神奈川県藤沢市片瀬目白山4-1': '湘南白百合学園中学・高等学校',
  '神奈川県藤沢市辻堂西海岸1-1-25': '湘南工科大学・附属高等学校',
  '神奈川県藤沢市亀井野1866': '日本大学藤沢キャンパス'
}).map(([address, name]) => [normalizeAddress(address), name]));

const grouped = new Map();
for (const institution of institutions) {
  if (!grouped.has(institution.campusGroup)) grouped.set(institution.campusGroup, []);
  grouped.get(institution.campusGroup).push(institution);
}

const campuses = [...grouped.entries()].map(([group, schools], index) => {
  const types = [...new Set(schools.map(item => item.type))].sort((a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b));
  const ownerships = [...new Set(schools.map(item => item.ownership))];
  const listingGroups = new Map();
  for (const school of schools) {
    const key = `${school.listingName}\u0000${school.officialUrl || ''}`;
    if (!listingGroups.has(key)) listingGroups.set(key, []);
    listingGroups.get(key).push(school);
  }
  const listings = [...listingGroups.values()].map(items => ({
    name: items[0].listingName,
    types: [...new Set(items.map(item => item.type))].sort((a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b)),
    ownerships: [...new Set(items.map(item => item.ownership))],
    officialUrl: items[0].officialUrl,
    institutionIds: items.map(item => item.id)
  }));
  const rawAddress = schools[0].address;
  let name = schools.length === 1 ? schools[0].displayName : campusNamesByAddress.get(normalizeAddress(rawAddress));
  if (group === 'keio-sfc') name = '慶應義塾SFC（大学・中等部・高等部）';
  if (group === 'ourkids-kamakura') name = '認定こども園アワーキッズ鎌倉 本園・分園';
  if (group === 'kaede-shichirigahama') name = '七里が浜楓幼稚園（認定こども園）';
  if (group === 'kitakamakura-jogakuen') name = '北鎌倉女子学園中学校・高等学校';
  if (schools.some(item => item.sourceName === '湘南白百合学園高等学校')) name = '湘南白百合学園中学・高等学校';
  if (listings.length === 1 && listings[0].types.includes('juniorHigh') && listings[0].types.includes('high')) name = listings[0].name;
  if (!name) name = schools.map(item => item.displayName).join('・');
  const address = group === 'keio-sfc'
    ? '神奈川県藤沢市遠藤5322・5466'
    : group === 'ourkids-kamakura'
      ? '神奈川県鎌倉市寺分1-13-5・1-15-4'
      : group === 'kaede-shichirigahama'
        ? '神奈川県鎌倉市七里ガ浜東3-14-6・3-13-12'
      : group === 'kitakamakura-jogakuen'
        ? '神奈川県鎌倉市山ノ内913'
      : rawAddress;
  const lat = Number((schools.reduce((sum, item) => sum + item.lat, 0) / schools.length).toFixed(7));
  const lng = Number((schools.reduce((sum, item) => sum + item.lng, 0) / schools.length).toFixed(7));
  const wideDetailOnly = schools.every(item =>
    item.type === 'nursery'
    || item.type === 'kindergarten'
    || (item.ownership === 'municipal' && ['elementary', 'juniorHigh'].includes(item.type))
  );
  const viewModes = ['local', 'nearby'];
  if (!wideDetailOnly) viewModes.push('wide');
  return {
    id: `campus-${String(index + 1).padStart(2, '0')}`,
    name,
    address,
    lat,
    lng,
    viewModes,
    detailLevel: wideDetailOnly ? 'fine' : 'major',
    types,
    ownerships,
    institutions: schools.map(({ campusGroup, ...item }) => item),
    listings,
    officialUrl: schools.find(item => item.officialUrl)?.officialUrl || null,
    verificationStatus: schools.every(item => item.verificationStatus === 'verified') ? 'verified' : 'partly-unverified'
  };
});

const output = {
  meta: {
    title: '学校地図モックアップ用データ',
    generatedAt: '2026-07-18',
    sourceFeatureCount: source.features.length,
    reusedPublicSchoolCount: institutions.filter(item => item.source.startsWith('content/school-districts-')).length,
    officialSupplementCount: institutions.filter(item => item.source === 'official-site-supplement').length,
    childcareFacilityCount: institutions.filter(item => item.type === 'nursery').length,
    institutionCount: institutions.length,
    campusCount: campuses.length,
    scopeLabels,
    typeLabels,
    ownershipLabels,
    note: '地域・周辺は全施設を表示して初期縮尺だけを変え、広域は保育施設・幼稚園・市立小中学校を省きます。元GeoJSONは変更していません。'
  },
  campuses
};

const jsonPath = path.join(root, 'content/schools.json');
fs.writeFileSync(jsonPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

const rows = campuses
  .sort((a, b) => typeOrder.indexOf(a.types[0]) - typeOrder.indexOf(b.types[0]) || a.name.localeCompare(b.name, 'ja'))
  .map(campus => `| ${campus.viewModes.map(mode => scopeLabels[mode]).join('・') || '対象外'} | ${campus.name} | ${campus.types.map(type => typeLabels[type]).join('・')} | ${campus.ownerships.map(item => ownershipLabels[item]).join('・')} | ${campus.address} |`)
  .join('\n');
const unverified = institutions.filter(item => item.verificationStatus !== 'verified');
const proposal = `# 学校地図 表示範囲・キャンパス統合案\n\n` +
  `この文書は \`school-map-mockup.html\` の確認用です。分類はモックアップ段階の暫定提案で、元の \`content/schools-source.geojson\` は変更していません。\n\n` +
  `- 元データ: ${source.features.length}施設\n` +
  `- 既存学区データから追加: ${output.meta.reusedPublicSchoolCount}校\n` +
  `- 公式サイトとの突合で補完: ${output.meta.officialSupplementCount}校（湘南白百合学園中学校）\n` +
  `- 腰越・深沢・片瀬から追加した保育施設: ${output.meta.childcareFacilityCount}件\n` +
  `- 掲載する学校・保育施設: ${institutions.length}件\n` +
  `- キャンパス統合後: ${campuses.length}マーカー\n\n` +
  `## 表示一覧\n\n| 表示される地図 | キャンパス | 校種 | 設置区分 | 住所 |\n|---|---|---|---|---|\n${rows}\n\n` +
  `## 表示方針\n\n` +
  `- 地域・周辺・広域は学校の排他的な分類ではなく、地図の縮尺と情報量の切り替え。\n` +
  `- 地域・周辺: 同じ全施設を表示し、初期縮尺と中心位置だけを変更。\n` +
  `- 広域: 全域を対象にしつつ、保育施設、幼稚園・こども園、市立小学校、市立中学校は混雑防止のため省略。私立・国立の小中学校と中高一貫校は表示。\n` +
  `- 同一住所は原則1マーカー。慶應義塾SFCは「大学」と「中等部・高等部」の2施設を1キャンパスマーカー内に表示。アワーキッズ鎌倉本園・分園は1キャンパスマーカーに統合。\n` +
  `- 湘南白百合学園は幼稚園、小学校、中学・高等学校を所在地別の3マーカーにした。中学校は公式サイトとの突合で補完。\n` +
  `- 同一住所・同一公式サイトの中高は、ポップアップ内でも公式サイト側の一体名称にまとめる。\n\n` +
  `## 公式サイト未確認\n\n` +
  (unverified.length ? unverified.map(item => `- ${item.displayName}`).join('\n') : '- なし') + '\n';
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/school-scope-proposal.md'), proposal, 'utf8');

console.log(JSON.stringify({ source: source.features.length, publicSchools: output.meta.reusedPublicSchoolCount, officialSupplements: output.meta.officialSupplementCount, institutions: institutions.length, campuses: campuses.length, viewCounts: Object.fromEntries(Object.keys(scopeLabels).map(mode => [mode, campuses.filter(campus => campus.viewModes.includes(mode)).length])), unverified: unverified.map(item => item.displayName) }));
