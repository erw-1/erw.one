import { DOC, $, $$, baseURLNoHash, ALLOW_JS_FROM_MD } from './config_dom.js';
import { __model, find, hashOf } from './model.js';
import { highlightCurrent } from './graph.js';
import { highlightSidebar, breadcrumb, buildToc, seeAlso, prevNext, closePanels } from './ui.js';
import { getParsedHTML, decorateExternalLinks, normalizeAnchors, annotatePreviewableLinks, highlightVisibleCode, renderMathSafe, decorateHeadings, decorateCodeBlocks, __trackObserver, __cleanupObservers } from './markdown.js';

let currentPage = null;

export const buildDeepURL = (page, anchorId = '') => {
  const pageHash = hashOf(page) || '';
  const base = baseURLNoHash() + '#' + pageHash;
  return anchorId ? base + (pageHash ? '#' : '') + anchorId : (pageHash ? base + '#' : base);
};

async function render(page, anchor) {
  const contentEl = $('#content');
  if (!contentEl) return;
  __cleanupObservers();
  contentEl.dataset.mathRendered = '0';
  contentEl.innerHTML = await getParsedHTML(page);
  if (ALLOW_JS_FROM_MD === 'true') {
    contentEl.querySelectorAll('script').forEach(old => {
      const s = document.createElement('script');
      for (const { name, value } of [...old.attributes]) s.setAttribute(name, value);
      s.textContent = old.textContent || '';
      old.replaceWith(s);
    });
  }
  await enhanceRendered(contentEl, page);
  buildToc(page);
  prevNext(page);
  seeAlso(page);
  scrollToAnchor(anchor);
}

export function parseTarget(hashOrHref = location.hash) {
  const { root } = __model;
  const href = (hashOrHref || '').startsWith('#') ? hashOrHref : new URL(hashOrHref || '', location.href).hash;
  if (href === '') return { page: root, anchor: '' };
  const seg = href.slice(1).split('#').filter(Boolean);
  const page = seg.length ? find(seg) : root;
  const base = hashOf(page);
  const baseSegs = base ? base.split('#') : [];
  if (seg.length && !baseSegs.length) {
    return { page: root, anchor: seg.join('#') };
  }
  const anchor = seg.slice(baseSegs.length).join('#');
  return { page, anchor };
}

export function resetScrollTop() {
  (document.scrollingElement || document.documentElement).scrollTop = 0;
  document.getElementById('content')?.scrollTo?.(0, 0);
}

export function scrollToAnchor(anchor) {
  if (!anchor) return;
  const target = DOC.getElementById(anchor);
  if (target) target.scrollIntoView({ behavior: 'smooth' });
}

export function route() {
  closePanels();
  const t = parseTarget(location.hash) ?? { page: __model.root, anchor: '' };
  const page = t.page;
  const anchor = t.anchor;
  if (currentPage !== page) {
    currentPage = page;
    breadcrumb(page);
    render(page, anchor);
    highlightCurrent(true);
    highlightSidebar(page);
    if (!anchor) requestAnimationFrame(() => resetScrollTop());
  } else if (anchor) {
    scrollToAnchor(anchor);
    const a = $(`#toc li[data-hid="${anchor}"] > a`);
    if (a) {
      $('#toc .toc-current')?.classList.remove('toc-current');
      a.classList.add('toc-current');
    }
  }
}

export async function enhanceRendered(containerEl, page) {
  decorateExternalLinks(containerEl);
  const imgs = $$('img', containerEl);
  imgs.forEach((img, i) => {
    img.loading = 'lazy';
    img.decoding = 'async';
    if (!img.hasAttribute('fetchpriority') && i < 2) img.setAttribute('fetchpriority', 'high');
  });
  normalizeAnchors(containerEl, page, { onlyFootnotes: true });
  annotatePreviewableLinks(containerEl);
  highlightVisibleCode(containerEl);
  KM.ensureMarkdown().then(({ renderMermaidLazy }) => renderMermaidLazy(containerEl));
  if (/(\$[^$]+\$|\\\(|\\\[)/.test(page.content)) {
    const obs = __trackObserver(new IntersectionObserver((entries, o) => {
      if (entries.some(en => en.isIntersecting)) {
        KM.ensureKatex().then(() => renderMathSafe(containerEl));
        o.disconnect();
      }
    }, { root: null, rootMargin: '200px 0px', threshold: 0 }), containerEl);
    obs.observe(containerEl);
  }
  decorateHeadings(page, containerEl);
  decorateCodeBlocks(containerEl);
}
