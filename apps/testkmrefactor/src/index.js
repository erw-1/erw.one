// src/index.js
/* eslint-env browser, es2022 */
'use strict';

import {
  DOC, $, $$,
  __VPW, __VPH, updateViewport,
  whenIdle, domReady, baseURLNoHash,
} from './dom.js';

import {
  // config + cache
  TITLE, MD, CACHE_MIN, readCache, writeCache,
  // model + ops
  pages, root,
  parseMarkdownBundle, attachSecondaryHomes, computeHashes,
  // routing
  parseTarget, buildDeepURL, hashOf,
} from './data.js';

import {
  // main renderer
  render, scrollToAnchor,
  // optional preloads
  ensureHighlight, ensureMarkdown, ensureKatex,
} from './render.js';

import {
  // UI shell
  initUI, closePanels, breadcrumb, highlightSidebar, highlightCurrent, updateMiniViewport,
} from './ui.js';

/* ───────────────────────────── Router ───────────────────────────── */

let currentPage = null;

/** Handle hash-based navigation (both page changes and in-page anchors). */
export async function route() {
  const target = parseTarget(location.hash);
  if (!target) return; // defensive
  const { page, anchor } = target;

  // Same page, just scroll to anchor
  if (currentPage === page) {
    if (anchor) scrollToAnchor(anchor);
    return;
  }

  // New page:
  closePanels();
  breadcrumb(page);
  highlightSidebar(page);

  await render(page, anchor);

  currentPage = page;
}

/* ─────────────────────────── Boot sequence ─────────────────────────── */

(async () => {
  await domReady();

  // Title fallback (in case HTML didn't set it)
  if (TITLE && !document.title) document.title = TITLE;

  // Fetch Markdown bundle (with localStorage TTL cache)
  let txt = '';
  const useCache = !!CACHE_MIN && CACHE_MIN > 0;
  const cached = (MD && useCache) ? readCache(MD) : null;
  const ageMin = cached ? (Date.now() - cached.ts) / 60000 : Infinity;

  try {
    if (!MD) {
      txt = ''; // allow empty bundle (degenerate)
    } else if (cached && ageMin < CACHE_MIN) {
      txt = cached.txt;
    } else {
      const resp = await fetch(MD, { cache: 'no-store' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      txt = await resp.text();
      if (useCache) writeCache(MD, txt);
    }
  } catch (err) {
    // Network failed → fall back to cache if available
    if (cached) {
      txt = cached.txt;
      console.warn('[km] Using cached bundle after fetch error:', err);
    } else {
      console.error('[km] Failed to load bundle and no cache is available:', err);
      txt = '# Home\n\n_Failed to load content._';
    }
  }

  // Build in-memory model
  parseMarkdownBundle(txt);
  attachSecondaryHomes();
  computeHashes();

  // Init UI chrome (header/sidebar/util, theme, search, graph, etc.)
  await initUI();

  // Preload heavy libs when idle (keeps first paint snappy)
  whenIdle(() => { ensureHighlight(); ensureMarkdown(); ensureKatex(); });

  // Disable browser scroll restoration for SPA-y navigation
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  // Initial navigation (allow empty hash → root)
  if (!location.hash) {
    // Use a single '#' so further anchors are '#<id>'
    location.replace('#');
  }
  await route();
  highlightCurrent(true);
})();

/* ─────────────────────── Global event wiring ─────────────────────── */

// Hash router
addEventListener('hashchange', route, { passive: true });

// Keep layout stable on resize and recompute fullscreen graph viewport.
addEventListener('resize', () => {
  updateViewport();
  // On wide screens, auto-close panels and nudge the mini-graph
  if (matchMedia('(min-width:1001px)').matches) {
    closePanels();
    highlightCurrent(true);
  }
  // If the mini graph is fullscreen, refresh its viewport and force a tick
  const mini = $('#mini');
  if (mini?.classList.contains('fullscreen')) {
    updateMiniViewport();
    highlightCurrent(true);
  }
}, { passive: true });

// Close panels upon navigation clicks inside the lists (sidebar + results)
$('#tree')?.addEventListener('click', e => {
  if (e.target.closest('a')) closePanels();
}, { passive: true });
$('#results')?.addEventListener('click', e => {
  if (e.target.closest('a')) closePanels();
}, { passive: true });

// ESC: close panels or exit graph fullscreen (also friendly with help overlay)
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  let acted = false;

  // Close panels if open
  const sidebarOpen = $('#sidebar')?.classList.contains('open');
  const utilOpen = $('#util')?.classList.contains('open');
  if (sidebarOpen || utilOpen) { closePanels(); acted = true; }

  // Exit mini-graph fullscreen
  const mini = $('#mini');
  const expandBtn = $('#expand');
  if (mini?.classList.contains('fullscreen')) {
    mini.classList.remove('fullscreen');
    expandBtn?.setAttribute('aria-pressed', 'false');
    updateMiniViewport();
    highlightCurrent(true);
    acted = true;
  }

  // Best-effort: close help overlay if present
  const kb = $('#kb-overlay') || $('#kb-help');
  if (kb && !kb.hidden) { kb.hidden = true; acted = true; }

  if (acted) e.preventDefault();
});

/* Expose for debugging (optional) */
Object.assign(window.KM, {
  route,
  buildDeepURL,
  hashOf,
  get currentPage() { return currentPage; },
});
