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

// The wide view is fixed from the supplied reference screenshot. At the desktop map width,
// the Yokohama Station label sits near the top while the three required coastal schools remain visible.
const VIEW_CONFIG = {
  local: { center: [35.3230, 139.5050], zoom: 14 },
  nearby: { center: [35.3300, 139.5050], zoom: 13 },
  wide: { center: [35.3860, 139.5840], zoom: 12 }
};

const FOCUS_AREA = {
  center: [35.3190, 139.5030],
  radiusMeters: 2400
};

const typeColors = {
  elementary: '#4c8580',
  juniorHigh: '#55768a',
  high: '#55768a',
  university: '#756c89'
};
const typeShort = { elementary: '小', juniorHigh: '中', high: '高', university: '大' };
const state = {
  data: null,
  map: null,
  scope: 'wide',
  types: new Set(),
  ownership: 'all',
  markers: new Map(),
  visible: [],
  routeOrigin: null,
  routeOriginMarker: null,
  focusAreaCircle: null,
  selectingRouteOrigin: false
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
  const manifest = await response.json();
  if (!Array.isArray(manifest.files)) return manifest;
  const parts = await Promise.all(manifest.files.map(async file => {
    const partResponse = await fetch(`content/${file}`);
    if (!partResponse.ok) throw new Error(`学校データを読み込めませんでした: ${file}`);
    return partResponse.json();
  }));
  return {
    meta: manifest.meta,
    campuses: parts.flatMap(part => part.campuses || [])
  };
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

function listingMatchesOwnership(listing) {
  if (state.ownership === 'all') return true;
  if (state.ownership === 'private') return listing.ownerships.includes('private');
  return listing.ownerships.some(item => item !== 'private');
}

function activeListings(campus) {
  return campus.listings.filter(item =>
    item.types.some(type => state.types.has(type)) && listingMatchesOwnership(item)
  );
}

function visibleCampuses() {
  // The range selector changes only the viewport. It never removes schools from the data set.
  return state.data.campuses.filter(campus => activeListings(campus).length > 0);
}

function activeCampusTypes(campus) {
  return [...new Set(activeListings(campus).flatMap(item => item.types))]
    .filter(type => state.types.has(type));
}

function activeCampusOwnerships(campus) {
  return [...new Set(activeListings(campus).flatMap(item => item.ownerships))];
}

function markerLabel(campus) {
  const values = activeCampusTypes(campus).map(type => typeShort[type]);
  return values.length <= 2 ? values.join('') : '複';
}

function markerClass(campus) {
  const activeTypes = activeCampusTypes(campus);
  return activeTypes.length > 1 ? 'marker-mixed' : `marker-${activeTypes[0] || campus.types[0]}`;
}

function ownershipToneClass(campus) {
  return activeCampusOwnerships(campus).some(item => ['private', 'national'].includes(item))
    ? 'marker-tone-strong'
    : 'marker-tone-soft';
}

function ownershipText(campus) {
  return activeCampusOwnerships(campus).map(item => state.data.meta.ownershipLabels[item]).join('・');
}

function googleTransitUrl(campus) {
  const params = new URLSearchParams({
    api: '1',
    destination: `${campus.lat},${campus.lng}`,
    travelmode: 'transit'
  });
  if (state.routeOrigin) params.set('origin', `${state.routeOrigin.lat},${state.routeOrigin.lng}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function popupHtml(campus) {
  const listings = activeListings(campus)
    .map(item => `<li><strong>${escapeHtml(item.name)}</strong><br><span>${escapeHtml(item.formalTypes.filter(formalType => state.types.has(formalType.type)).map(formalType => formalType.label).join('・'))}・${escapeHtml(item.ownerships.map(ownership => state.data.meta.ownershipLabels[ownership]).join('・'))}</span>${item.officialUrl ? `<br><a href="${escapeHtml(item.officialUrl)}" target="_blank" rel="noopener">公式情報 ↗</a>` : ''}</li>`)
    .join('');
  return `<div class="school-popup">
    <strong>${escapeHtml(campus.name)}</strong>
    <span class="school-popup-address">${escapeHtml(campus.address)}</span>
    <div class="school-popup-tags">
      ${activeCampusTypes(campus).map(type => `<span>${escapeHtml(state.data.meta.typeLabels[type])}</span>`).join('')}
      <span>${escapeHtml(ownershipText(campus))}</span>
    </div>
    <ul>${listings}</ul>
    <a class="school-transit-link" href="${escapeHtml(googleTransitUrl(campus))}" target="_blank" rel="noopener">GoogleMapでルートを見る ↗</a>
  </div>`;
}

function clearMarkers() {
  state.markers.forEach(marker => marker.remove());
  state.markers.clear();
}

function syncFocusAreaVisibility() {
  if (!state.focusAreaCircle) return;
  const shouldShow = state.scope === 'wide';
  const isShown = state.map.hasLayer(state.focusAreaCircle);
  if (shouldShow && !isShown) state.focusAreaCircle.addTo(state.map);
  if (!shouldShow && isShown) state.focusAreaCircle.remove();
}

function fitSelectedView() {
  const view = VIEW_CONFIG[state.scope];
  state.map.setView(view.center, view.zoom, { animate: false });
  document.querySelector('#schoolMapMockup').dataset.viewZoom = String(view.zoom);
  syncFocusAreaVisibility();
}

function focusCampus(id) {
  const campus = state.visible.find(item => item.id === id);
  const marker = state.markers.get(id);
  if (!campus || !marker) return;
  state.map.setView([campus.lat, campus.lng], Math.max(state.map.getZoom(), 16));
  marker.openPopup();
}

function renderList() {
  document.querySelector('#schoolCount').textContent = `${state.visible.length}地点`;
  document.querySelector('#schoolList').innerHTML = state.visible.length
    ? [...state.visible].sort((a, b) => a.name.localeCompare(b.name, 'ja')).map(campus => `
      <article class="school-list-item">
        <button type="button" data-campus-id="${escapeHtml(campus.id)}">
          <small>${escapeHtml(campus.types.filter(type => state.types.has(type)).map(type => state.data.meta.typeLabels[type]).join('・'))}／${escapeHtml(ownershipText(campus))}</small>
          <strong>${escapeHtml(campus.name)}</strong>
          <span>${escapeHtml(campus.address)}</span>
        </button>
        <a class="school-list-transit-link" href="${escapeHtml(googleTransitUrl(campus))}" target="_blank" rel="noopener">GoogleMapでルートを見る ↗</a>
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
    const marker = L.marker([campus.lat, campus.lng], { pane: 'schoolMarkerPane', icon, title: campus.name, riseOnHover: true })
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

function updateRouteOriginUi() {
  const selectButton = document.querySelector('#selectRouteOrigin');
  const clearButton = document.querySelector('#clearRouteOrigin');
  const status = document.querySelector('#routeOriginStatus');
  selectButton.setAttribute('aria-pressed', String(state.selectingRouteOrigin));
  selectButton.textContent = state.selectingRouteOrigin ? '地図上の出発地をクリック' : '出発地を地図で指定';
  clearButton.hidden = !state.routeOrigin;
  status.textContent = state.routeOrigin
    ? `出発地：${state.routeOrigin.lat.toFixed(5)}, ${state.routeOrigin.lng.toFixed(5)}`
    : '出発地未指定（Googleマップ側でも指定できます）';
  state.map.getContainer().classList.toggle('is-selecting-route-origin', state.selectingRouteOrigin);
}

function setRouteOrigin(latlng) {
  state.routeOrigin = { lat: latlng.lat, lng: latlng.lng };
  if (state.routeOriginMarker) state.routeOriginMarker.remove();
  state.routeOriginMarker = L.circleMarker(latlng, {
    pane: 'routeOriginPane',
    radius: 8,
    color: '#17385d',
    weight: 3,
    fillColor: '#fff',
    fillOpacity: 1,
    interactive: false
  }).addTo(state.map);
  state.selectingRouteOrigin = false;
  updateRouteOriginUi();
  renderMap();
}

function clearRouteOrigin() {
  state.routeOrigin = null;
  state.selectingRouteOrigin = false;
  if (state.routeOriginMarker) state.routeOriginMarker.remove();
  state.routeOriginMarker = null;
  updateRouteOriginUi();
  renderMap();
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

function initRouteOriginControls() {
  document.querySelector('#selectRouteOrigin').addEventListener('click', () => {
    state.selectingRouteOrigin = !state.selectingRouteOrigin;
    updateRouteOriginUi();
  });
  document.querySelector('#clearRouteOrigin').addEventListener('click', clearRouteOrigin);
  state.map.on('click', event => {
    if (!state.selectingRouteOrigin) return;
    setRouteOrigin(event.latlng);
  });
  updateRouteOriginUi();
}

function addFocusArea() {
  state.map.createPane('focusAreaPane');
  state.map.getPane('focusAreaPane').style.zIndex = '350';
  state.map.createPane('schoolMarkerPane');
  state.map.getPane('schoolMarkerPane').style.zIndex = '600';
  state.map.createPane('routeOriginPane');
  state.map.getPane('routeOriginPane').style.zIndex = '650';
  state.focusAreaCircle = L.circle(FOCUS_AREA.center, {
    pane: 'focusAreaPane',
    radius: FOCUS_AREA.radiusMeters,
    color: '#d96f6f',
    weight: 1.5,
    opacity: 0.48,
    fillColor: '#e88989',
    fillOpacity: 0.22,
    interactive: false
  });
  syncFocusAreaVisibility();
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
  addFocusArea();
  state.map.on('zoomend', syncMapTileTone);
  syncMapTileTone();
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(state.map);
  renderFilters();
  initRouteOriginControls();
  renderMap({ fit: true });
}

init().catch(error => {
  document.querySelector('#schoolMapMockup').innerHTML = `<p class="load-error">${escapeHtml(error.message)}。ローカルHTTPサーバーから開いてください。</p>`;
});
