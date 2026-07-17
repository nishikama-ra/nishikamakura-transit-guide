const escapeHtml=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const MAPBOX_TOKEN=['p','k','.','eyJ1IjoibmlzaGlrYW1ha3VyYS1qaWNoaWthaSIsImEiOiJjbXJhZWN6b2cwaDN2MnhzZW5yb3czMTA3In0','.','FiUvjoN3cybgnCLvHYtCNA'].join('');
const MUNICIPALITIES={'14204':'神奈川県鎌倉市','14205':'神奈川県藤沢市'};
const DATA_FILES=['elementary-1','elementary-2','elementary-3','elementary-4','junior-1','junior-2','junior-3','junior-4'];
const state={activeLevel:'elementary',map:null,data:null,districtLayer:null,labelLayer:null,bounds:null,layers:new Map(),point:null,pointMarker:null,address:'',elementary:null,juniorHigh:null,selectId:0,routeId:0,busy:false,routeLine:null,targetMarker:null,profileMarker:null,profile:null};
const levels={elementary:{label:'小学校',color:'#5c8d92'},juniorHigh:{label:'中学校',color:'#6f819d'}};

function decodeRing(ring,scale){let x=0,y=0;return ring.map((p,i)=>{if(i){x+=p[0];y+=p[1];}else{[x,y]=p;}return[x/scale,y/scale];});}
function decodeCollection(c){
  if(c?.type!=='DeltaFeatureCollection')return c;
  return{type:'FeatureCollection',features:c.features.map(f=>{const g=f.geometry,coordinates=g.type==='MultiPolygon'?g.coordinates.map(poly=>poly.map(r=>decodeRing(r,c.scale))):g.coordinates.map(r=>decodeRing(r,c.scale));return{type:'Feature',properties:f.properties,geometry:{type:g.type,coordinates}};})};
}
async function loadData(){
  const responses=await Promise.all(DATA_FILES.map(name=>fetch(`content/school-districts/${name}.json?v=20260717-3`)));
  if(responses.some(r=>!r.ok))throw new Error('学区データを読み込めませんでした');
  const collections=await Promise.all(responses.map(async r=>decodeCollection(await r.json())));
  return{type:'FeatureCollection',features:collections.flatMap(c=>c.features)};
}
const visible=()=>state.data.features.filter(f=>f.properties.level===state.activeLevel);
function inRing([x,y],ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const[xi,yi]=ring[i],[xj,yj]=ring[j];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||Number.EPSILON)+xi))inside=!inside;}return inside;}
function inPolygon(point,rings){return!!rings?.length&&inRing(point,rings[0])&&!rings.slice(1).some(r=>inRing(point,r));}
function contains(g,lng,lat){const p=[lng,lat];if(g?.type==='Polygon')return inPolygon(p,g.coordinates);if(g?.type==='MultiPolygon')return g.coordinates.some(poly=>inPolygon(p,poly));return false;}
function findDistrict(ll,level){return state.data.features.find(f=>f.properties.level===level&&contains(f.geometry,ll.lng,ll.lat))||null;}
function selectedIds(){return new Set([state.elementary?.properties.id,state.juniorHigh?.properties.id].filter(Boolean));}
function styleFor(f){const selected=selectedIds().has(f.properties.id);return{color:f.properties.color,weight:selected?4:2,opacity:1,fillColor:f.properties.color,fillOpacity:selected?.38:.27,bubblingMouseEvents:false};}
function popupHtml(p){return`<div class="school-popup"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.region)}・${escapeHtml(p.city)}</span><br><span>${escapeHtml(p.address)}</span></div>`;}

function renderFilters(){
  const box=document.querySelector('#levelFilters');
  box.innerHTML=Object.entries(levels).map(([id,item])=>{const count=state.data.features.filter(f=>f.properties.level===id).length;return`<button type="button" class="type-filter" data-level="${id}" aria-pressed="${id===state.activeLevel}" style="--filter-color:${item.color}"><strong>${item.label}</strong><span>${count}校</span></button>`;}).join('');
  box.querySelectorAll('[data-level]').forEach(button=>button.onclick=()=>{state.activeLevel=button.dataset.level;box.querySelectorAll('[data-level]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));renderDistricts(false);});
}
function focusSchool(id){const layer=state.layers.get(id);if(!layer)return;const bounds=layer.getBounds();state.map.fitBounds(bounds,{padding:[42,42],maxZoom:15});layer.openPopup(bounds.getCenter());}
function renderList(features){
  document.querySelector('#schoolCount').textContent=`${levels[state.activeLevel].label} ${features.length}校`;
  document.querySelector('#schoolList').innerHTML=features.map(f=>{const p=f.properties,selected=selectedIds().has(p.id);return`<article class="school-item${selected?' is-selected':''}" style="--school-color:${p.color}"><button type="button" data-school-id="${escapeHtml(p.id)}"><small>${escapeHtml(p.region)}・${escapeHtml(p.city)}</small><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.address)}</span></button></article>`;}).join('');
  document.querySelectorAll('[data-school-id]').forEach(button=>button.onclick=()=>focusSchool(button.dataset.schoolId));
}
function addLabels(features){
  state.labelLayer=L.layerGroup().addTo(state.map);
  features.forEach(f=>{const p=f.properties,icon=L.divIcon({className:'school-label-icon',html:`<span class="school-map-label" style="--school-color:${p.color}">${escapeHtml(p.name.replace('学校',''))}</span>`,iconSize:[0,0],iconAnchor:[0,0]});L.marker([p.labelLat,p.labelLng],{icon,title:p.name,bubblingMouseEvents:false}).addTo(state.labelLayer).on('click',()=>focusSchool(p.id));});
}
function renderDistricts(fit=true){
  const features=visible();state.layers.clear();state.districtLayer?.remove();state.labelLayer?.remove();
  state.districtLayer=L.geoJSON({type:'FeatureCollection',features},{style:styleFor,onEachFeature(feature,layer){layer.bindPopup(popupHtml(feature.properties));layer.on({mouseover:()=>layer.setStyle({weight:4,fillOpacity:.42}),mouseout:()=>layer.setStyle(styleFor(feature)),click:e=>{if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);selectPoint(e.latlng);}});state.layers.set(feature.properties.id,layer);}}).addTo(state.map);
  addLabels(features);renderList(features);state.bounds=state.districtLayer.getBounds();if(fit&&state.bounds.isValid())state.map.fitBounds(state.bounds,{padding:[24,24],maxZoom:14});
}

function districtRow(label,feature){return feature?`<div class="point-district-row" style="--school-color:${feature.properties.color}"><span>${label}</span><strong>${escapeHtml(feature.properties.name)}</strong></div>`:`<div class="point-district-row"><span>${label}</span><strong>対象範囲外または判定できません</strong></div>`;}
function updateButtons(){
  const e=document.querySelector('#routeElementary'),j=document.querySelector('#routeJuniorHigh'),c=document.querySelector('#clearSchoolRoute');
  e.disabled=!state.point||!state.elementary||state.busy;j.disabled=!state.point||!state.juniorHigh||state.busy;c.disabled=!state.routeLine&&!state.profile||state.busy;
  e.textContent=state.elementary?`${state.elementary.properties.name}まで徒歩`:'小学校区を判定できません';j.textContent=state.juniorHigh?`${state.juniorHigh.properties.name}まで徒歩`:'中学校区を判定できません';
}
function renderPoint(){
  const panel=document.querySelector('#pointPanel');panel.hidden=!state.point;if(!state.point)return;
  document.querySelector('#pointInfo').innerHTML=`<div class="point-address"><small>選択した地点</small><strong>${escapeHtml(state.address||'住所を確認しています…')}</strong><span>${state.point.lat.toFixed(6)}, ${state.point.lng.toFixed(6)}</span></div><div class="point-districts">${districtRow('小学校区',state.elementary)}${districtRow('中学校区',state.juniorHigh)}</div>`;updateButtons();
}
function clearRoute(keepStatus=false){
  state.routeId++;state.busy=false;state.routeLine?.remove();state.targetMarker?.remove();state.profileMarker?.remove();state.routeLine=state.targetMarker=state.profileMarker=state.profile=null;
  const canvas=document.querySelector('#profileCanvas');canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);canvas._geom=null;document.querySelector('#profileStats').textContent='—';
  if(!keepStatus)document.querySelector('#routeStatus').textContent=state.point?'小学校または中学校までの徒歩ルートを選んでください。':'地点を選ぶと徒歩ルートを表示できます。';updateButtons();
}
async function selectPoint(ll){
  const id=++state.selectId;clearRoute();state.point=L.latLng(ll.lat,ll.lng);state.address='';state.elementary=findDistrict(ll,'elementary');state.juniorHigh=findDistrict(ll,'juniorHigh');
  state.pointMarker?.remove();state.pointMarker=L.circleMarker(state.point,{radius:8,color:'#fff',weight:3,fillColor:'#294f67',fillOpacity:1}).addTo(state.map).bindTooltip('選択地点',{direction:'top',offset:[0,-8]});
  renderPoint();document.querySelector('#routeStatus').textContent='小学校または中学校までの徒歩ルートを選んでください。';renderDistricts(false);
  try{const address=await reverseAddress(state.point);if(id===state.selectId)state.address=address||'住所を取得できませんでした';}catch{if(id===state.selectId)state.address='住所を取得できませんでした';}if(id===state.selectId)renderPoint();
}
