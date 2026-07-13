const stop = process.argv[2];
if (!stop) throw new Error('停留所名を指定してください');
const headers = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'accept-language': 'ja,en-US;q=0.9,en;q=0.8'
};
const api = `https://www.enoden.co.jp/bus/api/v2/stops/search?keyword=${encodeURIComponent(stop)}&method=0`;
const search = await fetch(api, { headers }).then(response => response.json());
const code = search?.response?.[0]?.id;
if (!code) throw new Error(`${stop} が見つかりません`);

function extract(html) {
  const reveal = html.replace(/<!--/g, '').replace(/-->/g, '');
  const routes = {};
  for (const row of reveal.matchAll(/<div class="line-switch-row"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g)) {
    const texts = [...row[1].matchAll(/<[^>]+>|([^<]+)/g)].map(match => (match[1] || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const id = texts.find(text => /^\d{3,5}$/.test(text));
    const nameIndex = texts.findIndex(text => /\[/.test(text));
    if (id) routes[id] = { name: texts[nameIndex] || '', destination: texts[nameIndex + 1] || '' };
  }
  const last = {};
  for (const row of reveal.matchAll(/<div class="time-schedule-row"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g)) {
    const hour = Number(row[1].match(/time-schedule-td-hour[^>]*>\s*([^<]+)/)?.[1]);
    if (!Number.isFinite(hour)) continue;
    for (const minute of row[1].matchAll(/<div class="time-schedule-minute"[^>]*route_id="([^"]+)"[^>]*>[\s\S]*?<span class="num">([^<]+)<\/span>/g)) {
      last[minute[1]] = `${hour}:${minute[2].trim().padStart(2, '0')}`;
    }
  }
  return Object.entries(last).map(([id, time]) => ({ id, ...routes[id], time }));
}

for (let pole = 1; pole <= 8; pole++) {
  const url = `https://www.enoden.co.jp/bus/route/stops/${code}/timetable/${pole}`;
  const html = await fetch(url, { headers }).then(response => response.text());
  const services = extract(html);
  if (services.length) console.log(JSON.stringify({ stop, code, pole, services, url }, null, 2));
}
