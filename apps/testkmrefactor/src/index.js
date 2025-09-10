'use strict';
import { MD, CACHE_MIN, readCache, writeCache, parseMarkdownBundle, attachSecondaryHomes, computeHashes, root } from './data.js';
import { domReady } from './helpers.js';
import { render, scrollToAnchor } from './render.js';
import { initUI, closePanels, highlightSidebar, highlightCurrent } from './ui.js';
import { buildToc, prevNext, seeAlso, wireCopyButtons } from './ui.js';

let currentPage = null;
/** Hash router: parse location.hash and render or scroll as needed */
async function route() {
    closePanels();
    const t = parseMarkdownBundle ? parseTarget(location.hash) : null;  // (should have parseTarget imported if needed)
    const target = t ?? { page: root, anchor: '' };
    const page = target.page;
    const anchor = target.anchor;
    if (currentPage !== page) {
        currentPage = page;
        breadcrumb(page);  // (assumes breadcrumb is imported from UI if provided; otherwise skip if breadcrumb is handled via HTML)
        await render(page, anchor);
        highlightCurrent(true);
        highlightSidebar(page);
        // After content is rendered, build ToC, sibling nav, and related links
        buildToc(page);
        prevNext(page);
        seeAlso(page);
        // Attach copy-button delegation for main content (once per load)
        wireCopyButtons(document.getElementById('content'), () => buildDeepURL(currentPage, '') || (baseURLNoHash() + '#'));
        if (!anchor) {
            requestAnimationFrame(() => resetScrollTop());
        }
    } else if (anchor) {
        // Same page anchor change → smooth scroll only
        scrollToAnchor(anchor);
        const a = document.querySelector(`#toc li[data-hid="${anchor}"] > a`);
        if (a) {
            document.querySelector('#toc .toc-current')?.classList.remove('toc-current');
            a.classList.add('toc-current');
        }
    }
}

// Boot sequence: load Markdown, parse, then initialize UI and route
(async () => {
    try {
        if (!MD) throw new Error('CONFIG.MD is empty.');
        // Try to use cached content if it's fresh enough
        let txt;
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort('fetch-timeout'), 20000);
        const cached = CACHE_MIN > 0 ? readCache(MD) : null;
        const freshEnough = cached && (Date.now() - cached.ts) <= CACHE_MIN * 60_000;
        try {
            if (freshEnough) {
                txt = cached.txt;
            } else {
                const res = await fetch(MD, { cache: 'no-cache', signal: ctrl.signal });
                clearTimeout(timeout);
                if (!res.ok) throw new Error(`Failed to fetch MD (${res.status})`);
                txt = await res.text();
                if (CACHE_MIN > 0) writeCache(MD, txt);
            }
        } catch (err) {
            clearTimeout(timeout);
            if (cached?.txt) {
                console.warn('Network failed; using stale cached Markdown');
                txt = cached.txt;
            } else {
                throw err;
            }
        }
        // Parse the markdown bundle into the page model
        parseMarkdownBundle(txt);
        attachSecondaryHomes();
        computeHashes();
        await domReady();
        initUI();
        // Delay to ensure initial layout, then highlight current page in mini-graph
        await new Promise(res => setTimeout(res, 120));
        highlightCurrent(true);
    } catch (err) {
        console.warn('Markdown load failed:', err);
        const contentEl = document.getElementById('content');
        if (contentEl) {
            contentEl.innerHTML = `<h1>Content failed to load</h1>
<p>Could not fetch or parse the Markdown bundle. Check <code>window.CONFIG.MD</code> and network access.</p>
<pre>${String(err?.message || err)}</pre>`;
        }
    }
})();
