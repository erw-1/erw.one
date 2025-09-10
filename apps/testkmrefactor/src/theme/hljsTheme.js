/* eslint-env browser, es2022 */
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
