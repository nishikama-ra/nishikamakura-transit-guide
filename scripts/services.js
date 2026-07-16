const escapeHtml = value => String(value ?? '').replace(/[&<>"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
const state = { activeType: 'shareCycle', map: null, markers: [], data: null };

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} を読み込めませんでした`);
  return response.json();
}

function renderActionCards(containerId, items) {
  document.querySelector(containerId).innerHTML = items.map(item => `
    <article class="action-card">
      <h3>${escapeHtml(item.name)}</h3>
      <p>${escapeHtml(item.description)}</p>
      ${item.phone ? `<p><a href="tel:${escapeHtml(item.phone)}">${escapeHtml(item.phone)}</a></p>` : ''}
      ${(item.links || [{ href: item.href, label: item.linkLabel }]).map(link => `<a href="${escapeHtml(link.href)}" target="_blank" rel="noopener">${escapeHtml(link.label)} ↗</a>`).join(' ')}
    </article>`).join('');
}

function renderPassengerServices(items) {
  document.querySelector('#passengerList').innerHTML = items.map(item => `
    <section class="passenger-card">
      <div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p></div>
      <div class="contact-links">${item.links.map(link => `
        <a href="${link.phone ? `tel:${escapeHtml(link.phone)}` : escapeHtml(link.href)}" ${link.phone ? '' : 'target="_blank" rel="noopener"'}>
          <strong>${escapeHtml(link.label)}</strong>${link.phone ? `<span>${escapeHtml(link.phone)}</span>` : '<span>公式情報を見る ↗</span>'}
        </a>`).join('')}</div>
    </section>`).join('');
}

function selectedPlaces() {
  return state.data.places.filter(place => place.type === state.activeType);
}

function markerColor(type) {
  return state.data.types.find(item => item.id === type)?.color || '#174f52';
}

function renderMapPlaces() {
  const places = selectedPlaces();
  state.markers.forEach(marker => marker.remove());
  state.markers = [];
  const bounds = [];
  places.forEach((place, index) => {
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return;
    const marker = L.circleMarker([place.lat, place.lng], {
      radius: 8, color: '#fff', weight: 2, fillColor: markerColor(place.type), fillOpacity: .95
    }).addTo(state.map).bindPopup(`
      <strong>${escapeHtml(place.name)}</strong><br>
      <span>${escapeHtml(place.provider)}</span><br>
      ${place.vehicle ? `<span>${escapeHtml(place.vehicle)}</span><br>` : ''}
      <span>${escapeHtml(place.address || '')}</span><br>
      <a href="${escapeHtml(place.href)}" target="_blank" rel="noopener">公式情報を見る</a>`);
    state.markers[index] = marker;
    bounds.push([place.lat, place.lng]);
  });
  if (bounds.length) state.map.fitBounds(bounds, { padding: [34, 34], maxZoom: 15 });

  const label = state.data.types.find(type => type.id === state.activeType)?.label;
  document.querySelector('#placeCount').textContent = `${label} ${places.length}件`;
  document.querySelector('#placeList').innerHTML = places.map((place, index) => `
    <article class="place-item">
      <button type="button" ${Number.isFinite(place.lat) && Number.isFinite(place.lng) ? `data-place-index="${index}"` : 'disabled'}><small>${escapeHtml(place.provider)}</small><strong>${escapeHtml(place.name)}</strong>${place.vehicle ? `<span>${escapeHtml(place.vehicle)}</span>` : ''}<span>${escapeHtml(place.address || '')}</span>${place.note ? `<span>${escapeHtml(place.note)}</span>` : ''}</button>
      <a href="${escapeHtml(place.href)}" target="_blank" rel="noopener">公式情報 ↗</a>
    </article>`).join('');
  document.querySelectorAll('[data-place-index]').forEach(button => button.addEventListener('click', () => {
    const index = Number(button.dataset.placeIndex);
    const place = places[index];
    state.map.setView([place.lat, place.lng], 17);
    state.markers[index]?.openPopup();
  }));
}

function renderFilters() {
  document.querySelector('#typeFilters').innerHTML = state.data.types.map(type => {
    const count = state.data.places.filter(place => place.type === type.id).length;
    return `<button type="button" class="type-filter" data-type="${type.id}" aria-pressed="${type.id === state.activeType}" style="--filter-color:${type.color}">
      <strong>${escapeHtml(type.label)}</strong><span>${count}件</span>
    </button>`;
  }).join('');
  document.querySelectorAll('[data-type]').forEach(button => button.addEventListener('click', () => {
    state.activeType = button.dataset.type;
    document.querySelectorAll('[data-type]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    renderMapPlaces();
  }));
}

async function init() {
  const [services, hello, carShare] = await Promise.all([
    loadJson('content/services.json'),
    loadJson('content/hello-cycling.json'),
    loadJson('content/car-share.json')
  ]);
  state.data = services.selfDrive;
  state.data.places = [...hello.places, ...carShare.places, ...state.data.places];
  document.querySelector('#mapScope').textContent = `${services.scope}の貸出・返却場所です。種類を選ぶと地図と一覧が切り替わります。`;
  renderFilters();
  renderActionCards('#shuttleList', services.facilityShuttles);
  renderActionCards('#welfareList', services.welfareTransport);
  renderActionCards('#otherTourismList', [...services.boats, ...services.tourismServices]);
  renderActionCards('#tsiteMobilityList', services.tsiteMobility);
  renderPassengerServices(services.passengerServices);
  if (!window.L) throw new Error('地図を読み込めませんでした');
  state.map = L.map('placesMap', { scrollWheelZoom: false }).setView([35.321, 139.505], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(state.map);
  renderMapPlaces();
}

init().catch(error => {
  document.querySelector('#placesMap').innerHTML = `<p class="load-error">${escapeHtml(error.message)}。ローカルサーバーから開いてください。</p>`;
});
