/* eslint-env browser, es2022 */
'use strict';

import { RE_FENCE, RE_HEADING, RE_HEADING_FULL } from './config_dom.js';

// ─────────────────────────── Data structures ───────────────────────────
/**
 * Page shape (for reference):
 * {
 *   id: string,
 *   title: string,
 *   content: string,
 *   tags: string[],
 *   tagsSet: Set<string>,
 *   isSecondary: boolean,
 *   parent: Page|null,
 *   children: Page[],
 *   slug: string,       // slug of title/id
 *   hash: string        // path segments joined by '#', stable
 * }
 */

let pages = [];
let byId = new Map();
let root = null;
const descMemo = new Map();

// HTML LRU cache (rendered Markdown per page)
const PAGE_HTML_LRU_MAX = 40;
const pageHTMLLRU = new Map(); // pageId -> html

// ─────────────────────────── Parsing helpers ───────────────────────────
const slugify = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

function parseMetaAndBody(block) {
  // Accept simple "key: value" header lines until a blank line or '---'
  const lines = (block || '').replace(/\r\n?/g, '\n').split('\n');
  const meta = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln || ln.trim() === '---') { i++; break; }
    const m = ln.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!m) break;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    meta[key] = val;
  }
  const body = lines.slice(i).join('\n').trim();
  return { meta, body };
}

function pickTitle(meta, md) {
  if (meta.title) return meta.title;
  const m = md.match(RE_HEADING_FULL);
  if (m) return m[2].trim();
  return meta.id || 'Untitled';
}

function coerceBool(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v || '').toLowerCase().trim();
  return s === '1' || s === 'true' || s === 'yes';
}

function ensureRoot() {
  // Choose a sensible root: page with id 'home'/'index' if present, else first.
  let r =
    pages.find(p => /^(home|index|readme)$/i.test(p.id)) ||
    pages.find(p => p.parent == null) ||
    pages[0];
  if (!r) {
    // Fallback synthetic root when bundle empty
    r = {
      id: 'home',
      title: 'Home',
      content: '# Home\n\nWelcome.',
      tags: [],
      tagsSet: new Set(),
      isSecondary: false,
      parent: null,
      children: [],
      slug: 'home',
      hash: 'home'
    };
    pages.push(r);
    byId.set(r.id, r);
  }
  root = r;
}

// ───────────────────── Public: parse bundle into pages ───────────────────
/**
 * Accepts a concatenated Markdown bundle using ```page fences.
 * Header format inside each block:
 *   id: intro
 *   title: Introduction
 *   parent: guides/getting-started     (optional; slash or '#' separated)
 *   tags: foo, bar
 *   secondary: true|false
 *   ---
 *   # Markdown content...
 */
export function parseMarkdownBundle(txt) {
  // reset model
  pages = [];
  byId = new Map();
  root = null;
  descMemo.clear();
  pageHTMLLRU.clear();

  const src = String(txt || '');
  const blocks = [...src.matchAll(RE_FENCE)].map(m => m[1]);
  const defs = [];

  if (blocks.length) {
    for (const block of blocks) {
      const { meta, body } = parseMetaAndBody(block);
      const title = pickTitle(meta, body);
      const id = (meta.id || slugify(title) || `p${defs.length + 1}`).trim();
      const tags = (meta.tags || '')
        .split(/[,\s]+/)
        .map(s => s.trim())
        .filter(Boolean);
      defs.push({
        id,
        title,
        content: body,
        tags,
        tagsSet: new Set(tags),
        isSecondary: coerceBool(meta.secondary),
        parentRef: (meta.parent || '').replace(/\//g, '#').replace(/^#/, '').trim()
      });
    }
  } else {
    // No page fences: treat the whole document as single page
    const id = 'home';
    const title = pickTitle({}, src);
    defs.push({
      id,
      title,
      content: src,
      tags: [],
      tagsSet: new Set(),
      isSecondary: false,
      parentRef: ''
    });
  }

  // Instantiate pages
  for (const d of defs) {
    const p = { ...d, parent: null, children: [], slug: slugify(d.id || d.title), hash: '' };
    pages.push(p);
    byId.set(p.id, p);
  }

  // Wire parents: support parent by id or by hashed path "a#b#c" or by title slug path "a/b"
  const bySlug = new Map(pages.map(p => [p.slug, p]));
  for (const p of pages) {
    let parent = null;
    const ref = p.parentRef;
    if (ref) {
      // Try id match first
      parent = byId.get(ref) || null;
      if (!parent) {
        // Try path by '#'
        const segs = ref.split('#').filter(Boolean);
        if (segs.length === 1) {
          parent = byId.get(segs[0]) || bySlug.get(slugify(segs[0])) || null;
        } else {
          // Walk by id/slug
          let n = pages.find(x => x.id === segs[0] || x.slug === slugify(segs[0]));
          for (let i = 1; n && i < segs.length; i++) {
            n = n.children.find(x => x.id === segs[i] || x.slug === slugify(segs[i]));
          }
          parent = n || null;
        }
      }
    }
    p.parent = parent;
    (parent?.children || (parent = null), parent) && parent.children.push(p);
  }

  ensureRoot();

  // Any top-level pages left without parent? Keep them at top-level (under null).
  // compute hashes afterwards
}

/** Pages that are tag overview or other "secondary home" should remain top-level; keep as is. */
export function attachSecondaryHomes() {
  // Intentionally no-op for now; structure is already set by parentRef.
  // This function remains to preserve the public API used by app.js.
}

// ─────────────────────────── Hash + navigation ───────────────────────────
function computePathSegments(p) {
  const segs = [];
  let n = p;
  while (n) { segs.push(n.slug); n = n.parent; }
  segs.reverse();
  // do not include empty synthetic root
  return segs;
}

export function computeHashes() {
  for (const p of pages) {
    const segs = computePathSegments(p);
    p.hash = segs.join('#');
  }
}

export const hashOf = (p) => (p?.hash) || '';

export const find = (segs) => {
  if (!Array.isArray(segs) || !segs.length) return root;
  let n = root;
  for (const raw of segs) {
    const s = String(raw || '').trim().toLowerCase();
    const nxt = n.children.find(c => c.slug === s || c.id.toLowerCase() === s);
    if (!nxt) return n; // stop at last known segment; remainder becomes anchor
    n = nxt;
  }
  return n;
};

export const nav = (page) => { if (page) location.hash = '#' + (page.hash || ''); };
window.KM = window.KM || {};
window.KM.nav = nav; // faithful exposure for interop/testing

// ─────────────────────────── Descendants count ───────────────────────────
export function descendants(node) {
  if (!node) return 0;
  if (descMemo.has(node)) return descMemo.get(node);
  let n = 0;
  const stack = [...node.children];
  while (stack.length) {
    const x = stack.pop();
    n++;
    if (x.children?.length) stack.push(...x.children);
  }
  descMemo.set(node, n);
  return n;
}

// ─────────────────────── Heading extraction (search) ─────────────────────
/** Parse headings from a page's Markdown and assign deterministic numeric ids. */
export function extractHeadings(page) {
  if (!page?.content) return [];
  const counters = [0, 0, 0, 0, 0, 0, 0];
  const out = [];
  const src = page.content.replace(/\r\n?/g, '\n');
  let m;
  while ((m = RE_HEADING.exec(src))) {
    const hashes = m[1];
    const txt = m[2].trim().replace(/<[^>]+>/g, '');
    const level = Math.min(6, Math.max(1, hashes.length));
    const idx = level - 1;
    counters[idx]++;
    for (let i = idx + 1; i < 7; i++) counters[i] = 0;
    const id = counters.slice(0, level).filter(Boolean).join('_');
    out.push({ id, level, txt });
  }
  return out;
}

// ───────────────────────────── LRU for HTML ─────────────────────────────
export function getFromHTMLLRU(pageId) {
  if (!pageHTMLLRU.has(pageId)) return null;
  const html = pageHTMLLRU.get(pageId);
  // refresh recency
  pageHTMLLRU.delete(pageId);
  pageHTMLLRU.set(pageId, html);
  return html;
}

export function setHTMLLRU(pageId, html) {
  pageHTMLLRU.set(pageId, html);
  if (pageHTMLLRU.size > PAGE_HTML_LRU_MAX) {
    // evict LRU
    const firstKey = pageHTMLLRU.keys().next().value;
    pageHTMLLRU.delete(firstKey);
  }
}

// ───────────────────────────── Sorting helpers ───────────────────────────
export const __collator = new Intl.Collator(undefined, { sensitivity: 'base' });
export const sortByTitle = (a, b) => __collator.compare(a.title, b.title);

// ───────────────────────────── Public model view ─────────────────────────
export const __model = {
  get pages() { return pages; },
  get root() { return root; },
  get byId() { return byId; }
};
