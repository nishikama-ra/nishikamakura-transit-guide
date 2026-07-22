(() => {
  if (!location.pathname.endsWith('/weather-top-mockup.html')) return;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const weekdays = ['日','月','火','水','木','金','土'];
  const formatDate = value => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return escapeHtml(value);
    return `${d.getMonth() + 1}/${d.getDate()}（${weekdays[d.getDay()]}）`;
  };
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

  const render = async () => {
    ensureStyle();
    const block = await waitForHourlyBlock();
    if (!block) return;

    document.querySelector('.weather-advisories')?.remove();

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

    const sections = [];
    const wbgt = Array.isArray(data.wbgt?.days) ? data.wbgt.days.filter(day => Number.isFinite(Number(day.max))) : [];
    if (wbgt.length && wbgt.some(day => Number(day.max) >= 25)) {
      const cards = wbgt.slice(0, 3).map(day => `<div><small>${escapeHtml(day.label || '')}<br>${formatDate(day.date)}</small><strong>${Math.round(Number(day.max))}</strong><span>${wbgtLabel(Number(day.max))}</span></div>`).join('');
      sections.push(`<section class="weather-advisory heat-advisory"><div class="weather-advisory-head"><strong>暑さ指数（WBGT・辻堂）</strong><span>3日間の予測最高値</span></div><div class="heat-days">${cards}</div><p class="weather-source">出典：環境省 熱中症予防情報サイト　更新：${escapeHtml(data.wbgt.updatedAt || data.updatedAt || '')}</p></section>`);
    }

    const early = Array.isArray(data.earlyWarnings?.items) ? data.earlyWarnings.items : [];
    if (early.length) {
      const items = early.map(item => `<div class="early-warning-item"><strong>${escapeHtml(item.phenomenon)}　警報級の可能性［${escapeHtml(item.level)}］</strong><span>${escapeHtml(item.period || '')}</span></div>`).join('');
      sections.push(`<section class="weather-advisory early-advisory"><div class="weather-advisory-head"><strong>早期注意情報</strong><span>神奈川県東部</span></div><div class="early-warning-list">${items}</div><p class="weather-source">出典：気象庁　発表：${escapeHtml(data.earlyWarnings.reportDatetime || '')}</p></section>`);
    }

    if (!sections.length) {
      block.insertAdjacentHTML('afterend', '<p class="weather-live-status">現在、表示対象の暑さ指数または早期注意情報はありません。</p>');
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = `weather-advisories${sections.length === 1 ? ' single' : ''}`;
    wrapper.innerHTML = sections.join('');
    block.insertAdjacentElement('afterend', wrapper);
  };

  window.addEventListener('load', () => setTimeout(render, 300));
})();
