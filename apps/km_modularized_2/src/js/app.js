/* eslint-env browser, es2022 */
'use strict';

import { TITLE, MD, DEFAULT_THEME, ACCENT, CACHE_MIN, readCache, writeCache, DOC, $, el, __updateViewport, baseURLNoHash} from './config_dom.js';
import { __model, parseMarkdownBundle, attachSecondaryHomes, computeHashes, nav } from './model.js';
import { wireCopyButtons } from './markdown.js';
import { buildTree, setFolderOpen, closePanels, initKeybinds, initPanelToggles } from './ui.js';
import { search } from './search.js';
import { buildGraph, highlightCurrent, updateMiniViewport } from './graph.js';
import { buildDeepURL, route, attachLinkPreviews, parseTarget } from './router_renderer.js';
import { ensureHLJSTheme, syncMermaidThemeWithPage } from './loaders.js';

/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Reusable debounce utility.
 * Returns a debounced wrapper that delays invoking `fn` until after `wait` ms
 * have elapsed since the last call. Passes through the latest arguments.
 */
function debounce(fn, wait = 150) {
  let t = 0, lastArgs, lastThis;
  const invoke = () => { t = 0; fn.apply(lastThis, lastArgs); };
  const schedule = () => {
    // Try to be nice to the main thread if supported.
    if (typeof requestIdleCallback === 'function') {
      t = requestIdleCallback(invoke, { timeout: wait });
    } else {
      t = setTimeout(invoke, wait);
    }
  };
  return function debounced(...args) {
    lastArgs = args; lastThis = this;
    if (t) {
      if (typeof cancelIdleCallback === 'function') cancelIdleCallback(t);
      clearTimeout(t);
      t = 0;
    }
    schedule();
  };
}

/* Keep this in sync with the CSS breakpoint. */
const DESKTOP_MEDIA_QUERY = '(min-width:1001px)';

let currentPage = null;
let uiInited = false;

/* -------------------------------------------------------------------------- */
/* Theme                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Initializes theme button, listeners, and applies persisted or system theme.
 * Extracted from an IIFE for readability and testability.
 */
function initTheme() {
  const btn = $('#theme-toggle');
  const rootEl = DOC.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  const stored = localStorage.getItem('km-theme');
  const cfg = (DEFAULT_THEME === 'dark' || DEFAULT_THEME === 'light') ? DEFAULT_THEME : null;
  let dark = stored ? (stored === 'dark') : (cfg ? cfg === 'dark' : media.matches);

  if (typeof ACCENT === 'string' && ACCENT) rootEl.style.setProperty('--color-accent', ACCENT);

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

  media.addEventListener?.('change', e => {
    const hasUserPref = !!localStorage.getItem('km-theme');
    if (!hasUserPref && !cfg) {
      dark = e.matches;
      apply(dark);
    }
  });

  addEventListener('storage', e => {
    if (e.key === 'km-theme') {
      dark = e.newValue === 'dark';
      apply(dark);
    }
  });

  function apply(isDark) {
    rootEl.style.setProperty('--color-main', isDark ? 'rgb(29,29,29)' : 'white');
    rootEl.setAttribute('data-theme', isDark ? 'dark' : 'light');
    ensureHLJSTheme();
    syncMermaidThemeWithPage();
  }
}

/* -------------------------------------------------------------------------- */
/* UI init                                                                    */
/* -------------------------------------------------------------------------- */

function initUI() {
  try { attachLinkPreviews(); } catch {}

  if (uiInited) return;
  uiInited = true;

  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch {}

  $('#wiki-title-text').textContent = TITLE;
  document.title = TITLE;
  buildTree();

  // THEME
  initTheme();

  // Initial route/render
  route();

  // Lazy-build mini-graph
  const miniElForObserver = $('#mini');
  if (miniElForObserver) {
    new IntersectionObserver((entries, obs) => {
      if (entries[0]?.isIntersecting) { buildGraph(); obs.disconnect(); }
    }).observe(miniElForObserver);
  }

  // Graph fullscreen toggle
  const mini = $('#mini');
  const expandBtn = $('#expand');
  if (expandBtn && mini) {
    expandBtn.onclick = () => {
      const full = mini.classList.toggle('fullscreen');
      expandBtn.setAttribute('aria-pressed', String(full));
      updateMiniViewport();
      requestAnimationFrame(() => highlightCurrent(true));
    };
  }

  // Copy buttons (main content)
  wireCopyButtons($('#content'), () => {
    const t = parseTarget(location.hash);
    return buildDeepURL(t?.page, '') || (baseURLNoHash() + '#');
  });

  // Search box with reusable debounce
  const searchInput = $('#search'), searchClear = $('#search-clear');
  if (searchInput && searchClear) {
    const debouncedSearch = debounce((val) => search(val), 150);
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      searchClear.style.display = val ? '' : 'none';
      debouncedSearch(val);
    });
    searchClear.onclick = () => {
      searchInput.value = '';
      searchClear.style.display = 'none';
      search('');
      searchInput.focus();
    };
  }

  // Panels: exclusive toggles (mobile slide-in)
  const togglePanel = sel => {
    const elx = $(sel);
    if (!elx) return;
    const wasOpen = elx.classList.contains('open');
    closePanels();
    if (!wasOpen) {
      elx.classList.add('open');
      if (!elx.querySelector('.panel-close')) {
        elx.append(el('button', { type: 'button', class: 'panel-close', 'aria-label': 'Close panel', textContent: '✕', onclick: closePanels }));
      }
    }
  };
  // Avoid duplication for the two burger buttons
  ['#burger-sidebar', '#burger-util'].forEach(sel => {
    $(sel)?.addEventListener('click', () => togglePanel(sel.replace('#burger-', '#')));
  });

  /* ---------------------------- Resize / Layout ---------------------------- */
  const handleDesktopLayout = () => {
    if (matchMedia(DESKTOP_MEDIA_QUERY).matches) {
      closePanels();
      highlightCurrent(true);
    }
  };
  const handleFullscreenGraphResize = () => {
    if ($('#mini')?.classList.contains('fullscreen')) {
      updateMiniViewport();
      highlightCurrent(true);
    }
  };
  const onResize = () => {
    __updateViewport();
    handleDesktopLayout();
    handleFullscreenGraphResize();
  };
  __updateViewport();
  addEventListener('resize', onResize, { passive: true });

  // Close panels on nav clicks
  $('#tree')?.addEventListener('click', e => {
    const caret = e.target.closest('button.caret');
    if (caret) {
      const li = caret.closest('li.folder'), sub = li.querySelector('ul');
      const open = !li.classList.contains('open');
      setFolderOpen(li, open);
      return;
    }
    if (e.target.closest('a')) closePanels();
  }, { passive: true });
  $('#results')?.addEventListener('click', e => { if (e.target.closest('a')) closePanels(); }, { passive: true });

  // Router
  addEventListener('hashchange', route, { passive: true });

  /* ------------------------------ ESC behavior ----------------------------- */
  function closeHelp() {
    const kb = $('#kb-help');
    if (kb && !kb.hidden) { kb.hidden = true; return true; }
    return false;
  }
  function closePanelsIfOpen() {
    const sidebarOpen = $('#sidebar')?.classList.contains('open');
    const utilOpen = $('#util')?.classList.contains('open');
    if (sidebarOpen || utilOpen) { closePanels(); return true; }
    return false;
  }
  function exitFullscreenGraph() {
    const mini = $('#mini'); const expandBtn = $('#expand');
    if (mini && mini.classList.contains('fullscreen')) {
      mini.classList.remove('fullscreen');
      if (expandBtn) expandBtn.setAttribute('aria-pressed', 'false');
      updateMiniViewport();
      requestAnimationFrame(() => highlightCurrent(true));
      return true;
    }
    return false;
  }

  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const acted = closeHelp() || closePanelsIfOpen() || exitFullscreenGraph();
    if (acted) e.preventDefault();
  }, { capture: true });

  initPanelToggles();
  initKeybinds();
}

/* -------------------------------------------------------------------------- */
/* Boot / Data load                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Fetches the Markdown bundle with caching + timeout + stale fallback.
 */
async function fetchMarkdown() {
  if (!MD) throw new Error('CONFIG.MD is empty.');
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort('fetch-timeout'), 20000);

  const cached = CACHE_MIN > 0 ? readCache(MD) : null;
  const freshEnough = cached && (Date.now() - cached.ts) <= CACHE_MIN * 60_000;

  try {
    if (freshEnough) {
      clearTimeout(timeout);
      return cached.txt;
    }
    const r = await fetch(MD, { cache: 'no-cache', signal: ctrl.signal });
    clearTimeout(timeout);
    if (!r.ok) throw new Error(`Failed to fetch MD (${r.status})`);
    const txt = await r.text();
    if (CACHE_MIN > 0) writeCache(MD, txt);
    return txt;
  } catch (err) {
    clearTimeout(timeout);
    if (cached?.txt) {
      console.warn('Network failed; using stale cached Markdown');
      return cached.txt;
    }
    throw err;
  }
}

/**
 * Parses model + prepares derived data.
 */
function initModelFromText(txt) {
  parseMarkdownBundle(txt);
  attachSecondaryHomes();
  computeHashes();
}

/**
 * Main boot sequence.
 */
async function boot() {
  try {
    const txt = await fetchMarkdown();
    initModelFromText(txt);

    if (DOC.readyState === 'loading') {
      await new Promise(res => DOC.addEventListener('DOMContentLoaded', res, { once: true }));
    }
    initUI();

    await new Promise(res => setTimeout(res, 120));
    highlightCurrent(true);
  } catch (err) {
    console.warn('Markdown load failed:', err);
    const elc = $('#content');
    if (elc) {
      elc.innerHTML = `<h1>Content failed to load</h1><p>Could not fetch or parse the Markdown bundle. Check <code>window.CONFIG.MD</code> and network access.</p><pre>${String(err?.message || err)}</pre>`;
    }
  }
}

boot();
