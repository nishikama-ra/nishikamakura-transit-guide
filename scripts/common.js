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

    const cellWidth = 58;
    const labelWidth = 72;
    const width = labelWidth + rows.length * cellWidth;
    const height = 120;
    const top = 18;
    const bottom = 8;
    const plotWidth = width - labelWidth;
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
  } catch (error) {
    console.error(error);
  }
}

renderHome();
renderHourlyWeatherMockup();