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

// The focus area is shown only in the wide view. The coordinates are isolated here so
// the final visual alignment can be adjusted without changing any school data.
const FOCUS_AREA = {
  center: [35.3150, 139.4850],
  radiusMeters: 3000
};

const FORMAL_TYPE_DEFS = {
  '16001': { label: '小学校', types: ['elementary'] },
  '16002': { label: '中学校', types: ['juniorHigh'] },
  '16003': { label: '中等教育学校', types: ['juniorHigh', 'high'] },
  '16004': { label: '高等学校', types: ['high'] },
  '16006': { label: '短期大学', types: ['university'] },
  '16007': { label: '大学', types: ['university'] },
  '16014': { label: '義務教育学校', types: ['elementary', 'juniorHigh'] }
};
const OWNERSHIP_BY_CODE = { m: 'municipal', p: 'prefectural', n: 'national', r: 'private' };

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
  nursery: '保', kindergarten: '幼', elementary: '小', juniorHigh: '中',
  high: '高', specialSupport: '支', university: '大', vocational: '専'
};

const state = {
  localData: null,
  wideData: null,
  data: null,
  map: null,
  scope: 'local',
  types: new Set(),
  ownership: 'all',
  markers: new Map(),
  visible: [],
  focusCircle: null,
  routeOrigin: null,
  routeOriginMarker: null,
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

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`学校データを読み込めませんでした: ${path}`);
  return response.json();
}

function expandWideCampuses(rows, manifest, overrides) {
  let sequence = 0;
  const campuses = rows.map(row => {
    sequence += 1;
    const [sourceName, sourceAddress, lat, lng, compactListings] = row;
    const listings = compactListings.map(item => {
      const [sourceListingName, ownershipCode, formalCodesText, _legacyUrlIndex, institutionId] = item;
      const patch = overrides.institutions[institutionId] || {};
      const formalTypes = String(formalCodesText).split(',').filter(Boolean).flatMap(code => {
        const definition = FORMAL_TYPE_DEFS[code];
        if (!definition) throw new Error(`未対応の学校種別コードです: ${code}`);
        return definition.types.map(type => ({ type, code, label: definition.label }));
      });
      const ownership = OWNERSHIP_BY_CODE[ownershipCode];
      if (!ownership) throw new Error(`未対応の設置区分コードです: ${ownershipCode}`);
      return {
        name: patch.name || sourceListingName,
        types: [...new Set(formalTypes.map(entry => entry.type))],
        formalTypes,
        ownerships: [ownership],
        officialUrl: patch.officialUrl || null,
        institutionIds: [institutionId]
      };
    });
    const campusKey = listings.map(listing => listing.institutionIds[0]).sort().join('|');
    const campusPatch = overrides.campuses[campusKey] || {};
    return {
      id: `wide-campus-${String(sequence).padStart(3, '0')}`,
      name: campusPatch.name || sourceName,
      address: campusPatch.address || sourceAddress,
      lat,
      lng,
      types: [...new Set(listings.flatMap(listing => listing.types))],
      ownerships: [...new Set(listings.flatMap(listing => listing.ownerships))],
      listings,
      dataScope: 'wide'
    };
  });

  const listingCount = campuses.reduce((sum, campus) => sum + campus.listings.length, 0);
  const officialUrlCount = campuses.reduce((sum, campus) => sum + campus.listings.filter(listing => listing.officialUrl).length, 0);
  if (campuses.length !== manifest.meta.campusCount || listingCount !== manifest.meta.institutionCount) {
    throw new Error(`広域学校データの件数が一致しません: ${campuses.length}地点／${listingCount}施設`);
  }
  if (officialUrlCount !== manifest.meta.officialUrlCount || officialUrlCount !== listingCount) {
    throw new Error(`広域学校データの公式URL件数が一致しません: ${officialUrlCount}/${listingCount}`);
  }
  return { meta: manifest.meta, campuses };
}

async function loadData() {
  const [localData, wideManifest] = await Promise.all([
    fetchJson('content/schools.json'),
    fetchJson('content/schools-wide.json')
  ]);
  const [chunks, overrideParts] = await Promise.all([
    Promise.all(wideManifest.chunkFiles.map(filename => fetchJson(`content/${filename}`))),
    Promise.all(wideManifest.overrideFiles.map(filename => fetchJson(`content/${filename}`)))
  ]);
  const wideOverrides = overrideParts.reduce((merged, part) => {
    Object.assign(merged.institutions, part.institutions || {});
    Object.assign(merged.campuses, part.campuses || {});
    return merged;
  }, { institutions: {}, campuses: {} });
  return {
    localData,
    wideData: expandWideCampuses(chunks.flat(), wideManifest, wideOverrides)
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
  if (state.types.size !== Object.keys(state.localData.meta.typeLabels).length) params.set('types', [...state.types].join(','));
  if (state.ownership !== 'all') params.set('ownership', state.ownership);
  history.replaceState(null, '', `${location.pathname}${location.search}#${params}`);
}

function selectCurrentData() {
  state.data = state.scope === 'wide' ? state.wideData : state.localData;
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
  return state.data.campuses.filter(campus => {
    if (state.scope !== 'wide' && !campus.viewModes.includes(state.scope)) return false;
    return activeListings(campus).length > 0;
  });
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
  return activeCampusOwnerships(campus).map(item => state.localData.meta.ownershipLabels[item]).join('・');
}

function googleRouteUrl(campus) {
  const params = new URLSearchParams({
    api: '1',
    destination: `${campus.lat},${campus.lng}`,
    travelmode: 'transit'
  });
  if (state.routeOrigin) params.set('origin', `${state.routeOrigin.lat},${state.routeOrigin.lng}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function popupHtml(campus) {
  const listings = activeListings(campus).map(item => {
    const formalLabels = [...new Set(item.formalTypes
      .filter(formalType => state.types.has(formalType.type))
      .map(formalType => formalType.label))];
    const ownershipLabels = item.ownerships.map(ownership => state.localData.meta.ownershipLabels[ownership]);
    const officialLink = item.officialUrl
      ? `<br><a href="${escapeHtml(item.officialUrl)}" target="_blank" rel="noopener">公式情報 ↗</a>`
      : '<br><span class="school-popup-unverified">公式情報未確認</span>';
    return `<li><strong>${escapeHtml(item.name)}</strong><br><span>${escapeHtml([...formalLabels, ...ownershipLabels].join('・'))}</span>${officialLink}</li>`;
  }).join('');

  return `<div class="school-popup">
    <strong>${escapeHtml(campus.name)}</strong>
    <span class="school-popup-address">${escapeHtml(campus.address)}</span>
    <div class="school-popup-tags">
      ${activeCampusTypes(campus).map(type => `<span>${escapeHtml(state.localData.meta.typeLabels[type])}</span>`).join('')}
      <span>${escapeHtml(ownershipText(campus))}</span>
    </div>
    <ul>${listings}</ul>
    <a class="school-transit-link" href="${escapeHtml(googleRouteUrl(campus))}" target="_blank" rel="noopener">Googleルート検索 ↗</a>
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
  document.querySelector('#schoolCount').textContent = `${state.visible.length}地点`;
  document.querySelector('#schoolList').innerHTML = state.visible.length
    ? [...state.visible].sort((a, b) => a.name.localeCompare(b.name, 'ja')).map(campus => `
      <article class="school-list-item">
        <button type="button" data-campus-id="${escapeHtml(campus.id)}">
          <small>${escapeHtml(activeCampusTypes(campus).map(type => state.localData.meta.typeLabels[type]).join('・'))}／${escapeHtml(ownershipText(campus))}</small>
          <strong>${escapeHtml(campus.name)}</strong>
          <span>${escapeHtml(campus.address)}</span>
        </button>
        <a class="school-list-transit-link" href="${escapeHtml(googleRouteUrl(campus))}" target="_blank" rel="noopener">Googleルート検索 ↗</a>
      </article>`).join('')
    : '<p class="load-error">条件に合う施設がありません。</p>';
  document.querySelectorAll('[data-campus-id]').forEach(button => button.addEventListener('click', () => focusCampus(button.dataset.campusId)));
}

function syncFocusArea() {
  if (state.scope === 'wide') {
    if (!state.focusCircle) {
      state.focusCircle = L.circle(FOCUS_AREA.center, {
        pane: 'focusAreaPane',
        radius: FOCUS_AREA.radiusMeters,
        stroke: false,
        fillColor: '#df7777',
        fillOpacity: 0.28,
        interactive: false
      }).addTo(state.map);
    }
  } else if (state.focusCircle) {
    state.focusCircle.remove();
    state.focusCircle = null;
  }
}

function renderMap({ fit = false } = {}) {
  selectCurrentData();
  state.visible = visibleCampuses();
  clearMarkers();
  syncFocusArea();
  state.visible.forEach(campus => {
    const icon = L.divIcon({
      className: 'school-marker-shell',
      html: `<span class="school-marker ${markerClass(campus)} ${ownershipToneClass(campus)}"><b>${escapeHtml(markerLabel(campus))}</b></span>`,
      iconSize: [34, 34],
      iconAnchor: [17, 32],
      popupAnchor: [0, -29]
    });
    const marker = L.marker([campus.lat, campus.lng], {
      pane: 'schoolMarkerPane', icon, title: campus.name, riseOnHover: true
    }).addTo(state.map).bindPopup(popupHtml(campus), { maxWidth: 310 });
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
    pane: 'routeOriginPane', radius: 8, color: '#17385d', weight: 3,
    fillColor: '#fff', fillOpacity: 1, interactive: false
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
  document.querySelector('#typeFilters').innerHTML = Object.entries(state.localData.meta.typeLabels).map(([id, label]) => `
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
    state.types = new Set(Object.keys(state.localData.meta.typeLabels));
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
    if (state.selectingRouteOrigin) setRouteOrigin(event.latlng);
  });
  updateRouteOriginUi();
}

function createMapPanes() {
  state.map.createPane('focusAreaPane');
  state.map.getPane('focusAreaPane').style.zIndex = '350';
  state.map.createPane('schoolMarkerPane');
  state.map.getPane('schoolMarkerPane').style.zIndex = '600';
  state.map.createPane('routeOriginPane');
  state.map.getPane('routeOriginPane').style.zIndex = '650';
}

async function init() {
  if (!window.L) throw new Error('地図ライブラリを読み込めませんでした');
  const loaded = await loadData();
  state.localData = loaded.localData;
  state.wideData = loaded.wideData;
  const requestedTypes = readHash();
  const validTypes = Object.keys(state.localData.meta.typeLabels);
  state.types = new Set(requestedTypes.filter(type => validTypes.includes(type)));
  if (!state.types.size) state.types = new Set(validTypes);
  state.map = L.map('schoolMapMockup', { scrollWheelZoom: true, zoomControl: true })
    .setView(VIEW_CONFIG[state.scope].center, VIEW_CONFIG[state.scope].zoom);
  L.tileLayer(MAP_CONFIG.tileUrl, MAP_CONFIG.tileOptions).addTo(state.map);
  createMapPanes();
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
