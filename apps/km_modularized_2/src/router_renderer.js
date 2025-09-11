// router_renderer.js
/* eslint-env browser, es2022 */
'use strict';

import { DOC, $, $$, el, baseURLNoHash } from './config_dom.js';
import { __model, find, hashOf } from './model.js';
import { getParsedHTML, normalizeAnchors, wireCopyButtons } from './markdown.js';
import { buildToc, prevNext, seeAlso, breadcrumb, highlightSidebar } from './ui.js';

// ───────────────────────────── targets & URLs ─────────────────────────────
export function parseTarget(href) {
  const raw = String(href ?? location.hash || '').replace(/^#/, '');
  if (!raw) {
    const first = __model.root?.children?.[0] || __model.pages.find(p => p !== __model.root);
    return first ? { page: first, anchor: '' } : null;
  }
  const parts = raw.split('#');
  // Cases:
  //   '#page#anchor' -> [page, anchor]
  //   '#page'        -> [page]
  //   '#anchor'      -> [anchor] (same page)
  let page = null, anchor = '';
  if (parts.length === 1) {
    // ambiguous: could be page or anchor → prefer page match
    page = find(parts[0]) || null;
    if (!page) anchor = parts[0];
  } else {
    page = find(parts[0]) || null;
    anchor = parts.slice(1).join('#'); // preserve nested ids if any
  }
  if (!page) page = __model.root?.children?.[0] || __model.pages.find(p => p !== __model.root) || null;
  return page ? { page, anchor } : null;
}

export function buildDeepURL(page, anchor) {
  const t = page ? { page, anchor: anchor ?? '' } : parseTarget(location.hash);
  const h = t?.page ? hashOf(t.page) : '';
  const a = anchor;
  const base = baseURLNoHash();
  if (!h) return base + '#';
  if (a === '') return `${base}#${h}#`;       // force trailing '#'
  if (a) return `${base}#${h}#${a}`;
  return `${base}#${h}`;
}

// ───────────────────────────── rendering helpers ─────────────────────────
export async function enhanceRendered(root, page) {
  if (!root) return;

  // Syntax highlighting
  try {
    await window.KM.ensureHighlight?.();
    await window.KM.ensureHLJSTheme?.();
    $$(root, 'pre code').forEach((c) => {
      try { window.hljs?.highlightElement?.(c); } catch {}
    });
  } catch {}

  // KaTeX (only once per container)
  try {
    if (root.dataset.mathRendered !== '1') {
      await window.KM.ensureKatex?.();
      window.renderMathInElement?.(root, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\[', right: '\\]', display: true },
          { left: '$',  right: '$',  display: false },
          { left: '\\(', right: '\\)', display: false },
        ],
        throwOnError: false,
      });
      root.dataset.mathRendered = '1';
    }
  } catch {}

  // Mermaid
  try {
    const { renderMermaidLazy } = await window.KM.ensureMarkdown?.();
    await renderMermaidLazy(root);
  } catch {}
}

async function renderPageInto(page, anchor) {
  const host = $('#content');
  if (!host) return;

  host.setAttribute('aria-busy', 'true');

  // Parse and inject HTML
  const html = await getParsedHTML(page);
  host.innerHTML = html;
  normalizeAnchors(host, page);

  // Enhance (hljs, katex, mermaid)
  await enhanceRendered(host, page);

  // Copy buttons for headings/code
  wireCopyButtons(host, () => buildDeepURL(page, ''));

  // Ancillaries
  buildToc();
  prevNext(page);
  seeAlso(page);
  breadcrumb(page);
  highlightSidebar(page);

  // Scroll to anchor if present
  await new Promise(r => requestAnimationFrame(r));
  if (anchor) {
    const t = host.querySelector('#' + CSS.escape(anchor));
    if (t) t.scrollIntoView({ block: 'start' });
  } else {
    // If the hash had no deep anchor, reset scroll near top
    host.scrollTo?.({ top: 0, behavior: 'auto' });
  }

  host.setAttribute('aria-busy', 'false');

  // Announce
  host.setAttribute('aria-live', 'polite');
  host.setAttribute('aria-label', page.title || 'Page');
}

// ───────────────────────────── router ───────────────────────────────────
export async function route() {
  const t = parseTarget(location.hash);
  if (!t?.page) {
    showNotFound();
    return;
  }
  try { await renderPageInto(t.page, t.anchor); }
  catch (e) { showError(e); }
}

function showNotFound() {
  const host = $('#content');
  if (!host) return;
  host.innerHTML = `<h1>Not found</h1><p>The requested page does not exist.</p>`;
}

function showError(err) {
  const host = $('#content');
  if (!host) return;
  host.innerHTML = `<h1>Failed to render</h1><pre>${String(err?.message || err)}</pre>`;
}
