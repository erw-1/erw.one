/* eslint-env browser, es2022 */
/*
================================================================================
 km - Static No-Build Wiki runtime (ESM)

 ▸ Architecture
   - Single self-bootstrapping module that fetches a concatenated Markdown
     bundle, parses it into an in-memory tree/graph, and renders it into a
     minimal SPA shell (index.html).
   - External dependencies (marked, highlight.js, KaTeX, D3) are loaded lazily
     via native ESM imports from CDNs. Each loader is idempotent.
   - Routing is hash-based (#a#b#c#anchor). The first segments address the page
     hierarchy; any remainder is an in-page heading id.
   - A small D3 force graph visualizes hierarchy + tag similarity.

 ▸ Design goals honored by the implementation
   - No build step: Everything runs natively in modern browsers.
   - Minimal global surface: A tiny window.KM namespace for interop/testing.
   - Robustness: Defensive checks around DOM readiness, network errors, and
     idempotent initializers.
   - Performance: Idle work deferral, small synchronous critical path, async
     progressive decoration (ToC, code copy buttons, KaTeX, HLJS theme swap).
   - Accessibility: ARIA roles/labels, keyboard-friendly interactions, and
     reduced motion by relying on native scrolling and focus behavior.

 ▸ Notation used through comments
   - [INVARIANT]: Property the code relies on; breaking it will cause bugs.
   - [PERF]: Performance note.
   - [A11Y]: Accessibility note.
   - [CROSS-BROWSER]: Compatibility nuance.
   - [SECURITY]: Safe usage hints.

================================================================================
*/

'use strict';

/* ─────────────────────────────── Public API ────────────────────────────── */
// Expose a tiny namespace for interop/testing while avoiding global clutter.
// Only stable, useful utilities are exported.
window.KM = window.KM || {};
const KM = window.KM;

/* ─────────────────────────────── DOM helpers ───────────────────────────── */
// Cached viewport, updated on resize to reduce repeated reads.
let __VPW = window.innerWidth,
    __VPH = window.innerHeight;
addEventListener('resize', () => {
    __VPW = window.innerWidth;
    __VPH = window.innerHeight;
}, {
    passive: true
});

// Intentionally small helpers to keep call sites terse and readable.
const DOC = document;

/** Query a single element within an optional context (defaults to document) */
const $ = (sel, c = DOC) => c.querySelector(sel);

/** Query all elements and spread into a real array for easy iteration */
const $$ = (sel, c = DOC) => [...c.querySelectorAll(sel)];

/**
 * Create an element with a property/attribute map and children.
 * - Prefers setting properties (e.g., .textContent) over attributes when
 *   available to avoid type coercion pitfalls and to preserve semantics.
 * - Supports a special 'dataset' key to batch-assign data attributes.
 */
const el = (tag, props = {}, children = []) => {
    const n = DOC.createElement(tag);
    for (const k in props) {
        const v = props[k];
        if (k === 'class' || k === 'className') n.className = v;
        else if (k === 'dataset') Object.assign(n.dataset, v);
        else if (k in n) n[k] = v; // prefer properties when present
        else n.setAttribute(k, v); // fallback to attribute
    }
    if (children != null) {
        const arr = Array.isArray(children) ? children : [children]
        if (arr.length) n.append(...arr)
    }
    return n;
};
// Expose a couple of helpers and a DEBUG flag for quick diagnostics.
Object.assign(KM, {
    $,
    $$,
    DEBUG: false
});

/* ────────────────────────────── Config access ──────────────────────────── */
// Configuration is defined inline in index.html to keep the site portable.
const CFG_EL = DOC.getElementById('km-config');
const CFG = CFG_EL ? (JSON.parse(CFG_EL.textContent || '{}') || {}) : {};
const { TITLE = 'Wiki', MD = '', LANGS = [], DEFAULT_THEME, ACCENT, CACHE_MD } = CFG;

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
    } catch (_) {
        return null;
    }
}

function writeCache(url, txt) {
    try {
        localStorage.setItem(CACHE_KEY(url), JSON.stringify({ ts: Date.now(), txt }));
    } catch (_) {}
}


/* ───────────────────────────── small utils ─────────────────────────────── */

/* Precompiled regular expressions (sanity + perf) */
const RE_FENCE = /^(?:```|~~~)/;
const RE_HEADING = /^(#{1,6})\s+/;
const RE_HEADING_FULL = /^(#{1,6})\s+(.+)/;

/** Escape a string for safe use inside a RegExp. */
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Defer non-urgent side-effects without blocking interactivity/paint.
 * Uses requestIdleCallback when available, otherwise a 0ms timeout.
 * [PERF] Keeps first content paint snappy by pushing work off the main path.
 */
const whenIdle = (cb, timeout = 1500) =>
    'requestIdleCallback' in window ? requestIdleCallback(cb, { timeout }) : setTimeout(cb, 0);

/**
 * Promise that resolves when DOM is safe to read/write.
 * Avoids race conditions if this module executes before DOMContentLoaded.
 */
const domReady = () =>
    DOC.readyState !== 'loading' ?
    Promise.resolve() :
    new Promise(res => DOC.addEventListener('DOMContentLoaded', res, { once: true }));

/** Collapse any active selection prior to programmatic focus/scroll. */
const clearSelection = () => {
    const sel = window.getSelection?.();
    if (sel && !sel.isCollapsed) sel.removeAllRanges();
};

/** Base URL without hash; works for file:// and querystrings. */
const baseURLNoHash = () => location.href.replace(/#.*$/, '');

/** Build a deep-link URL for a given page + anchor id */
function buildDeepURL(page, anchorId='') {
    const base = baseURLNoHash() + '#' + (hashOf(page) ? hashOf(page) + (anchorId ? '#' : '') : '');
    return anchorId ? base + anchorId : base;
}

/** Force the main scroll position to the top (window + content region). */
function resetScrollTop() {
    // Window / document scrollers
    window.scrollTo(0, 0);
    // Some engines still rely on these:
    DOC.documentElement && (DOC.documentElement.scrollTop = 0);
    DOC.body && (DOC.body.scrollTop = 0);
    // If the app uses a scrollable content container, reset it too
    const c = $('#content');
    if (c) c.scrollTop = 0;
}

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
    if (!pages.length) throw new Error('No pages parsed from MD bundle.');

    // Prefer an explicit "home" page, otherwise first page acts as root.
    root = byId.get('home') || pages[0];

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

    // Extract fenced code and per-heading sections for deep search.
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
                counters[level]++; // increment current level
                for (let i = level + 1; i < 6; i++) counters[i] = 0; // reset deeper
                prev = {
                    id: counters.slice(0, level + 1).filter(Boolean).join('_'),
                    txt: txt.trim(),
                    bodyStart: offset + line.length + 1
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
 * original source content has deep isolated trees.
 */
function attachSecondaryHomes() {
    const topOf = p => {
        while (p.parent) p = p.parent;
        return p;
    };
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
const hashOf = page => page?.hash ?? '';
/** Resolve a sequence of id segments to a page node. */
const find = segs => {
    let n = root;
    for (const id of segs) {
        const c = n.children.find(k => k.id === id);
        if (!c) break; // tolerate invalid paths by stopping early
        n = c;
    }
    return n; // returns the deepest valid node
};
/** Update location.hash for in-app navigation (public for external links). */
function nav(page) {
    if (page) location.hash = '#' + hashOf(page);
}
KM.nav = nav; // expose in KM for interop/testing

/* ───────────────────────────── asset loaders ───────────────────────────── */
/**
 * ensureOnce(fn): Wrap an async initializer to run at most once, returning the
 * same promise on subsequent calls. This avoids duplicate imports and also
 * ensures callers can "await" safely even under races.
 */
const ensureOnce = fn => {
    let p;
    return () => (p ||= fn());
};

// D3: Select minimal submodules to keep payload small and intentional.
KM.ensureD3 = ensureOnce(async () => {
    const [sel, force, drag] = await Promise.all([
        import('https://cdn.jsdelivr.net/npm/d3-selection@3.0.0/+esm'),
        import('https://cdn.jsdelivr.net/npm/d3-force@3.0.0/+esm'),
        import('https://cdn.jsdelivr.net/npm/d3-drag@3.0.0/+esm')
    ]);
    KM.d3 = {
        select: sel.select,
        selectAll: sel.selectAll,
        forceSimulation: force.forceSimulation,
        forceLink: force.forceLink,
        forceManyBody: force.forceManyBody,
        forceCenter: force.forceCenter,
        drag: drag.drag
    };
});

// highlight.js: Load the core and then lazily register languages specified by
// CONFIG.LANGS. Supports failure of individual language modules.
KM.ensureHighlight = ensureOnce(async () => {
    const {
        default: hljs
    } = await import('https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/es/core/+esm');
    if (Array.isArray(LANGS) && LANGS.length) {
        await Promise.allSettled(LANGS.map(async lang => {
            try {
                const mod = await import(`https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/es/languages/${lang}/+esm`);
                hljs.registerLanguage(lang, mod.default);
            } catch (_) {}
        }));
    }
    window.hljs = hljs; // expose for highlightAll()
});

/**
 * ensureHLJSTheme(): Swap light/dark CSS theme to match current app theme.
 * Not memoized by design because we must update the <link> href each time.
 */
KM.ensureHLJSTheme = () => new Promise(res => {
    const THEME = {
        light: 'https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github.min.css',
        dark: 'https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github-dark.min.css',
    };
    const mode = DOC.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    let l = DOC.querySelector('link[data-hljs-theme]');
    if (!l) {
        l = DOC.createElement('link');
        l.rel = 'stylesheet';
        l.setAttribute('data-hljs-theme', '');
        DOC.head.appendChild(l);
    }
    if (l.getAttribute('href') === THEME[mode]) return res();
    // Resolve regardless of load success to keep render non-blocking.
    l.onload = l.onerror = res;
    l.href = THEME[mode];
});

// Markdown parser (marked) with alert & footnote plugins.
let mdReady = null;
KM.ensureMarkdown = () => {
    if (mdReady) return mdReady;
    mdReady = Promise.all([
        import('https://cdn.jsdelivr.net/npm/marked@16.1.2/+esm'),
        import('https://cdn.jsdelivr.net/npm/marked-alert@2.1.2/+esm'),
        import('https://cdn.jsdelivr.net/npm/marked-footnote@1.4.0/+esm'),
        import('https://cdn.jsdelivr.net/npm/marked-emoji@2.0.1/+esm'),
    ]).then(([marked, alertMod, footnoteMod, markedEmoji]) => {
        const md = new marked.Marked()
            .use(alertMod.default())
            .use(footnoteMod.default())
            .use(markedEmoji({
              emojis: { heart: '❤️', tada: '🎉' },
              renderer: (token) => token.emoji,
            }));

        return { parse: (src, opt) => md.parse(src, { ...opt, mangle: false }) };
    });
    return mdReady;
};

// KaTeX (math) on demand: inject CSS once, then load JS + auto-render helper.
KM.ensureKatex = ensureOnce(async () => {
    const BASE = 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/';
    if (!DOC.getElementById('katex-css')) {
        const link = Object.assign(DOC.createElement('link'), {
            id: 'katex-css',
            rel: 'stylesheet',
            href: BASE + 'katex.min.css'
        });
        DOC.head.appendChild(link);
    }
    const [katex, auto] = await Promise.all([
        import(BASE + 'katex.min.js/+esm'),
        import(BASE + 'contrib/auto-render.min.js/+esm')
    ]);
    window.katex = katex;
    window.renderMathInElement = auto.default;
});

/* ───────────────────────── KaTeX shared render helper ──────────────────── */
/** Centralized KaTeX options to keep main content and previews in sync. */
const KATEX_OPTS = {
    delimiters: [
        { left: '$$',  right: '$$',  display: true  },
        { left: '\\[', right: '\\]', display: true  },
        { left: '\\(', right: '\\)', display: false },
        { left: '$',   right: '$',   display: false },
    ],
    throwOnError: false,
};
/** Safe wrapper used everywhere (main view + previews). No-op if not loaded; avoids double render. */
function renderMathSafe(root) {
    try {
        if (root.dataset.mathRendered === '1') return;
        window.renderMathInElement?.(root, KATEX_OPTS);
        root.dataset.mathRendered = '1';
    } catch {}
}

/* ─────────────────────── HTML LRU cache ───────────────────── */
const PAGE_HTML_LRU_MAX = 40;
const pageHTMLLRU = new Map(); // pageId -> html

async function getParsedHTML(page) {
    if (pageHTMLLRU.has(page.id)) {
        const html = pageHTMLLRU.get(page.id);
        pageHTMLLRU.delete(page.id);
        pageHTMLLRU.set(page.id, html);
        return html;
    }
    const { parse } = await KM.ensureMarkdown();
    const tmp = el('div');
    tmp.innerHTML = parse(page.content, { headerIds: false });
    numberHeadings(tmp); // ensure stable heading IDs
    const html = tmp.innerHTML;
    pageHTMLLRU.set(page.id, html);
    if (pageHTMLLRU.size > PAGE_HTML_LRU_MAX) {
        const firstKey = pageHTMLLRU.keys().next().value;
        pageHTMLLRU.delete(firstKey);
    }
    return html;
}

/* ───────────────────────── UI decorations & utils ──────────────────────── */
/** Reusable selector for all heading levels (H1–H6) */
const HEADINGS_SEL = 'h1,h2,h3,h4,h5,h6';

/** Locale-aware title sort */
const __collator = new Intl.Collator(undefined, { sensitivity: 'base' });
const sortByTitle = (a, b) => __collator.compare(a.title, b.title);

/**
 * Copy helper with tiny visual confirmation via a transient CSS class.
 * [CROSS-BROWSER] Clipboard API may be unavailable → we fail quietly.
 */
async function copyText(txt, node) {
    try {
        await navigator.clipboard.writeText(txt);
        if (node) {
            node.classList.add('flash');
            setTimeout(() => node.classList.remove('flash'), 300);
        }
    } catch (e) {
        if (KM.DEBUG) console.warn('Clipboard API unavailable', e);
    }
}

/** Number headings (h1–h5) deterministically for deep-linking. */
function numberHeadings(elm) {
    const counters = [0, 0, 0, 0, 0, 0, 0];
    $$(HEADINGS_SEL, elm).forEach(h => {
        const level = +h.tagName[1] - 1; // H1→0, H2→1, ...
        counters[level]++; // bump current level
        for (let i = level + 1; i < 7; i++) counters[i] = 0; // reset deeper
        h.id = counters.slice(0, level + 1).filter(Boolean).join('_');
    });
}

let tocObserver = null; // re-created per page render
/**
 * Build the per-article Table of Contents and live-highlight on scroll.
 * Uses IntersectionObserver to mark the current heading in view.
 */
function buildToc(page) {
    const tocEl = $('#toc');
    if (!tocEl) return;
    tocEl.innerHTML = '';
    const heads = $$('#content ' + HEADINGS_SEL);
    if (!heads.length) {
        tocObserver?.disconnect();
        tocObserver = null;
        return;
    }

    const base = hashOf(page),
        ulEl = el('ul'),
        frag = DOC.createDocumentFragment();
    for (const h of heads) {
        frag.append(el('li', {
            dataset: { level: h.tagName[1], hid: h.id }
        }, [
            el('a', { href: '#' + (base ? base + '#' : '') + h.id,
                      textContent: h.textContent
            })
        ]));
    }
    ulEl.append(frag);
    tocEl.append(ulEl);

    // Reset any previous observer; prevents duplicate callbacks on re-render.
    tocObserver?.disconnect();
    tocObserver = new IntersectionObserver(entries => {
        for (const en of entries) {
            const a = $(`#toc li[data-hid="${en.target.id}"] > a`);
            if (!a) continue;
            if (en.isIntersecting) {
                $('#toc .toc-current')?.classList.remove('toc-current');
                a.classList.add('toc-current');
            }
        }
    }, { rootMargin: '0px 0px -70% 0px', threshold: 0 });
    heads.forEach(h => tocObserver.observe(h));
}

/** Previous/next sibling navigation pills at the bottom of the article. */
function prevNext(page) {
    $('#prev-next')?.remove();
    if (!page.parent) return; // root has no siblings

    // At the top level, avoid cross-section paging: promoted secondary reps
    // should not be considered siblings of the primary root children.
    if (page.parent === root) { if (page.isSecondary) return; } // no prev/next for promoted reps

    // Compute siblings; at root, filter out secondary reps when paging a primary page.
    let sib = page.parent.children;
    if (page.parent === root && !page.isSecondary) sib = sib.filter(p => !p.isSecondary);
    if (sib.length < 2) return; // nothing to paginate
    const i = sib.indexOf(page),
        wrap = el('div', { id: 'prev-next' });
    if (i > 0) wrap.append(el('a', {
        href: '#' + hashOf(sib[i - 1]),
        textContent: '← ' + sib[i - 1].title
    }));
    if (i < sib.length - 1) wrap.append(el('a', {
        href: '#' + hashOf(sib[i + 1]),
        textContent: sib[i + 1].title + ' →'
    }));
    $('#content').append(wrap);
}

/**
 * "See also" box using tag overlap for lightweight related content discovery.
 */
function seeAlso(page) {
    $('#see-also')?.remove();
    if (!page.tagsSet?.size) return;
    const related = pages
        .filter(p => p !== page)
        .map(p => ({ p, shared: [...p.tagsSet].filter(t => page.tagsSet.has(t)).length }))
        .filter(r => r.shared > 0)
        .sort((a, b) => (b.shared - a.shared) || sortByTitle(a.p, b.p));
    if (!related.length) return;

    const wrap = el('div', { id: 'see-also' }, [el('h2', { textContent: 'See also' }), el('ul')]);
    const ulEl = wrap.querySelector('ul');
    related.forEach(({ p }) => ulEl.append(el('li', {}, [el('a', {href: '#' + hashOf(p), textContent: p.title })])));
    const content = $('#content'), pn = $('#prev-next');
    content.insertBefore(wrap, pn ?? null); // insert before prev/next if present
}

/**
 * Footnote links generated by marked are local to the article. When the
 * article itself lives behind a base hash (#a#b), make links robust by
 * prefixing the base hash for intra-article anchors.
 */
function fixFootnoteLinks(page, container = $('#content')) {
    const base = hashOf(page);
    if (!base) return;
    $$('a[href^="#"]', container).forEach(a => {
        const href = a.getAttribute('href');
        if (!href) return;
        if (/^#(?:fn|footnote)/.test(href) && !href.includes(base + '#')) a.setAttribute('href', `#${base}${href}`);
    });
}

/**
 * Small inline SVG icons used by copy buttons. Embedding avoids extra
 * requests and works offline.
 */
const ICONS = {
    link: 'M3.9 12c0-1.7 1.4-3.1 3.1-3.1h5.4v-2H7c-2.8 0-5 2.2-5 5s2.2 5 5 5h5.4v-2H7c-1.7 0-3.1-1.4-3.1-3.1zm5.4 1h6.4v-2H9.3v2zm9.7-8h-5.4v2H19c1.7 0 3.1 1.4 3.1 3.1s-1.4 3.1-3.1 3.1h-5.4v2H19c2.8 0 5-2.2 5-5s-2.2-5-5-5z',
    code: 'M19,21H5c-1.1,0-2-0.9-2-2V7h2v12h14V21z M21,3H9C7.9,3,7,3.9,7,5v12 c0,1.1,0.9,2,2,2h12c2.2,0,2-2,2-2V5C23,3.9,22.1,3,21,3z M21,17H9V5h12V17z',
};
/** Create a compact icon button with a11y title/aria and optional click handler. */
const iconBtn = (title, path, cls, onClick) =>
    el('button', {
        type: 'button',
        class: cls,
        title,
        'aria-label': title,
        ...(onClick && { onclick: onClick }),
        innerHTML: `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${path}"></path></svg>`
    });

/**
 * Add copy buttons and clickable deep-links to headings & code blocks.
 * - Click on heading copies a ready-to-share URL to that section.
 * - Each code block gets a "Copy" affordance targeting code content.
 * - Event delegation handles button clicks; no per-button handlers.)
 */
function decorateHeadings(page, container = $('#content')) {
    const base = hashOf(page);
    const prefix = buildDeepURL(page, '') || (baseURLNoHash() + '#'); // reuse builder
    $$(HEADINGS_SEL, container).forEach(h => {
        const url = `${prefix}${h.id}`;
        // Add button without per-element handler (delegated listener will act)
        h.querySelector('button.heading-copy') || h.appendChild(iconBtn('Copy direct link', ICONS.link, 'heading-copy'));
        // Keep heading click behavior for convenience
        h.onclick = (ev) => {
            if ((ev.target instanceof Element) && ev.target.closest('a,button,input,select,textarea')) return;
            if (window.getSelection && String(window.getSelection()).length) return;
            clearSelection();
            copyText(url, h.querySelector('button.heading-copy'));
        };
    });
}

function decorateCodeBlocks(container = $('#content')) {
    $$('pre', container).forEach(pre => {
        if (pre.querySelector('button.code-copy')) return; // idempotent
        // Add button without handler; delegated listener will copy
        pre.append(iconBtn('Copy code', ICONS.code, 'code-copy'));
    });
}

/** For markdown content: open external http(s) links in a new tab, safely. */
function decorateExternalLinks() {
    $$('#content a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (!href || href.startsWith('#')) return;
        if (!/^https?:\/\//i.test(href)) return; // only absolute http(s)

        let url;
        try { url = new URL(href); } catch { return; }
        if (url.origin === location.origin) return;

        a.setAttribute('target', '_blank');
        // preserve any existing rel values, add safety flags
        const rel = new Set((a.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
        rel.add('noopener'); rel.add('noreferrer'); rel.add('external');
        a.setAttribute('rel', Array.from(rel).join(' '));
        // a11y: announce new tab and host
        if (!a.hasAttribute('aria-label')) {
            a.setAttribute('aria-label', `${a.textContent} (opens in new tab, ${url.hostname})`);
        }
    });
}

/* ─────────── Lazy, on-scroll code highlighting ─────────── */
async function highlightVisibleCode(root = DOC) {
    await KM.ensureHLJSTheme();
    await KM.ensureHighlight();
    const blocks = [...root.querySelectorAll('pre code')];
    if (!blocks.length) return;

    const obs = new IntersectionObserver((entries, o) => {
        for (const en of entries) {
            if (!en.isIntersecting) continue;
            const elx = en.target;
            if (!elx.dataset.hlDone) {
                window.hljs.highlightElement(elx);
                elx.dataset.hlDone = '1';
            }
            o.unobserve(elx);
        }
    }, { rootMargin: '200px 0px', threshold: 0 });

    blocks.forEach(elx => {
        if (elx.dataset.hlDone) return;
        obs.observe(elx);
    });
}

/* ─────────────────────────── sidebar / search ──────────────────────────── */
/**
 * Build the collapsible tree in the sidebar using the page hierarchy.
 * Folders (nodes with children) get a caret and an initially open state up to
 * depth 2 for discoverability.
 */
function buildTree() {
    const ul = $('#tree');
    if (!ul) return;
    ul.setAttribute('role', 'tree');
    ul.innerHTML = '';
    // Preserve MD order for primary (non-secondary) children of root
    const prim = root.children.filter(c => !c.isSecondary);
    const secs = root.children.filter(c => c.isSecondary).sort((a, b) => a.clusterId - b.clusterId);

    const rec = (nodes, container, depth = 0) => {
        nodes.forEach(p => {
            const li = el('li');
            if (p.children.length) {
                const open = depth < 2; // auto-open top levels
                li.className = 'folder' + (open ? ' open' : '');
                const groupId = `group-${p.id}`;
                const caret = el('button', {
                    type: 'button',
                    class: 'caret',
                    'aria-expanded': String(open),
                    'aria-controls': groupId,
                    'aria-label': open ? 'Collapse' : 'Expand'
                });
                const lbl = el('a', {
                    class: 'lbl',
                    dataset: { page: p.id },
                    href: '#' + hashOf(p),
                    textContent: p.title
                });
                const sub = el('ul', {
                    id: groupId,
                    role: 'group',
                    style: `display:${open?'block':'none'}`
                });
                li.setAttribute('role', 'treeitem');
                li.setAttribute('aria-expanded', String(open));
                li.append(caret, lbl, sub);
                container.append(li);
                // Preserve MD order for children as declared in the MD bundle
                rec(p.children, sub, depth + 1);
            } else {
                li.className = 'article';
                li.setAttribute('role', 'treeitem');
                li.append(el('a', {
                    dataset: { page: p.id },
                    href: '#' + hashOf(p),
                    textContent: p.title
                }));
                container.append(li);
            }
        });
    };

    const frag = DOC.createDocumentFragment();
    rec(prim, frag);
    // Secondary clusters are separated visually and rendered one by one.
    secs.forEach(r => {
        const sep = el('div', {
                class: 'group-sep',
                role: 'presentation',
                'aria-hidden': 'true'
            },
            [el('hr', { role: 'presentation', 'aria-hidden': 'true' })]
        );
        frag.append(sep);
        rec([r], frag);
    });
    ul.append(frag);
}
/** Highlight the current page in the sidebar tree. */
function highlightSidebar(page) {
    $('#tree .sidebar-current')?.classList.remove('sidebar-current');
    const link = $(`#tree a[data-page="${page.id}"]`);
    if (!link) return;
    link.classList.add('sidebar-current');
    // Open ancestor folders so the current item is visible
    let li = link.closest('li');
    while (li) {
        if (li.classList.contains('folder')) {
            li.classList.add('open');
            li.setAttribute('aria-expanded', 'true');
            const caret = li.querySelector('button.caret');
            if (caret) {
                caret.setAttribute('aria-expanded', 'true');
                caret.setAttribute('aria-label', 'Collapse');
            }
            const sub = li.querySelector('ul[role="group"]');
            if (sub) sub.style.display = 'block';
        }
        li = li.parentElement?.closest('li');
    }
    // Try to keep the active item in view without jumping the page scroll
    const tree = $('#tree');
    if (tree && link) {
        const r = link.getBoundingClientRect();
        const tr = tree.getBoundingClientRect();
        requestAnimationFrame(() => {
            if (r.top < tr.top || r.bottom > tr.bottom) link.scrollIntoView({ block: 'nearest' });
        });
    }
}

/**
 * Ranked search over titles, tags, and per-heading sections.
 * Heuristics:
 *  - Title hits weigh most, then tags, then body.
 *  - Section heading hits boost both the page and the sub-results.
 *  - Exact phrase (multi-word) match adds a small bonus.
 *  - Reuse compiled regexes for sections)
 */
function search(q) {
    const resUL = $('#results'),
        treeUL = $('#tree');
    if (!resUL || !treeUL) return;
    const val = q.trim().toLowerCase();
    resUL.setAttribute('aria-live', 'polite');
    resUL.setAttribute('aria-busy', 'true');

    if (!val) {
        resUL.style.display = 'none';
        resUL.innerHTML = '';
        treeUL.style.display = '';
        return;
    }

    const tokens = val.split(/\s+/).filter(t => t.length >= 2); // ignore 1-char noise
    const tokenRegexes = tokens.map(t => new RegExp('\\b' + escapeRegex(t) + '\\b'));
    resUL.innerHTML = '';
    resUL.style.display = '';
    treeUL.style.display = 'none';

    // ——— weights (tweak to taste) ———
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
        // Fast prefilter: require all tokens somewhere in the page’s searchable string.
        if (!tokens.every(tok => p.searchStr.includes(tok))) continue;

        let score = 0;

        // Per-token weighting (word-boundary to avoid partials)
        for (const r of tokenRegexes) {
            if (r.test(p.titleL)) score += W.title;
            if (r.test(p.tagsL))  score += W.tag;
            if (r.test(p.bodyL))  score += W.body;
        }

        // Phrase bonus for multi-word queries
        if (phrase) {
            if (p.titleL.includes(phrase)) score += W.phraseTitle;
            else if (p.bodyL.includes(phrase)) score += W.phraseBody;
        }

        // Rank section sub-results (and give the page a small boost for having many)
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
        score += Math.min(W.secCountCap, matchedSecs.length); // modest page boost

        scored.push({ p, score, matchedSecs });
    }

    // Final ordering: score desc, then title alphabetically for stability
    scored.sort((a, b) => b.score - a.score || sortByTitle(a.p, b.p));

    // Render
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

/* ─────────────────────────── breadcrumb / crumb ────────────────────────── */
/**
 * Build breadcrumb with sibling dropdowns and an optional child drawer for
 * quick intra-level navigation.
 */
function breadcrumb(page) {
    const dyn = $('#crumb-dyn');
    if (!dyn) return;
    dyn.innerHTML = '';
    const chain = [];
    for (let n = page; n; n = n.parent) chain.unshift(n);
    if (chain.length) chain.shift(); // drop root label when present

    chain.forEach((n, i) => {
        if (i) dyn.insertAdjacentHTML('beforeend', '<span class="separator">▸</span>');
        const wrap = el('span', { class: 'dropdown' });
        const a = el('a', { textContent: n.title, href: '#' + hashOf(n) });
        if (n === page) a.className = 'crumb-current';
        wrap.append(a);

        const siblings = n.parent.children.filter(s => s !== n);
        if (siblings.length) {
            const ul = el('ul');
            siblings.forEach(s => ul.append(el('li', {
                textContent: s.title,
                onclick: () => nav(s)
            })));
            wrap.append(ul);
        }
        dyn.append(wrap);
    });

    if (page.children.length) {
        const box = el('span', { class: 'childbox' }, [el('span', { class: 'toggle', textContent: '▾' }), el('ul')]);
        const ul = box.querySelector('ul');
        page.children.sort(sortByTitle).forEach(ch => ul.append(el('li', {
            textContent: ch.title,
            onclick: () => nav(ch)
        })));
        dyn.append(box);
    }
}

/* ───────────────────────────── mini graph (D3) ─────────────────────────── */
// Stable IDs used in CSS to style node/link classes by semantic role.
const IDS = {
    current: 'node_current',
    parent: 'node_parent',
    leaf: 'node_leaf',
    hierPRE: 'link_hier',
    tagPRE: 'link_tag',
    label: 'graph_text'
};
const graphs = {}; // registry for future expansion (e.g., full graph)
let CURRENT = -1; // currently highlighted node id in the graph

/** Return current <svg>#mini size (fullscreen aware) */
function getMiniSize() {
    const svg = $('#mini');
    if (!svg) return { w: 400, h: 300 };
    if (svg.classList.contains('fullscreen')) return { w: innerWidth, h: innerHeight };
    const r = svg.getBoundingClientRect();
    return { w: Math.max(1, r.width | 0), h: Math.max(1, r.height | 0) };
}

/** Update the mini graph viewport and recentre the simulation. */
let _miniKick = 0;
function updateMiniViewport() {
    if (!graphs.mini) return;
    const { svg, sim } = graphs.mini;
    const { w, h } = getMiniSize();
    graphs.mini.w = w;
    graphs.mini.h = h;
    svg.attr('viewBox', `0 0 ${w} ${h}`).attr('width', w).attr('height', h).attr('preserveAspectRatio', 'xMidYMid meet');
    sim.force('center', KM.d3.forceCenter(w / 2, h / 2));
    clearTimeout(_miniKick);
    _miniKick = setTimeout(() => { sim.alpha(0.2).restart(); }, 50);
}

/**
 * Build nodes/links for the visualization.
 * - Hierarchical edges connect each node to its parent.
 * - Tag edges connect pages sharing at least one tag. Pair counts become a
 *   weight (capped in CSS when mapped to style IDs).
 */
function buildGraphData() {
    const nodes = [], links = [], adj = new Map(), hierPairs = new Set();
    const touch = (a, b) => {
        (adj.get(a) || adj.set(a, new Set()).get(a)).add(b);
        (adj.get(b) || adj.set(b, new Set()).get(b)).add(a);
    };
    const tierOf = n => n < 3 ? 1 : n < 6 ? 2 : n < 11 ? 3 : n < 21 ? 4 : 5; // tiers by subtree size

    pages.forEach((p, i) => {
        p._i = i;
        nodes.push({ id: i, label: p.title, ref: p });
    });

    // Hierarchical edges (unique per parent<->child). Using a Set to dedupe.
    pages.forEach(p => {
        if (!p.parent) return;
        if (p.isSecondary && p.parent === root) return; // reduce noise for promoted reps
        const a = p._i, b = p.parent._i;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        links.push({ source: a, target: b, shared: 0, kind: 'hier', tier: tierOf(descendants(p)) });
        hierPairs.add(key);
        touch(a, b);
    });

    // Accumulate shared-tag counts per unique pair with a soft cap per tag group.
    const tagToPages = new Map(); // Map<tag, number[]>
    pages.forEach(p => { for (const t of p.tagsSet) { if (!tagToPages.has(t)) tagToPages.set(t, []); tagToPages.get(t).push(p._i); } });
    const shared = new Map(); // key "i|j" -> count
    const MAX_PER_TAG = 80;
    for (const arr0 of tagToPages.values()) {
        const arr = arr0.slice(0, MAX_PER_TAG);
        for (let x = 0; x < arr.length; x++) {
            for (let y = x + 1; y < arr.length; y++) {
                const i = arr[x], j = arr[y];
                const key = i < j ? `${i}|${j}` : `${j}|${i}`;
                shared.set(key, (shared.get(key) || 0) + 1);
            }
        }
    }
    for (const [key, count] of shared) {
        if (count < 2) continue; // drop weak tag ties to reduce noise
        if (hierPairs.has(key)) continue; // avoid doubling up with hierarchy
        const [i, j] = key.split('|').map(Number);
        links.push({ source: i, target: j, shared: count, kind: 'tag' });
        touch(i, j);
    }

    return { nodes, links, adj };
}

/**
 * Build the mini force-directed graph lazily on first visibility.
 * [PERF] Work is deferred until #mini is actually intersecting the viewport.
 */
async function buildGraph() {
    await KM.ensureD3();
    if (graphs.mini) return; // idempotent

    const { nodes, links, adj } = buildGraphData();
    const svg = KM.d3.select('#mini');
    const { w: W, h: H } = getMiniSize();
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('preserveAspectRatio', 'xMidYMid meet');

    // Copy arrays to avoid accidental mutation of the master model.
    const localN = nodes.map(n => ({ ...n })), localL = links.map(l => ({ ...l }));

    const sim = KM.d3.forceSimulation(localN)
        .force('link', KM.d3.forceLink(localL).id(d => d.id).distance(80))
        .force('charge', KM.d3.forceManyBody().strength(-240))
        .force('center', KM.d3.forceCenter(W / 2, H / 2));

    const view = svg.append('g').attr('class', 'view');

    const link = view.append('g').selectAll('line')
        .data(localL).join('line')
        .attr('id', d => d.kind === 'hier' ? IDS.hierPRE + d.tier : IDS.tagPRE + Math.min(d.shared, 5));

    // DRY: behaviour shared by both initial and future nodes.
    const wireNode = sel => sel
        .attr('r', 6)
        .attr('id', d => d.ref.children.length ? IDS.parent : IDS.leaf)
        .on('click', (e, d) => KM.nav(d.ref))
        .on('mouseover', (e, d) => fade(d.id, 0.15))
        .on('mouseout', () => fade(null, 1))
        .call(KM.d3.drag()
            .on('start', (e, d) => { d.fx = d.x; d.fy = d.y; })
            .on('drag',  (e, d) => { sim.alphaTarget(0.25).restart(); d.fx = e.x; d.fy = e.y; })
            .on('end',   (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = d.fy = null; }));

    const node = wireNode(view.append('g').selectAll('circle').data(localN).join('circle'));

    const label = view.append('g').selectAll('text')
        .data(localN).join('text')
        .attr('id', IDS.label).attr('font-size', 10)
        .attr('pointer-events', 'none')
        .text(d => d.label);

    function fade(id, o) {
        node.style('opacity', d => (id == null || graphs.mini.adj.get(id)?.has(d.id) || d.id === id) ? 1 : o);
        label.style('opacity', d => (id == null || graphs.mini.adj.get(id)?.has(d.id) || d.id === id) ? 1 : o);
        link.style('opacity', l => id == null || l.source.id === id || l.target.id === id ? 1 : o);
    }

    sim.on('tick', () => {
        link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
        node.attr('cx', d => d.x).attr('cy', d => d.y);
        label.attr('x', d => d.x + 8).attr('y', d => d.y + 3);
    });

    graphs.mini = { svg, node, label, sim, view, adj, w: W, h: H };
    observeMiniResize();
}

/** Highlight the current page’s node and pull it towards the center. */
function highlightCurrent(force = false) {
    if (!graphs.mini) return;
    const seg = location.hash.slice(1).split('#').filter(Boolean);
    const pg = find(seg);
    const id = pg?._i ?? -1;
    if (id === CURRENT && !force) return;

    const g = graphs.mini;
    g.node
        .attr('id', d => d.id === id ? IDS.current : (d.ref.children.length ? IDS.parent : IDS.leaf))
        .attr('r', d => d.id === id ? 8 : 6);
    g.label.classed('current', d => d.id === id);

    const cx = g.w / 2, cy = g.h / 2;
    g.node.filter(d => d.id === id).each(d => {
        const dx = cx - d.x, dy = cy - d.y;
        // Remove redundant reset transform
        g.view.attr('transform', `translate(${dx},${dy})`);
        const k = 0.10;
        d.vx += (cx - d.x) * k;
        d.vy += (cy - d.y) * k; // gentle nudge
    });

    g.sim.alphaTarget(0.15).restart();
    setTimeout(() => g.sim.alphaTarget(0), 250);
    CURRENT = id;
}

/** Keep mini-graph responsive to container size and fullscreen changes. */
function observeMiniResize() {
    const elx = $('#mini');
    if (!elx) return;
    new ResizeObserver(() => {
        if (!graphs.mini) return;
        updateMiniViewport();
        highlightCurrent(true);
    }).observe(elx);
}

/* ───────────────────────── renderer + router + init ────────────────────── */
/** Scroll to an in-page anchor if present. Smooth for user comfort. */
function scrollToAnchor(anchor) {
    if (!anchor) return;
    const target = DOC.getElementById(anchor);
    if (target) target.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Render the current page: markdown → HTML, then progressive enhancements
 * (images, footnotes, heading IDs, syntax highlight, math, ToC, copy buttons,
 * related links, prev/next), and finally scroll to any anchor.
 */
async function render(page, anchor) {
    const contentEl = $('#content');
    if (!contentEl) return;

    contentEl.dataset.mathRendered = '0';
    contentEl.innerHTML = await getParsedHTML(page);

    decorateExternalLinks();

    // Progressive image hints to reduce LCP impact and avoid network contention.
    const imgs = $$('#content img');
    imgs.forEach((img, i) => {
        img.loading = 'lazy';
        img.decoding = 'async';
        if (!img.hasAttribute('fetchpriority') && i < 2) img.setAttribute('fetchpriority', 'high');
    });

    fixFootnoteLinks(page);
    // numberHeadings already applied by getParsedHTML()

    // Lazy syntax highlight
    await highlightVisibleCode($('#content'));

    // Render LaTeX math only when textual heuristics hint there is any.
    if (/(\$[^$]+\$|\\\(|\\\[)/.test(page.content)) {
        await KM.ensureKatex();
        renderMathSafe(contentEl);
    }

    buildToc(page);
    decorateHeadings(page);
    decorateCodeBlocks();
    prevNext(page);
    seeAlso(page);

    scrollToAnchor(anchor);
}

let currentPage = null; // debounces redundant renders on hash changes

/**
 * Hash router: compute (page, optional in-page anchor) and render.
 * Handles three cases:
 *   1) First load / page change → full render + sidebar/graph updates
 *   2) Same page, anchor change → smooth scroll only
 *   3) Defensive handling of invalid hashes (falls back to closest page)
 */
function route() {
    closePanels();
    const seg = location.hash.slice(1).split('#').filter(Boolean);
    const page = find(seg);
    const base = hashOf(page);
    const baseSegs = base ? base.split('#') : [];
    const anchor = seg.slice(baseSegs.length).join('#'); // remainder → heading id

    if (currentPage !== page) {
        currentPage = page;

        breadcrumb(page);
        render(page, anchor);
        highlightCurrent(true);
        highlightSidebar(page);

        // After the new content paints, ensure we're at the top (unless navigating to an anchor).
        if (!anchor) requestAnimationFrame(() => resetScrollTop());
    } else if (anchor) {
        // Same page, only anchor changed → avoid re-parsing & re-rendering.
        scrollToAnchor(anchor);
        const a = $(`#toc li[data-hid="${anchor}"] > a`);
        if (a) {
            $('#toc .toc-current')?.classList.remove('toc-current');
            a.classList.add('toc-current');
        }
    }
}

/* ─────────────────────────── global UI + theme ─────────────────────────── */
/** Close both panels (sidebar & utility) */
function closePanels() {
    $('#sidebar')?.classList.remove('open');
    $('#util')?.classList.remove('open');
}

let uiInited = false; // guard against duplicate initialization

/* ───────────────────────────── link previews (v2) ─────────────────────────────
   - Hover/focus an internal link → show small scrollable preview of the target page
   - If the URL includes a heading anchor, auto-scroll to that heading
   - Code blocks inside previews are highlighted (lazy, HLJS)
   - Hovering links *inside previews* opens nested previews in a stack
   - Mouse leaving or clicking ✕ closes the relevant preview
*/
(() => {
    // Use global getParsedHTML LRU cache
    const previewStack = []; // stack of { el, body, link, timer }
    let hoverDelay = null;

    function resolveTarget(href) {
        if (!href || !href.startsWith('#')) return null;
        const seg = href.slice(1).split('#').filter(Boolean);
        if (!seg.length) return null;
        const page = find(seg);
        const base = hashOf(page);
        const baseSegs = base ? base.split('#') : [];
        if (!baseSegs.length) return null; // not a link to a page → ignore
        const anchor = seg.slice(baseSegs.length).join('#');
        return { page, anchor };
    }

    function rewriteRelativeAnchorsIn(panel, page) {
        const base = hashOf(page); // e.g. "stresstest"
        panel.body.querySelectorAll('a[href^="#"]').forEach(a => {
            const h = a.getAttribute('href') || '';
            // Already a full page link? leave it
            const isFull = !!resolveTarget(h);
            if (isFull) return;
            // Make it "#<page>#<fragment>"
            const frag = h.length > 1 ? ('#' + h.slice(1)) : '';
            a.setAttribute('href', '#' + base + frag);
        });
    }

    function positionPreview(panel, linkEl) {
        const rect = linkEl.getBoundingClientRect();
        const vw = __VPW, vh = __VPH;
        const gap = 8;
        const W = Math.min(520, vw * 0.48);
        const H = Math.min(480, vh * 0.72);
        const preferRight = rect.right + gap + W <= vw;
        const left = preferRight ? Math.min(rect.right + gap, vw - W - gap) :
            Math.max(gap, rect.left - gap - W);
        const top = Math.min(Math.max(gap, rect.top), vh - H - gap);
        Object.assign(panel.el.style, {
            width: W + 'px',
            height: H + 'px',
            left: left + 'px',
            top: top + 'px'
        });
    }

    function closeFrom(indexInclusive = 0) {
        for (let i = previewStack.length - 1; i >= indexInclusive; i--) {
            const p = previewStack[i];
            clearTimeout(p.timer);
            p.el.remove();
            previewStack.pop();
        }
    }

    function anyPreviewOrTriggerActive() {
        const anyHoverPreview = Array.from(document.querySelectorAll('.km-link-preview'))
            .some(p => p.matches(':hover'));
        if (anyHoverPreview) return true;
        const active = document.activeElement;
        const activeIsTrigger = !!(active && active.closest && isInternalPageLink(active.closest('a[href^="#"]')));
        if (activeIsTrigger) return true;
        const hoveringTrigger = previewStack.some(p => p.link && p.link.matches(':hover'));
        return hoveringTrigger;
    }

    let trimTimer;
    function scheduleTrim() {
        clearTimeout(trimTimer);
        trimTimer = setTimeout(() => {
            if (!anyPreviewOrTriggerActive()) closeFrom(0);
        }, 220);
    }

    async function fillPanel(panel, page, anchor) {
        panel.body.dataset.mathRendered = '0';
        panel.body.innerHTML = await getParsedHTML(page);
        rewriteRelativeAnchorsIn(panel, page);

        // Lazy highlight within preview
        await highlightVisibleCode(panel.body);

        // Render math (KaTeX)
        await KM.ensureKatex();
        renderMathSafe(panel.body);

        decorateCodeBlocks(panel.body);
        decorateHeadings(page, panel.body);
        decorateExternalLinks(panel.body);
        fixFootnoteLinks(page, panel.body);

        // Auto scroll to anchor if provided
        if (anchor) {
            const container = panel.el;
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            const t = panel.body.querySelector('#' + CSS.escape(anchor));
            if (t) {
                const header = container.querySelector('header');
                const headerH = header ? header.offsetHeight : 0;
                const cRect = container.getBoundingClientRect();
                const tRect = t.getBoundingClientRect();
                const y = tRect.top - cRect.top + container.scrollTop;
                const top = Math.max(0, y - headerH - 6);
                container.scrollTo({ top, behavior: 'auto' });
                t.classList.add('km-preview-focus');
            }
        }
    }

    function createPanel(linkEl) {
        const container = el('div', { class: 'km-link-preview', role: 'dialog', 'aria-label': 'Preview' });
        const header = el('header', {}, [
            el('button', { type: 'button', class: 'km-preview-close', title: 'Close', 'aria-label': 'Close', innerHTML: '✕' })
        ]);
        const body = el('div');
        container.append(header, body);
        document.body.appendChild(container);

        const panel = { el: container, body, link: linkEl, timer: null };
        const idx = previewStack.push(panel) - 1;

        // Hover handling for close lifecycle
        container.addEventListener('mouseenter', () => {
            clearTimeout(panel.timer);
            clearTimeout(trimTimer);
        }, { passive: true });
        container.addEventListener('mouseleave', (e) => {
            const to = e.relatedTarget;
            if (to && (to.closest && to.closest('.km-link-preview'))) return; // still inside previews stack
            panel.timer = setTimeout(() => { closeFrom(idx); }, 240);
        }, { passive: true });
        header.querySelector('button').addEventListener('click', () => closeFrom(idx));

        // Open links INSIDE previews → spawn another panel on top
        container.addEventListener('mouseover', (e) => maybeOpenFromEvent(e), true);
        container.addEventListener('focusin',  (e) => maybeOpenFromEvent(e), true);

        positionPreview(panel, linkEl);

        // Copy link buttons
        panel.el.addEventListener('click', (e) => {
        const btn = e.target.closest?.('button.heading-copy, button.code-copy');
        if (!btn) return;
        if (btn.classList.contains('heading-copy')) {
            const h = btn.closest(HEADINGS_SEL);
            const target = resolveTarget(panel.link.getAttribute('href')||'');
            const base = buildDeepURL(target?.page, '') || (baseURLNoHash() + '#');
            copyText(base + h.id, btn);
        } else {
            const pre = btn.closest('pre');
            const code = pre?.querySelector('code');
            copyText(code ? code.innerText : pre?.innerText || '', btn);
        }
        });

        return panel;
    }

    async function openPreviewForLink(linkEl) {
        const href = linkEl.getAttribute('href') || '';
        const target = resolveTarget(href);
        if (!target) return;

        // Dedupe: if this exact link already has an open preview, just reposition it.
        const existingIdx = previewStack.findIndex(p => p.link === linkEl);
        if (existingIdx >= 0) {
            const existing = previewStack[existingIdx];
            clearTimeout(existing.timer);
            positionPreview(existing, linkEl);
            return;
        }

        const panel = createPanel(linkEl);
        // Cancel any close timers on existing panels when a child opens
        previewStack.forEach(p => clearTimeout(p.timer));
        await fillPanel(panel, target.page, target.anchor);
    }

    function isInternalPageLink(a) {
        const href = a?.getAttribute('href') || '';
        return !!resolveTarget(href);
    }

    function maybeOpenFromEvent(e) {
        const a = e.target && e.target.closest && e.target.closest('a[href^="#"]');
        if (!a || !isInternalPageLink(a)) return;
        clearTimeout(hoverDelay);
        const openNow = e.type === 'focusin';
        if (openNow) {
            openPreviewForLink(a);
        } else {
            hoverDelay = setTimeout(() => openPreviewForLink(a), 220);
        }
    }

    // Global listeners: main content + previews (delegated)
    function attachLinkPreviewsV2() {
        const root = $('#content');
        if (!root) return;
        root.addEventListener('mouseover', maybeOpenFromEvent, true);
        root.addEventListener('focusin',  maybeOpenFromEvent, true);
        root.addEventListener('mouseout', (e) => {
            const to = e.relatedTarget;
            if (to && (to.closest && to.closest('.km-link-preview'))) return; // moving into a preview
            scheduleTrim();
        }, true);

        addEventListener('hashchange', () => closeFrom(0), { passive: true });
        addEventListener('scroll',     () => scheduleTrim(), { passive: true }); // close trailing when scrolling
    }

    // Expose for initUI()
    KM.attachLinkPreviewsV2 = attachLinkPreviewsV2;
})();


function initUI() {
    try {
        KM.attachLinkPreviewsV2();
    } catch (_) {}

    if (uiInited) return; // idempotent safety
    uiInited = true;

    // Disable browser scroll restoration (we handle scroll position ourselves).
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch {}

    // Title & sidebar
    $('#wiki-title-text').textContent = TITLE;
    document.title = TITLE;
    buildTree();

    // THEME: persists preference, respects config, reacts to system & storage.
    (function themeInit() {
        const btn = $('#theme-toggle'),
            rootEl = DOC.documentElement,
            media = matchMedia('(prefers-color-scheme: dark)');
        const stored = localStorage.getItem('km-theme'); // 'dark' | 'light' | null
        const cfg = (DEFAULT_THEME === 'dark' || DEFAULT_THEME === 'light') ? DEFAULT_THEME : null;
        let dark = stored ? (stored === 'dark') : (cfg ? cfg === 'dark' : media.matches);

        if (typeof ACCENT === 'string' && ACCENT) rootEl.style.setProperty('--color-accent', ACCENT);

        apply(dark);
        if (btn) {
            btn.setAttribute('aria-pressed', String(dark));
            btn.onclick = () => {
                dark = !dark;
                apply(dark);
                btn.setAttribute('aria-pressed', String(dark));
                localStorage.setItem('km-theme', dark ? 'dark' : 'light');
            };
        }

        // Follow OS changes only when there is no explicit user or config preference.
        media.addEventListener?.('change', (e) => {
            const hasUserPref = !!localStorage.getItem('km-theme');
            if (!hasUserPref && !cfg) {
                dark = e.matches;
                apply(dark);
            }
        });

        // Keep multiple tabs in sync via the StorageEvent.
        addEventListener('storage', (e) => {
            if (e.key === 'km-theme') {
                dark = e.newValue === 'dark';
                apply(dark);
            }
        });

        function apply(isDark) {
            // Prefer CSS variables to enable theming without large CSS rewrites.
            rootEl.style.setProperty('--color-main', isDark ? 'rgb(29,29,29)' : 'white');
            rootEl.setAttribute('data-theme', isDark ? 'dark' : 'light');
            KM.ensureHLJSTheme(); // async theme swap for syntax highlight CSS
        }
    })();

    // Initial route/render.
    route();

    // Lazy-build the mini-graph on first visibility to avoid upfront cost.
    const miniElForObserver = $('#mini');
    if (miniElForObserver) {
        new IntersectionObserver((entries, obs) => {
            if (entries[0]?.isIntersecting) {
                buildGraph();
                obs.disconnect();
            }
        }).observe(miniElForObserver);
    }

    // Graph fullscreen toggle with aria-pressed state for a11y.
    const mini = $('#mini');
    const expandBtn = $('#expand');
    if (expandBtn && mini) {
        expandBtn.onclick = () => {
            const full = mini.classList.toggle('fullscreen');
            expandBtn.setAttribute('aria-pressed', String(full));
            updateMiniViewport();
            requestAnimationFrame(() => highlightCurrent(true));
        };
    }

    // Event delegation for copy buttons in main content
    const contentRoot = $('#content');
    if (contentRoot) {
        contentRoot.addEventListener('click', (e) => {
            const btn = e.target.closest?.('button.heading-copy, button.code-copy');
            if (!btn) return;

            if (btn.classList.contains('heading-copy')) {
                const h = btn.closest(HEADINGS_SEL);
                const page = currentPage;
                const base = buildDeepURL(page, '') || (baseURLNoHash() + '#');
                copyText(base + h.id, btn);
            } else if (btn.classList.contains('code-copy')) {
                const pre = btn.closest('pre');
                const code = pre?.querySelector('code');
                copyText(code ? code.innerText : pre?.innerText || '', btn);
            }
        });
    }

    // Search box: debounce keystrokes; show a clear button when non-empty.
    const searchInput = $('#search'),
        searchClear = $('#search-clear');
    let debounce = 0;
    if (searchInput && searchClear) {
        searchInput.oninput = e => {
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
    }

    // Panels: toggle one at a time, each with its own close button once opened.
    const togglePanel = sel => {
        const elx = $(sel);
        if (!elx) return;
        const wasOpen = elx.classList.contains('open');
        closePanels();
        if (!wasOpen) {
            elx.classList.add('open');
            if (!elx.querySelector('.panel-close')) elx.append(el('button', {
                type: 'button',
                class: 'panel-close',
                'aria-label': 'Close panel',
                textContent: '✕',
                onclick: closePanels
            }));
        }
    };
    const burgerSidebar = $('#burger-sidebar');
    const burgerUtil = $('#burger-util');
    if (burgerSidebar) burgerSidebar.onclick = () => togglePanel('#sidebar');
    if (burgerUtil) burgerUtil.onclick = () => togglePanel('#util');

    // Keep layout stable on resize and recompute fullscreen graph viewport.
    addEventListener('resize', () => {
        if (matchMedia('(min-width:1001px)').matches) {
            closePanels();
            highlightCurrent(true);
        }
        if ($('#mini')?.classList.contains('fullscreen')) {
            updateMiniViewport();
            highlightCurrent(true);
        }
    }, { passive: true });

    // Close panels upon navigation clicks inside the lists.
    $('#tree').addEventListener('click', e => {
        const caret = e.target.closest('button.caret');
        if (caret) {
            const li = caret.closest('li.folder'),
                sub = li.querySelector('ul');
            const open = !li.classList.contains('open');
            li.classList.toggle('open', open);
            caret.setAttribute('aria-expanded', String(open));
            caret.setAttribute('aria-label', open ? 'Collapse' : 'Expand');
            li.setAttribute('aria-expanded', String(open));
            if (sub) sub.style.display = open ? 'block' : 'none';
            return;
        }
        if (e.target.closest('a')) closePanels();
    }, { passive: true });
    $('#results').addEventListener('click', e => {
        if (e.target.closest('a')) closePanels();
    }, { passive: true });

    // Hash router wiring.
    addEventListener('hashchange', route, { passive: true });

    // ESC: close panels or exit graph fullscreen.
    addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        let acted = false;
        const kb = $('#kb-help');
        if (kb && !kb.hidden) {
            kb.hidden = true;
            acted = true;
        }
        const sidebarOpen = $('#sidebar')?.classList.contains('open');
        const utilOpen = $('#util')?.classList.contains('open');
        if (sidebarOpen || utilOpen) {
            closePanels();
            acted = true;
        }
        if (mini && mini.classList.contains('fullscreen')) {
            mini.classList.remove('fullscreen');
            if (expandBtn) expandBtn.setAttribute('aria-pressed', 'false');
            updateMiniViewport();
            requestAnimationFrame(() => highlightCurrent(true));
            acted = true;
        }
        if (acted) e.preventDefault(); // prevent page-level ESC behavior when handled
    }, { capture: true });


    // ===== Keyboard Shortcuts =====
    (function keyboardShortcuts() {
    // --- Element refs
    const $search = $('#search');
    const $theme = $('#theme-toggle');
    const $expand = $('#expand');
    const $kbIcon = $('#kb-icon');

    // --- Small DOM helper (no dependency on global `el`)
    const h = (tag, attrs = {}, children = []) => {
        const node = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') node.className = v;
        else if (k === 'textContent') node.textContent = v;
        else if (k === 'innerHTML') node.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
        }
        for (const c of Array.isArray(children) ? children : [children]) if (c) node.append(c);
        return node;
    };

    // --- Utilities
    const isEditable = (el) => !!(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/i.test(el.tagName)));
    const key = (e, k) => e.key === k || e.key.toLowerCase() === (k + '').toLowerCase();
    const keyIn = (e, list) => list.some((k) => key(e, k));
    const isMod = (e) => e.ctrlKey || e.metaKey; // Ctrl on Windows/Linux, Cmd on macOS
    const noMods = (e) => !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;

    // --- Actions
    let _helpOpener = null;
    const actions = {
        focusSearch: () => $search?.focus(),
        toggleTheme: () => $theme?.click(),
        toggleSidebar: () => window.__kmToggleSidebar?.(),
        toggleUtil: () => window.__kmToggleUtil?.(),
        toggleCrumb: () => window.__kmToggleCrumb?.(),
        fullscreenGraph: () => $expand?.click(),
        openHelp,
        closeHelp,
    };

    // --- Key bindings (single source of truth)
    // `inEditable: true` means it should still fire inside inputs/contenteditable
    const bindings = [
        { id: 'search-ctrlk', when: (e) => isMod(e) && key(e, 'k'), action: 'focusSearch', inEditable: true, help: 'Ctrl/Cmd + K' },
        { id: 'search-slash', when: (e) => key(e, '/') && !e.shiftKey && !isMod(e), action: 'focusSearch', help: '/' },
        { id: 'search-s', when: (e) => key(e, 's') && noMods(e), action: 'focusSearch', help: 'S' },
        { id: 'left', when: (e) => keyIn(e, ['a', 'q']) && noMods(e), action: 'toggleSidebar', help: 'A or Q' },
        { id: 'right', when: (e) => key(e, 'd') && noMods(e), action: 'toggleUtil', help: 'D' },
        { id: 'crumb', when: (e) => keyIn(e, ['w', 'z']) && noMods(e), action: 'toggleCrumb', help: 'W or Z' },
        { id: 'theme', when: (e) => key(e, 't') && noMods(e), action: 'toggleTheme', help: 'T' },
        { id: 'graph', when: (e) => key(e, 'g') && noMods(e), action: 'fullscreenGraph', help: 'G' },
        { id: 'help', when: (e) => key(e, '?') || (e.shiftKey && key(e, '/')), action: 'openHelp', help: '?' },
        // Escape closes help only (let other Esc handlers elsewhere continue to work)
        { id: 'escape', when: (e) => key(e, 'Escape'), action: (e) => { const host = document.getElementById('kb-help'); if (host && !host.hidden) { e.preventDefault(); actions.closeHelp(); } }, inEditable: true }
    ];

    // --- Help panel (built from `bindings` so it never drifts)
    function ensureKbHelp() {
        let host = document.getElementById('kb-help');
        if (host) return host;

        host = h('div', { id: 'kb-help', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Keyboard shortcuts', hidden: true, tabIndex: '-1' });
        const panel = h('div', { class: 'panel' });
        const title = h('h2', { textContent: 'Keyboard shortcuts' });
        const closeBtn = h('button', { type: 'button', class: 'close', title: 'Close', 'aria-label': 'Close help', textContent: '✕', onclick: () => actions.closeHelp() });
        const header = h('header', {}, [title, closeBtn]);

        const items = [
        { desc: 'Focus search', ids: ['search-slash', 'search-ctrlk', 'search-s'] },
        { desc: 'Toggle header (breadcrumbs)', ids: ['crumb'] },
        { desc: 'Toggle left sidebar (pages & search)', ids: ['left'] },
        { desc: 'Toggle right sidebar (graph & ToC)', ids: ['right'] },
        { desc: 'Cycle theme (light / dark)', ids: ['theme'] },
        { desc: 'Toggle fullscreen graph', ids: ['graph'] },
        { desc: 'Close panels & overlays', keys: ['Esc'] },
        { desc: 'Show this help panel', ids: ['help'] }
        ];

        const list = h('ul');
        const kb = (s) => `<kbd>${s}</kbd>`;

        for (const { desc, ids, keys } of items) {
        const li = h('li');
        const left = h('span', { class: 'desc', textContent: desc });
        let rightHTML = '';
        if (keys) {
            rightHTML = keys.map(kb).join(', ');
        } else if (ids) {
            const shows = ids
            .map((id) => bindings.find((b) => b.id === id)?.help)
            .filter(Boolean);
            rightHTML = shows.map(kb).join(', ');
        }
        const right = h('span', { innerHTML: rightHTML });
        li.append(left, right);
        list.append(li);
        }

        panel.append(header, list);
        host.append(panel);
        document.body.appendChild(host);
        return host;
    }

    function openHelp() {
        const host = ensureKbHelp();
        window.openHelp = openHelp; // expose for external triggers
        host.hidden = false;
        // Focus trap & return focus to opener
        _helpOpener = document.activeElement;
        const focusables = host.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])');
        const first = focusables[0], last = focusables[focusables.length - 1];
        host.addEventListener('keydown', (e) => {
            if (e.key !== 'Tab') return;
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        });
        (first || host).focus();
    }

    function closeHelp() {
        const host = document.getElementById('kb-help');
        if (host) host.hidden = true;
        _helpOpener?.focus?.();
    }

    // --- Global keydown handler
    addEventListener('keydown', (e) => {
        const tgt = e.target;

        // If typing in an editable control, allow only bindings explicitly marked for it
        if (isEditable(tgt)) {
        for (const b of bindings) {
            if (!b.inEditable) continue;
            if (b.when(e)) {
            e.preventDefault();
            typeof b.action === 'string' ? actions[b.action]() : b.action(e);
            return;
            }
        }
        return; // ignore the rest while editing
        }

        for (const b of bindings) {
        if (b.when(e)) {
            e.preventDefault();
            typeof b.action === 'string' ? actions[b.action]() : b.action(e);
            return;
        }
        }
    }, { capture: true });

    // --- Open help via icon
    $kbIcon?.addEventListener('click', (e) => { e.preventDefault(); actions.openHelp(); });

    // --- Close help on click outside the panel
    document.addEventListener('click', (e) => {
        const host = document.getElementById('kb-help');
        if (!host || host.hidden) return;
        if (e.target === host) actions.closeHelp();
    });
    })();

    // ===== Desktop-only panel toggles and condensed reset =====
    (function desktopPanelToggles() {
        const MQ_DESKTOP = window.matchMedia('(min-width: 1000px), (orientation: landscape)');
        const ROOT = document.body;

        function isCondensed() {
            return !MQ_DESKTOP.matches;
        }

        function setHidden(flag, cls, region) {
            ROOT.classList.toggle(cls, !!flag);
            if (region) {
                region.setAttribute('aria-hidden', flag ? 'true' : 'false');
            }
        }

        // Hooks for shortcuts
        window.__kmToggleSidebar = () => setHidden(!ROOT.classList.contains('hide-sidebar'), 'hide-sidebar', $('#sidebar'));
        window.__kmToggleUtil = () => setHidden(!ROOT.classList.contains('hide-util'), 'hide-util', $('#util'));
        window.__kmToggleCrumb = () => setHidden(!ROOT.classList.contains('hide-crumb'), 'hide-crumb', $('#crumb'));

        // Reset when entering condensed view to avoid conflicts
        function resetForCondensed() {
            ROOT.classList.remove('hide-sidebar', 'hide-util', 'hide-crumb');
            $('#sidebar')?.setAttribute('aria-hidden', 'false');
            $('#util')?.setAttribute('aria-hidden', 'false');
            $('#crumb')?.setAttribute('aria-hidden', 'false');
        }

        // Observe viewport changes
        MQ_DESKTOP.addEventListener('change', () => {
            if (isCondensed()) resetForCondensed();
        });

        // Button next to watermark opens help
        $('#kb-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            const open = (window.openHelp || (() => {}));
            open();
        });

        // Expose for other modules if needed
        window.__kmIsCondensed = isCondensed;
        window.__kmResetForCondensed = resetForCondensed;
    })();

    // Preload HLJS core when the main thread is likely idle to improve UX later.
    whenIdle(() => {
        KM.ensureHighlight();
    });
}

/* ──────────────────────────────── boot ─────────────────────────────────── */
// IIFE boot sequence: fetch MD, parse, compute structure, then render UI.
(async () => {
    try {
        if (!MD) throw new Error('CONFIG.MD is empty.');
        // Abort fetch on slow networks to avoid hanging the UI.
        let txt;
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort('fetch-timeout'), 20000);

        const cached = CACHE_MIN > 0 ? readCache(MD) : null;
        const freshEnough = cached && (Date.now() - cached.ts) <= CACHE_MIN * 60_000;

        // Use cached content if within TTL; otherwise fetch and update cache.
        // If fetch fails but we have *any* cached copy (even stale), fall back to it.
        try {
            if (freshEnough) {
                txt = cached.txt;
            } else {
                const r = await fetch(MD, {
                    cache: 'no-cache',
                    signal: ctrl.signal
                });
                clearTimeout(timeout);
                if (!r.ok) throw new Error(`Failed to fetch MD (${r.status})`);
                txt = await r.text();
                if (CACHE_MIN > 0) writeCache(MD, txt);
            }
        } catch (err) {
            clearTimeout(timeout);
            if (cached?.txt) {
                console.warn('Network failed; using stale cached Markdown');
                txt = cached.txt;
            } else {
                throw err; // no cache to fall back to → bubble up to error UI
            }
        }

        parseMarkdownBundle(txt);
        attachSecondaryHomes();
        computeHashes();

        await domReady();
        initUI();

        // Nudge the graph to highlight the current node after first layout.
        await new Promise(res => setTimeout(res, 120));
        highlightCurrent(true);
    } catch (err) {
        // Render a compact diagnostic message in the content area.
        console.warn('Markdown load failed:', err);
        const elc = $('#content');
        if (elc) elc.innerHTML = `<h1>Content failed to load</h1><p>Could not fetch or parse the Markdown bundle. Check <code>window.CONFIG.MD</code> and network access.</p><pre>${String(err?.message || err)}</pre>`;
    }
})();
