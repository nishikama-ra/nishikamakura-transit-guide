const POP_COLORS = ['#2f6f9f','#4f8a70','#b28b34','#b96850','#7563a0'];
const BREAKS = { total:[1,150,350,600,900], young:[1,15,35,65,100], working:[1,80,190,340,500], senior:[1,60,130,210,300] };
const BOUNDARY_URLS = {
  kamakura:'https://geoshape.ex.nii.ac.jp/ka/topojson/2020/14/r2ka14204.topojson',
  fujisawa:'https://geoshape.ex.nii.ac.jp/ka/topojson/2020/14/r2ka14205.topojson'
};
const TARGET_TOWN_CODES = new Set([
  '14204054001','14204054002','14204054003','14204054004','14204054005','142040590',
  '14204060001','14204060002','14204060003','14204060004',
  '14204064001','14204064002','14204064003','14204064004','14204064005',
  '14204069001','14204069002','14204071001','14204071002',
  '14204073000','14204073001','14204073002','14204073003','14204073004','14204073005',
  '14204079000','14204079001','14204079002','14204079003','142040830','142040840',
  '14204085100','14204085101','14204085102','14204085103','14204085104','14204085105','14204085106',
  '14204086100','14204086101','14204086102','14204086103','14204086104','14204086105','14204086106',
  '142040870','14204088001','14204088002','14204088003','14204088004',
  '14205301001','14205301002','14205301003','14205301004','14205301005',
  '14205302001','14205302002','14205302003',
  '14205303001','14205303002','14205303003','14205303004','14205303005',
  '142053040','14205305001','14205305002'
]);
const state = { data:null, map:null, layer:null, year:2025, metric:'total' };
const fmt = value => Math.round(value || 0).toLocaleString('ja-JP');
function color(value) { if (!value) return 'transparent'; const b=BREAKS[state.metric]; let i=0; while(i<b.length && value>=b[i]) i++; return POP_COLORS[Math.max(0,Math.min(i-1,POP_COLORS.length-1))]; }
function style(feature) { const value=feature.properties.values[String(state.year)][state.metric]||0; return { color:'rgba(255,255,255,.92)', weight:.55, fillColor:color(value), fillOpacity:value===0?0:.5 }; }
function popup(feature) { const v=feature.properties.values[String(state.year)]; const labels=state.data.meta.metrics; return `<div class="mn-popup"><strong>${state.year}年推計</strong><div class="mn-popup-tags"><span>${feature.properties.id}</span></div><ul><li>${labels.total}：${fmt(v.total)}人</li><li>${labels.young}：${fmt(v.young)}人</li><li>${labels.working}：${fmt(v.working)}人</li><li>${labels.senior}：${fmt(v.senior)}人</li></ul></div>`; }
function updateSummary(){ const s=state.data.meta.summaries[String(state.year)]; document.querySelector('#summaryYear').textContent=`${state.year}年`; for(const key of ['total','young','working','senior']) document.querySelector(`#sum-${key}`).textContent=`${fmt(s[key])}人`; }
function updateLegend(){ const root=document.querySelector('#populationLegend'); const b=BREAKS[state.metric]; const labels=['0（透明）',`${b[0]}～${b[1]-1}`,`${b[1]}～${b[2]-1}`,`${b[2]}～${b[3]-1}`,`${b[3]}～${b[4]-1}`,`${b[4]}以上`]; const swatches=['transparent',...POP_COLORS]; root.innerHTML=`<strong>${state.data.meta.metrics[state.metric]}（人／250mメッシュ）</strong>${labels.map((label,i)=>`<div class="mn-legend-row"><span class="mn-legend-swatch" style="background:${swatches[i]};${i===0?'border-style:dashed;':''}"></span>${label}</div>`).join('')}`; }
function render(){ state.layer.setStyle(style); state.layer.eachLayer(layer=>layer.setPopupContent(popup(layer.feature))); updateSummary(); updateLegend(); document.querySelector('#yearLabel').textContent=`${state.year}年`; }
function configureMapSize(){ const mapElement=document.querySelector('#populationMap'); mapElement.style.height='clamp(420px,52vh,500px)'; mapElement.style.minHeight='0'; mapElement.style.aspectRatio='auto'; mapElement.style.background='#fff'; }
function addBaseMap(map){ map.createPane('baseMapPane'); const pane=map.getPane('baseMapPane'); pane.style.zIndex='200'; pane.style.background='#fff'; pane.style.filter='grayscale(1) brightness(1.42) contrast(.78)'; L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',{pane:'baseMapPane',maxZoom:18,opacity:.62,attribution:'<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>'}).addTo(map); }
function topologyFeatures(topology){ const object=topology.objects[Object.keys(topology.objects)[0]]; const geo=topojson.feature(topology,object); return geo.type==='FeatureCollection'?geo.features:[geo]; }
function townCode(feature){ const p=feature.properties||{}; return String(p.KEY_CODE??p.KEYCODE??p.KEYCODE1??feature.id??'').replace(/\D/g,''); }
function makeTargetArea(topologies){ const selected=topologies.flatMap(topology=>topologyFeatures(topology)).filter(feature=>TARGET_TOWN_CODES.has(townCode(feature))); const matchedCodes=new Set(selected.map(townCode)); const missing=[...TARGET_TOWN_CODES].filter(code=>!matchedCodes.has(code)); if(missing.length) throw new Error(`対象区域の境界データが不足しています（${matchedCodes.size}/${TARGET_TOWN_CODES.size}件）`); return turf.union(turf.featureCollection(selected)); }
function overlapsByArea(feature,targetArea){ if(!turf.booleanIntersects(feature,targetArea)) return false; const overlap=turf.intersect(turf.featureCollection([feature,targetArea])); return Boolean(overlap&&turf.area(overlap)>0.01); }
function summarize(features,years){ const summaries={}; for(const year of years){ const sum={total:0,young:0,working:0,senior:0}; for(const feature of features){ const values=feature.properties.values[String(year)]||{}; for(const key of Object.keys(sum)) sum[key]+=Number(values[key]||0); } summaries[String(year)]=sum; } return summaries; }
function filterPopulationData(data,targetArea){ const features=data.features.filter(feature=>overlapsByArea(feature,targetArea)); if(!features.length) throw new Error('対象区域に重なる人口メッシュが見つかりませんでした'); return {...data,features,meta:{...data.meta,areaNote:'腰越地域・深沢地域・片瀬地区のいずれかと面積が重なる250mメッシュ',summaries:summarize(features,data.meta.years)}}; }
async function fetchJson(url,label){ const res=await fetch(url); if(!res.ok) throw new Error(`${label}を読み込めませんでした`); return res.json(); }
async function init(){ const [populationData,kamakuraTopology,fujisawaTopology]=await Promise.all([fetchJson('content/population-outlook.geojson','人口データ'),fetchJson(BOUNDARY_URLS.kamakura,'鎌倉市の区域境界'),fetchJson(BOUNDARY_URLS.fujisawa,'藤沢市の区域境界')]); const targetArea=makeTargetArea([kamakuraTopology,fujisawaTopology]); state.data=filterPopulationData(populationData,targetArea); configureMapSize(); state.map=L.map('populationMap',{scrollWheelZoom:true}).setView([35.323,139.505],13); addBaseMap(state.map); state.layer=L.geoJSON(state.data,{style,onEachFeature:(f,l)=>l.bindPopup(popup(f),{maxWidth:280})}).addTo(state.map); const bounds=state.layer.getBounds(); setTimeout(()=>{state.map.invalidateSize(); state.map.fitBounds(bounds,{padding:[8,8]});},0); const range=document.querySelector('#yearRange'); range.min=0; range.max=state.data.meta.years.length-1; range.value=0; range.addEventListener('input',()=>{state.year=state.data.meta.years[Number(range.value)];render();}); document.querySelectorAll('[data-metric]').forEach(button=>button.addEventListener('click',()=>{state.metric=button.dataset.metric;document.querySelectorAll('[data-metric]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();})); const legend=L.control({position:'bottomright'}); legend.onAdd=()=>{const div=L.DomUtil.create('div','mn-legend');div.id='populationLegend';return div;}; legend.addTo(state.map); render(); }
init().catch(error=>{document.querySelector('#populationMap').innerHTML=`<p class="mn-note">${error.message}。</p>`;});
