async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} を読み込めませんでした`);
  return response.json();
}

function showError(container, message) {
  if (container) container.innerHTML = `<p class="load-error">${message}</p>`;
}

async function renderHome() {
  const cardContainer = document.querySelector('#homeCards');
  try {
    const site = await loadJson('content/site.json');
    document.querySelector('#heroEyebrow').textContent = site.hero.eyebrow;
    const titleLines = site.hero.titleLines || [site.hero.title];
    document.querySelector('#heroTitle').innerHTML = titleLines.map(line => `<span class="hero-title-line">${line}</span>`).join('');
    document.querySelector('#heroLead').textContent = site.hero.lead;
    cardContainer.innerHTML = site.homeCards.map(card => `<a class="home-card" data-tone="${card.tone}" href="${card.href}"><span class="card-number">${card.number}</span><h3>${card.title}</h3><p>${card.description}</p><span class="card-link">${card.linkLabel} →</span></a>`).join('');
  } catch (error) {
    showError(cardContainer, 'トップページの文章を読み込めませんでした。ローカルサーバーから開いてください。');
  }
}

function ensureWeatherMockupStyle() {
  if (document.getElementById('weather-advisory-mockup-style')) return;
  const style = document.createElement('style');
  style.id = 'weather-advisory-mockup-style';
  style.textContent = `
    .active-weather-alerts{border-bottom:1px solid #d8e4e5;padding:10px 18px 11px;background:#fafcfc}
    .active-weather-alerts-head,.weather-advisory-head{display:flex;justify-content:space-between;gap:12px;align-items:baseline;margin-bottom:8px}
    .active-weather-alerts-head strong,.weather-advisory-head strong{font-size:.8rem;color:#29474e}
    .active-weather-alerts-head span,.weather-advisory-head span{font-size:.67rem;color:#6a7779;text-align:right}
    .active-weather-alert-list{display:flex;gap:7px;flex-wrap:wrap}
    .active-weather-alert{display:inline-flex;gap:6px;padding:6px 9px;border:1px solid #ddd8c8;border-radius:8px;background:#fffef9;font-size:.7rem;color:#435b61}
    .active-weather-alert.warning{border-color:#dfc9c5;background:#fffafa}
    .active-weather-alert b{font-weight:600}.active-weather-alert p{margin:0}
    .weather-advisories{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid #d8e4e5;background:#fff}
    .weather-advisory{padding:12px 18px 13px}.weather-advisory+.weather-advisory{border-left:1px solid #d8e4e5}
    .heat-advisory{background:#fffdf8}.heat-days{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
    .heat-days div{padding:8px 7px;border:1px solid #e4ded0;border-radius:9px;background:#fff;text-align:center}
    .heat-days small{display:block;margin-bottom:3px;font-size:.62rem;line-height:1.35;color:#6e7777;font-weight:400}
    .heat-days strong{font-size:1.15rem;color:#35494d;font-weight:700}
    .heat-days span{margin-left:3px;font-size:.62rem;color:#786b53;font-weight:400}
    .weather-advisory p{margin:7px 0 0;color:#66787b;font-size:.65rem;line-height:1.5}
    .weather-source{margin-top:8px!important;color:#7c898b!important;font-size:.61rem!important}
    .early-advisory{background:#fafcfc}.early-advisory>p{margin-top:2px;font-size:.72rem;color:#435d63}
    @media(max-width:720px){.active-weather-alerts{padding:9px 14px 10px}.active-weather-alert-list{display:grid}.weather-advisories{grid-template-columns:1fr}.weather-advisory{padding:11px 14px 12px}.weather-advisory+.weather-advisory{border-left:0;border-top:1px solid #d8e4e5}.weather-advisory-head{align-items:flex-start}.heat-days div{padding:7px 5px}}
  `;
  document.head.appendChild(style);
}

async function renderActiveWarnings() {
  if (!location.pathname.endsWith('/weather-top-mockup.html')) return;
  ensureWeatherMockupStyle();

  const weatherLayout = document.querySelector('.weather-layout');
  if (!weatherLayout || document.querySelector('.active-weather-alerts')) return;

  const warningNames = {
    '02':'暴風雪警報','03':'大雨警報','04':'洪水警報','05':'暴風警報','06':'大雪警報','07':'波浪警報','08':'高潮警報',
    '10':'大雨注意報','12':'大雪注意報','13':'風雪注意報','14':'雷注意報','15':'強風注意報','16':'波浪注意報','17':'融雪注意報',
    '18':'洪水注意報','19':'高潮注意報','20':'濃霧注意報','21':'乾燥注意報','22':'なだれ注意報','23':'低温注意報','24':'霜注意報',
    '25':'着氷注意報','26':'着雪注意報','32':'暴風雪特別警報','33':'大雨特別警報','35':'暴風特別警報','36':'大雪特別警報','37':'波浪特別警報','38':'高潮特別警報'
  };
  const warningCodes = new Set(['02','03','04','05','06','07','08','32','33','35','36','37','38']);

  try {
    const params = new URLSearchParams(location.search);
    let active;
    let updatedLabel;

    if (params.get('demoAlerts') === '1') {
      active = [
        { code:'03', name:'大雨警報' },
        { code:'14', name:'雷注意報' },
        { code:'15', name:'強風注意報' }
      ];
      updatedLabel = '表示例';
    } else {
      const response = await fetch('https://www.jma.go.jp/bosai/warning/data/warning/140000.json', { cache:'no-store' });
      if (!response.ok) throw new Error(`warning ${response.status}`);
      const data = await response.json();
      const municipalityAreas = data.areaTypes?.find(type => type.areas?.some(area => area.code === '1420400'))?.areas || [];
      const kamakura = municipalityAreas.find(area => area.code === '1420400');
      active = (kamakura?.warnings || [])
        .filter(item => item.code && !/解除|なし/.test(item.status || ''))
        .map(item => ({ code:String(item.code).padStart(2, '0'), name:warningNames[String(item.code).padStart(2, '0')] || `警報・注意報（${item.code}）` }));
      updatedLabel = data.reportDatetime ? `${new Date(data.reportDatetime).toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'numeric', minute:'2-digit' })}発表` : '気象庁';
    }

    if (!active.length) return;

    const section = document.createElement('section');
    section.className = 'active-weather-alerts';
    section.innerHTML = `<div class="active-weather-alerts-head"><strong>鎌倉市に発表中の警報・注意報</strong><span>${updatedLabel}</span></div><div class="active-weather-alert-list">${active.map(item => `<div class="active-weather-alert ${warningCodes.has(item.code) ? 'warning' : ''}"><b>${item.name}</b><p>鎌倉市</p></div>`).join('')}</div><p class="weather-source">出典：気象庁</p>`;
    weatherLayout.insertAdjacentElement('beforebegin', section);
  } catch (error) {
    console.error(error);
  }
}

async function renderHourlyWeatherMockup() {
  if (!location.pathname.endsWith('/weather-top-mockup.html')) return;
  ensureWeatherMockupStyle();

  const url = 'https://api.open-meteo.com/v1/jma?latitude=35.319292&longitude=139.504460&hourly=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timezone=Asia%2FTokyo&forecast_days=2';
  const compass = deg => ['北','北東','東','南東','南','南西','西','北西'][Math.round(Number(deg) / 45) % 8];
  const icon = code => {
    const n = Number(code);
    if (n === 0) return '☀️';
    if ([1,2].includes(n)) return '🌤️';
    if (n === 3) return '☁️';
    if ([45,48].includes(n)) return '🌫️';
    if ([51,53,55,56,57].includes(n)) return '🌦️';
    if ([61,63,65,66,67,80,81,82].includes(n)) return '🌧️';
    if ([71,73,75,77,85,86].includes(n)) return '🌨️';
    if ([95,96,99].includes(n)) return '⛈️';
    return '☁️';
  };
  const waitForHourlyBlock = async () => {
    for (let i = 0; i < 100; i++) {
      const block = document.querySelector('.hourly-block');
      if (block) return block;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
  };

  try {
    const response = await fetch(url, { cache:'no-store' });
    if (!response.ok) throw new Error(`hourly ${response.status}`);
    const data = await response.json();
    const now = Date.now();
    const today = new Date();
    const rows = [];
    for (let i = 0; i < data.hourly.time.length; i++) {
      const d = new Date(data.hourly.time[i]);
      if (d.getTime() < now - 30 * 60 * 1000 || d.getTime() > now + 23.5 * 60 * 60 * 1000) continue;
      rows.push({
        label:(d.getDate() === today.getDate() ? '' : `${d.getMonth() + 1}/${d.getDate()} `) + `${d.getHours()}時`,
        temp:Number(data.hourly.temperature_2m[i]),
        precipitation:Number(data.hourly.precipitation[i] ?? 0),
        code:data.hourly.weather_code[i],
        speed:Number(data.hourly.wind_speed_10m[i]),
        direction:data.hourly.wind_direction_10m[i]
      });
    }

    const block = await waitForHourlyBlock();
    if (!block || rows.length < 2) return;
    document.querySelectorAll('.weather-metrics span,.weather-next-meta').forEach(element => {
      element.innerHTML = element.innerHTML.replace(/^降水(?=\s)/, '降水確率');
    });

    const cellWidth = 58;
    const labelWidth = 72;
    const width = labelWidth + rows.length * cellWidth;
    const height = 120;
    const top = 18;
    const bottom = 8;
    const plotHeight = height - top - bottom;
    const temps = rows.map(row => row.temp);
    const min = Math.floor(Math.min(...temps) - 1);
    const max = Math.ceil(Math.max(...temps) + 1);
    const range = Math.max(1, max - min);
    const x = index => labelWidth + cellWidth * (index + .5);
    const y = value => top + (max - value) / range * plotHeight;
    const grid = [min, Math.round((min + max) / 2), max].map(value => `<line class="temp-grid" x1="${labelWidth}" y1="${y(value)}" x2="${width}" y2="${y(value)}"></line><text class="temp-axis" x="2" y="${y(value) + 3}">${value}°</text>`).join('');
    const points = rows.map((row,index) => `${x(index)},${y(row.temp)}`).join(' ');
    const dots = rows.map((row,index) => `<circle class="temp-dot" cx="${x(index)}" cy="${y(row.temp)}" r="3"></circle><text class="temp-value" x="${x(index)}" y="${y(row.temp)-7}">${Math.round(row.temp)}°</text>`).join('');
    const cells = (className, values) => values.map(value => `<div class="${className}">${value}</div>`).join('');
    const rain = rows.map(row => row.precipitation < .05 ? '0' : row.precipitation.toFixed(1));

    block.innerHTML = `<div class="hourly-head"><strong>これから24時間</strong><span>1時間ごと</span></div><div class="hourly-scroll"><div class="hourly-inner" style="width:${width}px;min-width:${width}px"><svg class="temp-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="1時間ごとの気温">${grid}<polyline class="temp-line" points="${points}"></polyline>${dots}</svg><div class="hourly-table" style="--cols:${rows.length}"><div class="hourly-row-label">時刻</div>${cells('hourly-time',rows.map(row => row.label))}<div class="hourly-row-label">天気</div>${cells('hourly-icon',rows.map(row => icon(row.code)))}<div class="hourly-row-label">降水量</div>${cells('hourly-value',rain.map(value => `${value}<small>mm</small>`))}<div class="hourly-row-label">風</div>${cells('hourly-value hourly-wind',rows.map(row => `${compass(row.direction)}<br>${row.speed.toFixed(1)}m/s`))}</div></div><p class="hour-source">日別予報：気象庁　時間別予報：Open-Meteo JMAモデル</p>`;

    if (!document.querySelector('.weather-advisories')) {
      const formatDay = (offset, relative) => {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        const weekdays = ['日','月','火','水','木','金','土'];
        return `${relative}<br>${d.getMonth() + 1}/${d.getDate()}（${weekdays[d.getDay()]}）`;
      };
      const advisories = document.createElement('div');
      advisories.className = 'weather-advisories';
      advisories.innerHTML = `<section class="weather-advisory heat-advisory"><div class="weather-advisory-head"><strong>暑さ指数（WBGT・辻堂）</strong><span>神奈川県に熱中症警戒アラート発表中</span></div><div class="heat-days"><div><small>${formatDay(0,'今日')}</small><strong>32</strong><span>危険</span></div><div><small>${formatDay(1,'明日')}</small><strong>34</strong><span>危険</span></div><div><small>${formatDay(2,'明後日')}</small><strong>30</strong><span>厳重警戒</span></div></div><p>3日間の最高値が25以上の場合に表示します。</p><p class="weather-source">出典：環境省 熱中症予防情報サイト</p></section><section class="weather-advisory early-advisory"><div class="weather-advisory-head"><strong>早期注意情報</strong><span>警報級の可能性［中］</span></div><p>神奈川県東部では、22日12時～18時、23日18時～24時に、大雨警報が発表される可能性があります。</p><p class="weather-source">出典：気象庁</p></section>`;
      block.insertAdjacentElement('afterend', advisories);
    }
  } catch (error) {
    console.error(error);
  }
}

renderHome();
renderActiveWarnings();
renderHourlyWeatherMockup();