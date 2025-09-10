/* eslint-env browser, es2022 */
'use strict';

// Tiny, reusable DOM helpers used across modules

export const DOC = document;

/** Query a single element within an optional context (defaults to document) */
export const $ = (sel, c = DOC) => c.querySelector(sel);

/** Query all elements and spread into a real array for easy iteration */
export const $$ = (sel, c = DOC) => [...c.querySelectorAll(sel)];

/**
 * Create an element with a property/attribute map and children.
 * - Prefers setting properties when available (e.g., .textContent)
 * - Supports a special 'dataset' key to batch-assign data-* attributes.
 */
export const el = (tag, props = {}, children = []) => {
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

/** Promise that resolves when DOM is safe to read/write */
export const domReady = () =>
  DOC.readyState !== 'loading'
    ? Promise.resolve()
    : new Promise(res => DOC.addEventListener('DOMContentLoaded', res, { once: true }));

/**
 * Defer non-urgent side-effects without blocking interactivity/paint.
 * Uses requestIdleCallback when available, otherwise a 0ms timeout.
 */
export const whenIdle = (cb, timeout = 1500) =>
  'requestIdleCallback' in window ? requestIdleCallback(cb, { timeout }) : setTimeout(cb, 0);

/** Collapse any active selection prior to programmatic focus/scroll. */
export const clearSelection = () => {
  const sel = window.getSelection?.();
  if (sel && !sel.isCollapsed) sel.removeAllRanges();
};

/** Base URL without hash; works for file:// and querystrings. */
export const baseURLNoHash = () => location.href.replace(/#.*$/, '');

/** Escape string for safe use inside a RegExp. */
export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Lightweight event delegation helper */
export function on(root, type, selector, handler) {
  root.addEventListener(type, (ev) => {
    const target = ev.target?.closest?.(selector);
    if (target && root.contains(target)) handler(ev, target);
  });
}
