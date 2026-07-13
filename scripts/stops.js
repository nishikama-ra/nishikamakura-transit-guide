const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const hubNames = { F: '藤沢へ', O: '大船へ', K: '鎌倉へ' };
let stops = [];

function renderStops() {
  const area = document.querySelector('#areaFilter').value;
  const query = document.querySelector('#stopSearch').value.trim().toLowerCase();
  const shown = stops.filter(stop => (!area || stop.d === area) && (!query || stop.n.toLowerCase().includes(query)));
  document.querySelector('#stopCount').textContent = `${shown.length}地点`;
  document.querySelector('#stopList').innerHTML = shown.map(stop => {
    const hubs = Object.entries(stop.hubs || {});
    return `<article class="stop-card"><header><small>${escapeHtml(stop.d)}・${stop.type === 'rail' ? '駅' : 'バス停'}</small><h2>${escapeHtml(stop.n)}</h2></header><div class="hub-grid">${hubs.length ? hubs.map(([key, item]) => `<section><h3>${hubNames[key]}</h3><dl><div><dt>平日の便数</dt><dd>${escapeHtml(item.t)}便</dd></div><div><dt>始発の目安</dt><dd>${escapeHtml(item.fs)}</dd></div><div><dt>最終の目安</dt><dd>${escapeHtml(item.ls)}</dd></div></dl></section>`).join('') : '<p>この地点から藤沢・大船・鎌倉へ向かう集計値はありません。</p>'}</div>${stop.tt ? `<a class="text-link" href="${escapeHtml(stop.tt)}" target="_blank" rel="noopener">公式時刻表を見る ↗</a>` : ''}</article>`;
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
