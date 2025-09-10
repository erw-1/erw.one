/* eslint-env browser, es2022 */
import { $, DOC, el } from '../core/namespace_dom.js';
import { root, hashOf } from '../model/bundle.js';

export function buildTree() {
  const ul = $('#tree');
  if (!ul) return;
  ul.setAttribute('role', 'tree');
  ul.innerHTML = '';

  const prim = root.children.filter(c => !c.isSecondary);
  const secs = root.children
    .filter(c => c.isSecondary)
    .sort((a, b) => (a.clusterId ?? 0) - (b.clusterId ?? 0));

  const rec = (nodes, container, depth = 0) => {
    nodes.forEach(p => {
      const li = el('li');
      if (p.children.length) {
        const open = depth < 2;
        li.className = 'folder' + (open ? ' open' : '');
        const groupId = `group-${p.id}`;
        const caret = el('button', {
          type: 'button',
          class: 'caret',
          'aria-expanded': String(open),
          'aria-controls': groupId,
          'aria-label': open ? 'Collapse' : 'Expand'
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
        li.setAttribute('role', 'treeitem');
        li.setAttribute('aria-expanded', String(open));
        li.append(caret, lbl, sub);
        container.append(li);
        rec(p.children, sub, depth + 1);
      } else {
        li.className = 'article';
        li.setAttribute('role', 'treeitem');
        li.append(
          el('a', {
            dataset: { page: p.id },
            href: '#' + hashOf(p),
            textContent: p.title
          })
        );
        container.append(li);
      }
    });
  };

  const frag = DOC.createDocumentFragment();
  rec(prim, frag);
  secs.forEach(r => {
    const sep = el(
      'div',
      { class: 'group-sep', role: 'presentation', 'aria-hidden': 'true' },
      [el('hr', { role: 'presentation', 'aria-hidden': 'true' })]
    );
    frag.append(sep);
    rec([r], frag);
  });
  ul.append(frag);
}

export function setFolderOpen(li, open) {
  if (!li) return;
  li.classList.toggle('open', !!open);
  li.setAttribute('aria-expanded', String(!!open));
  const caret = li.querySelector('button.caret');
  if (caret) {
    caret.setAttribute('aria-expanded', String(!!open));
    caret.setAttribute('aria-label', !!open ? 'Collapse' : 'Expand');
  }
  const sub = li.querySelector('ul[role="group"]');
  if (sub) sub.style.display = !!open ? 'block' : 'none';
}

export function highlightSidebar(page) {
  $('#tree .sidebar-current')?.classList.remove('sidebar-current');
  const link = $(`#tree a[data-page="${page.id}"]`);
  if (!link) return;
  link.classList.add('sidebar-current');

  let li = link.closest('li');
  while (li) {
    if (li.classList.contains('folder')) setFolderOpen(li, true);
    li = li.parentElement?.closest('li');
  }

  const tree = $('#tree');
  if (tree && link) {
    const r = link.getBoundingClientRect();
    const tr = tree.getBoundingClientRect();
    requestAnimationFrame(() => {
      if (r.top < tr.top || r.bottom > tr.bottom) link.scrollIntoView({ block: 'nearest' });
    });
  }
}

export function initSidebar() {
  buildTree();
  const tree = $('#tree');
  if (!tree) return;
  tree.addEventListener(
    'click',
    e => {
      const caret = e.target.closest('button.caret');
      if (caret) {
        const li = caret.closest('li.folder');
        const open = !li.classList.contains('open');
        setFolderOpen(li, open);
      }
    },
    { passive: true }
  );
}

