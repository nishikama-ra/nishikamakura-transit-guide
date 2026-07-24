import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Build content/schools.json from the extracted P29-23_14.geojson file.
// The official P29 ZIP must be extracted first; this script intentionally does not
// download data or guess an archive structure.
const SOURCE_PAGE = 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P29-2023.html';
const TOOL_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const OFFICIAL_URL_OVERRIDE_FILE = path.join(TOOL_DIRECTORY, 'school-official-url-overrides.json');
const officialUrlOverrideData = JSON.parse(fs.readFileSync(OFFICIAL_URL_OVERRIDE_FILE, 'utf8'));
const RECOVERED_OFFICIAL_URLS_BY_ID = Object.fromEntries(
  Object.entries(officialUrlOverrideData.institutions).map(([id, item]) => [id, item.officialUrl])
);
const TYPE_LABELS = {
  "elementary": "小学校",
  "juniorHigh": "中学校",
  "high": "高校",
  "university": "大学・短期大学"
};
const TYPE_ORDER = Object.keys(TYPE_LABELS);
const OWNERSHIP_LABELS = {
  "municipal": "市立",
  "prefectural": "県立",
  "national": "国立",
  "private": "私立"
};
const OWNERSHIP_CODES = {
  "1": "national",
  "2": "prefectural",
  "3": "municipal",
  "4": "private"
};
const FORMAL_TYPE_LABELS = {
  "16001": "小学校",
  "16002": "中学校",
  "16003": "中等教育学校",
  "16004": "高等学校",
  "16006": "短期大学",
  "16007": "大学",
  "16014": "義務教育学校"
};
const FORMAL_TYPE_TO_TYPES = {
  "16001": [
    "elementary"
  ],
  "16002": [
    "juniorHigh"
  ],
  "16003": [
    "juniorHigh",
    "high"
  ],
  "16004": [
    "high"
  ],
  "16006": [
    "university"
  ],
  "16007": [
    "university"
  ],
  "16014": [
    "elementary",
    "juniorHigh"
  ]
};
const TARGET_MUNICIPALITIES = [
  "横浜市",
  "横須賀市",
  "逗子市",
  "三浦市",
  "葉山町",
  "鎌倉市",
  "藤沢市",
  "大和市",
  "綾瀬市",
  "茅ヶ崎市"
];
const OFFICIAL_URLS = {
  "湘南白百合学園小学校": "https://syougakkou.shonan-shirayuri.ac.jp/",
  "湘南白百合学園中学校": "https://chukou.shonan-shirayuri.ac.jp/",
  "湘南白百合学園高等学校": "https://chukou.shonan-shirayuri.ac.jp/",
  "鎌倉女子大学初等部": "https://www.kamakura-u.ac.jp/elementary/",
  "鎌倉女子大学中等部": "https://www.kamakura-u-j.ed.jp/",
  "鎌倉女子大学高等部": "https://www.kamakura-u-j.ed.jp/",
  "鎌倉女子大学": "https://www.kamakura-u.ac.jp/",
  "鎌倉女子大学短期大学部": "https://www.kamakura-u.ac.jp/",
  "清泉小学校": "https://seisen-e.ac.jp/",
  "横浜国立大学教育学部附属鎌倉小学校": "https://www.kamakurasho.ynu.ac.jp/",
  "横浜国立大学教育学部附属鎌倉中学校": "https://kamachu.ynu.ac.jp/",
  "鎌倉女学院中学校": "https://www.kamajo.ac.jp/",
  "鎌倉女学院高等学校": "https://www.kamajo.ac.jp/",
  "栄光学園中学校": "https://ekh.jp/",
  "栄光学園高等学校": "https://ekh.jp/",
  "鎌倉学園中学校": "https://www.kamagaku.ac.jp/",
  "鎌倉学園高等学校": "https://www.kamagaku.ac.jp/",
  "北鎌倉女子学園中学校": "https://www.kitakama.ac.jp/",
  "北鎌倉女子学園高等学校": "https://www.kitakama.ac.jp/",
  "清泉女学院中学校": "https://www.seisen-h.ed.jp/",
  "清泉女学院高等学校": "https://www.seisen-h.ed.jp/",
  "湘南学園小学校": "https://www.shogak.ac.jp/elementary/",
  "湘南学園中学校": "https://www.shogak.ac.jp/highschool/",
  "湘南学園高等学校": "https://www.shogak.ac.jp/highschool/",
  "聖園女学院中学校": "https://www.misono.jp/",
  "聖園女学院高等学校": "https://www.misono.jp/",
  "慶應義塾湘南藤沢中等部": "https://www.sfc-js.keio.ac.jp/",
  "慶應義塾湘南藤沢高等部": "https://www.sfc-js.keio.ac.jp/",
  "慶應義塾大学": "https://www.sfc.keio.ac.jp/",
  "藤嶺学園藤沢中学校": "https://www.tohrei-fujisawa.ed.jp/",
  "藤嶺学園藤沢高等学校": "https://www.tohrei-fujisawa.ed.jp/",
  "湘南工科大学": "https://www.shonan-it.ac.jp/",
  "湘南工科大学附属高等学校": "https://www.sh.shonan-it.ac.jp/",
  "日本大学": "https://www.brs.nihon-u.ac.jp/",
  "日本大学藤沢高等学校": "https://www.fujisawa.hs.nihon-u.ac.jp/",
  "多摩大学": "https://www.tama.ac.jp/guide/campus/shonan.html",
  "湘南鎌倉医療大学": "https://www.sku.ac.jp/",
  "鵠沼高等学校": "https://kugenuma.ed.jp/",
  "藤沢翔陵高等学校": "https://shoryo.ed.jp/",
  "神奈川県立鎌倉高等学校": "https://www.pen-kanagawa.ed.jp/kamakura-h/",
  "神奈川県立七里ガ浜高等学校": "https://www.pen-kanagawa.ed.jp/shichirigahama-h/",
  "神奈川県立大船高等学校": "https://www.pen-kanagawa.ed.jp/ofuna-h/",
  "神奈川県立湘南高等学校": "https://www.pen-kanagawa.ed.jp/shonan-h/zennichi/",
  "神奈川県立藤沢清流高等学校": "https://www.pen-kanagawa.ed.jp/fujisawaseiryu-h/"
};
const DISPLAY_NAMES_BY_ID = {
  "F114310104678-01": "フェリス女学院大学 緑園キャンパス",
  "F114310104678-02": "フェリス女学院大学 山手キャンパス",
  "F113310102984-04": "慶應義塾大学 矢上キャンパス",
  "F113310102984-05": "慶應義塾大学 日吉キャンパス",
  "F113310103545-02": "明治学院大学 横浜キャンパス",
  "F113310103073-02": "昭和医科大学 横浜キャンパス",
  "F113110102746-02": "東京科学大学 横浜キャンパス",
  "F113110102737-03": "東京藝術大学 横浜キャンパス",
  "F113310103518-02": "東京都市大学 横浜キャンパス",
  "F114210104616-01": "横浜市立大学 金沢八景キャンパス",
  "F114210104616-02": "横浜市立大学 福浦キャンパス",
  "F114210104616-03": "横浜市立大学 鶴見キャンパス",
  "F114210104616-04": "横浜市立大学 舞岡キャンパス",
  "D114210020060-02": "横浜商業高等学校別科",
  "F114310104641-01": "神奈川大学 横浜キャンパス",
  "F114310104641-03": "神奈川大学 みなとみらいキャンパス",
  "D114210010197-00": "神奈川県立二俣川高等学校",
  "D114210010320-00": "神奈川県立青葉総合高等学校",
  "F114310104650-01": "関東学院大学 横浜・金沢八景キャンパス",
  "F114310104650-02": "関東学院大学 横浜・金沢文庫キャンパス",
  "F114310104650-03": "関東学院大学 横浜・関内キャンパス",
  "C114320100017-00": "神奈川歯科大学系属緑ヶ丘女子中学校",
  "D114320100033-00": "神奈川歯科大学系属緑ヶ丘女子高等学校",
  "F113310102868-03": "文教大学 湘南キャンパス",
  "F114110104609-01": "総合研究大学院大学 葉山キャンパス",
  "F114110104609-15": "総合研究大学院大学 葉山キャンパス",
  "C114320400050-00": "鎌倉国際文理中学校",
  "D114320400058-00": "鎌倉国際文理高等学校",
  "F113310102984-06": "慶應義塾大学 湘南藤沢キャンパス",
  "F113310103395-16": "日本大学 生物資源科学部",
  "F113310103938-02": "多摩大学 湘南キャンパス"
};
const OFFICIAL_URLS_BY_ID = {
  "F114310104909-00": "https://www.b-w.ac.jp/access/",
  "F114310104678-01": "https://www.ferris.ac.jp/access/",
  "F114310104678-02": "https://www.ferris.ac.jp/access/",
  "F114310104696-00": "https://www.yashima.ac.jp/univ/information/access.php",
  "F114310104703-00": "https://www.iisec.ac.jp/",
  "F113310102984-04": "https://www.keio.ac.jp/ja/about/campus/yagami/",
  "F113310102984-05": "https://www.keio.ac.jp/ja/about/campus/hiyoshi/",
  "F113310103545-02": "https://www.meijigakuin.ac.jp/campus/yokohama/",
  "F113310103073-02": "https://www.showa-u.ac.jp/about_us/campus/yokohama.html",
  "F113110102746-02": "https://www.isct.ac.jp/ja/001/about/campuses-and-offices/yokohama",
  "F113110102737-03": "https://www.geidai.ac.jp/access/yokohama",
  "F113310103518-02": "https://www.asc.tcu.ac.jp/campus_yokohama/",
  "F114310104829-00": "https://www.toyoeiwa.ac.jp/daigaku/",
  "F114310104810-00": "https://toin.ac.jp/univ/accessmap/",
  "F114310104687-00": "https://www.shodai.ac.jp/access/",
  "F114110104592-00": "https://www.ynu.ac.jp/access/",
  "F214310104935-00": "https://www.yokotan.ac.jp/access",
  "F114210104616-01": "https://www.yokohama-cu.ac.jp/access/index.html",
  "F114210104616-02": "https://www.yokohama-cu.ac.jp/access/index.html",
  "F114210104616-03": "https://www.yokohama-cu.ac.jp/access/index.html",
  "F114210104616-04": "https://www.yokohama-cu.ac.jp/access/index.html",
  "F114310104856-00": "https://www.yokohama-art.ac.jp/about/access",
  "F114310104874-00": "https://www.soei.ac.jp/guide/access/",
  "F114310104712-00": "https://www.hamayaku.ac.jp/",
  "F114310104883-00": "https://sums.ac.jp/html/access/",
  "F114310104641-01": "https://www.kanagawa-u.ac.jp/access/yokohama/",
  "F114310104641-03": "https://www.kanagawa-u.ac.jp/access/minatomirai/",
  "F114310104650-01": "https://univ.kanto-gakuin.ac.jp/about-university/campus-facilities/campus.html",
  "F114310104650-02": "https://univ.kanto-gakuin.ac.jp/about-university/campus-facilities/campus.html",
  "F114310104650-03": "https://univ.kanto-gakuin.ac.jp/about-university/campus-facilities/campus.html",
  "F114310104669-00": "https://www.tsurumi-u.ac.jp/site/about/accessmap-index.html",
  "F214310104926-00": "https://www.tsurumi-u.ac.jp/site/about/accessmap-index.html",
  "F114310104730-00": "https://www.kdu.ac.jp/",
  "F214310105006-00": "https://www.kdu.ac.jp/college/",
  "F114210104625-00": "https://www.kuhs.ac.jp/",
  "F113310102868-03": "https://www.bunkyo.ac.jp/access/shonan/",
  "F114110104609-01": "https://www.soken.ac.jp/about/access/",
  "F114110104609-15": "https://www.soken.ac.jp/prog/ies/",
  "F113310103938-02": "https://www.tama.ac.jp/guide/campus/shonan.html",
  "F113310102984-06": "https://www.keio.ac.jp/ja/about/campus/sfc/",
  "F113310103395-16": "https://www.brs.nihon-u.ac.jp/",
  "F114310104758-00": "https://www.shonan-it.ac.jp/",
  "F114310104892-00": "https://www.sku.ac.jp/",
  "F114310104749-00": "https://www.kamakura-u.ac.jp/",
  "F214310104971-00": "https://www.kamakura-u.ac.jp/",
  "D114210020060-02": "https://www.edu.city.yokohama.lg.jp/school/hs/y-sho-bekka/",
  "D114210010197-00": "https://www.pen-kanagawa.ed.jp/futamatagawa-h/",
  "D114210010320-00": "https://www.pen-kanagawa.ed.jp/aobasogo-ih/",
  "C114320100017-00": "https://www.kdu.ac.jp/corporation/news/topics/20241225_news.html",
  "D114320100033-00": "https://www.kdu.ac.jp/corporation/news/topics/20241225_news.html",
  "B114110000015-00": "https://www.ynu.ac.jp/inquiry/school.html",
  "C114110000013-00": "https://www.ynu.ac.jp/inquiry/school.html",
  "B114110000024-00": "https://www.ynu.ac.jp/inquiry/school.html",
  "C114110000022-00": "https://www.ynu.ac.jp/inquiry/school.html",
  "B114320500015-00": "https://www.shogak.ac.jp/elementary/access"
};
const ADDRESSES_BY_ID = {
  "B114320500015-00": "神奈川県藤沢市鵠沼松が岡4-1-32",
  // 横浜中学校(47-1) と 横浜高等学校(46-1) は同一の中高一貫校（横浜中学校・高等学校）。
  // 原資料の住所差で別地点に分かれるため、公式所在地46-1へ寄せて1キャンパスに統合する。
  "C114310000180-00": "神奈川県横浜市金沢区能見台通46-1",
  "D114310000204-00": "神奈川県横浜市金沢区能見台通46-1",
  // 北鎌倉女子学園中学校(山之内913) と 高等学校(山ノ内913) は同一校。表記揺れを山ノ内913へ統一して統合する。
  "C114320400041-00": "神奈川県鎌倉市山ノ内913",
  "D114320400049-00": "神奈川県鎌倉市山ノ内913"
};
// P29には横浜清風中学校(C114310000153-00)が含まれるが、横浜清風高等学校は高校のみで併設中学校は実在しない
// （公式沿革・神奈川県私立中学高等学校協会いずれも高校のみ）。誤登録として収録対象から除外する。
const EXCLUDED_INSTITUTION_IDS = new Set([
  "C114310000153-00"
]);
const DISPLAY_NAMES = {
  "日本大学": "日本大学 生物資源科学部",
  "慶應義塾大学": "慶應義塾大学 湘南藤沢キャンパス",
  "多摩大学": "多摩大学 湘南キャンパス",
  "鎌倉女子大学中等部": "鎌倉国際文理中学校",
  "鎌倉女子大学高等部": "鎌倉国際文理高等学校"
};

const municipalityPatterns = [
  ['横浜市', /^(?:神奈川県)?横浜市/],
  ['横須賀市', /^(?:神奈川県)?横須賀市/],
  ['逗子市', /^(?:神奈川県)?逗子市/],
  ['三浦市', /^(?:神奈川県)?三浦市/],
  ['葉山町', /^(?:神奈川県)?(?:三浦郡)?葉山町/],
  ['鎌倉市', /^(?:神奈川県)?鎌倉市/],
  ['藤沢市', /^(?:神奈川県)?藤沢市/],
  ['大和市', /^(?:神奈川県)?大和市/],
  ['綾瀬市', /^(?:神奈川県)?綾瀬市/],
  ['茅ヶ崎市', /^(?:神奈川県)?茅ヶ崎市/],
];

function parseArgs(argv) {
  const args = { source: null, output: 'content/schools.json' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source') args.source = argv[++i];
    else if (argv[i] === '--output') args.output = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!args.source) throw new Error('--source is required (extracted P29 GeoJSON file).');
  return args;
}

function first(properties, names, fallback = '') {
  for (const name of names) {
    const value = properties[name];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
}

function municipalityFromAddress(raw) {
  const address = String(raw ?? '').normalize('NFKC').trim();
  for (const [municipality, pattern] of municipalityPatterns) {
    if (pattern.test(address)) return municipality;
  }
  return null;
}

function fullAddress(raw) {
  const value = String(raw ?? '').trim();
  if (!value || value.startsWith('神奈川県')) return value;
  return municipalityFromAddress(value) ? `神奈川県${value}` : value;
}

function normalizeAddress(value) {
  return String(value ?? '')
    .replace(/[\s　−ー‐‑–—]/g, '')
    .replaceAll('丁目', '')
    .replaceAll('番地', '')
    .replaceAll('番', '-')
    .replaceAll('号', '');
}

function featureToInstitution(feature) {
  const properties = feature?.properties ?? {};
  const sourceAddress = String(first(properties, ['P29_005_ja', 'P29_005', 'location_ja', 'address', 'location', '所在地'])).trim();
  const municipality = municipalityFromAddress(sourceAddress);
  if (!municipality) return null;

  const formalTypeCode = String(first(properties, ['P29_003', 'SchooltypeCode', 'schoolClassCode', '学校分類コード'])).trim();
  const types = FORMAL_TYPE_TO_TYPES[formalTypeCode];
  if (!types) return null;

  const ownershipCode = String(first(properties, ['P29_006', 'AdministratorCode', 'administratorCode', '管理者コード'])).trim();
  const ownership = OWNERSHIP_CODES[ownershipCode];
  if (!ownership) return null;

  const closeCode = String(first(properties, ['P29_007', 'ClosedSchoolCode', 'closedSchoolCode', 'closeSchoolCode', '休校コード'], '0')).trim();
  if (closeCode === '2' || closeCode === '9') return null;
  if (!['', '0', '1'].includes(closeCode)) throw new Error(`Unsupported closed-school code: ${closeCode}`);
  if (['16001', '16002', '16014'].includes(formalTypeCode) && ownership === 'municipal') return null;

  const geometry = feature?.geometry ?? {};
  if (geometry.type !== 'Point' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) return null;
  const [lng, lat] = geometry.coordinates.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const sourceName = String(first(properties, ['P29_004_ja', 'P29_004', 'name_ja', 'name', '名称'])).trim();
  if (!sourceName) return null;
  const schoolCode = String(first(properties, ['P29_002', 'SchoolCode', 'schoolCode', '学校コード'])).trim();
  const campusCode = String(first(properties, ['P29_008', 'CampusCode', 'campusCode', 'キャンパスコード'], '00')).trim() || '00';
  const campusName = String(first(properties, ['P29_009', 'CampusName', 'campusName', 'キャンパス名'])).trim();
  const id = `${schoolCode || 'unknown'}-${campusCode}`;
  if (EXCLUDED_INSTITUTION_IDS.has(id)) return null;
  const defaultDisplayName = DISPLAY_NAMES[sourceName] ?? sourceName;
  const displayName = DISPLAY_NAMES_BY_ID[id]
    ?? (types.includes('university') && campusName ? `${defaultDisplayName} ${campusName}` : defaultDisplayName);
  return {
    id,
    schoolCode,
    campusCode,
    campusName,
    sourceName,
    displayName,
    address: ADDRESSES_BY_ID[id] ?? fullAddress(sourceAddress),
    municipality,
    municipalityCode: String(first(properties, ['P29_001', 'administrativeAreaCode', '行政区域コード'])).trim(),
    lat,
    lng,
    types: [...types],
    formalTypeCode,
    formalTypeLabel: FORMAL_TYPE_LABELS[formalTypeCode],
    ownership,
    officialUrl: RECOVERED_OFFICIAL_URLS_BY_ID[id] ?? OFFICIAL_URLS_BY_ID[id] ?? OFFICIAL_URLS[sourceName] ?? null,
  };
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function commonCampusName(items) {
  const names = [...new Set(items.map(item => item.displayName))];
  if (names.length === 1) return names[0];
  const suffixes = ['中等教育学校', '義務教育学校', '短期大学部', '短期大学', '高等学校', '中学校', '小学校', '高等部', '中等部', '初等部', '大学'];
  const bases = names.map(name => {
    const suffix = suffixes.find(value => name.endsWith(value));
    return (suffix ? name.slice(0, -suffix.length) : name).replace(/[・ 　]+$/u, '');
  });
  if (new Set(bases).size === 1 && bases[0].length >= 2) {
    const formal = [...new Set(items.map(item => item.formalTypeLabel))];
    return `${bases[0]} ${formal.join('・')}`;
  }
  return names.join('／');
}

function buildOutput(features, sourceName, sourceSha256) {
  const sourceMunicipalities = new Set(features.map(feature => municipalityFromAddress(String(first(feature?.properties ?? {}, ['P29_005_ja', 'P29_005', 'location_ja', 'address', 'location', '所在地'])))).filter(Boolean));
  const missing = TARGET_MUNICIPALITIES.filter(value => !sourceMunicipalities.has(value));
  if (missing.length) throw new Error(`Input is missing target municipalities: ${missing.join(', ')}`);

  const institutions = features.map(featureToInstitution).filter(Boolean);
  if (institutions.length < 50) throw new Error(`Too few selected institutions: ${institutions.length}`);
  const institutionIds = new Set(institutions.map(item => item.id));
  const missingOfficialUrlIds = institutions.filter(item => !RECOVERED_OFFICIAL_URLS_BY_ID[item.id]).map(item => item.id);
  const unusedOfficialUrlIds = Object.keys(RECOVERED_OFFICIAL_URLS_BY_ID).filter(id => !institutionIds.has(id));
  if (missingOfficialUrlIds.length || unusedOfficialUrlIds.length) {
    throw new Error(`Official URL coverage mismatch: missing=${missingOfficialUrlIds.join(',')} unused=${unusedOfficialUrlIds.join(',')}`);
  }

  const groups = new Map();
  for (const item of institutions) {
    const key = `${item.municipality}:${normalizeAddress(item.address)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const campuses = [];
  let sequence = 1;
  for (const items of groups.values()) {
    items.sort((a, b) => TYPE_ORDER.indexOf(a.types[0]) - TYPE_ORDER.indexOf(b.types[0]) || compareText(a.displayName, b.displayName));
    const types = TYPE_ORDER.filter(kind => items.some(item => item.types.includes(kind)));
    const ownerships = Object.keys(OWNERSHIP_LABELS).filter(kind => items.some(item => item.ownership === kind));
    const firstItem = items[0];
    campuses.push({
      id: `campus-${String(sequence++).padStart(3, '0')}`,
      name: commonCampusName(items),
      address: firstItem.address,
      municipality: firstItem.municipality,
      lat: Number((items.reduce((sum, item) => sum + item.lat, 0) / items.length).toFixed(7)),
      lng: Number((items.reduce((sum, item) => sum + item.lng, 0) / items.length).toFixed(7)),
      types,
      ownerships,
      listings: (() => {
        const grouped = new Map();
        for (const item of items) {
          const key = JSON.stringify([item.displayName, item.types, item.formalTypeCode, item.ownership]);
          if (!grouped.has(key)) {
            grouped.set(key, {
              name: item.displayName,
              types: item.types,
              formalTypes: item.types.map(kind => ({ type: kind, code: item.formalTypeCode, label: item.formalTypeLabel })),
              ownerships: [item.ownership],
              officialUrl: item.officialUrl,
              institutionIds: [item.id],
            });
          } else {
            const listing = grouped.get(key);
            listing.institutionIds.push(item.id);
            if (!listing.officialUrl && item.officialUrl) listing.officialUrl = item.officialUrl;
          }
        }
        return [...grouped.values()];
      })(),
      officialUrl: items.find(item => item.officialUrl)?.officialUrl ?? null,
    });
  }
  campuses.sort((a, b) => compareText(a.municipality, b.municipality) || compareText(a.name, b.name));

  const countsByType = Object.fromEntries(TYPE_ORDER.map(kind => [kind, institutions.filter(item => item.types.includes(kind)).length]));
  const countsByMunicipality = Object.fromEntries(TARGET_MUNICIPALITIES.map(name => [name, institutions.filter(item => item.municipality === name).length]));
  return {
    meta: {
      title: '学校地図用データ',
      generatedAt: '2026-07-20',
      source: '国土数値情報 学校データ 2023年度版',
      sourcePage: SOURCE_PAGE,
      sourceFile: sourceName,
      sourceSha256,
      targetMunicipalities: TARGET_MUNICIPALITIES,
      sourceAdministrativeAreaCodes: [...new Set(institutions.map(item => item.municipalityCode))].sort(),
      typeLabels: TYPE_LABELS,
      ownershipLabels: OWNERSHIP_LABELS,
      institutionCount: institutions.length,
      campusCount: campuses.length,
      reviewedAt: '2026-07-20',
      reviewBasis: '文部科学省 学校コード一覧および各学校・大学の公式ページ',
      officialUrlSource: 'tools/school-official-url-overrides.json',
      officialUrlReferenceCount: institutions.length,
      officialUrlMissingCount: missingOfficialUrlIds.length,
      officialUrlUniqueCount: new Set(institutions.map(item => item.officialUrl)).size,
      countsByType,
      countsByMunicipality,
      selectionRule: '小中学校は市立を除外。高校と大学・短大は国立・県立・市立・私立を収録。保育施設・幼稚園・特別支援学校・専門学校等は除外。',
    },
    campuses,
  };
}

const args = parseArgs(process.argv.slice(2));
const sourcePath = path.resolve(args.source);
const outputPath = path.resolve(args.output);
const bytes = fs.readFileSync(sourcePath);
const sourceSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
const source = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, ''));
if (source.type !== 'FeatureCollection' || !Array.isArray(source.features)) throw new Error('Source is not a GeoJSON FeatureCollection.');
const output = buildOutput(source.features, path.basename(sourcePath), sourceSha256);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const shardSize = 50;
const shardFiles = [];
const shardCampusCounts = [];
for (let index = 0; index < output.campuses.length; index += shardSize) {
  const shardNumber = shardFiles.length + 1;
  const shardName = `${path.basename(outputPath, path.extname(outputPath))}-${String(shardNumber).padStart(2, '0')}${path.extname(outputPath) || '.json'}`;
  const shardPath = path.join(path.dirname(outputPath), shardName);
  const campuses = output.campuses.slice(index, index + shardSize);
  fs.writeFileSync(shardPath, `${JSON.stringify({ campuses })}\n`, 'utf8');
  shardFiles.push(shardName);
  shardCampusCounts.push(campuses.length);
}
const manifest = { meta: { ...output.meta, shardCampusCounts }, files: shardFiles };
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output: outputPath, shardFiles, shardCampusCounts, institutionCount: output.meta.institutionCount, campusCount: output.meta.campusCount, countsByType: output.meta.countsByType, countsByMunicipality: output.meta.countsByMunicipality, sourceSha256 }, null, 2));
