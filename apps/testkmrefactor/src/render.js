// src/render.js
import {
  KM, DOC, $, $$, el,
  __VPW, __VPH, __trackObserver, __cleanupObservers,
  baseURLNoHash, whenIdle, clearSelection,
  ICONS, iconBtn, wireCopyButtons, numberHeadings, decorateExternalLinks,
  HEADINGS_SEL,
} from './dom.js';

import {
  CFG, TITLE, ALLOW_JS_FROM_MD,
  PAGE_HTML_LRU_MAX, pageHTMLLRU,
  root, hashOf, buildDeepURL, parseTarget,
} from './data.js';

/* ───────────────────────────── Markdown + Mermaid ─────────────────────────── */

let __mdOnce;
function ensureOnce(fn) { let p; return () => (p ??= fn()); }

export const ensureMarkdown = ensureOnce(async () => {
  // marked + plugins (via ESM from CDN)
  const [{ marked }, { default: mkAlert }, { markedFootnote }, { markedEmoji }, emojilib] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/marked@14.1.2/lib/marked.esm.js'),
    import('https://cdn.jsdelivr.net/npm/marked-alert@2.0.1/+esm'),
    import('https://cdn.jsdelivr.net/npm/marked-footnote@1.2.2/+esm'),
    import('https://cdn.jsdelivr.net/npm/marked-emoji@1.2.2/+esm'),
    import('https://cdn.jsdelivr.net/npm/emojilib@3.0.12/index.js'),
  ]);

  // Mermaid (lazy; we’ll drive rendering explicitly)
  let __mermaid;
  async function getMermaid() {
    if (__mermaid) return __mermaid;
    const { default: mermaid } = await import('https://cdn.jsdelivr.net/npm/mermaid@11.3.0/dist/mermaid.esm.min.mjs');
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' });
    __mermaid = mermaid;
    return mermaid;
  }

  function setMermaidTheme(theme) {
    if (!__mermaid) return;
    __mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme });
  }

  async function renderMermaidLazy(container) {
    const blocks = [...container.querySelectorAll('pre.mermaid, .mermaid')];
    if (!blocks.length) return;
    const mermaid = await getMermaid();
    // Render sequentially to avoid layout thrash; still non-blocking overall.
    for (const src of blocks) {
      if (src.dataset.mRendered === '1') continue;
      try {
        const txt = src.tagName === 'PRE' ? (src.textContent || '') : src.textContent || '';
        const wrap = el('div', { class: 'mermaid' });
        wrap.textContent = txt;
        src.replaceWith(wrap);
        await mermaid.run({ nodes: [wrap] });
        wrap.dataset.mRendered = '1';
      } catch (e) {
        console.warn('Mermaid render failed:', e);
      }
    }
  }

  // Small inline extensions (mark, sup, sub, underline)
  const markExt = {
    name: 'mark',
    level: 'inline',
    start: (src) => src.indexOf('=='),
    tokenizer(src) {
      const m = src.match(/^==([\s\S]+?)==/);
      if (m) return { type: 'mark', raw: m[0], text: m[1] };
    },
    renderer(tok) { return `<mark>${marked.parseInline(tok.text)}</mark>`; }
  };
  const supExt = {
    name: 'sup',
    level: 'inline',
    start: (src) => src.indexOf('^('),
    tokenizer(src) {
      const m = src.match(/^\^\((.+?)\)/);
      if (m) return { type: 'sup', raw: m[0], text: m[1] };
    },
    renderer(tok) { return `<sup>${marked.parseInline(tok.text)}</sup>`; }
  };
  const subExt = {
    name: 'sub',
    level: 'inline',
    start: (src) => src.indexOf('~('),
    tokenizer(src) {
      const m = src.match(/^~\((.+?)\)/);
      if (m) return { type: 'sub', raw: m[0], text: m[1] };
    },
    renderer(tok) { return `<sub>${marked.parseInline(tok.text)}</sub>`; }
  };
  const underlineExt = {
    name: 'underline',
    level: 'inline',
    start: (src) => src.indexOf('__'),
    tokenizer(src) {
      const m = src.match(/^__([\s\S]+?)__/);
      if (m) return { type: 'underline', raw: m[0], text: m[1] };
    },
    renderer(tok) { return `<u>${marked.parseInline(tok.text)}</u>`; }
  };

  // Mermaid fence extension → emit <pre class="mermaid"> to be rendered later
  const mermaidExt = {
    name: 'fence_mermaid',
    level: 'block',
    tokenizer(src) {
      const m = src.match(/^```mermaid\s*?\n([\s\S]*?)\n```/);
      if (!m) return;
      return { type: 'fence_mermaid', raw: m[0], text: m[1] };
    },
    renderer(tok) { return `<pre class="mermaid">${tok.text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre>`; }
  };

  marked.use(
    mkAlert(), // :::info/warn/...
    markedFootnote(),
    markedEmoji({ emojis: emojilib, unicode: true }),
    { extensions: [markExt, supExt, subExt, underlineExt, mermaidExt] },
  );
  marked.setOptions({
    gfm: true,
    mangle: false,
    breaks: false,
    headerIds: false, // we generate deterministic ids ourselves
  });

  function parse(md) { return marked.parse(md || ''); }

  return { parse, renderMermaidLazy, setMermaidTheme };
});

/* Mermaid theme swap used by UI theme toggle */
export async function syncMermaidThemeWithPage() {
  const { setMermaidTheme } = await ensureMarkdown();
  const isDark = DOC.documentElement.getAttribute('data-theme') === 'dark';
  setMermaidTheme(isDark ? 'dark' : 'default');
}

/* ─────────────────────────────── KaTeX (math) ─────────────────────────────── */

const KATEX_OPTS = {
  throwOnError: false,
  strict: 'ignore',
  trust: false,
  output: 'html',
  globalGroup: true,
  macros: {},
};

export const ensureKatex = ensureOnce(async () => {
  const [{ default: renderMathInElement }, katex] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.mjs'),
    import('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.mjs'),
  ]);
  // CSS theme is handled via site CSS (you likely already include KaTeX CSS)
  return { renderMathInElement, katex };
});

export async function renderMathSafe(container = $('#content')) {
  if (!container || container.dataset.mathRendered === '1') return;
  try {
    const { renderMathInElement } = await ensureKatex();
    renderMathInElement(container, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
      ],
      ...KATEX_OPTS
    });
    container.dataset.mathRendered = '1';
  } catch (e) {
    console.warn('KaTeX render failed:', e);
  }
}

/* ───────────────────────────── Highlight.js (code) ─────────────────────────── */

export const ensureHighlight = ensureOnce(async () => {
  // core + common languages
  const [{ default: hljs }] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/es/core.min.js'),
    // languages (on demand if you want specific ones)
    import('https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/es/languages/javascript.min.js').then(m => hljs.registerLanguage('javascript', m.default)),
    import('https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/es/languages/typescript.min.js').then(m => hljs.registerLanguage('typescript', m.default)),
    import('https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/es/languages/json.min.js').then(m => hljs.registerLanguage('json', m.default)),
    import('https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/es/languages/shell.min.js').then(m => hljs.registerLanguage('shell', m.default)),
    import('https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/es/languages/bash.min.js').then(m => hljs.registerLanguage('bash', m.default)),
    import('https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/es/languages/markdown.min.js').then(m => hljs.registerLanguage('markdown', m.default)),
    import('https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/es/languages/xml.min.js').then(m => hljs.registerLanguage('xml', m.default)),
    import('https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/es/languages/css.min.js').then(m => hljs.registerLanguage('css', m.default)),
    import('https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/es/languages/python.min.js').then(m => hljs.registerLanguage('python', m.default)),
  ]);
  // expose for highlightElement
  window.hljs = hljs;
  return hljs;
});

export async function ensureHLJSTheme() {
  // swap stylesheet depending on theme
  const id = 'hljs-theme';
  const dark = DOC.documentElement.getAttribute('data-theme') === 'dark';
  const href = dark
    ? 'https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/styles/github-dark.min.css'
    : 'https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/styles/github.min.css';
  let link = DOC.getElementById(id);
  if (!link) {
    link = el('link', { id, rel: 'stylesheet', href });
    DOC.head.appendChild(link);
  } else if (link.href !== href) {
    link.href = href;
  }
}

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

/* ───────────────────────────── HTML parse + LRU ───────────────────────────── */

export async function getParsedHTML(page) {
  // LRU get
  if (pageHTMLLRU.has(page)) {
    const html = pageHTMLLRU.get(page);
    // refresh recency
    pageHTMLLRU.delete(page);
    pageHTMLLRU.set(page, html);
    return html;
  }
  const { parse } = await ensureMarkdown();
  const html = parse(page.content || '');
  // post-process ids deterministically so deep links remain stable
  const tmp = el('div');
  tmp.innerHTML = html;
  numberHeadings(tmp);
  const out = tmp.innerHTML;
  pageHTMLLRU.set(page, out);
  // cap size
  while (pageHTMLLRU.size > PAGE_HTML_LRU_MAX) {
    const k = pageHTMLLRU.keys().next().value;
    pageHTMLLRU.delete(k);
  }
  return out;
}

/* ───────────────────────────── Content decoration ─────────────────────────── */

export function normalizeAnchors(containerEl, page, { onlyFootnotes = false } = {}) {
  $$('a[href]', containerEl).forEach(a => {
    const href = a.getAttribute('href') || '';
    if (!href.startsWith('#')) return;
    // skip footnote refs if not requested
    const isFoot = /^#fn/.test(href) || /^#fnref/.test(href);
    if (onlyFootnotes && !isFoot) return;
    a.setAttribute('href', buildDeepURL(page, href.slice(1)));
  });
}

export function annotatePreviewableLinks(containerEl) {
  $$('a[href^="#"]', containerEl).forEach(a => {
    const h = a.getAttribute('href') || '';
    // avoid footnote jumps (not previewed)
    if (/^#fn/.test(h) || /^#fnref/.test(h)) return;
    a.classList.add('km-previewable');
  });
}

export function decorateHeadings(page, container = $('#content')) {
  const base = () => buildDeepURL(page, '') || (baseURLNoHash() + '#');
  $$(HEADINGS_SEL, container).forEach(h => {
    if (h.querySelector('button.heading-copy')) return; // idempotent
    const btn = iconBtn('Copy link', ICONS.link, 'heading-copy');
    h.append(btn);
    // a11y + quick copy via middle click on heading text
    h.addEventListener('auxclick', (e) => {
      if (e.button !== 1) return;
      if (window.getSelection && String(window.getSelection()).length) return;
      clearSelection();
      const url = base() + h.id;
      navigator.clipboard?.writeText?.(url);
    }, { passive: true });
  });
  wireCopyButtons(container, base);
}

export function decorateCodeBlocks(container = $('#content')) {
  $$('pre', container).forEach(pre => {
    if (pre.classList.contains('mermaid')) return; // will render later
    if (pre.querySelector('button.code-copy')) return;
    pre.append(iconBtn('Copy code', ICONS.code, 'code-copy'));
  });
}

/* ───────────────────────────── Prev/Next + See also ───────────────────────── */

export function prevNext(page) {
  $('#prev-next')?.remove();
  if (!page.parent) return;
  if (page.parent === root) { if (page.isSecondary) return; } // no prev/next for promoted reps

  const siblings = page.parent.children.filter(c => !(page.parent === root && c.isSecondary));
  const idx = siblings.indexOf(page);
  const prev = siblings[idx - 1];
  const next = siblings[idx + 1];

  if (!prev && !next) return;

  const nav = el('nav', { id: 'prev-next', 'aria-label': 'Article navigation' });
  if (prev) nav.append(el('a', { class: 'prev', href: '#' + hashOf(prev) }, ['← ', prev.title]));
  if (next) nav.append(el('a', { class: 'next', href: '#' + hashOf(next) }, [next.title, ' →']));
  $('#content')?.append(nav);
}

export function seeAlso(page) {
  $('#see-also')?.remove();
  const list = page?.seeAlso || [];
  if (!list.length) return;

  const sec = el('section', { id: 'see-also' }, [
    el('h3', { textContent: 'See also' })
  ]);
  const ul = el('ul');
  for (const p of list) {
    ul.append(el('li', {}, [
      el('a', { href: '#' + hashOf(p), textContent: p.title })
    ]));
  }
  sec.append(ul);
  $('#content')?.append(sec);
}

/* ───────────────────────────── Inline <script> opt-in ─────────────────────── */

function runInlineScripts(root) {
  root.querySelectorAll('script').forEach(old => {
    const s = document.createElement('script');
    for (const { name, value } of [...old.attributes]) s.setAttribute(name, value);
    s.textContent = old.textContent || '';
    old.replaceWith(s); // new <script> executes when inserted
  });
}

/* ───────────────────────────── Enhance + Render + Scroll ─────────────────── */

export async function enhanceRendered(containerEl, page) {
  decorateExternalLinks(containerEl);

  // Progressive images
  $$('img', containerEl).forEach((img, i) => {
    img.loading = 'lazy';
    img.decoding = 'async';
    if (!img.hasAttribute('fetchpriority') && i < 2) img.setAttribute('fetchpriority', 'high');
  });

  // Normalize footnotes only for main content pass
  normalizeAnchors(containerEl, page, { onlyFootnotes: true });

  // mark in-article hash links as previewable
  annotatePreviewableLinks(containerEl);

  // Start non-critical work without blocking
  highlightVisibleCode(containerEl); // lazy HLJS

  ensureMarkdown().then(({ renderMermaidLazy }) => renderMermaidLazy(containerEl));

  // Defer math; render once visible-ish
  if (/(\$[^$]+\$|\\\(|\\\[)/.test(page.content || '')) {
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

export async function render(page, anchor) {
  const contentEl = $('#content');
  if (!contentEl) return;
  __cleanupObservers(); // avoid leaks between renders

  contentEl.dataset.mathRendered = '0';
  contentEl.innerHTML = await getParsedHTML(page);

  if (ALLOW_JS_FROM_MD === 'true') {
    runInlineScripts(contentEl);
  }

  await enhanceRendered(contentEl, page);

  // ToC lives in UI module → it can react to this event and rebuild.
  document.dispatchEvent(new CustomEvent('km:content-rendered', { detail: { page } }));

  prevNext(page);
  seeAlso(page);

  scrollToAnchor(anchor);
}

export function scrollToAnchor(anchor) {
  if (!anchor) return;
  const target = DOC.getElementById(anchor);
  if (target) target.scrollIntoView({ behavior: 'smooth' });
}

// Convenience wiring for copy buttons in main content (same as monolith init did)
whenIdle(() => {
  wireCopyButtons($('#content'), () => {
    const t = parseTarget(location.hash);
    return buildDeepURL(t?.page || root, '') || (baseURLNoHash() + '#');
  });
});

export {
  KATEX_OPTS, // exported for parity/testing if needed
};
