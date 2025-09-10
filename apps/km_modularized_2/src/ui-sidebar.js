/* eslint-env browser, es2022 */
'use strict';

import { $, $$, el } from './dom.js';
import { __model, sortByTitle, hashOf } from './model.js';

function setFolderOpen(li, open) {
  li.classList.toggle('open', !!open);
  const sub = li.querySelector('ul');
  if (sub) sub.setAttribute('aria-hidden', open ? 'false' : 'true');
  const btn = li.querySelector('button.caret');
  if (btn) btn.setAttribute('aria-expanded', String(!!open));
}
export { setFolderOpen };

/** Build the collapsible navigation tree in the sidebar. */
export function buildTree() {
  const ul = $('#tree');
  const { root } = __model;
  if (!ul || !root) return;

  ul.setAttribute('role', 'tree');
  ul.innerHTML = '';

  const prim = root.children.filter(c => !c.isSecondary);
  const secs = root.children.filter(c => c.isSecondary).sort((a, b) => (a.clusterId - b.clusterId));

  const rec = (nodes, container, depth = 0) => {
    nodes.forEach(p => {
      const li = el('li');
      if (p.children.length) {
        const open = depth < 2; // auto-open top levels for discoverability
        li.className = 'folder' + (open ? ' open' : '');
        const groupId = `group-${p.id}`;

        const caret = el('button', {
          class: 'caret',
          'aria-controls': groupId,
          'aria-expanded': String(open),
          'aria-label': 'Toggle folder',
          type: 'button',
          textContent: '▸'
        });
        const a = el('a', { href: '#' + hashOf(p), textContent: p.title });
        const sub = el('ul', { id: groupId, 'aria-hidden': open ? 'false' : 'true' });

        li.append(caret, a, sub);
        container.append(li);
        rec(p.children.slice().sort(sortByTitle), sub, depth + 1);
      } else {
        li.append(el('a', { href: '#' + hashOf(p), textContent: p.title }));
        container.append(li);
      }
    });
  };

  rec(prim, ul, 0);
  if (secs.length) {
    const sep = el('li', { class: 'secondary-sep', textContent: '—' });
    ul.append(sep);
    rec(secs, ul, 0);
  }
}

/** Highlight the current page in the sidebar tree. */
export function highlightSidebar(page) {
  const root = $('#tree');
  if (!root || !page) return;
  root.querySelectorAll('a.current').forEach(a => a.classList.remove('current'));
  const a = root.querySelector(`a[href="#${hashOf(page)}"]`);
  if (!a) return;
  a.classList.add('current');

  // Ensure ancestors are open
  let li = a.closest('li');
  while (li) {
    if (li.classList.contains('folder')) setFolderOpen(li, true);
    li = li.parentElement?.closest?.('li') || null;
  }
}
