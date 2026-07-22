(() => {
  if (!location.pathname.endsWith('/weather-top-mockup.html')) return;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const weekdays = ['日','月','火','水','木','金','土'];
  const formatDate = value => {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T00:00:00+09:00` : value);
    if (Number.isNaN(d.getTime())) return escapeHtml(value);
    return `${d.getMonth() + 1}/${d.getDate()}(${weekdays[d.getDay()]})`;
  };
  const formatDateTime = (value, suffix) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return escapeHtml(value || '');
    const parts = Object.fromEntries(new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(d).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    return `${parts.month}/${parts.day}(${parts.weekday}) ${parts.hour}:${parts.minute}${suffix}`;
  };
  const formatClock = value => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      hour: 'numeric',
      minute: '2-digit'
    }).format(d);
  };
  const todayKey = () => new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
  const wbgtLabel = value => value >= 31 ? '危険' : value >= 28 ? '厳重警戒' : value >= 25 ? '警戒' : value >= 21 ? '注意' : 'ほぼ安全';

  const ensureStyle = () => {
    if (document.getElementById('weather-live-fix-style')) return;
    const style = document.createElement('style');
    style.id = 'weather-live-fix-style';
    style.textContent = `
      .hero{margin-bottom:0!important}
      .mock-jump-nav{clear:both!important;position:relative!important;margin-top:0!important}
      .mock-weather-section{position:relative!important;clear:both!important;z-index:1!important}
      .weather-live-status{padding:12px 18px;color:#66787b;background:#fafcfc;border-top:1px solid #d8e4e5;font-size:.68rem}
      .early-warning-list{display:grid;gap:7px;margin-top:4px}
      .early-warning-item{padding:8px 9px;background:#fff;border:1px solid #dce6e7;border-radius:8px}
      .early-warning-item strong{display:block;color:#29474e;font-size:.72rem}
      .early-warning-item span{display:block;margin-top:2px;color:#66787b;font-size:.65rem}
      .weather-advisories.single{grid-template-columns:1fr}
      .weather-today-range{margin:4px 0 0;color:#60757a;font-size:.72rem;line-height:1.4}
      .weather-today-range strong{color:#263f45;font-size:.8rem}
      .weather-primary-temp .weather-current-time{font-weight:400!important;font-size:.6rem!important;color:#7a898b}
      .weather-range-source{margin:2px 0 0;color:#7a898b;font-size:.6rem;line-height:1.4}
      .weather-advisory-title-meta{font-size:.62rem!important;font-weight:400!important;color:#66787b}
      .hourly-head span{display:none!important}
    `;
    document.head.appendChild(style);
  };

  const waitForHourlyBlock = async () => {
    for (let i = 0; i < 120; i++) {
      const block = document.querySelector('.hourly-block');
      if (block) return block;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
  };

  const waitForToday = async () => {
    for (let i = 0; i < 120; i++) {
      const primary = document.querySelector('.weather-today .weather-primary-temp');
      if (primary) return primary;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
  };

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

  const fetchLocalCurrent = async () => {
    const data = await fetchJson('https://api.open-meteo.com/v1/jma?latitude=35.319292&longitude=139.504460&current=temperature_2m&timezone=Asia%2FTokyo');
    return {
      current: Number(data.current?.temperature_2m),
      currentAt: data.current?.time || ''
    };
  };

  const renderTodayTemperatures = async data => {
    const [amedasResult, localResult] = await Promise.allSettled([
      fetchCurrentAmedas(),
      fetchLocalCurrent()
    ]);
    const primary = await waitForToday();
    if (!primary) return;

    const spanText = primary.querySelector('span')?.textContent || '';
    const originalIsForecast = !spanText.includes('現在（');
    const existingMax = originalIsForecast ? Number.parseFloat(primary.querySelector('strong')?.textContent || '') : NaN;
    const existingMin = originalIsForecast ? Number.parseFloat(spanText) : NaN;

    const amedas = amedasResult.status === 'fulfilled' ? amedasResult.value : null;
    const local = localResult.status === 'fulfilled' ? localResult.value : {};
    const temperatureSection = data.temperatureForecasts || {};
    const forecast = temperatureSection.days?.[todayKey()] || {};
    const savedMax = Number(forecast.max);
    const savedMin = Number(forecast.min);

    const currentTemp = amedas?.temp ?? (Number.isFinite(local.current) ? local.current : NaN);
    const maxTemp = Number.isFinite(savedMax) ? savedMax : existingMax;
    const minTemp = Number.isFinite(savedMin) ? savedMin : existingMin;

    if (Number.isFinite(currentTemp)) {
      const timeLabel = amedas
        ? `${formatClock(amedas.observedAt)}現在（辻堂アメダス）`
        : `${formatClock(local.currentAt)}現在（西鎌倉付近・推定）`;
      primary.innerHTML = `<strong>${currentTemp.toFixed(1)}℃</strong><span class="weather-current-time">${timeLabel}</span>`;
    }

    let range = primary.parentElement.querySelector('.weather-today-range');
    if (!range) {
      range = document.createElement('p');
      range.className = 'weather-today-range';
      primary.insertAdjacentElement('afterend', range);
    }
    range.innerHTML = `予想最高 <strong>${Number.isFinite(maxTemp) ? `${Math.round(maxTemp)}℃` : '―'}</strong> ／ 最低 <strong>${Number.isFinite(minTemp) ? `${Math.round(minTemp)}℃` : '―'}</strong>`;

    primary.parentElement.querySelector('.weather-current-source')?.remove();

    let rangeSource = primary.parentElement.querySelector('.weather-range-source');
    if (!rangeSource) {
      rangeSource = document.createElement('p');
      rangeSource.className = 'weather-range-source';
      range.insertAdjacentElement('afterend', rangeSource);
    }
    const reportTimes = [forecast.maxReportDatetime, forecast.minReportDatetime].filter(Boolean).sort();
    const reportLabel = reportTimes.length ? formatDateTime(reportTimes.at(-1), '発表') : '';
    if (Number.isFinite(savedMax) || Number.isFinite(savedMin)) {
      rangeSource.textContent = `予想最高・最低：気象庁（${temperatureSection.areaName || forecast.areaName || '横浜'}）${reportLabel ? ` ${reportLabel}` : ''}`;
    } else if (Number.isFinite(existingMax) || Number.isFinite(existingMin)) {
      rangeSource.textContent = '予想最高・最低：気象庁';
    } else {
      rangeSource.textContent = '予想最高・最低を取得できませんでした。';
    }
  };

  const render = async () => {
    ensureStyle();
    const block = await waitForHourlyBlock();
    if (!block) return;

    document.querySelector('.weather-advisories')?.remove();
    document.querySelectorAll('.weather-live-status').forEach(element => element.remove());

    let data;
    try {
      const response = await fetch(`content/weather-live.json?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`weather-live ${response.status}`);
      data = await response.json();
    } catch (error) {
      console.error(error);
      block.insertAdjacentHTML('afterend', '<p class="weather-live-status">暑さ指数・早期注意情報を取得できませんでした。</p>');
      return;
    }

    await renderTodayTemperatures(data);

    const sections = [];
    const statusMessages = [];

    const wbgt = Array.isArray(data.wbgt?.days) ? data.wbgt.days.filter(day => Number.isFinite(Number(day.max))) : [];
    if (data.wbgt?.status && data.wbgt.status !== 'ok') {
      statusMessages.push('暑さ指数を取得できませんでした。');
    } else if (wbgt.length && wbgt.some(day => Number(day.max) >= 25)) {
      const cards = wbgt.slice(0, 3).map(day => `<div><small>${escapeHtml(day.label || '')}<br>${formatDate(day.date)}</small><strong>${Math.round(Number(day.max))}</strong><span>${wbgtLabel(Number(day.max))}</span></div>`).join('');
      const updatedAt = data.wbgt?.updatedAt || data.updatedAt || '';
      sections.push(`<section class="weather-advisory heat-advisory"><div class="weather-advisory-head"><strong>暑さ指数 <span class="weather-advisory-title-meta">（WBGT・辻堂）</span></strong><span>各日の予測最高値（今日も予測）</span></div><div class="heat-days">${cards}</div><p class="weather-source">出典：環境省 熱中症予防情報サイト　取得：${formatDateTime(updatedAt, '時点')}</p></section>`);
    }

    const earlyStatus = data.earlyWarnings?.status || 'ok';
    const early = Array.isArray(data.earlyWarnings?.items) ? data.earlyWarnings.items : [];
    if (earlyStatus !== 'ok') {
      statusMessages.push('早期注意情報を取得できませんでした。');
    } else if (early.length) {
      const items = early.map(item => `<div class="early-warning-item"><strong>${escapeHtml(item.phenomenon)}　警報級の可能性［${escapeHtml(item.level)}］</strong><span>${escapeHtml(item.period || '')}</span></div>`).join('');
      const reportDatetime = data.earlyWarnings?.reportDatetime || '';
      sections.push(`<section class="weather-advisory early-advisory"><div class="weather-advisory-head"><strong>早期注意情報</strong><span>神奈川県東部</span></div><div class="early-warning-list">${items}</div><p class="weather-source">出典：気象庁　発表：${formatDateTime(reportDatetime, '発表')}</p></section>`);
    }

    let anchor = block;
    if (sections.length) {
      const wrapper = document.createElement('div');
      wrapper.className = `weather-advisories${sections.length === 1 ? ' single' : ''}`;
      wrapper.innerHTML = sections.join('');
      block.insertAdjacentElement('afterend', wrapper);
      anchor = wrapper;
    }

    if (statusMessages.length) {
      anchor.insertAdjacentHTML('afterend', `<p class="weather-live-status">${statusMessages.map(escapeHtml).join(' ')}</p>`);
    } else if (!sections.length) {
      block.insertAdjacentHTML('afterend', '<p class="weather-live-status">現在、表示対象の暑さ指数または早期注意情報はありません。</p>');
    }
  };

  window.addEventListener('load', () => setTimeout(render, 300));
})();
