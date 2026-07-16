const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function routeHeading(service) {
  if (service.mode !== '路線バス') return service.destination ? `${escapeHtml(service.destination)}まで` : escapeHtml(service.stopsHeading);
  const via = (service.headlineStops || []).map(escapeHtml).join('／');
  return `${via ? `${via} 経由 ` : ''}${escapeHtml(service.destination)}へ`;
}

function reachableIcon(kind) {
  const icon = kind === 'station'
    ? '<path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"></path><path d="m9 15-1-1"></path><path d="m15 15 1-1"></path><path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"></path><path d="m8 19-2 3"></path><path d="m16 19 2 3"></path>'
    : '<path d="M4 6 2 7"></path><path d="M10 6h4"></path><path d="m22 7-2-1"></path><rect width="16" height="16" x="4" y="3" rx="2"></rect><path d="M4 11h16"></path><path d="M8 15h.01"></path><path d="M16 15h.01"></path><path d="M6 19v2"></path><path d="M18 21v-2"></path>';
  return `<span class="reachable-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></span>`;
}

function reachableGroup(kind, items) {
  if (!items?.length) return '';
  const label = kind === 'station' ? '停車駅' : '近くのバス停';
  return `<section class="reachable-group"><h4>${reachableIcon(kind)}<span class="reachable-label">${label}</span><span class="reachable-count">${items.length}</span></h4><ol>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol></section>`;
}

fetch('content/timetables.json?v=20260716-3')
  .then(response => {
    if (!response.ok) throw new Error();
    return response.json();
  })
  .then(data => {
    const toMinutes = value => {
      const [hours, minutes] = value.split(':').map(Number);
      return hours * 60 + minutes;
    };
    document.querySelector('#timetableStatus').textContent = data.status;
    const originOrder = ['大船駅', '鎌倉駅', '藤沢駅'];
    const originRank = name => {
      const rank = originOrder.indexOf(name);
      return rank === -1 ? originOrder.length : rank;
    };
    document.querySelector('#departureGrid').innerHTML = [...data.origins]
      .sort((a, b) => originRank(a.name) - originRank(b.name))
      .map(origin => `
      <section class="departure-panel" data-tone="${origin.tone}">
        <h2>${escapeHtml(origin.name)}から</h2>
        ${[...origin.services].sort((a, b) => toMinutes(b.weekday) - toMinutes(a.weekday)).map(service => `
          <div class="departure-row"${service.routeId ? ` data-route-id="${escapeHtml(service.routeId)}"` : ''}>
            <div class="departure-detail"><span class="mode-label">${escapeHtml(service.mode)}</span><h3>${routeHeading(service)}</h3><p class="route-name">${escapeHtml(service.route)}</p>${service.boarding ? `<p>乗車場所：${escapeHtml(service.boarding)}</p>` : ''}</div>
            <div class="departure-schedule"><div><small>平日</small><strong>${escapeHtml(service.weekday)}</strong></div><div><small>土休日</small><strong>${escapeHtml(service.holiday)}</strong></div><a class="row-source" href="${escapeHtml(service.href)}" target="_blank" rel="noopener">公式時刻表 ↗</a></div>
            <div class="reachable-stops"><div class="reachable-groups">${reachableGroup('station', service.areaStops?.stations)}${reachableGroup('bus-stop', service.areaStops?.busStops)}</div></div>
          </div>`).join('')}
      </section>`).join('');
    document.querySelector('#officialLinks').innerHTML = data.official.map(link => `<a href="${escapeHtml(link.href)}" target="_blank" rel="noopener">${escapeHtml(link.label)} ↗</a>`).join('');
  })
  .catch(() => {
    document.querySelector('#timetableStatus').innerHTML = '<p class="load-error">最終便情報を読み込めませんでした。ローカルサーバーから開いてください。</p>';
  });
