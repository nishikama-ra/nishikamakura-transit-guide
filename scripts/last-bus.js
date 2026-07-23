const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const toMinutes = value => {
  if (!/^\d{1,2}:\d{2}$/.test(value || '')) return -1;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

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

function routeCode(service) {
  return service.route.match(/^(?:[A-Z]+\d+|鎌\d+)/)?.[0] || '';
}

function departureKey(service) {
  return service.departureId || routeCode(service);
}

function operatorName(service) {
  if (service.operator) return service.operator;
  if (service.mode === '路線バス') return '江ノ電バス';
  if (service.mode === 'モノレール') return '湘南モノレール';
  return '江ノ電';
}

function nearbyPlaces(service) {
  if (service.headlineStops?.length) return service.headlineStops;
  return [...(service.areaStops?.stations || []), ...(service.areaStops?.busStops || [])].slice(0, 3);
}

function renderDepartureChart(timetableData, departureData, day) {
  const chart = document.querySelector('#departureChart');
  const startMinutes = 5 * 60;
  const endMinutes = 24 * 60;
  const dayLabel = day === 'weekday' ? '平日' : '土休日';
  const position = time => (toMinutes(time) - startMinutes) / (endMinutes - startMinutes) * 100;
  const axisHours = [5, 8, 11, 14, 17, 20, 23, 24];
  const originOrder = ['大船駅', '鎌倉駅', '藤沢駅'];
  const originRank = name => {
    const rank = originOrder.indexOf(name);
    return rank === -1 ? originOrder.length : rank;
  };
  const groups = [...timetableData.origins]
    .sort((a, b) => originRank(a.name) - originRank(b.name))
    .map(origin => {
      const rows = [...origin.services]
        .map(service => ({ service, times: departureData.routes?.[departureKey(service)]?.[day] || [] }))
        .filter(item => item.times.length)
        .sort((a, b) => toMinutes(b.times[b.times.length - 1]) - toMinutes(a.times[a.times.length - 1]))
        .map(({ service, times }) => {
          const code = routeCode(service);
          const routeName = code ? service.route.replace(/^(?:[A-Z]+\d+|鎌\d+)\s*/, '') : service.route;
          const displayName = `${code ? `${code} ` : ''}${routeName}`;
          const first = position(times[0]);
          const last = position(times[times.length - 1]);
          const nearby = nearbyPlaces(service);
          const dots = times.map(time => {
            const left = position(time);
            return `<button type="button" class="departure-dot" style="left:${left}%" data-time="${escapeHtml(time)}" title="${escapeHtml(time)}" aria-label="${escapeHtml(`${displayName} ${dayLabel} ${time}発`)}"></button>`;
          }).join('');
          return `<div class="departure-chart-row">
            <div class="departure-chart-label">
              <strong>${code ? `<span>${escapeHtml(code)}</span> ` : ''}${escapeHtml(routeName)}</strong>
              <small>${escapeHtml(operatorName(service))}｜${escapeHtml(service.boarding)}</small>
              <small class="departure-chart-nearby">${nearby.length ? `近く：${nearby.map(escapeHtml).join('・')}` : ''}<a href="${escapeHtml(service.href)}" target="_blank" rel="noopener">時刻表 ↗</a></small>
            </div>
            <div class="departure-chart-plot" role="group" aria-label="${escapeHtml(`${displayName} ${dayLabel}の発車時刻`)}">
              <i class="departure-range-line" style="left:${first}%;width:${last - first}%" aria-hidden="true"></i>${dots}
            </div>
          </div>`;
        }).join('');
      const axis = axisHours.map(hour => `<span style="left:${position(`${String(hour).padStart(2, '0')}:00`)}%">${hour}:00</span>`).join('');
      return `<section class="departure-chart-group">
        <div class="departure-chart-group-heading"><h3><span>${escapeHtml(origin.name)}から</span></h3><div class="departure-chart-axis" aria-hidden="true">${axis}</div></div>
        ${rows}
      </section>`;
    }).join('');
  chart.innerHTML = groups;
}

function fetchJson(url) {
  return fetch(url).then(response => {
    if (!response.ok) throw new Error();
    return response.json();
  });
}

Promise.all([
  fetchJson('content/timetables.json?v=20260723-3'),
  fetchJson('content/bus-departures.json?v=20260723-3').catch(() => null)
])
  .then(([data, departureData]) => {
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

    const chartStatus = document.querySelector('#departureChartStatus');
    if (!departureData) {
      chartStatus.innerHTML = '<span class="load-error">発車時間帯を読み込めませんでした。</span>';
      return;
    }
    let selectedDay = 'weekday';
    const updateChart = () => {
      renderDepartureChart(data, departureData, selectedDay);
      chartStatus.textContent = departureData.status;
      document.querySelectorAll('[data-schedule-day]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.scheduleDay === selectedDay));
      });
    };
    document.querySelectorAll('[data-schedule-day]').forEach(button => {
      button.addEventListener('click', () => {
        selectedDay = button.dataset.scheduleDay;
        updateChart();
      });
    });
    updateChart();
  })
  .catch(() => {
    document.querySelector('#timetableStatus').innerHTML = '<p class="load-error">最終便情報を読み込めませんでした。ローカルサーバーから開いてください。</p>';
  });
