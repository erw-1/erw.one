export const DOC = document;

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

export const CACHE_MIN = Number(CACHE_MD) || 0;
export const CACHE_KEY = url => `km:md:v2:${url}`;

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
    localStorage.setItem(CACHE_KEY(url), JSON.stringify({ ts: Date.now(), txt }));
  } catch {}
}

export const RE_FENCE = /^(?:```|~~~)/;
export const RE_HEADING = /^(#{1,6})\s+/;
export const RE_HEADING_FULL = /^(#{1,6})\s+(.+)/;
export const HEADINGS_SEL = 'h1, h2, h3, h4, h5, h6';

window.KM = window.KM || {};
const KM = window.KM;

let __VPW = window.innerWidth;
let __VPH = window.innerHeight;

export const $ = (sel, c = DOC) => c.querySelector(sel);
export const $$ = (sel, c = DOC) => [...c.querySelectorAll(sel)];

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

Object.assign(KM, { $, $$, DEBUG: false });

export const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const whenIdle = (cb, timeout = 1500) =>
  'requestIdleCallback' in window ? requestIdleCallback(cb, { timeout }) : setTimeout(cb, 0);

export const domReady = () =>
  DOC.readyState !== 'loading'
    ? Promise.resolve()
    : new Promise(res => DOC.addEventListener('DOMContentLoaded', res, { once: true }));

export function clearSelection() {
  const sel = window.getSelection?.();
  if (sel && !sel.isCollapsed) sel.removeAllRanges();
}

export const baseURLNoHash = () => location.href.replace(/#.*$/, '');

export function __updateViewport() {
  __VPW = window.innerWidth;
  __VPH = window.innerHeight;
}
export const __getVP = () => ({ __VPW, __VPH });

export async function copyText(txt, node) {
  try {
    await navigator.clipboard.writeText(txt);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = txt; ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch {}
    ta.remove();
  } finally {
    if (node) {
      node.classList.add('flash');
      setTimeout(() => node.classList.remove('flash'), 300);
    }
  }
}

const ICONS = {
  link: 'M3.9 12c0-1.7 1.4-3.1 3.1-3.1h5.4v-2H7c-2.8 0-5 2.2-5 5s2.2 5 5 5h5.4v-2H7c-1.7 0-3.1-1.4-3.1-3.1zm5.4 1h6.4v-2H9.3v2zm9.7-8h-5.4v2H19c1.7 0 3.1 1.4 3.1 3.1s-1.4 3.1-3.1 3.1h-5.4v2H19c2.8 0 5-2.2 5-5s-2.2-5-5-5z',
  code: 'M19,21H5c-1.1,0-2-0.9-2-2V7h2v12h14V21z M21,3H9C7.9,3,7,3.9,7,5v12c0,1.1,0.9,2,2,2h12c2.2,0,2-2,2-2V5C23,3.9,22.1,3,21,3z M21,17H9V5h12V17z'
};
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
