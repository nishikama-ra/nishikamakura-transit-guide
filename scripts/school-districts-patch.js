const schoolGeocodeCache=new Map();

reverseAddress=async function(latlng){
  const q=new URLSearchParams({
    longitude:latlng.lng.toFixed(7),latitude:latlng.lat.toFixed(7),language:'ja',country:'jp',
    types:'address,street,neighborhood,locality,place',access_token:MAPBOX_TOKEN
  });
  const response=await fetch(`https://api.mapbox.com/search/geocode/v6/reverse?${q}`,{cache:'no-store'});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(data?.message||`Mapbox API HTTP ${response.status}`);
  const feature=data?.features?.[0];if(!feature)return'';
  const p=feature.properties||{};
  return p.full_address||p.place_formatted||[p.name,feature.place_name].filter(Boolean).join(' ')||feature.place_name||'';
};

async function schoolLocation(feature){
  const p=feature.properties;if(schoolGeocodeCache.has(p.id))return schoolGeocodeCache.get(p.id);
  const fallback=L.latLng(p.labelLat,p.labelLng),query=`神奈川県${p.address} ${p.name}`;
  const q=new URLSearchParams({q:query,language:'ja',country:'jp',limit:'1',access_token:MAPBOX_TOKEN});
  try{
    const response=await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${q}`,{cache:'force-cache'});
    const data=await response.json().catch(()=>null),c=data?.features?.[0]?.geometry?.coordinates;
    if(response.ok&&Array.isArray(c)&&c.length>=2){const ll=L.latLng(c[1],c[0]);schoolGeocodeCache.set(p.id,ll);return ll;}
  }catch{}
  schoolGeocodeCache.set(p.id,fallback);return fallback;
}

createRoute=async function(level){
  const feature=level==='elementary'?state.elementary:state.juniorHigh;if(!state.point||!feature||state.busy)return;
  clearRoute(true);const id=++state.routeId;state.busy=true;updateButtons();
  document.querySelector('#routeStatus').textContent=`${feature.properties.name}までの徒歩ルートを取得しています…`;
  document.querySelector('#profileStats').textContent='高低差を計算します。';
  try{
    const end=await schoolLocation(feature);if(id!==state.routeId)return;
    const route=await walkingRoute(state.point,end);if(id!==state.routeId)return;
    route.points=thin(route.points);state.routeLine=L.polyline(route.points,{color:'#315f7b',weight:5,opacity:.9}).addTo(state.map);
    state.targetMarker=L.marker(end,{title:feature.properties.name,bubblingMouseEvents:false}).addTo(state.map).bindTooltip(feature.properties.name,{direction:'top'});
    state.map.fitBounds(state.routeLine.getBounds().extend(state.point).extend(end),{padding:[34,34],maxZoom:16});
    await makeProfile(route,feature,id);
  }catch(error){if(id===state.routeId){document.querySelector('#routeStatus').textContent=`徒歩ルートを表示できませんでした：${error.message}`;document.querySelector('#profileStats').textContent='—';}}
  finally{if(id===state.routeId){state.busy=false;updateButtons();}}
};

(async function upgradeKoshigoeBoundaries(){
  const urls=['content/school-districts/koshigoe-e.json','content/school-districts/nishikamakura-e.json'];
  try{
    const detailed=await Promise.all(urls.map(async url=>{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error();return r.json();}));
    while(!state.data)await new Promise(resolve=>setTimeout(resolve,40));
    const byId=new Map(detailed.map(f=>[f.properties.id,f]));
    state.data.features=state.data.features.map(f=>byId.get(f.properties.id)||f);
    state.elementary=state.point?findDistrict(state.point,'elementary'):state.elementary;
    renderDistricts(false);if(state.point)renderPoint();
  }catch(error){console.warn('詳細学区境界を読み込めませんでした',error);}
})();
