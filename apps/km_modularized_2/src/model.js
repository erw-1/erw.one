// model.js
/* eslint-env browser, es2022 */
'use strict';

// Minimal in-memory wiki model that other modules depend on.
// Focuses on a stable API: __model, parseMarkdownBundle, attachSecondaryHomes,
// computeHashes, hashOf, sortByTitle, find.

const slug = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';

const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

// ───────────────────────────── storage ─────────────────────────────
let pages = [];
let byId = new Map();
let root = null;

// ───────────────────────────── helpers ─────────────────────────────
function parseSections(md) {
  const lines = String(md || '').split(/\r?\n/);
  const sections = [];
  let cur = null;
  let inFence = false;

  const flush = (untilIndex) => {
    if (!cur) return;
    cur.body = lines.slice(cur.bodyStart, untilIndex).join('\n').trim();
    cur.search = (cur.txt + ' ' + cur.body).toLowerCase();
    sections.push(cur);
    cur = null;
  };

  lines.forEach((line, idx) => {
    if (/^```/.test(line)) inFence = !inFence;
    const m = !inFence && /^(#{1,6})[ \t]+(.+?)\s*$/.exec(line);
    if (m) {
      flush(idx);
      const level = m[1].length;
      const txt = m[2].trim();
      const id = slug(txt);
      cur = { id, lvl: level, txt, body: '', bodyStart: idx + 1, search: '' };
    }
  });
  flush(lines.length);
  return sections;
}

function prepSearchFields(p) {
  p.titleL = (p.title || '').toLowerCase();
  p.tagsL = [...(p.tagsSet || [])].join(' ').toLowerCase();
  const raw = String(p.md || p.body || '');
  p.bodyL = raw.toLowerCase();
  p.searchStr = (p.titleL + ' ' + p.tagsL + ' ' + p.bodyL).trim();
}

// ───────────────────────────── API ─────────────────────────────────
export function parseMarkdownBundle(txt) {
  // Very tolerant parser: one "main" page out of the bundle.
  // If the file contains an H1, use it as the page title.
  const md = String(txt || '');
  const h1 = md.match(/^\s*#\s+(.+?)\s*$/m)?.[1]?.trim();
  const title = h1 || 'Home';

  // Reset model
  pages = [];
  byId = new Map();
  root = { id: 'root', title: 'Root', hash: '', parent: null, children: [], isSecondary: false };

  const page = {
    id: 'p1',
    title,
    md,
    body: md,
    parent: root,
    children: [],
    isSecondary: false,
    clusterId: 0,
    tagsSet: new Set(),
    sections: parseSections(md),
    hash: '', // set later
  };
  prepSearchFields(page);

  root.children.push(page);
  pages.push(root, page);
  byId.set(root.id, root);
  byId.set(page.id, page);
}

export function attachSecondaryHomes() {
  // No-op placeholder to preserve API surface; structure already simple.
}

export function computeHashes() {
  // Ensure unique, stable hashes for pages and section ids.
  const used = new Set();

  const unique = (base) => {
    let h = slug(base || 'page');
    if (!h) h = 'page';
    let u = h, i = 2;
    while (used.has(u)) u = `${h}-${i++}`;
    used.add(u);
    return u;
  };

  for (const p of pages) {
    if (p === root) { p.hash = ''; continue; }
    p.hash = unique(p.title || p.id);
    // ensure unique section ids within a page
    const secUsed = new Set();
    for (const s of p.sections || []) {
      let id = slug(s.txt);
      if (!id) id = 'section';
      let u = id, i = 2;
      while (secUsed.has(u)) u = `${id}-${i++}`;
      secUsed.add(u);
      s.id = u;
    }
  }
}

export const hashOf = (p) => (p && p.hash) || '';

export const sortByTitle = (a, b) => collator.compare(a.title || '', b.title || '');

export function find(key) {
  if (!key) return null;
  if (typeof key === 'object') return key;
  const s = String(key);
  return byId.get(s) || pages.find((p) => p.hash === s) || null;
}

// Expose model read-only getters
export const __model = {
  get pages() { return pages; },
  get root() { return root; },
  get byId() { return byId; },
};
