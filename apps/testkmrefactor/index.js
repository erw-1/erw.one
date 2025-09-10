// index.js: Main SPA entry point

import { $, el, domReady, clearSelection, baseURLNoHash } from './helpers.js';
import { TITLE, MD, LANGS, DEFAULT_THEME, ACCENT, CACHE_MIN, readCache, writeCache, parseMarkdownBundle } from './data.js';
import { renderPage } from './render.js';
import { initUI } from './ui.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Fetch and parse Markdown bundle, with optional caching
        let txt;
        const cached = (CACHE_MIN > 0) ? readCache(MD) : null;
        if (cached && (Date.now() - cached.ts) < CACHE_MIN * 60000) {
            txt = cached.txt;  // Use cached markdown if still fresh
        } else {
            const response = await fetch(MD, { cache: 'no-cache' });
            if (!response.ok) throw new Error(`Failed to fetch MD (${response.status})`);
            txt = await response.text();
            if (CACHE_MIN > 0) writeCache(MD, txt);
        }
        // Parse the Markdown into the app’s data structures (pages, sections, etc.)
        parseMarkdownBundle(txt);

        // Initialize the UI (build sidebar/tree, theme, routing, etc.)
        initUI();
    } catch (err) {
        console.warn('Markdown load failed:', err);
        const elContent = document.getElementById('content');
        if (elContent) {
            elContent.innerHTML = `<h1>Content failed to load</h1>
<p>Could not fetch or parse the Markdown bundle. Check <code>window.CONFIG.MD</code> and network access.</p>
<pre>${String(err?.message || err)}</pre>`;
        }
    }
});
