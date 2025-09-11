/* eslint-env browser, es2022 */
'use strict';

import { DOC, $, $$, el, HEADINGS_SEL } from './config_dom.js';
import { __model, hashOf } from './model.js';

export function setFolderOpen(li, open) {
  if (!li) return;
  li.classList.toggle('open', !!open);
  li.setAttribute('aria-expanded', String(!!open));
  const caret = li.querySelector('button.caret');
  if (caret) {
    caret.setAttribute('aria-expanded', String(!!open));
    caret.setAttribute('aria-label', open ? 'Collapse' : 'Expand');
  }
  const sub = li.querySelector('ul[role="group"]');
  if (sub) sub.style.display = open ? 'block' : 'none';
}

/** Build the collapsible tree in the sidebar (faithful to original). */
export function buildTree() {
  const ul = $('#tree');
  const { root } = __model;
  if (!ul || !root) return;

  ul.setAttribute('role', 'tree');
  ul.innerHTML = '';

  // Preserve MD order for primary (non-secondary) children of root
  const prim = root.children.filter(c => !c.isSecondary);
  const secs = root.children.filter(c => c.isSecondary)
                            .sort((a, b) => a.clusterId - b.clusterId); // cluster order

  const rec = (nodes, container, depth = 0) => {
    nodes.forEach(p => {
      const li = el('li');
      li.setAttribute('role', 'treeitem');

      if (p.children.length) {
        const open = depth < 2; // auto-open top levels
        li.className = 'folder' + (open ? ' open' : '');
        li.setAttribute('aria-expanded', String(open));

        const groupId = `group-${p.id}`;

        const caret = el('button', {
          type: 'button',
          class: 'caret',
          'aria-controls': groupId,
          'aria-expanded': String(open),
          'aria-label': open ? 'Collapse' : 'Expand',
          textContent: '▸'
        });

        const lbl = el('a', {
          class: 'lbl',
          dataset: { page: p.id },
          href: '#' + hashOf(p),
          textContent: p.title
        });

        const sub = el('ul', {
          id: groupId,
          role: 'group',
          style: `display:${open ? 'block' : 'none'}`
        });

        li.append(caret, lbl, sub);
        container.append(li);

        // IMPORTANT: Preserve MD order as authored (no sorting)
        rec(p.children, sub, depth + 1);
      } else {
        li.className = 'article';
        li.append(el('a', {
          dataset: { page: p.id },
          href: '#' + hashOf(p),
          textContent: p.title
        }));
        container.append(li);
      }
    });
  };

  const frag = DOC.createDocumentFragment();
  rec(prim, frag);

  // Secondary clusters are separated visually and rendered in cluster order
  secs.forEach(rep => {
    const sep = el('div', {
      class: 'group-sep',
      role: 'presentation',
      'aria-hidden': 'true'
    }, [el('hr', { role: 'presentation', 'aria-hidden': 'true' })]);
    frag.append(sep);
    rec([rep], frag);
  });

  ul.append(frag);
}

/** Highlight current page in the tree and ensure its ancestors are open. */
export function highlightSidebar(page) {
  const rootEl = $('#tree');
  if (!rootEl || !page) return;

  rootEl.querySelectorAll('.sidebar-current').forEach(a => a.classList.remove('sidebar-current'));
  const a = rootEl.querySelector(`a[data-page="${page.id}"]`);
  if (!a) return;

  a.classList.add('sidebar-current');

  // Ensure ancestors are open
  let li = a.closest('li');
  while (li) {
    if (li.classList.contains('folder')) setFolderOpen(li, true);
    li = li.parentElement?.closest?.('li') || null;
  }

  // Keep the current item in view (without jumping page scroll)
  const tree = $('#tree');
  if (tree) {
    const r = a.getBoundingClientRect();
    const tr = tree.getBoundingClientRect();
    requestAnimationFrame(() => {
      if (r.top < tr.top || r.bottom > tr.bottom) {
        a.scrollIntoView({ block: 'nearest' });
      }
    });
  }
}

// ───────────────────────────── breadcrumb ────────────────────────────────
export function breadcrumb(page) {
  const dyn = $('#crumb-dyn');
  if (!dyn) return;
  dyn.innerHTML = '';
  const chain = [];
  for (let n = page; n; n = n.parent) chain.unshift(n);
  if (chain.length) chain.shift(); // drop root label

  chain.forEach((n, i) => {
    if (i) dyn.insertAdjacentHTML('beforeend', '<span class="separator">▸</span>');
    const wrap = el('span', { class: 'dropdown' });
    const a = el('a', { textContent: n.title, href: '#' + n.hash });
    if (n === page) a.className = 'crumb-current';
    wrap.append(a);

    const siblings = n.parent.children.filter(s => s !== n);
    if (siblings.length) {
      const ul = el('ul');
      siblings.forEach(s => ul.append(el('li', { textContent: s.title, onclick: () => KM.nav(s) })));
      wrap.append(ul);
    }
    dyn.append(wrap);
  });

  if (page.children.length) {
    const box = el('span', { class: 'childbox' }, [el('span', { class: 'toggle', textContent: '▾' }), el('ul')]);
    const ul = box.querySelector('ul');
    page.children.slice().sort((a,b)=>a.title.localeCompare(b.title)).forEach(ch => ul.append(el('li', { textContent: ch.title, onclick: () => KM.nav(ch) })));
    dyn.append(box);
  }
}

// ===== Table of Contents + live highlight =====
let tocObserver = null;
export function buildToc(page) {
  const tocEl = $('#toc');
  if (!tocEl) return;
  tocEl.innerHTML = '';
  const heads = $$('#content ' + HEADINGS_SEL);
  if (!heads.length) return;

  // entries
  const ul = el('ul');
  heads.forEach(h => {
    const id = h.id || '';
    const li = el('li', { 'data-hid': id }, [el('a', { href: '#' + (page.hash ? page.hash + '#' : '') + id, textContent: h.textContent || '' })]);
    ul.append(li);
  });
  tocEl.append(ul);

  // live highlight
  tocObserver?.disconnect?.();
  tocObserver = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      const id = en.target.id;
      const a = $(`#toc li[data-hid="${id}"] > a`);
      if (!a) return;
      $('#toc .toc-current')?.classList.remove('toc-current');
      a.classList.add('toc-current');
    });
  }, { root: null, rootMargin: '0px 0px -70% 0px', threshold: 0 });
  heads.forEach(h => tocObserver.observe(h));
}

// ===== Prev / Next and "See also" =====
export function prevNext(page) {
  const elx = $('#prevnext');
  if (!elx) return;
  const siblings = page.parent ? page.parent.children.slice().sort(sortByTitle) : [];
  const i = siblings.indexOf(page);
  const prev = i > 0 ? siblings[i - 1] : null;
  const next = i >= 0 && i < siblings.length - 1 ? siblings[i + 1] : null;

  elx.innerHTML = '';
  if (prev) elx.append(el('a', { href: '#' + hashOf(prev), class: 'prev', textContent: '← ' + prev.title }));
  if (next) elx.append(el('a', { href: '#' + hashOf(next), class: 'next', textContent: next.title + ' →' }));
}

export function seeAlso(page) {
  const elx = $('#seealso');
  if (!elx) return;
  elx.innerHTML = '';

  // naive: pages sharing at least one tag; skip self and direct siblings
  const tags = page.tagsSet || new Set();
  if (!tags.size) return;

  const same = __model.pages
    .filter(p => p !== page && p.parent !== page.parent && [...p.tagsSet].some(t => tags.has(t)))
    .slice(0, 6)
    .sort(sortByTitle);

  same.forEach(p => elx.append(el('a', { href: '#' + hashOf(p), textContent: p.title })));
}

export function closePanels() {
  $('#sidebar')?.classList.remove('open');
  $('#util')?.classList.remove('open');
}
