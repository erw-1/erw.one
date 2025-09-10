import { DOC } from './dom.js';

const CFG_EL = DOC.getElementById('km-config');
const CFG = CFG_EL ? (JSON.parse(CFG_EL.textContent || '{}') || {}) : {};

export const {
  TITLE = 'Wiki',
  MD = '',
  LANGS = [],
  DEFAULT_THEME,
  ACCENT,
  ALLOW_JS_FROM_MD,
  CACHE_MD
} = CFG;

export const CACHE_MIN = Number(CACHE_MD) || 0;        // 0 → désactivé
export const CACHE_KEY = (url) => `km:md:v2:${url}`;