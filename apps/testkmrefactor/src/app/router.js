import { $, baseURLNoHash } from '../core/dom.js';
import { root, find, hashOf } from '../model/bundle.js';
import { render } from '../render/render.js';

let currentPage = null;

export function buildDeepURL(page, anchorId = '') {
  const pageHash = hashOf(page) || '';
  const base = baseURLNoHash() + '#' + pageHash;
  return anchorId ? base + (pageHash ? '#' : '') + anchorId : (pageHash ? base + '#' : base);
}

export function parseTarget(hashOrHref = location.hash) {
  const href = (hashOrHref || '').startsWith('#') ? hashOrHref : new URL(hashOrHref || '', location.href).hash;
  if (href === '') return { page: root, anchor: '' };
  const seg = (href || '').slice(1).split('#').filter(Boolean);
  const page = seg.length ? find(seg) : root;
  const base = hashOf(page);
  const baseSegs = base ? base.split('#') : [];
  if (seg.length && !baseSegs.length) return { page: root, anchor: seg.join('#') };
  const anchor = seg.slice(baseSegs.length).join('#');
  return { page, anchor };
}

export function scrollToAnchor(anchor) {
  if (!anchor) return;
  const target = document.getElementById(anchor);
  if (target) target.scrollIntoView({ behavior: 'smooth' });
}

export async function route(mdParser) {
  const contentEl = $('#content');
  if (!contentEl) return;
  const t = parseTarget(location.hash) ?? { page: root, anchor: '' };
  const { page, anchor } = t;

  if (currentPage !== page) {
    currentPage = page;
    await render(contentEl, page, mdParser);
    if (!anchor) requestAnimationFrame(() => {
      (document.scrollingElement || document.documentElement).scrollTop = 0;
      $('#content')?.scrollTo?.(0, 0);
    });
  } else if (anchor) {
    scrollToAnchor(anchor);
  }
}