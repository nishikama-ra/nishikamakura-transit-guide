const escapeHtml = value => String(value ?? '').replace(/[&<>"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
}[char]));

const schoolState = {
  activeLevel: 'elementary',
  map: null,
  data: null,
  districtLayer: null,
  labelLayer: null,
  visibleBounds: null,
  layersById: new Map()
};

const levelSettings = {
  elementary: { label: '小学校', color: '#5c8d92' },
  juniorHigh: { label: '中学校', color: '#6f819d' }
};

async function loadSchoolData() {
  const paths = [
    'content/school-districts-elementary.geojson',
    'content/school-districts-juniorHigh.geojson'
  ];
  const responses = await Promise.all(paths.map(path => fetch(path)));
  if (responses.some(response => !response.ok)) throw new Error('学区データを読み込めませんでした');
  const collections = await Promise.all(responses.map(response => response.json()));
  return { type: 'FeatureCollection', features: collections.flatMap(collection => collection.features) };
}

function visibleFeatures() {
  return schoolState.data.features.filter(feature => feature.properties.level === schoolState.activeLevel);
}

function renderLevelFilters() {
  const container = document.querySelector('#levelFilters');
  container.innerHTML = Object.entries(levelSettings).map(([id, setting]) => {
    const count = schoolState.data.features.filter(feature => feature.properties.level === id).length;
    return `<button type="button" class="type-filter" data-level="${id}" aria-pressed="${id === schoolState.activeLevel}" style="--filter-color:${setting.color}">
      <strong>${setting.label}</strong><span>${count}校</span>
    </button>`;
  }).join('');

  container.querySelectorAll('[data-level]').forEach(button => {
    button.addEventListener('click', () => {
      schoolState.activeLevel = button.dataset.level;
      container.querySelectorAll('[data-level]').forEach(item => {
        item.setAttribute('aria-pressed', String(item === button));
      });
      renderSchoolDistricts();
    });
  });
}

function districtStyle(feature) {
  return {
    color: feature.properties.color,
    weight: 2,
    opacity: .95,
    fillColor: feature.properties.color,
    fillOpacity: .27
  };
}

function popupHtml(properties) {
  return `<div class="school-popup">
    <strong>${escapeHtml(properties.name)}</strong>
    <span>${escapeHtml(properties.region)}・${escapeHtml(properties.city)}</span><br>
    <span>${escapeHtml(properties.address)}</span>
  </div>`;
}

function focusSchool(id) {
  const layer = schoolState.layersById.get(id);
  if (!layer) return;
  const bounds = layer.getBounds();
  schoolState.map.fitBounds(bounds, { padding: [42, 42], maxZoom: 15 });
  layer.openPopup(bounds.getCenter());
}

function renderSchoolList(features) {
  const setting = levelSettings[schoolState.activeLevel];
  document.querySelector('#schoolCount').textContent = `${setting.label} ${features.length}校`;
  document.querySelector('#schoolList').innerHTML = features.map(feature => {
    const p = feature.properties;
    return `<article class="school-item" style="--school-color:${p.color}">
      <button type="button" data-school-id="${escapeHtml(p.id)}">
        <small>${escapeHtml(p.region)}・${escapeHtml(p.city)}</small>
        <strong>${escapeHtml(p.name)}</strong>
        <span>${escapeHtml(p.address)}</span>
      </button>
    </article>`;
  }).join('');

  document.querySelectorAll('[data-school-id]').forEach(button => {
    button.addEventListener('click', () => focusSchool(button.dataset.schoolId));
  });
}

function addSchoolLabels(features) {
  schoolState.labelLayer = L.layerGroup().addTo(schoolState.map);
  features.forEach(feature => {
    const p = feature.properties;
    const icon = L.divIcon({
      className: 'school-label-icon',
      html: `<span class="school-map-label" style="--school-color:${p.color}">${escapeHtml(p.name.replace('学校', ''))}</span>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });
    const marker = L.marker([p.labelLat, p.labelLng], {
      icon,
      keyboard: true,
      title: p.name,
      interactive: true
    }).addTo(schoolState.labelLayer);
    marker.on('click', () => focusSchool(p.id));
  });
}

function renderSchoolDistricts() {
  const features = visibleFeatures();
  schoolState.layersById.clear();
  if (schoolState.districtLayer) schoolState.districtLayer.remove();
  if (schoolState.labelLayer) schoolState.labelLayer.remove();

  schoolState.districtLayer = L.geoJSON({ type: 'FeatureCollection', features }, {
    style: districtStyle,
    onEachFeature(feature, layer) {
      const p = feature.properties;
      layer.bindPopup(popupHtml(p));
      layer.on({
        mouseover() { layer.setStyle({ weight: 3, fillOpacity: .38 }); },
        mouseout() { schoolState.districtLayer.resetStyle(layer); },
        click() { focusSchool(p.id); }
      });
      schoolState.layersById.set(p.id, layer);
    }
  }).addTo(schoolState.map);

  addSchoolLabels(features);
  renderSchoolList(features);
  schoolState.visibleBounds = schoolState.districtLayer.getBounds();
  schoolState.map.fitBounds(schoolState.visibleBounds, { padding: [24, 24], maxZoom: 14 });
}

async function initSchoolMap() {
  if (!window.L) throw new Error('地図を読み込めませんでした');
  schoolState.data = await loadSchoolData();
  schoolState.map = L.map('schoolMap', {
    scrollWheelZoom: false,
    zoomControl: true
  }).setView([35.322, 139.506], 13);

  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>'
  }).addTo(schoolState.map);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(schoolState.map);

  renderLevelFilters();
  renderSchoolDistricts();
  document.querySelector('#resetMap').addEventListener('click', () => {
    if (schoolState.visibleBounds) schoolState.map.fitBounds(schoolState.visibleBounds, { padding: [24, 24], maxZoom: 14 });
  });
}

initSchoolMap().catch(error => {
  const map = document.querySelector('#schoolMap');
  map.innerHTML = `<p class="load-error">${escapeHtml(error.message)}。ページを再読み込みしてください。</p>`;
});
