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
    cardContainer.innerHTML = site.homeCards.map(card => `
      <a class="home-card" data-tone="${card.tone}" href="${card.href}">
        <span class="card-number">${card.number}</span>
        <h3>${card.title}</h3>
        <p>${card.description}</p>
        <span class="card-link">${card.linkLabel} →</span>
      </a>`).join('');
  } catch (error) {
    showError(cardContainer, 'トップページの文章を読み込めませんでした。ローカルサーバーから開いてください。');
  }
}

async function renderHourlyWeatherMockup() {
  if (!location.pathname.endsWith('/weather-top-mockup.html')) return;

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
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`hourly ${response.status}`);
    const data = await response.json();
    const now = Date.now();
    const today = new Date();
    const rows = [];
    for (let i = 0; i < data.hourly.time.length; i++) {
      const d = new Date(data.hourly.time[i]);
      if (d.getTime() < now - 30 * 60 * 1000 || d.getTime() > now + 23.5 * 60 * 60 * 1000) continue;
      rows.push({
        label: (d.getDate() === today.getDate() ? '' : `${d.getMonth() + 1}/${d.getDate()} `) + `${d.getHours()}時`,
        temp: Number(data.hourly.temperature_2m[i]),
        precipitation: Number(data.hourly.precipitation[i] ?? 0),
        code: data.hourly.weather_code[i],
        speed: Number(data.hourly.wind_speed_10m[i]),
        direction: data.hourly.wind_direction_10m[i]
      });
    }

    const block = await waitForHourlyBlock();
    if (!block || rows.length < 2) return;

    document.querySelectorAll('.weather-metrics span, .weather-next-meta').forEach(element => {
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
    const x = index => labelWidth + cellWidth * (index + 0.5);
    const y = value => top + (max - value) / range * plotHeight;
    const grid = [min, Math.round((min + max) / 2), max].map(value => `<line class="temp-grid" x1="${labelWidth}" y1="${y(value)}" x2="${width}" y2="${y(value)}"></line><text class="temp-axis" x="2" y="${y(value) + 3}">${value}°</text>`).join('');
    const points = rows.map((row, index) => `${x(index)},${y(row.temp)}`).join(' ');
    const dots = rows.map((row, index) => `<circle class="temp-dot" cx="${x(index)}" cy="${y(row.temp)}" r="3"></circle><text class="temp-value" x="${x(index)}" y="${y(row.temp) - 7}">${Math.round(row.temp)}°</text>`).join('');
    const cells = (className, values) => values.map(value => `<div class="${className}">${value}</div>`).join('');
    const rain = rows.map(row => row.precipitation < 0.05 ? '0' : row.precipitation.toFixed(1));

    block.innerHTML = `<div class="hourly-head"><strong>これから24時間</strong><span>1時間ごと</span></div><div class="hourly-scroll"><div class="hourly-inner" style="width:${width}px;min-width:${width}px"><svg class="temp-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="1時間ごとの気温">${grid}<polyline class="temp-line" points="${points}"></polyline>${dots}</svg><div class="hourly-table" style="--cols:${rows.length}"><div class="hourly-row-label">時刻</div>${cells('hourly-time', rows.map(row => row.label))}<div class="hourly-row-label">天気</div>${cells('hourly-icon', rows.map(row => icon(row.code)))}<div class="hourly-row-label">降水量</div>${cells('hourly-value', rain.map(value => `${value}<small>mm</small>`))}<div class="hourly-row-label">風</div>${cells('hourly-value hourly-wind', rows.map(row => `${compass(row.direction)}<br>${row.speed.toFixed(1)}m/s`))}</div></div><p class="hour-source">日別予報：気象庁　時間別予報：Open-Meteo JMAモデル</p>`;

    if (!document.getElementById('weather-advisory-mockup-style')) {
      const style = document.createElement('style');
      style.id = 'weather-advisory-mockup-style';
      style.textContent = `
        .weather-advisories{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid #d8e4e5;background:#fff}
        .weather-advisory{padding:12px 18px 13px;min-width:0}.weather-advisory+ .weather-advisory{border-left:1px solid #d8e4e5}
        .weather-advisory-head{display:flex;justify-content:space-between;gap:12px;align-items:baseline;margin-bottom:8px}
        .weather-advisory-head strong{font-size:.8rem;color:#29474e}.weather-advisory-head span{font-size:.67rem;color:#6a7779;text-align:right}
        .heat-advisory{background:#fffdf8}.heat-days{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
        .heat-days div{display:grid;grid-template-columns:auto auto;align-items:baseline;gap:1px 7px;padding:7px 9px;border:1px solid #e4ded0;border-radius:9px;background:#fff}
        .heat-days small{font-size:.65rem;color:#6e7777}.heat-days strong{font-size:1.15rem;color:#35494d;justify-self:end}.heat-days span{grid-column:1/-1;font-size:.66rem;color:#786b53}
        .weather-advisory p{margin:7px 0 0;color:#66787b;font-size:.65rem;line-height:1.5}.early-advisory{background:#fafcfc}.early-advisory>p{margin-top:2px;font-size:.72rem;color:#435d63}
        @media(max-width:720px){.weather-advisories{grid-template-columns:1fr}.weather-advisory{padding:11px 14px 12px}.weather-advisory+ .weather-advisory{border-left:0;border-top:1px solid #d8e4e5}.weather-advisory-head{align-items:flex-start}.heat-days div{padding:6px 8px}}
      `;
      document.head.appendChild(style);
    }

    const weatherLayout = document.querySelector('.weather-layout');
    if (weatherLayout && !document.querySelector('.weather-advisories')) {
      const advisories = document.createElement('div');
      advisories.className = 'weather-advisories';
      advisories.innerHTML = `
        <section class="weather-advisory heat-advisory" aria-labelledby="heat-heading">
          <div class="weather-advisory-head">
            <strong id="heat-heading">暑さ指数</strong>
            <span>神奈川県に熱中症警戒アラート発表中</span>
          </div>
          <div class="heat-days">
            <div><small>今日</small><strong>32</strong><span>危険</span></div>
            <div><small>明日</small><strong>34</strong><span>危険</span></div>
            <div><small>明後日</small><strong>30</strong><span>厳重警戒</span></div>
          </div>
          <p>辻堂の予測値。3日間の最高値が25以上の場合に表示します。</p>
        </section>
        <section class="weather-advisory early-advisory" aria-labelledby="early-heading">
          <div class="weather-advisory-head"><strong id="early-heading">早期注意情報</strong><span>警報級の可能性［中］</span></div>
          <p>東部では、22日12時～18時、23日18時～24時に、大雨警報が発表される可能性があります。</p>
        </section>`;
      weatherLayout.insertAdjacentElement('afterend', advisories);
    }
  } catch (error) {
    console.error(error);
  }
}

renderHome();
renderHourlyWeatherMockup();