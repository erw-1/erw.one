/* eslint-env browser, es2022 */
import { domReady, $ } from '../core/namespace_dom.js';
import { MD, CACHE_MIN } from '../core/config.js';
import { readCache, writeCache } from '../core/cache.js';
import { parseMarkdownBundle, computeHashes } from '../model/bundle.js';
import { ensureMarkdown } from '../render/markdown.js';
import { route, parseTarget } from './router.js';

import { initSidebar, highlightSidebar } from '../ui/sidebar.js';
import { buildToc } from '../ui/toc.js';
import { breadcrumb } from '../ui/breadcrumb.js';
import { initLinkPreviews } from '../ui/previews.js';
import { initSearch } from '../search/search.js';
import { buildGraph, highlightCurrent } from '../graph/mini.js';
import { syncMermaidThemeWithPage, ensureHLJSTheme } from '../theme/theme.js';

/* side-effect modules faithful to original behavior */
import '../theme/theme.js';
import '../app/keybinds.js';

async function fetchBundle(url) {
  if (!url) throw new Error('CFG.MD manquant');
  const cached = readCache(url);
  if (cached && CACHE_MIN > 0) {
    const ageMin = (Date.now() - cached.ts) / 60000;
    if (ageMin < CACHE_MIN) return cached.txt;
  }
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Fetch MD failed: ${res.status}`);
  const txt = await res.text();
  if (CACHE_MIN > 0) writeCache(url, txt);
  return txt;
}

/* faithful global toggles used by keybinds/help */
function toggleClass(sel, cls) { const el = $(sel); if (el) el.classList.toggle(cls); }
window.__kmToggleSidebar = () => toggleClass('#sidebar', 'open');
window.__kmToggleUtil    = () => toggleClass('#util', 'open');
window.__kmToggleCrumb   = () => toggleClass('#crumb', 'closed');

async function boot() {
  await domReady();
  const [txt, md] = await Promise.all([fetchBundle(MD), ensureMarkdown()]);
  parseMarkdownBundle(txt);
  computeHashes();

  // expose theme hooks for theme.js (faithful to original globals)
  window.KM = window.KM || {};
  window.KM.ensureHLJSTheme = () => ensureHLJSTheme();
  window.KM.syncMermaidThemeWithPage = () => syncMermaidThemeWithPage(md);

  // first route render
  await route(md);

  // one-time UI init
  initSidebar({ onNav: () => {} });
  initSearch();
  initLinkPreviews();
  await buildGraph();

  // initial theme-dependent sync
  ensureHLJSTheme();
  syncMermaidThemeWithPage(md);

  // initial per-page sync
  const { page } = parseTarget(location.hash);
  highlightSidebar(page);
  buildToc();
  breadcrumb(page);
  highlightCurrent(page);

  // react to navigation
  window.addEventListener(
    'hashchange',
    () => {
      const { page } = parseTarget(location.hash);
      highlightSidebar(page);
      buildToc();
      breadcrumb(page);
      highlightCurrent(page);
    },
    { passive: true }
  );
}

boot().catch(err => {
  console.error(err);
  const el = document.getElementById('content') || document.body;
  el.innerHTML = `<p style="color:crimson">Startup error: ${String(err)}</p>`;
});


