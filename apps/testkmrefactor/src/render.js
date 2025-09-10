/* eslint-env browser, es2022 */
'use strict';

/**
 * render.js
 *  - Turns Markdown from data.js into HTML
 *  - Enhances code (hljs + “copy” buttons), math (KaTeX), and Mermaid
 *  - Renders into #content and scrolls to in-page anchors
 *
 * Exported API:
 *   showPage(page, anchor)
 */

import { $, $$, el, whenIdle } from './dom.js';
import { CFG, hashOf, parseTarget } from './data.js';

/* ───────────────────────── small utilities ─────────────────────────────── */
const DOC = document;
const HEADINGS_SEL = '#content h1, #content h2, #content h3, #content h4, #content h5, #content h6';

const ensureOnce = (fn) => {
  let p; return () => (p ??= fn());
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ───────────────────────── external loaders ────────────────────────────── */
// highlight.js core + languages from CFG.LANGS, plus a light/dark theme CSS
const ensureHighlight = ensureOnce(async () => {
  const { default: hljs } = await import('https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/es/core/+esm');

  const langs = Array.isArray(CFG.LANGS) ? CFG.LANGS : [];
  if (langs.length) {
    await Promise.allSettled(langs.map(async lang => {
      try {
        const mod = await import(`https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/es/languages/${lang}/+esm`);
        hljs.registerLanguage(lang, mod.default);
      } catch { /* ignore missing languages */ }
    }));
  }
  // Theme CSS (GitHub)
  const THEME = {
    light: 'https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github.min.css',
    dark:  'https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github-dark-dimmed.min.css',
  };
  const mode = DOC.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  let link = DOC.querySelector('link[data-hljs-theme]');
  if (!link) {
    link = DOC.createElement('link');
    link.rel = 'stylesheet';
    link.setAttribute('data-hljs-theme', '');
    DOC.head.appendChild(link);
  }
  if (link.getAttribute('href') !== THEME[mode]) {
    await new Promise(res => { link.onload = link.onerror = res; link.href = THEME[mode]; });
  }

  // expose for convenience
  window.hljs = hljs;
  return hljs;
});

// KaTeX auto-render
const ensureKatex = ensureOnce(async () => {
  const BASE = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/';
  if (!DOC.getElementById('katex-css')) {
    const link = Object.assign(DOC.createElement('link'), {
      id: 'katex-css', rel: 'stylesheet', href: BASE + 'katex.min.css'
    });
    DOC.head.appendChild(link);
  }
  const [katex, auto] = await Promise.all([
    import(BASE + 'katex.min.js/+esm'),
    import(BASE + 'contrib/auto-render.min.js/+esm'),
  ]);
  window.katex = katex;
  window.renderMathInElement = auto.default;
});

// Marked + plugins + our custom extensions (Mermaid, mark, sup/sub, underline, callouts, spoiler)
let _mdReady = null;
async function ensureMarkdown() {
  if (_mdReady) return _mdReady;
  _mdReady = Promise.all([
    import('https://cdn.jsdelivr.net/npm/marked@16.1.2/+esm'),
    import('https://cdn.jsdelivr.net/npm/marked-alert@2.1.2/+esm'),
    import('https://cdn.jsdelivr.net/npm/marked-footnote@1.4.0/+esm'),
    import('https://cdn.jsdelivr.net/npm/marked-emoji@2.0.1/+esm'),
    import('https://cdn.jsdelivr.net/npm/emojilib@4.0.2/+esm'),
    import('https://cdn.jsdelivr.net/npm/mermaid@11.11.0/+esm'),
  ]).then(([markedMod, alertMod, footnoteMod, emojiMod, emojiLibMod, mermaidMod]) => {
    const marked = markedMod;
    // Build emoji keyword map → glyph
    const emojiLib = emojiLibMod.default ?? emojiLibMod;
    const Emojis = Object.entries(emojiLib).reduce((d, [emoji, keywords]) => {
      if (Array.isArray(keywords)) for (const k of keywords) if (d[k] == null) d[k] = emoji;
      return d;
    }, {});

    // Mermaid
    const mermaid = (mermaidMod.default ?? mermaidMod);
    mermaid.initialize({ startOnLoad: false });

    // --- custom Marked extensions ---
    const createInline = ({ name, delimiter, tag, hint = delimiter, notAfterOpen = '', notBeforeClose = '' }) => {
      const d = escapeRegex(delimiter);
      const after = notAfterOpen ? `(?!${notAfterOpen})` : '';
      const before = notBeforeClose ? `(?!${notBeforeClose})` : '';
      const re = new RegExp(`^${d}${after}(?=\\S)([\\s\\S]*?\\S)${d}${before}`);
      return {
        name, level: 'inline',
        start(src) { return src.indexOf(hint); },
        tokenizer(src) {
          const m = re.exec(src); if (!m) return;
          return { type: name, raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) };
        },
        renderer(tok) { return `<${tag}>${this.parser.parseInline(tok.tokens)}</${tag}>`; }
      };
    };

    const calloutExt = {
      name: 'callout', level: 'block',
      start(src) { return src.indexOf(':::'); },
      tokenizer(src) {
        const re = /^:::(success|info|warning|danger)(?:[ \t]+([^\n]*))?[ \t]*\n([\s\S]*?)\n:::[ \t]*(?=\n|$)/;
        const m = re.exec(src); if (!m) return;
        const [, kind, title = '', body] = m;
        return { type: 'callout', raw: m[0], kind, title, titleTokens: this.lexer.inlineTokens(title), tokens: this.lexer.blockTokens(body) };
      },
      renderer(tok) {
        const inner = this.parser.parse(tok.tokens);
        const map = { info: 'note', success: 'tip', warning: 'warning', danger: 'caution' };
        const cls = map[tok.kind] || 'note';
        const title = tok.title ? `<div class="md-callout-title">${this.parser.parseInline(tok.titleTokens)}</div>` : '';
        return `<div class="md-callout md-${cls}">${title}${inner}</div>\n`;
      }
    };

    const spoilerExt = {
      name: 'spoiler', level: 'block',
      start(src) { return src.indexOf(':::spoiler'); },
      tokenizer(src) {
        const re = /^:::spoiler(?:[ \t]+([^\n]*))?[ \t]*\n([\s\S]*?)\n:::[ \t]*(?=\n|$)/;
        const m = re.exec(src); if (!m) return;
        const [, title = 'spoiler', body] = m;
        return { type: 'spoiler', raw: m[0], title, titleTokens: this.lexer.inlineTokens(title), tokens: this.lexer.blockTokens(body) };
      },
      renderer(tok) {
        const summary = this.parser.parseInline(tok.titleTokens);
        const inner = this.parser.parse(tok.tokens);
        return `<details class="md-spoiler"><summary>${summary}</summary>\n${inner}\n</details>\n`;
      }
    };

    const mermaidExt = {
      name: 'mermaid', level: 'block',
      start(src) { return src.indexOf('```'); },
      tokenizer(src) {
        const m = /^```(?:mermaid|Mermaid)[ \t]*\n([\s\S]*?)\n```[ \t]*(?=\n|$)/.exec(src);
        if (!m) return; return { type: 'mermaid', raw: m[0], text: m[1] };
      },
      renderer(tok) {
        const esc = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        return `<div class="mermaid">${esc(tok.text)}</div>\n`;
      }
    };

    const md = new marked.Marked()
      .use((footnoteMod.default ?? footnoteMod)())
      .use((alertMod.default ?? alertMod)()) // keeps the nice “Note/Tip/Warning/Danger” syntax
      .use((emojiMod.markedEmoji ?? emojiMod.default)({ emojis: Emojis, renderer: t => t.emoji }))
      .use({ extensions: [
        mermaidExt,
        createInline({ name: 'mark', delimiter: '==', tag: 'mark', hint: '=' }),
        createInline({ name: 'sup',  delimiter: '^',  tag: 'sup',  notAfterOpen: '\\[|\\^' }),
        createInline({ name: 'sub',  delimiter: '~',  tag: 'sub' }),
        createInline({ name: 'u',    delimiter: '++', tag: 'u',    hint: '+' }),
        calloutExt,
        spoilerExt,
      ]});

    // Lazy render Mermaid nodes inside a container, sequentially for reliability
    async function renderMermaidLazy(root) {
      const nodes = [...(root || DOC).querySelectorAll('.mermaid')];
      if (!nodes.length) return;
      async function renderOne(el) {
        if (el.dataset.mmdDone === '1') return;
        if (!el.dataset.mmdSrc) el.dataset.mmdSrc = el.textContent;
        // reset any previous render
        if (el.querySelector('svg')) el.innerHTML = el.dataset.mmdSrc;
        el.removeAttribute('data-processed'); // mermaid’s own flag
        el.dataset.mmdDone = '1';
        // wait until Mermaid marks processed or svg appears
        const done = new Promise(res => {
          const t = setInterval(() => {
            if (el.getAttribute('data-processed') === 'true' || el.querySelector('svg')) {
              clearInterval(t); res();
            }
          }, 50);
          setTimeout(() => { clearInterval(t); res(); }, 4000);
        });
        try { await mermaid.run({ nodes: [el] }); } catch {}
        await done;
      }
      for (const el of nodes) { try { await renderOne(el); } catch {} }
    }

    function setMermaidTheme(mode) { mermaid.initialize({ startOnLoad: false, theme: mode }); }

    return {
      parse: (src, opt) => md.parse(src, { ...opt, mangle: false }),
      renderMermaidLazy,
      setMermaidTheme,
    };
  });

  return _mdReady;
}

/* ───────────────────── page HTML cache + helpers ───────────────────────── */
const PAGE_HTML_LRU_MAX = 40;
const pageHTMLLRU = new Map(); // page.id -> html

async function getParsedHTML(page) {
  if (pageHTMLLRU.has(page.id)) {
    const html = pageHTMLLRU.get(page.id);
    // refresh LRU order
    pageHTMLLRU.delete(page.id);
    pageHTMLLRU.set(page.id, html);
    return html;
  }
  const { parse } = await ensureMarkdown();
  const tmp = el('div');
  tmp.innerHTML = parse(page.content, { headerIds: false });
  numberHeadings(tmp); // generate deterministic IDs h1..h6 → 1, 1_1, 1_2, 2, ...

  const html = tmp.innerHTML;
  pageHTMLLRU.set(page.id, html);
  if (pageHTMLLRU.size > PAGE_HTML_LRU_MAX) {
    const firstKey = pageHTMLLRU.keys().next().value;
    pageHTMLLRU.delete(firstKey);
  }
  return html;
}

/** Number headings deterministically for deep-linking. */
function numberHeadings(rootEl) {
  const counters = [0,0,0,0,0,0,0]; // H1..H6
  $$('#content h1, #content h2, #content h3, #content h4, #content h5, #content h6', rootEl).forEach(h => {
    if (h.id) return; // honor precomputed ids if any
    const level = +h.tagName[1] - 1;
    counters[level]++;
    for (let i = level + 1; i < 7; i++) counters[i] = 0;
    h.id = counters.slice(0, level + 1).filter(Boolean).join('_');
  });
}

/** Rewrite bare #anchors to be page-local (and fix footnote links). */
function normalizeAnchors(container, page, { onlyFootnotes = false } = {}) {
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
    // If the hash doesn't resolve to a page path, make it local to this page
    if (!parseTarget(href)) {
      const frag = href.length > 1 ? ('#' + href.slice(1)) : '';
      a.setAttribute('href', '#' + base + frag);
    }
  });
}

/** Add copy buttons to code blocks and heading-anchor copy buttons. */
function enhanceCopyUX(container) {
  // code blocks
  $$('pre', container).forEach(pre => {
    if (pre.querySelector('.km-copy')) return;
    const btn = el('button', { class: 'km-copy', type: 'button', title: 'Copy code', 'aria-label': 'Copy code' }, 'Copy');
    btn.addEventListener('click', () => {
      const code = pre.querySelector('code');
      copyText(code ? code.innerText : pre.innerText || '', btn);
    });
    pre.append(btn);
  });
  // headings
  $$(HEADINGS_SEL, container).forEach(h => {
    if (h.querySelector('.km-copy-anchor')) return;
    const btn = el('button', { class: 'km-copy-anchor', type: 'button', title: 'Copy link', 'aria-label': 'Copy link' }, '¶');
    btn.addEventListener('click', () => {
      const base = (location.href.replace(/#.*$/, '') + '#' + (h.id || ''));
      copyText(base, btn);
    });
    h.append(btn);
  });
}

async function highlightCode(container) {
  const hljs = await ensureHighlight();
  $$('pre code', container).forEach(block => {
    try { hljs.highlightElement(block); } catch {}
  });
}

function renderMathSafe(container) {
  try {
    if (container.dataset.mathRendered === '1') return;
    window.renderMathInElement?.(container, {
      delimiters: [
        { left: '$$',  right: '$$',  display: true  },
        { left: '\\[', right: '\\]', display: true  },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
    });
    container.dataset.mathRendered = '1';
  } catch {}
}

/* ───────────────────────────── public API ──────────────────────────────── */
export async function showPage(page, anchor = '') {
  const host = $('#content') || DOC.body;

  // 1) Parse (or reuse cached) HTML and inject
  const html = await getParsedHTML(page);
  host.innerHTML = html;

  // 2) Mermaid diagrams (sequential + lazy)
  const { renderMermaidLazy } = await ensureMarkdown();
  await renderMermaidLazy(host);

  // 3) Footnote + internal anchor normalization
  normalizeAnchors(host, page);
  normalizeAnchors(host, page, { onlyFootnotes: true });

  // 4) Syntax highlighting + copy UX
  await highlightCode(host);
  enhanceCopyUX(host);

  // 5) KaTeX (optional)
  await ensureKatex();
  renderMathSafe(host);

  // 6) Scroll to anchor (if any)
  if (anchor) {
    const h = $(HEADINGS_SEL, host.parentElement) && DOC.getElementById(anchor);
    if (h) {
      // slight delay helps after images/formulas render
      whenIdle(() => { h.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 250);
    }
  } else {
    host.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  // 7) Optional: click on internal links should route through hash
  host.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (ev) => {
      // Allow default; index.js router will handle hashchange and re-render.
      // This handler exists mainly to avoid full page reloads on malformed hrefs.
      ev.stopPropagation();
    });
  });
}

/* ───────────────────────── clipboard helper ────────────────────────────── */
async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) flash(btn, 'Copied!');
  } catch {
    // Fallback (older browsers)
    const ta = el('textarea', { style: 'position:fixed;opacity:0' }, text);
    DOC.body.appendChild(ta); ta.select();
    try { DOC.execCommand('copy'); if (btn) flash(btn, 'Copied!'); } catch {}
    ta.remove();
  }
}
function flash(btn, msg) {
  const prev = btn.textContent; btn.textContent = msg;
  setTimeout(() => { btn.textContent = prev; }, 900);
}
