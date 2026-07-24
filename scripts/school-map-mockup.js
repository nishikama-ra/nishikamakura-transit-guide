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

const ALL_VIEW_MODES = ['local', 'nearby', 'wide'];
const LOCAL_VIEW_ONLY = ['local'];
const MOBILE_WIDE_BREAKPOINT = 640;
const MOBILE_WIDE_MARGIN = 18;

const typeColors = {
  nursery: '#b16f68',
  kindergarten: '#9a705f',
  elementary: '#4c8580',
  juniorHigh: '#55768a',
  high: '#55768a',
  specialSupport: '#8c7d52',
  university: '#756c89',
  vocational: '#756c89'
};
const typeShort = {
  nursery: '保',
  kindergarten: '幼',
  elementary: '小',
  juniorHigh: '中',
  high: '高',
  specialSupport: '支',
  university: '大',
  vocational: '専'
};
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

async function loadSchoolData(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`学校データを読み込めませんでした: ${path}`);
  const manifest = await response.json();
  if (!Array.isArray(manifest.files)) return manifest;
  const base = path.slice(0, path.lastIndexOf('/') + 1);
  const parts = await Promise.all(manifest.files.map(async file => {
    const partResponse = await fetch(`${base}${file}`);
    if (!partResponse.ok) throw new Error(`学校データを読み込めませんでした: ${file}`);
    return partResponse.json();
  }));
  return {
    meta: manifest.meta,
    campuses: parts.flatMap(part => part.campuses || [])
  };
}

function normalizeAddress(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/^神奈川県/u, '')
    .replace(/[\s　丁目番地号−ー‐‑–—・,，.．]/gu, '')
    .toLowerCase();
}

function normalizeSchoolName(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/^(?:学校法人)?(?:神奈川県立|県立|鎌倉市立|藤沢市立|横浜市立|市立)/u, '')
    .replace(/高等学校/gu, '高校')
    .replace(/[\s　・,，.．()（）]/gu, '')
    .toLowerCase();
}

function campusNames(campus) {
  return [campus.name, ...(campus.listings || []).map(listing => listing.name)]
    .map(normalizeSchoolName)
    .filter(Boolean);
}

function campusInstitutionIds(campus) {
  return new Set([
    ...(campus.institutions || []).map(institution => institution.id),
    ...(campus.listings || []).flatMap(listing => listing.institutionIds || [])
  ].filter(Boolean));
}

function distanceMeters(a, b) {
  const radians = degrees => degrees * Math.PI / 180;
  const lat1 = radians(Number(a.lat));
  const lat2 = radians(Number(b.lat));
  const deltaLat = lat2 - lat1;
  const deltaLng = radians(Number(b.lng) - Number(a.lng));
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function hasTypeOverlap(a, b) {
  const bTypes = new Set(b.types || []);
  return (a.types || []).some(type => bTypes.has(type));
}

function isSameCampus(localCampus, broadCampus) {
  if (!hasTypeOverlap(localCampus, broadCampus)) return false;

  const localIds = campusInstitutionIds(localCampus);
  const broadIds = campusInstitutionIds(broadCampus);
  if ([...localIds].some(id => broadIds.has(id))) return true;

  const localAddress = normalizeAddress(localCampus.address);
  const broadAddress = normalizeAddress(broadCampus.address);
  if (localAddress && localAddress === broadAddress) return true;

  const broadNames = new Set(campusNames(broadCampus));
  const sameName = campusNames(localCampus).some(name => broadNames.has(name));
  if (sameName && distanceMeters(localCampus, broadCampus) <= 1500) return true;

  return distanceMeters(localCampus, broadCampus) <= 80;
}

function normalizeLocalData(data) {
  const oldAddress = '神奈川県藤沢市鵜沼松が岡4-1-32';
  const newAddress = '神奈川県藤沢市鵠沼松が岡4-1-32';
  data.campuses.forEach(campus => {
    if (campus.address === oldAddress) campus.address = newAddress;
    campus.institutions?.forEach(institution => {
      if (institution.address === oldAddress) institution.address = newAddress;
      if (institution.sourceAddress === oldAddress) institution.sourceAddress = newAddress;
    });
  });
  return data;
}

function campusOwnerships(campus) {
  return new Set(campus.ownerships || campus.listings?.flatMap(listing => listing.ownerships || []) || []);
}

function isMunicipalElementaryOrJuniorHigh(campus) {
  const ownerships = campusOwnerships(campus);
  const types = new Set(campus.types || []);
  return ownerships.has('municipal') && (types.has('elementary') || types.has('juniorHigh'));
}

function isChildcareCampus(campus) {
  return (campus.types || []).some(type => type === 'nursery' || type === 'kindergarten');
}

function viewModesForCampus(campus) {
  return isChildcareCampus(campus) || isMunicipalElementaryOrJuniorHigh(campus)
    ? [...LOCAL_VIEW_ONLY]
    : [...ALL_VIEW_MODES];
}

function mergeSchoolData(broadData, localData) {
  const normalizedLocal = normalizeLocalData(localData).campuses;
  const broadCampuses = broadData.campuses.map(campus => ({
    ...campus,
    viewModes: [...ALL_VIEW_MODES]
  }));
  const additionalLocalCampuses = normalizedLocal
    .filter(localCampus => !broadCampuses.some(broadCampus => isSameCampus(localCampus, broadCampus)))
    .map(campus => ({
      ...campus,
      viewModes: viewModesForCampus(campus)
    }));

  const typeOrder = ['nursery', 'kindergarten', 'elementary', 'juniorHigh', 'high', 'specialSupport', 'university', 'vocational'];
  const sourceTypeLabels = {
    ...(localData.meta?.typeLabels || {}),
    ...(broadData.meta?.typeLabels || {})
  };
  const typeLabels = Object.fromEntries(typeOrder
    .filter(type => sourceTypeLabels[type])
    .map(type => [type, sourceTypeLabels[type]]));

  const campuses = [...broadCampuses, ...additionalLocalCampuses];
  return {
    meta: {
      ...broadData.meta,
      typeLabels,
      ownershipLabels: {
        ...(localData.meta?.ownershipLabels || {}),
        ...(broadData.meta?.ownershipLabels || {})
      },
      localOnlyCampusCount: campuses.filter(campus => campus.viewModes.length === 1 && campus.viewModes[0] === 'local').length
    },
    campuses
  };
}

async function loadData() {
  const [broadData, localData] = await Promise.all([
    loadSchoolData('content/schools.json'),
    loadSchoolData('content/education-nearby.json')
  ]);
  return mergeSchoolData(broadData, localData);
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
  return state.data.campuses.filter(campus =>
    campus.viewModes.includes(state.scope) && activeListings(campus).length > 0
  );
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

const OFFICIAL_LINK_NAME_SUFFIXES = ['中等教育学校', '義務教育学校', '短期大学部', '短期大学', '高等学校', '中学校', '小学校', '高等部', '中等部', '初等部', '大学'];

// 中高一貫など、対外呼称・URLが同じ複数の掲載を1つの公式リンクにまとめるためのラベル生成。
// 例: ['聖ヨゼフ学園中学校', '聖ヨゼフ学園高等学校'] → '聖ヨゼフ学園中学校・高等学校'
function combineListingNames(names) {
  if (names.length <= 1) return names[0] || '';
  const parts = names.map(name => {
    const suffix = OFFICIAL_LINK_NAME_SUFFIXES.find(value => name.endsWith(value));
    return { base: suffix ? name.slice(0, -suffix.length) : name, suffix: suffix || '' };
  });
  const base = parts[0].base;
  if (base && parts.every(part => part.base === base && part.suffix)) {
    return `${base}${parts.map(part => part.suffix).join('・')}`;
  }
  return names.join('／');
}

// 表示中の掲載を公式URLごとに束ねる。同一URLは1リンクに集約し、URLが異なるものだけ分けて出す。
function officialLinkGroups(campus) {
  const groups = [];
  const byUrl = new Map();
  for (const item of activeListings(campus)) {
    if (!item.officialUrl) continue;
    if (!byUrl.has(item.officialUrl)) {
      const group = { url: item.officialUrl, names: [] };
      byUrl.set(item.officialUrl, group);
      groups.push(group);
    }
    byUrl.get(item.officialUrl).names.push(item.name);
  }
  return groups;
}

function officialLinkAnchors(campus, className) {
  const groups = officialLinkGroups(campus);
  return groups.map(group => {
    const label = groups.length > 1 ? `${combineListingNames(group.names)} 公式情報 ↗` : '公式情報 ↗';
    return `<a class="${className}" href="${escapeHtml(group.url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
  }).join('');
}

function popupHtml(campus) {
  const listings = activeListings(campus)
    .map(item => `<li><strong>${escapeHtml(item.name)}</strong><br><span>${escapeHtml(item.formalTypes.filter(formalType => state.types.has(formalType.type)).map(formalType => formalType.label).join('・'))}・${escapeHtml(item.ownerships.map(ownership => state.data.meta.ownershipLabels[ownership]).join('・'))}</span></li>`)
    .join('');
  const links = officialLinkAnchors(campus, 'school-popup-official-link');
  return `<div class="school-popup">
    <strong>${escapeHtml(campus.name)}</strong>
    <span class="school-popup-address">${escapeHtml(campus.address)}</span>
    <div class="school-popup-tags">
      ${activeCampusTypes(campus).map(type => `<span>${escapeHtml(state.data.meta.typeLabels[type])}</span>`).join('')}
      <span>${escapeHtml(ownershipText(campus))}</span>
    </div>
    <ul>${listings}</ul>
    ${links ? `<div class="school-popup-links">${links}</div>` : ''}
    <a class="school-transit-link" href="${escapeHtml(googleTransitUrl(campus))}" target="_blank" rel="noopener">GoogleMapでルートを見る ↗</a>
  </div>`;
}

function officialLinksHtml(campus) {
  return officialLinkAnchors(campus, 'school-list-official-link');
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

function mobileWideView() {
  const zoom = VIEW_CONFIG.wide.zoom;
  const mapSize = state.map.getSize();
  const focusBounds = state.focusAreaCircle.getBounds();
  const northWest = state.map.project(focusBounds.getNorthWest(), zoom);
  const southEast = state.map.project(focusBounds.getSouthEast(), zoom);
  const radiusX = (southEast.x - northWest.x) / 2;
  const radiusY = (southEast.y - northWest.y) / 2;
  const minX = radiusX + MOBILE_WIDE_MARGIN;
  const maxX = mapSize.x - radiusX - MOBILE_WIDE_MARGIN;
  const minY = radiusY + MOBILE_WIDE_MARGIN;
  const maxY = mapSize.y - radiusY - MOBILE_WIDE_MARGIN;
  const targetPoint = L.point(
    minX <= maxX ? minX : mapSize.x / 2,
    minY <= maxY ? maxY : mapSize.y / 2
  );
  const focusPoint = state.map.project(FOCUS_AREA.center, zoom);
  const centerPoint = focusPoint.add(L.point(
    mapSize.x / 2 - targetPoint.x,
    mapSize.y / 2 - targetPoint.y
  ));
  return { center: state.map.unproject(centerPoint, zoom), zoom };
}

function selectedView() {
  return state.scope === 'wide' && window.matchMedia(`(max-width: ${MOBILE_WIDE_BREAKPOINT}px)`).matches
    ? mobileWideView()
    : VIEW_CONFIG[state.scope];
}

function fitSelectedView() {
  const view = selectedView();
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
        <div class="school-list-links">
          ${officialLinksHtml(campus)}
          <a class="school-list-transit-link" href="${escapeHtml(googleTransitUrl(campus))}" target="_blank" rel="noopener">GoogleMapでルートを見る ↗</a>
        </div>
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
