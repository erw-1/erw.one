'use strict';
const KM = window.KM || (window.KM = {});
const DOC = document;

// DOM query helpers
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
Object.assign(KM, { $, $$, DEBUG: false });
export const HEADINGS_SEL = 'h1,h2,h3,h4,h5,h6';

// Miscellaneous utilities
export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const whenIdle = (cb, timeout = 1500) =>
    'requestIdleCallback' in window ? requestIdleCallback(cb, { timeout }) : setTimeout(cb, 0);
export const domReady = () =>
    DOC.readyState !== 'loading' ? Promise.resolve() :
    new Promise(res => DOC.addEventListener('DOMContentLoaded', res, { once: true }));
export const clearSelection = () => {
    const sel = window.getSelection?.();
    if (sel && !sel.isCollapsed) sel.removeAllRanges();
};
export const baseURLNoHash = () => location.href.replace(/#.*$/, '');
export const ensureOnce = (fn) => {
    let p;
    return () => (p ||= fn());
};
/**
 * Copy text to clipboard with a visual flash feedback.
 * Uses Clipboard API if available, falls back to execCommand.
 */
export async function copyText(txt, node) {
    try {
        await navigator.clipboard.writeText(txt);
    } catch {
        const ta = document.createElement('textarea');
        ta.value = txt;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
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
/** Scroll both page and content area to top */
export function resetScrollTop() {
    (document.scrollingElement || document.documentElement).scrollTop = 0;
    $('#content')?.scrollTo?.(0, 0);
}
