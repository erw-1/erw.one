/* eslint-env browser, es2022 */
'use strict';

/**
 * Small, dependency-free DOM + config utilities shared across modules.
 * Only exports what the rest of the app actually uses.
 */

// ───────────────────────────────── DOM helpers ─────────────────────────────────
export const DOC = document;

/** Shorthand query selectors (always scoped to document unless root provided). */
export const $  = (sel, root = DOC) => root.querySelector(sel);
export const $$ = (sel, root = DOC) => Array.from(root.querySelectorAll(sel));

/**
 * Create an element with a plain-object of attributes/props and children.
 * - Strings become text nodes
 * - `innerHTML` is respected if provided (caller is responsible for safety)
 */
export function el(tag, props = {}, ...children) {
  const node = DOC.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null) continue;
    if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const ch of children) {
    if (ch == null) continue;
    node.append(ch.nodeType ? ch : DOC.createTextNode(String(ch)));
  }
  return node;
}

/** Selection for headings used across the app. */
export const HEADINGS_SEL = 'h1,h2,h3,h4,h5,h6';

/** Copy text to clipboard with subtle user feedback (if a button is passed). */
export async function copyText(txt, buttonEl) {
  try {
    await navigator.clipboard?.writeText?.(txt);
    if (buttonEl) {
      buttonEl.dataset.copied = '1';
      buttonEl.setAttribute('aria-live', 'polite');
      const t = setTimeout(() => {
        delete buttonEl.dataset.copied;
        clearTimeout(t);
      }, 1200);
    }
  } catch {
    // Fallback prompt if permissions are blocked
    window.prompt?.('Copy to clipboard:', txt);
  }
}

/** URL without the hash (used for deep links). */
export const baseURLNoHash = () => location.href.replace(/#.*/, '');

/** run when idle-ish (fallback to setTimeout for Safari/older browsers) */
export const whenIdle = (cb, t = 200) =>
  ('requestIdleCallback' in window)
    ? window.requestIdleCallback(cb, { timeout: t })
    : setTimeout(cb, t);

/** Promise that resolves once DOM is fully parsed. */
export function domReady() {
  if (document.readyState === 'loading') {
    return new Promise(res => document.addEventListener('DOMContentLoaded', res, { once: true }));
  }
  return Promise.resolve();
}

// ───────────────────────────────── Config intake ──────────────────────────────
// Read inline JSON config from <script id="km-config" type="application/json">
const CFG_EL = DOC.getElementById('km-config');
export const CFG = CFG_EL ? (JSON.parse(CFG_EL.textContent || '{}') || {}) : {};

export const {
  TITLE = 'Wiki',
  MD = '',
  LANGS = [],                 // highlight.js language ids to register (optional)
  DEFAULT_THEME,              // 'light' | 'dark' | undefined (follow OS)
  ACCENT,                     // CSS color string
  ALLOW_JS_FROM_MD,           // 'true' to execute <script> inside Markdown (dangerous)
  CACHE_MD,                   // minutes to keep fetched MD in localStorage
} = CFG;

// cache_md: time-to-live in minutes (empty / 0 / NaN → disabled)
export const CACHE_MIN = Number(CACHE_MD) || 0;

// Bump cache key version when parse/render logic changes to avoid stale bundles.
export const CACHE_KEY = (url) => `km:md:v2:${url}`;

/** LocalStorage cache helpers for the Markdown bundle. */
export function readCache(url) {
  try {
    const raw = localStorage.getItem(CACHE_KEY(url));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj.ts !== 'number' || typeof obj.txt !== 'string') return null;
    return obj;
  } catch {
    return null;
  }
}
export function writeCache(url, txt) {
  try {
    localStorage.setItem(CACHE_KEY(url), JSON.stringify({ ts: Date.now(), txt: String(txt || '') }));
  } catch {
    /* storage full or disabled; ignore */
  }
}

// ───────────────────────────── Viewport helpers ───────────────────────────────
let __vp = { w: innerWidth | 0, h: innerHeight | 0, dpr: devicePixelRatio || 1 };
export function __updateViewport() {
  __vp = { w: innerWidth | 0, h: innerHeight | 0, dpr: devicePixelRatio || 1 };
  return __vp;
}
export const __getVP = () => __vp;

// ───────────────────────────── Regex utilities (model) ────────────────────────
// Heuristics for the markdown bundle format used by the app's model parser.
export const RE_FENCE = /```page\b([\s\S]*?)```/g; // page blocks
// Markdown ATX headings (#..######) — captures level and text.
export const RE_HEADING = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*\s*$/gm;
export const RE_HEADING_FULL = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*\s*$/m;

// ─────────────────────────── Icons + UI micro components ─────────────────────
const ICONS = {
  // Minimal paths to keep bundle lean
  link: 'M10.6 13.4a1 1 0 0 1 0-1.4l2.8-2.8a3 3 0 1 1 4.2 4.2l-1.9 1.9a1 1 0 1 1-1.4-1.4l1.9-1.9a1 1 0 0 0-1.4-1.4l-2.8 2.8a1 1 0 0 1-1.4 0zM8.2 18.2a3 3 0 0 1 0-4.2l1.9-1.9a1 1 0 1 1 1.4 1.4L9.6 15.4a1 1 0 1 0 1.4 1.4l2.8-2.8a1 1 0 0 1 1.4 1.4l-2.8 2.8a3 3 0 0 1-4.2 0z',
  code: 'M9.6 16.6 6 13l3.6-3.6 1.4 1.4L8.8 13l2.2 2.2-1.4 1.4zm4.8 0-1.4-1.4L15.2 13l-2.2-2.2 1.4-1.4L18 13l-3.6 3.6z',
};

/** Small, consistently styled icon button (SVG-only to avoid bloat). */
export const iconBtn = (title, path, cls, onClick) =>
  el('button', {
    type: 'button',
    class: cls,
    title,
    'aria-label': title,
    ...(onClick && { onclick: onClick }),
    innerHTML: `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${path}"></path></svg>`
  });

export const ICONS_PUBLIC = ICONS;
