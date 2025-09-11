import { TITLE, MD, DEFAULT_THEME, ACCENT, CACHE_MIN, readCache, writeCache, DOC, $, el, whenIdle, __getVP, __updateViewport, baseURLNoHash } from './config_dom.js';
import { __model, parseMarkdownBundle, attachSecondaryHomes, computeHashes, nav } from './model.js';
import { wireCopyButtons } from './markdown.js';
import { buildTree, setFolderOpen, closePanels, attachLinkPreviews, initKeybinds } from './ui.js';
import { search } from './search.js';
import { buildGraph, highlightCurrent, updateMiniViewport } from './graph.js';
import { buildDeepURL, route } from './router_renderer.js';
import './loaders.js';

const KM = (window.KM = window.KM || {});
let currentPage = null;
let uiInited = false;

function initUI() {
  try { attachLinkPreviews(); } catch {}
  if (uiInited) return;
  uiInited = true;
  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch {}
  $('#wiki-title-text').textContent = TITLE;
  document.title = TITLE;
  buildTree();

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
      KM.ensureHLJSTheme();
      KM.syncMermaidThemeWithPage();
    }
  })();

  route();

  const miniElForObserver = $('#mini');
  if (miniElForObserver) {
    new IntersectionObserver((entries, obs) => {
      if (entries[0]?.isIntersecting) { buildGraph(); obs.disconnect(); }
    }).observe(miniElForObserver);
  }

  window.addEventListener('resize', () => {
    __updateViewport();
    updateMiniViewport();
  });

  if (CACHE_MIN > 0) {
    const interval = Math.max(60000, CACHE_MIN * 60000);
    setInterval(() => {
      try { localStorage.clear(); } catch {}
    }, interval);
  }
}

export function app() {
  const container = $('#content');
  if (!container) return;
  parseMarkdownBundle(MD);
  attachSecondaryHomes();
  computeHashes();
  initUI();
  initKeybinds();
  wireCopyButtons(container, () => baseURLNoHash() + '#');
  const searchInput = $('#search-input');
  if (searchInput) {
    searchInput.addEventListener('input', e => search(e.target.value), { passive: true });
  }
  $(DOC).addEventListener('click', () => closePanels());
  window.addEventListener('hashchange', () => route());
}
