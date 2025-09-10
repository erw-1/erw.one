/* eslint-env browser, es2022 */
'use strict';

import { baseURLNoHash } from './dom.js';
import { __model, find, hashOf } from './model.js';

// Build a deep-link URL for a given page + anchor id
export const buildDeepURL = (page, anchorId = '') => {
  const pageHash = hashOf(page) || '';
  const base = baseURLNoHash() + '#' + pageHash;
  return anchorId ? base + (pageHash ? '#' : '') + anchorId : (pageHash ? base + '#' : base);
};

/**
 * Parse a hash/href into {page, anchor} | null (faithful to original behavior)
 * - Accepts full hrefs or hash-only fragments.
 * - Falls back to {page:root, anchor:''} for empty hash.
 * - Returns null when hash looks like an anchor to a non-existent page.
 */
export function parseTarget(hashOrHref = location.hash) {
  const { root } = __model;
  const href = (hashOrHref || '').startsWith('#')
    ? hashOrHref
    : new URL(hashOrHref || '', location.href).hash;

  if (href === '') return { page: root, anchor: '' };

  const seg = (href || '').slice(1).split('#').filter(Boolean);
  const page = seg.length ? find(seg) : root;
  const base = hashOf(page);
  const baseSegs = base ? base.split('#') : [];

  // If segments didn't resolve beyond root, treat the remainder as an in-page anchor on root.
  if (seg.length && !baseSegs.length) {
    return { page: root, anchor: seg.join('#') };
  }

  const anchor = seg.slice(baseSegs.length).join('#');
  return { page, anchor };
}

/** Force the main scroll position to the top (window + content region). */
export function resetScrollTop() {
  (document.scrollingElement || document.documentElement).scrollTop = 0;
  document.getElementById('content')?.scrollTo?.(0, 0);
}


export function route() {
  closePanels();
  const t = parseTarget(location.hash) ?? { page: __model.root, anchor: '' };
  const page = t.page;
  const anchor = t.anchor;

  if (currentPage !== page) {
    currentPage = page;
    breadcrumb(page);
    render(page, anchor);
    highlightCurrent(true);
    highlightSidebar(page);
    if (!anchor) requestAnimationFrame(() => resetScrollTop());
  } else if (anchor) {
    scrollToAnchor(anchor);
    const a = $(`#toc li[data-hid="${anchor}"] > a`);
    if (a) {
      $('#toc .toc-current')?.classList.remove('toc-current');
      a.classList.add('toc-current');
    }
  }
}
