// src/data.js
/* eslint-env browser, es2022 */
'use strict';

import { DOC, baseURLNoHash } from './dom.js';

/* ────────────────────────────── Config access ──────────────────────────── */
// Configuration is defined inline in index.html to keep the site portable.
const CFG_EL = DOC.getElementById('km-config');
const CFG = CFG_EL ? (JSON.parse(CFG_EL.textContent || '{}') || {}) : {};
const {
  TITLE = 'Wiki',
  MD = '',
  LANGS = [],
  DEFAULT_THEME,
  ACCENT,
  ALLOW_JS_FROM_MD,
  CACHE_MD,
} = CFG;

// cache_md: time-to-live in minutes (empty / 0 / NaN → disabled)
const CACHE_MIN = Number(CACHE_MD) || 0;

// Bump cache key version when parse/render logic changes to avoid stale bundles.
const CACHE_KEY = (url) => `km:md:v2:${url}`;

function readCache(url) {
  try {
    const raw = localStorage.getItem(CACHE_KEY(url));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj.ts !== 'number' || typeof obj.txt !== 'string') return null;
    return obj;
  } catch {
    return null;
  }
}

function writeCache(url, txt) {
  try {
    localStorage.setItem(CACHE_KEY(url), JSON.stringify({ ts: Date.now(), txt }));
  } catch {}
}

/* ─────────────────────── HTML LRU cache (shared) ──────────────────────── */
// Used by the renderer for parsed HTML; cleared whenever the bundle is re-parsed.
const PAGE_HTML_LRU_MAX = 40;
const pageHTMLLRU = new Map(); // pageId -> html

/* ───────────────────────────── data model ──────────────────────────────── */
/**
 * @typedef {Object} Section
 * @property {string} id        // Stable heading id like "1_2_1"
 * @property {string} txt       // Heading text
 * @property {string} body      // Body text under this heading
 * @property {string} search    // Lowercased text used for search
 */

/**
 * @typedef {Object} Page
 * @property {string} id
 * @property {string} title
 * @property {Page|null} parent
 * @property {Set<string>} tagsSet
 * @property {string} content
 * @property {Page[]} children
 * @property {Section[]} sections
 * @property {boolean} [isSecondary]
 * @property {number}  [_i]
 * @property {string}  [hash]
 * @property {string}  [titleL]
 * @property {string}  [tagsL]
 * @property {string}  [bodyL]
 * @property {string}  [searchStr]
 */

// The in-memory representation of the wiki, derived from a single Markdown
// bundle. Each page has: id,title,parent,tags,content,children[],sections[],...
let pages = [];
let byId = new Map();
let root = null; // Reference to the home page
const descMemo = new Map(); // Memoization for descendant counts

/* Precompiled regular expressions (sanity + perf) */
const RE_FENCE = /^(?:```|~~~)/;
const RE_HEADING = /^(#{1,6})\s+/;
const RE_HEADING_FULL = /^(#{1,6})\s+(.+)/;

/**
 * Parse a concatenated Markdown bundle with HTML comments as metadata blocks:
 *   <!--id:"lol" title:"Title" parent:"home" tags:"foo,bar"-->
 *   ...markdown body...
 * Repeated for each page.
 *
 * [INVARIANT] id must be unique; missing ids will still parse but will not be
 * properly addressable via hash routing.
 */
function parseMarkdownBundle(txt) {
  // Reset all state to support reloads/refetches without leaky state.
  pages = [];
  byId = new Map();
  root = null;
  descMemo.clear();
  pageHTMLLRU.clear(); // ensure HTML cache matches the current bundle

  // Greedy match: capture meta block + following body up to the next meta block.
  const m = txt.matchAll(/<!--([\s\S]*?)-->\s*([\s\S]*?)(?=<!--|$)/g);
  for (const [, hdr, body] of m) {
    const meta = {};
    // Parse k:"v" pairs with a simple, predictable grammar.
    hdr.replace(/(\w+):"([^"]+)"/g, (_, k, v) => (meta[k] = v.trim()));
    const page = { ...meta, content: (body || '').trim(), children: [] };
    pages.push(page);
    byId.set(page.id, page);
  }
  if (!pages.length) throw new Error('No pages parsed from MD bundle.'); // guard

  // Prefer an explicit "home" page, otherwise first page acts as root.
  root = byId.get('home') || pages[0]; // :contentReference[oaicite:4]{index=4}

  // Link parents/children and compute searchable strings.
  pages.forEach(p => {
    if (p !== root) {
      const parent = byId.get((p.parent || '').trim());
      p.parent = parent || null; // tolerate invalid parent refs
      if (parent) parent.children.push(p);
    } else {
      p.parent = null; // root has no parent
    }
    p.tagsSet = new Set((p.tags || '').split(',').map(s => s.trim()).filter(Boolean));
    // Precompute lowercase fields for faster search
    p.titleL = (p.title || '').toLowerCase();
    p.tagsL  = [...p.tagsSet].join(' ').toLowerCase();
    p.bodyL  = (p.content || '').toLowerCase();
    p.searchStr = (p.titleL + ' ' + p.tagsL + ' ' + p.bodyL);
  });

  // Extract fenced code and per-heading sections for deep search. :contentReference[oaicite:5]{index=5}
  pages.forEach(p => {
    const counters = [0, 0, 0, 0, 0, 0];
    const sections = [];
    let inFence = false, offset = 0, prev = null;

    for (const line of p.content.split(/\r?\n/)) {
      if (RE_FENCE.test(line)) inFence = !inFence; // toggle on fences
      if (!inFence && RE_HEADING.test(line)) {
        if (prev) {
          // Commit previous heading section body and index text for search.
          prev.body = p.content.slice(prev.bodyStart, offset).trim();
          prev.search = (prev.txt + ' ' + prev.body).toLowerCase();
          sections.push(prev);
        }
        const [, hashes, txt] = line.match(RE_HEADING_FULL);
        const level = hashes.length - 1; // 0-based depth (H1→0, H2→1, ...)

        counters[level]++;                          // increment current level
        for (let i = level + 1; i < 6; i++) counters[i] = 0; // reset deeper

        prev = {
          id: counters.slice(0, level + 1).filter(Boolean).join('_'),
          txt: txt.trim(),
          bodyStart: offset + line.length + 1,
        };
      }
      offset += line.length + 1; // account for newline
    }
    if (prev) { // commit last trailing section
      prev.body = p.content.slice(prev.bodyStart).trim();
      prev.search = (prev.txt + ' ' + prev.body).toLowerCase();
      sections.push(prev);
    }
    p.sections = sections;
  });
}

/** Count all descendants of a page. Memoized for repeated queries. */
function descendants(page) {
  if (descMemo.has(page)) return descMemo.get(page);
  let n = 0;
  (function rec(x) {
    x.children.forEach(c => { n++; rec(c); });
  })(page);
  descMemo.set(page, n);
  return n;
}

/**
 * Promote representative nodes of large clusters to sit directly under the
 * root as "secondary homes". This keeps navigation discoverable when the
 * original source content has deep isolated trees. :contentReference[oaicite:6]{index=6}
 */
function attachSecondaryHomes() {
  const topOf = p => { while (p.parent) p = p.parent; return p; };
  const clusters = new Map(); // Map<topNode, Page[]>

  for (const p of pages) {
    const top = topOf(p);
    if (top === root) continue; // ignore pages already under root
    if (!clusters.has(top)) clusters.set(top, []);
    clusters.get(top).push(p);
  }

  let cid = 0;
  for (const [top, members] of clusters) {
    // Pick the member with the largest subtree as the representative.
    const rep = members.reduce((a, b) => (descendants(b) > descendants(a) ? b : a), members[0]);
    if (!rep.parent) {
      // Only promote once per disconnected cluster.
      rep.parent = root;
      rep.isSecondary = true;
      rep.clusterId = cid++;
      root.children.push(rep);
    }
  }
}

/** Precompute hash fragments for fast routing and link building. */
function computeHashes() {
  pages.forEach(p => {
    const segs = [];
    for (let n = p; n && n.parent; n = n.parent) segs.unshift(n.id);
    p.hash = segs.join('#'); // empty for root
  });
}
/** Return precomputed hash (empty string for root). */
const hashOf = (page) => page?.hash ?? '';

/** Resolve a sequence of id segments to a page node (deepest valid). */
const find = (segs) => {
  let n = root;
  for (const id of segs) {
    const c = n.children.find(k => k.id === id);
    if (!c) break; // tolerate invalid paths by stopping early
    n = c;
  }
  return n; // returns the deepest valid node
};

/** Update location.hash for in-app navigation. */
function nav(page) {
  if (page) location.hash = '#' + hashOf(page);
}

/* ───────────────────────────── Routing helpers ─────────────────────────── */
/** Build a deep-link URL for a given page + anchor id */
function buildDeepURL(page, anchorId = '') {
  const pageHash = hashOf(page) || '';
  const base = baseURLNoHash() + '#' + pageHash;
  // Add separator only if we're not already at the root ("#")
  return anchorId ? base + (pageHash ? '#' : '') + anchorId : (pageHash ? base + '#' : base);
}

/**
 * One parser to rule them all: hash/href → { page, anchor }.
 * - Accepts full hrefs or hash-only fragments.
 * - Falls back to {page:root, anchor:''} for empty hash.
 * - If segments don't resolve beyond root, treats remainder as in-page anchor on root. :contentReference[oaicite:7]{index=7}
 */
function parseTarget(hashOrHref = location.hash) {
  const href = (hashOrHref || '').startsWith('#')
    ? hashOrHref
    : new URL(hashOrHref || '', location.href).hash;

  if (href === '') return { page: root, anchor: '' };

  const seg = (href || '').slice(1).split('#').filter(Boolean);
  const page = seg.length ? find(seg) : root;
  const base = hashOf(page);
  const baseSegs = base ? base.split('#') : [];

  // If segments didn't resolve beyond root, treat remainder as an in-page anchor on root.
  if (seg.length && !baseSegs.length) {
    return { page: root, anchor: seg.join('#') };
  }

  const anchor = seg.slice(baseSegs.length).join('#');
  return { page, anchor };
}

/* ─────────────────────────────── Exports ──────────────────────────────── */
export {
  // config
  CFG, TITLE, MD, LANGS, DEFAULT_THEME, ACCENT, ALLOW_JS_FROM_MD, CACHE_MIN,
  readCache, writeCache,
  // shared HTML cache
  PAGE_HTML_LRU_MAX, pageHTMLLRU,
  // model state
  pages, byId, root,
  // model ops
  parseMarkdownBundle, attachSecondaryHomes, computeHashes, descendants,
  // routing
  buildDeepURL, parseTarget, hashOf, find, nav,
};
