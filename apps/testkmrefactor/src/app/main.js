/* eslint-env browser, es2022 */
import { domReady } from '../core/dom.js';
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
import { ensureHLJSTheme } from '../theme/hljsTheme.js';
import { syncMermaidThemeWithPage } from '../theme/mermaidTheme.js';

async function fetchBundle(url) {
  if (!url) throw new Error('CFG.MD manquant');
  // cache localStorage optionnel
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

async function boot() {
  await domReady();
  const [txt, md] = await Promise.all([ fetchBundle(MD), ensureMarkdown() ]);
  parseMarkdownBundle(txt);
  computeHashes();

  // Première route (affiche la page courante)
  await route(md);

  // Init UI (une seule fois)
  initSidebar({ onNav: () => {/* hook si besoin */} });
  initSearch();
  initLinkPreviews();
  await buildGraph();

  // Thèmes dépendants
  ensureHLJSTheme();               // light/dark initial
  syncMermaidThemeWithPage(md);    // mermaid suit le thème

  // Synchronisation initiale des éléments dépendants de la page
  const { page } = parseTarget(location.hash);
  highlightSidebar(page);
  buildToc();
  breadcrumb(page);
  highlightCurrent(page);

  // Réagir à la navigation
  window.addEventListener('hashchange', () => {
    const { page } = parseTarget(location.hash);
    highlightSidebar(page);
    buildToc();
    breadcrumb(page);
    highlightCurrent(page);
  }, { passive: true });
}

boot().catch(err => {
  console.error(err);
  const el = document.getElementById('content') || document.body;
  el.innerHTML = `<p style="color:crimson">Startup error: ${String(err)}</p>`;
});

