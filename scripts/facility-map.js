const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

const CATEGORY_COLORS = ['#4f916d', '#2f6f98', '#8b6f9b', '#c27855', '#6e86a1', '#b15f64', '#688c74', '#8d7a4f'];
const state = { data: null, map: null, categories: new Set(), markers: new Map(), visible: [] };
const pageConfig = JSON.parse(document.querySelector('#facilityPageConfig').textContent);

const ICONS = {
  building: '<path d="M5 21h14M7 21V6h10v15M9.5 9h2v2h-2zm5 0h2v2h-2zm-5 4h2v2h-2zm5 0h2v2h-2zM11 21v-4h2v4"/>',
  community: '<circle cx="9" cy="9" r="2.5"/><circle cx="16" cy="10" r="2"/><path d="M4.5 20c.4-4 2-6 4.5-6s4.2 2 4.5 6M13 20c.2-3 1.3-4.7 3.2-4.7 1.8 0 3 1.6 3.3 4.7"/>',
  book: '<path d="M4 6c4-1.3 6.5-.5 8 1.2V20c-1.5-1.7-4-2.5-8-1.2zm16 0c-4-1.3-6.5-.5-8 1.2V20c1.5-1.7 4-2.5 8-1.2z"/>',
  sport: '<circle cx="12" cy="12" r="8"/><path d="m7 8 3 1 2-3 2.5 3 3-.3.5 3-2 2 1 3-3 .5-2 2-2-2-3 .5 1-3-2-2z"/>',
  mail: '<rect x="4" y="6" width="16" height="12" rx="1.5"/><path d="m5 8 7 5 7-5"/>',
  hospital: '<path d="M7 21V5h10v16M4 21h16M12 8v7M8.5 11.5h7"/>',
  clinic: '<circle cx="10" cy="9" r="4"/><path d="M10 5V3m0 12v6m-6-8c0 5 2.4 8 6 8h4c3 0 5-2 5-5v-1m-2 0h4"/>',
  tooth: '<path d="M7 4c-3 2-2 7-.8 10 .8 2 1 6 3 6 1.5 0 1.3-5 2.8-5s1.3 5 2.8 5c2 0 2.2-4 3-6C19 11 20 6 17 4c-2-1.5-3.5.2-5 .2S9 2.5 7 4z"/>',
  senior: '<circle cx="12" cy="6" r="2.5"/><path d="M12 9v5m0 0-4 6m4-6 4 6m-4-8-5 2m5-2 4 2m3-4v10"/>',
  support: '<path d="M4 15c3-1 5-1 7 1l2 2m7-7-5 6c-1 1-2 1-3 0l-2-2m-6 0v5h16v-5"/><circle cx="17" cy="7" r="3"/>',
  welfare: '<path d="M12 20C7 15 4 12 4 8a4 4 0 0 1 7-2l1 1 1-1a4 4 0 0 1 7 2c0 4-3 7-8 12z"/>',
  heritage: '<path d="M6 5h12v14H6zM8.5 8h7m-7 3h7m-7 3h5"/>',
  temple: '<path d="M4 9h16M6 9l2-4h8l2 4M7 9v11m10-11v11M5 20h14M9 12h6"/>',
  landscape: '<path d="M4 19h16L15 9l-3 5-2-3z"/><circle cx="7" cy="7" r="2"/>',
  fire: '<path d="M13 3c1 4-2 5-1 8 1-2 3-2 4-4 3 4 4 8 2 11-2 4-10 4-12 0-2-4 0-8 4-11 0 3 2 4 3 5 1-3-1-5 0-9z"/>',
  police: '<path d="M12 3 20 6v6c0 5-3 8-8 10-5-2-8-5-8-10V6z"/><path d="M12 7v9m-4-5h8"/>',
  pin: '<path d="M12 21c-4-5-7-8-7-12a7 7 0 1 1 14 0c0 4-3 7-7 12z"/><circle cx="12" cy="9" r="2"/>'
};

function iconSvg(key) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[key] || ICONS.pin}</svg>`;
}

function visiblePlaces() {
  return state.data.places.filter(place => place.categories.some(category => state.categories.has(category)));
}

function primaryCategory(place) {
  return place.primaryCategory || place.categories[0];
}

function categoryColor(category) {
  const index = state.data.categories.indexOf(category);
  return pageConfig.colors?.[category] || CATEGORY_COLORS[Math.max(0, index) % CATEGORY_COLORS.length];
}

function categoryIcon(category) {
  return pageConfig.icons?.[category] || 'pin';
}

function popupHtml(place) {
  const visibleListings = (place.listings || []).filter(item =>
    (item.categories || [item.category]).some(category => state.categories.has(category))
  );
  const listings = visibleListings.map(item => {
    const itemCategories = item.categories || [item.category].filter(Boolean);
    const description = item.publicDescription ? `<p class="mn-popup-description">${escapeHtml(item.publicDescription)}</p>` : '';
    const link = item.officialUrl ? `<a href="${escapeHtml(item.officialUrl)}" target="_blank" rel="noopener">公式ページ ↗</a>` : '';
    return `<li><strong>${escapeHtml(item.name)}</strong>${itemCategories.length ? `<div class="mn-popup-item-categories">${escapeHtml(itemCategories.join('・'))}</div>` : ''}${description}${link}</li>`;
  }).join('');
  return `<div class="mn-popup"><strong>${escapeHtml(place.name)}</strong><span class="mn-popup-address">${escapeHtml(place.address)}</span><div class="mn-popup-tags">${place.categories.map(category => `<span>${escapeHtml(category)}</span>`).join('')}</div>${listings ? `<ul>${listings}</ul>` : ''}</div>`;
}

function clearMarkers() {
  state.markers.forEach(marker => marker.remove());
  state.markers.clear();
}

function renderList() {
  const count = document.querySelector('#placeCount');
  if (count) count.textContent = `${state.visible.length}地点`;
  const list = document.querySelector('#placeList');
  if (!list) return;
  list.innerHTML = state.visible.length
    ? [...state.visible].sort((a, b) => a.name.localeCompare(b.name, 'ja')).map(place =>
      `<article class="mn-place-item"><button type="button" data-place-id="${escapeHtml(place.id)}"><small>${escapeHtml(place.categories.join('・'))}</small><strong>${escapeHtml(place.name)}</strong><span>${escapeHtml(place.address)}</span></button></article>`
    ).join('')
    : '<p class="mn-note">条件に合う施設がありません。</p>';
  list.querySelectorAll('[data-place-id]').forEach(button =>
    button.addEventListener('click', () => focusPlace(button.dataset.placeId))
  );
}

function renderMap() {
  state.visible = visiblePlaces();
  clearMarkers();
  state.visible.forEach(place => {
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return;
    const category = primaryCategory(place);
    const color = categoryColor(category);
    const icon = L.divIcon({
      className: 'mn-marker-shell',
      html: `<span class="mn-marker" style="--marker-color:${color}">${iconSvg(categoryIcon(category))}</span>`,
      iconSize: [24, 28],
      iconAnchor: [12, 26],
      popupAnchor: [0, -24]
    });
    const marker = L.marker([place.lat, place.lng], { icon, title: place.name, riseOnHover: true })
      .addTo(state.map)
      .bindPopup(popupHtml(place), { maxWidth: 340 });
    state.markers.set(place.id, marker);
  });
  renderList();
}

function focusPlace(id) {
  const place = state.visible.find(item => item.id === id);
  const marker = state.markers.get(id);
  if (!place || !marker) return;
  state.map.setView([place.lat, place.lng], Math.max(state.map.getZoom(), pageConfig.focusZoom || 16));
  marker.openPopup();
}

function renderLegend() {
  const mapWrap = document.querySelector('.mn-map-wrap');
  if (!mapWrap) return;
  let legend = document.querySelector('#facilityLegend');
  if (!legend) {
    legend = document.createElement('div');
    legend.id = 'facilityLegend';
    legend.className = 'mn-facility-legend';
    mapWrap.appendChild(legend);
  }
  legend.innerHTML = state.data.categories.map(category =>
    `<div class="mn-facility-legend-row"><span class="mn-legend-icon" style="--legend-color:${categoryColor(category)}">${iconSvg(categoryIcon(category))}</span><span>${escapeHtml(category)}</span></div>`
  ).join('');
}

function renderFilters() {
  const categoryRoot = document.querySelector('#categoryFilters');
  categoryRoot.innerHTML = state.data.categories.map((category, index) => {
    const color = pageConfig.colors?.[category] || CATEGORY_COLORS[index % CATEGORY_COLORS.length];
    return `<button class="mn-chip mn-icon-chip" type="button" data-category="${escapeHtml(category)}" aria-pressed="true" style="--chip-color:${color}"><span class="mn-chip-icon">${iconSvg(categoryIcon(category))}</span>${escapeHtml(category)}</button>`;
  }).join('');
  categoryRoot.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => {
    const category = button.dataset.category;
    if (state.categories.has(category) && state.categories.size > 1) state.categories.delete(category);
    else state.categories.add(category);
    button.setAttribute('aria-pressed', String(state.categories.has(category)));
    renderMap();
  }));
  document.querySelector('#allCategories')?.addEventListener('click', () => {
    state.categories = new Set(state.data.categories);
    categoryRoot.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', 'true'));
    renderMap();
  });
}

async function init() {
  if (!window.L) throw new Error('地図ライブラリを読み込めませんでした');
  const response = await fetch(pageConfig.dataFile);
  if (!response.ok) throw new Error('施設データを読み込めませんでした');
  state.data = await response.json();
  state.categories = new Set(state.data.categories);
  state.map = L.map('facilityMap', { scrollWheelZoom: true }).setView(pageConfig.center, pageConfig.zoom);
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>'
  }).addTo(state.map);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(state.map);
  renderFilters();
  renderLegend();
  renderMap();

  const panel = document.querySelector('#facilityListPanel');
  const toggle = document.querySelector('#toggleFacilityList');
  if (panel && toggle) {
    const setPanel = open => {
      panel.hidden = !open;
      toggle.textContent = open ? '施設一覧を閉じる' : '施設一覧を開く';
      setTimeout(() => state.map.invalidateSize(), 0);
    };
    toggle.addEventListener('click', () => setPanel(panel.hidden));
    if (matchMedia('(max-width:640px)').matches) setPanel(false);
  }
  const checkedAt = document.querySelector('#checkedAt');
  if (checkedAt) checkedAt.textContent = state.data.meta?.checkedAt || '2026年7月';
}

init().catch(error => {
  document.querySelector('#facilityMap').innerHTML = `<p class="mn-note">${escapeHtml(error.message)}。ローカルHTTPサーバーから開いてください。</p>`;
});
