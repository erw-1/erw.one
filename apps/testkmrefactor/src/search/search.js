/* eslint-env browser, es2022 */
import { $, DOC, el } from '../core/dom.js';
import { pages, hashOf } from '../model/bundle.js';

const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
const sortByTitle = (a, b) => collator.compare(a.title || '', b.title || '');
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function search(q) {
  const resUL = $('#results');
  const treeUL = $('#tree');
  if (!resUL || !treeUL) return;

  const val = (q || '').trim().toLowerCase();
  resUL.setAttribute('aria-live', 'polite');
  resUL.setAttribute('aria-busy', 'true');

  if (!val) {
    resUL.style.display = 'none';
    resUL.innerHTML = '';
    treeUL.style.display = '';
    return;
  }

  const tokens = val.split(/\s+/).filter(t => t.length >= 2);
  const tokenRegexes = tokens.map(t => new RegExp('\\b' + escapeRegex(t) + '\\b'));
  resUL.innerHTML = '';
  resUL.style.display = '';
  treeUL.style.display = 'none';

  const W = {
    title: 5,
    tag: 3,
    body: 1,
    secTitle: 3,
    secBody: 1,
    phraseTitle: 5,
    phraseBody: 2,
    secCountCap: 4
  };
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
      el('a', { href: '#' + hashOf(p), textContent: p.title || p.id })
    ]);

    if (matchedSecs.length) {
      const base = hashOf(p);
      const sub = el('ul', { class: 'sub-results' });
      matchedSecs.forEach(({ sec }) => {
        sub.append(
          el('li', { class: 'heading-result' }, [
            el('a', { href: `#${base ? base + '#' : ''}${sec.id}`, textContent: sec.txt })
          ])
        );
      });
      li.append(sub);
    }

    frag.append(li);
  }

  resUL.append(frag);
  if (!resUL.children.length) resUL.innerHTML = '<li id="no_result">No result</li>';

  resUL.setAttribute('aria-busy', 'false');
}

export function initSearch() {
  const searchInput = $('#search');
  const searchClear = $('#search-clear');
  if (!searchInput || !searchClear) return;

  let debounce = 0;
  searchInput.oninput = (e) => {
    clearTimeout(debounce);
    const val = e.target.value;
    searchClear.style.display = val ? '' : 'none';
    debounce = setTimeout(() => search(val), 150);
  };
  searchClear.onclick = () => {
    searchInput.value = '';
    searchClear.style.display = 'none';
    search('');
    searchInput.focus();
  };
  // initial state
  search('');
}
