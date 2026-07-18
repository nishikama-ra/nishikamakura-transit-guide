const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

const MAP_CONFIG = {
  tileUrl: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',
  tileOptions: {
    maxZoom: 18,
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>'
  }
};

const VIEW_CONFIG = {
  local: { center: [35.3230, 139.5050], zoom: 14 },
  nearby: { center: [35.3300, 139.5050], zoom: 13 },
  wide: { center: [35.3475, 139.4950], zoom: 12 }
};

const typeColors = {
  nursery: '#b16f68', kindergarten: '#9a705f', elementary: '#4c8580', juniorHigh: '#55768a', high: '#55768a',
  specialSupport: '#8c7d52', university: '#756c89', vocational: '#756c89'
};
const typeShort = { nursery: '保', kindergarten: '幼', elementary: '小', juniorHigh: '中', high: '高', specialSupport: '支', university: '大', vocational: '専' };
const state = {
  data: null,
  map: null,
  scope: 'local',
  types: new Set(),
  ownership: 'all',
  markers: new Map(),
  visible: []
};

function syncMapTileTone() {
  const container = state.map.getContainer();
  const zoom = state.map.getZoom();
  container.classList.toggle('map-tone-detail', zoom === 15);
  container.classList.toggle('map-tone-close', zoom === 16);
  container.classList.toggle('map-tone-closest', zoom >= 17);
  container.dataset.tileTone = zoom >= 17 ? 'closest' : zoom === 16 ? 'close' : zoom === 15 ? 'detail' : 'normal';
}

async function loadData() {
  const response = await fetch('content/schools.json');
  if (!response.ok) throw new Error('学校データを読み込めませんでした');
  return response.json();
}

function readHash() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const scope = params.get('scope');
  if (VIEW_CONFIG[scope]) state.scope = scope;
  const ownership = params.get('ownership');
  if (['all', 'public', 'private'].includes(ownership)) state.ownership = ownership;
  return params.get('types')?.split(',').filter(Boolean) || [];
}

function writeHash() {
  const params = new URLSearchParams();
  params.set('scope', state.scope);
  if (state.types.size !== Object.keys(state.data.meta.typeLabels).length) params.set('types', [...state.types].join(','));
  if (state.ownership !== 'all') params.set('ownership', state.ownership);
  history.replaceState(null, '', `${location.pathname}${location.search}#${params}`);
}

function matchesOwnership(campus) {
  if (state.ownership === 'all') return true;
  if (state.ownership === 'private') return campus.ownerships.includes('private');
  return campus.ownerships.some(item => item !== 'private');
}

function visibleCampuses() {
  return state.data.campuses.filter(campus =>
    campus.viewModes.includes(state.scope)
    && campus.types.some(type => state.types.has(type))
    && matchesOwnership(campus)
  );
}

function markerLabel(campus) {
  const values = campus.types.map(type => typeShort[type]);
  return values.length <= 2 ? values.join('') : '複';
}

function markerClass(campus) {
  return campus.types.length > 2 ? 'marker-mixed' : `marker-${campus.types[0]}`;
}

function ownershipToneClass(campus) {
  return campus.ownerships.some(item => ['private', 'national'].includes(item))
    ? 'marker-tone-strong'
    : 'marker-tone-soft';
}

function ownershipText(campus) {
  return campus.ownerships.map(item => state.data.meta.ownershipLabels[item]).join('・');
}

function popupHtml(campus) {
  const listings = campus.listings
    .filter(item => item.types.some(type => state.types.has(type)))
    .map(item => `<li><strong>${escapeHtml(item.name)}</strong><br><span>${escapeHtml(item.types.filter(type => state.types.has(type)).map(type => state.data.meta.typeLabels[type]).join('・'))}・${escapeHtml(item.ownerships.map(ownership => state.data.meta.ownershipLabels[ownership]).join('・'))}</span><br>${item.officialUrl ? `<a href="${escapeHtml(item.officialUrl)}" target="_blank" rel="noopener">公式情報 ↗</a>` : '<span class="school-popup-unverified">公式情報未確認</span>'}</li>`)
    .join('');
  return `<div class="school-popup">
    <strong>${escapeHtml(campus.name)}</strong>
    <span class="school-popup-address">${escapeHtml(campus.address)}</span>
    <div class="school-popup-tags">
      ${campus.types.filter(type => state.types.has(type)).map(type => `<span>${escapeHtml(state.data.meta.typeLabels[type])}</span>`).join('')}
      <span>${escapeHtml(ownershipText(campus))}</span>
    </div>
    <ul>${listings}</ul>
  </div>`;
}

function clearMarkers() {
  state.markers.forEach(marker => marker.remove());
  state.markers.clear();
}

function fitSelectedView() {
  const view = VIEW_CONFIG[state.scope];
  state.map.setView(view.center, view.zoom, { animate: false });
  document.querySelector('#schoolMapMockup').dataset.viewZoom = String(view.zoom);
}

function focusCampus(id) {
  const campus = state.visible.find(item => item.id === id);
  const marker = state.markers.get(id);
  if (!campus || !marker) return;
  state.map.setView([campus.lat, campus.lng], Math.max(state.map.getZoom(), 16));
  marker.openPopup();
}

function renderList() {
  const count = state.visible.reduce((sum, campus) => sum + campus.listings.filter(item => item.types.some(type => state.types.has(type))).length, 0);
  document.querySelector('#schoolCount').textContent = `${state.visible.length}地点`;
  document.querySelector('#mapSummary').textContent = `${state.data.meta.scopeLabels[state.scope]}：${state.visible.length}マーカー・${count}施設`;
  document.querySelector('#schoolList').innerHTML = state.visible.length
    ? [...state.visible].sort((a, b) => a.name.localeCompare(b.name, 'ja')).map(campus => `
      <article class="school-list-item">
        <button type="button" data-campus-id="${escapeHtml(campus.id)}">
          <small>${escapeHtml(campus.types.filter(type => state.types.has(type)).map(type => state.data.meta.typeLabels[type]).join('・'))}／${escapeHtml(ownershipText(campus))}</small>
          <strong>${escapeHtml(campus.name)}</strong>
          <span>${escapeHtml(campus.address)}</span>
        </button>
      </article>`).join('')
    : '<p class="load-error">条件に合う施設がありません。</p>';
  document.querySelectorAll('[data-campus-id]').forEach(button => button.addEventListener('click', () => focusCampus(button.dataset.campusId)));
}

function renderMap({ fit = false } = {}) {
  state.visible = visibleCampuses();
  clearMarkers();
  state.visible.forEach(campus => {
    const icon = L.divIcon({
      className: 'school-marker-shell',
      html: `<span class="school-marker ${markerClass(campus)} ${ownershipToneClass(campus)}"><b>${escapeHtml(markerLabel(campus))}</b></span>`,
      iconSize: [34, 34],
      iconAnchor: [17, 32],
      popupAnchor: [0, -29]
    });
    const marker = L.marker([campus.lat, campus.lng], { icon, title: campus.name, riseOnHover: true })
      .addTo(state.map)
      .bindPopup(popupHtml(campus), { maxWidth: 310 });
    state.markers.set(campus.id, marker);
  });
  renderList();
  if (fit) fitSelectedView();
  writeHash();
}

function syncPressedStates() {
  document.querySelectorAll('[data-scope]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scope === state.scope)));
  document.querySelectorAll('[data-ownership]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.ownership === state.ownership)));
  document.querySelectorAll('[data-school-type]').forEach(button => button.setAttribute('aria-pressed', String(state.types.has(button.dataset.schoolType))));
}

function renderFilters() {
  document.querySelector('#typeFilters').innerHTML = Object.entries(state.data.meta.typeLabels).map(([id, label]) => `
    <button type="button" class="school-type-chip" data-school-type="${id}" aria-pressed="${state.types.has(id)}" style="--chip-color:${typeColors[id]}">${escapeHtml(label)}</button>`).join('');
  document.querySelectorAll('[data-scope]').forEach(button => button.addEventListener('click', () => {
    state.scope = button.dataset.scope;
    syncPressedStates();
    renderMap({ fit: true });
  }));
  document.querySelectorAll('[data-ownership]').forEach(button => button.addEventListener('click', () => {
    state.ownership = button.dataset.ownership;
    syncPressedStates();
    renderMap();
  }));
  document.querySelectorAll('[data-school-type]').forEach(button => button.addEventListener('click', () => {
    const type = button.dataset.schoolType;
    if (state.types.has(type) && state.types.size > 1) state.types.delete(type);
    else state.types.add(type);
    syncPressedStates();
    renderMap();
  }));
  document.querySelector('#resetFilters').addEventListener('click', () => {
    state.types = new Set(Object.keys(state.data.meta.typeLabels));
    syncPressedStates();
    renderMap();
  });
  syncPressedStates();
}

async function init() {
  if (!window.L) throw new Error('地図ライブラリを読み込めませんでした');
  state.data = await loadData();
  const requestedTypes = readHash();
  const validTypes = Object.keys(state.data.meta.typeLabels);
  state.types = new Set(requestedTypes.filter(type => validTypes.includes(type)));
  if (!state.types.size) state.types = new Set(validTypes);
  state.map = L.map('schoolMapMockup', { scrollWheelZoom: true, zoomControl: true })
    .setView(VIEW_CONFIG[state.scope].center, VIEW_CONFIG[state.scope].zoom);
  L.tileLayer(MAP_CONFIG.tileUrl, MAP_CONFIG.tileOptions).addTo(state.map);
  state.map.on('zoomend', syncMapTileTone);
  syncMapTileTone();
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(state.map);
  renderFilters();
  renderMap({ fit: true });
}

init().catch(error => {
  document.querySelector('#schoolMapMockup').innerHTML = `<p class="load-error">${escapeHtml(error.message)}。ローカルHTTPサーバーから開いてください。</p>`;
});
