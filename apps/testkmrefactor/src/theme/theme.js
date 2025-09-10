/* eslint-env browser, es2022 */
// mermaidTheme
export async function syncMermaidThemeWithPage() {
  const mode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default';

  // Pull helpers from the markdown loader, like the original does.
  const { setMermaidTheme, renderMermaidLazy } = await (window.KM?.ensureMarkdown?.() || Promise.resolve({}));

  // Update Mermaid's config to the new theme
  setMermaidTheme?.(mode);

  // Reset → re-run Mermaid for a given container
  async function resetAndRerender(root) {
    if (!root) return;
    root.querySelectorAll('.mermaid').forEach(el => {
      if (!el.dataset.mmdSrc) el.dataset.mmdSrc = el.textContent;
      if (el.querySelector('svg')) el.innerHTML = el.dataset.mmdSrc;
      el.removeAttribute('data-processed'); // Mermaid's own flag
      delete el.dataset.mmdDone;            // allow re-render guard to run again
    });
    await renderMermaidLazy?.(root);
  }

  // Main content
  await resetAndRerender(document.getElementById('content'));

  // Link previews (the preview HTML container is the first-level div)
  document.querySelectorAll('.km-link-preview').forEach(p => {
    resetAndRerender(p.querySelector(':scope > div'));
  });
}

// hljsTheme
let linkEl;

const THEMES = {
  light: 'https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/styles/github.min.css',
  dark:  'https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/styles/github-dark.min.css'
};

export function ensureHLJSTheme(mode) {
  const m = mode || (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  if (!linkEl) {
    linkEl = document.createElement('link');
    linkEl.rel = 'stylesheet';
    document.head.append(linkEl);
  }
  linkEl.href = THEMES[m] || THEMES.light;
}

// theme
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
