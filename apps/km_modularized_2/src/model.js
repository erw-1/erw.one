/* eslint-env browser, es2022 */
'use strict';

import { RE_FENCE, RE_HEADING, RE_HEADING_FULL } from './config_dom.js';

/**
 * Public API (unchanged):
 *   __model, parseMarkdownBundle, attachSecondaryHomes, computeHashes,
 *   descendants, find, hashOf, nav, getFromHTMLLRU, setHTMLLRU,
 *   __collator, sortByTitle
 */

// ───────────────────────────────── state ──────────────────────────────────
let pages = [];
let byId = new Map();
let root = null;

const descMemo = new Map();

// Parsed HTML LRU cache (pageId → html)
const PAGE_HTML_LRU_MAX = 40;
const pageHTMLLRU = new Map();

// ────────────────────────────── utilities ────────────────────────────────
const toSet = (csv) =>
  new Set((csv || '').split(',').map(s => s.trim()).filter(Boolean));

const lc = (s) => (s || '').toLowerCase();

const pushLRU = (map, key, val, max) => {
  map.set(key, val);
  if (map.size > max) map.delete(map.keys().next().value);
};

// ───────────────────────────── parse bundle ──────────────────────────────
export function parseMarkdownBundle(txt) {
  // reset state
  pages = [];
  byId = new Map();
  root = null;
  descMemo.clear();
  pageHTMLLRU.clear();

  // Chunk format: <!--k:"v" k:"v"-->CONTENT… (repeat)
  const chunks = txt.matchAll(/<!--([\s\S]*?)-->\s*([\s\S]*?)(?=<!--|$)/g);
  for (const [, hdr, body] of chunks) {
    const meta = {};
    hdr.replace(/(\w+):"([^"]+)"/g, (_, k, v) => (meta[k] = v.trim()));
    const page = {
      ...meta,
      content: (body || '').trim(),
      children: [],
    };
    pages.push(page);
    byId.set(page.id, page);
  }
  if (!pages.length) throw new Error('No pages parsed from MD bundle.');

  root = byId.get('home') || pages[0];

  // link + searchable fields
  pages.forEach(p => {
    p.parent = p === root ? null : (byId.get((p.parent || '').trim()) || null);
    if (p.parent) p.parent.children.push(p);

    p.tagsSet = toSet(p.tags);
    p.titleL  = lc(p.title);
    p.tagsL   = [...p.tagsSet].join(' ').toLowerCase();
    p.bodyL   = lc(p.content);
    p.searchStr = `${p.titleL} ${p.tagsL} ${p.bodyL}`;
  });

  // sections (by headings, excluding code fences)
  pages.forEach(p => p.sections = extractSections(p.content));
}

function extractSections(content) {
  const sections = [];
  if (!content) return sections;

  const counters = [0, 0, 0, 0, 0, 0];
  let inFence = false, offset = 0, prev = null;

  for (const line of content.split(/\r?\n/)) {
    if (RE_FENCE.test(line)) inFence = !inFence;

    if (!inFence && RE_HEADING.test(line)) {
      if (prev) {
        prev.body = content.slice(prev.bodyStart, offset).trim();
        prev.search = `${prev.txt} ${prev.body}`.toLowerCase();
        sections.push(prev);
      }
      const [, hashes, txt] = line.match(RE_HEADING_FULL);
      const level = hashes.length - 1;
      counters[level]++;
      for (let i = level + 1; i < 6; i++) counters[i] = 0;

      prev = {
        id: counters.slice(0, level + 1).filter(Boolean).join('_'),
        txt: txt.trim(),
        bodyStart: offset + line.length + 1,
      };
    }
    offset += line.length + 1;
  }

  if (prev) {
    prev.body = content.slice(prev.bodyStart).trim();
    prev.search = `${prev.txt} ${prev.body}`.toLowerCase();
    sections.push(prev);
  }
  return sections;
}

// ───────────────────────────── relationships ─────────────────────────────
export function descendants(page) {
  if (descMemo.has(page)) return descMemo.get(page);
  let n = 0;
  (function walk(x) { x.children.forEach(c => { n++; walk(c); }); })(page);
  descMemo.set(page, n);
  return n;
}

export function attachSecondaryHomes() {
  const topOf = p => { while (p.parent) p = p.parent; return p; };
  const clusters = new Map();

  for (const p of pages) {
    const top = topOf(p);
    if (top === root) continue;
    (clusters.get(top) || clusters.set(top, []).get(top)).push(p);
  }

  let cid = 0;
  for (const members of clusters.values()) {
    const rep = members.reduce((a, b) => (descendants(b) > descendants(a) ? b : a), members[0]);
    if (!rep.parent) {
      rep.parent = root;
      rep.isSecondary = true;
      rep.clusterId = cid++;
      root.children.push(rep);
    }
  }
}

export function computeHashes() {
  pages.forEach(p => {
    const segs = [];
    for (let n = p; n && n.parent; n = n.parent) segs.unshift(n.id);
    p.hash = segs.join('#');
  });
}
export const hashOf = (page) => page?.hash ?? '';

export const find = (segs) => {
  let n = root;
  for (const id of segs) {
    const child = n.children.find(k => k.id === id);
    if (!child) break;
    n = child;
  }
  return n;
};

// ─────────────────────────────── navigation ──────────────────────────────
export function nav(page) {
  if (page) location.hash = '#' + hashOf(page);
}
window.KM.nav = nav; // keep tiny global surface for interop/tests

// ─────────────────────────────── HTML LRU ────────────────────────────────
export function getFromHTMLLRU(pageId) {
  if (!pageHTMLLRU.has(pageId)) return null;
  const html = pageHTMLLRU.get(pageId);
  pageHTMLLRU.delete(pageId);
  pageHTMLLRU.set(pageId, html);
  return html;
}
export function setHTMLLRU(pageId, html) {
  pushLRU(pageHTMLLRU, pageId, html, PAGE_HTML_LRU_MAX);
}

// ────────────────────────────── misc exports ─────────────────────────────
export const __collator = new Intl.Collator(undefined, { sensitivity: 'base' });
export const sortByTitle = (a, b) => __collator.compare(a.title, b.title);

export const __model = {
  get pages() { return pages; },
  get root()  { return root;  },
  get byId()  { return byId;  },
};
