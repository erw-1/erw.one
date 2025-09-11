/* eslint-env browser, es2022 */
'use strict';

import { DOC, $, $$, el, HEADINGS_SEL } from './config-dom.js';
import { __model, sortByTitle, hashOf } from './model.js';

// ===== Search (ranked; pages + section hits) =====
export function search(q) {
  const resUL = $('#results');
  const treeUL = $('#tree');
  const { pages } = __model;
  if (!resUL || !treeUL) return;
  const val = (q || '').trim().toLowerCase();

  resUL.setAttribute('aria-live', 'polite');
  resUL.setAttribute('aria-busy', 'true');

  if (!val) {
    resUL.style.display = 'none';
    resUL.innerHTML = '';
    treeUL.style.display = '';
    resUL.setAttribute('aria-busy', 'false');
    return;
  }

  const tokens = val.split(/\s+/).filter(t => t.length >= 2);
  const tokenRegexes = tokens.map(t => new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b'));
  resUL.innerHTML = '';
  resUL.style.display = '';
  treeUL.style.display = 'none';

  const W = { title: 5, tag: 3, body: 1, secTitle: 3, secBody: 1, phraseTitle: 5, phraseBody: 2, secCountCap: 4 };
  const phrase = tokens.length > 1 ? val : null;

  const scored = [];
  for (const p of pages) {
    if (!tokens.every(tok => p.searchStr.includes(tok))) continue;
    let score = 0;

    for (const r of tokenRegexes) {
      if (r.test(p.titleL)) score += W.title;
      if (r.test(p.tagsL))  score += W.tag;
      if (r.test(p.bodyL))  score += W.body;
    }

    if (phrase) {
      if (p.titleL.includes(phrase)) score += W.phraseTitle;
      else if (p.bodyL.includes(phrase)) score += W.phraseBody;
    }

    const matchedSecs = [];
    for (const sec of p.sections) {
      if (!tokens.every(tok => sec.search.includes(tok))) continue;
      const secTitle = sec.txt.toLowerCase();
      const secBody = sec.body.toLowerCase();
      let s = 0;
      for (const r of tokenRegexes) {
        if (r.test(secTitle)) s += W.secTitle;
        if (r.test(secBody))  s += W.secBody;
      }
      if (phrase && (secTitle.includes(phrase) || secBody.includes(phrase))) s += 1;
      matchedSecs.push({ sec, s });
    }

    matchedSecs.sort((a, b) => b.s - a.s);
    score += Math.min(W.secCountCap, matchedSecs.length);
    scored.push({ p, score, matchedSecs });
  }

  scored.sort((a, b) => b.score - a.score || sortByTitle(a.p, b.p));

  const frag = DOC.createDocumentFragment();
  for (const { p, matchedSecs } of scored) {
    const li = el('li', { class: 'page-result' }, [
      el('a', { href: '#' + hashOf(p), textContent: p.title })
    ]);
    if (matchedSecs.length) {
      const base = hashOf(p);
      const sub = el('ul', { class: 'sub-results' });
      matchedSecs.forEach(({ sec }) => {
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
