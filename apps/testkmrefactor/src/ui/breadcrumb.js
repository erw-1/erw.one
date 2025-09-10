/* eslint-env browser, es2022 */
import { $, el } from '../core/dom.js';
import { hashOf, nav } from '../model/bundle.js';

const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
const sortByTitle = (a, b) => collator.compare(a.title, b.title);

export function breadcrumb(page) {
  const dyn = $('#crumb-dyn');
  if (!dyn || !page) return;

  dyn.innerHTML = '';

  const chain = [];
  for (let n = page; n; n = n.parent) chain.unshift(n);
  if (chain.length) chain.shift();

  chain.forEach((n, i) => {
    if (i) dyn.insertAdjacentHTML('beforeend', '<span class="separator">▸</span>');

    const wrap = el('span', { class: 'dropdown' });
    const a = el('a', { textContent: n.title, href: '#' + hashOf(n) });
    if (n === page) a.className = 'crumb-current';
    wrap.append(a);

    const siblings = n.parent?.children?.filter(s => s !== n) || [];
    if (siblings.length) {
      const ul = el('ul');
      siblings.forEach(s =>
        ul.append(el('li', { textContent: s.title, onclick: () => nav(s) }))
      );
      wrap.append(ul);
    }

    dyn.append(wrap);
  });

  if (page.children?.length) {
    const box = el('span', { class: 'childbox' }, [
      el('span', { class: 'toggle', textContent: '▾' }),
      el('ul')
    ]);
    const ul = box.querySelector('ul');
    page.children
      .slice()
      .sort(sortByTitle)
      .forEach(ch =>
        ul.append(el('li', { textContent: ch.title, onclick: () => nav(ch) }))
      );
    dyn.append(box);
  }
}
