/* eslint-env browser, es2022 */
export const DOC = document;
export const $ = (sel, c = DOC) => c.querySelector(sel);
export const $$ = (sel, c = DOC) => [...c.querySelectorAll(sel)];

export const whenIdle = (cb, timeout = 1500) =>
  'requestIdleCallback' in window
    ? requestIdleCallback(cb, { timeout })
    : setTimeout(cb, 0);

export const domReady = () =>
  DOC.readyState !== 'loading'
    ? Promise.resolve()
    : new Promise(res =>
        DOC.addEventListener('DOMContentLoaded', res, { once: true })
      );

export const clearSelection = () => {
  const sel = window.getSelection?.();
  if (sel && !sel.isCollapsed) sel.removeAllRanges();
};

export const baseURLNoHash = () => location.href.replace(/#.*$/, '');
export const KM = (window.KM = window.KM || {});

export const el = (tag, props = {}, children = []) => {
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
};

Object.assign(KM, { $, $$, DEBUG: KM.DEBUG || false });
export default KM;
