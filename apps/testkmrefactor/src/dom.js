// src/dom.js
/* eslint-env browser, es2022 */
'use strict';

/* ─────────────────────────────── Public API ────────────────────────────── */
// Expose a tiny namespace for interop/testing while avoiding global clutter.
// Only stable, useful utilities are exported.
window.KM = window.KM || {};
const KM = window.KM;

/* ─────────────────────────────── DOM helpers ───────────────────────────── */
// Cached viewport, updated on resize to reduce repeated reads.
let __VPW = window.innerWidth;
let __VPH = window.innerHeight;
const updateViewport = () => { __VPW = window.innerWidth; __VPH = window.innerHeight; };

// Intentionally small helpers to keep call sites terse and readable.
const DOC = document;

/** Query a single element within an optional context (defaults to document) */
const $ = (sel, c = DOC) => c.querySelector(sel);

/** Query all elements and spread into a real array for easy iteration */
const $$ = (sel, c = DOC) => [...c.querySelectorAll(sel)];

/**
 * Create an element with a property/attribute map and children.
 * - Prefers setting properties (e.g., .textContent) over attributes when
 *   available to avoid type coercion pitfalls and to preserve semantics.
 * - Supports a special 'dataset' key to batch-assign data attributes.
 */
const el = (tag, props = {}, children = []) => {
  const n = DOC.createElement(tag);
  for (const k in props) {
    const v = props[k];
    if (k === 'class' || k === 'className') n.className = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k in n) n[k] = v; // prefer properties when present
    else n.setAttribute(k, v); // fallback to attribute
  }
  if (children != null) {
    const arr = Array.isArray(children) ? children : [children];
    if (arr.length) n.append(...arr);
  }
  return n;
};

// Expose a couple of helpers and a DEBUG flag for quick diagnostics.
Object.assign(KM, { $, $$, DEBUG: false });

/* ───────────────────────────── small utils ─────────────────────────────── */

/** Escape a string for safe use inside a RegExp. */
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Defer non-urgent side-effects without blocking interactivity/paint.
 * Uses requestIdleCallback when available, otherwise a 0ms timeout.
 * [PERF] Keeps first content paint snappy by pushing work off the main path.
 */
const whenIdle = (cb, timeout = 1500) =>
  'requestIdleCallback' in window ? requestIdleCallback(cb, { timeout }) : setTimeout(cb, 0);

/**
 * Promise that resolves when DOM is safe to read/write.
 * Avoids race conditions if this module executes before DOMContentLoaded.
 */
const domReady = () =>
  DOC.readyState !== 'loading'
    ? Promise.resolve()
    : new Promise(res => DOC.addEventListener('DOMContentLoaded', res, { once: true }));

/** Collapse any active selection prior to programmatic focus/scroll. */
const clearSelection = () => {
  const sel = window.getSelection?.();
  if (sel && !sel.isCollapsed) sel.removeAllRanges();
};

/** Base URL without hash; works for file:// and querystrings. */
const baseURLNoHash = () => location.href.replace(/#.*$/, '');

/* ───────────────────────── UI decorations & utils ──────────────────────── */
/** Reusable selector for all heading levels (H1–H6) */
const HEADINGS_SEL = 'h1,h2,h3,h4,h5,h6';

/** Central registry for Intersection/Resize observers created per-render. */
const __OBS_BY_ROOT = new Map();
function __trackObserver(o, root = document) {
  if (!o || typeof o.disconnect !== 'function') return o;
  const set = __OBS_BY_ROOT.get(root) || new Set();
  set.add(o);
  __OBS_BY_ROOT.set(root, set);
  return o;
}

function __cleanupObservers(root = document) {
  const set = __OBS_BY_ROOT.get(root);
  if (!set) return;
  for (const o of set) { try { o.disconnect?.(); } catch {} }
  set.clear();
}

/** Locale-aware title sort */
const __collator = new Intl.Collator(undefined, { sensitivity: 'base' });
const sortByTitle = (a, b) => __collator.compare(a.title, b.title);

/**
 * Copy helper with tiny visual confirmation via a transient CSS class.
 * [CROSS-BROWSER] Clipboard API may be unavailable → we fail quietly.
 */
async function copyText(txt, node) {
  try {
    await navigator.clipboard.writeText(txt);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = txt; ta.style.position='fixed'; ta.style.left='-9999px';
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch {}
    ta.remove();
  } finally {
    if (node) { node.classList.add('flash'); setTimeout(() => node.classList.remove('flash'), 300); }
  }
}

/**
 * Small inline SVG icons used by copy buttons. Embedding avoids extra
 * requests and works offline.
 */
const ICONS = {
  link: 'M3.9 12c0-1.7 1.4-3.1 3.1-3.1h5.4v-2H7c-2.8 0-5 2.2-5 5s2.2 5 5 5h5.4v-2H7c-1.7 0-3.1-1.4-3.1-3.1zm5.4 1h6.4v-2H9.3v2zm9.7-8h-5.4v2H19c1.7 0 3.1 1.4 3.1 3.1s-1.4 3.1-3.1 3.1h-5.4v2H19c2.8 0 5-2.2 5-5s-2.2-5-5-5z',
  code: 'M19,21H5c-1.1,0-2-0.9-2-2V7h2v12h14V21z M21,3H9C7.9,3,7,3.9,7,5v12 c0,1.1,0.9,2,2,2h12c2.2,0,2-2,2-2V5C23,3.9,22.1,3,21,3z M21,17H9V5h12V17z',
};

/** Create a compact icon button with a11y title/aria and optional click handler. */
const iconBtn = (title, path, cls, onClick) =>
  el('button', {
    type: 'button',
    class: cls,
    title,
    'aria-label': title,
    ...(onClick && { onclick: onClick }),
    innerHTML: `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${path}"></path></svg>`
  });

/**
 * Shared copy-button wiring for headings and code blocks.
 * getBaseUrl() should return something like `buildDeepURL(page, '') || baseURLNoHash() + '#'`.
 */
function wireCopyButtons(root, getBaseUrl) {
  if (!root) return;
  root.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('button.heading-copy, button.code-copy');
    if (!btn) return;
    if (btn.classList.contains('heading-copy')) {
      const h = btn.closest(HEADINGS_SEL);
      if (!h) return;
      const base = getBaseUrl() || (baseURLNoHash() + '#');
      copyText(base + h.id, btn);
    } else {
      const pre = btn.closest('pre');
      const code = pre?.querySelector('code');
      copyText(code ? code.innerText : pre?.innerText || '', btn);
    }
  });
}

/** Number headings (h1–h5) deterministically for deep-linking. */
function numberHeadings(elm) {
  const counters = [0,0,0,0,0,0,0];
  $$(HEADINGS_SEL, elm).forEach(h => {
    if (h.id) return; // honor precomputed ids
    const level = +h.tagName[1] - 1;
    counters[level]++;
    for (let i = level + 1; i < 7; i++) counters[i] = 0;
    h.id = counters.slice(0, level + 1).filter(Boolean).join('_');
  });
}

/** For markdown content: open external http(s) links in a new tab, safely. */
function decorateExternalLinks(container = $('#content')) {
  $$('a[href]', container).forEach(a => {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    if (!/^https?:\/\//i.test(href)) return; // only absolute http(s)

    let url;
    try { url = new URL(href); } catch { return; }
    if (url.origin === location.origin) return;

    a.setAttribute('target', '_blank');
    // preserve any existing rel values, add safety flags
    const rel = new Set((a.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
    rel.add('noopener'); rel.add('noreferrer'); rel.add('external');
    a.setAttribute('rel', Array.from(rel).join(' '));
    // a11y: announce new tab and host
    if (!a.hasAttribute('aria-label')) {
      a.setAttribute('aria-label', `${a.textContent} (opens in new tab, ${url.hostname})`);
    }
  });
}

/* ──────────────────────────────── Exports ─────────────────────────────── */
export {
  // global namespace (kept)
  KM,
  // core DOM helpers
  DOC, $, $$, el,
  // viewport cache + updater
  __VPW, __VPH, updateViewport,
  // generic utils
  escapeRegex, whenIdle, domReady, clearSelection, baseURLNoHash,
  // observer registry
  __trackObserver, __cleanupObservers,
  // sorting
  sortByTitle,
  // copy/link helpers
  copyText, ICONS, iconBtn, wireCopyButtons, numberHeadings, decorateExternalLinks,
  // selectors
  HEADINGS_SEL,
};
