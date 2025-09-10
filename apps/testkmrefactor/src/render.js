'use strict';
const KM = window.KM || (window.KM = {});
import { $, $$, el, escapeRegex, ensureOnce, clearSelection, copyText, HEADINGS_SEL } from './helpers.js';
import { LANGS, ALLOW_JS_FROM_MD, pageHTMLLRU, PAGE_HTML_LRU_MAX, parseTarget, buildDeepURL } from './data.js';

// Lazy-loaded asset initializers and Markdown parser
let mdReady = null;
export function ensureMarkdown() {
    if (mdReady) return mdReady;
    // Helper extension builders for Marked
    function createInline({ name, delimiter, tag, hint = delimiter[0], notAfterOpen, notBeforeClose }) {
        const d = escapeRegex(delimiter);
        const after = notAfterOpen ? `(?!${notAfterOpen})` : "";
        const before = notBeforeClose ? `(?!${notBeforeClose})` : "";
        const re = new RegExp(`^${d}${after}(?=\\S)([\\s\\S]*?\\S)${d}${before}`);
        return {
            name,
            level: "inline",
            start(src) { return src.indexOf(hint); },
            tokenizer(src) {
                const m = re.exec(src);
                if (!m) return;
                return { type: name, raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) };
            },
            renderer(tok) {
                return `<${tag}>${this.parser.parseInline(tok.tokens)}</${tag}>`;
            }
        };
    }
    function createCallouts() {
        return {
            name: "callout",
            level: "block",
            start(src) { return src.indexOf(":::"); },
            tokenizer(src) {
                const re = /^:::(success|info|warning|danger)(?:[ \t]+([^\n]*))?[ \t]*\n([\s\S]*?)\n:::[ \t]*(?=\n|$)/;
                const m = re.exec(src);
                if (!m) return;
                const [, kind, title = "", body] = m;
                return { type: "callout", raw: m[0], kind, title, tokens: this.lexer.blockTokens(body) };
            },
            renderer(tok) {
                const inner = this.parser.parse(tok.tokens);
                const map = { info: "note", success: "tip", warning: "warning", danger: "caution" };
                const cls = map[tok.kind] || "note";
                return `<div class="md-callout md-${cls}">\n${inner}\n</div>\n`;
            }
        };
    }
    function createSpoiler() {
        return {
            name: "spoiler",
            level: "block",
            start(src) { return src.indexOf(":::spoiler"); },
            tokenizer(src) {
                const re = /^:::spoiler(?:[ \t]+([^\n]*))?[ \t]*\n([\s\S]*?)\n:::[ \t]*(?=\n|$)/;
                const m = re.exec(src);
                if (!m) return;
                const [, title = "spoiler", body] = m;
                return { type: "spoiler", raw: m[0], title, titleTokens: this.lexer.inlineTokens(title), tokens: this.lexer.blockTokens(body) };
            },
            renderer(tok) {
                const summary = this.parser.parseInline(tok.titleTokens);
                const inner = this.parser.parse(tok.tokens);
                return `<details class="md-spoiler"><summary>${summary}</summary>\n${inner}\n</details>\n`;
            }
        };
    }
    mdReady = Promise.all([
        import('https://cdn.jsdelivr.net/npm/marked@16.1.2/+esm'),
        import('https://cdn.jsdelivr.net/npm/marked-alert@2.1.2/+esm'),
        import('https://cdn.jsdelivr.net/npm/marked-footnote@1.4.0/+esm'),
        import('https://cdn.jsdelivr.net/npm/marked-emoji@2.0.1/+esm'),
        import('https://cdn.jsdelivr.net/npm/emojilib@4.0.2/+esm'),
        import('https://cdn.jsdelivr.net/npm/mermaid@11.11.0/+esm')
    ]).then(([markedMod, alertMod, footnoteMod, emojiPluginMod, emojiLibMod, mermaidMod]) => {
        const marked = markedMod;
        // Prepare emoji keyword→emoji map
        const emojiLib = emojiLibMod.default ?? emojiLibMod;
        const Emojis = Object.entries(emojiLib).reduce((d, [emoji, keywords]) => {
            if (Array.isArray(keywords)) for (const k of keywords) if (d[k] == null) d[k] = emoji;
            return d;
        }, {});
        const mermaid = (mermaidMod.default ?? mermaidMod);
        mermaid.initialize({ startOnLoad: false });
        KM.mermaid = mermaid;
        const setMermaidTheme = (mode) => {
            mermaid.initialize({ startOnLoad: false, theme: mode });
        };
        const md = new markedMod.Marked()
            .use((footnoteMod.default ?? footnoteMod)())
            .use((alertMod.default ?? alertMod)())
            .use((emojiPluginMod.markedEmoji ?? emojiPluginMod.default)({
                emojis: Emojis,
                renderer: t => t.emoji
            }))
            .use({ extensions: [
                // Custom extensions: Mermaid, mark, sup, sub, underline, callouts, spoiler
                { extensions: [ 
                    createInline({ name: "mark", delimiter: "==", tag: "mark", hint: "=" }),
                    createInline({ name: "sup", delimiter: "^", tag: "sup", notAfterOpen: "\\[|\\^" }),
                    createInline({ name: "sub", delimiter: "~", tag: "sub", notAfterOpen: "~", notBeforeClose: "~" }),
                    createInline({ name: "underline", delimiter: "++", tag: "u", hint: "+", notAfterOpen: "\\+", notBeforeClose: "\\+" }),
                    createCallouts(), 
                    createSpoiler(),
                    {
                        name: "mermaid",
                        level: "block",
                        start(src) { return src.indexOf("```mermaid"); },
                        tokenizer(src) {
                            const m = /^```(?:mermaid|Mermaid)[ \t]*\n([\s\S]*?)\n```[ \t]*(?=\n|$)/.exec(src);
                            if (!m) return;
                            return { type: "mermaid", raw: m[0], text: m[1] };
                        },
                        renderer(tok) {
                            const escHTML = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                            return `<div class="mermaid">${escHTML(tok.text)}</div>\n`;
                        }
                    }
                ] }
            ] });
        return {
            parse: (src, opt) => md.parse(src, { ...opt, mangle: false }),
            // After injecting parsed HTML, lazily render Mermaid diagrams
            renderMermaidLazy: async (root) => {
                const container = root || document;
                const nodes = [...container.querySelectorAll('.mermaid')];
                if (!nodes.length) return;
                async function renderOne(el) {
                    if (el.dataset.mmdDone === '1') return;
                    if (!el.dataset.mmdSrc) el.dataset.mmdSrc = el.textContent;
                    if (el.querySelector('svg')) {
                        el.innerHTML = el.dataset.mmdSrc;
                    }
                    el.removeAttribute('data-processed');
                    el.dataset.mmdDone = '1';
                    const done = (() => {
                        let resolve;
                        const p = new Promise(res => (resolve = res));
                        const mo = new MutationObserver(() => {
                            if (el.getAttribute('data-processed') === 'true' || el.querySelector('svg')) {
                                mo.disconnect(); resolve();
                            }
                        });
                        mo.observe(el, { attributes: true, childList: true });
                        const t = setTimeout(() => { mo.disconnect(); resolve(); }, 4000);
                        p.finally(() => clearTimeout(t));
                        return p;
                    })();
                    try {
                        await KM.mermaid.run({ nodes: [el] });
                    } catch (_) {
                        delete el.dataset.mmdDone;
                        throw _;
                    }
                    await done;
                }
                for (const el of nodes) {
                    try { await renderOne(el); } catch {}
                }
            },
            setMermaidTheme
        };
    });
    return mdReady;
}
export const ensureHighlight = ensureOnce(async () => {
    const { default: hljs } = await import('https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/es/core/+esm');
    if (Array.isArray(LANGS) && LANGS.length) {
        await Promise.allSettled(LANGS.map(async lang => {
            try {
                const mod = await import(`https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/es/languages/${lang}/+esm`);
                hljs.registerLanguage(lang, mod.default);
            } catch (_) {}
        }));
    }
    window.hljs = hljs;
});
export const ensureKatex = ensureOnce(async () => {
    const BASE = 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/';
    if (!document.getElementById('katex-css')) {
        const link = Object.assign(document.createElement('link'), {
            id: 'katex-css',
            rel: 'stylesheet',
            href: BASE + 'katex.min.css'
        });
        document.head.appendChild(link);
    }
    const [katexMod, auto] = await Promise.all([
        import(BASE + 'katex.min.js/+esm'),
        import(BASE + 'contrib/auto-render.min.js/+esm')
    ]);
    const katex = katexMod;
    window.katex = katex;
    window.renderMathInElement = auto.default;
});
const KATEX_OPTS = {
    delimiters: [
        { left: '$$',  right: '$$',  display: true  },
        { left: '\\[', right: '\\]', display: true  },
        { left: '\\(', right: '\\)', display: false },
        { left: '$',   right: '$',   display: false }
    ],
    throwOnError: false
};
export function renderMathSafe(root) {
    try {
        if (root.dataset.mathRendered === '1') return;
        window.renderMathInElement?.(root, KATEX_OPTS);
        root.dataset.mathRendered = '1';
    } catch {}
}

// IntersectionObserver management
const __OBS_BY_ROOT = new Map();
function __trackObserver(o, root = document) {
    if (!o || typeof o.disconnect !== 'function') return o;
    const set = __OBS_BY_ROOT.get(root) || new Set();
    set.add(o);
    __OBS_BY_ROOT.set(root, set);
    return o;
}
export function __cleanupObservers(root = document) {
    const set = __OBS_BY_ROOT.get(root);
    if (!set) return;
    for (const o of set) { try { o.disconnect?.(); } catch {} }
    set.clear();
}

// Parse and cache HTML content for a page
function numberHeadings(elm) {
    const counters = [0,0,0,0,0,0,0];
    $$(HEADINGS_SEL, elm).forEach(h => {
        if (h.id) return;
        const level = +h.tagName[1] - 1;
        counters[level]++;
        for (let i = level + 1; i < 7; i++) counters[i] = 0;
        h.id = counters.slice(0, level + 1).filter(Boolean).join('_');
    });
}
export async function getParsedHTML(page) {
    if (pageHTMLLRU.has(page.id)) {
        const html = pageHTMLLRU.get(page.id);
        pageHTMLLRU.delete(page.id);
        pageHTMLLRU.set(page.id, html);
        return html;
    }
    const { parse } = await ensureMarkdown();
    const tmp = el('div');
    tmp.innerHTML = parse(page.content, { headerIds: false });
    numberHeadings(tmp);
    const html = tmp.innerHTML;
    pageHTMLLRU.set(page.id, html);
    if (pageHTMLLRU.size > PAGE_HTML_LRU_MAX) {
        const firstKey = pageHTMLLRU.keys().next().value;
        pageHTMLLRU.delete(firstKey);
    }
    return html;
}

// Small inline SVG icons used for copy buttons
const ICONS = {
    link: 'M3.9 12c0-1.7 1.4-3.1 3.1-3.1h5.4v-2H7c-2.8 0-5 2.2-5 5s2.2 5 5 5h5.4v-2H7c-1.7 0-3.1-1.4-3.1-3.1zm5.4 1h6.4v-2H9.3v2zm9.7-8h-5.4v2H19c1.7 0 3.1 1.4 3.1 3.1s-1.4 3.1-3.1 3.1h-5.4v2H19c2.8 0 5-2.2 5-5s-2.2-5-5-5z',
    code: 'M19,21H5c-1.1,0-2-0.9-2-2V7h2v12h14V21z M21,3H9C7.9,3,7,3.9,7,5v12 c0,1.1,0.9,2,2,2h12c2.2,0,2-2,2-2V5C23,3.9,22.1,3,21,3z M21,17H9V5h12V17z'
};
function iconBtn(title, path, cls, onClick) {
    return el('button', {
        type: 'button',
        class: cls,
        title,
        'aria-label': title,
        ...(onClick && { onclick: onClick }),
        innerHTML: `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${path}"></path></svg>`
    });
}
function decorateHeadings(page, container = $('#content')) {
    const base = buildDeepURL(page, '') || (baseURLNoHash() + '#');
    $$(HEADINGS_SEL, container).forEach(h => {
        const url = `${base}${h.id}`;
        // Add copy-link button if not already present
        h.querySelector('button.heading-copy') || h.appendChild(iconBtn('Copy direct link', ICONS.link, 'heading-copy'));
        // Clicking on heading copies its direct URL (unless clicking on an interactive element or text is selected)
        h.onclick = ev => {
            if ((ev.target instanceof Element) && ev.target.closest('a,button,input,select,textarea')) return;
            if (window.getSelection && String(window.getSelection()).length) return;
            clearSelection();
            copyText(url, h.querySelector('button.heading-copy'));
        };
    });
}
function decorateCodeBlocks(container = $('#content')) {
    $$('pre', container).forEach(pre => {
        // Skip Mermaid code (rendered later)
        if (pre.classList.contains('mermaid')) return;
        if (pre.querySelector('button.code-copy')) return;
        pre.append(iconBtn('Copy code', ICONS.code, 'code-copy'));
    });
}
export function decorateExternalLinks(container = $('#content')) {
    $$('a[href]', container).forEach(a => {
        const href = a.getAttribute('href');
        if (!href || href.startsWith('#')) return;
        if (!/^https?:\/\//i.test(href)) return; // only absolute http(s) links
        let url;
        try { url = new URL(href); } catch { return; }
        if (url.origin === location.origin) return;
        a.setAttribute('target', '_blank');
        // Add rel="noopener noreferrer external"
        const rel = new Set((a.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
        rel.add('noopener'); rel.add('noreferrer'); rel.add('external');
        a.setAttribute('rel', Array.from(rel).join(' '));
        // Add ARIA label to announce external link + new tab
        if (!a.hasAttribute('aria-label')) {
            a.setAttribute('aria-label', `${a.textContent} (opens in new tab, ${url.hostname})`);
        }
    });
}

/* Lazy, on-scroll syntax highlighting of code blocks */
export async function highlightVisibleCode(root = document) {
    await ensureHighlight();
    const blocks = [...root.querySelectorAll('pre code')];
    if (!blocks.length) return;
    const obs = __trackObserver(new IntersectionObserver((entries, o) => {
        for (const en of entries) {
            if (!en.isIntersecting) continue;
            const elx = en.target;
            if (!elx.dataset.hlDone) {
                window.hljs.highlightElement(elx);
                elx.dataset.hlDone = '1';
            }
            o.unobserve(elx);
        }
    }, { rootMargin: '200px 0px', threshold: 0 }), root);
    blocks.forEach(elx => { if (!elx.dataset.hlDone) obs.observe(elx); });
}

/* Run any inline <script> tags from the rendered Markdown (if allowed) */
export function runInlineScripts(root) {
    root.querySelectorAll('script').forEach(old => {
        const s = document.createElement('script');
        for (const { name, value } of [...old.attributes]) s.setAttribute(name, value);
        s.textContent = old.textContent || '';
        old.replaceWith(s); // inserting the new <script> runs it
    });
}

/** Enhance the newly rendered content (links, images, code, math, etc.). */
export async function enhanceRendered(containerEl, page) {
    decorateExternalLinks(containerEl);
    // Make images lazy-load and prioritize top ones for performance
    const imgs = $$('img', containerEl);
    imgs.forEach((img, i) => {
        img.loading = 'lazy';
        img.decoding = 'async';
        if (!img.hasAttribute('fetchpriority') && i < 2) img.setAttribute('fetchpriority', 'high');
    });
    // Normalize footnote anchors in main content to include page base
    normalizeAnchors(containerEl, page, { onlyFootnotes: true });
    // Mark internal hash links as previewable (adds .km-has-preview)
    annotatePreviewableLinks(containerEl);
    // Kick off lazy code highlighting (non-blocking)
    highlightVisibleCode(containerEl);
    // Start Mermaid diagram rendering (non-blocking)
    ensureMarkdown().then(({ renderMermaidLazy }) => renderMermaidLazy(containerEl));
    // Defer math rendering: use observer to render when KaTeX is loaded and content visible
    if (/(\$[^$]+\$|\\\(|\\\[)/.test(page.content)) {
        const obs = __trackObserver(new IntersectionObserver((entries, o) => {
            if (entries.some(en => en.isIntersecting)) {
                ensureKatex().then(() => renderMathSafe(containerEl));
                o.disconnect();
            }
        }, { root: null, rootMargin: '200px 0px', threshold: 0 }), containerEl);
        obs.observe(containerEl);
    }
    decorateHeadings(page, containerEl);
    decorateCodeBlocks(containerEl);
}

/** Smooth-scroll to an in-page anchor if present. */
export function scrollToAnchor(anchor) {
    if (!anchor) return;
    const target = document.getElementById(anchor);
    if (target) target.scrollIntoView({ behavior: 'smooth' });
}

/** Render the given page (and optional in-page anchor) into #content. */
export async function render(page, anchor) {
    const contentEl = $('#content');
    if (!contentEl) return;
    __cleanupObservers();
    contentEl.dataset.mathRendered = '0';
    contentEl.innerHTML = await getParsedHTML(page);
    if (ALLOW_JS_FROM_MD === 'true') {
        runInlineScripts(contentEl);
    }
    await enhanceRendered(contentEl, page);
    scrollToAnchor(anchor);
}

/** Normalize relative hash anchors inside a container to be page-local if needed. */
export function normalizeAnchors(container = $('#content'), page, { onlyFootnotes = false } = {}) {
    const base = hashOf(page);
    if (!base) return;
    $$('a[href^="#"]', container).forEach(a => {
        const href = a.getAttribute('href') || '';
        if (!href) return;
        if (onlyFootnotes) {
            if (/^#(?:fn|footnote)/.test(href) && !href.includes(base + '#')) {
                a.setAttribute('href', `#${base}${href}`);
            }
            return;
        }
        // If the link's hash doesn't resolve to a page, prepend this page's base
        if (!parseTarget(href)) {
            const frag = href.length > 1 ? ('#' + href.slice(1)) : '';
            a.setAttribute('href', '#' + base + frag);
        }
    });
}

/** Mark internal hash links in a container as previewable (adds data for hover previews). */
function annotatePreviewableLinks(container = $('#content')) {
    if (!container) return;
    let seq = 0, stamp = Date.now().toString(36);
    container.querySelectorAll('a[href^="#"]').forEach(a => {
        if (parseTarget(a.getAttribute('href') || '')) {
            a.classList.add('km-has-preview');
            a.dataset.preview = '1';
            if (!a.id) a.id = `km-prev-${stamp}-${seq++}`;
            if (!a.title) a.title = 'Preview on hover';
        }
    });
}
