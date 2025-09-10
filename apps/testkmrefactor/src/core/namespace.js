/* eslint-env browser, es2022 */
export const KM = (window.KM = window.KM || {});

const DOC = document;

export const $ = (sel, c = DOC) => c.querySelector(sel);
export const $$ = (sel, c = DOC) => [...c.querySelectorAll(sel)];

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
