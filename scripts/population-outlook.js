const POP_COLORS=['#f3f8fb','#dcecf4','#b9d9e6','#86b9cf','#4d91b2','#215e86'];
const BREAKS={total:[1,150,350,600,900],young:[1,15,35,65,100],working:[1,80,190,340,500],senior:[1,60,130,210,300]};
const state={data:null,map:null,layer:null,year:2025,metric:'total'};
const fmt=value=>Math.round(value||0).toLocaleString('ja-JP');
function color(value){const b=BREAKS[state.metric];let i=0;while(i<b.length&&value>=b[i])i++;return POP_COLORS[Math.min(i,POP_COLORS.length-1)];}
function style(feature){const value=feature.properties.values[String(state.year)][state.metric]||0;return {color:'#fff',weight:.55,fillColor:color(value),fillOpacity:.78};}
function popup(feature){const v=feature.properties.values[String(state.year)];const labels=state.data.meta.metrics;return `<div class="mn-popup"><strong>${state.year}年推計</strong><div class="mn-popup-tags"><span>${feature.properties.id}</span></div><ul><li>${labels.total}：${fmt(v.total)}人</li><li>${labels.young}：${fmt(v.young)}人</li><li>${labels.working}：${fmt(v.working)}人</li><li>${labels.senior}：${fmt(v.senior)}人</li></ul></div>`;}
function updateSummary(){const s=state.data.meta.summaries[String(state.year)];document.querySelector('#summaryYear').textContent=`${state.year}年`;
  for(const key of ['total','young','working','senior'])document.querySelector(`#sum-${key}`).textContent=`${fmt(s[key])}人`;
}
function updateLegend(){const root=document.querySelector('#populationLegend');const b=BREAKS[state.metric];const labels=[`0～${b[0]-1}`,`${b[0]}～${b[1]-1}`,`${b[1]}～${b[2]-1}`,`${b[2]}～${b[3]-1}`,`${b[3]}～${b[4]-1}`,`${b[4]}以上`];root.innerHTML=`<strong>${state.data.meta.metrics[state.metric]}（人／250mメッシュ）</strong>${labels.map((label,i)=>`<div class="mn-legend-row"><span class="mn-legend-swatch" style="background:${POP_COLORS[i]}"></span>${label}</div>`).join('')}`;}
function render(){state.layer.setStyle(style);state.layer.eachLayer(layer=>layer.setPopupContent(popup(layer.feature)));updateSummary();updateLegend();document.querySelector('#yearLabel').textContent=`${state.year}年`;}
async function init(){const res=await fetch('content/population-outlook.geojson');if(!res.ok)throw new Error('人口データを読み込めませんでした');state.data=await res.json();
  state.map=L.map('populationMap',{scrollWheelZoom:true}).setView([35.323,139.505],13);L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',{maxZoom:18,attribution:'<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>'}).addTo(state.map);
  state.layer=L.geoJSON(state.data,{style,onEachFeature:(f,l)=>l.bindPopup(popup(f),{maxWidth:280})}).addTo(state.map);state.map.fitBounds(state.layer.getBounds(),{padding:[10,10]});
  const range=document.querySelector('#yearRange');range.min=0;range.max=state.data.meta.years.length-1;range.value=0;range.addEventListener('input',()=>{state.year=state.data.meta.years[Number(range.value)];render();});
  document.querySelectorAll('[data-metric]').forEach(button=>button.addEventListener('click',()=>{state.metric=button.dataset.metric;document.querySelectorAll('[data-metric]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();}));
  const legend=L.control({position:'bottomright'}); legend.onAdd=()=>{const div=L.DomUtil.create('div','mn-legend');div.id='populationLegend';return div;}; legend.addTo(state.map); render();
}
init().catch(error=>{document.querySelector('#populationMap').innerHTML=`<p class="mn-note">${error.message}。ローカルHTTPサーバーから開いてください。</p>`;});
