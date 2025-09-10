/* eslint-env browser, es2022 */
'use strict';

import { DOC } from './dom.js';

// Read inline JSON config from index.html (faithful)
const CFG_EL = DOC.getElementById('km-config');
export const CFG = CFG_EL ? (JSON.parse(CFG_EL.textContent || '{}') || {}) : {};
export const {
  TITLE = 'Wiki',
  MD = '',
  LANGS = [],
  DEFAULT_THEME,
  ACCENT,
  ALLOW_JS_FROM_MD,
  CACHE_MD
} = CFG;

// cache_md: time-to-live in minutes (empty / 0 / NaN → disabled)
export const CACHE_MIN = Number(CACHE_MD) || 0;

// Bump cache key version when parse/render logic changes to avoid stale bundles.
// (kept same key as original)
export const CACHE_KEY = (url) => `km:md:v2:${url}`;

// LocalStorage cache helpers (try/catch guarded, faithful)
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
