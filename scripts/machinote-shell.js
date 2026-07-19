(() => {
  const root = document.querySelector('[data-machinote-header]');
  if (!root) return;
  const body = document.body;
  const page = body.dataset.mnPage || '';
  const base = body.dataset.mnBase || '.';
  const href = (name, fallback) => body.dataset[name] || `${base}/${fallback}`;
  const nav = [
    ['home', href('mnHome', 'index.html'), 'ホーム'],
    ['maps', href('mnMaps', 'regional-maps.html'), '地域情報・地図'],
    ['transport', href('mnTransport', 'index.html#public-transit'), '交通'],
    ['school', href('mnSchool', 'school-districts.html'), '公立小中学校の学区']
  ];
  root.innerHTML = `
    <header class="mn-site-header">
      <div class="mn-shell mn-header-inner">
        <a class="mn-brand" href="${href('mnMaps', 'regional-maps.html')}" aria-label="にしかま周辺 まちノート 地域情報・地図">
          <img class="mn-brand-logo" src="${base}/assets/icons/brand.svg" alt="">
          <span class="mn-brand-copy"><small>にしかま周辺</small><strong>まちノート</strong><em>Nishikama Area Notes</em></span>
        </a>
        <button class="mn-menu-button" type="button" aria-label="メニューを開く" aria-expanded="false">☰</button>
        <nav class="mn-global-nav" aria-label="主なページ">
          ${nav.map(([id, url, label]) => `<a href="${url}"${page === id ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
        </nav>
      </div>
    </header>`;
  const button = root.querySelector('.mn-menu-button');
  const menu = root.querySelector('.mn-global-nav');
  button.addEventListener('click', () => {
    const open = menu.classList.toggle('is-open');
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
  });
})();
