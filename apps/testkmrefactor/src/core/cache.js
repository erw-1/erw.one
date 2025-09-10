/* eslint-env browser, es2022 */
import { CACHE_KEY } from './config.js';

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
