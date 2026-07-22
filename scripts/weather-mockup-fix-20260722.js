(() => {
  if (!location.pathname.endsWith('/weather-top-mockup.html')) return;

  const style = document.createElement('style');
  style.id = 'weather-mockup-overlap-fix-style';
  style.textContent = `
    .hero{background-position:right 18%!important}
    .hero>*{z-index:1}
    .hero::after{content:"";position:absolute;right:0;bottom:0;left:0;z-index:0;height:96px;pointer-events:none;background:linear-gradient(to bottom,rgba(247,252,254,0),rgba(247,252,254,.84) 52%,rgba(247,252,254,.98) 100%)}
    .weather-today-range{margin:4px 0 0;color:#60757a;font-size:.72rem;line-height:1.4}
    .weather-today-range strong{color:#263f45;font-size:.8rem}
    .weather-current-source{margin:2px 0 0;color:#7a898b;font-size:.6rem;line-height:1.4}
    @media(max-width:820px){.hero{background-position:50% 18%!important}}
  `;
  document.head.appendChild(style);

  const guardId = 'weatherLegacyAdvisoryGuard';
  const ensureGuard = () => {
    if (document.querySelector('.weather-advisories:not(#weatherLegacyAdvisoryGuard)')) return;
    if (document.getElementById(guardId)) return;
    const guard = document.createElement('div');
    guard.id = guardId;
    guard.className = 'weather-advisories';
    guard.hidden = true;
    guard.setAttribute('aria-hidden', 'true');
    document.body.appendChild(guard);
  };

  ensureGuard();

  const observer = new MutationObserver(() => {
    const liveAdvisory = document.querySelector('.weather-advisories:not(#weatherLegacyAdvisoryGuard)');
    if (liveAdvisory) {
      document.getElementById(guardId)?.remove();
      observer.disconnect();
      return;
    }
    ensureGuard();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  const fetchJson = async url => {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${url} ${response.status}`);
    return response.json();
  };

  const fetchCurrentAmedas = async () => {
    const latestResponse = await fetch(`https://www.jma.go.jp/bosai/amedas/data/latest_time.txt?v=${Date.now()}`, { cache: 'no-store' });
    if (!latestResponse.ok) throw new Error(`amedas latest ${latestResponse.status}`);
    const latestText = (await latestResponse.text()).trim();
    const key = latestText.replace(/\D/g, '').slice(0, 14);
    if (key.length !== 14) throw new Error('amedas latest time invalid');
    const map = await fetchJson(`https://www.jma.go.jp/bosai/amedas/data/map/${key}.json`);
    const temp = Number(map?.['46141']?.temp?.[0]);
    if (!Number.isFinite(temp)) throw new Error('辻堂アメダスの気温なし');
    return { temp, observedAt: latestText };
  };

  const fetchLocalForecast = async () => {
    const url = 'https://api.open-meteo.com/v1/jma?latitude=35.319292&longitude=139.504460&current=temperature_2m&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FTokyo&forecast_days=3';
    const data = await fetchJson(url);
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
    const index = Array.isArray(data.daily?.time) ? data.daily.time.indexOf(today) : -1;
    return {
      current: Number(data.current?.temperature_2m),
      currentAt: data.current?.time || '',
      max: index >= 0 ? Number(data.daily?.temperature_2m_max?.[index]) : NaN,
      min: index >= 0 ? Number(data.daily?.temperature_2m_min?.[index]) : NaN
    };
  };

  const formatClock = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  };

  const waitForToday = async () => {
    for (let i = 0; i < 120; i++) {
      const primary = document.querySelector('.weather-today .weather-primary-temp');
      if (primary) return primary;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
  };

  const renderTodayTemperatures = async () => {
    const [amedasResult, forecastResult] = await Promise.allSettled([
      fetchCurrentAmedas(),
      fetchLocalForecast()
    ]);

    const primary = await waitForToday();
    if (!primary) return;

    const existingMax = Number.parseFloat(primary.querySelector('strong')?.textContent || '');
    const existingMin = Number.parseFloat(primary.querySelector('span')?.textContent || '');
    const forecast = forecastResult.status === 'fulfilled' ? forecastResult.value : {};
    const amedas = amedasResult.status === 'fulfilled' ? amedasResult.value : null;

    const currentTemp = amedas?.temp ?? (Number.isFinite(forecast.current) ? forecast.current : NaN);
    const maxTemp = Number.isFinite(existingMax) ? existingMax : forecast.max;
    const minTemp = Number.isFinite(existingMin) ? existingMin : forecast.min;

    if (Number.isFinite(currentTemp)) {
      primary.innerHTML = `<strong>${currentTemp.toFixed(1)}℃</strong><span>現在</span>`;
    }

    let range = primary.parentElement.querySelector('.weather-today-range');
    if (!range) {
      range = document.createElement('p');
      range.className = 'weather-today-range';
      primary.insertAdjacentElement('afterend', range);
    }
    const maxText = Number.isFinite(maxTemp) ? `${Math.round(maxTemp)}℃` : '―';
    const minText = Number.isFinite(minTemp) ? `${Math.round(minTemp)}℃` : '―';
    range.innerHTML = `予想最高 <strong>${maxText}</strong> ／ 最低 <strong>${minText}</strong>`;

    let source = primary.parentElement.querySelector('.weather-current-source');
    if (!source) {
      source = document.createElement('p');
      source.className = 'weather-current-source';
      range.insertAdjacentElement('afterend', source);
    }
    if (amedas) {
      source.textContent = `現在気温：辻堂アメダス ${formatClock(amedas.observedAt)}観測`;
    } else if (Number.isFinite(forecast.current)) {
      source.textContent = `現在気温：西鎌倉付近の推定値 ${formatClock(forecast.currentAt)}時点`;
    } else {
      source.textContent = '';
    }
  };

  window.addEventListener('load', () => setTimeout(renderTodayTemperatures, 250));
})();
