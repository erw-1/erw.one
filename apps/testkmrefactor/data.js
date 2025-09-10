// data.js: Contains config parsing, data models, routing, and search logic for the static wiki SPA.
import { $, el, escapeRegex, baseURLNoHash } from './helpers.js';

/* ───────────────────────────── Config Parsing ───────────────────────────── */
// The configuration is provided in an inline <script id="km-config" type="text/ketting"> block.
const CFG_EL = document.getElementById('km-config');
const CFG = CFG_EL ? (JSON.parse(CFG_EL.textContent || '{}') || {}) : {};
// Destructure known config options with defaults
const { 
    TITLE = 'Wiki',          // Site title
    MD = '',                // URL of the concatenated Markdown bundle
    LANGS = [],             // Languages to load for syntax highlighting
    DEFAULT_THEME,          // Optional default theme ('dark' or 'light')
    ACCENT,                 // Optional accent color (CSS hex or name)
    ALLOW_JS_FROM_MD,       // Allow inline scripts from Markdown (string "true")
    CACHE_MD                // Minutes to cache the Markdown bundle in localStorage
} = CFG;
// Compute cache TTL in minutes (falsy/0/NaN -> disabled)
const CACHE_MIN = Number(CACHE_MD) || 0;
// Cache key generator (bump version if parsing logic changes to invalidate old cache)
const CACHE_KEY = (url) => `km:md:v2:${url}`;

/** Read cached Markdown text from localStorage (returns object with ts and txt or null). */
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

/** Write Markdown text to cache with current timestamp. */
function writeCache(url, txt) {
    try {
        localStorage.setItem(CACHE_KEY(url), JSON.stringify({ ts: Date.now(), txt }));
    } catch {}
}

/* ───────────────────────────── Data Model ───────────────────────────── */
// Page and section data structures (with additional fields for search and routing).
/**
 * @typedef {Object} Section
 * @property {string} id     - Stable heading id (e.g., "1_2_1" for a third-level section)
 * @property {string} txt    - Heading text
 * @property {string} body   - Body text under this heading (markdown content)
 * @property {string} search - Lowercased text (title + body) used for search matching
 */

/**
 * @typedef {Object} Page
 * @property {string} id
 * @property {string} title
 * @property {Page|null} parent
 * @property {Set<string>} tagsSet
 * @property {string} content   - Full markdown content of the page (excluding metadata comment)
 * @property {Page[]} children  - Child pages in hierarchy
 * @property {Section[]} sections - Sections extracted from content (for deep linking and search)
 * @property {boolean} [isSecondary] - Flag for pages promoted to root level (detached clusters)
 * @property {number}  [_i]     - Internal index (for graph use)
 * @property {string}  [hash]   - Precomputed hash fragment for this page ("" for root)
 * @property {string}  [titleL] - Lowercased title (for search)
 * @property {string}  [tagsL]  - Lowercased tags (for search)
 * @property {string}  [bodyL]  - Lowercased body (for search)
 * @property {string}  [searchStr] - Combined searchable string (titleL + tagsL + bodyL)
 */

// Internal data containers
let pages = [];                // Array of Page objects
let byId = new Map();          // Map from page.id to Page object
let root = null;               // Reference to the root (home) page
const descMemo = new Map();    // Memoization for descendant counts (for attachSecondaryHomes)

/** 
 * Parse a concatenated Markdown bundle into the in-memory page graph.
 * Expects the bundle to contain multiple pages separated by metadata comments:
 *   <!--id:"some-id" title:"Some Title" parent:"parent-id" tags:"tag1,tag2"...-->
 *   (Markdown content for that page)
 * Repeats for each page in the bundle.
 * [INVARIANT] Each page id must be unique. If no pages are parsed, an error is thrown.
 */
function parseMarkdownBundle(txt) {
    // Reset state to allow re-parsing without stale data
    pages = [];
    byId = new Map();
    root = null;
    descMemo.clear();
    // Note: If a page HTML cache exists in another module, it should be cleared here.

    // Greedy regex: capture metadata comment and following body up to next metadata or EOF.
    const pagePattern = /<!--([\s\S]*?)-->\s*([\s\S]*?)(?=<!--|$)/g;
    const matches = txt.matchAll(pagePattern);
    for (const [, hdr, body] of matches) {
        const meta = {};
        // Parse key:"value" pairs inside the metadata comment
        hdr.replace(/(\w+):"([^"]+)"/g, (_, k, v) => { meta[k] = v.trim(); });
        // Create Page object with parsed metadata and content
        const page = {
            id: meta.id,
            title: meta.title,
            parent: meta.parent,
            tags: meta.tags,
            content: (body || '').trim(),
            children: [],
            sections: []
        };
        pages.push(page);
        byId.set(page.id, page);
    }
    if (!pages.length) {
        throw new Error('No pages parsed from Markdown bundle.');
    }
    // Determine root page: prefer explicit "home", otherwise use the first page
    root = byId.get('home') || pages[0];

    // Link parent-child relationships and precompute lowercase search strings
    pages.forEach(p => {
        if (p !== root) {
            const parentPage = byId.get((p.parent || '').trim());
            p.parent = parentPage || null;
            if (parentPage) parentPage.children.push(p);
        } else {
            p.parent = null;
        }
        // Prepare tag set and lowercase fields for searching
        p.tagsSet = new Set((p.tags || '').split(',').map(s => s.trim()).filter(Boolean));
        p.titleL = (p.title || '').toLowerCase();
        p.tagsL  = [...p.tagsSet].join(' ').toLowerCase();
        p.bodyL  = (p.content || '').toLowerCase();
        p.searchStr = `${p.titleL} ${p.tagsL} ${p.bodyL}`;
    });

    // Extract sections (headings and their bodies) for each page, including searchable text for each section
    const RE_FENCE = /^(?:```|~~~)/;                 // code fence (``` or ~~~)
    const RE_HEADING = /^(#{1,6})\s+/;               // markdown heading (1-6 # followed by space)
    const RE_HEADING_FULL = /^(#{1,6})\s+(.+)/;      // captures level and heading text
    pages.forEach(p => {
        const sections = [];
        const counters = [0, 0, 0, 0, 0, 0];  // heading counters for each level (to generate section ids)
        let inFence = false;
        let offset = 0;
        let currentSec = null;
        for (const line of p.content.split(/\r?\n/)) {
            if (RE_FENCE.test(line)) {
                inFence = !inFence;
            }
            if (!inFence && RE_HEADING.test(line)) {
                // If we were tracking a previous section, finalize it with body content
                if (currentSec) {
                    currentSec.body = p.content.slice(currentSec.bodyStart, offset).trim();
                    currentSec.search = (currentSec.txt + ' ' + currentSec.body).toLowerCase();
                    sections.push(currentSec);
                }
                // Start a new section for this heading
                const [, hashes, txt] = line.match(RE_HEADING_FULL);
                const level = hashes.length - 1; // 0-based level (H1 -> 0, H2 -> 1, ...)
                counters[level]++;               // increment this level counter
                for (let i = level + 1; i < 6; i++) counters[i] = 0; // reset deeper level counters
                currentSec = {
                    id: counters.slice(0, level + 1).filter(Boolean).join('_'),
                    txt: txt.trim(),
                    bodyStart: offset + line.length + 1
                };
            }
            offset += line.length + 1; // account for the newline character
        }
        // Capture the final section (if the last line was a heading or content after it)
        if (currentSec) {
            currentSec.body = p.content.slice(currentSec.bodyStart).trim();
            currentSec.search = (currentSec.txt + ' ' + currentSec.body).toLowerCase();
            sections.push(currentSec);
        }
        p.sections = sections;
    });

    // Attach secondary home pages for large isolated clusters (promote representative pages to root level)
    attachSecondaryHomes();
    // Compute hash fragment for each page (based on its ancestry path)
    computeHashes();
    // Build link and backlink mappings, and tag index
    buildLinkMaps();
}

/** Count total descendants of a page (children + grandchildren...). Memoized for efficiency. */
function descendants(page) {
    if (descMemo.has(page)) return descMemo.get(page);
    let count = 0;
    (function recurse(node) {
        node.children.forEach(child => { 
            count++;
            recurse(child);
        });
    })(page);
    descMemo.set(page, count);
    return count;
}

/**
 * Promote one representative page from each disconnected hierarchy cluster to become a direct child of root.
 * This ensures deep, isolated trees remain discoverable via the root page.
 */
function attachSecondaryHomes() {
    const topOf = p => {
        while (p.parent) p = p.parent;
        return p;
    };
    const clusters = new Map(); // Map of top-level node -> all pages in that cluster
    for (const p of pages) {
        const top = topOf(p);
        if (top === root) continue;
        if (!clusters.has(top)) clusters.set(top, []);
        clusters.get(top).push(p);
    }
    let clusterId = 0;
    for (const [top, members] of clusters) {
        // Choose the page with the largest subtree as representative
        const rep = members.reduce((a, b) => (descendants(b) > descendants(a) ? b : a), members[0]);
        if (!rep.parent) {
            // Promote representative once per cluster
            rep.parent = root;
            rep.isSecondary = true;
            rep.clusterId = clusterId++;
            root.children.push(rep);
        }
    }
}

/** Compute URL hash fragment (deep link) for each page and store in page.hash (empty string for root). */
function computeHashes() {
    pages.forEach(p => {
        const segments = [];
        for (let node = p; node && node.parent; node = node.parent) {
            segments.unshift(node.id);
        }
        p.hash = segments.join('#');  // e.g., "grandparent#parent#child"
    });
}

/** Return the precomputed hash fragment for a given page ("" for root). */
const hashOf = page => page ? (page.hash || '') : '';

/** Resolve an array of ID segments (e.g., ['parent','child']) to a Page object. Returns the deepest valid page found. */
function find(segments) {
    let node = root;
    for (const id of segments) {
        const next = node.children.find(child => child.id === id);
        if (!next) break;
        node = next;
    }
    return node;
}

/** Navigate to a page by updating window.location.hash (for internal use or external links). */
function nav(page) {
    if (page) {
        location.hash = '#' + hashOf(page);
    }
}

/* ───────────────────────────── Routing Utilities ───────────────────────────── */
/**
 * Parse a hash or URL to a target page and anchor.
 * Accepts a full URL or a hash fragment (starting with '#').
 * Returns an object { page, anchor }, or null if the page part is invalid.
 * - For an empty hash or missing hash, returns { page: root, anchor: '' }.
 * - If the hash looks like only an anchor (no valid page id), returns { page: root, anchor: '<anchor>' }.
 */
function parseTarget(hashOrHref = location.hash) {
    // Normalize to just a hash fragment string
    const href = (hashOrHref || '').startsWith('#')
        ? hashOrHref 
        : new URL(hashOrHref, location.href).hash;
    if (!href || href === '#') {
        return { page: root, anchor: '' };
    }
    // Split on '#' and filter out any empty segments
    const segments = href.slice(1).split('#').filter(Boolean);
    const page = segments.length ? find(segments) : root;
    const baseHash = hashOf(page);
    const baseSegments = baseHash ? baseHash.split('#') : [];
    // If the hash segments did not resolve beyond root, treat all segments as an anchor on root
    if (segments.length && baseSegments.length === 0) {
        return { page: root, anchor: segments.join('#') };
    }
    // Any extra segments beyond the page's own hash are treated as the in-page anchor
    const anchor = segments.slice(baseSegments.length).join('#');
    return { page, anchor };
}

/**
 * Check if a given link (element or href string) is an internal page link in this wiki.
 * Returns true if the link's href points to a valid page in our data, false otherwise.
 */
function linkIsInternal(link) {
    const href = typeof link === 'string' ? link : (link?.getAttribute('href') || '');
    return !!parseTarget(href);
}

/**
 * Resolve an internal link (hash fragment or URL) to the target Page object.
 * Returns the Page if found, or null if the link does not point to a valid page.
 */
function resolveLink(hashOrHref) {
    const target = parseTarget(hashOrHref);
    return target ? target.page : null;
}

/**
 * Get the Page corresponding to the current window.location.hash (or a provided hash).
 * Convenience wrapper around parseTarget to retrieve only the page.
 */
function getPageFromHash(hash = location.hash) {
    const t = parseTarget(hash);
    return t ? t.page : null;
}

/* ───────────────────────────── Link, Backlink, and Tag Maps ───────────────────────────── */
const PAGES = {};       // Map of page.id -> Page object
const LINKS = {};       // Map of page.id -> Array of Page objects that this page links to
const BACKLINKS = {};   // Map of page.id -> Array of Page objects that link to this page
const TAGS = {};        // Map of tag name -> Array of Page objects that have this tag

/**
 * Build or update the LINKS, BACKLINKS, and TAGS structures based on current pages content.
 * Should be called after pages and hashes are computed.
 */
function buildLinkMaps() {
    // Initialize all entries
    pages.forEach(p => {
        LINKS[p.id] = [];
        BACKLINKS[p.id] = [];
    });
    // For each page, scan its content for internal page links
    pages.forEach(srcPage => {
        // Use a regex to find markdown link targets of the form "(#...)" in the content
        const linkPattern = /\]\(#([^)]+)\)/g;
        const content = srcPage.content;
        let match;
        while ((match = linkPattern.exec(content)) !== null) {
            const targetStr = match[1]; // the part after '#' and before ')'
            const t = parseTarget('#' + targetStr);
            if (!t) continue;
            const destPage = t.page;
            // Ignore purely local anchors (links that resolve to the same page)
            if (!destPage || destPage === srcPage) continue;
            // Ignore footnote or internal anchors (starting with "fn" etc.) that don't indicate page links
            if (t.anchor && destPage === root && !byId.has(targetStr.split('#')[0])) continue;
            // Record the link and backlink
            LINKS[srcPage.id].push(destPage);
            BACKLINKS[destPage.id].push(srcPage);
        }
    });
    // Build tag index: map each tag to pages that have it
    pages.forEach(p => {
        for (const tag of p.tagsSet) {
            if (!TAGS[tag]) TAGS[tag] = [];
            TAGS[tag].push(p);
        }
    });
    // Populate PAGES mapping (id -> Page)
    Object.keys(PAGES).forEach(k => delete PAGES[k]); // clear existing entries
    byId.forEach((page, id) => {
        PAGES[id] = page;
    });
}

/* ───────────────────────────── Search Index & Search Utilities ───────────────────────────── */
// Weight factors for search ranking (can be tuned)
const WEIGHTS = {
    title: 5,
    tag: 3,
    body: 1,
    secTitle: 3,
    secBody: 1,
    phraseTitle: 5,
    phraseBody: 2,
    secCountCap: 4
};

/**
 * Compute the relevance score of a page for a given query (tokens and optional phrase).
 * Returns an object with total score and any matching sections (with their scores) for the page,
 * or null if the page does not match all tokens.
 */
function searchScore(page, tokens, tokenRegexes, phrase) {
    // Quick pre-filter: all tokens must appear somewhere in the page's combined searchable text
    if (!tokens.every(tok => page.searchStr.includes(tok))) {
        return null;
    }
    let score = 0;
    // Per-token scoring (word boundaries to avoid partial matches)
    for (const regex of tokenRegexes) {
        if (regex.test(page.titleL)) score += WEIGHTS.title;
        if (regex.test(page.tagsL))  score += WEIGHTS.tag;
        if (regex.test(page.bodyL))  score += WEIGHTS.body;
    }
    // Multi-word exact phrase bonus
    if (phrase) {
        if (page.titleL.includes(phrase)) score += WEIGHTS.phraseTitle;
        else if (page.bodyL.includes(phrase)) score += WEIGHTS.phraseBody;
    }
    // Check each section for matches
    const matchedSecs = [];
    for (const sec of page.sections) {
        if (!tokens.every(tok => sec.search.includes(tok))) continue;
        const secTitle = sec.txt.toLowerCase();
        const secBody = sec.body.toLowerCase();
        let secScore = 0;
        for (const regex of tokenRegexes) {
            if (regex.test(secTitle)) secScore += WEIGHTS.secTitle;
            if (regex.test(secBody))  secScore += WEIGHTS.secBody;
        }
        if (phrase && (secTitle.includes(phrase) || secBody.includes(phrase))) {
            secScore += 1;
        }
        matchedSecs.push({ sec, score: secScore });
    }
    // Sort sections by descending score
    matchedSecs.sort((a, b) => b.score - a.score);
    // Small boost for pages with many matching sections
    score += Math.min(WEIGHTS.secCountCap, matchedSecs.length);
    return { score, matchedSecs };
}

/**
 * Perform a search query over all pages and update the results list in the DOM.
 * - Searches titles, tags, and content (including individual sections).
 * - Ranks results using weighted term frequency and phrase matching.
 * - Displays matching section anchors under each page result.
 */
function search(query) {
    const resUL = $('#results');
    const treeUL = $('#tree');
    if (!resUL || !treeUL) return;
    const q = query.trim().toLowerCase();
    resUL.setAttribute('aria-live', 'polite');
    resUL.setAttribute('aria-busy', 'true');
    if (!q) {
        // Empty query: hide results and show page tree
        resUL.style.display = 'none';
        resUL.innerHTML = '';
        treeUL.style.display = '';
        resUL.setAttribute('aria-busy', 'false');
        return;
    }
    const tokens = q.split(/\s+/).filter(t => t.length >= 2);
    const tokenRegexes = tokens.map(t => new RegExp('\\b' + escapeRegex(t) + '\\b'));
    const phrase = tokens.length > 1 ? q : null;
    resUL.innerHTML = '';
    resUL.style.display = '';
    treeUL.style.display = 'none';

    const results = [];
    for (const p of pages) {
        const result = searchScore(p, tokens, tokenRegexes, phrase);
        if (!result) continue;
        results.push({ page: p, score: result.score, matchedSecs: result.matchedSecs });
    }
    // Sort results by score (desc), then by title alphabetically for equal scores
    const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
    results.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return collator.compare(a.page.title, b.page.title);
    });
    // Render results list
    const frag = document.createDocumentFragment();
    for (const { page: p, matchedSecs } of results) {
        const pageLink = el('a', { href: '#' + hashOf(p), textContent: p.title });
        const li = el('li', { class: 'page-result' }, [ pageLink ]);
        if (matchedSecs.length) {
            const base = hashOf(p);
            const subList = el('ul', { class: 'sub-results' });
            matchedSecs.forEach(({ sec }) => {
                const secLink = el('a', {
                    href: '#' + (base ? base + '#' : '') + sec.id,
                    textContent: sec.txt
                });
                subList.append(el('li', { class: 'heading-result' }, [ secLink ]));
            });
            li.append(subList);
        }
        frag.append(li);
    }
    resUL.append(frag);
    if (!resUL.children.length) {
        resUL.innerHTML = '<li id="no_result">No result</li>';
    }
    resUL.setAttribute('aria-busy', 'false');
}

/* ───────────────────────────── Module Exports ───────────────────────────── */
export {
    // Config values
    CFG,
    TITLE,
    MD,
    LANGS,
    DEFAULT_THEME,
    ACCENT,
    ALLOW_JS_FROM_MD,
    CACHE_MIN,
    // Cache functions
    readCache,
    writeCache,
    // Data and models
    PAGES,
    LINKS,
    BACKLINKS,
    TAGS,
    pages,    // array of Page objects
    byId,     // Map of id -> Page
    root,
    // Parsing and indexing
    parseMarkdownBundle,
    descendants,
    // Routing and linking
    hashOf,
    find,
    nav,
    parseTarget,
    linkIsInternal,
    resolveLink,
    getPageFromHash,
    // Search
    search,
    searchScore
};
