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
})();
