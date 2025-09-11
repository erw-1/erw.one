/* eslint-env browser, es2022 */
'use strict';

import {
  TITLE, MD, DEFAULT_THEME, ACCENT, CACHE_MIN,
  readCache, writeCache, DOC, $, el,
  __getVP, __updateViewport, baseURLNoHash
} from './config_dom.js';

import {
  __model,
  parseMarkdownBundle,
  attachSecondaryHomes,
  computeHashes
} from './model.js';

import { wireCopyButtons } from './markdown.js';
import { buildTree, setFolderOpen, closePanels, attachLinkPreviews, initKeybinds } from './ui.js';
import { search } from './search.js';
import { buildGraph, highlightCurrent, updateMiniViewport } from './graph.js';
import { buildDeepURL, route } from './router_renderer.js';
import './loaders.js'; // registers KM.ensure* on window

const KM = (window.KM = window.KM || {});

// ───────────────────────────── utilities ─────────────────────────────
const qs = (sel) => $(sel);
const on = (t, type, fn, opt) => t?.addEventListener(type, fn, opt);
const set = (n, k, v) => n && n.setAttribute(k, v);

const mediaDark = matchMedia('(prefers-color-scheme: dark)');
const rootEl = DOC.documentElement;

function applyTheme(dark) {
  rootEl.setAttribute('data-theme', dark ? 'dark' : 'light');
  KM.ensureHLJSTheme?.();
  KM.syncMermaidThemeWithPage?.();
}

function getInitialTheme() {
  const stored = localStorage.getItem('km-theme');
  const cfg = (DEFAULT_THEME === 'dark' || DEFAULT_THEME === 'light') ? DEFAULT_THEME : null;
  return stored ? (stored === 'dark') : (cfg ? cfg === 'dark' : mediaDark.matches);
}

function currentPageBaseURL() {
  const h = location.hash.slice(1);
  const pageHash = h.split('#')[0] || '';
  const base = baseURLNoHash() + '#' + pageHash;
  return pageHash ? base + '#' : base + (base.endsWith('#') ? '' : '#');
}

// Expose simple toggles for keybinds
function exposeToggles({ toggleSidebar, toggleUtil, toggleCrumb }) {
  window.__kmToggleSidebar = toggleSidebar;
  window.__kmToggleUtil = toggleUtil;
  window.__kmToggleCrumb = toggleCrumb;
}

// ───────────────────────────── UI init ───────────────────────────────
function initUI() {
  attachLinkPreviews();

  // Title & tree
  qs('#wiki-title-text')?.append(document.createTextNode(TITLE));
  document.title = TITLE;
  buildTree();

  // Accent color
  if (typeof ACCENT === 'string' && ACCENT) {
    rootEl.style.setProperty('--color-accent', ACCENT);
  }

  // Theme
  (function themeInit() {
    const btn = qs('#theme-toggle');
    let dark = getInitialTheme();
    applyTheme(dark);
    if (btn) {
      set(btn, 'aria-pressed', String(dark));
      btn.onclick = () => {
        dark = !dark;
        set(btn, 'aria-pressed', String(dark));
        localStorage.setItem('km-theme', dark ? 'dark' : 'light');
        applyTheme(dark);
      };
    }
    mediaDark.addEventListener?.('change', (e) => {
      const userSet = localStorage.getItem('km-theme') != null;
      if (!userSet && DEFAULT_THEME == null) {
        dark = e.matches;
        applyTheme(dark);
        btn && set(btn, 'aria-pressed', String(dark));
      }
    });
    on(window, 'storage', (e) => {
      if (e.key === 'km-theme') {
        dark = e.newValue === 'dark';
        applyTheme(dark);
        btn && set(btn, 'aria-pressed', String(dark));
      }
    });
  })();

  // Search box
  (function bindSearch() {
    const input = qs('#search');
    const clear = qs('#search-clear');
    if (!input || !clear) return;
    let t = 0;
    input.oninput = (e) => {
      clearTimeout(t);
      const v = e.target.value;
      clear.style.display = v ? '' : 'none';
      t = setTimeout(() => search(v), 150);
    };
    clear.onclick = () => {
      input.value = '';
      clear.style.display = 'none';
      search('');
      input.focus();
    };
  })();

  // Panels: exclusive toggles
  const togglePanel = (sel) => {
    const p = qs(sel);
    if (!p) return;
    const wasOpen = p.classList.contains('open');
    closePanels();
    if (!wasOpen) {
      p.classList.add('open');
      if (!p.querySelector('.panel-close')) {
        p.append(el('button', {
          type: 'button',
          class: 'panel-close',
          'aria-label': 'Close panel',
          textContent: '✕',
          onclick: closePanels
        }));
      }
    }
  };
  const toggleSidebar = () => togglePanel('#sidebar');
  const toggleUtil = () => togglePanel('#util');
  const toggleCrumb = () => qs('#header')?.classList.toggle('collapsed');

  on(qs('#burger-sidebar'), 'click', toggleSidebar);
  on(qs('#burger-util'), 'click', toggleUtil);
  exposeToggles({ toggleSidebar, toggleUtil, toggleCrumb });

  // Resize handling
  const onResize = () => {
    __updateViewport();
    if (matchMedia('(min-width:1001px)').matches) {
      closePanels();
      highlightCurrent(true);
    }
    if (qs('#mini')?.classList.contains('fullscreen')) {
      updateMiniViewport();
      highlightCurrent(true);
    }
  };
  __updateViewport();
  on(window, 'resize', onResize, { passive: true });

  // Sidebar interactions
  on(qs('#tree'), 'click', (e) => {
    const caret = e.target?.closest?.('button.caret');
    if (caret) {
      const li = caret.closest('li.folder');
      setFolderOpen(li, !li.classList.contains('open'));
      return;
    }
    if (e.target.closest('a')) closePanels();
  }, { passive: true });
  on(qs('#results'), 'click', (e) => { if (e.target.closest('a')) closePanels(); }, { passive: true });

  // Router
  on(window, 'hashchange', route, { passive: true });

  // ESC: close help/panels/graph fullscreen
  on(window, 'keydown', (e) => {
    if (e.key !== 'Escape') return;
    let acted = false;
    const kb = qs('#kb-help');
    if (kb && !kb.hidden) { kb.hidden = true; acted = true; }
    const sidebarOpen = qs('#sidebar')?.classList.contains('open');
    const utilOpen = qs('#util')?.classList.contains('open');
    if (sidebarOpen || utilOpen) { closePanels(); acted = true; }
    const mini = qs('#mini'), expandBtn = qs('#expand');
    if (mini && mini.classList.contains('fullscreen')) {
      mini.classList.remove('fullscreen');
      expandBtn && set(expandBtn, 'aria-pressed', 'false');
      updateMiniViewport();
      requestAnimationFrame(() => highlightCurrent(true));
      acted = true;
    }
    if (acted) e.preventDefault();
  }, { capture: true });

  // Keyboard shortcuts panel and bindings
  initKeybinds();

  // Copy buttons (headings & code)
  wireCopyButtons(qs('#content'), () => buildDeepURL(null, '') || currentPageBaseURL());
}

// ───────────────────────────── boot ───────────────────────────────────
(async () => {
  try {
    if (!MD) throw new Error('CONFIG.MD is empty.');

    // Fetch with simple freshness cache
    let txt;
    const cached = CACHE_MIN > 0 ? (readCache?.(MD) || null) : null;
    const freshEnough = cached && (Date.now() - cached.ts) <= (CACHE_MIN * 60_000);

    if (freshEnough) {
      txt = cached.txt;
    } else {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort('fetch-timeout'), 20000);
      try {
        const r = await fetch(MD, { cache: 'no-cache', signal: ctrl.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        txt = await r.text();
        writeCache?.(MD, txt);
      } catch (e) {
        if (cached?.txt) txt = cached.txt;
        else throw e;
      } finally {
        clearTimeout(timer);
      }
    }

    // Parse & build model
    parseMarkdownBundle(txt);
    attachSecondaryHomes();
    computeHashes();

    // Global nav helper
    KM.nav = (page) => { if (page) location.hash = '#' + (page.hash || ''); };

    // DOM ready -> init UI, build graph, route
    if (DOC.readyState === 'loading') {
      await new Promise((res) => DOC.addEventListener('DOMContentLoaded', res, { once: true }));
    }
    initUI();
    await buildGraph(); // harmless if it no-ops until visible
    route();

    // small delay then ensure highlight state
    await new Promise((res) => setTimeout(res, 120));
    highlightCurrent(true);
  } catch (err) {
    console.warn('Markdown load failed:', err);
    const elc = qs('#content');
    if (elc) {
      elc.innerHTML = `<h1>Content failed to load</h1><p>Make sure the MD bundle is reachable and this page has network access.</p><pre>${String(err?.message || err)}</pre>`;
    }
  }
})();
