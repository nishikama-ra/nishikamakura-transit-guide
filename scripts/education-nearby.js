const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

const TYPE_COLORS = {
  nursery: '#b16f68',
  kindergarten: '#9a705f',
  elementary: '#4c8580',
  juniorHigh: '#55768a',
  high: '#55768a',
  specialSupport: '#8c7d52',
  university: '#756c89',
  vocational: '#756c89'
};
const TYPE_SHORT = {
  nursery: '保', kindergarten: '幼', elementary: '小', juniorHigh: '中',
  high: '高', specialSupport: '支', university: '大', vocational: '専'
};
const state = {
  data: null,
  map: null,
  types: new Set(),
  ownership: 'all',
  markers: new Map(),
  visible: []
};

async function loadData() {
  const response = await fetch('content/education-nearby.json');
  if (!response.ok) throw new Error('近隣教育施設データを読み込めませんでした');
  return response.json();
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
    campus.viewModes?.includes('local') && activeListings(campus).length > 0
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
  const values = activeCampusTypes(campus).map(type => TYPE_SHORT[type]);
  return values.length <= 2 ? values.join('') : '複';
}

function markerClass(campus) {
  const types = activeCampusTypes(campus);
  return types.length > 1 ? 'marker-mixed' : `marker-${types[0] || campus.types[0]}`;
}

function ownershipToneClass(campus) {
  return activeCampusOwnerships(campus).some(item => ['private', 'national'].includes(item))
    ? 'marker-tone-strong'
    : 'marker-tone-soft';
}

function ownershipText(campus) {
  return activeCampusOwnerships(campus)
    .map(item => state.data.meta.ownershipLabels[item])
    .filter(Boolean)
    .join('・');
}

function popupHtml(campus) {
  const listings = activeListings(campus).map(item => {
    const formalTypes = (item.formalTypes || [])
      .filter(formalType => state.types.has(formalType.type))
      .map(formalType => formalType.label)
      .join('・');
    const ownerships = item.ownerships
      .map(ownership => state.data.meta.ownershipLabels[ownership])
      .filter(Boolean)
      .join('・');
    const link = item.officialUrl
      ? `<br><a href="${escapeHtml(item.officialUrl)}" target="_blank" rel="noopener">公式情報 ↗</a>`
      : '';
    return `<li><strong>${escapeHtml(item.name)}</strong><br><span>${escapeHtml([formalTypes, ownerships].filter(Boolean).join('・'))}</span>${link}</li>`;
  }).join('');

  return `<div class="school-popup">
    <strong>${escapeHtml(campus.name)}</strong>
    <span class="school-popup-address">${escapeHtml(campus.address)}</span>
    <div class="school-popup-tags">
      ${activeCampusTypes(campus).map(type => `<span>${escapeHtml(state.data.meta.typeLabels[type])}</span>`).join('')}
      <span>${escapeHtml(ownershipText(campus))}</span>
    </div>
    <ul>${listings}</ul>
  </div>`;
}

function clearMarkers() {
  state.markers.forEach(marker => marker.remove());
  state.markers.clear();
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
          <small>${escapeHtml(activeCampusTypes(campus).map(type => state.data.meta.typeLabels[type]).join('・'))}／${escapeHtml(ownershipText(campus))}</small>
          <strong>${escapeHtml(campus.name)}</strong>
          <span>${escapeHtml(campus.address)}</span>
        </button>
      </article>`).join('')
    : '<p class="load-error">条件に合う施設がありません。</p>';
  document.querySelectorAll('[data-campus-id]').forEach(button =>
    button.addEventListener('click', () => focusCampus(button.dataset.campusId))
  );
}

function renderMap() {
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
    const marker = L.marker([campus.lat, campus.lng], {
      icon,
      title: campus.name,
      riseOnHover: true
    }).addTo(state.map).bindPopup(popupHtml(campus), { maxWidth: 310 });
    state.markers.set(campus.id, marker);
  });
  renderList();
}

function syncPressedStates() {
  document.querySelectorAll('[data-ownership]').forEach(button =>
    button.setAttribute('aria-pressed', String(button.dataset.ownership === state.ownership))
  );
  document.querySelectorAll('[data-school-type]').forEach(button =>
    button.setAttribute('aria-pressed', String(state.types.has(button.dataset.schoolType)))
  );
}

function renderFilters() {
  document.querySelector('#typeFilters').innerHTML = Object.entries(state.data.meta.typeLabels).map(([id, label]) => `
    <button type="button" class="school-type-chip" data-school-type="${id}" aria-pressed="${state.types.has(id)}" style="--chip-color:${TYPE_COLORS[id] || '#55768a'}">${escapeHtml(label)}</button>`
  ).join('');

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
    state.ownership = 'all';
    syncPressedStates();
    renderMap();
  });
  syncPressedStates();
}

async function init() {
  if (!window.L) throw new Error('地図ライブラリを読み込めませんでした');
  state.data = await loadData();
  state.types = new Set(Object.keys(state.data.meta.typeLabels));
  state.map = L.map('nearbyEducationMap', { scrollWheelZoom: true, zoomControl: true })
    .setView([35.3230, 139.5050], 14);
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>'
  }).addTo(state.map);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(state.map);
  renderFilters();
  renderMap();
}

init().catch(error => {
  document.querySelector('#nearbyEducationMap').innerHTML = `<p class="load-error">${escapeHtml(error.message)}。ローカルHTTPサーバーから開いてください。</p>`;
});
