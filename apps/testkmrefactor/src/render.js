// render.js

// Import utilities from helpers and data modules
import { $, $$, el, clearSelection, baseURLNoHash, HEADINGS_SEL, decorateHeadings, decorateCodeBlocks, decorateExternalLinks, wireCopyButtons } from './helpers.js';
import { hashOf, buildDeepURL, BACKLINKS } from './data.js';

// Import libraries for markdown, diagrams, highlighting, and math
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@5.2.0/marked.esm.js';
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
import { renderMathInElement } from 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/contrib/auto-render.mjs';

// Initialize Mermaid (disable startOnLoad since we'll call it manually)
mermaid.initialize({ startOnLoad: false });
// Configure KaTeX render options (include $$ and $ delimiters, no errors)
const katexOptions = {
  delimiters: [
    { left: '$$', right: '$$', display: true },
    { left: '\\[', right: '\\]', display: true },
    { left: '\\(', right: '\\)', display: false },
    { left: '$', right: '$', display: false }
  ],
  throwOnError: false
};

/**
 * Smooth-scroll to an element with the given ID.
 * @param {string} id - The anchor ID to scroll to.
 */
function scrollToAnchor(id) {
  if (!id) return;
  const target = document.getElementById(id);
  if (target) {
    // Collapse any selection for good measure
    clearSelection();
    target.scrollIntoView({ behavior: 'smooth' });
  }
}

/**
 * Build or update the Table of Contents for the current page.
 * It looks for all headings in #content and creates a list in #toc.
 * Also sets up IntersectionObserver to highlight the section in view:contentReference[oaicite:12]{index=12}.
 * @param {Object} page - The page object (used for hash base).
 */
function buildToc(page) {
  const tocEl = $('#toc');
  if (!tocEl) return;
  // Clear existing TOC
  tocEl.innerHTML = '';

  // Find all headings in content
  const contentEl = $('#content');
  const heads = contentEl ? $$(`${HEADINGS_SEL}`, contentEl) : [];
  if (!heads.length) return;  // no headings, skip

  // Build nested list of links
  const baseHash = hashOf(page) || '';
  const ul = el('ul');
  heads.forEach(h => {
    const level = Number(h.tagName[1]);
    const li = el('li', { dataset: { level: level, hid: h.id } }, [
      el('a', {
        href: '#' + (baseHash ? baseHash + '#' : '') + h.id,
        textContent: h.textContent
      })
    ]);
    ul.append(li);
  });
  tocEl.append(ul);

  // IntersectionObserver to highlight current section:contentReference[oaicite:13]{index=13}
  // Clean up any previous observer (if re-rendering)
  if (window.__tocObserver) {
    window.__tocObserver.disconnect();
  }
  window.__tocObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const hid = entry.target.id;
      const a = $(`#toc li[data-hid="${hid}"] > a`);
      if (!a) continue;
      if (entry.isIntersecting) {
        // Remove old highlight and add new
        $('#toc .toc-current')?.classList.remove('toc-current');
        a.classList.add('toc-current');
      }
    }
  }, { rootMargin: '0px 0px -70% 0px', threshold: 0 });
  // Observe each heading
  heads.forEach(h => window.__tocObserver.observe(h));
}

/**
 * Insert a “Backlinks” section listing pages that link to this page.
 * Expects BACKLINKS data from data.js.
 * @param {Object} page - The current page object.
 */
function insertBacklinks(page) {
  const blist = BACKLINKS[page.id] || [];
  if (!blist.length) return;
  const container = $('#content');
  if (!container) return;

  const wrap = el('div', { id: 'backlinks' }, [
    el('h2', { textContent: 'Backlinks' }),
    el('ul')
  ]);
  const ul = wrap.querySelector('ul');
  blist.forEach(refPage => {
    const li = el('li', {}, [
      el('a', {
        href: '#' + hashOf(refPage),
        textContent: refPage.title
      })
    ]);
    ul.append(li);
  });
  container.appendChild(wrap);
}

/**
 * Main rendering function: converts page content to HTML and enhances it.
 * @param {Object} page   - The page object, with at least `.content` and `.id`.
 * @param {string} anchor - Optional anchor ID (after ‘#’) to scroll to after render.
 */
export async function renderPage(page, anchor = '') {
  const contentEl = $('#content');
  if (!contentEl) return;

  // Parse Markdown into HTML:contentReference[oaicite:14]{index=14}
  // Disable automatic header IDs; we will handle anchors manually if needed.
  marked.setOptions({ headerIds: false });
  contentEl.innerHTML = marked.parse(page.content || '');

  // Enhance the generated HTML:

  // 1. External links: open in new tab with rel="noopener noreferrer":contentReference[oaicite:15]{index=15}
  decorateExternalLinks(contentEl);

  // 2. Copy buttons: headings and code blocks:contentReference[oaicite:16]{index=16}
  decorateHeadings(page, contentEl);
  decorateCodeBlocks(contentEl);
  // Enable clipboard copy via delegated handler:contentReference[oaicite:17]{index=17}
  wireCopyButtons(contentEl, () => {
    // compute base URL for this page’s anchors
    return buildDeepURL(page, '') || (baseURLNoHash() + '#');
  });

  // 3. Syntax highlighting for code blocks (via Highlight.js)
  // We highlight on demand (optionally lazy for performance)
  // Here we just highlight all immediately for simplicity
  contentEl.querySelectorAll('pre code').forEach(codeEl => {
    if (!codeEl.dataset.hlDone) {
      // Highlight.js auto-detect
      window.hljs.highlightElement(codeEl);
      codeEl.dataset.hlDone = '1';
    }
  });

  // 4. Mermaid diagrams: render any <pre class="mermaid"> blocks:contentReference[oaicite:18]{index=18}
  contentEl.querySelectorAll('pre.mermaid').forEach(async (pre) => {
    const code = pre.textContent;
    // Clear and set up a div for mermaid to render into
    const parent = pre.parentNode;
    const mermaidDiv = el('div', { class: 'mermaid', textContent: code });
    parent.replaceChild(mermaidDiv, pre);
    try {
      await mermaid.run({ node: mermaidDiv, mermaid });
    } catch (e) {
      console.error('Mermaid render error:', e);
    }
  });

  // 5. Math rendering: find TeX expressions and render with KaTeX:contentReference[oaicite:19]{index=19}:contentReference[oaicite:20]{index=20}
  renderMathInElement(contentEl, katexOptions);

  // 6. Build Table of Contents (scrollspy) from headings:contentReference[oaicite:21]{index=21}
  buildToc(page);

  // 7. Insert backlinks (if any)
  insertBacklinks(page);

  // 8. Scroll to anchor (if provided)
  if (anchor) {
    // Anchor IDs are after the last '#'
    scrollToAnchor(anchor);
  }
}
