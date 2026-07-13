async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} を読み込めませんでした`);
  return response.json();
}

function showError(container, message) {
  if (container) container.innerHTML = `<p class="load-error">${message}</p>`;
}

async function renderHome() {
  const cardContainer = document.querySelector('#homeCards');

  try {
    const site = await loadJson('content/site.json');
    document.querySelector('#heroEyebrow').textContent = site.hero.eyebrow;
    const titleLines = site.hero.titleLines || [site.hero.title];
    document.querySelector('#heroTitle').innerHTML = titleLines.map(line => `<span class="hero-title-line">${line}</span>`).join('');
    document.querySelector('#heroLead').textContent = site.hero.lead;
    cardContainer.innerHTML = site.homeCards.map(card => `
      <a class="home-card" data-tone="${card.tone}" href="${card.href}">
        <span class="card-number">${card.number}</span>
        <h3>${card.title}</h3>
        <p>${card.description}</p>
        <span class="card-link">${card.linkLabel} →</span>
      </a>`).join('');
  } catch (error) {
    showError(cardContainer, 'トップページの文章を読み込めませんでした。ローカルサーバーから開いてください。');
  }
}

renderHome();
