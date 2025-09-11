/* eslint-env browser, es2022 */
'use strict';

import { DOC, LANGS } from './config_dom.js';

// Keep tiny global surface
const KM = (window.KM = window.KM || {});

// Utility: ensureOnce – run an async loader at most once.
export const ensureOnce = (fn) => {
  let p;
  return () => (p ||= fn());
};

// ─────────────────────────────── D3 (subset) ────────────────────────────────
KM.ensureD3 = ensureOnce(async () => {
  // Load only what we use: selection, force, drag
  const [{ select, selectAll }, force, { drag }] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/d3-selection@3/+esm'),
    import('https://cdn.jsdelivr.net/npm/d3-force@3/+esm'),
    import('https://cdn.jsdelivr.net/npm/d3-drag@3/+esm'),
  ]);

  KM.d3 = {
    select,
    selectAll,
    forceSimulation: force.forceSimulation,
    forceLink: force.forceLink,
    forceManyBody: force.forceManyBody,
    forceCenter: force.forceCenter,
    drag,
  };
});

// ─────────────────────────── highlight.js (core) ────────────────────────────
KM.ensureHighlight = ensureOnce(async () => {
  const { default: hljs } =
    await import('https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/es/core/+esm');

  if (Array.isArray(LANGS) && LANGS.length) {
    await Promise.allSettled(
      LANGS.map(async (lang) => {
        try {
          const mod = await import(
            `https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/es/languages/${lang}/+esm`
          );
          hljs.registerLanguage(lang, mod.default);
        } catch {
          // ignore unknown language id
        }
      })
    );
  }

  // Expose globally for on-demand highlighting
  window.hljs = hljs;
  return hljs;
});

/** Swap highlight.js theme based on page theme. */
KM.ensureHLJSTheme = ensureOnce(async () => {
  // Create <link id="hljs-theme"> once; href is managed by sync below.
  const id = 'hljs-theme';
  let link = DOC.getElementById(id);
  if (!link) {
    link = DOC.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    DOC.head.appendChild(link);
  }
  // Immediate sync (and leave KM.syncMermaidThemeWithPage to keep in line later)
  const onTheme = () => {
    const dark = DOC.documentElement.getAttribute('data-theme') === 'dark';
    link.href = dark
      ? 'https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github-dark-dimmed.min.css'
      : 'https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github.min.css';
  };
  onTheme();
  return { sync: onTheme };
});

// ───────────────────── Markdown (marked) + Mermaid helper ───────────────────
KM.ensureMarkdown = ensureOnce(async () => {
  const [{ marked }] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/marked@12.0.2/+esm'),
  ]);

  // Basic, fast Markdown → HTML (no XSS filtering here; content assumed trusted)
  const parse = (md) => marked.parse(md ?? '');

  async function ensureMermaid() {
    if (window.mermaid) return window.mermaid;
    const mermaid = await import('https://cdn.jsdelivr.net/npm/mermaid@10.9.1/+esm');
    // Default theme will be synced shortly
    window.mermaid = mermaid.default || mermaid;
    window.mermaid.initialize({ startOnLoad: false, theme: 'default' });
    return window.mermaid;
  }

  /** Find ```mermaid``` blocks and render them in-place lazily. */
  async function renderMermaidLazy(root) {
    if (!root) return;
    const blocks = root.querySelectorAll('pre > code.language-mermaid');
    if (!blocks.length) return;

    const mermaid = await ensureMermaid();
    KM.syncMermaidThemeWithPage?.();

    let seq = 0;
    for (const code of blocks) {
      const pre = code.closest('pre');
      const src = code.textContent || '';
      const mount = DOC.createElement('div');
      mount.className = 'mermaid';
      pre.replaceWith(mount);
      try {
        const { svg } = await mermaid.render(`m-${Date.now().toString(36)}-${seq++}`, src);
        mount.innerHTML = svg;
      } catch (err) {
        mount.innerHTML = `<pre class="mermaid-error">${String(err?.message || err)}</pre>`;
      }
    }
  }

  return { parse, renderMermaidLazy };
});

// Keep Mermaid theme aligned with page theme (called on theme toggle too)
KM.syncMermaidThemeWithPage = () => {
  const m = window.mermaid;
  if (!m?.initialize) return;
  const dark = DOC.documentElement.getAttribute('data-theme') === 'dark';
  m.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default' });
};

// ─────────────────────────────────── KaTeX ───────────────────────────────────
KM.ensureKatex = ensureOnce(async () => {
  // CSS first
  const link = DOC.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
  DOC.head.appendChild(link);

  // Core + auto-render
  const [{ default: katex }, { default: autoRender }] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.mjs'),
    import('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.mjs'),
  ]);

  // Provide renderMathInElement like MathJax's API (used by markdown.js)
  window.renderMathInElement = (root, opts) => autoRender(root, opts);
  window.katex = katex;
  return { katex, autoRender };
});

// ────────────────────────────── Small helpers ────────────────────────────────
// Used by markdown.js to decide if a link should get hover previews.
KM.isInternalPageLink = (aEl) => {
  const href = aEl.getAttribute('href') || '';
  return href.startsWith('#');
};
