/* eslint-env browser, es2022 */
/* km — Static No-Build Wiki runtime (ESM) • Two files only, libs via CDN */

'use strict';

/* ─────────────────────────────── Public API ────────────────────────────── */
window.KM = window.KM || {};
const KM = window.KM;

/* ─────────────────────────────── DOM helpers ───────────────────────────── */
/** Shorthand for document node. */
const DOC = document;
/** Query single element. */
const $   = (sel, c = DOC) => c.querySelector(sel);
/** Query list as array. */
const $$  = (sel, c = DOC) => [...c.querySelectorAll(sel)];
/**
 * Create element with properties and children.
 * Properties map:
 *  - "class"/"className" → className
 *  - "dataset" → merged into dataset
 *  - if key in element, set as property; else setAttribute
 */
const el  = (tag, props = {}, children = []) => {
  const n = DOC.createElement(tag);
  for (const k in props) {
    const v = props[k];
    if (k === 'class' || k === 'className') n.className = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k in n) n[k] = v;
    else n.setAttribute(k, v);
  }
  for (const ch of children) n.append(ch);
  return n;
};
Object.assign(KM, { $, $$, DEBUG:false });

/* ────────────────────────────── Config access ──────────────────────────── */
const CFG = window.CONFIG || {};
const { TITLE = 'Wiki', MD = '', LANGS = [], DEFAULT_THEME, ACCENT } = CFG;

/* ─────────────────────────────── small utils ───────────────────────────── */
/**
 * Run work when the main thread is idle (falls back to setTimeout).
 */
const whenIdle = (cb, timeout = 1500) =>
  'requestIdleCallback' in window ? requestIdleCallback(cb, { timeout }) : setTimeout(cb, 0);

/** Resolve once DOM is interactive. */
const domReady = () =>
  DOC.readyState !== 'loading'
    ? Promise.resolve()
    : new Promise(res => DOC.addEventListener('DOMContentLoaded', res, { once: true }));

/** Prefer reduced motion if the user asked for it. */
const PREFERS_REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Smooth-scroll helper honoring reduced-motion preferences. */
const smoothScrollIntoView = (node) => {
  if (!node) return;
  node.scrollIntoView({ behavior: PREFERS_REDUCED ? 'auto' : 'smooth' });
};

/* ───────────────────────────── data model ──────────────────────────────── */
const pages = [];           // Flat list of all pages
const byId  = new Map();    // id → page
let root    = null;         // Root page (home)
const descMemo = new Map(); // memo for descendant counts

/**
 * Parse the Markdown bundle containing repeated blocks of:
 * <!-- id:"foo" title:"Bar" parent:"baz" tags:"x,y" ... -->\n
 * <markdown body...>
 *
 * The header parser is tolerant of:
 * - single/double quotes, optional whitespace
 * - unquoted tokens w/o spaces (id:home)
 * Missing id/title are auto-filled defensively to keep the runtime alive.
 * @param {string} txt - The fetched bundle text.
 */
function parseMarkdownBundle(txt) {
  const blockRE = /<!--([\s\S]*?)-->\s*([\s\S]*?)(?=<!--|$)/g;
  let match;
  while ((match = blockRE.exec(txt))) {
    const [, hdrRaw, body] = match;
    const meta = {};
    // Extract k:v pairs; supports k:"v", k:'v', k:v (no spaces in v)
    const pairRE = /\b([\w-]+)\s*:\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+))/g;
    let m;
    while ((m = pairRE.exec(hdrRaw))) {
      const [, k, v1, v2, v3] = m;
      meta[k] = (v1 ?? v2 ?? v3 ?? '').trim();
    }

    // Defensive defaults to avoid runtime crashes on malformed headers.
    if (!meta.id) {
      const base = String(meta.title || 'page').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'page';
      let uid = base, i = 2;
      while (byId.has(uid)) uid = `${base}-${i++}`;
      meta.id = uid;
    }
    if (!meta.title) meta.title = meta.id;

    const page = { ...meta, content: (body || '').trim(), children: [] };
    pages.push(page);
    // If duplicate id is encountered, keep the first, suffix the newcomer to avoid overwriting map.
    if (byId.has(page.id)) {
      let i = 2, nid = `${page.id}-${i}`;
      while (byId.has(nid)) nid = `${page.id}-${++i}`;
      page.id = nid;
    }
    byId.set(page.id, page);
  }

  if (!pages.length) throw new Error('No pages parsed from MD bundle.');

  // Determine root: prefer explicit 'home', else first page.
  root = byId.get('home') || pages[0];

  // Wire parents/children, tag sets, and page-level search strings.
  pages.forEach(p => {
    if (p !== root) {
      const parent = p.parent ? byId.get(String(p.parent).trim()) : null;
      p.parent = parent || null;
      if (parent) parent.children.push(p);
    } else {
      p.parent = null;
    }
    // Tags as a canonical Set
    p.tagsSet   = new Set(String(p.tags || '').split(',').map(s => s.trim()).filter(Boolean));
    // Lowercased search string: title + tags + raw body (O(n) memory)
    p.searchStr = (p.title + ' ' + [...p.tagsSet].join(' ') + ' ' + p.content).toLowerCase();
  });

  // Extract heading sections for deep search (ignores fenced code blocks).
  pages.forEach(p => {
    const counters = [0,0,0,0,0,0];
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
        const [, hashes, txt] = line.match(/^(#{1,5})\s+(.+)/);
        const level = hashes.length - 1;
        counters[level]++; for (let i = level + 1; i < 6; i++) counters[i] = 0;
        prev = {
          id: counters.slice(0, level + 1).filter(Boolean).join('_'),
          txt: txt.trim(),
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

/** Count descendants for a page (memoized). O(n) across a tree, amortized via memo. */
function descendants(page) {
  if (descMemo.has(page)) return descMemo.get(page);
  let n = 0;
  (function rec(x) { x.children.forEach(c => { n++; rec(c); }); })(page);
  descMemo.set(page, n);
  return n;
}

/**
 * Attach "secondary homes" (top-level clusters not under root) to root
 * by picking the largest representative page. This preserves user-visible
 * content while keeping the tree navigable from the single root.
 */
function attachSecondaryHomes() {
  const topOf = p => { while (p.parent) p = p.parent; return p; };
  const clusters = new Map(); // top → members[]
  for (const p of pages) {
    const top = topOf(p);
    if (top === root) continue;
    if (!clusters.has(top)) clusters.set(top, []);
    clusters.get(top).push(p);
  }
  let cid = 0;
  for (const [, members] of clusters) {
    const rep = members.reduce((a,b) => descendants(b) > descendants(a) ? b : a, members[0]);
    if (!rep.parent) {
      rep.parent = root; rep.isSecondary = true; rep.clusterId = cid++;
      root.children.push(rep);
    }
  }
}

/** Compute URL hash segments (#a#b#c) for each page by walking its parent chain. */
function computeHashes() {
  pages.forEach(p => {
    const segs = [];
    for (let n = p; n && n.parent; n = n.parent) segs.unshift(n.id);
    p.hash = segs.join('#'); // root has empty hash
  });
}
const hashOf = page => page?.hash ?? '';
/** Resolve a page from hash segments, walking from root down. */
const find = segs => {
  let n = root;
  for (const id of segs) {
    const c = n.children.find(k => k.id === id);
    if (!c) break;
    n = c;
  }
  return n;
};
/** Public navigation helper (preserves global name). */
function nav(page) { location.hash = '#' + hashOf(page); }
KM.nav = nav;

/* ───────────────────────────── asset loaders ───────────────────────────── */
const ensureOnce = fn => { let p; return () => (p ||= fn()); };

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

KM.ensureHighlight = ensureOnce(async () => {
  const { default: hljs } = await import('https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/es/core/+esm');
  if (Array.isArray(LANGS) && LANGS.length) {
    await Promise.allSettled(LANGS.map(async lang => {
      try {
        const mod = await import(`https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/es/languages/${lang}/+esm`);
        hljs.registerLanguage(lang, mod.default);
      } catch (_) { /* ignore unknown langs to keep boot resilient */ }
    }));
  }
  window.hljs = hljs;
});

KM.ensureHLJSTheme = ensureOnce(() => new Promise(res => {
  const THEME = {
    light: 'https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github.min.css',
    dark : 'https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github-dark.min.css',
  };
  const mode = DOC.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  let l = DOC.querySelector('link[data-hljs-theme]');
  if (!l) {
    l = DOC.createElement('link');
    l.rel = 'stylesheet'; l.setAttribute('data-hljs-theme','');
    DOC.head.appendChild(l);
  }
  if (l.getAttribute('href') === THEME[mode]) return res();
  l.onload = l.onerror = res; l.href = THEME[mode];
}));

let mdReady = null;
/** Lazy-load marked + plugins and expose a stable parse() surface. */
KM.ensureMarkdown = () => {
  if (mdReady) return mdReady;
  mdReady = Promise.all([
    import('https://cdn.jsdelivr.net/npm/marked@16.1.2/+esm'),
    import('https://cdn.jsdelivr.net/npm/marked-alert@2.1.2/+esm'),
    import('https://cdn.jsdelivr.net/npm/marked-footnote@1.4.0/+esm'),
  ]).then(([marked, alertMod, footnoteMod]) => {
    const md = new marked.Marked().use(alertMod.default()).use(footnoteMod.default());
    return { parse: (src, opt) => md.parse(src, { ...opt, mangle:false }) };
  });
  return mdReady;
};

KM.ensureKatex = ensureOnce(async () => {
  const BASE = 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/';
  if (!DOC.getElementById('katex-css')) {
    const link = Object.assign(DOC.createElement('link'), { id:'katex-css', rel:'stylesheet', href: BASE + 'katex.min.css' });
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
 * Copy text to clipboard with a visual flash on the trigger node.
 * Uses Clipboard API when available, else falls back to a hidden textarea.
 */
async function copyText(txt, node) {
  try {
    await navigator.clipboard.writeText(txt);
  } catch (_) {
    try {
      const ta = el('textarea', { style:'position:fixed;inset:-1000px;opacity:0' });
      ta.value = txt; DOC.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      ta.remove();
    } catch (e) {
      if (KM.DEBUG) console.warn('Clipboard copy failed', e);
    }
  } finally {
    if (node) { node.classList.add('flash'); setTimeout(() => node.classList.remove('flash'), 300); }
  }
}

/**
 * Assign deterministic numeric IDs to headings (1_2_3) for deep-linking.
 * Rendering of visible numbering (if any) is handled via CSS in the theme.
 */
function numberHeadings(elm) {
  const counters = [0,0,0,0,0,0];
  $$('h1,h2,h3,h4,h5', elm).forEach(h => {
    const level = +h.tagName[1] - 1;
    counters[level]++; for (let i = level + 1; i < 6; i++) counters[i] = 0;
    h.id = counters.slice(0, level+1).filter(Boolean).join('_');
  });
}

let tocObserver = null;
/**
 * Build the right-hand ToC based on headings inside #content.
 * Highlights the currently visible section using IntersectionObserver.
 */
function buildToc(page) {
  const nav = $('#toc'); if (!nav) return;
  nav.innerHTML = '';
  const heads = $$('#content h1,#content h2,#content h3');
  if (!heads.length) { tocObserver?.disconnect(); tocObserver = null; return; }

  const base = hashOf(page), ulEl = el('ul'), frag = DOC.createDocumentFragment();
  for (const h of heads) {
    frag.append(el('li', { dataset:{ level: h.tagName[1], hid: h.id } }, [
      el('a', { href: '#' + (base ? base + '#' : '') + h.id, textContent: h.textContent })
    ]));
  }
  ulEl.append(frag); nav.append(ulEl);

  tocObserver?.disconnect();
  tocObserver = new IntersectionObserver(entries => {
    for (const en of entries) {
      const a = $(`#toc li[data-hid="${en.target.id}"] > a`); if (!a) continue;
      if (en.isIntersecting) { $('#toc .toc-current')?.classList.remove('toc-current'); a.classList.add('toc-current'); }
    }
  }, { rootMargin:'0px 0px -70% 0px', threshold:0 });
  heads.forEach(h => tocObserver.observe(h));
}

function prevNext(page) {
  $('#prev-next')?.remove();
  if (!page.parent) return;
  const sib = page.parent.children;
  if (sib.length < 2) return;
  const i = sib.indexOf(page), wrap = el('div', { id:'prev-next' });
  if (i > 0) wrap.append(el('a', { href:'#'+hashOf(sib[i-1]), textContent:'← '+sib[i-1].title }));
  if (i < sib.length-1) wrap.append(el('a', { href:'#'+hashOf(sib[i+1]), textContent:sib[i+1].title+' →' }));
  $('#content').append(wrap);
}

/** "See also" related pages by tag overlap (descending). */
function seeAlso(page) {
  $('#see-also')?.remove();
  if (!page.tagsSet?.size) return;
  const related = pages
    .filter(p => p !== page)
    .map(p => ({ p, shared: [...p.tagsSet].filter(t => page.tagsSet.has(t)).length }))
    .filter(r => r.shared > 0)
    .sort((a,b)=> b.shared - a.shared || sortByTitle(a.p, b.p));
  if (!related.length) return;

  const wrap = el('div', { id:'see-also' }, [ el('h2', { textContent:'See also' }), el('ul') ]);
  const ulEl = wrap.querySelector('ul');
  related.forEach(({p}) => ulEl.append(el('li', {}, [ el('a', { href:'#'+hashOf(p), textContent:p.title }) ])));
  const content = $('#content'), pn = $('#prev-next');
  content.insertBefore(wrap, pn ?? null);
}

/** Prefix same-page footnote anchors with the current page hash so links keep working after routing. */
function fixFootnoteLinks(page) {
  const base = hashOf(page); if (!base) return;
  $$('#content a[href^="#"]').forEach(a => {
    const href = a.getAttribute('href');
    if (/^#(?:fn|footnote)/.test(href) && !href.includes(base + '#')) a.setAttribute('href', `#${base}${href}`);
  });
}

const ICONS = {
  link: 'M3.9 12c0-1.7 1.4-3.1 3.1-3.1h5.4v-2H7c-2.8 0-5 2.2-5 5s2.2 5 5 5h5.4v-2H7c-1.7 0-3.1-1.4-3.1-3.1zm5.4 1h6.4v-2H9.3v2zm9.7-8h-5.4v2H19c1.7 0 3.1 1.4 3.1 3.1s-1.4 3.1-3.1 3.1h-5.4v2H19c2.8 0 5-2.2 5-5s-2.2-5-5-5z',
  code: 'M19,21H5c-1.1,0-2-0.9-2-2V7h2v12h14V21z M21,3H9C7.9,3,7,3.9,7,5v12 c0,1.1,0.9,2,2,2h12c1.1,0,2-0.9,2-2V5C23,3.9,22.1,3,21,3z M21,17H9V5h12V17z',
};
/** Small helper to build icon-only buttons. */
const iconBtn = (title, path, cls, onClick) =>
  el('button', { class: cls, title, 'aria-label': title, onclick:onClick, innerHTML:
    `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${path}"></path></svg>` });

/** Add anchor-copy buttons to headings and make the whole heading clickable to copy. */
function decorateHeadings(page) {
  const base = hashOf(page);
  $$('#content h1,h2,h3,h4,h5').forEach(h => {
    const url = `${location.origin}${location.pathname}#${base ? base + '#' : ''}${h.id}`;
    const btn = h.querySelector('button.heading-copy') ||
      h.appendChild(iconBtn('Copy direct link', ICONS.link, 'heading-copy', e => {
        e.stopPropagation();
        copyText(url, h.querySelector('button.heading-copy'));
      }));
    h.style.cursor = 'pointer';
    h.onclick = () => copyText(url, btn);
  });
}

/** Add copy buttons to code blocks. */
function decorateCodeBlocks() {
  $$('#content pre').forEach(pre => {
    if (pre.querySelector('button.code-copy')) return;
    pre.append(iconBtn('Copy code', ICONS.code, 'code-copy', () => copyText(pre.innerText, pre.querySelector('button.code-copy'))));
  });
}

/* ─────────────────────────── sidebar / search ──────────────────────────── */
/** Build the left navigation tree (root children first, then secondary clusters). */
function buildTree() {
  const ul = $('#tree'); if (!ul) return;
  ul.innerHTML = '';
  const prim = root.children.filter(c => !c.isSecondary).sort(sortByTitle);
  const secs = root.children.filter(c => c.isSecondary).sort((a,b)=> a.clusterId - b.clusterId);

  const rec = (nodes, container, depth=0) => {
    nodes.forEach(p => {
      const li = el('li');
      if (p.children.length) {
        const open = depth < 2;
        li.className = 'folder' + (open ? ' open' : '');
        const caret = el('button', { class:'caret', 'aria-expanded': String(open), 'aria-label': (open?'Collapse ':'Expand ') + p.title });
        const lbl   = el('a', { class:'lbl', dataset:{ page:p.id }, href:'#'+hashOf(p), textContent:p.title });
        const sub   = el('ul', { style:`display:${open?'block':'none'}` });
        li.append(caret, lbl, sub);
        container.append(li);
        rec(p.children.sort(sortByTitle), sub, depth+1);
      } else {
        li.className = 'article';
        li.append(el('a', { dataset:{ page:p.id }, href:'#'+hashOf(p), textContent:p.title }));
        container.append(li);
      }
    });
  };

  const frag = DOC.createDocumentFragment();
  rec(prim, frag);
  secs.forEach(r => { frag.append(el('li', { class:'group-sep', innerHTML:'<hr>' })); rec([r], frag); });
  ul.append(frag);
}

/** Highlight the current page in the sidebar. */
function highlightSidebar(page) {
  $('#tree .sidebar-current')?.classList.remove('sidebar-current');
  $(`#tree a[data-page="${page.id}"]`)?.classList.add('sidebar-current');
}

/**
 * Simple multi-token AND search across pages and sections.
 * Complexity: O(P + matches) where P is number of pages (thousands are fine).
 */
function search(q) {
  const resUL = $('#results'), treeUL = $('#tree'); if (!resUL || !treeUL) return;
  const val = q.trim().toLowerCase();

  if (!val) { resUL.style.display='none'; resUL.innerHTML=''; treeUL.style.display=''; return; }

  const tokens = val.split(/\s+/).filter(t => t.length >= 2);
  resUL.innerHTML=''; resUL.style.display=''; treeUL.style.display='none';

  const frag = DOC.createDocumentFragment();
  pages.filter(p => tokens.every(tok => p.searchStr.includes(tok))).forEach(p => {
    const li = el('li', { class:'page-result' }, [ el('a', { href:'#'+hashOf(p), textContent:p.title }) ]);
    const matches = p.sections.filter(sec => tokens.every(tok => sec.search.includes(tok)));
    if (matches.length) {
      const base = hashOf(p), sub = el('ul', { class:'sub-results' });
      matches.forEach(sec => sub.append(el('li', { class:'heading-result' }, [
        el('a', { href:'#'+(base ? base+'#' : '')+sec.id, textContent:sec.txt })
      ])));
      li.append(sub);
    }
    frag.append(li);
  });
  resUL.append(frag);
  if (!resUL.children.length) resUL.innerHTML = '<li id="no_result">No result</li>';
}

/* ─────────────────────────── breadcrumb / crumb ────────────────────────── */
/** Build breadcrumb with sibling dropdowns and child menu. */
function breadcrumb(page) {
  const dyn = $('#crumb-dyn'); if (!dyn) return;
  dyn.innerHTML = '';
  const chain = []; for (let n = page; n; n = n.parent) chain.unshift(n); chain.shift();

  chain.forEach(n => {
    dyn.insertAdjacentHTML('beforeend', '<span class="separator">▸</span>');
    const wrap = el('span', { class:'dropdown' });
    const a = el('a', { textContent:n.title, href:'#'+hashOf(n) });
    if (n === page) a.className = 'crumb-current';
    wrap.append(a);

    const siblings = n.parent.children.filter(s => s !== n);
    if (siblings.length) {
      const ul = el('ul', { role:'menu', 'aria-label': 'Sibling pages' });
      siblings.forEach(s => ul.append(el('li', { role:'menuitem', tabIndex:0, textContent:s.title, onclick: () => nav(s) })));
      wrap.append(ul);
    }
    dyn.append(wrap);
  });

  if (page.children.length) {
    const box = el('span', { class:'childbox' }, [ el('span', { class:'toggle', textContent:'▾', title:'Children' }), el('ul', { role:'menu', 'aria-label': 'Child pages' }) ]);
    const ul = box.querySelector('ul');
    page.children.sort(sortByTitle).forEach(ch => ul.append(el('li', { role:'menuitem', tabIndex:0, textContent:ch.title, onclick: () => nav(ch) })));
    dyn.append(box);
  }

  // Keyboard activation for menuitems
  dyn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const li = e.target.closest('li[role="menuitem"]');
      if (li && typeof li.onclick === 'function') { e.preventDefault(); li.onclick(); }
    }
  }, { once: true });
}

/* ───────────────────────────── mini graph (D3) ─────────────────────────── */
const IDS = { current:'node_current', parent:'node_parent', leaf:'node_leaf', hierPRE:'link_hier', tagPRE:'link_tag', label:'graph_text' };
const graphs = {};
let CURRENT = -1;

/** Get the current size of the mini-graph SVG. */
function getMiniSize() {
  const svg = $('#mini'); if (!svg) return { w: 400, h: 300 };
  if (svg.classList.contains('fullscreen')) return { w: innerWidth, h: innerHeight };
  const r = svg.getBoundingClientRect();
  return { w: Math.max(1, r.width|0), h: Math.max(1, r.height|0) };
}

function updateMiniViewport() {
  if (!graphs.mini) return;
  const { svg, sim } = graphs.mini;
  const { w, h } = getMiniSize();
  graphs.mini.w = w; graphs.mini.h = h;
  svg.attr('viewBox', `0 0 ${w} ${h}`).attr('width',  w).attr('height', h).attr('preserveAspectRatio', 'xMidYMid meet');
  sim.force('center', KM.d3.forceCenter(w/2, h/2));
  sim.alpha(0.2).restart();
}

/**
 * Build graph nodes/links.
 * - Hierarchical parent/child links (tiered by subtree size)
 * - Tag-overlap links (skip if already hierarchically linked)
 * Complexity: O(P^2) for tag overlap pairs in the worst case; acceptable for a few thousand pages.
 */
function buildGraphData() {
  const nodes = [], links = [], adj = new Map(), hierPairs = new Set();
  const touch = (a,b) => { (adj.get(a) || adj.set(a, new Set()).get(a)).add(b); (adj.get(b) || adj.set(b, new Set()).get(b)).add(a); };
  const overlap = (A, B) => { let n=0; for (const x of A) if (B.has(x)) n++; return n; };
  const tierOf = n => n<3?1 : n<6?2 : n<11?3 : n<21?4 : 5;

  pages.forEach((p,i) => { p._i=i; nodes.push({ id:i, label:p.title, ref:p }); });

  pages.forEach(p => {
    if (!p.parent) return;
    if (p.isSecondary && p.parent === root) return;
    const a = p._i, b = p.parent._i;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    links.push({ source:a, target:b, shared:0, kind:'hier', tier: tierOf(descendants(p)) });
    hierPairs.add(key); touch(a, b);
  });

  for (let i = 0; i < pages.length; i++) for (let j = i+1; j < pages.length; j++) {
    const n = overlap(pages[i].tagsSet, pages[j].tagsSet); if (!n) continue;
    const key = i < j ? `${i}|${j}` : `${j}|${i}`; if (hierPairs.has(key)) continue;
    links.push({ source:i, target:j, shared:n, kind:'tag' }); touch(i, j);
  }
  return { nodes, links, adj };
}

/** Lazy-build the mini force-directed graph once the SVG is visible. */
async function buildGraph() {
  try {
    await KM.ensureD3();
  } catch (e) {
    if (KM.DEBUG) console.warn('D3 failed to load, mini-graph disabled.', e);
    return;
  }
  if (graphs.mini) return;

  const { nodes, links, adj } = buildGraphData();
  const svg = KM.d3.select('#mini');
  const { w: W, h: H } = getMiniSize();
  svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('preserveAspectRatio', 'xMidYMid meet');

  const localN = nodes.map(n => ({ ...n })), localL = links.map(l => ({ ...l }));

  const sim = KM.d3.forceSimulation(localN)
    .force('link',   KM.d3.forceLink(localL).id(d => d.id).distance(80))
    .force('charge', KM.d3.forceManyBody().strength(-240))
    .force('center', KM.d3.forceCenter(W/2, H/2));

  const view = svg.append('g').attr('class','view').attr('style','transition: transform 220ms ease-out');

  const link = view.append('g').selectAll('line')
    .data(localL).join('line')
    .attr('id', d => d.kind === 'hier' ? IDS.hierPRE + d.tier : IDS.tagPRE + Math.min(d.shared,5));

  const wireNode = sel => sel
    .attr('r', 6)
    .attr('id', d => d.ref.children.length ? IDS.parent : IDS.leaf)
    .style('cursor','pointer')
    .on('click', (e,d) => KM.nav(d.ref))
    .on('mouseover', (e,d) => fade(d.id, 0.15))
    .on('mouseout', () => fade(null, 1))
    .call(KM.d3.drag()
      .on('start', (e,d) => { d.fx = d.x; d.fy = d.y; })
      .on('drag',  (e,d) => { sim.alphaTarget(0.25).restart(); d.fx = e.x; d.fy = e.y; })
      .on('end',   (e,d) => { if (!e.active) sim.alphaTarget(0); d.fx = d.fy = null; }));

  const node = wireNode(view.append('g').selectAll('circle').data(localN).join('circle'));

  const label = view.append('g').selectAll('text')
    .data(localN).join('text')
    .attr('id', IDS.label).attr('font-size', 10)
    .attr('pointer-events','none')
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

  graphs.mini = { svg, node, label, sim, view, adj, w:W, h:H };
  observeMiniResize();
}

/** Update highlight for the current page node in the mini-graph and nudge it to center. */
function highlightCurrent(force=false) {
  if (!graphs.mini) return;
  const seg = location.hash.slice(1).split('#').filter(Boolean);
  const pg = find(seg); const id = pg?._i ?? -1;
  if (id === CURRENT && !force) return;

  const g = graphs.mini;
  g.node
    .attr('id', d => d.id === id ? IDS.current : (d.ref.children.length ? IDS.parent : IDS.leaf))
    .attr('r',  d => d.id === id ? 8 : 6);
  g.label.classed('current', d => d.id === id);

  const cx = g.w/2, cy = g.h/2;
  g.node.filter(d => d.id === id).each(d => {
    const dx = cx - d.x, dy = cy - d.y;
    g.view.attr('transform', `translate(${dx},${dy})`);
    const k = 0.10; d.vx += (cx - d.x) * k; d.vy += (cy - d.y) * k;
  });

  g.sim.alphaTarget(0.15).restart();
  setTimeout(() => g.sim.alphaTarget(0), 250);
  CURRENT = id;
}

/** Observe resize of the mini-graph container and keep the simulation centered. */
function observeMiniResize() {
  const elx = $('#mini'); if (!elx) return;
  new ResizeObserver(() => { if (!graphs.mini) return; updateMiniViewport(); highlightCurrent(true); }).observe(elx);
}

/* ───────────────────────── renderer + router + init ────────────────────── */
/**
 * Render a page into #content and progressively enhance:
 * - footnotes, heading IDs, ToC, code highlight, KaTeX
 * - copy buttons, prev/next, see also
 * - smooth scroll to an optional anchor
 */
async function render(page, anchor) {
  const { parse } = await KM.ensureMarkdown();
  const contentEl = $('#content');
  contentEl.innerHTML = parse(page.content, { headerIds:false });

  // Progressive image loading hints
  const imgs = $$('#content img');
  imgs.forEach(img => {
    img.loading = 'lazy'; img.decoding = 'async';
    if (!img.hasAttribute('fetchpriority')) img.setAttribute('fetchpriority','low');
  });

  fixFootnoteLinks(page);
  numberHeadings(contentEl);

  // Syntax highlighting (theme CSS + core + all languages requested)
  if (DOC.querySelector('#content pre code')) {
    await KM.ensureHLJSTheme(); await KM.ensureHighlight(); window.hljs.highlightAll();
  }

  // Math rendering (triggered only when math markers are present)
  if (/(\$[^$]+\$|\\\(|\\\[)/.test(page.content)) {
    await KM.ensureKatex();
    window.renderMathInElement(contentEl, {
      delimiters: [
        { left:'$$', right:'$$', display:true },
        { left:'\\[', right:'\\]', display:true },
        { left:'$',  right:'$',  display:false },
        { left:'\\(', right:'\\)', display:false }
      ],
      throwOnError: false
    });
  }

  buildToc(page);
  decorateHeadings(page);
  decorateCodeBlocks();
  prevNext(page);
  seeAlso(page);

  // Anchor scroll + focus target for accessibility
  if (anchor) {
    const node = DOC.getElementById(anchor);
    if (node) {
      node.tabIndex = -1; // make it programmatically focusable
      node.setAttribute('data-focus-anchor','');
      smoothScrollIntoView(node);
      node.focus({ preventScroll:true });
    }
  } else {
    const h1 = $('#content h1') || $('#content');
    if (h1) { h1.tabIndex = -1; h1.setAttribute('data-focus-anchor',''); h1.focus({ preventScroll:true }); }
  }
}

let currentPage = null;

/** Router for #<path>#<headingId> hash-based navigation. */
function route() {
  closePanels();
  const seg = location.hash.slice(1).split('#').filter(Boolean);
  const page = find(seg);
  const base = hashOf(page);
  const baseSegs = base ? base.split('#') : [];
  const anchor = seg.slice(baseSegs.length).join('#');

  if (currentPage !== page) {
    currentPage = page;
    DOC.documentElement.scrollTop = 0; DOC.body.scrollTop = 0;
    breadcrumb(page); render(page, anchor); highlightCurrent(true); highlightSidebar(page);
  } else if (anchor) {
    const target = DOC.getElementById(anchor);
    if (target) {
      smoothScrollIntoView(target);
      const a = $(`#toc li[data-hid="${anchor}"] > a`);
      if (a) { $('#toc .toc-current')?.classList.remove('toc-current'); a.classList.add('toc-current'); }
      target.tabIndex = -1; target.focus({ preventScroll:true });
    }
  }
}

/* ─────────────────────────── global UI + theme ─────────────────────────── */
/** Close any temporary panels (sidebar/util) on small screens. */
function closePanels() {
  $('#sidebar')?.classList.remove('open');
  $('#util')?.classList.remove('open');
}

/** Initial UI wiring: titles, theme, tree, search, mini-graph, routing. */
function initUI() {
  $('#wiki-title-text').textContent = TITLE; document.title = TITLE;
  buildTree();

  // Theme toggle + meta/theme-color + accent
  (function themeInit() {
    const btn = $('#theme-toggle'), rootEl = DOC.documentElement, media = matchMedia('(prefers-color-scheme: dark)');
    const stored = localStorage.getItem('km-theme'); // 'dark' | 'light' | null
    const cfg = (DEFAULT_THEME === 'dark' || DEFAULT_THEME === 'light') ? DEFAULT_THEME : null;
    let dark = stored ? (stored === 'dark') : (cfg ? cfg === 'dark' : media.matches);

    if (typeof ACCENT === 'string' && ACCENT) rootEl.style.setProperty('--color-accent', ACCENT);
    const metaTheme = DOC.querySelector('meta[name="theme-color"]');

    apply(dark);
    btn.onclick = () => { dark = !dark; apply(dark); localStorage.setItem('km-theme', dark ? 'dark' : 'light'); };

    function apply(isDark) {
      rootEl.style.setProperty('--color-main', isDark ? 'rgb(29,29,29)' : 'white');
      rootEl.setAttribute('data-theme', isDark ? 'dark' : 'light');
      metaTheme && metaTheme.setAttribute('content', isDark ? '#1d1d1d' : '#ffffff');
      KM.ensureHLJSTheme();
    }
  })();

  route();

  // Lazy-init mini graph when visible
  const miniEl = $('#mini');
  new IntersectionObserver((entries, obs) => {
    if (entries[0]?.isIntersecting) { buildGraph(); obs.disconnect(); }
  }).observe(miniEl);

  $('#expand').onclick = () => {
    miniEl.classList.toggle('fullscreen');
    updateMiniViewport();
    requestAnimationFrame(() => highlightCurrent(true));
  };

  // Search box
  const searchInput = $('#search'), searchClear = $('#search-clear');
  let debounce = 0;
  searchInput.oninput = e => {
    clearTimeout(debounce);
    const val = e.target.value; searchClear.style.display = val ? '' : 'none';
    debounce = setTimeout(() => search(val), 150);
  };
  searchClear.onclick = () => { searchInput.value=''; searchClear.style.display='none'; search(''); searchInput.focus(); };

  // Panel toggles for small screens
  const togglePanel = sel => {
    const elx = $(sel); const wasOpen = elx.classList.contains('open');
    closePanels();
    if (!wasOpen) {
      elx.classList.add('open');
      if (!elx.querySelector('.panel-close')) {
        elx.append(el('button', { class:'panel-close', textContent:'✕', 'aria-label':'Close panel', onclick: closePanels }));
      }
    }
  };
  $('#burger-sidebar').onclick = () => togglePanel('#sidebar');
  $('#burger-util').onclick    = () => togglePanel('#util');

  // Resize reactions
  addEventListener('resize', () => {
    if (matchMedia('(min-width:1001px)').matches) closePanels();
    if ($('#mini')?.classList.contains('fullscreen')) { updateMiniViewport(); highlightCurrent(true); }
  }, { passive: true });

  // Sidebar interactions
  $('#tree').addEventListener('click', e => {
    const caret = e.target.closest('button.caret');
    if (caret) {
      const li = caret.closest('li.folder'), sub = li.querySelector('ul');
      const open = !li.classList.contains('open');
      li.classList.toggle('open', open); caret.setAttribute('aria-expanded', String(open));
      if (sub) sub.style.display = open ? 'block' : 'none';
      return;
    }
    if (e.target.closest('a')) closePanels();
  }, { passive: true });

  // Close panels when clicking search results
  $('#results').addEventListener('click', e => { if (e.target.closest('a')) closePanels(); }, { passive: true });

  addEventListener('hashchange', route, { passive: true });

  // Warm up highlight.js in idle time for snappier first code page
  whenIdle(() => { KM.ensureHighlight(); });
}

/* ──────────────────────────────── boot ─────────────────────────────────── */
(async () => {
  try {
    if (!MD) throw new Error('CONFIG.MD is empty.');
    const ctrl = new AbortController();
    const timer = setTimeout(() => { try { ctrl.abort('fetch-timeout'); } catch(_){} }, 20000);
    const r = await fetch(MD, { cache: 'reload', signal: ctrl.signal }); clearTimeout(timer);
    if (!r.ok) throw new Error(`Failed to fetch MD (${r.status})`);
    const txt = await r.text();

    parseMarkdownBundle(txt);
    attachSecondaryHomes();
    computeHashes();

    await domReady();
    initUI();

    // Ensure graph highlight aligns with initial route after initial paint.
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
