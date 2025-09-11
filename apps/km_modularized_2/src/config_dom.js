/* eslint-env browser, es2022 */
'use strict';

// ───────────────────────────── DOM helpers ─────────────────────────────
export const DOC = document;

export const $ = (root, sel) => {
  if (typeof root === 'string') return DOC.querySelector(root);
  return (root || DOC).querySelector(sel);
};

export const $$ = (root, sel) => {
  if (typeof root === 'string') return Array.from(DOC.querySelectorAll(root));
  return Array.from((root || DOC).querySelectorAll(sel));
};

export function el(tag, attrs, children) {
  if (Array.isArray(attrs) || typeof attrs === 'string' || attrs instanceof Node) {
    children = attrs;
    attrs = null;
  }
  const node = DOC.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k === 'class') node.className = v;
      else if (k === 'dataset' && v && typeof v === 'object') Object.assign(node.dataset, v);
      else if (k === 'style' && v && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'style' && typeof v === 'string') node.style.cssText = v;
      else if (k in node && (k === 'textContent' || k === 'innerHTML' || k.startsWith('on'))) node[k] = v;
      else node.setAttribute(k, String(v));
    }
  }
  if (children != null) {
    const list = Array.isArray(children) ? children : [children];
    for (const c of list) node.append(c instanceof Node ? c : DOC.createTextNode(String(c)));
  }
  return node;
}

// For ToC
export const HEADINGS_SEL = 'h1,h2,h3,h4,h5,h6';

// ───────────────────────────── Config values ───────────────────────────
const CFG = window.CONFIG || {};
export const TITLE         = CFG.TITLE ?? (DOC.title || '');
export const MD            = CFG.MD ?? '';
export const DEFAULT_THEME = CFG.DEFAULT_THEME ?? null; // 'light' | 'dark' | null (follow system)
export const ACCENT        = CFG.ACCENT ?? '';
export const CACHE_MIN     = Number(CFG.CACHE_MIN ?? 0); // minutes
export const LANGS         = Array.isArray(CFG.LANGS) ? CFG.LANGS : [];

// ───────────────────────────── Cache helpers ───────────────────────────
const CACHE_NS = 'km-cache:';
export function readCache(url) {
  try {
    const raw = localStorage.getItem(CACHE_NS + url);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj.txt !== 'string' || typeof obj.ts !== 'number') return null;
    return obj;
  } catch {
    return null;
  }
}
export function writeCache(url, txt) {
  try {
    localStorage.setItem(CACHE_NS + url, JSON.stringify({ ts: Date.now(), txt: String(txt || '') }));
  } catch {}
}

// ───────────────────────────── Viewport utils ──────────────────────────
let __VPW = 0, __VPH = 0;
export function __updateViewport() {
  __VPW = Math.max(1, window.innerWidth || DOC.documentElement.clientWidth || 0);
  __VPH = Math.max(1, window.innerHeight || DOC.documentElement.clientHeight || 0);
  return { __VPW, __VPH };
}
export function __getVP() {
  if (!__VPW || !__VPH) __updateViewport();
  return { __VPW, __VPH };
}

// ───────────────────────────── URL helpers ─────────────────────────────
export function baseURLNoHash() {
  const href = location.href || '';
  const i = href.indexOf('#');
  return i >= 0 ? href.slice(0, i) : href;
}
