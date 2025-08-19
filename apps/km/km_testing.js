/* eslint-env browser, es2022 */
/* km — Static No-Build Wiki runtime (ESM) • Two files only, libs via CDN */

'use strict';

/* ─────────────────────────────── Public API ────────────────────────────── */
/** Global namespace (do not break). */
window.KM = window.KM || {};
const KM = window.KM;

/* ─────────────────────────────── DOM helpers ───────────────────────────── */
/** Cached document for brevity. */
const DOC = document;
/**
 * Shorthand for querySelector.
 * @param {string} sel
 * @param {ParentNode} [c=document]
 * @returns {Element|null}
 */
const $ = (sel, c = DOC) => c.querySelector(sel);
/**
 * Shorthand for querySelectorAll (returns array).
 * @param {string} sel
 * @param {ParentNode} [c=document]
 * @returns {Element[]}
 */
const $$ = (sel, c = DOC) => [...c.querySelectorAll(sel)];
/**
 * Create an element with props and children.
 * - `class` or `className` sets className.
 * - `dataset` shallow-merges into dataset.
 * - Other known properties are set directly; otherwise setAttribute.
 * @param {keyof HTMLElementTagNameMap} tag
 * @param {Record<string, any>} [props]
 * @param {(Node|string)[]} [children]
 */
const el = (tag, props = {}, children = []) => {
  const n = DOC.createElement(tag);
  // Prop setting
  for (const k in props) {
    const v = props[k];
    if (k === 'class' || k === 'className') n.className = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k in n) n[k] = v;
    else n.setAttribute(k, v);
  }
  // Children
  for (const ch of children) n.append(ch);
  return n;
};
Object.assign(KM, { $, $$, DEBUG: false });

/* ────────────────────────────── Config access ──────────────────────────── */
const CFG = window.CONFIG || {};
const { TITLE = 'Wiki', MD = '', LANGS = [], DEFAULT_THEME, ACCENT } = CFG;

/* ─────────────────────────────── small utils ───────────────────────────── */
/** Idle callback with fallback. */
const whenIdle = (cb, timeout = 1500) =>
  'requestIdleCallback' in window ? requestIdleCallback(cb, { timeout }) : setTimeout(cb, 0);

/** Promise that resolves on DOM ready. */
const domReady = () =>
  DOC.readyState !== 'loading'
    ? Promise.resolve()
    : new Promise(res => DOC.addEventListener('DOMContentLoaded', res, { once: true }));

/** Reduced-motion preference detection. */
const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Smooth scroll helper that respects reduced-motion and ensures focus for a11y.
 * @param {Element} node
 */
function scrollToEl(node) {
  if (!node) return;
  const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
  node.scrollIntoView({ behavior });
  // Focus for screen readers; keep scroll position
  if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1');
  try { node.focus({ preventScroll: true }); } catch { /* noop */ }
}
/** Expose for re-use inside Markdown enhancements (non-breaking). */
KM.scrollToEl = scrollToEl;

/* ───────────────────────────── data model ──────────────────────────────── */
/** @typedef {{id:string,title:string,parent?:string,tags?:string,content:string,children:any[],tagsSet:Set<string>,searchStr:string,sections:any[],hash?:string,isSecondary?:boolean,clusterId?:number,_i?:number}} Page */

const pages = /** @type {Page[]} */([]);
const byId = new Map();       // id -> Page
let root = /** @type {Page|null} */(null);
const descMemo = new Map();   // memo for descendants()

/**
 * Parse Markdown bundle composed of repeated:
 * <!-- id:"..." title:"..." parent:"..." tags:"tag1,tag2" -->\n<markdown>\n
 * Builds pages and sections with search strings.
 * Assumes trusted Markdown (no sanitizer by design).
 * @param {string} txt
 */
function parseMarkdownBundle(txt) {
  const seenIds = new Set();
  const m = txt.matchAll(/<!--([\s\S]*?)-->\s*([\s\S]*?)(?=<!--|$)/g);
  for (const [, hdr, body] of m) {
    const meta = {};
    // Simple "key":"value" parser; tolerant to whitespace, double-quotes only (by design).
    hdr.replace(/(\w+)\s*:\s*"([^"]+)"/g, (_, k, v) => { meta[k] = v.trim(); });
    /** @type {Page} */
    const page = {
      ...meta,
      id: String(meta.id || '').trim(),
      title: String(meta.title || '').trim(),
      content: (body || '').trim(),
      children: []
    };
    // Defensive: skip if missing a stable id or title
    if (!page.id || !page.title) continue;

    if (seenIds.has(page.id)) {
      // Keep first page with duplicate id; ignore subsequent duplicates to avoid graph/tree corruption
      if (KM.DEBUG) console.warn('Duplicate page id ignored:', page.id);
      continue;
    }
    seenIds.add(page.id);
    pages.push(page);
    byId.set(page.id, page);
  }
  if (!pages.length) throw new Error('No pages parsed from MD bundle.');

  // Home/root: explicit "home" id if present, else first page.
  root = byId.get('home') || pages[0];

  // Parent/children wiring + basic search fields
  pages.forEach(p => {
    if (p !== root) {
      const parent = p.parent ? byId.get(String(p.parent).trim()) : null;
      p.parent = parent || null;
      if (parent) parent.children.push(p);
    } else {
      p.parent = null;
    }
    p.tagsSet = new Set(
      (p.tags || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    );
    p.searchStr = (p.title + ' ' + [...p.tagsSet].join(' ') + ' ' + p.content).toLowerCase();
  });

  // Fence-aware heading sections for deep search (O(total lines)).
  pages.forEach(p => {
    const counters = [0, 0, 0, 0, 0, 0];
    const sections = [];
    let inFence = false, offset = 0, prev = null;

    for (const line of p.content.split(/\r?\n/)) {
      if (/^(?:```|~~~)/.test(line)) inFence = !inFence;
      if (!inFence && /^(#{1,5})\s+/.test(line)) {
        if (prev) {
          prev.body = p.content.slice(prev.bodyStart, offset).trim();
          prev.search = (prev.txt + ' ' + prev.body).toLowerCase();
          sections.push(prev);
        }
        const [, hashes, rest] = line.match(/^(#{1,5})\s+(.+)/);
        const level = hashes.length - 1;
        counters[level]++; for (let i = level + 1; i < 6; i++) counters[i] = 0;
        prev = {
          id: counters.slice(0, level + 1).filter(Boolean).join('_'),
          txt: String(rest || '').trim(),
          bodyStart: offset + line.length + 1
        };
      }
      offset += line.length + 1;
    }
    if (prev) {
      prev.body = p.content.slice(prev.bodyStart).trim();
      prev.search = (prev.txt + ' ' + prev.body).toLowerCase();
      sections.push(prev);
    }
    p.sections = sections;
  });
}

/** Count descendants for a page (memoized). */
function descendants(page) {
  if (descMemo.has(page)) return descMemo.get(page);
  let n = 0;
  (function rec(x) { x.children.forEach(c => { n++; rec(c); }); })(page);
  descMemo.set(page, n);
  return n;
}

/**
 * Attach a representative from each non-root cluster to the root as a "secondary".
 * This preserves navigation to isolated trees while avoiding churn.
 */
function attachSecondaryHomes() {
  const topOf = p => { while (p.parent) p = p.parent; return p; };
  const clusters = new Map();
  for (const p of pages) {
    const top = topOf(p);
    if (top === root) continue;
    (clusters.get(top) || clusters.set(top, []).get(top)).push(p);
  }
  let cid = 0;
  for (const [, members] of clusters) {
    const rep = members.reduce((a, b) => (descendants(b) > descendants(a) ? b : a), members[0]);
    if (!rep.parent) {
      rep.parent = root;
      rep.isSecondary = true;
      rep.clusterId = cid++;
      root.children.push(rep);
    }
  }
}

/** Compute hash segments for each page (#a#b#c). */
function computeHashes() {
  pages.forEach(p => {
    const segs = [];
    for (let n = p; n && n.parent; n = n.parent) segs.unshift(n.id);
    p.hash = segs.join('#'); // root gets empty string
  });
}

/** Get page.hash safely. */
const hashOf = page => page?.hash ?? '';
/**
 * Resolve a sequence of segments to a page; returns nearest valid ancestor on mismatch.
 * @param {string[]} segs
 */
const find = segs => {
  let n = root;
  for (const id of segs) {
    const c = n?.children?.find(k => k.id === id);
    if (!c) break;
    n = c;
  }
  return n || root; // always return something
};
/** Public navigation helper (preserve API). */
function nav(page) { location.hash = '#' + hashOf(page); }
KM.nav = nav;

/* ───────────────────────────── asset loaders ───────────────────────────── */
/** Ensure wrapper to only execute a loader once. */
const ensureOnce = fn => { let p; return () => (p ||= fn()); };

/** D3 bits needed for the mini-graph (selection/force/drag). */
KM.ensureD3 = ensureOnce(async () => {
  const [sel, force, drag] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/d3-selection@3.0.0/+esm'),
    import('https://cdn.jsdelivr.net/npm/d3-force@3.0.0/+esm'),
    import('https://cdn.jsdelivr.net/npm/d3-drag@3.0.0/+esm')
  ]);
  KM.d3 = {
    select: sel.select, selectAll: sel.selectAll,
    forceSimulation: force.forceSimulation,
    forceLink: force.forceLink, forceManyBody: force.forceManyBody, forceCenter: force.forceCenter,
    drag: drag.drag
  };
});

/** highlight.js core + optional languages. */
KM.ensureHighlight = ensureOnce(async () => {
  const { default: hljs } = await import('https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/es/core/+esm');
  if (Array.isArray(LANGS) && LANGS.length) {
    await Promise.allSettled(LANGS.map(async lang => {
      try {
        const mod = await import(`https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/es/languages/${lang}/+esm`);
        hljs.registerLanguage(lang, mod.default);
      } catch (e) { if (KM.DEBUG) console.warn('hljs lang load failed:', lang, e); }
    }));
  }
  window.hljs = hljs;
});

/** Swap highlight.js CSS to match theme. */
KM.ensureHLJSTheme = ensureOnce(() => new Promise(res => {
  const THEME = {
    light: 'https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github.min.css',
    dark : 'https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github-dark.min.css',
  };
  const mode = DOC.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  let l = DOC.querySelector('link[data-hljs-theme]');
  if (!l) {
    l = DOC.createElement('link');
    l.rel = 'stylesheet';
    l.setAttribute('data-hljs-theme', '');
    DOC.head.appendChild(l);
  }
  if (l.getAttribute('href') === THEME[mode]) return res();
  l.onload = l.onerror = res;
  l.href = THEME[mode];
}));

/** marked + plugins; header id generation off (we custom-number). */
let mdReady = null;
KM.ensureMarkdown = () => {
  if (mdReady) return mdReady;
  mdReady = Promise.all([
    import('https://cdn.jsdelivr.net/npm/marked@16.1.2/+esm'),
    import('https://cdn.jsdelivr.net/npm/marked-alert@2.1.2/+esm'),
    import('https://cdn.jsdelivr.net/npm/marked-footnote@1.4.0/+esm'),
  ]).then(([marked, alertMod, footnoteMod]) => {
    const md = new marked.Marked().use(alertMod.default()).use(footnoteMod.default());
    return { parse: (src, opt) => md.parse(src, { ...opt, mangle: false }) };
  });
  return mdReady;
};

/** KaTeX (CSS + core + autorender). */
KM.ensureKatex = ensureOnce(async () => {
  const BASE = 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/';
  if (!DOC.getElementById('katex-css')) {
    const link = Object.assign(DOC.createElement('link'), { id: 'katex-css', rel: 'stylesheet', href: BASE + 'katex.min.css' });
    DOC.head.appendChild(link);
  }
  const [katex, auto] = await Promise.all([
    import(BASE + 'katex.min.js/+esm'),
    import(BASE + 'contrib/auto-render.min.js/+esm')
  ]);
  window.katex = katex;
  window.renderMathInElement = auto.default;
});

/* ───────────────────────── UI decorations & utils ──────────────────────── */
const sortByTitle = (a, b) => a.title.localeCompare(b.title);

/**
 * Copy text to clipboard with subtle visual feedback on the source node.
 * @param {string} txt
 * @param {Element} [node]
 */
async function copyText(txt, node) {
  try {
    await navigator.clipboard.writeText(txt);
    if (node) { node.classList.add('flash'); setTimeout(() => node.classList.remove('flash'), 300); }
  } catch (e) {
    if (KM.DEBUG) console.warn('Clipboard API unavailable', e);
  }
}

/**
 * Number headings h1–h5 in a container and assign deterministic ids (e.g. "1_2_1").
 * @param {Element} elm
 */
function numberHeadings(elm) {
  const counters = [0, 0, 0, 0, 0, 0];
  const heads = $$('h1,h2,h3,h4,h5', elm);
  for (const h of heads) {
    const level = +h.tagName[1] - 1;
    counters[level]++; for (let i = level + 1; i < 6; i++) counters[i] = 0;
    h.id = counters.slice(0, level + 1).filter(Boolean).join('_');
  }
}

let tocObserver = null;
/**
 * Build right-side ToC from current content (h1–h3) with active-section tracking.
 * @param {Page} page
 */
function buildToc(page) {
  const nav = $('#toc'); if (!nav) return;
  nav.innerHTML = '';
  const heads = $$('#content h1,#content h2,#content h3');
  if (!heads.length) { tocObserver?.disconnect(); tocObserver = null; return; }

  const base = hashOf(page), ulEl = el('ul'), frag = DOC.createDocumentFragment();
  for (const h of heads) {
    const a = el('a', {
      href: '#' + (base ? base + '#' : '') + h.id,
      textContent: h.textContent
    });
    frag.append(
      el('li', { dataset: { level: h.tagName[1], hid: h.id } }, [a])
    );
  }
  ulEl.append(frag); nav.append(ulEl);

  // IntersectionObserver lifecycle
  tocObserver?.disconnect();
  tocObserver = new IntersectionObserver(entries => {
    for (const en of entries) {
      const a = $(`#toc li[data-hid="${en.target.id}"] > a`); if (!a) continue;
      if (en.isIntersecting) {
        $('#toc .toc-current')?.classList.remove('toc-current');
        a.classList.add('toc-current');
      }
    }
  }, { rootMargin: '0px 0px -70% 0px', threshold: 0 });
  heads.forEach(h => tocObserver.observe(h));
}

/** Previous/next sibling links at bottom of article. */
function prevNext(page) {
  $('#prev-next')?.remove();
  if (!page.parent) return;
  const sib = page.parent.children;
  if (!sib || sib.length < 2) return;
  const i = sib.indexOf(page), wrap = el('div', { id: 'prev-next' });
  if (i > 0) wrap.append(el('a', { href: '#' + hashOf(sib[i - 1]), textContent: '← ' + sib[i - 1].title }));
  if (i < sib.length - 1) wrap.append(el('a', { href: '#' + hashOf(sib[i + 1]), textContent: sib[i + 1].title + ' →' }));
  $('#content')?.append(wrap);
}

/** “See also” based on tag overlap. */
function seeAlso(page) {
  $('#see-also')?.remove();
  if (!page.tagsSet?.size) return;
  const related = pages
    .filter(p => p !== page)
    .map(p => ({ p, shared: [...p.tagsSet].filter(t => page.tagsSet.has(t)).length }))
    .filter(r => r.shared > 0)
    .sort((a, b) => b.shared - a.shared || sortByTitle(a.p, b.p));
  if (!related.length) return;

  const wrap = el('div', { id: 'see-also' }, [el('h2', { textContent: 'See also' }), el('ul')]);
  const ulEl = wrap.querySelector('ul');
  related.forEach(({ p }) => ulEl.append(el('li', {}, [el('a', { href: '#' + hashOf(p), textContent: p.title })])));
  const content = $('#content'), pn = $('#prev-next');
  content?.insertBefore(wrap, pn ?? null);
}

/**
 * Fix relative footnote links to include page base in the hash.
 * @param {Page} page
 */
function fixFootnoteLinks(page) {
  const base = hashOf(page); if (!base) return;
  $$('#content a[href^="#"]').forEach(a => {
    const href = a.getAttribute('href') || '';
    if (/^#(?:fn|footnote)/.test(href) && !href.includes(base + '#')) a.setAttribute('href', `#${base}${href}`);
  });
}

const ICONS = {
  link: 'M3.9 12c0-1.7 1.4-3.1 3.1-3.1h5.4v-2H7c-2.8 0-5 2.2-5 5s2.2 5 5 5h5.4v-2H7c-1.7 0-3.1-1.4-3.1-3.1zm5.4 1h6.4v-2H9.3v2zm9.7-8h-5.4v2H19c1.7 0 3.1 1.4 3.1 3.1s-1.4 3.1-3.1 3.1h-5.4v2H19c2.8 0 5-2.2 5-5s-2.2-5-5-5z',
  code: 'M19,21H5c-1.1,0-2-0.9-2-2V7h2v12h14V21z M21,3H9C7.9,3,7,3.9,7,5v12 c0,1.1,0.9,2,2,2h12c1.1,0,2-0.9,2-2V5C23,3.9,22.1,3,21,3z M21,17H9V5h12V17z',
};
/**
 * Tiny SVG button factory.
 * @param {string} title
 * @param {string} path
 * @param {string} cls
 * @param {(e:MouseEvent)=>void} onClick
 */
const iconBtn = (title, path, cls, onClick) =>
  el('button', {
    class: cls,
    title,
    'aria-label': title,
    onclick: onClick,
    innerHTML: `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${path}"></path></svg>`
  });

/** Add anchor-copy buttons and click-to-copy behavior to headings. */
function decorateHeadings(page) {
  const base = hashOf(page);
  const baseUrl = location.href.split('#')[0]; // Robust with file:// and static hosts
  $$('#content h1,h2,h3,h4,h5').forEach(h => {
    const url = `${baseUrl}#${base ? base + '#' : ''}${h.id}`;
    const btn = h.querySelector('button.heading-copy') ||
      h.appendChild(iconBtn('Copy direct link', ICONS.link, 'heading-copy', e => {
        e.stopPropagation();
        copyText(url, h.querySelector('button.heading-copy'));
      }));
    h.style.cursor = 'pointer';
    h.onclick = () => copyText(url, btn);
  });
}

/** Add copy buttons to code fences. */
function decorateCodeBlocks() {
  $$('#content pre').forEach(pre => {
    if (pre.querySelector('button.code-copy')) return;
    pre.append(
      iconBtn('Copy code', ICONS.code, 'code-copy', () => {
        const src = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
        copyText(src, pre.querySelector('button.code-copy'));
      })
    );
  });
}

/* ─────────────────────────── sidebar / search ──────────────────────────── */
/** Build left navigation tree (root children + secondary clusters). */
function buildTree() {
  const ul = $('#tree'); if (!ul) return;
  ul.innerHTML = '';
  const prim = root.children.filter(c => !c.isSecondary).sort(sortByTitle);
  const secs = root.children.filter(c => c.isSecondary).sort((a, b) => a.clusterId - b.clusterId);

  let uid = 0; // for aria-controls
  const rec = (nodes, container, depth = 0) => {
    nodes.forEach(p => {
      const li = el('li');
      if (p.children.length) {
        const open = depth < 2;
        li.className = 'folder' + (open ? ' open' : '');
        const subId = `subtree_${++uid}`;
        const caret = el('button', { class: 'caret', 'aria-expanded': String(open), 'aria-controls': subId, title: 'Toggle section', 'aria-label': 'Toggle section' });
        const lbl = el('a', { class: 'lbl', dataset: { page: p.id }, href: '#' + hashOf(p), textContent: p.title });
        const sub = el('ul', { id: subId, style: `display:${open ? 'block' : 'none'}` });
        li.append(caret, lbl, sub);
        container.append(li);
        rec(p.children.sort(sortByTitle), sub, depth + 1);
      } else {
        li.className = 'article';
        li.append(el('a', { dataset: { page: p.id }, href: '#' + hashOf(p), textContent: p.title }));
        container.append(li);
      }
    });
  };

  const frag = DOC.createDocumentFragment();
  rec(prim, frag);
  secs.forEach(r => { frag.append(el('li', { class: 'group-sep', innerHTML: '<hr>' })); rec([r], frag); });
  ul.append(frag);
}

/** Highlight current page in sidebar (class + aria-current). */
function highlightSidebar(page) {
  const prev = $('#tree .sidebar-current');
  if (prev) { prev.classList.remove('sidebar-current'); prev.removeAttribute('aria-current'); }
  const cur = $(`#tree a[data-page="${page.id}"]`);
  if (cur) { cur.classList.add('sidebar-current'); cur.setAttribute('aria-current', 'page'); }
}

/**
 * Simple token-based search over page titles/tags/content + per-section matches.
 * Complexity: O(P + M) where P is pages scanned and M is matched sections appended.
 * Adequate for hundreds to a few thousand pages.
 * @param {string} q
 */
function search(q) {
  const resUL = $('#results'), treeUL = $('#tree'); if (!resUL || !treeUL) return;
  const val = q.trim().toLowerCase();

  if (!val) { resUL.style.display = 'none'; resUL.innerHTML = ''; treeUL.style.display = ''; return; }

  const tokens = val.split(/\s+/).filter(t => t.length >= 2);
  resUL.innerHTML = ''; resUL.style.display = ''; treeUL.style.display = 'none';

  const frag = DOC.createDocumentFragment();
  pages.forEach(p => {
    if (!tokens.every(tok => p.searchStr.includes(tok))) return;
    const li = el('li', { class: 'page-result' }, [el('a', { href: '#' + hashOf(p), textContent: p.title })]);
    const matches = p.sections.filter(sec => tokens.every(tok => sec.search.includes(tok)));
    if (matches.length) {
      const base = hashOf(p), sub = el('ul', { class: 'sub-results' });
      matches.forEach(sec => sub.append(el('li', { class: 'heading-result' }, [
        el('a', { href: '#' + (base ? base + '#' : '') + sec.id, textContent: sec.txt })
      ])));
      li.append(sub);
    }
    frag.append(li);
  });
  resUL.append(frag);
  if (!resUL.children.length) resUL.innerHTML = '<li id="no_result">No result</li>';
}

/* ─────────────────────────── breadcrumb / crumb ────────────────────────── */
/** Build breadcrumb with sibling dropdown and child menu. */
function breadcrumb(page) {
  const dyn = $('#crumb-dyn'); if (!dyn) return;
  dyn.innerHTML = '';
  const chain = []; for (let n = page; n; n = n.parent) chain.unshift(n); chain.shift(); // skip root

  chain.forEach(n => {
    dyn.insertAdjacentHTML('beforeend', '<span class="separator">▸</span>');
    const wrap = el('span', { class: 'dropdown' });
    const a = el('a', { textContent: n.title, href: '#' + hashOf(n) });
    if (n === page) a.className = 'crumb-current';
    wrap.append(a);

    const siblings = n.parent?.children?.filter(s => s !== n) || [];
    if (siblings.length) {
      const ul = el('ul');
      siblings.forEach(s => ul.append(el('li', { textContent: s.title, onclick: () => nav(s) })));
      wrap.append(ul);
    }
    dyn.append(wrap);
  });

  if (page.children.length) {
    const box = el('span', { class: 'childbox' }, [el('span', { class: 'toggle', textContent: '▾' }), el('ul')]);
    const ul = box.querySelector('ul');
    page.children.sort(sortByTitle).forEach(ch => ul.append(el('li', { textContent: ch.title, onclick: () => nav(ch) })));
    dyn.append(box);
  }
}

/* ───────────────────────────── mini graph (D3) ─────────────────────────── */
const IDS = { current: 'node_current', parent: 'node_parent', leaf: 'node_leaf', hierPRE: 'link_hier', tagPRE: 'link_tag', label: 'graph_text' };
const graphs = {};
let CURRENT = -1;

/** Compute current size of the mini-graph SVG. */
function getMiniSize() {
  const svg = $('#mini'); if (!svg) return { w: 400, h: 300 };
  if (svg.classList.contains('fullscreen')) return { w: innerWidth, h: innerHeight };
  const r = svg.getBoundingClientRect();
  return { w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) };
}

/** Update viewBox/forces when the mini-graph viewport changes. */
function updateMiniViewport() {
  if (!graphs.mini) return;
  const { svg, sim } = graphs.mini;
  const { w, h } = getMiniSize();
  graphs.mini.w = w; graphs.mini.h = h;
  svg.attr('viewBox', `0 0 ${w} ${h}`).attr('width', w).attr('height', h).attr('preserveAspectRatio', 'xMidYMid meet');
  sim.force('center', KM.d3.forceCenter(w / 2, h / 2));
  sim.alpha(0.2).restart();
}

/**
 * Build graph nodes/links.
 * - Hierarchy links: parent-child (except secondary reps attached to root).
 * - Tag links: aggregate by tag to avoid O(n²); link pairs with shared>0.
 */
function buildGraphData() {
  const nodes = [], links = [], adj = new Map(), hierPairs = new Set();
  const touch = (a, b) => { (adj.get(a) || adj.set(a, new Set()).get(a)).add(b); (adj.get(b) || adj.set(b, new Set()).get(b)).add(a); };
  const tierOf = n => n < 3 ? 1 : n < 6 ? 2 : n < 11 ? 3 : n < 21 ? 4 : 5;

  // Assign indices and nodes
  pages.forEach((p, i) => { p._i = i; nodes.push({ id: i, label: p.title, ref: p }); });

  // Hierarchical edges (light)
  pages.forEach(p => {
    if (!p.parent) return;
    if (p.isSecondary && p.parent === root) return; // skip artificial root links
    const a = p._i, b = p.parent._i;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    links.push({ source: a, target: b, shared: 0, kind: 'hier', tier: tierOf(descendants(p)) });
    hierPairs.add(key); touch(a, b);
  });

  // Tag edges via aggregation (scales better than full pairwise)
  /** @type {Map<string, number[]>} */
  const tagMap = new Map();
  for (const p of pages) for (const t of p.tagsSet) {
    (tagMap.get(t) || tagMap.set(t, []).get(t)).push(p._i);
  }
  /** @type {Map<string, number>} pair key -> overlap count */
  const pairCount = new Map();
  for (const ids of tagMap.values()) {
    const L = ids.length;
    for (let i = 0; i < L; i++) for (let j = i + 1; j < L; j++) {
      const a = ids[i], b = ids[j];
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      pairCount.set(key, (pairCount.get(key) || 0) + 1);
    }
  }
  for (const [key, shared] of pairCount.entries()) {
    if (shared <= 0) continue;
    if (hierPairs.has(key)) continue; // don't duplicate with hier edges
    const [a, b] = key.split('|').map(n => +n);
    links.push({ source: a, target: b, shared, kind: 'tag' });
    touch(a, b);
  }
  return { nodes, links, adj };
}

/** Build and mount the mini-graph (lazily). */
async function buildGraph() {
  await KM.ensureD3();
  if (graphs.mini) return;

  const { nodes, links, adj } = buildGraphData();
  const svg = KM.d3.select('#mini');
  if (!svg || !$('#mini')) return; // defensive
  const { w: W, h: H } = getMiniSize();
  svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('preserveAspectRatio', 'xMidYMid meet');

  const localN = nodes.map(n => ({ ...n })), localL = links.map(l => ({ ...l }));

  const sim = KM.d3.forceSimulation(localN)
    .force('link', KM.d3.forceLink(localL).id(d => d.id).distance(80))
    .force('charge', KM.d3.forceManyBody().strength(-240))
    .force('center', KM.d3.forceCenter(W / 2, H / 2));

  const view = svg.append('g').attr('class', 'view').attr('style', 'transition: transform 220ms ease-out');

  const link = view.append('g').selectAll('line')
    .data(localL).join('line')
    .attr('id', d => d.kind === 'hier' ? IDS.hierPRE + d.tier : IDS.tagPRE + Math.min(d.shared, 5));

  const wireNode = sel => sel
    .attr('r', 6)
    .attr('id', d => d.ref.children.length ? IDS.parent : IDS.leaf)
    .style('cursor', 'pointer')
    .on('click', (e, d) => KM.nav(d.ref))
    .on('mouseover', (e, d) => fade(d.id, 0.15))
    .on('mouseout', () => fade(null, 1))
    .call(KM.d3.drag()
      .on('start', (e, d) => { d.fx = d.x; d.fy = d.y; })
      .on('drag', (e, d) => { sim.alphaTarget(0.25).restart(); d.fx = e.x; d.fy = e.y; })
      .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = d.fy = null; }));

  const node = wireNode(view.append('g').selectAll('circle').data(localN).join('circle'));

  const label = view.append('g').selectAll('text')
    .data(localN).join('text')
    .attr('id', IDS.label).attr('font-size', 10)
    .attr('pointer-events', 'none')
    .text(d => d.label);

  function fade(id, o) {
    node .style('opacity', d => (id == null || graphs.mini.adj.get(id)?.has(d.id) || d.id === id) ? 1 : o);
    label.style('opacity', d => (id == null || graphs.mini.adj.get(id)?.has(d.id) || d.id === id) ? 1 : o);
    link .style('opacity', l => id == null || l.source.id === id || l.target.id === id ? 1 : o);
  }

  sim.on('tick', () => {
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node .attr('cx', d => d.x).attr('cy', d => d.y);
    label.attr('x', d => d.x + 8).attr('y', d => d.y + 3);
  });

  graphs.mini = { svg, node, label, sim, view, adj, w: W, h: H };
  observeMiniResize();
}

/** Center/mark the current node in the mini-graph. */
function highlightCurrent(force = false) {
  if (!graphs.mini) return;
  const seg = location.hash.slice(1).split('#').filter(Boolean);
  const pg = find(seg); const id = pg?._i ?? -1;
  if (id === CURRENT && !force) return;

  const g = graphs.mini;
  g.node
    .attr('id', d => d.id === id ? IDS.current : (d.ref.children.length ? IDS.parent : IDS.leaf))
    .attr('r', d => d.id === id ? 8 : 6);
  g.label.classed('current', d => d.id === id);

  // Nudge to center
  const cx = g.w / 2, cy = g.h / 2;
  g.node.filter(d => d.id === id).each(d => {
    const dx = cx - d.x, dy = cy - d.y;
    g.view.attr('transform', `translate(${dx},${dy})`);
    const k = 0.10; d.vx += (cx - d.x) * k; d.vy += (cy - d.y) * k;
  });

  g.sim.alphaTarget(0.15).restart();
  setTimeout(() => g.sim.alphaTarget(0), 250);
  CURRENT = id;
}

/** Observe size changes on the mini-graph (with fallback). */
function observeMiniResize() {
  const elx = $('#mini'); if (!elx) return;
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => { if (!graphs.mini) return; updateMiniViewport(); highlightCurrent(true); }).observe(elx);
  } else {
    addEventListener('resize', () => { if (!graphs.mini) return; updateMiniViewport(); highlightCurrent(true); }, { passive: true });
  }
}

/* ───────────────────────── renderer + router + init ────────────────────── */
/**
 * Render a page into #content and apply progressive enhancements.
 * @param {Page} page
 * @param {string} [anchor]
 */
async function render(page, anchor) {
  const { parse } = await KM.ensureMarkdown();
  const contentEl = $('#content');
  if (!contentEl) return;

  contentEl.setAttribute('aria-busy', 'true');
  contentEl.innerHTML = parse(page.content, { headerIds: false });

  // Image perf: lazy & async; do not force high fetchpriority (let browser decide).
  $$('#content img').forEach(img => {
    img.loading = 'lazy'; img.decoding = 'async';
  });

  fixFootnoteLinks(page);
  numberHeadings(contentEl);

  // Syntax highlight (theme CSS ensured for current theme)
  if (DOC.querySelector('#content pre code')) {
    await KM.ensureHLJSTheme();
    await KM.ensureHighlight();
    window.hljs.highlightAll();
  }

  // KaTeX autorender when markers are present (cheap heuristic)
  if (/(\$[^$]+\$|\\\(|\\\[)/.test(page.content)) {
    await KM.ensureKatex();
    window.renderMathInElement(contentEl, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false }
      ],
      throwOnError: false
    });
  }

  buildToc(page);
  decorateHeadings(page);
  decorateCodeBlocks();
  prevNext(page);
  seeAlso(page);

  contentEl.removeAttribute('aria-busy');

  // Scroll to anchor (after everything is in DOM)
  if (anchor) scrollToEl(DOC.getElementById(anchor));
}

let currentPage = null;

/**
 * Hash router: #<path>#<headingId>
 * - Updates breadcrumb, main content, sidebar highlight, mini-graph.
 */
function route() {
  closePanels();
  const seg = location.hash.slice(1).split('#').filter(Boolean);
  const page = find(seg);
  const base = hashOf(page);
  const baseSegs = base ? base.split('#') : [];
  const anchor = seg.slice(baseSegs.length).join('#');

  if (currentPage !== page) {
    currentPage = page;
    // Reset scroll to top on page change
    DOC.documentElement.scrollTop = 0; DOC.body.scrollTop = 0;
    breadcrumb(page);
    render(page, anchor);
    highlightCurrent(true);
    highlightSidebar(page);
  } else if (anchor) {
    const target = DOC.getElementById(anchor);
    if (target) {
      scrollToEl(target);
      const a = $(`#toc li[data-hid="${anchor}"] > a`);
      if (a) { $('#toc .toc-current')?.classList.remove('toc-current'); a.classList.add('toc-current'); }
    }
  }
}

/* ─────────────────────────── global UI + theme ─────────────────────────── */
/** Close both side panels (mobile). */
function closePanels() {
  $('#sidebar')?.classList.remove('open');
  $('#util')?.classList.remove('open');
}

/** Initialize global UI: theme, tree, search, graph lazy mount, listeners. */
function initUI() {
  $('#wiki-title-text')?.textContent = TITLE; document.title = TITLE;
  buildTree();

  // — Theme (light/dark + accent + theme-color meta + hljs CSS swap)
  (function themeInit() {
    const btn = $('#theme-toggle'), rootEl = DOC.documentElement, media = matchMedia('(prefers-color-scheme: dark)');
    const stored = localStorage.getItem('km-theme'); // 'dark' | 'light' | null
    const cfg = (DEFAULT_THEME === 'dark' || DEFAULT_THEME === 'light') ? DEFAULT_THEME : null;
    let dark = stored ? (stored === 'dark') : (cfg ? cfg === 'dark' : media.matches);

    if (typeof ACCENT === 'string' && ACCENT) rootEl.style.setProperty('--color-accent', ACCENT);
    const metaTheme = DOC.querySelector('meta[name="theme-color"]');

    apply(dark);
    if (btn) {
      btn.onclick = () => { dark = !dark; apply(dark); localStorage.setItem('km-theme', dark ? 'dark' : 'light'); };
    }

    function apply(isDark) {
      rootEl.style.setProperty('--color-main', isDark ? 'rgb(29,29,29)' : 'white');
      rootEl.setAttribute('data-theme', isDark ? 'dark' : 'light');
      if (metaTheme) metaTheme.setAttribute('content', isDark ? '#1d1d1d' : '#ffffff');
      KM.ensureHLJSTheme(); // fire-and-forget; loader resolves only when swapped
    }
  })();

  route(); // initial render

  // Lazy-init mini graph when visible
  const miniEl = $('#mini');
  if (miniEl && 'IntersectionObserver' in window) {
    new IntersectionObserver((entries, obs) => { if (entries[0]?.isIntersecting) { buildGraph(); obs.disconnect(); } }).observe(miniEl);
  } else {
    // Fallback: init soon
    whenIdle(buildGraph);
  }

  // Mini fullscreen toggle
  const mini = $('#mini');
  const expandBtn = $('#expand');
  if (expandBtn && mini) {
    expandBtn.setAttribute('aria-pressed', String(mini.classList.contains('fullscreen')));
    expandBtn.onclick = () => {
      mini.classList.toggle('fullscreen');
      expandBtn.setAttribute('aria-pressed', String(mini.classList.contains('fullscreen')));
      updateMiniViewport();
      requestAnimationFrame(() => highlightCurrent(true));
    };
  }

  // Search box
  const searchInput = $('#search'), searchClear = $('#search-clear');
  let debounce = 0;
  if (searchInput) {
    searchInput.oninput = e => {
      clearTimeout(debounce);
      const val = e.target.value; if (searchClear) searchClear.style.display = val ? '' : 'none';
      debounce = setTimeout(() => search(val || ''), 150);
    };
    // Clear button
    if (searchClear) {
      searchClear.onclick = () => { searchInput.value = ''; searchClear.style.display = 'none'; search(''); searchInput.focus(); };
    }
  }

  // Toggle panels (mobile)
  const togglePanel = sel => {
    const elx = $(sel); if (!elx) return;
    const wasOpen = elx.classList.contains('open');
    closePanels();
    if (!wasOpen) {
      elx.classList.add('open');
      if (!elx.querySelector('.panel-close')) elx.append(el('button', { class: 'panel-close', textContent: '✕', onclick: closePanels, 'aria-label': 'Close panel' }));
    }
  };
  $('#burger-sidebar')?.addEventListener('click', () => togglePanel('#sidebar'));
  $('#burger-util')?.addEventListener('click', () => togglePanel('#util'));

  // Global resize
  addEventListener('resize', () => {
    if (matchMedia('(min-width:1001px)').matches) closePanels();
    if ($('#mini')?.classList.contains('fullscreen')) { updateMiniViewport(); highlightCurrent(true); }
  }, { passive: true });

  // Sidebar interactions
  $('#tree')?.addEventListener('click', e => {
    const caret = e.target.closest('button.caret');
    if (caret) {
      const li = caret.closest('li.folder'), sub = li?.querySelector('ul');
      const open = !li?.classList.contains('open');
      li?.classList.toggle('open', open);
      caret.setAttribute('aria-expanded', String(open));
      if (sub) sub.style.display = open ? 'block' : 'none';
      return;
    }
    if (e.target.closest('a')) closePanels();
  }, { passive: true });

  // Search results close panel
  $('#results')?.addEventListener('click', e => { if (e.target.closest('a')) closePanels(); }, { passive: true });

  // Escape closes panels
  addEventListener('keydown', e => { if (e.key === 'Escape') closePanels(); });

  // Router
  addEventListener('hashchange', route, { passive: true });

  // Warm up hljs in idle (language modules may code-split)
  whenIdle(() => { KM.ensureHighlight(); });
}

/* ──────────────────────────────── boot ─────────────────────────────────── */
(async () => {
  try {
    if (!MD) throw new Error('CONFIG.MD is empty.');
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort('fetch-timeout'), 20000);
    const r = await fetch(MD, { cache: 'reload', signal: ctrl.signal }); clearTimeout(t);
    if (!r.ok) throw new Error(`Failed to fetch MD (${r.status})`);
    const txt = await r.text();

    parseMarkdownBundle(txt);
    attachSecondaryHomes();
    computeHashes();

    await domReady();
    initUI();

    // Nudge the mini-graph highlight after first render
    await new Promise(res => setTimeout(res, 120));
    highlightCurrent(true);
  } catch (err) {
    console.warn('Markdown load failed:', err);
    const elc = $('#content');
    if (elc) elc.innerHTML = `<h1>Content failed to load</h1>
<p>Could not fetch or parse the Markdown bundle. Check <code>window.CONFIG.MD</code> and network access.</p>
<pre>${String(err?.message || err)}</pre>`;
  }
})();
