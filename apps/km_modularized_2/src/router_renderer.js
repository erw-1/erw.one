/* eslint-env browser, es2022 */
'use strict';

import { DOC, $, $$, baseURLNoHash, ALLOW_JS_FROM_MD } from './config_dom.js';
import { __model, find, hashOf } from './model.js';
import { highlightCurrent } from './graph.js';
import { highlightSidebar, breadcrumb, buildToc, seeAlso, prevNext, closePanels } from './ui.js';
import { getParsedHTML, decorateExternalLinks, normalizeAnchors, annotatePreviewableLinks, highlightVisibleCode, renderMathSafe, decorateHeadings, decorateCodeBlocks, __trackObserver, __cleanupObservers } from './markdown.js';

// Current page used to debounce renders
let currentPage = null;

// Build a deep-link URL for a given page + anchor id
export const buildDeepURL = (page, anchorId = '') => {
  const pageHash = hashOf(page) || '';
  const base = baseURLNoHash() + '#' + pageHash;
  return anchorId ? base + (pageHash ? '#' : '') + anchorId : (pageHash ? base + '#' : base);
};

async function render(page, anchor) {
  const contentEl = $('#content');
  if (!contentEl) return;
  __cleanupObservers();

  contentEl.dataset.mathRendered = '0';
  contentEl.innerHTML = await getParsedHTML(page);

  if (ALLOW_JS_FROM_MD === 'true') {
    // Run scripts embedded in the Markdown (main content only)
    contentEl.querySelectorAll('script').forEach(old => {
      const s = document.createElement('script');
      for (const { name, value } of [...old.attributes]) s.setAttribute(name, value);
      s.textContent = old.textContent || '';
      old.replaceWith(s);
    });
  }

  await enhanceRendered(contentEl, page);

  buildToc(page);
  prevNext(page);
  seeAlso(page);
  scrollToAnchor(anchor);
}

/** Enhance rendered content: decorations, previews, math, etc. */
export async function enhanceRendered(contentEl, page) {
  decorateExternalLinks(contentEl);
  decorateHeadings(page, contentEl);
  decorateCodeBlocks(contentEl);
  decorateExternalLinks(contentEl);
  annotatePreviewableLinks(contentEl);
  highlightVisibleCode(contentEl);
  await ensureKatex(); // in case math rendering needed
  renderMathSafe(contentEl);
  await window.KM.ensureMarkdown().then(m => m.renderMermaidLazy(contentEl));
}

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

  // If segments didn't resolve beyond root, treat remainder as in-page anchor on root.
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

export function scrollToAnchor(anchor) {
  if (!anchor) return;
  const target = DOC.getElementById(anchor);
  if (target) target.scrollIntoView({ behavior: 'smooth' });
}

/** Main routing: render the page (if changed) on hash updates. */
export async function route() {
  const { page, anchor } = parseTarget();
  if (!page || page === currentPage) {
    // Still scroll to anchor or close panels if needed
    scrollToAnchor(anchor);
    return;
  }
  currentPage = page;

  // Close panels on page change
  closePanels();
  resetScrollTop();
  highlightSidebar(page);
  breadcrumb(page);

  // Render content
  await render(page, anchor);
}
