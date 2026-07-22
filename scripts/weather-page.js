(() => {
  if (!document.getElementById('weatherContent')) return;

  const jmaUrl = 'https://www.jma.go.jp/bosai/forecast/data/forecast/140000.json';
  const hourlyUrl = 'https://api.open-meteo.com/v1/forecast?latitude=35.319292&longitude=139.504460&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timezone=Asia%2FTokyo&forecast_days=2';
  const content = document.getElementById('weatherContent');
  const status = document.getElementById('weatherStatus');
  const labels = ['今日', '明日', '明後日'];

  const jmaIcon = code => {
    const n = Number(code);
    if ([100, 101, 110, 111].includes(n)) return '☀️';
    if (n >= 400) return '❄️';
    if (n >= 300 && n < 400) return '🌧️';
    if ([200, 201, 209, 210, 211].includes(n)) return '☁️';
    if (n >= 100 && n < 300) return '🌦️';
    return '☁️';
  };

  const wmoIcon = code => {
    const n = Number(code);
    if (n === 0) return '☀️';
    if ([1, 2].includes(n)) return '🌤️';
    if (n === 3) return '☁️';
    if ([45, 48].includes(n)) return '🌫️';
    if ([51, 53, 55, 56, 57].includes(n)) return '🌦️';
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(n)) return '🌧️';
    if ([71, 73, 75, 77, 85, 86].includes(n)) return '🌨️';
    if ([95, 96, 99].includes(n)) return '⛈️';
    return '☁️';
  };

  const clean = value => String(value || '')
    .replace(/所により/g, '／所により')
    .replace(/で 雷を伴う/g, '、雷を伴う')
    .replace(/\s+/g, ' ')
    .trim();

  const formatReport = value => new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value)) + '発表';

  const compass = degrees => ['北', '北東', '東', '南東', '南', '南西', '西', '北西'][Math.round(Number(degrees) / 45) % 8];

  const maxPop = (series, area, date) => {
    if (!series || !area) return '―';
    const values = series.timeDefines
      .map((time, index) => ({ time, value: area.pops[index] }))
      .filter(item => item.time.slice(0, 10) === date && item.value !== '')
      .map(item => Number(item.value));
    return values.length ? `${Math.max(...values)}%` : '―';
  };

  const shortTemps = (series, area, date) => {
    if (!series || !area) return { min: '―', max: '―' };
    const rows = series.timeDefines
      .map((time, index) => ({ time, value: area.temps[index] }))
      .filter(item => item.time.slice(0, 10) === date && item.value !== '');
    const midnight = rows.find(item => new Date(item.time).getHours() === 0);
    const morning = rows.find(item => new Date(item.time).getHours() === 9);
    return {
      min: midnight ? `${midnight.value}℃` : '―',
      max: morning ? `${morning.value}℃` : '―'
    };
  };

  const weeklyTemps = (weekly, date) => {
    if (!weekly) return null;
    const series = weekly.timeSeries[1];
    const area = series.areas.find(item => item.area.code === '46106') || series.areas[0];
    const index = series.timeDefines.findIndex(time => time.slice(0, 10) === date);
    if (index < 0) return null;
    return {
      min: area.tempsMin[index] ? `${area.tempsMin[index]}℃` : '―',
      max: area.tempsMax[index] ? `${area.tempsMax[index]}℃` : '―'
    };
  };

  const chart = rows => {
    if (rows.length < 2) return '';
    const width = 1040;
    const height = 120;
    const left = 72;
    const right = 0;
    const top = 18;
    const bottom = 8;
    const chartWidth = width - left - right;
    const chartHeight = height - top - bottom;
    const temperatures = rows.map(row => row.temp);
    const min = Math.floor(Math.min(...temperatures) - 1);
    const max = Math.ceil(Math.max(...temperatures) + 1);
    const range = Math.max(1, max - min);
    const cell = chartWidth / rows.length;
    const x = index => left + cell * (index + 0.5);
    const y = value => top + (max - value) / range * chartHeight;
    const grid = [min, Math.round((min + max) / 2), max]
      .map(value => `<line class="temp-grid" x1="${left}" y1="${y(value)}" x2="${width}" y2="${y(value)}"></line><text class="temp-axis" x="2" y="${y(value) + 3}">${value}°</text>`)
      .join('');
    const points = rows.map((row, index) => `${x(index)},${y(row.temp)}`).join(' ');
    const dots = rows
      .map((row, index) => `<circle class="temp-dot" cx="${x(index)}" cy="${y(row.temp)}" r="3"></circle><text class="temp-value" x="${x(index)}" y="${y(row.temp) - 7}">${Math.round(row.temp)}°</text>`)
      .join('');
    return `<svg class="temp-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="時間帯別気温">${grid}<polyline class="temp-line" points="${points}"></polyline>${dots}</svg>`;
  };

  const table = rows => {
    const cells = (className, values) => values.map(value => `<div class="${className}">${value}</div>`).join('');
    return `<div class="hourly-table" style="--cols:${rows.length}"><div class="hourly-row-label">時刻</div>${cells('hourly-time', rows.map(row => row.label))}<div class="hourly-row-label">天気</div>${cells('hourly-icon', rows.map(row => wmoIcon(row.code)))}<div class="hourly-row-label">降水確率</div>${cells('hourly-value', rows.map(row => `${row.pop ?? '―'}%`))}<div class="hourly-row-label">風</div>${cells('hourly-value hourly-wind', rows.map(row => `${compass(row.direction)}<br>${Number(row.speed).toFixed(1)}m/s`))}</div>`;
  };

  const hourlyPlaceholder = () => '<div class="hourly-block"><div class="hourly-head"><strong>これから48時間</strong></div><p class="weather-live-status">時間別予報を取得中です。</p></div>';

  const dailyReady = fetch(jmaUrl, { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error(`JMA ${response.status}`);
      return response.json();
    })
    .then(jma => {
      const short = jma[0];
      const weekly = jma[1];
      const weatherSeries = short.timeSeries[0];
      const popSeries = short.timeSeries[1];
      const tempSeries = short.timeSeries[2];
      const eastWeather = weatherSeries.areas.find(item => item.area.code === '140010') || weatherSeries.areas[0];
      const eastPop = popSeries.areas.find(item => item.area.code === '140010') || popSeries.areas[0];
      const tempArea = tempSeries.areas.find(item => item.area.code === '46106') || tempSeries.areas[0];
      const days = weatherSeries.timeDefines.slice(0, 3).map((time, index) => {
        const date = time.slice(0, 10);
        const shortValues = shortTemps(tempSeries, tempArea, date);
        const weeklyValues = weeklyTemps(weekly, date);
        const temperatures = index === 0
          ? { max: shortValues.max, min: '―' }
          : {
              max: shortValues.max !== '―' ? shortValues.max : (weeklyValues ? weeklyValues.max : '―'),
              min: shortValues.min !== '―' ? shortValues.min : (weeklyValues ? weeklyValues.min : '―')
            };
        return {
          label: labels[index],
          icon: jmaIcon(eastWeather.weatherCodes[index]),
          text: clean(eastWeather.weathers[index]),
          temperatures,
          pop: maxPop(popSeries, eastPop, date)
        };
      });
      const first = days[0];
      const rest = days.slice(1);
      content.innerHTML = `<div class="weather-layout"><article class="weather-today"><div class="weather-today-main"><div class="weather-symbol" aria-hidden="true">${first.icon}</div><div><p class="weather-day-label">${first.label}</p><p class="weather-primary-temp"><strong>${first.temperatures.max}</strong><span>最低 ${first.temperatures.min}</span></p><p class="weather-condition">${first.text}</p><div class="weather-metrics"><span>降水 <strong>${first.pop}</strong></span></div></div></div></article><div class="weather-next">${rest.map(day => `<article class="weather-next-day"><h3>${day.label}</h3><div class="weather-next-icon" aria-hidden="true">${day.icon}</div><div class="weather-next-text"><strong class="weather-next-temp">${day.temperatures.max} / ${day.temperatures.min}</strong><span class="weather-next-condition">${day.text}</span><span class="weather-next-meta">降水 ${day.pop}</span></div></article>`).join('')}</div></div>${hourlyPlaceholder()}`;
      status.textContent = formatReport(short.reportDatetime);
    })
    .catch(error => {
      console.error(error);
      status.textContent = '取得できませんでした';
      content.innerHTML = `<p class="weather-error">天気予報を取得できませんでした。</p>${hourlyPlaceholder()}`;
    });

  const hourlyReady = fetch(hourlyUrl, { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error(`hourly ${response.status}`);
      return response.json();
    });

  Promise.allSettled([dailyReady, hourlyReady]).then(([, hourlyResult]) => {
    const block = content.querySelector('.hourly-block');
    if (!block) return;
    if (block.dataset.weatherHourlySource === 'open-meteo-jma') return;
    if (hourlyResult.status !== 'fulfilled') {
      console.error(hourlyResult.reason);
      block.innerHTML = '<div class="hourly-head"><strong>これから48時間</strong></div><p class="weather-live-status">時間別予報を取得できませんでした。</p>';
      return;
    }

    const hourly = hourlyResult.value;
    const now = Date.now();
    const rows = [];
    for (let index = 0; index < hourly.hourly.time.length; index++) {
      const time = hourly.hourly.time[index];
      const date = new Date(time);
      if (date.getTime() < now - 60 * 60 * 1000 || date.getTime() > now + 47 * 60 * 60 * 1000 || date.getHours() % 3 !== 0) continue;
      rows.push({
        time,
        label: (date.getDate() === new Date().getDate() ? '' : `${date.getMonth() + 1}/${date.getDate()} `) + `${date.getHours()}時`,
        temp: Number(hourly.hourly.temperature_2m[index]),
        pop: hourly.hourly.precipitation_probability[index],
        code: hourly.hourly.weather_code[index],
        speed: hourly.hourly.wind_speed_10m[index],
        direction: hourly.hourly.wind_direction_10m[index]
      });
    }
    block.innerHTML = `<div class="hourly-head"><strong>これから48時間</strong></div><div class="hourly-scroll"><div class="hourly-inner">${chart(rows)}${table(rows)}</div></div><p class="hour-source">日別予報：気象庁　時間別予報：Open-Meteo</p>`;
  });
})();
