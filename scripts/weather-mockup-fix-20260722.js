(() => {
  if (!location.pathname.endsWith('/weather-top-mockup.html')) return;

  const style = document.createElement('style');
  style.id = 'weather-mockup-overlap-fix-style';
  style.textContent = `
    .hero{background-position:right 18%!important}
    .hero>*{z-index:1}
    .hero::after{content:"";position:absolute;right:0;bottom:0;left:0;z-index:0;height:96px;pointer-events:none;background:linear-gradient(to bottom,rgba(247,252,254,0),rgba(247,252,254,.84) 52%,rgba(247,252,254,.98) 100%)}
    @media(max-width:820px){.hero{background-position:50% 18%!important}}
  `;
  document.head.appendChild(style);

  const guardId = 'weatherLegacyAdvisoryGuard';
  const ensureGuard = () => {
    if (document.querySelector('.weather-advisories:not(#weatherLegacyAdvisoryGuard)')) return;
    if (document.getElementById(guardId)) return;
    const guard = document.createElement('div');
    guard.id = guardId;
    guard.className = 'weather-advisories';
    guard.hidden = true;
    guard.setAttribute('aria-hidden', 'true');
    document.body.appendChild(guard);
  };

  ensureGuard();

  const observer = new MutationObserver(() => {
    const liveAdvisory = document.querySelector('.weather-advisories:not(#weatherLegacyAdvisoryGuard)');
    if (liveAdvisory) {
      document.getElementById(guardId)?.remove();
      observer.disconnect();
      return;
    }
    ensureGuard();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();