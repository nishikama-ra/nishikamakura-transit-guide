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
        <h2>${origin.name}から</h2>
        ${[...origin.services].sort((a, b) => Math.min(toMinutes(a.weekday), toMinutes(a.holiday)) - Math.min(toMinutes(b.weekday), toMinutes(b.holiday))).map(service => `
          <div class="departure-row">
            <div class="departure-detail"><span class="mode-label">${service.mode}</span><h3>${service.stopsHeading}</h3><p class="route-name">${service.route}</p><p>この便で行ける地域内の駅・バス停：${service.stops.replace(/^主な停車(先|駅)：/, '')}</p>${service.boarding ? `<p>乗車場所：${service.boarding}</p>` : ''}</div>
            <div class="departure-schedule"><div><small>平日</small><strong>${service.weekday}</strong></div><div><small>土休日</small><strong>${service.holiday}</strong></div><a class="row-source" href="${service.href}" target="_blank" rel="noopener">公式時刻表 ↗</a></div>
          </div>`).join('')}
      </section>`).join('');
    document.querySelector('#officialLinks').innerHTML = data.official.map(link => `<a href="${link.href}" target="_blank" rel="noopener">${link.label} ↗</a>`).join('');
  })
  .catch(() => {
    document.querySelector('#timetableStatus').innerHTML = '<p class="load-error">最終便情報を読み込めませんでした。ローカルサーバーから開いてください。</p>';
  });
