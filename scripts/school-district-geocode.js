function cleanAddress(v){return String(v||'').replace(/^(日本|Japan)[、,\s]*/i,'').replace(/[、,\s]*(日本|Japan)$/i,'').replace(/\s+/g,'').trim();}
function featureAddress(f){const p=f?.properties||{},full=cleanAddress(p.full_address);return full||cleanAddress(`${p.place_formatted||''}${p.name_preferred||p.name||''}`);}
async function mapboxReverseAddress(ll){
  const q=new URLSearchParams({longitude:ll.lng.toFixed(7),latitude:ll.lat.toFixed(7),access_token:MAPBOX_TOKEN,language:'ja',country:'jp'});
  const res=await fetch(`https://api.mapbox.com/search/geocode/v6/reverse?${q}`,{cache:'no-store'});if(!res.ok)throw new Error(`Mapbox HTTP ${res.status}`);
  const fs=(await res.json())?.features||[],order=['address','block','street','neighborhood','locality','place'];const best=order.map(t=>fs.find(f=>f.properties?.feature_type===t)).find(Boolean)||fs[0];return featureAddress(best);
}
async function gsiReverseAddress(ll){
  const q=new URLSearchParams({lat:ll.lat.toFixed(7),lon:ll.lng.toFixed(7)}),res=await fetch(`https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?${q}`,{cache:'no-store'});if(!res.ok)throw new Error();
  const r=(await res.json())?.results;return r?`${MUNICIPALITIES[String(r.muniCd)]||''}${r.lv01Nm||''}`:'';
}
async function reverseAddress(ll){try{const a=await mapboxReverseAddress(ll);if(a)return a;}catch(e){console.warn('Mapbox reverse geocoding failed',e);}return gsiReverseAddress(ll);}
async function schoolLocation(feature){
  const p=feature.properties,q=new URLSearchParams({q:`神奈川県${p.address}`,access_token:MAPBOX_TOKEN,language:'ja',country:'jp',autocomplete:'false',limit:'1',proximity:`${p.labelLng},${p.labelLat}`});
  const res=await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${q}`,{cache:'no-store'});if(!res.ok)throw new Error(`学校所在地の検索に失敗しました（HTTP ${res.status}）`);
  const result=(await res.json())?.features?.[0];if(!result)throw new Error('学校所在地を取得できませんでした');
  const rps=result.properties?.coordinates?.routable_points,rp=Array.isArray(rps)?rps.find(x=>x.name==='default')||rps[0]:null,c=rp?[rp.longitude,rp.latitude]:result.geometry?.coordinates;
  if(!Array.isArray(c)||c.length<2)throw new Error('学校所在地の座標を取得できませんでした');return L.latLng(c[1],c[0]);
}
