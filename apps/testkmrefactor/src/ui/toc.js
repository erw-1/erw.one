/* eslint-env browser, es2022 */
import { $, $$, el } from '../core/namespace_dom.js';

let tocEl, io;

export function buildToc(contentEl = $('#content')) {
  tocEl ||= $('#toc');
  if (!tocEl || !contentEl) return;
  tocEl.innerHTML = '';

  const heads = $$('h1,h2,h3,h4,h5,h6', contentEl);
  const ul = el('ul', { class: 'km-toc' });
  heads.forEach(h => {
    if (!h.id) return;
    const lvl = +h.tagName[1];
    const li = el('li', { class: `lvl-${lvl}` },
      el('a', { href: `#${h.id}`, textContent: h.textContent })
    );
    ul.append(li);
  });
  tocEl.append(ul);

  // highlight au scroll
  io?.disconnect();
  io = new IntersectionObserver((entries) => {
    const best = entries
      .filter(e => e.isIntersecting)
      .sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!best) return;
    const id = best.target.id;
    $$('.km-toc a.is-active', tocEl).forEach(a => a.classList.remove('is-active'));
    const a = tocEl.querySelector(`a[href="#${CSS.escape(id)}"]`);
    if (a) a.classList.add('is-active');
  }, { rootMargin: '-20% 0px -70% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] });

  heads.forEach(h => io.observe(h));
}

