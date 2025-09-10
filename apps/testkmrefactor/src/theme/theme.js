(() => {
  const DOC = document;
  const btn = DOC.querySelector('#theme-toggle');
  const rootEl = DOC.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  const stored = localStorage.getItem('km-theme'); // 'dark' | 'light' | null
  const cfg = (window.DEFAULT_THEME === 'dark' || window.DEFAULT_THEME === 'light') ? window.DEFAULT_THEME : null;
  let dark = stored ? (stored === 'dark') : (cfg ? cfg === 'dark' : media.matches);

  if (typeof window.ACCENT === 'string' && window.ACCENT)
    rootEl.style.setProperty('--color-accent', window.ACCENT);

  apply(dark);

  if (btn) {
    btn.setAttribute('aria-pressed', String(dark));
    btn.onclick = () => {
      dark = !dark;
      apply(dark);
      btn.setAttribute('aria-pressed', String(dark));
      localStorage.setItem('km-theme', dark ? 'dark' : 'light');
    };
  }

  media.addEventListener?.('change', (e) => {
    const hasUserPref = !!localStorage.getItem('km-theme');
    if (!hasUserPref && !cfg) {
      dark = e.matches;
      apply(dark);
    }
  });

  addEventListener('storage', (e) => {
    if (e.key === 'km-theme') {
      dark = e.newValue === 'dark';
      apply(dark);
    }
  });

  function apply(isDark) {
    rootEl.style.setProperty('--color-main', isDark ? 'rgb(29,29,29)' : 'white');
    rootEl.setAttribute('data-theme', isDark ? 'dark' : 'light');
    window.KM?.ensureHLJSTheme?.();
    window.KM?.syncMermaidThemeWithPage?.();
  }
})();
