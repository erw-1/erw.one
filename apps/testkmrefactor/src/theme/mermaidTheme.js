/* eslint-env browser, es2022 */
// Utilise le setter exposé par render/markdown.js
export function syncMermaidThemeWithPage(mdParser) {
  const mode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default';
  mdParser?.setMermaidTheme?.(mode);
}
