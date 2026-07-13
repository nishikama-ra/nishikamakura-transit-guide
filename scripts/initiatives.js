const renderInitiatives = (container, items) => {
  container.innerHTML = items.map(item => `
      <article class="initiative-card">
        <div class="initiative-org">${item.organization}</div>
        <div><h2>${item.title}</h2><p>${item.description}</p></div>
        <a href="${item.href}" target="_blank" rel="noopener">${item.linkLabel} ↗</a>
      </article>`).join('');
};

Promise.all([
  fetch('content/initiatives.json').then(response => {
    if (!response.ok) throw new Error();
    return response.json();
  }),
  fetch('content/instagram.json').then(response => {
    if (!response.ok) throw new Error();
    return response.json();
  })
])
  .then(([data, posts]) => {
    renderInitiatives(document.querySelector('#municipalInitiatives'), data.municipal);
    renderInitiatives(document.querySelector('#communityInitiatives'), data.community);
    renderInitiatives(document.querySelector('#otherInitiatives'), data.otherBusiness);
    document.querySelector('#instagramPosts').innerHTML = posts.map((post, index) => {
      const cleanUrl = post.url.replace(/\?.*$/, '').replace(/\/$/, '');
      return `<iframe class="instagram-frame" src="${cleanUrl}/embed/captioned/" title="Instagramのお知らせ ${index + 1}" loading="lazy" allowtransparency="true" scrolling="no"></iframe>`;
    }).join('');
  })
  .catch(() => {
    document.querySelector('#municipalInitiatives').innerHTML = '<p class="load-error">取り組み情報を読み込めませんでした。ローカルサーバーから開いてください。</p>';
  });
