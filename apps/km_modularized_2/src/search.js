/* eslint-env browser, es2022 */
'use strict';

import { DOC, $, el } from './config_dom.js';
import { __model, sortByTitle, hashOf, extractHeadings } from './model.js';

// ───────────────────────────── Search index ─────────────────────────────
function scoreOne(q, page) {
  const ql = q.toLowerCase();
  const inTitle = page.title.toLowerCase().includes(ql);
  const titleScore = inTitle ? 10 : 0;

  const body = page.content.toLowerCase();
  let bodyScore = 0;
  const idx = body.indexOf(ql);
  if (idx !== -1) {
    // basic term frequency weight
    let count = 0, pos = idx;
    while (pos !== -1 && count < 5) { count++; pos = body.indexOf(ql, pos + ql.length); }
    bodyScore = count * 2;
  }

  const tagScore = page.tags?.some(t => t.toLowerCase() === ql) ? 3 : 0;
  return titleScore + bodyScore + tagScore;
}

function findSectionMatches(q, page) {
  const ql = q.toLowerCase();
  const heads = extractHeadings(page);
  const matches = [];
  heads.forEach(h => {
    if (h.txt.toLowerCase().includes(ql)) matches.push({ sec: h });
  });
  return matches;
}

// ===== Search (ranked; pages + section hits) =====
export function search(q) {
  const resUL = $('#results');
  const treeUL = $('#tree');
  const { pages } = __model;
  if (!resUL || !treeUL) return;
  const val = (q || '').trim();

  resUL.setAttribute('aria-live', 'polite');
  resUL.setAttribute('aria-busy', 'true');

  if (!val) {
    resUL.innerHTML = '';
    treeUL.style.display = '';
    resUL.style.display = 'none';
    resUL.setAttribute('aria-busy', 'false');
    return;
  }
  resUL.style.display = '';
  treeUL.style.display = 'none';
  resUL.innerHTML = '';

  // rank pages
  const scored = [];
  for (const p of pages) {
    const s = scoreOne(val, p);
    if (s > 0) scored.push({ p, s });
  }
  scored.sort((a, b) => b.s - a.s || sortByTitle(a.p, b.p));

  const frag = DOC.createDocumentFragment();
  for (const { p } of scored.slice(0, 50)) {
    const li = el('li', { class: 'page-result' });
    li.append(el('a', { href: '#' + p.hash, textContent: p.title }));

    const matchedSecs = findSectionMatches(val, p);
    if (matchedSecs.length) {
      const base = hashOf(p);
      const sub = el('ul', { class: 'sub-results' });
      matchedSecs.slice(0, 5).forEach(({ sec }) => {
        sub.append(el('li', { class: 'heading-result' }, [
          el('a', { href: `#${base ? base + '#' : ''}${sec.id}`, textContent: sec.txt })
        ]));
      });
      li.append(sub);
    }
    frag.append(li);
  }
  resUL.append(frag);
  if (!resUL.children.length) resUL.innerHTML = '<li id="no_result">No result</li>';
  resUL.setAttribute('aria-busy', 'false');
}
