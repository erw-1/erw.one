/* eslint-env browser, es2022 */
import { $, baseURLNoHash } from '../core/namespace_dom.js';
import { root, find, hashOf } from '../model/bundle.js';
import { render as renderContent } from '../render/render.js';
import { breadcrumb } from '../ui/breadcrumb.js';
import { highlightSidebar } from '../ui/sidebar.js';
import { highlightCurrent } from '../graph/mini.js';

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

function resetScrollTop() {
  (document.scrollingElement || document.documentElement).scrollTop = 0;
  $('#content')?.scrollTo?.(0, 0);
}

export function closePanels() {
  $('#sidebar')?.classList.remove('open');
  $('#util')?.classList.remove('open');
}

export async function route(mdParser) {
  closePanels();
  const t = parseTarget(location.hash) ?? { page: root, anchor: '' };
  const { page, anchor } = t;
  const contentEl = $('#content');
  if (!contentEl) return;

  if (currentPage !== page) {
    currentPage = page;

    breadcrumb(page);
    await renderContent(contentEl, page, mdParser);
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

