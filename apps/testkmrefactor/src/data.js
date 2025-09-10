'use strict';
import { baseURLNoHash } from './helpers.js';
const KM = window.KM || (window.KM = {});

// Load configuration from inline JSON
const CFG_EL = document.getElementById('km-config');
const CFG = CFG_EL ? (JSON.parse(CFG_EL.textContent || '{}') || {}) : {};
export const TITLE = CFG.TITLE || 'Wiki';
export const MD = CFG.MD || '';
export const LANGS = Array.isArray(CFG.LANGS) ? CFG.LANGS : [];
export const DEFAULT_THEME = CFG.DEFAULT_THEME;
export const ACCENT = CFG.ACCENT;
export const ALLOW_JS_FROM_MD = CFG.ALLOW_JS_FROM_MD;
export const CACHE_MIN = Number(CFG.CACHE_MD) || 0;
const CACHE_KEY = (url) => `km:md:v2:${url}`;
export function readCache(url) {
    try {
        const raw = localStorage.getItem(CACHE_KEY(url));
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (!obj || typeof obj.ts !== 'number' || typeof obj.txt !== 'string') return null;
        return obj;
    } catch (_) {
        return null;
    }
}
export function writeCache(url, txt) {
    try {
        localStorage.setItem(CACHE_KEY(url), JSON.stringify({ ts: Date.now(), txt }));
    } catch (_) {}
}

// In-memory data model
export let pages = [];
export let byId = new Map();
export let root = null;
const descMemo = new Map();
export const PAGE_HTML_LRU_MAX = 40;
export const pageHTMLLRU = new Map();

/** Count all descendants of a page (memoized). */
function descendants(page) {
    if (descMemo.has(page)) return descMemo.get(page);
    let n = 0;
    (function rec(x) {
        x.children.forEach(c => { n++; rec(c); });
    })(page);
    descMemo.set(page, n);
    return n;
}

/** Promote representatives of large disconnected clusters to appear under root. */
export function attachSecondaryHomes() {
    const topOf = p => {
        while (p.parent) p = p.parent;
        return p;
    };
    const clusters = new Map(); // Map<topNode, Page[]>
    for (const p of pages) {
        const top = topOf(p);
        if (top === root) continue;
        if (!clusters.has(top)) clusters.set(top, []);
        clusters.get(top).push(p);
    }
    let cid = 0;
    for (const [top, members] of clusters) {
        // Pick member with the largest subtree as representative
        const rep = members.reduce((a, b) => (descendants(b) > descendants(a) ? b : a), members[0]);
        if (!rep.parent) {
            // Promote only one per cluster
            rep.parent = root;
            rep.isSecondary = true;
            rep.clusterId = cid++;
            root.children.push(rep);
        }
    }
}

/** Precompute hash fragments for fast routing/link-building. */
export function computeHashes() {
    pages.forEach(p => {
        const segs = [];
        for (let n = p; n && n.parent; n = n.parent) segs.unshift(n.id);
        p.hash = segs.join('#'); // (root gets '')
    });
}
export const hashOf = page => page?.hash ?? '';
/** Resolve an array of ID segments to the corresponding page (deepest match). */
export function find(segs) {
    let n = root;
    for (const id of segs) {
        const c = n.children.find(k => k.id === id);
        if (!c) break;
        n = c;
    }
    return n;
}
/** Navigate to a page by updating the URL hash (exposed via KM.nav). */
export function nav(page) {
    if (page) location.hash = '#' + hashOf(page);
}
KM.nav = nav;

/** Parse a concatenated Markdown bundle (with <!-- meta --> headers) into pages. */
export function parseMarkdownBundle(txt) {
    // Reset state for fresh load
    pages = [];
    byId = new Map();
    root = null;
    descMemo.clear();
    pageHTMLLRU.clear();
    // Use a regex to capture each meta header and following Markdown content
    const matches = txt.matchAll(/<!--([\s\S]*?)-->\s*([\s\S]*?)(?=<!--|$)/g);
    for (const [, hdr, body] of matches) {
        const meta = {};
        // Parse key:"value" pairs in the header
        hdr.replace(/(\w+):"([^"]+)"/g, (_, k, v) => (meta[k] = v.trim()));
        const page = { ...meta, content: (body || '').trim(), children: [] };
        pages.push(page);
        byId.set(page.id, page);
    }
    if (!pages.length) throw new Error('No pages parsed from MD bundle.');
    // Determine root page (explicit "home" or first page if no home)
    root = byId.get('home') || pages[0];
    // Link parent-child relationships and compute searchable text for each page
    pages.forEach(p => {
        if (p !== root) {
            const parent = byId.get((p.parent || '').trim());
            p.parent = parent || null;
            if (parent) parent.children.push(p);
        } else {
            p.parent = null;
        }
        p.tagsSet = new Set((p.tags || '').split(',').map(s => s.trim()).filter(Boolean));
        p.titleL = (p.title || '').toLowerCase();
        p.tagsL = [...p.tagsSet].join(' ').toLowerCase();
        p.bodyL = (p.content || '').toLowerCase();
        p.searchStr = (p.titleL + ' ' + p.tagsL + ' ' + p.bodyL);
    });
    // Build section entries for headings in each page (for deep search)
    pages.forEach(p => {
        const counters = [0, 0, 0, 0, 0, 0];
        const sections = [];
        let inFence = false, offset = 0, prev = null;
        for (const line of p.content.split(/\r?\n/)) {
            if (/^(?:```|~~~)/.test(line)) inFence = !inFence;
            if (!inFence && /^(#{1,6})\s+/.test(line)) {
                if (prev) {
                    // finalize previous section
                    prev.body = p.content.slice(prev.bodyStart, offset).trim();
                    prev.search = (prev.txt + ' ' + prev.body).toLowerCase();
                    sections.push(prev);
                }
                const [, hashes, txt] = line.match(/^(#{1,6})\s+(.+)/);
                const level = hashes.length - 1;
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

/** Parse a URL hash (or full href) into a target page and anchor. */
export function parseTarget(hashOrHref = location.hash) {
    const href = (hashOrHref || '').startsWith('#') ? hashOrHref : new URL(hashOrHref || '', location.href).hash;
    if (href === '') return { page: root, anchor: '' };
    const seg = (href || '').slice(1).split('#').filter(Boolean);
    const page = seg.length ? find(seg) : root;
    const base = hashOf(page);
    const baseSegs = base ? base.split('#') : [];
    // If first segments didn't match a page, treat them all as an anchor on root
    if (seg.length && !baseSegs.length) {
        return { page: root, anchor: seg.join('#') };
    }
    const anchor = seg.slice(baseSegs.length).join('#');
    return { page, anchor };
}

/** Build a deep-link URL (base + optional anchor) for a given page. */
export function buildDeepURL(page, anchorId = '') {
    const pageHash = hashOf(page) || '';
    const base = baseURLNoHash() + '#' + pageHash;
    return anchorId
        ? base + (pageHash ? '#' : '') + anchorId
        : (pageHash ? base + '#' : base);
}
