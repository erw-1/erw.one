/* eslint-env browser, es2022 */
import { $, $$, el } from '../core/dom.js';
import { pages, hashOf } from '../model/bundle.js';

function scoreOf(text, q) {
  // pondère : titre > tags > corps
  let s = 0;
  const words = q.split(/\s+/).filter(Boolean);
  for (const w of words) {
    const re = new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    s += re.test(text.titleL) ? 5 : 0;
    s += re.test(text.tagsL)  ? 3 : 0;
    s += re.test(text.bodyL)  ? 1 : 0;
  }
  return s;
}

export function search(q) {
  q = (q || '').trim();
  if (!q) return [];
  const results = [];
  for (const p of pages) {
    const s = scoreOf(p, q);
    if (!s) continue;
    const secs = (p.sections || []).filter(sec => (sec.search || '').includes(q.toLowerCase())).slice(0, 5);
    results.push({ page: p, score: s + secs.length, sections: secs });
  }
  results.sort((a,b) => b.score - a.score || (a.page.title||'').localeCompare(b.page.title||''));
  return results.slice(0, 50);
}

export function initSearch({ inputEl = $('#search'), resultsEl = $('#search-results') } = {}) {
  if (!inputEl || !resultsEl) return;
  inputEl.addEventListener('input', () => {
    const q = inputEl.value;
    const r = search(q);
    resultsEl.innerHTML = '';
    const ul = el('ul', { class: 'km-search-list' });
    r.forEach(({ page, sections }) => {
      const li = el('li', { class: 'km-search-item' });
      li.append(el('a', { href: '#' + hashOf(page), textContent: page.title || page.id }));
      if (sections?.length) {
        const sub = el('ul', { class: 'km-search-sub' });
        sections.forEach(sec => {
          sub.append(el('li', {}, el('a', { href: '#' + hashOf(page) + '#' + sec.id, textContent: sec.txt })));
        });
        li.append(sub);
      }
      ul.append(li);
    });
    resultsEl.append(ul);
  });
}