/* *********************************************************************
   SECTION 0 • MICRO-NAMESPACE SETUP
   All library shims, DOM helpers and constants live inside one global
   object KM so we never collide with other scripts/extensions.
************************************************************************ */

/**
 * Global namespace: everything attaches here so dev-tools autocompletion
 * can reveal the entire public API in one go. Feel free to browse it via
 * console.dir(window.KM).
 *
 * @namespace KM
 * @property {Object}  d3              Selected D3 sub-modules re-exported
 * @property {Function}ensureHighlight Lazy loader for highlight.js subset
 * @property {Function}ensureMarkdown  Lazy loader for marked + alert & footnotes extensions
 * @property {Function}ensureKatex     Lazy loader for KaTeX auto-render
 */
window.KM = {};

/* Single-letter DOM shorthands ------------------------------------------------
   querySelector / querySelectorAll without the hand-cramp. These survive the
   refactor unchanged because they’re ubiquitous later on.                     */
const $ = (s, c = document) => (c).querySelector(s);
const $$ = (s, c = document) => [...(c).querySelectorAll(s)];
Object.assign(KM, {
    $,
    $$
});

/* *********************************************************************
   SECTION 1 • D3 MICRO-BUNDLE + HIGHLIGHT.JS LOADER
************************************************************************ */
// --- 1-A  D3: lazy-import → download only if the mini-graph is shown -------
KM.ensureD3 = (() => {
    let ready;
    return function ensureD3() {
        if (ready) return ready;
        ready = (async () => {
            const sel   = await import('https://cdn.jsdelivr.net/npm/d3-selection@3/+esm');
            const force = await import('https://cdn.jsdelivr.net/npm/d3-force@3/+esm');
            const drag  = await import('https://cdn.jsdelivr.net/npm/d3-drag@3/+esm');
            KM.d3 = {
                select: sel.select,
                selectAll: sel.selectAll,
                forceSimulation: force.forceSimulation,
                forceLink: force.forceLink,
                forceManyBody: force.forceManyBody,
                forceCenter: force.forceCenter,
                drag: drag.drag
            };
        })();
        return ready;
    };
})();

// --- 1-B  highlight.js on-demand --------------------------------------
/**
 * Loads highlight.js once and registers only the languages requested in
 * `CONFIG.LANGS` (see config.js).
 *
 * @returns {Promise<void>} Resolves when `window.hljs` is ready
 */
KM.ensureHighlight = (() => {
    let ready; // memoised singleton Promise
    return function ensureHighlight() {
        if (ready) return ready; // already inflight or done ✔

        ready = (async () => {
            const {
                LANGS = []
            } = window.CONFIG;
            const core = await import('https://cdn.jsdelivr.net/npm/highlight.js@11/es/core/+esm');
            const hljs = core.default;
            await Promise.all(
                LANGS.map(async lang => {
                    const mod = await import(`https://cdn.jsdelivr.net/npm/highlight.js@11/es/languages/${lang}/+esm`);
                    hljs.registerLanguage(lang, mod.default);
                })
            );
            window.hljs = hljs; // expose globally for devtools convenience
        })();

        return ready;
    };
})();

/* ***********************************************************************
   SECTION 1.5 • MARKED / KaTeX LAZY-LOADERS
*********************************************************************** */
let mdReady = null; // will hold the Promise so we don’t import twice

/**
 * Ensures marked and DOMPurify are available, combined into a tiny API.
 * @returns {Promise<{parse:Function}>}
 */
KM.ensureMarkdown = () => {
    if (mdReady) return mdReady;

    mdReady = Promise.all([
        import('https://cdn.jsdelivr.net/npm/marked@5/lib/marked.esm.min.js'),
        import('https://cdn.jsdelivr.net/npm/marked-footnote/dist/index.umd.min.js'),
        import('https://cdn.jsdelivr.net/npm/marked-alert/dist/index.umd.min.js'),
    ]).then(([marked, footnote]) => {
        const md = new marked.Marked().use(markedFootnote()).use(markedAlert());
        return {
            parse: (src, opt) => md.parse(src, {
                ...opt,
                mangle: false
            })
        };
    });

    return mdReady;
};



/**
 * Loads KaTeX auto-render bundle if needed (detected per page).
 * @returns {Promise<void>}
 */
KM.ensureKatex = (() => {
    let ready;
    return function ensureKatex() {
        if (ready) return ready;
        ready = import('https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.mjs')
            .then(mod => {
                window.renderMathInElement = mod.default;
            });
        return ready;
    };
})();

/* *********************************************************************
   SECTION 2 • CONFIG EXTRACTION
************************************************************************ */
const {
    TITLE,
    MD
} = window.CONFIG;

// Kick off parallel downloads so they overlap with Markdown fetch
void KM.ensureMarkdown();
void KM.ensureHighlight();


/* *********************************************************************
   SECTION 4 • IN-MEMORY WIKI DATABASE
************************************************************************ */
const pages = []; // flat list of every article
const byId = new Map(); // quick lookup: id → page object
let root = null; // defined after Markdown fetch resolves

// Fetch the bundled Markdown (compiled via build-script or manual c&p) -----
fetch(MD)
    .then(res => res.text())
    .then(parseMarkdownBundle)
    .then(attachSecondaryHomes)
    .then(initUI)
    .then(() => new Promise(resolve => setTimeout(resolve, 50)))
    .then(highlightCurrent);

/**
 * Parses the comment-delimited Markdown bundle produced by the build script.
 * Adds per-page helpers:
 *   page.id       : string
 *   page.title    : string
 *   page.parent   : string|null     (id)
 *   page.children : Page[]
 *   page.tags     : CSV string
 *   page.tagsSet  : Set<string>
 *   page.searchStr: lower-cased blob (title + tags + body)
 *   page.sections : [{ id, txt, body, search }]
 *
 * Headings inside fenced code-blocks (``` / ~~~) are ignored
 */
function parseMarkdownBundle(txt) {
    /* ── 0. Split bundle into individual pages ─────────────────────────── */
    for (const [, hdr, body] of txt.matchAll(/<!--([\s\S]*?)-->\s*([\s\S]*?)(?=<!--|$)/g)) {
        const meta = {};
        hdr.replace(/(\w+):"([^"]+)"/g, (_, k, v) => (meta[k] = v.trim()));
        pages.push({
            ...meta,
            content: body.trim(),
            children: []
        });
    }

    /* ── 1. Lookup helpers ─────────────────────────────────────────────── */
    pages.forEach(p => byId.set(p.id, p));
    root = byId.get('home') || pages[0];

    /* ── 2. Parent / child wiring ──────────────────────────────────────── */
    pages.forEach(p => {
        const par = byId.get((p.parent || '').trim());
        if (par) {
            p.parent = par;
            par.children.push(p);
        } else {
            p.parent = null;
        }
    });

    /* ── 3. Tag sets + fast page-level search blob ─────────────────────── */
    pages.forEach(p => {
        p.tagsSet = new Set((p.tags || '').split(',').filter(Boolean));
        p.searchStr = (
            p.title + ' ' + [...p.tagsSet].join(' ') + ' ' +
            p.content
        ).toLowerCase();
    });

    /* ── 4. Section index (deferred with requestIdleCallback) ───────────
   We no longer precompute sections for every page during startup.
   They are built for the current page immediately, and for others lazily
   (or on first search). */
    pages.forEach(p => {
        p.sections = null; // will be populated on demand
    });

}
/* ========= Deferred section indexing helpers ============================= */
/** Build fence-aware section index for a single page on demand. */
function indexSections(page) {
    if (page.sections) return page.sections;

    const counters = [0, 0, 0, 0, 0, 0]; // outline numbers
    const sections = [];
    let inFence = false;
    let offset = 0; // running char-offset
    let prev = null; // previous heading bucket

    for (const line of page.content.split(/\r?\n/)) {
        const fenceHit = /^(?:```|~~~)/.test(line);
        if (fenceHit) inFence = !inFence;

        if (!inFence && /^(#{1,5})\s+/.test(line)) {
            // flush previous heading’s body
            if (prev) {
                prev.body = page.content.slice(prev.bodyStart, offset).trim();
                prev.search = (prev.txt + ' ' + prev.body).toLowerCase();
                sections.push(prev);
            }

            const [, hashes, txt] = line.match(/^(#{1,5})\s+(.+)/);
            const level = hashes.length - 1;
            counters[level]++;
            for (let i = level + 1; i < 6; i++) counters[i] = 0;

            prev = {
                id: counters.slice(0, level + 1).filter(Boolean).join('_'),
                txt: txt.trim(),
                bodyStart: offset + line.length + 1 // start of the body
            };
        }

        offset += line.length + 1; // +1 for the newline we split on
    }

    // flush the last section
    if (prev) {
        prev.body = page.content.slice(prev.bodyStart).trim();
        prev.search = (prev.txt + ' ' + prev.body).toLowerCase();
        sections.push(prev);
    }

    page.sections = sections;
    return sections;
}

/** Queue up background indexing for all pages except the current one. */
let _sectionIdleQueue = null;
function scheduleLazySectionIndexing(currentPage) {
    if (_sectionIdleQueue) return; // already scheduled
    const queue = pages.filter(p => p !== currentPage && !p.sections).slice();
    if (!queue.length) return;
    _sectionIdleQueue = true;

    const pump = () => {
        const next = queue.shift();
        if (!next) return;
        const work = () => {
            try { indexSections(next); } catch (e) {}
            if (queue.length) {
                if ('requestIdleCallback' in window) {
                    requestIdleCallback(() => pump(), { timeout: 1000 });
                } else {
                    setTimeout(pump, 50);
                }
            }
        };
        if ('requestIdleCallback' in window) {
            requestIdleCallback(work, { timeout: 800 });
        } else {
            setTimeout(work, 0);
        }
    };
    pump();
}

/**
 * Finds orphaned page-clusters and promotes one page per cluster to act as a
 * «secondary home».  The chosen page becomes a **direct child of root** so it
 * appears as a new top-level group in the sidebar.
 */
function attachSecondaryHomes() {
    /* Find the forest of top-level roots (pages without parents) */
    const roots = pages.filter(p => !p.parent);

    /* Build connected components (clusters) */
    const clusters = new Map(); // rep → Set(members)
    roots.forEach(top => {
        const set = new Set([top]);
        const walk = p => {
            p.children.forEach(ch => {
                set.add(ch);
                walk(ch);
            });
        };
        walk(top);
        clusters.set(top, set);
    });

    // If we only have a single root, nothing to do --------------------------
    if (clusters.size <= 1) return;

    /* pick the page with the most descendants as the representative */
    let cid = 1;
    const descCount = page => {
        let n = 0;
        (function rec(x) {
            x.children.forEach(c => {
                n++;
                rec(c);
            });
        })(page);
        return n;
    };

    clusters.forEach((members, top) => {
        const rep = members.reduce((a, b) => descCount(b) > descCount(a) ? b : a, top);
        if (!rep.parent) {
            rep.parent = root; // for routing + sidebar only
            rep.isSecondary = true;
            rep.clusterId = cid++;
            root.children.push(rep);
        }
    });
}

/* *********************************************************************
   SECTION 5 • URL HELPERS & ROUTING UTILITIES
************************************************************************ */
/**
 * Transforms a page object into its URL hash, e.g. `a#b#c`.
 * This matches the breadcrumb and sidebar routing scheme.
 */
const hashOf = p => {
    const segs = [];
    for (let x = p; x && x !== root; x = x.parent) segs.push(x.id);
    segs.reverse();
    return segs.join('#');
};
KM.hashOf = hashOf;

/** Finds the deepest valid page for a hash path. */
const find = segs => {
    let n = root;
    for (const id of segs) {
        const c = n.children.find(k => k.id === id);
        if (!c) break;
        n = c;
    }
    return n;
};

/** Navigates to a page by mutating `location.hash`. */
const nav = page => (location.hash = '#' + hashOf(page));
KM.nav = nav; // expose for dev-tools

/* *********************************************************************
   SECTION 6 • UI BOOTSTRAP (controls, sidebar, search, theming)
************************************************************************ */
function initUI() {
    // --- 6-A  Static header tweaks -------------------------------------------
    $('#wiki-title-text').textContent = TITLE;
    document.title = TITLE;

    // --- 6-B  Sidebar tree ---------------------------------------------------
    buildTree();
    route();

    // --- 6-C  Mini-graph – lazy-initialised when scrolled into view ----------
    new IntersectionObserver((entries, obs) => {
        if (entries[0].isIntersecting) {
            buildGraph();
            obs.disconnect();
        }
    }, {
        rootMargin: '100px'
    }).observe($('#graph_box'));

    // --- 6-D  Search ---------------------------------------------------------
    const box = $('#search input');
    const clearBtn = $('#search .clear');
    let t = null;

    box.oninput = e => {
        clearTimeout(t);
        const q = e.target.value.trim();
        if (!q) {
            $('#results').style.display = 'none';
            $('#tree').style.display = '';
            return;
        }
        t = setTimeout(() => search(q.toLowerCase()), 90);
    };
    clearBtn.onclick = () => {
        box.value = '';
        $('#results').style.display = 'none';
        $('#tree').style.display = '';
        box.focus();
    };

    // --- 6-E  Sidebar burger (mobile) ---------------------------------------
    $('#burger').onclick = () => {
        document.body.classList.toggle('show-sidebar');
    };

    // --- 6-F  Util panel burger (mobile) ------------------------------------
    $('#burger_util').onclick = () => {
        document.body.classList.toggle('show-util');
    };

    // --- 6-G  Light/Dark theme toggle ---------------------------------------
    (() => {
        const btn = $('#theme_toggle');
        const media = window.matchMedia('(prefers-color-scheme: dark)');

        // initial state: localStorage > OS setting > default light
        let dark = localStorage.getItem('km-theme') === 'dark' ||
            (!localStorage.getItem('km-theme') && media.matches);

        apply(dark);

        btn.onclick = () => {
            dark = !dark;
            apply(dark);
            localStorage.setItem('km-theme', dark ? 'dark' : 'light');
        };

        // helper
        function apply(isDark) {
            document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
        }
    })();

    // --- 6-H  Hash routing ---------------------------------------------------
    window.addEventListener('hashchange', route);
}

/* *********************************************************************
   SECTION 7 • SIDEBAR TREE + SEARCH
************************************************************************ */
function buildTree() {
    const ul = $('#tree');
    ul.innerHTML = '';

    const primRoots = root.children.filter(r => !r.isSecondary)
        .sort((a, b) => a.title.localeCompare(b.title));
    const secRoots = root.children.filter(r => r.isSecondary)
        .sort((a, b) => a.clusterId - b.clusterId);

    const sep = () => {
        const li = document.createElement('li');
        li.className = 'group-sep';
        li.innerHTML = '<hr>';
        ul.appendChild(li);
    };

    const rec = (nodes, container, depth = 0) => {
        nodes.forEach(p => {
            const li = document.createElement('li');
            if (p.children.length) {
                const open = depth < 2;
                li.className = 'folder' + (open ? ' open' : '');
                const caret = document.createElement('button');
                caret.className = 'caret';
                caret.setAttribute('aria-expanded', String(open));
                caret.onclick = e => {
                    e.stopPropagation();
                    const t = li.classList.toggle('open');
                    caret.setAttribute('aria-expanded', t);
                    sub.style.display = t ? 'block' : 'none';
                };
                const lbl = document.createElement('a');
                lbl.className = 'lbl';
                lbl.dataset.page = p.id; // <── page-id hook
                lbl.href = '#' + hashOf(p);
                lbl.textContent = p.title;
                const sub = document.createElement('ul');
                rec(p.children.sort((a, b) => a.title.localeCompare(b.title)), sub, depth + 1);
                li.append(caret, lbl, sub);
                container.appendChild(li);
            } else {
                li.className = 'article';
                const a = document.createElement('a');
                a.dataset.page = p.id; // <── page-id hook
                a.href = '#' + hashOf(p);
                a.textContent = p.title;
                li.appendChild(a);
                container.appendChild(li);
            }
        });
    };

    rec(primRoots, ul);
    secRoots.forEach(r => {
        sep();
        rec([r], ul);
    });
}

/** Highlights the current page link in the sidebar (and expands parents). */
function highlightSidebar(page) {
    $('#tree .current')?.classList.remove('current');

    const a = $(`#tree a[data-page="${page.id}"]`);
    if (!a) return;

    a.classList.add('current');
    let li = a.parentElement;
    while (li && li.tagName !== 'UL') {
        if (li.classList.contains('folder')) {
            li.classList.add('open');
            li.querySelector('.caret').setAttribute('aria-expanded', 'true');
            li.querySelector('ul').style.display = 'block';
        }
        li = li.parentElement;
    }
}

/* ====== Search (page + section hits) ================================== */
function search(q) {
    const resUL = $('#results');
    const treeUL = $('#tree');

    if (!q.trim()) { // empty → show tree again
        resUL.style.display = 'none';
        treeUL.style.display = '';
        return;
    }

    const tokens = q.split(/\s+/).filter(t => t.length >= 2);
    resUL.innerHTML = '';
    resUL.style.display = '';
    treeUL.style.display = 'none';

    pages
        .filter(p => tokens.every(tok => p.searchStr.includes(tok)))
        .forEach(p => {
            /* top-level (page) result */
            const li = document.createElement('li');
            li.className = 'page-result';
            li.textContent = p.title;
            li.onclick = () => {
                nav(p);
                closePanels();
            };
            resUL.appendChild(li);

            /* ── sub-results: sections whose HEADING or BODY matches all tokens ─── */
            // ensure sections exist for this page before sub-match search
            indexSections(p);
            const subMatches = p.sections
                .filter(sec => tokens.every(tok => sec.search.includes(tok)));

            if (subMatches.length) {
                const subUL = document.createElement('ul');
                subUL.className = 'sub-results';
                subMatches.forEach(sec => {
                    const subLI = document.createElement('li');
                    subLI.textContent = sec.txt;
                    subLI.onclick = e => {
                        e.stopPropagation();
                        location.hash = `#${hashOf(p)}#${sec.id}`;
                        closePanels();
                    };
                    subUL.appendChild(subLI);
                });
                li.appendChild(subUL);
            }
        });

    if (!resUL.children.length) resUL.innerHTML = '<li id="no_result">No result</li>';
}

/* *********************************************************************
   SECTION 9 • BREADCRUMB NAVIGATION
************************************************************************ */
function breadcrumb(page) {
    const bar = $('#breadcrumb');
    bar.innerHTML = '';

    const home = document.createElement('a');
    home.className = 'crumb-home';
    home.textContent = TITLE;
    home.href = '#';
    bar.appendChild(home);

    const dyn = document.createElement('span');
    dyn.className = 'crumb-dyn';
    bar.appendChild(dyn);

    const chain = [];
    for (let n = page; n; n = n.parent) chain.unshift(n);
    chain.shift();

    chain.forEach(n => {
        dyn.insertAdjacentHTML('beforeend', '<span class="separator">▸</span>');

        // Wrapper to host dropdown ---------------------------------------------
        const wrap = document.createElement('span');
        wrap.className = 'dropdown';

        const a = document.createElement('a');
        a.textContent = n.title;
        a.href = '#' + hashOf(n);
        if (n === page) a.className = 'crumb-current';

        // Dropdown content = siblings + children --------------------------------
        const box = document.createElement('span');
        box.className = 'box';
        const ul = document.createElement('ul');

        // siblings
        n.parent?.children
            .filter(s => s !== n)
            .sort((a, b) => a.title.localeCompare(b.title))
            .forEach(sib => {
                const li = document.createElement('li');
                li.textContent = sib.title;
                li.onclick = () => nav(sib);
                ul.appendChild(li);
            });

        // children
        if (n.children.length && n === page) {
            ul.insertAdjacentHTML('beforeend', '<li class="sep"></li>');
            n.children
                .sort((a, b) => a.title.localeCompare(b.title))
                .forEach(ch => {
                    const li = document.createElement('li');
                    li.textContent = ch.title;
                    li.onclick = () => nav(ch);
                    ul.appendChild(li);
                });
        }

        box.appendChild(ul);
        wrap.append(a, box);
        dyn.appendChild(wrap);
    });

    // If the page has children, show a quick selector for them ---------------
    if (page.children.length) {
        const dyn = $('#quick-children');
        dyn.innerHTML = '';
        const box = document.createElement('div');
        box.className = 'children';
        box.innerHTML = '<div class="title">Children</div><ul></ul>';

        const ul = box.querySelector('ul');
        page.children
            .sort((a, b) => a.title.localeCompare(b.title))
            .forEach(ch => {
                const li = document.createElement('li');
                li.textContent = ch.title;
                li.onclick = () => nav(ch);
                ul.appendChild(li);
            });
        dyn.appendChild(box);
    }
}

/* *********************************************************************
   SECTION 10 • MARKDOWN RENDER PIPELINE
************************************************************************ */
/** Numbers headings (h1–h5) and sets predictable ids for deep-links. */
function numberHeadings(el) {
    const counters = [0, 0, 0, 0, 0, 0];
    $$('h1,h2,h3,h4,h5', el).forEach(h => {
        const level = +h.tagName[1] - 1;
        counters[level]++;
        for (let i = level + 1; i < 6; i++) counters[i] = 0;
        h.id = counters.slice(0, level + 1).filter(Boolean).join('_');
    });
}

let tocObserver = null;

/** Builds ToC and wires scroll-spy into #toc */
function buildToc(page) {
    const nav = $('#toc');
    nav.innerHTML = '';
    const headings = $$('#content h1,#content h2,#content h3');
    if (!headings.length) return;

    const ul = document.createElement('ul');
    headings.forEach(h => {
        const li = document.createElement('li');
        li.dataset.level = h.tagName[1];
        li.dataset.hid = h.id; // <── heading-id hook
        const a = document.createElement('a');
        const base = hashOf(page);
        a.href = '#' + (base ? base + '#' : '') + h.id;
        a.textContent = h.textContent;
        li.appendChild(a);
        ul.appendChild(li);
    });
    nav.appendChild(ul);

    // cancel previous observers
    tocObserver?.disconnect();

    // scroll-spy: highlight current section
    tocObserver = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                const li = $(`#toc li[data-hid="${e.target.id}"]`);
                if (!li) return;
                $('#toc').querySelectorAll('.toc-current').forEach(x => x.classList.remove('toc-current'));
                li.classList.add('toc-current');
            }
        });
    }, {
        rootMargin: '0px 0px -70% 0px',
        threshold: 0
    });
    headings.forEach(h => tocObserver.observe(h));
}


/** Injects «previous / next» links between siblings for linear reading. */
function prevNext(page) {
    $('#prevnext').innerHTML = '';
    const sibs = page.parent?.children || [];
    if (!sibs.length) return;

    const i = sibs.indexOf(page);
    const prev = sibs[i - 1];
    const next = sibs[i + 1];

    if (prev) {
        const a = document.createElement('a');
        a.className = 'prev';
        a.href = '#' + hashOf(prev);
        a.textContent = '← ' + prev.title;
        $('#prevnext').appendChild(a);
    }
    if (next) {
        const a = document.createElement('a');
        a.className = 'next';
        a.href = '#' + hashOf(next);
        a.textContent = next.title + ' →';
        $('#prevnext').appendChild(a);
    }
}

/** «See also» suggests pages that share tags with the current one. */
function seeAlso(page) {
    const box = $('#seealso');
    box.innerHTML = '';

    if (!page.tagsSet.size) return;

    const related = pages
        .filter(p => p !== page)
        .map(p => {
            const shared = [...p.tagsSet].filter(t => page.tagsSet.has(t)).length;
            return {
                p,
                shared
            };
        })
        .filter(r => r.shared > 0)
        .sort((a, b) => b.shared - a.shared || a.p.title.localeCompare(b.p.title));

    if (!related.length) return; // no tag overlap → don’t show the box

    const h = document.createElement('div');
    h.className = 'title';
    h.textContent = 'See also';
    const ul = document.createElement('ul');
    related.slice(0, 7).forEach(r => {
        const li = document.createElement('li');
        li.textContent = r.p.title;
        li.onclick = () => nav(r.p);
        ul.appendChild(li);
    });

    box.append(h, ul);
}

/** Copies text to clipboard with a tiny flash feedback. */
async function copyText(str, node) {
    try {
        await navigator.clipboard.writeText(str);
        node.classList.add('flash');
        setTimeout(() => node.classList.remove('flash'), 350);
    } catch (err) {
        console.warn('Clipboard API unavailable', err);
    }
}

/* ====== Turn every H1–H5 into a copy-link target ======================= */
function decorateHeadings(page) {
    $$('#content h1,h2,h3,h4,h5').forEach(h => {
        // 1. Create a tiny SVG link icon
        const btn = document.createElement('button');
        btn.className = 'heading-copy';
        btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor"
              d="M3.9 12c0-1.7 1.4-3.1 3.1-3.1h5.4v-2H7c-2.8 0-5 2.2-5 5s2.2 5
                 5 5h5.4v-2H7c-1.7 0-3.1-1.4-3.1-3.1zm5.4 1h6.4v-2H9.3v2zm9.7-8h-5.4v2H19
                 c1.7 0 3.1 1.4 3.1 3.1s-1.4 3.1-3.1 3.1h-5.4v2H19c2.8 0 5-2.2 5-5s-2.2-5-5-5z"/>
      </svg>`;
        btn.title = 'Copy direct link';

        // 2. Insert after heading text
        h.appendChild(btn);

        // 3. Copy handler for both the heading *and* the button
        const copy = () => {
            const link = `${location.origin}${location.pathname}#${hashOf(page)}#${h.id}`;
            copyText(link, btn);
        };
        h.style.cursor = 'pointer';
        h.onclick = e => {
            // don’t trigger when clicking the button itself
            if (e.target.closest('button')) return;
            copy();
        };
        btn.onclick = copy;
    });
}

/* ====== Turn every code-block into an easier-to-copy block ============== */
function decorateCodeBlocks() {
    $$('#content pre').forEach(pre => {
        if (pre.querySelector('.copy-code')) return; // idempotent

        const btn = document.createElement('button');
        btn.className = 'copy-code';
        btn.textContent = 'Copy';
        btn.onclick = e => {
            e.stopPropagation();
            const code = pre.querySelector('code');
            if (code) copyText(code.innerText, btn);
        };
        pre.appendChild(btn);
    });
}

/* ====== Fix footnote anchors to include page hash ======================= */
function fixFootnoteLinks(page) {
    $$('#content a[href^="#fn"], #content a[href^="#footnote"]').forEach(a => {
        const base = hashOf(page);
        a.href = '#' + (base ? base + a.getAttribute('href') : a.getAttribute('href').slice(1));
    });
}

/* ====== Renderer orchestrating Markdown → HTML, syntax highlight,
 *         math typesetting, ToC generation and deep-link scrolling.  ===== */
async function render(page, anchor) {
    // 1. Markdown → raw HTML ---------------------------------------------------
    const {
        parse
    } = await KM.ensureMarkdown();
    if (!page._html) page._html = parse(page.content, { headerIds: false });
    $('#content').innerHTML = page._html;

    // Build sections for current page immediately (for search/ToC)
    indexSections(page);
    // make foot-note anchors hash-aware
    fixFootnoteLinks(page);

    // 2. Number headings so «h2 1.2.3» deep-links remain stable -------------
    numberHeadings($('#content'));

    // 3. Syntax highlight -----------------------------------------------------
    await KM.ensureHighlight();
    const blocks = [...document.querySelectorAll('pre code')];
    const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                window.hljs.highlightElement(e.target);
                io.unobserve(e.target);
            }
        });
    }, { rootMargin: '200px' });
    blocks.slice(0, 2).forEach(b => window.hljs.highlightElement(b));
    blocks.slice(2).forEach(b => io.observe(b));

    // 4. Math typesetting -----------------------------------------------------
    if (page.content.includes('$') || page.content.includes('\\[')) {
        await KM.ensureKatex();
        window.renderMathInElement($('#content'), {
            delimiters: [{
                    left: '$$',
                    right: '$$',
                    display: true
                },
                {
                    left: '\\[',
                    right: '\\]',
                    display: true
                },
                {
                    left: '$',
                    right: '$',
                    display: false
                },
                {
                    left: '\\(',
                    right: '\\)',
                    display: false
                }
            ],
            throwOnError: false
        });
    }

    // 5. ToC + sibling prev/next + copy link / code---------------------------
    buildToc(page);
    decorateHeadings(page);
    decorateCodeBlocks();
    prevNext(page);
    seeAlso(page);

    // 6. Optional deep-link scroll -------------------------------------------
    if (anchor) document.getElementById(anchor)?.scrollIntoView({
        behavior: 'smooth'
    });
}

/* *********************************************************************
   SECTION 11 • GRAPH VISUALISATION (single SVG that can go full-screen)
************************************************************************ */
const graphs = {}; // { mini:{ node,label,sim,view,w,h,adj } }
let CURRENT = -1;

/* ────────────────────────────────────────────────────────────────────
   Build once – mini only
   ────────────────────────────────────────────────────────────────── */
async function buildGraph() {
    await KM.ensureD3();
    if (graphs.mini) return;

    const {
        nodes,
        links,
        adj
    } = buildGraphData();
    const svg = KM.d3.select('#mini');
    const box = svg.node().getBoundingClientRect();
    const W = box.width || 320;
    const H = box.height || 220;

    /* Build local shallow copies so we can mutate positions freely */
    const localN = nodes.map(n => ({
        ...n
    }));
    const localL = links.map(l => ({
        ...l
    }));

    const sim = KM.d3
        .forceSimulation(localN)
        .force('link', KM.d3.forceLink(localL).id(d => d.id).distance(d => d.kind === 'hier' ? 20 + d.tier * 9 : 16 + Math.max(0, 40 - d.shared * 10)))
        .force('charge', KM.d3.forceManyBody().strength(-240))
        .force('center', KM.d3.forceCenter(W / 2, H / 2));

    /* One wrapper so we can pan the whole graph in one go */
    const view = svg.append('g').attr('class', 'view');

    /* Edges */
    const link = view.append('g').selectAll('line')
        .data(localL).join('line')
        .attr('id', d => {
            if (d.kind === 'hier') return IDS.hierPRE + d.tier; // 1–5
            const tier = Math.min(d.shared, 5); // cap at 5
            return IDS.tagPRE + tier; // «link_tag{n}»
        });

    /* Nodes */
    const node = view.append('g').selectAll('circle')
        .data(localN).join('circle')
        .attr('r', d => d.children ? 5 : 3.5)
        .attr('id', d => {
            if (d.id === CURRENT) return IDS.nodeCurrent;
            if (d.children) return IDS.nodeParent;
            return IDS.nodeLeaf;
        })
        .on('mouseenter', (_, d) => fade(d, 0.08))
        .on('mouseleave', () => fade(null, 1))
        .on('click', (_, d) => {
            nav(byId.get(d.id));
            closePanels();
        })
        .call(KM.d3.drag()
            .on('start', (e, d) => {
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (e, d) => {
                d.fx = e.x;
                d.fy = e.y;
            })
            .on('end', (e, d) => {
                d.fx = null;
                d.fy = null;
            })
        );

    /* Labels */
    const label = view.append('g').selectAll('text')
        .data(localN).join('text')
        .text(d => d.title)
        .attr('class', 'label')
        .on('click', (_, d) => {
            nav(byId.get(d.id));
            closePanels();
        });

    /* Simulation tick → render positions */
    sim.on('tick', () => {
        node.attr('cx', d => d.x)
            .attr('cy', d => d.y);

        link.attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);

        label.attr('x', d => d.x + 8).attr('y', d => d.y + 3);
    });

    /* Store handles */
    graphs.mini = {
        node,
        label,
        sim,
        view,
        adj,
        w: W,
        h: H
    };

    observeMiniResize(); // start resize watcher
}

/* ────────────────────────────────────────────────────────────────────
   Graph data: derive nodes + links from the wiki model
   ────────────────────────────────────────────────────────────────── */
const IDS = {
    nodeCurrent: 'node_current',
    nodeParent: 'node_parent',
    nodeLeaf: 'node_leaf',
    hierPRE: 'link_hier',
    tagPRE: 'link_tag'
};

function buildGraphData() {
    const nodes = pages.map(p => ({
        id: p.id,
        title: p.title,
        children: p.children.length > 0
    }));

    /* Hierarchical links (parent → child) */
    const hier = [];
    pages.forEach(p => p.children.forEach(ch => {
        const depth = (hashOf(ch).split('#').length);
        hier.push({
            source: p.id,
            target: ch.id,
            kind: 'hier',
            tier: Math.min(depth, 5)
        });
    }));

    /* Tag-similarity links (shared tags) */
    const tagLinks = [];
    pages.forEach(a => pages.forEach(b => {
        if (a.id >= b.id) return; // undirected dedupe
        const shared = [...a.tagsSet].filter(t => b.tagsSet.has(t)).length;
        if (shared) tagLinks.push({
            source: a.id,
            target: b.id,
            shared
        });
    }));

    /* adjacency sets for hover fade effect */
    const adj = new Map();
    nodes.forEach(n => adj.set(n.id, new Set([n.id])));
    [...hier, ...tagLinks].forEach(l => {
        adj.get(l.source).add(l.target);
        adj.get(l.target).add(l.source);
    });

    return {
        nodes,
        links: [...hier, ...tagLinks],
        adj
    };
}

/* ────────────────────────────────────────────────────────────────────
   Hover fade / current highlight
   ────────────────────────────────────────────────────────────────── */
function fade(d, alpha) {
    const g = graphs.mini;
    if (!g) return;

    const show = d ? g.adj.get(d.id) : null;

    g.node.attr('opacity', x => (!show || show.has(x.id)) ? 1 : alpha);
    g.label.attr('opacity', x => (!show || show.has(x.id)) ? 1 : alpha);
}

function highlightCurrent() {
    const id = (location.hash.slice(1).split('#').filter(Boolean).pop() || '').trim();
    const g = graphs.mini;
    if (!g) return;

    // reset all ids
    g.node.attr('id', d => {
        if (d.id === id) return IDS.nodeCurrent;
        if (d.children) return IDS.nodeParent;
        return IDS.nodeLeaf;
    });

    // nudge the sim towards centre on highlight
    const box = document.getElementById('mini').getBoundingClientRect();
    const cx = box.width / 2;
    const cy = box.height / 2;

    g.node.each(d => {
        /* Keep the existing nudge so the node eases back to the centre */
        const k = 0.35;
        d.vx += (cx - d.x) * k;
        d.vy += (cy - d.y) * k;
    });

    g.sim.alphaTarget(0.7).restart();
    setTimeout(() => g.sim.alphaTarget(0), 400);

    CURRENT = id;
}

/* ────────────────────────────────────────────────────────────────────
   Keep sim centred when #mini resizes
   ────────────────────────────────────────────────────────────────── */
function observeMiniResize() {
    new ResizeObserver(entries => {
        const g = graphs.mini;
        if (!g) return;
        const {
            width: w,
            height: h
        } = entries[0].contentRect;
        g.w = w;
        g.h = h;
        g.sim.force('center', KM.d3.forceCenter(w / 2, h / 2));
        g.sim.alpha(0.3).restart();
    }).observe(document.getElementById('mini'));
}

/* *********************************************************************
   SECTION 12 • PANEL HELPERS + ROUTER
************************************************************************ */
function closePanels() {
    document.body.classList.remove('show-sidebar');
    document.body.classList.remove('show-util');
}

/** Main router: reads location.hash and renders the best matching page. */
function route() {
    closePanels();
    const seg = location.hash.slice(1).split('#').filter(Boolean);
    const page = find(seg);
    const anchor = seg.slice(hashOf(page).split('#').length).join('#');

    // Reset scroll (iOS Safari needs both roots) -----------------------------
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    breadcrumb(page);
    render(page, anchor);
    scheduleLazySectionIndexing(page);
    highlightCurrent();
    highlightSidebar(page);
}

window.addEventListener('hashchange', () => {
    route();
});

// First route if user lands with a hash in URL
if (location.hash) route();
