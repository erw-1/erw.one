/* eslint-env browser, es2022 */
'use strict';

import { DOC, $, $$, el, baseURLNoHash, ALLOW_JS_FROM_MD, __getVP, TITLE } from './config_dom.js';
import { __model, find, hashOf } from './model.js';
import { highlightCurrent } from './graph.js';
import { highlightSidebar, breadcrumb, buildToc, seeAlso, prevNext, closePanels } from './ui.js';
import { getParsedHTML, decorateExternalLinks, normalizeAnchors, wireCopyButtons, annotatePreviewableLinks, highlightVisibleCode, renderMathSafe, decorateHeadings, decorateCodeBlocks, __trackObserver, __cleanupObservers, runInlineScripts } from './markdown.js';
import { ensureMarkdown, ensureKatex } from './loaders.js';

let currentPage = null;

/** Build a deep-link URL for a page (and optional anchor). */
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
    // Execute scripts embedded in the Markdown
    runInlineScripts(contentEl);
  }

  await enhanceRendered(contentEl, page);

  buildToc(page);
  prevNext(page);
  seeAlso(page);
  scrollToAnchor(anchor);
}

/**
 * Parse a hash/href into {page, anchor}, or null.
 * Accepts full URLs or hash fragments.
 * {page: root, anchor: ''} is returned for empty hash.
 * Returns null if hash is an anchor to a non-existent page.
 */
export function parseTarget(hashOrHref = location.hash) {
  const { root } = __model;
  const href = (hashOrHref || '').startsWith('#') ? hashOrHref : new URL(hashOrHref || '', location.href).hash;

  if (href === '') return { page: root, anchor: '' };

  const seg = (href || '').slice(1).split('#').filter(Boolean);
  const page = seg.length ? find(seg) : root;
  const base = hashOf(page);
  const baseSegs = base ? base.split('#') : [];

  // If resolved no further than root, treat remainder as in-page anchor on root
  if (seg.length && !baseSegs.length) {
    return { page: root, anchor: seg.join('#') };
  }

  const anchor = seg.slice(baseSegs.length).join('#');
  return { page, anchor };
}

export function isInternalPageLink(a) {
  const href = a?.getAttribute('href') || '';
  return !!parseTarget(href);
}

/** Reset window scroll to top. */
export function resetScrollTop() {
  (document.scrollingElement || document.documentElement).scrollTop = 0;
  document.getElementById('content')?.scrollTo(0, 0);
}

/** Smooth scroll to a given anchor ID in content. */
export function scrollToAnchor(anchor) {
  if (!anchor) return;
  const target = DOC.getElementById(anchor);
  if (target) target.scrollIntoView({ behavior: 'smooth' });
}

/** Update view on hashchange/navigation. */
export function route() {
  closePanels();
  const t = parseTarget(location.hash) ?? { page: __model.root, anchor: '' };
  const page = t.page;
  const anchor = t.anchor;

  if (currentPage !== page) {
    currentPage = page;
    
    // Update the browser tab title to "{current page title} • {TITLE}"
    const pt = page?.title || '';
    DOC.title = pt && pt !== TITLE ? `${pt} • ${TITLE}` : TITLE;
    
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

// ─────────────────────────── renderer + enhancements ───────────────────────────

export async function enhanceRendered(containerEl, page) {
  decorateExternalLinks(containerEl);

  // Optimize images
  const imgs = $$('img', containerEl);
  imgs.forEach((img, i) => {
    img.loading = 'lazy';
    img.decoding = 'async';
    if (!img.hasAttribute('fetchpriority') && i < 2) img.setAttribute('fetchpriority', 'high');
  });

  normalizeAnchors(containerEl, page, { onlyFootnotes: true });
  annotatePreviewableLinks(containerEl);
  highlightVisibleCode(containerEl); // async

  ensureMarkdown().then(({ renderMermaidLazy }) => renderMermaidLazy(containerEl));
  if (/(\$[^$]+\$|\\\(|\\\[)/.test(page.content)) {
    const obs = __trackObserver(new IntersectionObserver((entries, o) => {
      if (entries.some(en => en.isIntersecting)) {
        ensureKatex().then(() => renderMathSafe(containerEl));
        o.disconnect();
      }
    }, { root: null, rootMargin: '200px 0px', threshold: 0 }), containerEl);
    obs.observe(containerEl);
  }

  decorateHeadings(page, containerEl);
  decorateCodeBlocks(containerEl);
}

/** Hover link previews */
export function attachLinkPreviews() {
  const previewStack = [];
  const HOVER_DELAY_MS = 500;
  let hoverTimer = null;
  let hoverLinkEl = null;

  function cancelPendingHover() {
    if (hoverTimer) clearTimeout(hoverTimer);
    if (hoverLinkEl) {
      hoverLinkEl.style.cursor = '';
      delete hoverLinkEl.dataset.previewPending;
    }
    hoverTimer = null;
    hoverLinkEl = null;
  }

  function rewriteRelativeAnchors(panel, page) {
    normalizeAnchors(panel.body, page);
  }

  function positionPreview(panel, linkEl) {
    const rect = linkEl.getBoundingClientRect();
    const { __VPW: vw, __VPH: vh } = __getVP();
    const gap = 8;
    const elx = panel.el;
    const W = Math.max(1, elx.offsetWidth);
    const H = Math.max(1, elx.offsetHeight);
    const preferRight = rect.right + gap + W <= vw;
    const left = preferRight ? Math.min(rect.right + gap, vw - W - gap) : Math.max(gap, rect.left - gap - W);
    const top = Math.min(Math.max(gap, rect.top), Math.max(gap, vh - H - gap));
    Object.assign(panel.el.style, { left: left + 'px', top: top + 'px' });
  }

  function closeFrom(indexInclusive = 0) {
    for (let i = previewStack.length - 1; i >= indexInclusive; i--) {
      const p = previewStack[i];
      clearTimeout(p.timer);
      __cleanupObservers(p.el);
      p.el.remove();
      previewStack.pop();
    }
  }

  function anyPreviewOrTriggerActive() {
    const anyHoverPreview = Array.from(document.querySelectorAll('.km-link-preview')).some(p => p.matches(':hover'));
    if (anyHoverPreview) return true;
    const active = document.activeElement;
    const activeIsTrigger = active && active.closest && isInternalPageLink?.(active.closest('a[href^="#"]'));
    if (activeIsTrigger) return true;
    const hoveringTrigger = previewStack.some(p => p.link && p.link.matches(':hover'));
    return hoveringTrigger;
  }

  let trimTimer;
  function scheduleTrim() {
    clearTimeout(trimTimer);
    trimTimer = setTimeout(() => { if (!anyPreviewOrTriggerActive()) closeFrom(0); }, 220);
  }

  async function fillPanel(panel, page, anchor) {
    panel.body.dataset.mathRendered = '0';
    panel.body.innerHTML = await getParsedHTML(page);
    rewriteRelativeAnchors(panel, page);
    await enhanceRendered(panel.body, page);

    if (anchor) {
      const container = panel.el;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const t = panel.body.querySelector('#' + CSS.escape(anchor));
      if (t) {
        const header = container.querySelector('header');
        const headerH = header ? header.offsetHeight : 0;
        const cRect = container.getBoundingClientRect();
        const tRect = t.getBoundingClientRect();
        const y = tRect.top - cRect.top + container.scrollTop;
        const top = Math.max(0, y - headerH - 6);
        container.scrollTo({ top, behavior: 'auto' });
        t.classList.add('km-preview-focus');
      }
    }
  }

  function createPanel(linkEl) {
    const container = el('div', { class: 'km-link-preview', role: 'dialog', 'aria-label': 'Preview' });
    const header = el('header', {}, [
      el('button', { type: 'button', class: 'km-preview-close', title: 'Close', 'aria-label': 'Close', innerHTML: '✕' })
    ]);
    const body = el('div');
    container.append(header, body);
    DOC.body.appendChild(container);

    const panel = { el: container, body, link: linkEl, timer: null };
    const idx = previewStack.push(panel) - 1;

    container.addEventListener('mouseenter', () => { clearTimeout(panel.timer); clearTimeout(trimTimer); }, { passive: true });
    container.addEventListener('mouseleave', e => {
      const to = e.relatedTarget;
      if (to && to.closest && to.closest('.km-link-preview')) return;
      panel.timer = setTimeout(() => closeFrom(idx), 240);
    }, { passive: true });
    header.querySelector('button').addEventListener('click', () => closeFrom(idx));
    container.addEventListener('mouseover', e => maybeOpenFromEvent(e), true);
    container.addEventListener('focusin', e => maybeOpenFromEvent(e), true);

    positionPreview(panel, linkEl);
    wireCopyButtons(panel.el, () => {
      const t = parseTarget(panel.link.getAttribute('href') || '');
      return buildDeepURL(t?.page, '') || (baseURLNoHash() + '#');
    });

    return panel;
  }

  async function openPreviewForLink(a) {
    const href = a.getAttribute('href') || '';
    const target = parseTarget(href);
    if (!target) return;

    const existingIdx = previewStack.findIndex(p => p.link === a);
    if (existingIdx >= 0) {
      const existing = previewStack[existingIdx];
      clearTimeout(existing.timer);
      positionPreview(existing, a);
      return;
    }

    const panel = createPanel(a);
    previewStack.forEach(p => clearTimeout(p.timer));
    await fillPanel(panel, target.page, target.anchor);
  }

  function maybeOpenFromEvent(e) {
    const a = e.target?.closest('a[href^="#"]');
    if (!a || !isInternalPageLink(a)) return;

    if (e.type === 'focusin') {
      cancelPendingHover();
      openPreviewForLink(a);
      return;
    }

    // hover
    cancelPendingHover();
    hoverLinkEl = a;
    a.dataset.previewPending = '1';
    a.style.cursor = 'progress';

    hoverTimer = setTimeout(() => {
      a.style.cursor = '';
      delete a.dataset.previewPending;
      openPreviewForLink(a);
      hoverTimer = null;
      hoverLinkEl = null;
    }, HOVER_DELAY_MS);

    a.addEventListener('mouseleave', cancelPendingHover, { once: true });
    a.addEventListener('blur', cancelPendingHover, { once: true });
  }

  const root = $('#content');
  if (!root) return;
  if (root.dataset.kmPreviewsBound === '1') return;
  root.dataset.kmPreviewsBound = '1';
  root.addEventListener('mouseover', maybeOpenFromEvent, true);
  root.addEventListener('focusin', maybeOpenFromEvent, true);
  root.addEventListener('mouseout', e => {
    const to = e.relatedTarget;
    if (e.target?.closest('a[href^="#"]') && (!to || !to.closest || !to.closest('a[href^="#"]'))) {
      cancelPendingHover();
    }
    if (to && (to.closest && to.closest('.km-link-preview'))) return;
    scheduleTrim();
  }, true);

  addEventListener('hashchange', () => { cancelPendingHover(); closeFrom(0); }, { passive: true });
  addEventListener('scroll', () => { cancelPendingHover(); scheduleTrim(); }, { passive: true });
}
