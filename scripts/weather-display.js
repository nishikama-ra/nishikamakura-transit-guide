(() => {
  const content = document.getElementById('weatherContent');
  if (!content) return;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
  const todayKey = () => new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const formatClock = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', hour: 'numeric', minute: '2-digit'
    }).format(date);
  };
  const formatReport = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit'
    }).format(date);
  };
  const formatTargetDate = value => {
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T00:00:00+09:00` : value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short'
    }).format(date);
  };
  const sameHtml = (element, html) => {
    if (element && element.innerHTML !== html) element.innerHTML = html;
  };
  const sameText = (element, text) => {
    if (element && element.textContent !== text) element.textContent = text;
  };

  const ensureStyle = () => {
    if (document.getElementById('weather-display-style')) return;
    const style = document.createElement('style');
    style.id = 'weather-display-style';
    style.textContent = `
      .weather-today .weather-day-label{margin:3px 0 0}
      .weather-today-range{display:flex;gap:5px 9px;align-items:baseline;flex-wrap:wrap}
      .weather-range-report{color:#748589;font-size:.62rem;font-weight:400}
      .weather-daily-source{margin:0;padding:5px 18px 8px;color:#78898d;background:#fff;font-size:.61rem}
      .wbgt-guide{margin-top:8px!important}
      .wbgt-guide a{color:#526f76;text-decoration:underline;text-underline-offset:2px}
      .heat-alert{grid-column:1/-1;background:#fffaf7;border-bottom:1px solid #d8e4e5}
      .heat-alert+.weather-advisory{border-left:0}
      .heat-alert-list{display:grid;gap:8px}
      .heat-alert-item{padding:9px 11px;border:1px solid #e1d8cf;border-radius:9px;background:#fff}
      .heat-alert-item.special{border-color:#d9c5c0;background:#fff9f8}
      .heat-alert-item-head{display:flex;justify-content:space-between;gap:10px;align-items:baseline}
      .heat-alert-item-head strong{font-size:.78rem;color:#384e53}
      .heat-alert-item-head span{font-size:.64rem;color:#6e7d80;text-align:right}
      .heat-alert-item p{margin:4px 0 0!important;font-size:.7rem!important;color:#435d63!important;line-height:1.55!important}
      .heat-alert-item .heat-alert-area{font-weight:700}
      .heat-alert-explanations{margin-top:9px;padding:9px 11px;border-top:1px solid #e1d8cf;color:#435d63}
      .heat-alert-explanations p{margin:0!important;font-size:.7rem!important;line-height:1.55!important}
      .heat-alert-explanations p+p{margin-top:5px!important}
      .heat-alert-explanations strong{color:#384e53}
      .heat-alert .weather-source a{color:inherit}
      @media(max-width:720px){.weather-daily-source{padding:5px 14px 8px}.heat-alert-item-head{align-items:flex-start;flex-direction:column;gap:2px}.heat-alert-item-head span{text-align:left}}
    `;
    document.head.appendChild(style);
  };

  const renderToday = data => {
    const primary = content.querySelector('.weather-today .weather-primary-temp');
    const dayLabel = content.querySelector('.weather-today .weather-day-label');
    const range = content.querySelector('.weather-today .weather-today-range');
    if (!primary || !dayLabel) return;

    if (primary.nextElementSibling !== dayLabel) primary.insertAdjacentElement('afterend', dayLabel);
    if (range && dayLabel.nextElementSibling !== range) dayLabel.insertAdjacentElement('afterend', range);

    const forecastSection = data.temperatureForecasts || {};
    const forecast = forecastSection.days?.[todayKey()] || {};
    const max = Number(forecast.max);
    const min = Number(forecast.min);
    const reportTimes = [forecast.maxReportDatetime, forecast.minReportDatetime].filter(Boolean).sort();
    const report = reportTimes.length ? formatClock(reportTimes.at(-1)) : '';
    if (range) {
      const areaName = forecastSection.areaName || forecast.areaName || '横浜';
      const maxText = Number.isFinite(max) ? `${Math.round(max)}℃` : '―';
      const minText = Number.isFinite(min) ? `${Math.round(min)}℃` : '―';
      const reportText = report ? `<span class="weather-range-report">（${escapeHtml(areaName)}：${escapeHtml(report)}発表）</span>` : '';
      sameHtml(range, `予想最高 <strong>${maxText}</strong> ／ 最低 <strong>${minText}</strong>${reportText}`);
    }
    content.querySelector('.weather-range-source')?.remove();
  };

  const renderDailySource = () => {
    const layout = content.querySelector('.weather-layout');
    if (!layout) return;
    let source = content.querySelector('.weather-daily-source');
    if (!source) {
      source = document.createElement('p');
      source.className = 'weather-daily-source';
    }
    sameText(source, '出典：気象庁発表');
    if (layout.nextElementSibling !== source) layout.insertAdjacentElement('afterend', source);
  };

  const renderHourlySource = () => {
    content.querySelectorAll('.hour-source').forEach(source => sameText(source, '出典：Open-Meteo JMAモデル'));
  };

  const renderWbgtGuide = () => {
    const heat = content.querySelector('.heat-advisory');
    if (!heat) return;
    heat.querySelector('.weather-advisory-head > span')?.remove();
    let guide = heat.querySelector('.wbgt-guide');
    if (!guide) {
      guide = document.createElement('p');
      guide.className = 'wbgt-guide';
      const source = heat.querySelector('.weather-source');
      if (source) source.insertAdjacentElement('beforebegin', guide);
      else heat.appendChild(guide);
    }
    sameHtml(guide, '<a href="https://www.wbgt.env.go.jp/wbgt.php" target="_blank" rel="noopener">25～27 警戒　28～30 厳重警戒　31～ 危険</a>');
  };

  const renderHeatAlerts = data => {
    const sectionData = data.heatAlerts || {};
    const alerts = Array.isArray(sectionData.days) ? sectionData.days.filter(item => item && (item.level === 'warning' || item.level === 'special')) : [];
    const block = content.querySelector('.hourly-block');
    if (!block) return;

    let status = document.getElementById('heatAlertFetchStatus');
    if (sectionData.status === 'error') {
      if (!status) {
        status = document.createElement('p');
        status.id = 'heatAlertFetchStatus';
        status.className = 'weather-live-status';
        block.insertAdjacentElement('afterend', status);
      }
      sameText(status, '熱中症警戒アラート情報を取得できませんでした。');
    } else {
      status?.remove();
    }

    let section = document.getElementById('heatAlertNotice');
    if (!alerts.length) {
      section?.remove();
      return;
    }

    let wrapper = content.querySelector('.weather-advisories');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'weather-advisories';
      block.insertAdjacentElement('afterend', wrapper);
    }
    if (!section) {
      section = document.createElement('section');
      section.id = 'heatAlertNotice';
      section.className = 'weather-advisory heat-alert';
    }

    const items = alerts.map(item => {
      const special = item.level === 'special';
      const title = special ? '熱中症特別警戒アラート' : '熱中症警戒アラート';
      const report = formatReport(item.reportDatetime);
      const targetDate = formatTargetDate(item.date);
      const targetText = targetDate ? `${targetDate}対象` : '対象日';
      const areaName = item.areaName || '神奈川県';
      return `<div class="heat-alert-item ${special ? 'special' : 'warning'}"><div class="heat-alert-item-head"><strong>${escapeHtml(targetText)}　${title}</strong><span>${escapeHtml(report ? `${report}発表` : '')}</span></div><p class="heat-alert-area">${escapeHtml(areaName)}</p></div>`;
    }).join('');
    const explanations = '<div class="heat-alert-explanations"><p><strong>熱中症警戒アラート：</strong>高齢者、こども等は熱中症になりやすいので特に注意してください。</p><p><strong>熱中症特別警戒アラート：</strong>熱中症対策を徹底できていない場合は、運動、外出、イベント等の中止、延期、変更等を判断してください。</p></div>';
    const sourcePage = sectionData.sourcePage || 'https://www.wbgt.env.go.jp/alert.php';
    const heading = alerts.some(item => item.level === 'special') ? '熱中症特別警戒アラート' : '熱中症警戒アラート';
    sameHtml(section, `<div class="weather-advisory-head"><strong>${heading}</strong><span>神奈川県</span></div><div class="heat-alert-list">${items}</div>${explanations}<p class="weather-source"><a href="${escapeHtml(sourcePage)}" target="_blank" rel="noopener">出典：環境省 熱中症予防情報サイト</a></p>`);
    if (wrapper.firstElementChild !== section) wrapper.prepend(section);

    const secondaryCount = wrapper.querySelectorAll(':scope > .weather-advisory:not(.heat-alert)').length;
    wrapper.classList.toggle('single', secondaryCount <= 1);
    content.querySelectorAll('.weather-live-status').forEach(element => {
      if (element.textContent?.startsWith('現在、表示対象の暑さ指数')) element.remove();
    });
  };

  const start = async () => {
    ensureStyle();
    let data = {};
    try {
      const response = await fetch(`content/weather-live.json?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`weather-live ${response.status}`);
      data = await response.json();
    } catch (error) {
      console.error(error);
    }

    let scheduled = false;
    const apply = () => {
      scheduled = false;
      renderToday(data);
      renderDailySource();
      renderHourlySource();
      renderWbgtGuide();
      renderHeatAlerts(data);
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(apply, 40);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(content, { childList: true, subtree: true, characterData: true });
    schedule();
    setTimeout(() => observer.disconnect(), 15000);
  };

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();