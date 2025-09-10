/* eslint-env browser, es2022 */
'use strict';

import { DOC, $, $$, el } from './dom.js';
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
