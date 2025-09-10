/* eslint-env browser, es2022 */
import { $, el } from '../core/dom.js';
import { hashOf } from '../model/bundle.js';

export function renderBreadcrumb(containerEl, page) {
  const elc = containerEl || $('#breadcrumb');
  if (!elc || !page) return;

  // remonte jusqu'à la racine
  const chain = [];
  for (let n = page; n; n = n.parent) chain.push(n);
  chain.reverse();

  elc.innerHTML = '';
  const nav = el('nav', { class: 'km-breadcrumb', ariaLabel: 'Breadcrumb' });
  chain.forEach((p, i) => {
    nav.append(
      el('a', { href: '#' + hashOf(p), textContent: p.title || p.id }),
      i < chain.length - 1 ? el('span', { class: 'sep' }, ' / ') : ''
    );
  });
  elc.append(nav);
}
