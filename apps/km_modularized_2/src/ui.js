/* eslint-env browser, es2022 */
'use strict';

import { DOC, $, $$, el, HEADINGS_SEL, __getVP, baseURLNoHash } from './config_dom.js';
import { __model, hashOf } from './model.js';
import { getParsedHTML, normalizeAnchors, wireCopyButtons, __cleanupObservers } from './markdown.js';
import { buildDeepURL, parseTarget, enhanceRendered } from './router_renderer.js';

/** Close all open panels (sidebars, overlays). */
export function closePanels() {
  $('.panel-close')?.remove();
  $('#sidebar')?.classList.remove('open');
  $('#util')?.classList.remove('open');
}

/** Open/close a folder in the sidebar. */
export function setFolderOpen(li, open) {
  li.classList.toggle('open', !!open);
}

/** Build the collapsible page tree in the sidebar. */
export function buildTree() {
  const { root, pages } = __model;
  const elTree = $('#tree');
  if (!root || !elTree) return;
  elTree.innerHTML = '';

  function rec(parentEl, depth, page) {
    if (page.isSecondary && page.parent === root) return; // skip sec. homes
    const open = depth < 2;
    const li = el('li', {
      class: 'folder' + (open ? ' open' : '')
    });
    const gid = page.parent ? page.parent.id || '' : '';
    li.dataset.kmGroup = gid;
    li.dataset.kmHid = page.id;
    const a = el('a', { href: '#' + hashOf(page), textContent: page.title });
    li.append(a);

    if (page.children && page.children.length) {
      const caret = el('button', { type: 'button', class: 'caret', title: 'Toggle' }, '▸');
      const sub = el('ul', {});
      caret.onclick = () => setFolderOpen(li, !li.classList.contains('open'));
      li.prepend(caret);
      li.append(sub);
      if (open) page.children.forEach(c => rec(sub, depth + 1, c));
    }
    parentEl.append(li);
  }

  rec(elTree, 0, root);
}

/** Highlight the active page in the sidebar. */
export function highlightSidebar(page) {
  if (!page) return;
  $$('#tree li').forEach(li => li.classList.remove('sidebar-current'));
  const li = $(`#tree li[data-hid="${page.id}"]`);
  if (!li) return;
  li.classList.add('sidebar-current');
  li.scrollIntoView({ block: 'center', inline: 'nearest' });
}

/** Update the breadcrumb navigation. */
export function breadcrumb(page) {
  const nav = $('#breadcrumbs');
  if (!nav) return;
  const chain = [];
  let n = page;
  while (n) {
    chain.unshift(n);
    n = n.parent;
  }
  // Drop root label
  if (chain.length) chain.shift();
  nav.innerHTML = '';
  if (!chain.length) return;

  let ptr = nav;
  chain.forEach((p, i) => {
    const a = el('a', { href: '#' + hashOf(p), textContent: p.title });
    const li = el('li', {}, a);
    ptr.append(li);

    // Siblings dropdown
    if (p.parent && p.parent.children.length > 1) {
      const parent = p.parent;
      const siblings = parent.children.slice().sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
      const sub = el('ul', {});
      siblings.forEach(sib => {
        sub.append(el('li', {}, el('a', {
          href: '#' + hashOf(sib), textContent: sib.title
        })));
      });
      li.append(sub);
    }

    // Direct children list (for all but last)
    if (i !== chain.length - 1) {
      const nextList = el('ul', {});
      li.append(nextList);
      ptr = nextList;
    }
  });
}

/** Build the Table of Contents for the page. */
export function buildToc(page) {
  const toc = $('#toc');
  if (!toc) return;
  toc.innerHTML = '';
  toc.removeAttribute('hidden');

  if (!page.sections.length) {
    toc.hidden = true;
    return;
  }

  page.sections.forEach(sec => {
    const li = el('li', { 'data-hid': sec.id });
    const a = el('a', { href: '#' + sec.id, textContent: sec.txt });
    li.append(a);
    toc.append(li);
  });

  // Highlight current section in view
  const observer = new IntersectionObserver((entries, obs) => {
    let current = toc.querySelector('.toc-current');
    current?.classList.remove('toc-current');
    for (const e of entries) {
      if (e.isIntersecting) {
        const id = e.target.id;
        const a = toc.querySelector(`a[href="#${id}"]`);
        if (a) {
          a.classList.add('toc-current');
          break;
        }
      }
    }
  }, { rootMargin: '200px 0px 0 0' });
  $$(HEADINGS_SEL).forEach(h => observer.observe(h));
}

/** Set up "previous" and "next" page links at bottom of content. */
export function prevNext(page) {
  const prevEl = $('#prev');
  const nextEl = $('#next');
  if (!prevEl || !nextEl) return;
  const { pages, root } = __model;
  const list = (p) => p.parent ? p.parent.children : (p === root ? [p] : []);
  const siblings = list(page);
  const idx = siblings.indexOf(page);
  const prevPage = idx > 0 ? siblings[idx - 1] : null;
  const nextPage = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
  if (prevPage) {
    prevEl.href = '#' + hashOf(prevPage);
    prevEl.hidden = false;
  }
  if (nextPage) {
    nextEl.href = '#' + hashOf(nextPage);
    nextEl.hidden = false;
  }
}

/** Build "See also" links (based on tags) at bottom. */
export function seeAlso(page) {
  const seeb = $('#see-also');
  if (!seeb) return;
  seeb.innerHTML = '';
  const related = Array.from(__model.pages)
    .filter(p => p !== page && p.parent === page.parent)
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  if (!related.length) {
    seeb.hidden = true;
    return;
  }
  seeb.hidden = false;
  related.forEach(p => {
    seeb.append(el('li', {}, el('a', { href: '#' + hashOf(p), textContent: p.title })));
  });
}
