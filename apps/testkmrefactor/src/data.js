/* eslint-env browser, es2022 */
'use strict';

/**
 * data.js
 *  - Reads config from <script id="km-config">
 *  - Fetches (or accepts inline) Markdown bundle
 *  - Parses pages, links parents/children, computes hashes and heading sections
 *  - Exposes routing primitives used by the SPA shell + render/ui layers
 *
 * Exported surface:
 *   init()                 -> build data model (idempotent)
 *   parseTarget(hash|href) -> {page, anchor} | null
 *   hashOf(page)           -> '' for root, otherwise 'a#b#c'
 *   nav(page)              -> update location.hash (public for external links)
 *   root                   -> the root/home page node
 *   pages                  -> flat array of all page nodes
 *   byId                   -> Map<string, page>
 *   CFG                    -> raw config values (TITLE, MD, etc.)
 */

export let root = null;
export let pages = [];
export let byId = new Map();

export let CFG = {};
const DOC = document;

/* ────────────────────────────── Config access ──────────────────────────── */
function readConfig() {
  const el = DOC.getElementById('km-config');
  const obj = el ? (JSON.parse(el.textContent || '{}') || {}) : {};
  const { TITLE = 'Wiki', MD = '', LANGS = [], DEFAULT_THEME, ACCENT, ALLOW_JS_FROM_MD, CACHE_MD } = obj;
  CFG = { TITLE, MD, LANGS, DEFAULT_THEME, ACCENT, ALLOW_JS_FROM_MD, CACHE_MD };
  return CFG;
}

/* ─────────────────────────── MD caching (optional) ─────────────────────── */
// cache_md: time-to-live in minutes (empty / 0 / NaN → disabled)
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

/* ───────────────────────────── Fetch / load MD ─────────────────────────── */
async function loadMarkdownText(md) {
  const val = (md ?? '').trim();

  // Inline markdown (dev/experiments): if it contains newlines or looks like a meta block.
  if (!/^(https?:)?\/\//i.test(val) && (val.includes('\n') || val.startsWith('<!--'))) {
    return val;
  }

  // Otherwise treat it as a URL.
  if (!val) throw new Error('Missing MD configuration.');

  // Optional TTL cache
  const ttlMin = Number(CFG.CACHE_MD) || 0;
  if (ttlMin > 0) {
    const cached = readCache(val);
    if (cached && (Date.now() - cached.ts) < ttlMin * 60_000) {
      return cached.txt;
    }
  }

  const res = await fetch(val, { credentials: 'omit' });
  if (!res.ok) throw new Error(`Failed to fetch MD (${res.status})`);
  const txt = await res.text();

  if (ttlMin > 0) writeCache(val, txt);
  return txt;
}

/* ───────────────────────────── Parse MD bundle ─────────────────────────── */
/**
 * The bundle is a concatenation of blocks:
 *   <!-- id:"x" title:"Name" parent:"y" tags:"a,b" ... -->\n
 *   # Page content (markdown) until next block or EOF
 *
 * Required: id (unique). Optional: parent.
 */
const RE_HEADING      = /^(#+)\s+(.+?)\s*$/;            // "# Head"
const RE_HEADING_FULL = /^(#{1,6})\s+(.+?)\s*$/;        // capture level + text
const RE_FENCE        = /^```/;                         // triple-backtick fence

function parseMarkdownBundle(txt) {
  // Reset state for hot reloads
  pages = [];
  byId = new Map();
  root = null;

  // Greedy match: capture meta block + following body up to next meta block
  const m = txt.matchAll(/<!--([\s\S]*?)-->\s*([\s\S]*?)(?=<!--|$)/g);
  for (const [, hdr, body] of m) {
    const meta = {};
    hdr.replace(/(\w+):"([^"]+)"/g, (_, k, v) => (meta[k] = v.trim()));
    const page = { ...meta, content: (body || '').trim(), children: [] };
    pages.push(page);
    byId.set(page.id, page);
  }
  if (!pages.length) throw new Error('No pages parsed from MD bundle.');

  // Root: explicit 'home' preferred, else first page
  root = byId.get('home') || pages[0];

  // Link parents/children
  pages.forEach(p => {
    if (p !== root) {
      const parent = byId.get((p.parent || '').trim());
      p.parent = parent || null;
      if (parent) parent.children.push(p);
    } else {
      p.parent = null;
    }
  });

  // Compute per-page hash (id chain from root) and sections (derived from headings)
  buildTree();
  computeSections();
}

/** Precompute `page.hash` for all nodes ('' for root), tolerate gaps. */
function buildTree() {
  // Attach hash to every page by walking up the parent chain.
  pages.forEach(p => {
    const segs = [];
    for (let n = p; n && n !== root; n = n.parent) segs.unshift(n.id);
    p.hash = segs.join('#'); // '' for root
  });
}

/**
 * Split content into heading sections for in-page anchors and search.
 * Each section: { id: '1_2', txt: 'Heading', body: '…', search: 'lowercased' }
 */
function computeSections() {
  pages.forEach(p => {
    const counters = [0, 0, 0, 0, 0, 0]; // H1..H6
    const sections = [];
    let inFence = false, offset = 0, prev = null;

    for (const line of p.content.split(/\r?\n/)) {
      if (RE_FENCE.test(line)) inFence = !inFence;
      if (!inFence && RE_HEADING.test(line)) {
        if (prev) {
          prev.body = p.content.slice(prev.bodyStart, offset).trim();
          prev.search = (prev.txt + ' ' + prev.body).toLowerCase();
          sections.push(prev);
        }
        const [, hashes, txt] = line.match(RE_HEADING_FULL);
        const level = hashes.length - 1; // 0-based depth (H1→0)
        counters[level]++;
        for (let i = level + 1; i < 6; i++) counters[i] = 0;
        prev = {
          id: counters.slice(0, level + 1).filter(Boolean).join('_'),
          txt: txt.trim(),
          bodyStart: offset + line.length + 1
        };
      }
      offset += line.length + 1;
    }
    if (prev) {
      prev.body = p.content.slice(prev.bodyStart).trim();
      prev.search = (prev.txt + ' ' + prev.body).toLowerCase();
      sections.push(prev);
    }
    p.sections = sections;
  });
}

/* ───────────────────────────── Routing helpers ─────────────────────────── */
export const hashOf = page => page?.hash ?? '';

/** Resolve a sequence of id segments to the deepest existing page node. */
function find(segs) {
  let n = root;
  for (const id of segs) {
    const c = n.children.find(k => k.id === id);
    if (!c) break;
    n = c;
  }
  return n; // may be a parent if path was partially invalid
}

/** Update location.hash for in-app navigation (public for external links). */
export function nav(page) {
  if (page) location.hash = '#' + hashOf(page);
}

/**
 * One parser to rule them all: hash/href → { page, anchor } | null.
 * - Accepts full hrefs or hash-only fragments.
 * - Falls back to {page:root, anchor:''} for empty hash.
 * - Returns null when the hash looks like an anchor to a non-existent page.
 */
export function parseTarget(hashOrHref = location.hash) {
  const href = (hashOrHref || '').startsWith('#') ? hashOrHref : new URL(hashOrHref || '', location.href).hash;
  const frag = (href || '').replace(/^#/, '');

  // If the fragment contains multiple '#', the first chunk is a page path (a#b#c),
  // and the remainder is an in-page anchor id (like '1_2').
  const seg = frag.split('#');
  const pathSegs = seg[0] ? seg[0].split('#') : [];
  const page = pathSegs.length ? find(pathSegs) : root;

  if (!page) return null;

  // Anchor is everything after the page path
  const anchor = seg.slice(1).join('#') || '';

  // Validate anchor if present: allow empty or something that matches a section id.
  if (anchor) {
    const ok = (page.sections || []).some(s => s.id === anchor);
    // Optional strictness:
    // if (!ok) return null;
  }

  return { page, anchor };
}

/* ───────────────────────────────── init() ──────────────────────────────── */
let _initPromise = null;
export async function init() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const cfg = readConfig();
    const txt = await loadMarkdownText(cfg.MD);
    parseMarkdownBundle(txt);
  })();
  return _initPromise;
}
