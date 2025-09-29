*/* eslint-env browser, es2022 */
'use strict';

import { DOC, $, el, escapeRegex } from './config_dom.js';
import { __model, sortByTitle, hashOf } from './model.js';

/** -------- Utilities -------- */

/** Tokenize a query string (lowercase, min length 2) */
function tokenize(q = '') {
  return (q || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length >= 2);
}

/** Return true if all tokens are present as substrings of `str` */
function matchesAllTokens(str, tokens) {
  if (!tokens.length) return true;
  for (let i = 0; i < tokens.length; i++) {
    if (!str.includes(tokens[i])) return false;
  }
  return true;
}

/** Build a single combined regex that matches any token as a whole word. */
function buildCombinedRegex(tokens) {
  if (!tokens.length) return null;
  const pattern = tokens.map(t => `\\b${escapeRegex(t)}\\b`).join('|');
  return new RegExp(pattern, 'g'); // we lower-case strings ourselves
}

/** Scoring weights (consistent camelCase) */
const WEIGHTS = Object.freeze({
  title: 5,
  tag: 3,
  body: 1,
  secTitle: 3,
  secBody: 1,
  phraseTitle: 5,
  phraseBody: 2,
  secCountCap: 4
});

/** Compute a score for a page given tokens/phrase and a prebuilt regex */
function computeScore(page, tokens, phrase, combinedRe) {
  let score = 0;

  if (combinedRe) {
    // Reuse the same regex object by resetting lastIndex for each string
    combinedRe.lastIndex = 0;
    if (combinedRe.test(page.titleL)) score += WEIGHTS.title;

    combinedRe.lastIndex = 0;
    if (combinedRe.test(page.tagsL)) score += WEIGHTS.tag;

    combinedRe.lastIndex = 0;
    if (combinedRe.test(page.bodyL)) score += WEIGHTS.body;
  }

  if (phrase) {
    if (page.titleL.includes(phrase)) score += WEIGHTS.phraseTitle;
    else if (page.bodyL.includes(phrase)) score += WEIGHTS.phraseBody;
  }

  // Sections
  const matchedSections = [];
  if (Array.isArray(page.sections) && page.sections.length) {
    for (const sec of page.sections) {
      const secSearch = sec.search || '';
      if (!matchesAllTokens(secSearch, tokens)) continue;

      const secTitle = (sec.txt || '').toLowerCase();
      const secBody = (sec.body || '').toLowerCase();
      let s = 0;

      if (combinedRe) {
        combinedRe.lastIndex = 0;
        if (combinedRe.test(secTitle)) s += WEIGHTS.secTitle;

        combinedRe.lastIndex = 0;
        if (combinedRe.test(secBody)) s += WEIGHTS.secBody;
      }

      if (phrase && (secTitle.includes(phrase) || secBody.includes(phrase))) s += 1;

      matchedSections.push({ sec, s });
    }

    matchedSections.sort((a, b) => b.s - a.s);
  }

  score += Math.min(WEIGHTS.secCountCap, matchedSections.length);
  return { score, matchedSections };
}

/** Perform the search and return sorted results (no DOM work here) */
function performSearch(tokens, phrase) {
  const { pages } = __model;
  const combinedRe = buildCombinedRegex(tokens);
  const results = [];

  for (const p of pages) {
    if (!matchesAllTokens(p.searchStr, tokens)) continue;
    const { score, matchedSections } = computeScore(p, tokens, phrase, combinedRe);
    results.push({ page: p, score, matchedSections });
  }

  results.sort((a, b) => b.score - a.score || sortByTitle(a.page, b.page));
  return results;
}

/** Render the search results into the DOM */
function renderSearchResults(results) {
  const resUL = $('#results');
  if (!resUL) return;
  resUL.innerHTML = '';

  const frag = DOC.createDocumentFragment();

  for (const { page: p, matchedSections } of results) {
    const li = el('li', { class: 'page-result' }, [
      el('a', { href: '#' + hashOf(p), textContent: p.title })
    ]);

    if (matchedSections.length) {
      const base = hashOf(p);
      const sub = el('ul', { class: 'sub-results' });

      matchedSections.forEach(({ sec }) => {
        const href = '#' + base + (sec.id ? (base ? '#' : '') + sec.id : '');
        sub.append(
          el('li', { class: 'heading-result' }, [
            el('a', { href, textContent: sec.txt })
          ])
        );
      });

      li.append(sub);
    }

    frag.append(li);
  }

  resUL.append(frag);
  if (!resUL.children.length) resUL.innerHTML = '<li id="no_result">No result</li>';
}

/** -------- Public API -------- */

/** Search pages and sections matching query, ranked by relevance */
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
    resUL.setAttribute('aria-busy', 'false');
    return;
  }

  const tokens = tokenize(val);
  const phrase = tokens.length > 1 ? val : '';

  resUL.style.display = '';
  treeUL.style.display = 'none';

  const results = performSearch(tokens, phrase);
  renderSearchResults(results);

  resUL.setAttribute('aria-busy', 'false');
}
