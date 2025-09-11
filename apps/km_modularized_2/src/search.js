// search.js
/* eslint-env browser, es2022 */
'use strict';

import { DOC, $, el } from './config_dom.js';
import { __model, sortByTitle, hashOf } from './model.js';

export function search(q) {
  const results = $('#results');
  const tree = $('#tree');
  if (!results || !tree) return;

  const query = String(q || '').trim().toLowerCase();
  results.setAttribute('aria-live', 'polite');
  results.setAttribute('aria-busy', 'true');

  // Empty query → hide results, show tree
  if (!query) {
    results.style.display = 'none';
    results.innerHTML = '';
    tree.style.display = '';
    results.setAttribute('aria-busy', 'false');
    return;
  }

  // Prep
  const tokens = query.split(/\s+/).filter(t => t.length >= 2);
  const tokenREs = tokens.map(t => new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b'));
  const phrase = tokens.length > 1 ? query : null;
  results.innerHTML = '';
  results.style.display = '';
  tree.style.display = 'none';

  // Weights
  const W = {
    title: 5, tag: 3, body: 1,
    secTitle: 3, secBody: 1,
    phraseTitle: 5, phraseBody: 2,
    secCountCap: 4
  };

  // Score pages
  const scored = [];
  for (const p of __model.pages) {
    if (!tokens.every(t => p.searchStr.includes(t))) continue;

    let score = 0;
    for (const r of tokenREs) {
      if (r.test(p.titleL)) score += W.title;
      if (r.test(p.tagsL))  score += W.tag;
      if (r.test(p.bodyL))  score += W.body;
    }
    if (phrase) score += p.titleL.includes(phrase) ? W.phraseTitle : (p.bodyL.includes(phrase) ? W.phraseBody : 0);

    // Section hits
    const matches = [];
    for (const sec of p.sections) {
      if (!tokens.every(t => sec.search.includes(t))) continue;
      const tL = sec.txt.toLowerCase();
      const bL = sec.body.toLowerCase();
      let s = 0;
      for (const r of tokenREs) {
        if (r.test(tL)) s += W.secTitle;
        if (r.test(bL)) s += W.secBody;
      }
      if (phrase && (tL.includes(phrase) || bL.includes(phrase))) s += 1;
      matches.push({ sec, s });
    }
    matches.sort((a, b) => b.s - a.s);
    score += Math.min(W.secCountCap, matches.length);

    scored.push({ p, score, matches });
  }

  // Sort and render
  scored.sort((a, b) => b.score - a.score || sortByTitle(a.p, b.p));

  const frag = DOC.createDocumentFragment();
  for (const { p, matches } of scored) {
    const li = el('li', { class: 'page-result' }, [
      el('a', { href: '#' + hashOf(p), textContent: p.title })
    ]);

    if (matches.length) {
      const base = hashOf(p);
      const sub = el('ul', { class: 'sub-results' });
      for (const { sec } of matches) {
        sub.append(el('li', { class: 'heading-result' }, [
          el('a', { href: `#${base ? base + '#' : ''}${sec.id}`, textContent: sec.txt })
        ]));
      }
      li.append(sub);
    }

    frag.append(li);
  }

  results.append(frag);
  if (!results.children.length) results.innerHTML = '<li id="no_result">No result</li>';
  results.setAttribute('aria-busy', 'false');
}
