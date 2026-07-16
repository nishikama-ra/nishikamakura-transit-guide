const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function routeHeading(service) {
  if (service.mode !== '路線バス') return service.destination ? `${escapeHtml(service.destination)}まで` : escapeHtml(service.stopsHeading);
  const via = (service.headlineStops || []).map(escapeHtml).join('／');
  return `${via ? `${via} 経由 ` : ''}${escapeHtml(service.destination)}へ`;
}

function reachableIcon(kind) {
  if (kind === 'station') return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="14" rx="3"></rect><path d="M8 7h8M8 12h8M8 20l2-3M16 17l2 3"></path></svg>';
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="3" width="11" height="10" rx="2"></rect><path d="M9 6h5M8 10h7M17 7h2v13M16 20h4"></path></svg>';
}

function reachableGroup(kind, items) {
  if (!items?.length) return '';
  const label = kind === 'station' ? '西鎌倉周辺の駅' : '西鎌倉周辺のバス停';
  return `<section class="reachable-group"><h4>${reachableIcon(kind)}<span class="reachable-label">${label}</span><span class="reachable-count">${items.length}</span></h4><ol>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol></section>`;
}

fetch('content/timetables.json')
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
    document.querySelector('#departureGrid').innerHTML = data.origins.map(origin => `
      <section class="departure-panel" data-tone="${origin.tone}">
        <h2>${escapeHtml(origin.name)}から</h2>
        ${[...origin.services].sort((a, b) => Math.min(toMinutes(a.weekday), toMinutes(a.holiday)) - Math.min(toMinutes(b.weekday), toMinutes(b.holiday))).map(service => `
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
