/* eslint-env browser, es2022 */
'use strict';

import { DOC, $, $$, el, iconBtn, ICONS_PUBLIC as ICONS, copyText, baseURLNoHash, HEADINGS_SEL } from './config_dom.js';
import { __model, setHTMLLRU, getFromHTMLLRU } from './model.js';
import { ensureMarkdown, ensureHighlight } from './loaders.js';
import { parseTarget } from './router_renderer.js';

// ───────────────────── Observer tracking (prevents leaks) ─────────────────────
const __OBS_BY_ROOT = new WeakMap();
export function __trackObserver(o, root = document) {
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

// ───────────────────────────── Markdown → HTML ─────────────────────────────
/** Parse + postprocess a page into HTML once, with a small in-memory LRU. */
export async function getParsedHTML(page) {
  const cached = getFromHTMLLRU(page.id);
  if (cached) return cached;

  const { parse } = await ensureMarkdown();
  // Number headings before we add ids from Marked's output:
  // Marked doesn’t generate deterministic ids for custom headings, so we
  // number after parsing by walking the DOM fragment.
  const html = parse(page.content);
  const div = DOC.createElement('div');
  div.innerHTML = html;

  // Deterministic heading ids (only if not already present)
  numberHeadings(div);

  const out = div.innerHTML;
  setHTMLLRU(page.id, out);
  return out;
}

// ─────────────────────────── Decorations & utilities ──────────────────────────
/** Ensure external links open safely. */
export function decorateExternalLinks(containerEl = DOC) {
  $$('a[href^="http"]', containerEl).forEach(a => {
    try {
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin) {
        a.target = '_blank';
        const rel = (a.getAttribute('rel') || '').split(/\s+/);
        if (!rel.includes('noopener')) rel.push('noopener');
        if (!rel.includes('noreferrer')) rel.push('noreferrer');
        a.setAttribute('rel', rel.join(' ').trim());
      }
    } catch {}
  });
}

/** Turn in-article anchors into page-local ones when they wouldn’t resolve. */
export function normalizeAnchors(container = $('#content'), page, { onlyFootnotes = false } = {}) {
  const base = page?.hash || '';
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
    // If link wouldn't resolve to a page, rewrite as in-page anchor on this page.
    try {
      const target = window.location.href.replace(/#.*$/, '') + href;
      new URL(target);
      // If our router wouldn’t resolve this hash as a page, rewrite to local anchor
      const looksLikeOnlyAnchor = !href.slice(1).includes('#'); // "#something"
      if (looksLikeOnlyAnchor) a.setAttribute('href', `#${base}${href}`);
    } catch {}
  });
}

/** Mark internal hash links as previewable (hover-to-preview). */
export function annotatePreviewableLinks(container = $('#content')) {
  if (!container) return;
  let seq = 0, stamp = Date.now().toString(36);
  container.querySelectorAll('a[href^="#"]').forEach(a => {
    const href = a.getAttribute('href') || '';
    if (parseTarget(href)) {
      a.classList.add('km-has-preview');
      a.dataset.preview = '1';
      if (!a.id) a.id = `km-prev-${stamp}-${seq++}`;
      if (!a.title) a.title = 'Preview on hover';
    }
  });
}

/** Number headings h1–h5 in a deterministic "1_2_3" style if no id exists. */
export function numberHeadings(elm) {
  const counters = [0, 0, 0, 0, 0, 0, 0];
  $$(HEADINGS_SEL, elm).forEach(h => {
    if (h.id) return;
    const level = +h.tagName[1] - 1;
    counters[level]++;
    for (let i = level + 1; i < 7; i++) counters[i] = 0;
    h.id = counters.slice(0, level + 1).filter(Boolean).join('_');
  });
}

/** Lazy-highlight code blocks with highlight.js when they enter the viewport. */
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

/** Optional execution of <script> tags inside rendered Markdown. */
export function runInlineScripts(root) {
  root.querySelectorAll('script').forEach(old => {
    const s = document.createElement('script');
    for (const { name, value } of [...old.attributes]) s.setAttribute(name, value);
    s.textContent = old.textContent || '';
    old.replaceWith(s); // inserting a new <script> runs it
  });
}

/** Add anchor-copy buttons on headings and small polish for headings content. */
export function decorateHeadings(page, container = DOC) {
  $$(HEADINGS_SEL, container).forEach(h => {
    // Avoid double-wiring
    if (h.dataset.kmHeadDone === '1') return;
    h.dataset.kmHeadDone = '1';

    const btn = iconBtn('Copy link', ICONS.link, 'heading-copy');
    const wrap = el('span', { class: 'heading-tools' }, btn);
    h.append(wrap);
  });
}

/** Add "Copy" buttons and (optional) language badges to code blocks. */
export function decorateCodeBlocks(container = DOC) {
  container.querySelectorAll('pre').forEach(pre => {
    if (pre.dataset.kmCodeDone === '1') return;
    pre.dataset.kmCodeDone = '1';
    const first = pre.querySelector('code');
    const btn = iconBtn('Copy code', ICONS.code, 'code-copy');
    const header = el('div', { class: 'code-tools' }, btn);

    // Optional language label
    const lang = first?.className?.match(/\blanguage-([\w-]+)/)?.[1];
    if (lang) header.prepend(el('span', { class: 'lang', textContent: lang }));

    pre.prepend(header);
  });
}

/** Render KaTeX math inline/block safely when/if loaded. */
export function renderMathSafe(container = DOC) {
  try {
    if (!container || container.dataset.mathRendered === '1') return;
    if (typeof window.renderMathInElement === 'function') {
      window.renderMathInElement(container, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\[', right: '\\]', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
        ],
      });
      container.dataset.mathRendered = '1';
    }
  } catch {}
}

/** Copy-button wiring shared across main content and previews. */
export function wireCopyButtons(root, getBaseUrl) {
  if (!root) return;
  root.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('button.heading-copy, button.code-copy');
    if (!btn) return;
    if (btn.classList.contains('heading-copy')) {
      const h = btn.closest(HEADINGS_SEL);
      if (!h) return;
      const base = getBaseUrl() || (baseURLNoHash() + '#');
      copyText(base + h.id, btn);
    } else {
      const pre = btn.closest('pre');
      const code = pre?.querySelector('code');
      copyText(code ? code.innerText : pre?.innerText || '', btn);
    }
  });
}
