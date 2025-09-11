/* eslint-env browser, es2022 */
'use strict';

import { DOC, $, $$, el, HEADINGS_SEL, __getVP, baseURLNoHash } from './config_dom.js';
import { __model, hashOf, sortByTitle } from './model.js';
import { getParsedHTML, normalizeAnchors, wireCopyButtons, __cleanupObservers } from './markdown.js';
import { buildDeepURL, parseTarget, enhanceRendered } from './router_renderer.js';

// ───────────────────────── Panels & sidebar toggles ─────────────────────────
export function closePanels() {
  $('#sidebar')?.classList.remove('open');
  $('#util')?.classList.remove('open');
}

export function setFolderOpen(li, open) {
  if (!li) return;
  li.classList.toggle('open', !!open);
  const caret = li.querySelector('button.caret');
  if (caret) caret.setAttribute('aria-pressed', String(!!open));
}

// ─────────────────────────── Sidebar: tree builder ───────────────────────────
function makeNodeLink(p) {
  const href = '#' + (p.hash || '');
  const a = el('a', { href, 'data-hash': p.hash, textContent: p.title });
  return a;
}

function makeCaret() {
  return el('button', { type: 'button', class: 'caret', 'aria-label': 'Toggle folder', 'aria-pressed': 'false' }, '▸');
}

function buildNode(p) {
  const li = el('li', {
    class: p.children?.length ? 'folder' : 'page',
    'data-hash': p.hash
  });
  if (p.children?.length) {
    const caret = makeCaret();
    caret.addEventListener('click', (e) => {
      e.stopPropagation();
      setFolderOpen(li, !li.classList.contains('open'));
    });
    li.append(caret);
  }
  li.append(makeNodeLink(p));
  if (p.children?.length) {
    const ul = el('ul');
    const kids = [...p.children].sort(sortByTitle);
    kids.forEach(k => ul.append(buildNode(k)));
    li.append(ul);
  }
  return li;
}

export function buildTree() {
  const tree = $('#tree');
  if (!tree) return;
  tree.innerHTML = '';
  const { root } = __model;
  if (!root) return;

  const ul = el('ul', { id: 'tree-root' });
  ul.append(buildNode(root));
  tree.append(ul);
}

// ─────────────────────────── Sidebar highlighting ───────────────────────────
export function highlightSidebar(page) {
  const tree = $('#tree');
  if (!tree || !page) return;
  tree.querySelectorAll('a.current').forEach(a => a.classList.remove('current'));
  const link = tree.querySelector(`a[data-hash="${page.hash}"]`);
  link?.classList.add('current');

  // ensure all ancestor folders are open
  let li = link?.closest('li');
  while (li) {
    if (li.classList.contains('folder')) setFolderOpen(li, true);
    li = li.parentElement?.closest?.('li');
  }

  // scroll into view if needed
  const vp = __getVP();
  const rect = link?.getBoundingClientRect();
  if (rect && (rect.top < 0 || rect.bottom > vp.h)) {
    link.scrollIntoView({ block: 'center' });
  }
}

// ───────────────────────────── Breadcrumbs ─────────────────────────────
export function breadcrumb(page) {
  const b = $('#breadcrumb');
  if (!b || !page) return;
  const path = [];
  let n = page;
  while (n) { path.push(n); n = n.parent; }
  path.reverse();

  b.innerHTML = '';
  const frag = DOC.createDocumentFragment();
  path.forEach((p, i) => {
    const isLast = i === path.length - 1;
    if (i) frag.append(el('span', { class: 'crumb-sep', textContent: '›' }));
    frag.append(el(isLast ? 'span' : 'a', {
      ...(isLast ? {} : { href: '#' + (p.hash || '') }),
      class: isLast ? 'crumb current' : 'crumb',
      textContent: p.title
    }));
  });
  $('#wiki-title-text')?.setAttribute?.('title', page.title);
  b.append(frag);
}

// ───────────────────────────── Prev / Next ─────────────────────────────
function flattenPagesDFS(root) {
  const out = [];
  (function dfs(n) {
    out.push(n);
    for (const c of (n.children || [])) dfs(c);
  })(root);
  return out;
}

export function prevNext(page) {
  const elx = $('#prevnext');
  if (!elx) return;
  elx.innerHTML = '';
  const order = flattenPagesDFS(__model.root);
  const idx = order.findIndex(p => p === page);
  if (idx === -1) return;

  const frag = DOC.createDocumentFragment();
  if (idx > 0) {
    const prev = order[idx - 1];
    frag.append(el('a', { class: 'prev', href: '#' + prev.hash, title: prev.title }, '← ' + prev.title));
  }
  if (idx < order.length - 1) {
    const next = order[idx + 1];
    frag.append(el('a', { class: 'next', href: '#' + next.hash, title: next.title }, next.title + ' →'));
  }
  elx.append(frag);
}

// ───────────────────────────── See Also (tags) ──────────────────────────
export function seeAlso(page) {
  const elx = $('#seealso');
  if (!elx) return;
  elx.innerHTML = '';
  if (!page?.tags?.length) return;

  const related = [];
  for (const p of __model.pages) {
    if (p === page) continue;
    if (p.tagsSet && page.tags.some(t => p.tagsSet.has(t))) related.push(p);
  }
  if (!related.length) return;

  related.sort(sortByTitle);
  const ul = el('ul');
  related.slice(0, 12).forEach(p => {
    ul.append(el('li', null, el('a', { href: '#' + p.hash, textContent: p.title })));
  });
  elx.append(el('h3', { textContent: 'See also' }), ul);
}

// ───────────────────────────── TOC (headings) ───────────────────────────
export function buildToc(page) {
  const tocEl = $('#toc');
  if (!tocEl) return;
  tocEl.innerHTML = '';
  const heads = $$('#content ' + HEADINGS_SEL);
  if (!heads.length) return;

  const ul = el('ul');
  heads.forEach(h => {
    const id  = h.id || '';
    const lvl = Math.min(6, Math.max(1, parseInt(h.tagName.slice(1), 10) || 1));
    const li  = el('li', { 'data-hid': id, 'data-lvl': String(lvl) }, [
      el('a', { href: '#' + (page.hash ? page.hash + '#' : '') + id, textContent: h.textContent || '' })
    ]);
    ul.append(li);
  });
  tocEl.append(ul);
}

// ───────────────────────────── Link previews ────────────────────────────
let previewHost = null;

function ensurePreviewHost() {
  if (previewHost) return previewHost;
  previewHost = el('div', { id: 'hover-preview', style: { position: 'fixed', maxWidth: '480px', zIndex: 50, display: 'none' } });
  document.body.append(previewHost);
  return previewHost;
}

function positionPreview(x, y) {
  const pad = 12;
  const vp = __getVP();
  const w = Math.min(480, vp.w - 2 * pad);
  previewHost.style.left = Math.min(vp.w - w - pad, Math.max(pad, x + 12)) + 'px';
  previewHost.style.top  = Math.min(vp.h - 200, Math.max(pad, y + 12)) + 'px';
  previewHost.style.maxWidth = w + 'px';
}

let previewAbort = null;

export function attachLinkPreviews() {
  const host = ensurePreviewHost();

  document.addEventListener('mouseover', async (e) => {
    const a = e.target?.closest?.('a.km-has-preview');
    if (!a) return;

    const href = a.getAttribute('href') || '';
    const { page, anchor } = parseTarget(href);
    if (!page) return;

    host.innerHTML = '<div class="preview loading">Loading…</div>';
    host.style.display = 'block';
    positionPreview(e.clientX, e.clientY);

    try {
      const html = await getParsedHTML(page);
      const tmp = el('div'); tmp.innerHTML = html;
      // Extract first meaningful bit
      const h1 = tmp.querySelector('h1,h2,h3');
      const p  = tmp.querySelector('p');
      const sec = anchor ? tmp.querySelector('#' + CSS.escape(anchor)) : null;

      const box = el('div', { class: 'preview' });
      if (h1) box.append(el('div', { class: 'preview-title', innerHTML: h1.outerHTML }));
      if (sec) box.append(el('div', { class: 'preview-sec', innerHTML: sec.outerHTML }));
      else if (p) box.append(el('div', { class: 'preview-snippet', innerHTML: p.outerHTML }));

      host.replaceChildren(box);
      // wire copy buttons inside preview once
      wireCopyButtons(host, () => baseURLNoHash() + '#');
      normalizeAnchors(host, page);
    } catch (err) {
      host.innerHTML = `<div class="preview error">Failed to load preview</div>`;
    }
  }, { passive: true });

  document.addEventListener('mousemove', (e) => {
    if (host?.style.display === 'block') positionPreview(e.clientX, e.clientY);
  }, { passive: true });

  document.addEventListener('mouseout', (e) => {
    const a = e.target?.closest?.('a.km-has-preview');
    if (!a) return;
    host.style.display = 'none';
    host.innerHTML = '';
  }, { passive: true });
}

// ───────────────────────────── Keyboard help ────────────────────────────
export function initKeybinds() {
  const input = $('#search');
  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '/' && input) {
      e.preventDefault();
      input.focus();
      input.select?.();
      return;
    }
    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      const kb = $('#kb-help');
      if (kb) { kb.hidden = !kb.hidden; e.preventDefault(); }
    }
  });
}

// ───────────────────────────── Panel toggles ────────────────────────────
export function initPanelToggles() {
  // Example: data-toggle="#sidebar"
  document.addEventListener('click', (e) => {
    const t = e.target?.closest?.('[data-toggle]');
    if (!t) return;
    const sel = t.getAttribute('data-toggle');
    const elx = sel ? $(sel) : null;
    if (!elx) return;
    elx.classList.toggle('open');
  });
}
