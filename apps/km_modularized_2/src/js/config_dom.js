/* eslint-env browser, es2022 */
'use strict';

export const DOC = document;

// Read inline JSON config from index.html
const CFG_EL = DOC.getElementById('km-config');
export const CFG = CFG_EL ? JSON.parse(CFG_EL.textContent || '{}') || {} : {};
export const {
  TITLE = 'Wiki',
  MD = '',
  LANGS = [],
  DEFAULT_THEME,
  ACCENT,
  ALLOW_JS_FROM_MD,
  CACHE_MD
} = CFG;

// cache_md: time-to-live in minutes (0/NaN → disabled)
export const CACHE_MIN = Number(CACHE_MD) || 0;

// Bump cache key version when parse/render logic changes
export const CACHE_KEY = url => `km:md:v2:${url}`;

// LocalStorage cache helpers
export function readCache(url) {
  try {
    const raw = localStorage.getItem(CACHE_KEY(url));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj.ts !== 'number' || typeof obj.txt !== 'string') return null;
    return obj;
  } catch (_) {
    return null;
  }
}

export function writeCache(url, txt) {
  try {
    localStorage.setItem(CACHE_KEY(url), JSON.stringify({ ts: Date.now(), txt }));
  } catch (_) {}
}

// Shared regexes
export const RE_FENCE = /^(?:```|~~~)/;
export const RE_HEADING = /^(#{1,6})\s+/;
export const RE_HEADING_FULL = /^(#{1,6})\s+(.+)/;
export const HEADINGS_SEL = 'h1, h2, h3, h4, h5, h6';

// Viewport cache (updated on resize)
let __VPW = window.innerWidth;
let __VPH = window.innerHeight;

/** Query a single element (default document) */
export const $ = (sel, c = DOC) => c.querySelector(sel);

/** Query all elements (default document) */
export const $$ = (sel, c = DOC) => [...c.querySelectorAll(sel)];

/**
 * Create an element with given properties and children.
 * Supports 'dataset' key and uses element properties preferentially.
 */
export function el(tag, props = {}, children = []) {
  const n = DOC.createElement(tag);
  for (const k in props) {
    const v = props[k];
    if (k === 'class' || k === 'className') n.className = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k in n) n[k] = v;
    else n.setAttribute(k, v);
  }
  if (children != null) {
    const arr = Array.isArray(children) ? children : [children];
    if (arr.length) n.append(...arr);
  }
  return n;
}

// Expose helpers and DEBUG flag
Object.assign(KM, { $, $$, DEBUG: false });

/** Escape a string for regex */
export const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Defer non-urgent side-effects (idle callback or 0ms) */
export const whenIdle = (cb, timeout = 1500) =>
  'requestIdleCallback' in window ? requestIdleCallback(cb, { timeout }) : setTimeout(cb, 0);

/** Promise when DOM is ready */
export const domReady = () =>
  DOC.readyState !== 'loading'
    ? Promise.resolve()
    : new Promise(res => DOC.addEventListener('DOMContentLoaded', res, { once: true }));

/** Clear any active selection */
export function clearSelection() {
  const sel = window.getSelection?.();
  if (sel && !sel.isCollapsed) sel.removeAllRanges();
}

/** Base URL without hash */
export const baseURLNoHash = () => location.href.replace(/#.*$/, '');

// Updated by app.js resize listener
export function __updateViewport() {
  __VPW = window.innerWidth;
  __VPH = window.innerHeight;
}
export const __getVP = () => ({ __VPW, __VPH });

/** Clipboard copy with flash confirmation */
export async function copyText(txt, node) {
  try {
    await navigator.clipboard.writeText(txt);
  } catch {
    const ta = DOC.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    DOC.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch {}
    ta.remove();
  } finally {
    if (node) {
      node.classList.add('flash');
      setTimeout(() => node.classList.remove('flash'), 300);
    }
  }
}

// SVG path data for icons
export const ICONS = {
  link: 'M3.9 12c0-1.7 1.4-3.1 3.1-3.1h5.4v-2H7c-2.8 0-5 2.2-5 5s2.2 5 5 5h5.4v-2H7c-1.7 0-3.1-1.4-3.1-3.1zm5.4 1h6.4v-2H9.3v2zm9.7-8h-5.4v2H19c1.7 0 3.1 1.4 3.1 3.1s-1.4 3.1-3.1 3.1h-5.4v2H19c2.8 0 5-2.2 5-5s-2.2-5-5-5z',
  code: 'M19,21H5c-1.1,0-2-0.9-2-2V7h2v12h14V21zM21,3H9C7.9,3,7,3.9,7,5v12c0,1.1,0.9,2,2,2h12c2.2,0,2-2,2-2V5C23,3.9,22.1,3,21,3zM21,17H9V5h12V17z'
};

/** Create an icon button with inline SVG */
export const iconBtn = (title, path, cls, onClick) =>
  el('button', {
    type: 'button',
    class: cls,
    title,
    'aria-label': title,
    ...(onClick && { onclick: onClick }),
    innerHTML: `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${path}"></path></svg>`
  });

