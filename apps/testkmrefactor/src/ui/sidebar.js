/* eslint-env browser, es2022 */
import { $, $$, el } from '../core/dom.js';
import { root, pages, hashOf } from '../model/bundle.js';

let container, onNavigate;

function buildNode(page) {
  const li = el('li', { class: 'km-side-node', dataset: { id: page.id } });
  const a  = el('a', { href: '#' + hashOf(page), textContent: page.title || page.id });
  const children = el('ul', { class: 'km-side-children' });

  if (page.children?.length) {
    const btn = el('button', { class: 'km-side-toggle', type: 'button', ariaLabel: 'Toggle' }, '▸');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const open = li.getAttribute('data-open') === '1';
      li.setAttribute('data-open', open ? '0' : '1');
    });
    li.append(btn);
  }

  li.append(a, children);
  page.children?.forEach(ch => children.append(buildNode(ch)));
  return li;
}

export function buildTree() {
  if (!container) return;
  container.innerHTML = '';
  const ul = el('ul', { class: 'km-side-tree' });
  ul.append(buildNode(root));
  container.append(ul);

  container.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (a && onNavigate) {
      // laisser le routeur gérer, mais permettre un hook
      onNavigate(a.getAttribute('href'));
    }
  }, { passive: true });
}

export function setFolderOpen(pageId, open=true) {
  const li = container?.querySelector(`.km-side-node[data-id="${CSS.escape(pageId)}"]`);
  if (li) li.setAttribute('data-open', open ? '1' : '0');
}

export function highlightSidebar(currentPage) {
  if (!container) return;
  $$('.km-side-node a.is-active', container).forEach(a => a.classList.remove('is-active'));
  const id = currentPage?.id;
  if (!id) return;
  const link = container.querySelector(`.km-side-node[data-id="${CSS.escape(id)}"] > a`);
  if (link) link.classList.add('is-active');

  // Ouvrir la chaîne parent → enfant
  let p = currentPage;
  while (p && p.parent) {
    setFolderOpen(p.id, true);
    p = p.parent;
  }
}

export function initSidebar({ containerEl, onNav } = {}) {
  container = containerEl || $('#sidebar');
  onNavigate = onNav || null;
  buildTree();
}
