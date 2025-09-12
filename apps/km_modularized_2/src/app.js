/* eslint-env browser, es2022 */
'use strict';

import {
  TITLE, MD, DEFAULT_THEME, ACCENT, CACHE_MIN,
  readCache, writeCache, DOC, $, el, whenIdle,
  __getVP, __updateViewport, baseURLNoHash
} from './config_dom.js';

import { __model, parseMarkdownBundle, attachSecondaryHomes, computeHashes } from './model.js';
import { wireCopyButtons } from './markdown.js';
import { buildTree, setFolderOpen, closePanels, attachLinkPreviews, initKeybinds, initPanelToggles } from './ui.js';
import { search } from './search.js';
import { buildGraph, highlightCurrent, updateMiniViewport } from './graph.js';
import { buildDeepURL, route } from './router_renderer.js';
import './loaders.js'; // registers KM.ensure* on window

let currentPage = null;   // debounces redundant renders on hash changes
let uiInited = false;

// ───────────────────────────── theme + UI init ───────────────────────────
function initUI() {
  try { attachLinkPreviews(); } catch {}

  if (uiInited) return;
  uiInited = true;

  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch {}

  $('#wiki-title-text').textContent = TITLE;
  document.title = TITLE;
  buildTree();

  // THEME
  (function themeInit() {
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
      window.KM.ensureHLJSTheme();
      window.KM.syncMermaidThemeWithPage();
    }
  })();

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

  // Copy buttons (main)
  wireCopyButtons($('#content'), () => buildDeepURL(currentPage, '') || (baseURLNoHash() + '#'));

  // Search box
  const searchInput = $('#search'), searchClear = $('#search-clear');
  let debounce = 0;
  if (searchInput && searchClear) {
    searchInput.oninput = e => {
      clearTimeout(debounce);
      const val = e.target.value;
      searchClear.style.display = val ? '' : 'none';
      debounce = setTimeout(() => search(val), 150);
    };
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
      if (!elx.querySelector('.panel-close')) elx.append(el('button', {
        type: 'button', class: 'panel-close', 'aria-label': 'Close panel', textContent: '✕', onclick: closePanels
      }));
    }
  };
  $('#burger-sidebar')?.addEventListener('click', () => togglePanel('#sidebar'));
  $('#burger-util')?.addEventListener('click', () => togglePanel('#util'));

  // Resize handling
  const onResize = () => {
    __updateViewport();
    if (matchMedia('(min-width:1001px)').matches) {
      closePanels();
      highlightCurrent(true);
    }
    if ($('#mini')?.classList.contains('fullscreen')) {
      updateMiniViewport();
      highlightCurrent(true);
    }
  };
  __updateViewport();
  addEventListener('resize', onResize, { passive: true });

  // Close panels upon nav clicks
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

  // ESC behavior
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    let acted = false;
    const kb = $('#kb-help');
    if (kb && !kb.hidden) { kb.hidden = true; acted = true; }
    const sidebarOpen = $('#sidebar')?.classList.contains('open');
    const utilOpen = $('#util')?.classList.contains('open');
    if (sidebarOpen || utilOpen) { closePanels(); acted = true; }
    const miniEl = $('#mini'); const expandBtnEl = $('#expand');
    if (miniEl && miniEl.classList.contains('fullscreen')) {
      miniEl.classList.remove('fullscreen');
      if (expandBtnEl) expandBtnEl.setAttribute('aria-pressed', 'false');
      updateMiniViewport();
      requestAnimationFrame(() => highlightCurrent(true));
      acted = true;
    }
    if (acted) e.preventDefault();
  }, { capture: true });

  // Toggling functions for desktop
  initPanelToggles();

  // Keybinds
  initKeybinds();
}

// ──────────────────────────────── boot ───────────────────────────────────
(async () => {
  try {
    if (!MD) throw new Error('CONFIG.MD is empty.');
    let txt;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort('fetch-timeout'), 20000);

    const cached = CACHE_MIN > 0 ? readCache(MD) : null;
    const freshEnough = cached && (Date.now() - cached.ts) <= CACHE_MIN * 60_000;

    try {
      if (freshEnough) {
        txt = cached.txt;
      } else {
        const r = await fetch(MD, { cache: 'no-cache', signal: ctrl.signal });
        clearTimeout(timeout);
        if (!r.ok) throw new Error(`Failed to fetch MD (${r.status})`);
        txt = await r.text();
        if (CACHE_MIN > 0) writeCache(MD, txt);
      }
    } catch (err) {
      clearTimeout(timeout);
      if (cached?.txt) {
        console.warn('Network failed; using stale cached Markdown');
        txt = cached.txt;
      } else {
        throw err;
      }
    }

    parseMarkdownBundle(txt);
    attachSecondaryHomes();
    computeHashes();

    // Public nav (faithful small surface)
    // Expose function if needed elsewhere
    // KM.nav = (page) => { if (page) location.hash = '#' + (page.hash || ''); };

    // DOM ready + init UI
    if (DOC.readyState === 'loading') await new Promise(res => DOC.addEventListener('DOMContentLoaded', res, { once: true }));
    initUI();

    await new Promise(res => setTimeout(res, 120));
    highlightCurrent(true);
  } catch (err) {
    console.warn('Markdown load failed:', err);
    const elc = $('#content');
    if (elc) elc.innerHTML = `<h1>Content failed to load</h1><p>Could not fetch or parse the Markdown bundle. Check <code>window.CONFIG.MD</code> and network access.</p><pre>${String(err?.message || err)}</pre>`;
  }
})();
