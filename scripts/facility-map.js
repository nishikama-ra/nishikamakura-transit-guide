const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const CATEGORY_COLORS = ['#4f916d','#2f6f98','#8b6f9b','#c27855','#6e86a1','#b15f64','#688c74','#8d7a4f'];
const state = { data:null, map:null, categories:new Set(), scope:'standard', markers:new Map(), visible:[] };
const pageConfig = JSON.parse(document.querySelector('#facilityPageConfig').textContent);

function scopeMatches(place) {
  if (!pageConfig.hasWideScope) return true;
  if (state.scope === 'wide') return place.scopes.includes('wide');
  return place.scopes.some(scope => scope === 'local' || scope === 'nearby');
}
function visiblePlaces() {
  return state.data.places.filter(place => scopeMatches(place) && place.categories.some(c => state.categories.has(c)));
}
function markerLabel(place) {
  const labels = place.categories.filter(c => state.categories.has(c));
  return labels.length > 1 ? '複' : (pageConfig.shortLabels[labels[0]] || labels[0]?.slice(0,1) || '・');
}
function markerColor(place) {
  const category = place.categories.find(c => state.categories.has(c));
  return pageConfig.colors[category] || '#4f916d';
}
function popupHtml(place) {
  const listings = place.listings.filter(item => (item.categories || [item.category]).some(category => state.categories.has(category))).map(item => `
    <li><strong>${escapeHtml(item.name)}</strong>${(item.categories || [item.category]).length > 1 ? `<br><span>${escapeHtml((item.categories || [item.category]).join('・'))}</span>` : (item.detailType && item.detailType !== item.category ? `<br><span>${escapeHtml(item.detailType)}</span>` : '')}
    <br>${item.officialUrl ? `<a href="${escapeHtml(item.officialUrl)}" target="_blank" rel="noopener">公式情報 ↗</a>` : '<span>公式情報未確認</span>'}
    ${item.baseYear ? `<br><small>元データ基準年：${escapeHtml(item.baseYear)}年</small>` : ''}
    ${item.note ? `<p class="mn-popup-note">${escapeHtml(item.note)}</p>` : ''}</li>`).join('');
  return `<div class="mn-popup"><strong>${escapeHtml(place.name)}</strong><span class="mn-popup-address">${escapeHtml(place.address)}</span><div class="mn-popup-tags">${place.categories.filter(c=>state.categories.has(c)).map(c=>`<span>${escapeHtml(c)}</span>`).join('')}</div><ul>${listings}</ul></div>`;
}
function clearMarkers() { state.markers.forEach(marker => marker.remove()); state.markers.clear(); }
function renderList() {
  const count = document.querySelector('#placeCount');
  count.textContent = `${state.visible.length}地点`;
  const list = document.querySelector('#placeList');
  list.innerHTML = state.visible.length ? [...state.visible].sort((a,b)=>a.name.localeCompare(b.name,'ja')).map(place=>`<article class="mn-place-item"><button type="button" data-place-id="${escapeHtml(place.id)}"><small>${escapeHtml(place.categories.filter(c=>state.categories.has(c)).join('・'))}</small><strong>${escapeHtml(place.name)}</strong><span>${escapeHtml(place.address)}</span></button></article>`).join('') : '<p class="mn-note">条件に合う施設がありません。</p>';
  list.querySelectorAll('[data-place-id]').forEach(button => button.addEventListener('click', () => focusPlace(button.dataset.placeId)));
}
function renderMap({fit=false}={}) {
  state.visible = visiblePlaces(); clearMarkers();
  state.visible.forEach(place => {
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return;
    const icon = L.divIcon({className:'mn-marker-shell',html:`<span class="mn-marker" style="--marker-color:${markerColor(place)}"><b>${escapeHtml(markerLabel(place))}</b></span>`,iconSize:[32,32],iconAnchor:[16,30],popupAnchor:[0,-27]});
    const marker = L.marker([place.lat,place.lng],{icon,title:place.name,riseOnHover:true}).addTo(state.map).bindPopup(popupHtml(place),{maxWidth:330});
    state.markers.set(place.id,marker);
  });
  renderList();
  if (fit) {
    const points = state.visible.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)).map(p=>[p.lat,p.lng]);
    if (points.length) state.map.fitBounds(points,{padding:[28,28],maxZoom:14});
  }
}
function focusPlace(id) { const place=state.visible.find(p=>p.id===id); const marker=state.markers.get(id); if (!place||!marker) return; state.map.setView([place.lat,place.lng],Math.max(state.map.getZoom(),16)); marker.openPopup(); }
function renderFilters() {
  const categoryRoot = document.querySelector('#categoryFilters');
  categoryRoot.innerHTML = state.data.categories.map((category,index)=>`<button class="mn-chip" type="button" data-category="${escapeHtml(category)}" aria-pressed="true" style="--chip-color:${pageConfig.colors[category] || CATEGORY_COLORS[index%CATEGORY_COLORS.length]}">${escapeHtml(category)}</button>`).join('');
  categoryRoot.querySelectorAll('[data-category]').forEach(button=>button.addEventListener('click',()=>{
    const category=button.dataset.category;
    if (state.categories.has(category) && state.categories.size>1) state.categories.delete(category); else state.categories.add(category);
    button.setAttribute('aria-pressed',String(state.categories.has(category))); renderMap();
  }));
  document.querySelector('#allCategories').addEventListener('click',()=>{ state.categories=new Set(state.data.categories); categoryRoot.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed','true')); renderMap(); });
  const scopeRoot=document.querySelector('#scopeFilters');
  if (pageConfig.hasWideScope) {
    scopeRoot.hidden=false;
    scopeRoot.querySelectorAll('[data-scope]').forEach(button=>button.addEventListener('click',()=>{ state.scope=button.dataset.scope; scopeRoot.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button))); renderMap({fit:true}); }));
  }
}
async function init() {
  if (!window.L) throw new Error('地図ライブラリを読み込めませんでした');
  const response=await fetch(pageConfig.dataFile); if(!response.ok) throw new Error('施設データを読み込めませんでした'); state.data=await response.json();
  state.categories=new Set(state.data.categories);
  state.map=L.map('facilityMap',{scrollWheelZoom:true}).setView(pageConfig.center,13);
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',{maxZoom:18,attribution:'<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>'}).addTo(state.map);
  L.control.scale({imperial:false,position:'bottomleft'}).addTo(state.map);
  renderFilters(); renderMap({fit:true});
  const panel=document.querySelector('#facilityListPanel'); const toggle=document.querySelector('#toggleFacilityList');
  const setPanel=(open)=>{panel.hidden=!open;toggle.textContent=open?'施設一覧を閉じる':'施設一覧を開く';setTimeout(()=>state.map.invalidateSize(),0);};
  toggle.addEventListener('click',()=>setPanel(panel.hidden));
  if (matchMedia('(max-width:640px)').matches) setPanel(false);
  document.querySelector('#checkedAt').textContent=state.data.meta.checkedAt || '—';
}
init().catch(error=>{document.querySelector('#facilityMap').innerHTML=`<p class="mn-note">${escapeHtml(error.message)}。ローカルHTTPサーバーから開いてください。</p>`;});
