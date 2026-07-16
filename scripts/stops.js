const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const hubNames = { F: '藤沢へ', O: '大船へ', K: '鎌倉へ' };
const routeNames = { KQ4: '鎌4' };
const stopCollator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });
const stopReadings = {
  'かながわ女性センター': 'かながわじょせいせんたー', 'アカシヤ並木': 'あかしやなみき', 'コープ前': 'こーぷまえ',
  '七里ガ浜桜のプロムナード前': 'しちりがはまさくらのぷろむなーどまえ', '七里ヶ浜': 'しちりがはま', '七里ヶ浜駅': 'しちりがはまえき', '七高正門前': 'しちこうせいもんまえ',
  '三菱電機北門': 'みつびしでんききたもん', '中川': 'なかがわ', '丸山一番通り': 'まるやまいちばんどおり', '丸山四番通り': 'まるやまよんばんどおり',
  '亀井': 'かめい', '住吉': 'すみよし', '八丁面': 'はっちょうめん', '八反目': 'はったんめ', '八雲神社前': 'やくもじんじゃまえ',
  '古館橋': 'ふるたてばし', '夕陽ガ丘通り': 'ゆうひがおかどおり', '大平山公園': 'たいへいざんこうえん', '大船工場': 'おおふなこうじょう',
  '奥七里通り': 'おくしちりどおり', '富士見台': 'ふじみだい', '小動': 'こゆるぎ', '山の上ロータリー': 'やまのうえろーたりー',
  '山崎': 'やまざき', '常盤口': 'ときわぐち', '手広': 'てびろ', '教養センター': 'きょうようせんたー', '新屋敷': 'しんやしき',
  '新鎌倉山１番': 'しんかまくらやまいちばん', '日当': 'ひなた', '旭ケ丘': 'あさひがおか', '朝日通り': 'あさひどおり', '東浜': 'ひがしはま',
  '梶原口': 'かじわらぐち', '梶原': 'かじわら', '江ノ島': 'えのしま', '江ノ島海岸': 'えのしまかいがん', '江ノ島駅前': 'えのしまえきまえ',
  '津村': 'つむら', '深沢': 'ふかさわ', '深沢中学上': 'ふかさわちゅうがくうえ', '深沢小学校前': 'ふかさわしょうがっこうまえ',
  '湘南深沢': 'しょうなんふかさわ', '湘南港桟橋': 'しょうなんこうさんばし', '湘南記念病院': 'しょうなんきねんびょういん',
  '湘南鎌倉医療大学前': 'しょうなんかまくらいりょうだいがくまえ', '潮騒通り': 'しおさいどおり', '片瀬中学校前': 'かたせちゅうがっこうまえ',
  '片瀬山': 'かたせやま', '片瀬山入口': 'かたせやまいりぐち', '田辺広町': 'たなべひろまち', '町屋入口': 'まちやいりぐち',
  '町屋橋': 'まちやばし', '白山橋': 'はくさんばし', '神戸製鋼前': 'こうべせいこうまえ', '竜口寺': 'りゅうこうじ',
  '笛田１番': 'ふえだいちばん', '笛田２番': 'ふえだにばん', '笛田３番': 'ふえださんばん', '笛田４番': 'ふえだよんばん', '笛田': 'ふえだ',
  '笹田': 'ささだ', '老健かまくら': 'ろうけんかまくら', '腰越中学校入口': 'こしごえちゅうがっこういりぐち',
  '腰越海岸': 'こしごえかいがん', '腰越駅': 'こしごええき', '自治会館前': 'じちかいかんまえ', '行合坂': 'ゆきあいざか',
  '西ヶ谷': 'にしがや', '西方': 'にしかた', '西梶原': 'にしかじわら', '西鎌倉': 'にしかまくら', '西鎌倉入口': 'にしかまくらいりぐち',
  '見晴': 'みはらし', '諏訪ヶ谷': 'すわがや', '諏訪神社前': 'すわじんじゃまえ', '赤羽': 'あかばね', '郵便局前': 'ゆうびんきょくまえ',
  '鎌倉中央公園': 'かまくらちゅうおうこうえん', '鎌倉中央公園入口': 'かまくらちゅうおうこうえんいりぐち', '鎌倉山': 'かまくらやま',
  '鎖大師': 'くさりだいし', '長島': 'ながしま', '高砂': 'たかさご', '龍口明神社前': 'りゅうこうみょうじんしゃまえ',
  'S字坂下': 'えすじざかした', '一向堂': 'いっこうどう', '仲ノ坂': 'なかのさか', '天神下': 'てんじんした', '山の上中央': 'やまのうえちゅうおう',
  '打越': 'うちこし', '日当公園': 'ひなたこうえん', '東梶原': 'ひがしかじわら', '桔梗山': 'ききょうやま', '源氏山入口': 'げんじやまいりぐち',
  '火の見下': 'ひのみした', '若松': 'わかまつ', '鎌倉武道館前': 'かまくらぶどうかんまえ', '岩屋不動入口': 'いわやふどういりぐち',
  'ミネベアミツミ前': 'みねべあみつみまえ', '石上駅': 'いしがみえき', '柳小路駅': 'やなぎこうじえき', '鵠沼駅': 'くげぬまえき',
  '湘南海岸公園駅': 'しょうなんかいがんこうえんえき', '江ノ島駅（江ノ電）': 'えのしまえきえのでん', '腰越駅（江ノ電）': 'こしごええきえのでん',
  '鎌倉高校前駅': 'かまくらこうこうまええき', '七里ヶ浜駅（江ノ電）': 'しちりがはまえきえのでん', '稲村ヶ崎駅': 'いなむらがさきえき',
  '富士見町駅': 'ふじみちょうえき', '湘南町屋駅': 'しょうなんまちやえき', '湘南深沢駅': 'しょうなんふかさわえき',
  '西鎌倉駅': 'にしかまくらえき', '片瀬山駅': 'かたせやまえき', '目白山下駅': 'めじろやましたえき',
  '湘南江の島駅': 'しょうなんえのしまえき', '片瀬江ノ島駅': 'かたせえのしまえき'
};
let stops = [];

function renderStops() {
  const area = document.querySelector('#areaFilter').value;
  const query = document.querySelector('#stopSearch').value.trim().toLowerCase();
  const shown = stops
    .filter(stop => (!area || stop.d === area) && (!query || stop.n.toLowerCase().includes(query)))
    .sort((a, b) => (a.type === b.type ? stopCollator.compare(stopReadings[a.n] || a.n, stopReadings[b.n] || b.n) : a.type === 'bus' ? -1 : 1));
  const busCount = shown.filter(stop => stop.type === 'bus').length;
  const railCount = shown.length - busCount;
  document.querySelector('#stopCount').textContent = `${busCount ? `バス停 ${busCount}件` : ''}${busCount && railCount ? '・' : ''}${railCount ? `駅 ${railCount}件` : ''}（五十音順）`;
  document.querySelector('#stopList').innerHTML = shown.map(stop => {
    const hubs = Object.entries(stop.hubs || {});
    const timetables = stop.timetables || [];
    const routes = stop.type === 'bus' ? (stop.routes || []).map(route => routeNames[route] || route).sort(stopCollator.compare) : [];
    return `<article class="stop-card">
      <header><small>${stop.type === 'rail' ? '駅' : 'バス停'}</small><h2>${escapeHtml(stop.n)}</h2>${routes.length ? `<p class="stop-routes"><span>停車する系統</span>${routes.map(route => `<strong>${escapeHtml(route)}</strong>`).join('')}</p>` : ''}</header>
      <div class="hub-grid">${hubs.map(([key, item]) => `<section><h3>${hubNames[key]}</h3><dl><div><dt>平日の便数</dt><dd>${escapeHtml(item.t)}便</dd></div><div><dt>最初の便</dt><dd>${escapeHtml(item.fs)}</dd></div><div><dt>最後の便</dt><dd>${escapeHtml(item.ls)}</dd></div></dl></section>`).join('')}</div>
      <div class="stop-timetable-links">${timetables.length ? timetables.map(item => `<a href="${escapeHtml(item.href)}" target="_blank" rel="noopener"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.operator)}公式 ↗</span></a>`).join('') : '<p>個別の公式時刻表リンクは確認できていません。</p>'}</div>
    </article>`;
  }).join('');
}

fetch('content/stopdata.json').then(response => {
  if (!response.ok) throw new Error();
  return response.json();
}).then(data => {
  stops = data;
  const areas = [...new Set(stops.map(stop => stop.d))].sort((a, b) => a.localeCompare(b, 'ja'));
  document.querySelector('#areaFilter').insertAdjacentHTML('beforeend', areas.map(area => `<option>${escapeHtml(area)}</option>`).join(''));
  document.querySelector('#areaFilter').addEventListener('change', renderStops);
  document.querySelector('#stopSearch').addEventListener('input', renderStops);
  renderStops();
}).catch(() => {
  document.querySelector('#stopList').innerHTML = '<p class="load-error">運行情報を読み込めませんでした。ローカルサーバーから開いてください。</p>';
});
