const escapeHtml=value=>String(value??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const MAPBOX_TOKEN=['p','k','.','eyJ1IjoibmlzaGlrYW1ha3VyYS1qaWNoaWthaSIsImEiOiJjbXJhZWN6b2cwaDN2MnhzZW5yb3czMTA3In0','.','FiUvjoN3cybgnCLvHYtCNA'].join('');
const state={
  activeLevel:'elementary',map:null,data:null,districtLayer:null,labelLayer:null,
  bounds:null,layers:new Map(),point:null,pointMarker:null,address:'',
  elementary:null,juniorHigh:null,selectId:0,routeId:0,busy:false,
  routeLine:null,targetMarker:null,profileMarker:null,profile:null
};
const levels={elementary:{label:'小学校',color:'#5c8d92'},juniorHigh:{label:'中学校',color:'#6f819d'}};

async function loadData(){
  const urls=['content/school-districts-elementary.geojson','content/school-districts-juniorHigh.geojson'];
  const responses=await Promise.all(urls.map(url=>fetch(`${url}?v=20260717-5`)));
  if(responses.some(r=>!r.ok))throw new Error('学区データを読み込めませんでした');
  const collections=await Promise.all(responses.map(r=>r.json()));
  return{type:'FeatureCollection',features:collections.flatMap(c=>c.features)};
}
const visible=()=>state.data.features.filter(f=>f.properties.level===state.activeLevel);

function inRing([x,y],ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [xi,yi]=ring[i],[xj,yj]=ring[j];
    if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||Number.EPSILON)+xi))inside=!inside;
  }
  return inside;
}
function inPolygon(point,rings){return !!rings?.length&&inRing(point,rings[0])&&!rings.slice(1).some(r=>inRing(point,r));}
function contains(geometry,lng,lat){
  const p=[lng,lat];
  if(geometry?.type==='Polygon')return inPolygon(p,geometry.coordinates);
  if(geometry?.type==='MultiPolygon')return geometry.coordinates.some(poly=>inPolygon(p,poly));
  return false;
}
function findDistrict(latlng,level){
  return state.data.features.find(f=>f.properties.level===level&&contains(f.geometry,latlng.lng,latlng.lat))||null;
}
function selectedIds(){return new Set([state.elementary?.properties.id,state.juniorHigh?.properties.id].filter(Boolean));}
function styleFor(feature){
  const selected=selectedIds().has(feature.properties.id);
  return{color:feature.properties.color,weight:selected?4:2,opacity:1,fillColor:feature.properties.color,
    fillOpacity:selected?.38:.27,bubblingMouseEvents:false};
}
function officialLink(p,label='公式サイト ↗'){
  return p.schoolUrl?`<a class="school-official-link" href="${escapeHtml(p.schoolUrl)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`:'';
}
function popupHtml(p){return`<div class="school-popup"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.region)}・${escapeHtml(p.city)}</span><br><span>${escapeHtml(p.address)}</span>${officialLink(p)}</div>`;}

function setActiveLevel(level){
  if(!levels[level]||state.activeLevel===level)return;
  state.activeLevel=level;renderFilters();renderDistricts(false);
}
function renderFilters(){
  const box=document.querySelector('#levelFilters');
  box.innerHTML=Object.entries(levels).map(([id,item])=>{
    const count=state.data.features.filter(f=>f.properties.level===id).length;
    return`<button type="button" class="type-filter" data-level="${id}" aria-pressed="${id===state.activeLevel}" style="--filter-color:${item.color}"><strong>${item.label}</strong><span>${count}校</span></button>`;
  }).join('');
  box.querySelectorAll('[data-level]').forEach(button=>button.onclick=()=>setActiveLevel(button.dataset.level));
}
function focusSchool(id){
  const layer=state.layers.get(id);
  if(!layer)return;
  const bounds=layer.getBounds();
  state.map.fitBounds(bounds,{padding:[42,42],maxZoom:15});
  layer.openPopup(bounds.getCenter());
}
function renderList(features){
  document.querySelector('#schoolCount').textContent=`${levels[state.activeLevel].label} ${features.length}校`;
  document.querySelector('#schoolList').innerHTML=features.map(f=>{
    const p=f.properties,selected=selectedIds().has(p.id);
    return`<article class="school-item${selected?' is-selected':''}" style="--school-color:${p.color}"><button type="button" data-school-id="${escapeHtml(p.id)}"><small>${escapeHtml(p.region)}・${escapeHtml(p.city)}</small><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.address)}</span></button>${officialLink(p)}</article>`;
  }).join('');
  document.querySelectorAll('[data-school-id]').forEach(button=>button.onclick=()=>focusSchool(button.dataset.schoolId));
}
function addLabels(features){
  state.labelLayer=L.layerGroup().addTo(state.map);
  features.forEach(f=>{
    const p=f.properties;
    const labelLat=Number.isFinite(p.schoolLat)?p.schoolLat:p.labelLat;
    const labelLng=Number.isFinite(p.schoolLng)?p.schoolLng:p.labelLng;
    const icon=L.divIcon({className:'school-label-icon',html:`<span class="school-map-label" style="--school-color:${p.color}">${escapeHtml(p.name.replace('学校',''))}</span>`,iconSize:[0,0],iconAnchor:[0,0]});
    L.marker([labelLat,labelLng],{icon,title:p.name,bubblingMouseEvents:false}).addTo(state.labelLayer).on('click',()=>focusSchool(p.id));
  });
}
function renderDistricts(fit=true){
  const features=visible();
  state.layers.clear();
  state.districtLayer?.remove();state.labelLayer?.remove();
  state.districtLayer=L.geoJSON({type:'FeatureCollection',features},{
    style:styleFor,
    onEachFeature(feature,layer){
      layer.bindPopup(popupHtml(feature.properties));
      layer.on({
        mouseover:()=>layer.setStyle({weight:4,fillOpacity:.42}),
        mouseout:()=>layer.setStyle(styleFor(feature)),
        click:event=>{if(event.originalEvent)L.DomEvent.stopPropagation(event.originalEvent);selectPoint(event.latlng);}
      });
      state.layers.set(feature.properties.id,layer);
    }
  }).addTo(state.map);
  addLabels(features);renderList(features);
  state.bounds=state.districtLayer.getBounds();
  if(fit&&state.bounds.isValid())state.map.fitBounds(state.bounds,{padding:[24,24],maxZoom:14});
}

function cleanJapaneseAddress(value){
  return String(value||'')
    .normalize('NFKC')
    .replace(/^(日本|Japan)[、,\s]*/i,'')
    .replace(/[、,\s]*(日本|Japan)$/i,'')
    .replace(/〒?\d{3}-?\d{4}[、,\s]*/,'')
    .replace(/[、,\s]+/g,'')
    .trim();
}
function featureAddress(feature){
  const p=feature?.properties||{},full=cleanJapaneseAddress(p.full_address);
  if(full)return full;
  const context=p.context||{},parts=['region','place','locality','neighborhood','street']
    .map(key=>cleanJapaneseAddress(context[key]?.name)).filter(Boolean);
  parts.push(cleanJapaneseAddress(p.name_preferred||p.name));
  return parts.reduce((address,part)=>{
    if(!part||address.includes(part))return address;
    if(part.includes(address))return part;
    let overlap=Math.min(address.length,part.length);
    while(overlap&&address.slice(-overlap)!==part.slice(0,overlap))overlap--;
    return address+part.slice(overlap);
  },'');
}
async function reverseAddress(latlng){
  const q=new URLSearchParams({
    longitude:latlng.lng.toFixed(7),latitude:latlng.lat.toFixed(7),language:'ja',country:'jp',
    types:'address,street,neighborhood,locality,place',access_token:MAPBOX_TOKEN
  });
  const response=await fetch(`https://api.mapbox.com/search/geocode/v6/reverse?${q}`,{cache:'no-store'});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(data?.message||`Mapbox API HTTP ${response.status}`);
  const features=data?.features||[],order=['address','street','neighborhood','locality','place'];
  const best=order.map(type=>features.find(feature=>feature.properties?.feature_type===type)).find(Boolean)||features[0];
  return featureAddress(best);
}
function districtRow(label,feature){
  return feature
    ?`<div class="point-district-row" style="--school-color:${feature.properties.color}"><span>${label}</span><div class="point-district-name"><strong>${escapeHtml(feature.properties.name)}</strong>${officialLink(feature.properties)}</div></div>`
    :`<div class="point-district-row"><span>${label}</span><strong>対象範囲外または判定できません</strong></div>`;
}
function updateButtons(){
  const e=document.querySelector('#routeElementary'),j=document.querySelector('#routeJuniorHigh'),c=document.querySelector('#clearSchoolRoute'),x=document.querySelector('#expandProfile');
  e.disabled=!state.point||!state.elementary||state.busy;
  j.disabled=!state.point||!state.juniorHigh||state.busy;
  c.disabled=!state.routeLine&&!state.profile||state.busy;
  x.disabled=!state.profile||state.busy;
  e.textContent=!state.point?'小学校まで徒歩':state.elementary?`${state.elementary.properties.name}まで徒歩`:'小学校区を判定できません';
  j.textContent=!state.point?'中学校まで徒歩':state.juniorHigh?`${state.juniorHigh.properties.name}まで徒歩`:'中学校区を判定できません';
}
function renderPoint(){
  const panel=document.querySelector('#pointPanel');
  document.querySelector('#pointPlaceholder').hidden=!!state.point;
  panel.hidden=!state.point;if(!state.point)return;
  document.querySelector('#pointInfo').innerHTML=`<div class="point-address"><small>選択した地点</small><strong>${escapeHtml(state.address||'住所を確認しています…')}</strong><span>${state.point.lat.toFixed(6)}, ${state.point.lng.toFixed(6)}</span></div><div class="point-districts">${districtRow('小学校区',state.elementary)}${districtRow('中学校区',state.juniorHigh)}</div>`;
  updateButtons();
}
function clearRoute(keepStatus=false){
  state.routeId++;state.busy=false;
  state.routeLine?.remove();state.targetMarker?.remove();state.profileMarker?.remove();
  state.routeLine=state.targetMarker=state.profileMarker=state.profile=null;
  for(const id of['profileCanvas','profileCanvasExpanded']){
    const canvas=document.querySelector(`#${id}`);canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);canvas._geom=null;
  }
  document.querySelector('#profileStats').textContent='—';document.querySelector('#profileStatsExpanded').textContent='—';
  const dialog=document.querySelector('#profileDialog');if(dialog.open)dialog.close();
  if(!keepStatus)document.querySelector('#routeStatus').textContent=state.point?'小学校または中学校の「徒歩」ボタンを押してください。':'地図をクリックして地点を選んでください。';
  updateButtons();
}
async function selectPoint(latlng){
  const id=++state.selectId;
  clearRoute();state.point=L.latLng(latlng.lat,latlng.lng);state.address='';
  state.elementary=findDistrict(latlng,'elementary');state.juniorHigh=findDistrict(latlng,'juniorHigh');
  state.pointMarker?.remove();
  state.pointMarker=L.circleMarker(state.point,{radius:8,color:'#fff',weight:3,fillColor:'#294f67',fillOpacity:1}).addTo(state.map).bindTooltip('選択地点',{direction:'top',offset:[0,-8]});
  renderPoint();document.querySelector('#routeStatus').textContent='小学校または中学校の「徒歩」ボタンを押してください。';
  renderDistricts(false);
  if(window.matchMedia('(max-width: 820px)').matches){
    requestAnimationFrame(()=>document.querySelector('#routeControls').scrollIntoView({behavior:'smooth',block:'start'}));
  }
  try{const address=await reverseAddress(state.point);if(id===state.selectId)state.address=address||'住所を取得できませんでした';}
  catch{if(id===state.selectId)state.address='住所を取得できませんでした';}
  if(id===state.selectId)renderPoint();
}

function hav(a,b){
  const R=6371000,dLat=(b.lat-a.lat)*Math.PI/180,dLng=(b.lng-a.lng)*Math.PI/180;
  const lat1=a.lat*Math.PI/180,lat2=b.lat*Math.PI/180;
  return 2*R*Math.asin(Math.sqrt(Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2));
}
function thin(points,max=900){
  if(points.length<=max)return points;
  const out=[points[0]],step=Math.ceil((points.length-2)/(max-2));
  for(let i=1;i<points.length-1;i+=step)out.push(points[i]);
  out.push(points.at(-1));return out;
}
async function walkingRoute(start,end){
  const coords=`${start.lng.toFixed(6)},${start.lat.toFixed(6)};${end.lng.toFixed(6)},${end.lat.toFixed(6)}`;
  const q=new URLSearchParams({access_token:MAPBOX_TOKEN,geometries:'geojson',overview:'full',steps:'false',alternatives:'false'});
  const response=await fetch(`https://api.mapbox.com/directions/v5/mapbox/walking/${coords}?${q}`,{cache:'no-store'});
  let data=null;try{data=await response.json();}catch{}
  if(!response.ok||data?.code!=='Ok'||!data.routes?.[0])throw new Error(data?.message||`Mapbox API HTTP ${response.status}`);
  const route=data.routes[0],coordsOut=route.geometry?.coordinates;
  if(!Array.isArray(coordsOut)||coordsOut.length<2)throw new Error('徒歩ルートの形状を取得できませんでした');
  return{points:coordsOut.map(c=>L.latLng(c[1],c[0])),distance:route.distance};
}

function schoolEndpoints(feature){
  const p=feature.properties,entrances=Array.isArray(p.schoolEntrances)?p.schoolEntrances:[];
  const points=entrances.filter(c=>Array.isArray(c)&&Number.isFinite(c[0])&&Number.isFinite(c[1])).map(c=>L.latLng(c[1],c[0]));
  if(points.length)return points;
  return Number.isFinite(p.schoolLat)&&Number.isFinite(p.schoolLng)?[L.latLng(p.schoolLat,p.schoolLng)]:[];
}
async function walkingRouteToSchool(start,feature){
  const endpoints=schoolEndpoints(feature);
  if(!endpoints.length)throw new Error('学校入口の座標がありません');
  const attempts=await Promise.allSettled(endpoints.map(async end=>({end,route:await walkingRoute(start,end)})));
  const routes=attempts.filter(result=>result.status==='fulfilled').map(result=>result.value);
  if(!routes.length)throw attempts[0]?.reason||new Error('徒歩ルートを取得できませんでした');
  return routes.reduce((best,item)=>item.route.distance<best.route.distance?item:best);
}

function decode(r,g,b,a){if(a===0)return null;let v=r*65536+g*256+b;if(v===8388608)return null;if(v>8388608)v-=16777216;return v*.01;}
function loadImage(url){return new Promise((resolve,reject)=>{const image=new Image();image.crossOrigin='anonymous';const timer=setTimeout(()=>reject(new Error('timeout')),8000);image.onload=()=>{clearTimeout(timer);resolve(image);};image.onerror=reject;image.src=url;});}
const demCache=new Map();
async function dem(source,z,x,y){
  const key=`${source}/${z}/${x}/${y}`;if(demCache.has(key))return demCache.get(key);
  const promise=(async()=>{try{const image=await loadImage(`https://cyberjapandata.gsi.go.jp/xyz/${source}/${z}/${x}/${y}.png`);const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);return ctx.getImageData(0,0,256,256);}catch{return'fail';}})();
  demCache.set(key,promise);const result=await promise;demCache.set(key,result);return result;
}
function tile(lat,lng,z){const n=2**z,x=(lng+180)/360*n,r=lat*Math.PI/180,y=(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n;return{x,y};}
async function elevation(lat,lng){
  for(const[source,z]of[['dem5a_png',15],['dem_png',14]]){
    const t=tile(lat,lng,z),tx=Math.floor(t.x),ty=Math.floor(t.y),px=Math.min(255,Math.floor((t.x-tx)*256)),py=Math.min(255,Math.floor((t.y-ty)*256));
    const data=await dem(source,z,tx,ty);if(data==='fail')continue;
    const i=(py*256+px)*4,h=decode(data.data[i],data.data[i+1],data.data[i+2],data.data[i+3]);if(h!==null)return h;
  }
  return null;
}
async function makeProfile(route,feature,id){
  const points=route.points,segs=[];let total=0;
  for(let i=0;i<points.length-1;i++){const d=hav(points[i],points[i+1]);segs.push(d);total+=d;}
  const count=Math.min(180,Math.max(60,Math.round(total/15))),samples=[];
  for(let k=0;k<=count;k++){
    const target=total*k/count;let acc=0,i=0;
    while(i<segs.length-1&&acc+segs[i]<target){acc+=segs[i];i++;}
    const t=segs[i]?(target-acc)/segs[i]:0,a=points[i],b=points[i+1];
    samples.push({lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t,d:target});
  }
  const heights=await Promise.all(samples.map(p=>elevation(p.lat,p.lng)));if(id!==state.routeId)return;
  const profile=samples.map((p,i)=>({...p,h:heights[i]})).filter(p=>p.h!==null);
  if(profile.length<2)throw new Error('標高データを取得できませんでした');
  let up=0,down=0;for(let i=1;i<profile.length;i++){const d=profile[i].h-profile[i-1].h;if(d>0)up+=d;else down-=d;}
  state.profile={points:profile,total};drawProfile();
  const hs=profile.map(p=>p.h),min=Math.min(...hs),max=Math.max(...hs);
  const statsHtml=`徒歩距離 <b>${(route.distance/1000).toFixed(2)} km</b><br>最低 <b>${min.toFixed(1)}m</b> → 最高 <b>${max.toFixed(1)}m</b><br>累積上り <b>+${up.toFixed(0)}m</b> ／ 累積下り <b>−${down.toFixed(0)}m</b>`;
  document.querySelector('#profileStats').innerHTML=statsHtml;document.querySelector('#profileStatsExpanded').innerHTML=statsHtml;
  if(document.querySelector('#profileDialog').open)renderProfileExpanded();
  document.querySelector('#routeStatus').textContent=`${feature.properties.name}までの徒歩ルートと高低差を表示しています。`;
}
function endpoint(ctx,x,y,color,label,k=1){ctx.save();ctx.beginPath();ctx.arc(x,y,8*k,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=3*k;ctx.stroke();ctx.fillStyle=color;ctx.font=`bold ${Math.round(19*k)}px sans-serif`;ctx.textAlign='center';ctx.fillText(label,x,y-16*k);ctx.restore();}
function drawProfile(canvas=document.querySelector('#profileCanvas')){
  const ctx=canvas.getContext('2d'),{points,total}=state.profile,W=canvas.width,H=canvas.height,k=Math.max(1,W/640),L0=82*k,R0=24*k,T0=24*k,B0=55*k;
  ctx.clearRect(0,0,W,H);const hs=points.map(p=>p.h),min=Math.min(...hs),max=Math.max(...hs),y0=Math.floor(Math.min(0,min)/10)*10,y1=Math.ceil((max+3)/10)*10||10;
  const X=d=>L0+d/total*(W-L0-R0),Y=h=>T0+(1-(h-y0)/(y1-y0))*(H-T0-B0);
  ctx.strokeStyle='#dfe8eb';ctx.fillStyle='#667d8d';ctx.font=`${Math.round(20*k)}px sans-serif`;ctx.textAlign='right';ctx.lineWidth=k;
  const hStep=(y1-y0)<=40?10:(y1-y0)<=100?20:25;
  for(let h=y0;h<=y1;h+=hStep){ctx.beginPath();ctx.moveTo(L0,Y(h));ctx.lineTo(W-R0,Y(h));ctx.stroke();ctx.fillText(`${h}m`,L0-9*k,Y(h)+7*k);}
  ctx.textAlign='center';const dStep=total>4000?1000:total>1500?500:250;
  for(let d=0;d<=total;d+=dStep){ctx.beginPath();ctx.moveTo(X(d),T0);ctx.lineTo(X(d),H-B0);ctx.stroke();ctx.fillText(d>=1000?`${(d/1000).toFixed(1)}km`:`${Math.round(d)}m`,X(d),H-B0+31*k);}
  ctx.beginPath();ctx.moveTo(X(points[0].d),Y(points[0].h));points.forEach(p=>ctx.lineTo(X(p.d),Y(p.h)));ctx.lineTo(X(points.at(-1).d),Y(y0));ctx.lineTo(X(points[0].d),Y(y0));ctx.closePath();
  const grad=ctx.createLinearGradient(0,T0,0,H-B0);grad.addColorStop(0,'rgba(92,141,146,.55)');grad.addColorStop(1,'rgba(111,159,184,.20)');ctx.fillStyle=grad;ctx.fill();
  ctx.beginPath();ctx.moveTo(X(points[0].d),Y(points[0].h));points.forEach(p=>ctx.lineTo(X(p.d),Y(p.h)));ctx.strokeStyle='#315f7b';ctx.lineWidth=4*k;ctx.stroke();
  endpoint(ctx,X(points[0].d),Y(points[0].h),'#2f6f98','始',k);endpoint(ctx,X(points.at(-1).d),Y(points.at(-1).h),'#8d6577','校',k);
  canvas._geom={L0,R0,W};
}
function renderProfileExpanded(){
  if(!state.profile)return;
  const canvas=document.querySelector('#profileCanvasExpanded'),dpr=window.devicePixelRatio||1;
  const width=Math.min(window.innerWidth*.9,1400),height=Math.min(window.innerHeight*.66,width*.52);
  canvas.style.width=`${Math.round(width)}px`;canvas.style.height=`${Math.round(height)}px`;
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);drawProfile(canvas);
}
function openProfileDialog(){
  if(!state.profile)return;
  const dialog=document.querySelector('#profileDialog');dialog.showModal();renderProfileExpanded();
}
function profileClick(event){
  const canvas=event.currentTarget;if(!state.profile||!canvas._geom)return;
  const rect=canvas.getBoundingClientRect(),cx=(event.clientX-rect.left)*canvas.width/rect.width,{L0,R0,W}=canvas._geom;
  const target=state.profile.total*Math.min(1,Math.max(0,(cx-L0)/(W-L0-R0)));
  let nearest=state.profile.points[0],best=Infinity;state.profile.points.forEach(p=>{const d=Math.abs(p.d-target);if(d<best){best=d;nearest=p;}});
  const ll=L.latLng(nearest.lat,nearest.lng);
  if(state.profileMarker)state.profileMarker.setLatLng(ll);else state.profileMarker=L.circleMarker(ll,{radius:8,color:'#2f6f98',weight:3,fillColor:'#fff',fillOpacity:1}).addTo(state.map);
  state.profileMarker.bindTooltip(`距離 ${(nearest.d/1000).toFixed(2)}km／標高 約${nearest.h.toFixed(1)}m`,{direction:'top',offset:[0,-8]}).openTooltip();
  if(!state.map.getBounds().contains(ll))state.map.panTo(ll);
}
async function createRoute(level){
  const feature=level==='elementary'?state.elementary:state.juniorHigh;if(!state.point||!feature||state.busy)return;
  setActiveLevel(level);
  clearRoute(true);const id=++state.routeId;state.busy=true;updateButtons();
  document.querySelector('#routeStatus').textContent=`${feature.properties.name}までの徒歩ルートを取得しています…`;
  document.querySelector('#profileStats').textContent='高低差を計算します。';document.querySelector('#profileStatsExpanded').textContent='高低差を計算します。';
  try{
    const {end,route}=await walkingRouteToSchool(state.point,feature);if(id!==state.routeId)return;
    route.points=thin(route.points);state.routeLine=L.polyline(route.points,{color:'#315f7b',weight:5,opacity:.9}).addTo(state.map);
    state.targetMarker=L.marker(end,{title:`${feature.properties.name}（学校入口）`,bubblingMouseEvents:false}).addTo(state.map).bindTooltip(`${feature.properties.name}（学校入口）`,{direction:'top'});
    state.map.fitBounds(state.routeLine.getBounds().extend(state.point).extend(end),{padding:[34,34],maxZoom:16});
    await makeProfile(route,feature,id);
  }catch(error){if(id===state.routeId){document.querySelector('#routeStatus').textContent=`徒歩ルートを表示できませんでした：${error.message}`;document.querySelector('#profileStats').textContent='—';document.querySelector('#profileStatsExpanded').textContent='—';}}
  finally{if(id===state.routeId){state.busy=false;updateButtons();}}
}

async function init(){
  if(!window.L)throw new Error('地図を読み込めませんでした');
  state.data=await loadData();
  state.map=L.map('schoolMap',{scrollWheelZoom:true,zoomControl:true}).setView([35.322952,139.510274],14);
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',{maxZoom:18,attribution:'<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>'}).addTo(state.map);
  L.control.scale({imperial:false,position:'bottomleft'}).addTo(state.map);
  state.map.attributionControl.addAttribution('<a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener">© Mapbox</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>');
  renderFilters();renderDistricts(false);
  state.map.on('click',event=>selectPoint(event.latlng));
  document.querySelector('#resetMap').onclick=()=>{
    if(!state.bounds?.isValid())return;
    state.map.fitBounds(state.bounds,{padding:[24,24],maxZoom:14,animate:false});
    if(state.map.getZoom()<14)state.map.zoomIn(1);
  };
  document.querySelector('#routeElementary').onclick=()=>createRoute('elementary');
  document.querySelector('#routeJuniorHigh').onclick=()=>createRoute('juniorHigh');
  document.querySelector('#clearSchoolRoute').onclick=()=>clearRoute();
  document.querySelector('#profileCanvas').onclick=profileClick;
  document.querySelector('#profileCanvasExpanded').onclick=profileClick;
  document.querySelector('#expandProfile').onclick=openProfileDialog;
  document.querySelector('#closeProfile').onclick=()=>document.querySelector('#profileDialog').close();
  window.addEventListener('resize',()=>{if(document.querySelector('#profileDialog').open)renderProfileExpanded();});
  updateButtons();
}
init().catch(error=>{document.querySelector('#schoolMap').innerHTML=`<p class="load-error">${escapeHtml(error.message)}。ページを再読み込みしてください。</p>`;});
