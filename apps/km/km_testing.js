/* eslint-env browser, es2022 */
/* km — Static No-Build Wiki runtime (ESM) • Two files only, libs via CDN */

'use strict';

/* ───────────────────────────── PUBLIC API  ──────────────────────────── */
window.KM = window.KM || {};
const KM = window.KM;

/* ───────────────────────────── SHORTCUTS  ───────────────────────────── */
const DOC = document;
const $   = (sel, ctx = DOC) => ctx.querySelector(sel);
const $$  = (sel, ctx = DOC) => [...ctx.querySelectorAll(sel)];
const el  = (tag, props = {}, children = []) => {
  const n = DOC.createElement(tag);
  for (const k in props) {
    const v = props[k];
    if (k === 'class' || k === 'className') n.className = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k in n) n[k] = v;
    else n.setAttribute(k, v);
  }
  for (const c of children) n.append(c);
  return n;
};
Object.assign(KM, { $, $$, DEBUG: false });

/* ───────────────────────────── CONFIG  ──────────────────────────────── */
const CFG = window.CONFIG || {};
const { TITLE = 'Wiki', MD = '', LANGS = [], DEFAULT_THEME, ACCENT } = CFG;

/* ───────────────────────────── HELPERS  ─────────────────────────────── */
/** Resolve work during idle time or soon after. */
const whenIdle = (cb, timeout = 1500) =>
  'requestIdleCallback' in window
    ? requestIdleCallback(cb, { timeout })
    : setTimeout(cb, 0);

/** Promise that resolves when DOM is ready. */
const domReady = () =>
  DOC.readyState !== 'loading'
    ? Promise.resolve()
    : new Promise(res => DOC.addEventListener('DOMContentLoaded', res, { once: true }));

/** Simple slug generator (a-z0-9 + dash). */
const safeSlug = str =>
  str
    .toLowerCase()
    .replace(/['"()[\]]+/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);

/* ───────────────────────────── DATA MODEL  ──────────────────────────── */
const pages   = [];
const byId    = new Map();
let   root    = null;
const descCnt = new Map();

/**
 * Parse the markdown bundle contained in a single string.
 * Requires front-matter blocks wrapped in HTML comments:
 * <!-- id:"home" title:"Welcome" parent:"" tags:"intro,foo" -->
 * @throws {Error} if no pages were detected.
 */
function parseMarkdownBundle(txt) {
  /** Ensure unique IDs, auto-slugging from title if needed. */
  const uniqId = meta => {
    let id = meta.id?.trim() || safeSlug(meta.title || '');
    if (!id) id = `page-${pages.length}`;
    let base = id, n = 1;
    while (byId.has(id)) id = `${base}-${n++}`;
    return id;
  };

  const blocks = txt.matchAll(/<!--([\s\S]*?)-->\s*([\s\S]*?)(?=<!--|$)/g);
  for (const [, hdr, body] of blocks) {
    const meta = {};
    hdr.replace(/(\w+):"([^"]+)"/g, (_, k, v) => (meta[k] = v.trim()));
    meta.id = uniqId(meta);
    const page = {
      ...meta,
      content: (body || '').trim(),
      children: [],
    };
    pages.push(page);
    byId.set(page.id, page);
  }
  if (!pages.length) throw new Error('No pages parsed from MD bundle.');
  root = byId.get('home') || pages[0];

  /* ── Relationships, tags & search strings ── */
  for (const p of pages) {
    if (p !== root) {
      const parent = byId.get((p.parent || '').trim());
      p.parent = parent || null;
      parent?.children.push(p);
    }
    p.tagsSet   = new Set((p.tags || '').split(',').map(s => s.trim()).filter(Boolean));
    p.searchStr = (p.title + ' ' + [...p.tagsSet].join(' ') + ' ' + p.content).toLowerCase();
  }

  /* ── Section extraction for deep-heading search ── */
  for (const p of pages) {
    const counters   = Array(6).fill(0);
    const sections   = [];
    let inFence      = false;
    let offset       = 0;
    let prevSection  = null;

    for (const line of p.content.split(/\r?\n/)) {
      if (/^(?:```|~~~)/.test(line)) inFence = !inFence;

      if (!inFence && /^(#{1,5})\s+/.test(line)) {
        if (prevSection) {
          prevSection.body   = p.content.slice(prevSection.bodyStart, offset).trim();
          prevSection.search = (prevSection.txt + ' ' + prevSection.body).toLowerCase();
          sections.push(prevSection);
        }
        const [, hashes, txt] = line.match(/^(#{1,5})\s+(.+)/);
        const lvl = hashes.length - 1;
        counters[lvl]++; for (let i = lvl + 1; i < 6; i++) counters[i] = 0;

        prevSection = {
          id: counters.slice(0, lvl + 1).filter(Boolean).join('_'),
          txt: txt.trim(),
          bodyStart: offset + line.length + 1,
        };
      }
      offset += line.length + 1;
    }
    if (prevSection) {
      prevSection.body   = p.content.slice(prevSection.bodyStart).trim();
      prevSection.search = (prevSection.txt + ' ' + prevSection.body).toLowerCase();
      sections.push(prevSection);
    }
    p.sections = sections;
  }
}

/** Return total descendant count (memoized). */
function descendants(page) {
  if (descCnt.has(page)) return descCnt.get(page);
  let n = 0;
  (function walk(p) { p.children.forEach(c => { n++; walk(c); }); })(page);
  descCnt.set(page, n);
  return n;
}

/**
 * Promote the representative of each non-root cluster directly under root.
 * Representative = member with the highest descendant count.
 */
function attachSecondaryHomes() {
  const findTop = p => { while (p.parent) p = p.parent; return p; };
  const clusters = new Map();

  for (const p of pages) {
    const top = findTop(p);
    if (top === root) continue;
    if (!clusters.has(top)) clusters.set(top, []);
    clusters.get(top).push(p);
  }

  let cid = 0;
  for (const members of clusters.values()) {
    const rep = members.reduce((a, b) => (descendants(b) > descendants(a) ? b : a));
    if (!rep.parent) {
      rep.parent = root;
      rep.isSecondary = true;
      rep.clusterId   = cid++;
      root.children.push(rep);
    }
  }
}

/* ───────────────────────────── HASH ROUTING  ─────────────────────────── */
function computeHashes() {
  pages.forEach(p => {
    const segs = [];
    for (let n = p; n && n.parent; n = n.parent) segs.unshift(n.id);
    p.hash = segs.join('#');
  });
}
const hashOf = p => p?.hash ?? '';
/** Find page by following `segs` from root. */
const find = segs => {
  let n = root;
  for (const id of segs) {
    const child = n.children.find(k => k.id === id);
    if (!child) break;
    n = child;
  }
  return n;
};
/** Navigate to a page (exposed as `KM.nav`). */
function nav(p) { location.hash = '#' + hashOf(p); }
KM.nav = nav;

/* ───────────────────────────── MODULE LOADERS  ────────────────────────── */
const ensureOnce = fn => { let memo; return () => (memo ||= fn()); };

KM.ensureD3 = ensureOnce(async () => {
  const [sel, force, drag] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/d3-selection@3/+esm'),
    import('https://cdn.jsdelivr.net/npm/d3-force@3/+esm'),
    import('https://cdn.jsdelivr.net/npm/d3-drag@3/+esm'),
  ]);
  KM.d3 = {
    select: sel.select,
    selectAll: sel.selectAll,
    forceSimulation: force.forceSimulation,
    forceLink: force.forceLink,
    forceManyBody: force.forceManyBody,
    forceCenter: force.forceCenter,
    drag: drag.drag,
  };
});

KM.ensureHighlight = ensureOnce(async () => {
  const { default: hljs } = await import('https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/es/core/+esm');
  if (Array.isArray(LANGS) && LANGS.length) {
    await Promise.allSettled(
      LANGS.map(async lang => {
        try {
          const mod = await import(
            `https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/es/languages/${lang}/+esm`
          );
          hljs.registerLanguage(lang, mod.default);
        } catch (_) { /* ignore missing langs */ }
      }),
    );
  }
  window.hljs = hljs;
});

KM.ensureHLJSTheme = ensureOnce(
  () =>
    new Promise(res => {
      const THEME = {
        light: 'https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github.min.css',
        dark: 'https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github-dark.min.css',
      };
      const mode = DOC.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      let link = DOC.querySelector('link[data-hljs-theme]');
      if (!link) {
        link = el('link', { rel: 'stylesheet', 'data-hljs-theme': '' });
        DOC.head.appendChild(link);
      }
      if (link.href === THEME[mode]) return res();
      link.onload = link.onerror = res;
      link.href = THEME[mode];
    }),
);

let mdReady = null;
KM.ensureMarkdown = () => {
  if (mdReady) return mdReady;
  mdReady = Promise.all([
    import('https://cdn.jsdelivr.net/npm/marked@16/+esm'),
    import('https://cdn.jsdelivr.net/npm/marked-alert@2/+esm'),
    import('https://cdn.jsdelivr.net/npm/marked-footnote@1/+esm'),
  ]).then(([marked, alertMod, footnoteMod]) => {
    const md = new marked.Marked().use(alertMod.default()).use(footnoteMod.default());
    return { parse: (src, opt) => md.parse(src, { ...opt, mangle: false }) };
  });
  return mdReady;
};

KM.ensureKatex = ensureOnce(async () => {
  const BASE = 'https://cdn.jsdelivr.net/npm/katex@0.16/dist/';
  if (!DOC.getElementById('katex-css')) {
    DOC.head.append(
      el('link', { id: 'katex-css', rel: 'stylesheet', href: BASE + 'katex.min.css' }),
    );
  }
  const [katex, auto] = await Promise.all([
    import(BASE + 'katex.min.js/+esm'),
    import(BASE + 'contrib/auto-render.min.js/+esm'),
  ]);
  window.katex = katex;
  window.renderMathInElement = auto.default;
});

/* ───────────────────────────── RENDER UTILS  ──────────────────────────── */
const sortByTitle = (a, b) => a.title.localeCompare(b.title);

/** Copy helper with UI flash. */
async function copyText(txt, node) {
  try {
    await navigator.clipboard.writeText(txt);
    node?.classList.add('flash');
    setTimeout(() => node?.classList.remove('flash'), 300);
  } catch (e) {
    if (KM.DEBUG) console.warn('Clipboard API unavailable', e);
  }
}

/** Add numeric IDs to headings for deep linking. */
function numberHeadings(container) {
  const counters = Array(6).fill(0);
  $$('h1,h2,h3,h4,h5', container).forEach(h => {
    const lvl = +h.tagName[1] - 1;
    counters[lvl]++; for (let i = lvl + 1; i < 6; i++) counters[i] = 0;
    if (!h.id) h.id = counters.slice(0, lvl + 1).filter(Boolean).join('_');
  });
}

/* ──────────────────────── DYNAMIC DECORATIONS  ───────────────────────── */
/** Cleanup store for observers to avoid leaks between page swaps. */
const liveObservers = new Set();
const rememberObs = obs => (liveObservers.add(obs), obs);
const clearLiveObservers = () => {
  for (const o of liveObservers) o.disconnect();
  liveObservers.clear();
};

/** Build the table-of-contents pane. */
function buildToc(page) {
  const nav = $('#toc');
  if (!nav) return;
  nav.innerHTML = '';

  const heads = $$('#content h1,#content h2,#content h3');
  if (!heads.length) return;

  const base = hashOf(page);
  const ul = el('ul');
  const frag = DOC.createDocumentFragment();
  for (const h of heads) {
    frag.append(
      el(
        'li',
        { dataset: { level: h.tagName[1], hid: h.id } },
        [el('a', { href: `#${base ? base + '#' : ''}${h.id}`, textContent: h.textContent })],
      ),
    );
  }
  ul.append(frag);
  nav.append(ul);

  /* Active-heading tracking */
  const obs = rememberObs(
    new IntersectionObserver(
      entries => {
        for (const en of entries) {
          const a = $(`#toc li[data-hid="${en.target.id}"] > a`);
          if (a && en.isIntersecting) {
            $('#toc .toc-current')?.classList.remove('toc-current');
            a.classList.add('toc-current');
          }
        }
      },
      { rootMargin: '0px 0px -70% 0px', threshold: 0 },
    ),
  );
  heads.forEach(h => obs.observe(h));
}

/** Prev / Next sibling links. */
function prevNext(page) {
  $('#prev-next')?.remove();
  if (!page.parent) return;
  const sib = page.parent.children;
  if (sib.length < 2) return;
  const i = sib.indexOf(page);
  const wrap = el('div', { id: 'prev-next' });

  if (i > 0)
    wrap.append(el('a', { href: `#${hashOf(sib[i - 1])}`, textContent: `← ${sib[i - 1].title}` }));
  if (i < sib.length - 1)
    wrap.append(el('a', { href: `#${hashOf(sib[i + 1])}`, textContent: `${sib[i + 1].title} →` }));
  $('#content').append(wrap);
}

/** "See also" recommendations by tag overlap. */
function seeAlso(page) {
  $('#see-also')?.remove();
  if (!page.tagsSet?.size) return;
  const related = pages
    .filter(p => p !== page)
    .map(p => ({ p, shared: [...p.tagsSet].filter(t => page.tagsSet.has(t)).length }))
    .filter(r => r.shared)
    .sort((a, b) => b.shared - a.shared || sortByTitle(a.p, b.p));
  if (!related.length) return;

  const wrap = el('div', { id: 'see-also' }, [el('h2', { textContent: 'See also' }), el('ul')]);
  const ul = wrap.querySelector('ul');
  for (const { p } of related) {
    ul.append(el('li', {}, [el('a', { href: `#${hashOf(p)}`, textContent: p.title })]));
  }
  const pn = $('#prev-next');
  $('#content').insertBefore(wrap, pn ?? null);
}

/** Fix footnote self-links that broke after hash prefixing. */
function fixFootnoteLinks(page) {
  const base = hashOf(page);
  if (!base) return;
  $$('#content a[href^="#"]').forEach(a => {
    const href = a.getAttribute('href');
    if (/^#(?:fn|footnote)/.test(href) && !href.includes(base + '#')) {
      a.setAttribute('href', `#${base}${href}`);
    }
  });
}

/* ────────────────────────── COPY BUTTONS  ────────────────────────────── */
const ICONS = {
  link: 'M3.9 12c0-1.7 1.4-3.1 3.1-3.1h5.4v-2H7c-2.8 0-5 2.2-5 5s2.2 5 5 5h5.4v-2H7c-1.7 0-3.1-1.4-3.1-3.1zm5.4 1h6.4v-2H9.3v2zm9.7-8h-5.4v2H19c1.7 0 3.1 1.4 3.1 3.1s-1.4 3.1-3.1 3.1h-5.4v2H19c2.8 0 5-2.2 5-5s-2.2-5-5-5z',
  code: 'M19,21H5c-1.1,0-2-0.9-2-2V7h2v12h14V21z M21,3H9C7.9,3,7,3.9,7,5v12 c0,1.1,0.9,2,2,2h12c1.1,0,2-0.9,2-2V5C23,3.9,22.1,3,21,3z M21,17H9V5h12V17z',
};

const makeBtn = (title, path, cls) =>
  el('button', {
    class: cls,
    title,
    'aria-label': title,
    innerHTML: `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${path}"></path></svg>`,
  });

/** Decorate headings with copy-link buttons + click-to-copy behaviour. */
function decorateHeadings(page) {
  const base = hashOf(page);
  $$('#content h1,h2,h3,h4,h5').forEach(h => {
    const url = `${location.origin}${location.pathname}#${base ? base + '#' : ''}${h.id}`;
    let btn = h.querySelector('button.heading-copy');
    if (!btn) {
      btn = makeBtn('Copy direct link', ICONS.link, 'heading-copy');
      h.append(btn);
    }
    h.style.cursor = 'pointer';
    h.onclick = () => copyText(url, btn);
  });
}

/** Decorate codeblocks with copy buttons (event delegation). */
function decorateCodeBlocks() {
  const content = $('#content');
  const btnHTML = makeBtn('Copy code', ICONS.code, 'code-copy').outerHTML;

  $$('pre', content).forEach(pre => {
    if (!pre.querySelector('button.code-copy')) pre.insertAdjacentHTML('beforeend', btnHTML);
  });

  content.addEventListener('click', e => {
    const btn = e.target.closest('button.code-copy');
    if (!btn) return;
    const pre = btn.closest('pre');
    copyText(pre.innerText, btn);
  });
}

/* ────────────────────────── SIDEBAR / SEARCH  ────────────────────────── */
function buildTree() {
  const ul = $('#tree');
  if (!ul) return;
  ul.innerHTML = '';

  const prim  = root.children.filter(c => !c.isSecondary).sort(sortByTitle);
  const secs  = root.children.filter(c => c.isSecondary).sort((a, b) => a.clusterId - b.clusterId);

  /** Recursive builder. */
  const rec = (nodes, container, depth = 0) => {
    for (const p of nodes) {
      const li = el('li');
      if (p.children.length) {
        const open  = depth < 2;
        li.className = 'folder' + (open ? ' open' : '');
        const caret = el('button', { class: 'caret', 'aria-expanded': String(open) });
        const lbl   = el('a', { class: 'lbl', dataset: { page: p.id }, href: `#${hashOf(p)}`, textContent: p.title });
        const sub   = el('ul', { style: `display:${open ? 'block' : 'none'}` });
        li.append(caret, lbl, sub);
        container.append(li);
        rec(p.children.sort(sortByTitle), sub, depth + 1);
      } else {
        li.className = 'article';
        li.append(el('a', { dataset: { page: p.id }, href: `#${hashOf(p)}`, textContent: p.title }));
        container.append(li);
      }
    }
  };

  const frag = DOC.createDocumentFragment();
  rec(prim, frag);
  for (const r of secs) {
    frag.append(el('li', { class: 'group-sep', innerHTML: '<hr>' }));
    rec([r], frag);
  }
  ul.append(frag);
}

function highlightSidebar(page) {
  $('#tree .sidebar-current')?.classList.remove('sidebar-current');
  $(`#tree a[data-page="${page.id}"]`)?.classList.add('sidebar-current');
}

/** Full-text search in pages + headings. */
function search(q) {
  const resUL  = $('#results');
  const treeUL = $('#tree');
  if (!resUL || !treeUL) return;

  const val    = q.trim().toLowerCase();
  if (!val) {
    resUL.style.display = 'none';
    resUL.innerHTML     = '';
    treeUL.style.display = '';
    return;
  }

  const tokens = val.split(/\s+/).filter(tok => tok.length >= 2);
  resUL.innerHTML      = '';
  resUL.style.display  = '';
  treeUL.style.display = 'none';

  const frag = DOC.createDocumentFragment();
  for (const p of pages) {
    if (!tokens.every(tok => p.searchStr.includes(tok))) continue;
    const li   = el('li', { class: 'page-result' }, [
      el('a', { href: `#${hashOf(p)}`, textContent: p.title }),
    ]);
    const matches = p.sections.filter(sec => tokens.every(tok => sec.search.includes(tok)));
    if (matches.length) {
      const base = hashOf(p);
      const sub  = el('ul', { class: 'sub-results' });
      for (const sec of matches) {
        sub.append(
          el('li', { class: 'heading-result' }, [
            el('a', { href: `#${base ? base + '#' : ''}${sec.id}`, textContent: sec.txt }),
          ]),
        );
      }
      li.append(sub);
    }
    frag.append(li);
  }
  resUL.append(frag);
  if (!resUL.children.length) resUL.innerHTML = '<li id="no_result">No result</li>';
}

/* ───────────────────────── BREADCRUMB / CRUMB  ───────────────────────── */
function breadcrumb(page) {
  const dyn = $('#crumb-dyn');
  if (!dyn) return;
  dyn.innerHTML = '';

  const chain = [];
  for (let n = page; n; n = n.parent) chain.unshift(n);
  chain.shift(); // remove root

  for (const n of chain) {
    dyn.insertAdjacentHTML('beforeend', '<span class="separator">▸</span>');
    const wrap = el('span', { class: 'dropdown' });
    const a    = el('a', { textContent: n.title, href: `#${hashOf(n)}` });
    if (n === page) a.className = 'crumb-current';
    wrap.append(a);

    const sibs = n.parent.children.filter(s => s !== n);
    if (sibs.length) {
      const ul = el('ul');
      sibs.forEach(s => ul.append(el('li', { textContent: s.title, onclick: () => nav(s) })));
      wrap.append(ul);
    }
    dyn.append(wrap);
  }

  /* Children dropdown */
  if (page.children.length) {
    const box  = el('span', { class: 'childbox' }, [el('span', { class: 'toggle', textContent: '▾' }), el('ul')]);
    const ul   = box.querySelector('ul');
    page.children.sort(sortByTitle).forEach(ch =>
      ul.append(el('li', { textContent: ch.title, onclick: () => nav(ch) })),
    );
    dyn.append(box);
  }
}

/* ──────────────────────────── MINI GRAPH  ───────────────────────────── */
const IDS = {
  current: 'node_current',
  parent: 'node_parent',
  leaf: 'node_leaf',
  hierPRE: 'link_hier',
  tagPRE: 'link_tag',
  label: 'graph_text',
};
const graphs   = {};
let   CURRENT  = -1;

function getMiniSize() {
  const svg = $('#mini');
  if (!svg) return { w: 400, h: 300 };
  if (svg.classList.contains('fullscreen')) return { w: innerWidth, h: innerHeight };
  const r = svg.getBoundingClientRect();
  return { w: Math.max(1, r.width | 0), h: Math.max(1, r.height | 0) };
}

function updateMiniViewport() {
  if (!graphs.mini) return;
  const { svg, sim } = graphs.mini;
  const { w, h }     = getMiniSize();
  graphs.mini.w = w;
  graphs.mini.h = h;
  svg.attr('viewBox', `0 0 ${w} ${h}`).attr('width', w).attr('height', h).attr('preserveAspectRatio', 'xMidYMid meet');
  sim.force('center', KM.d3.forceCenter(w / 2, h / 2));
  sim.alpha(0.2).restart();
}

/** Build node / link lists with tag-indexing (O(N + E)). */
function buildGraphData() {
  const nodes   = pages.map((p, i) => ({ id: i, label: p.title, ref: p }));
  const links   = [];
  const adj     = new Map(nodes.map(n => [n.id, new Set()]));
  const hierSet = new Set();

  /* Hierarchy links */
  pages.forEach((p, i) => {
    p._i = i;
    if (!p.parent || (p.isSecondary && p.parent === root)) return;
    const a = i;
    const b = p.parent._i;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    links.push({ source: a, target: b, shared: 0, kind: 'hier', tier: Math.min(Math.floor(descendants(p) / 3) + 1, 5) });
    hierSet.add(key);
    adj.get(a).add(b);
    adj.get(b).add(a);
  });

  /* Tag links via index */
  const tagIdx = new Map();
  pages.forEach((p, i) => {
    for (const t of p.tagsSet) {
      if (!tagIdx.has(t)) tagIdx.set(t, []);
      tagIdx.get(t).push(i);
    }
  });
  for (const list of tagIdx.values()) {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const i = list[a], j = list[b];
        const key = i < j ? `${i}|${j}` : `${j}|${i}`;
        if (hierSet.has(key)) continue;
        let link = links.find(l => (l.source === i && l.target === j) || (l.source === j && l.target === i));
        if (!link) {
          link = { source: i, target: j, shared: 0, kind: 'tag' };
          links.push(link);
        }
        link.shared++;
        adj.get(i).add(j);
        adj.get(j).add(i);
      }
    }
  }
  return { nodes, links, adj };
}

async function buildGraph() {
  await KM.ensureD3();
  if (graphs.mini) return;

  const { nodes, links, adj } = buildGraphData();
  const svg = KM.d3.select('#mini');
  const { w: W, h: H } = getMiniSize();
  svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('preserveAspectRatio', 'xMidYMid meet');

  const localN = nodes.map(n => ({ ...n }));
  const localL = links.map(l => ({ ...l }));

  const sim = KM.d3
    .forceSimulation(localN)
    .force('link', KM.d3.forceLink(localL).id(d => d.id).distance(80))
    .force('charge', KM.d3.forceManyBody().strength(-240))
    .force('center', KM.d3.forceCenter(W / 2, H / 2));

  const view = svg.append('g').attr('class', 'view').attr('style', 'transition: transform 220ms ease-out');

  const link = view
    .append('g')
    .selectAll('line')
    .data(localL)
    .join('line')
    .attr('id', d => (d.kind === 'hier' ? IDS.hierPRE + d.tier : IDS.tagPRE + Math.min(d.shared, 5)));

  const wireNode = sel =>
    sel
      .attr('r', 6)
      .attr('id', d => (d.ref.children.length ? IDS.parent : IDS.leaf))
      .style('cursor', 'pointer')
      .on('click', (e, d) => nav(d.ref))
      .on('mouseover', (e, d) => fade(d.id, 0.15))
      .on('mouseout', () => fade(null, 1))
      .call(
        KM.d3
          .drag()
          .on('start', (e, d) => {
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (e, d) => {
            sim.alphaTarget(0.25).restart();
            d.fx = e.x;
            d.fy = e.y;
          })
          .on('end', (e, d) => {
            if (!e.active) sim.alphaTarget(0);
            d.fx = d.fy = null;
          }),
      );

  const node = wireNode(view.append('g').selectAll('circle').data(localN).join('circle'));

  const label = view
    .append('g')
    .selectAll('text')
    .data(localN)
    .join('text')
    .attr('id', IDS.label)
    .attr('font-size', 10)
    .attr('pointer-events', 'none')
    .text(d => d.label);

  function fade(id, o) {
    node.style('opacity', d => (id == null || adj.get(id)?.has(d.id) || d.id === id ? 1 : o));
    label.style('opacity', d => (id == null || adj.get(id)?.has(d.id) || d.id === id ? 1 : o));
    link.style('opacity', l => (id == null || l.source.id === id || l.target.id === id ? 1 : o));
  }

  sim.on('tick', () => {
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);
    node.attr('cx', d => d.x).attr('cy', d => d.y);
    label.attr('x', d => d.x + 8).attr('y', d => d.y + 3);
  });

  graphs.mini = { svg, node, label, sim, view, adj, w: W, h: H };
  observeMiniResize();
}

function highlightCurrent(force = false) {
  if (!graphs.mini) return;
  const seg = location.hash.slice(1).split('#').filter(Boolean);
  const pg  = find(seg);
  const id  = pg?._i ?? -1;
  if (id === CURRENT && !force) return;

  const g = graphs.mini;
  g.node
    .attr('id', d => (d.id === id ? IDS.current : d.ref.children.length ? IDS.parent : IDS.leaf))
    .attr('r', d => (d.id === id ? 8 : 6));
  g.label.classed('current', d => d.id === id);

  const cx = g.w / 2;
  const cy = g.h / 2;
  g.node
    .filter(d => d.id === id)
    .each(d => {
      const dx = cx - d.x;
      const dy = cy - d.y;
      g.view.attr('transform', `translate(${dx},${dy})`);
      const k = 0.1;
      d.vx += (cx - d.x) * k;
      d.vy += (cy - d.y) * k;
    });

  g.sim.alphaTarget(0.15).restart();
  setTimeout(() => g.sim.alphaTarget(0), 250);
  CURRENT = id;
}

function observeMiniResize() {
  const elx = $('#mini');
  if (!elx) return;
  rememberObs(
    new ResizeObserver(() => {
      if (!graphs.mini) return;
      updateMiniViewport();
      highlightCurrent(true);
    }),
  ).observe(elx);
}

/* ───────────────────────── ROUTER & RENDER  ─────────────────────────── */
let currentPage = null;

async function render(page, anchor) {
  clearLiveObservers();
  const { parse } = await KM.ensureMarkdown();

  const contentEl = $('#content');
  contentEl.innerHTML = parse(page.content, { headerIds: false });

  $$('#content img').forEach(img => {
    img.loading = 'lazy';
    img.decoding = 'async';
    if (!img.hasAttribute('fetchpriority')) img.setAttribute('fetchpriority', 'high');
  });

  fixFootnoteLinks(page);
  numberHeadings(contentEl);

  if (DOC.querySelector('#content pre code')) {
    await KM.ensureHLJSTheme();
    await KM.ensureHighlight();
    window.hljs.highlightAll();
  }

  if (/(\$[^$]+\$|\\\(|\\\[)/.test(page.content)) {
    await KM.ensureKatex();
    window.renderMathInElement(contentEl, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
    });
  }

  buildToc(page);
  decorateHeadings(page);
  decorateCodeBlocks();
  prevNext(page);
  seeAlso(page);

  const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (anchor) DOC.getElementById(anchor)?.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth' });
}

/** Close sidebar & util panels (mobile). */
function closePanels() {
  $('#sidebar')?.classList.remove('open');
  $('#util')?.classList.remove('open');
}

function route() {
  closePanels();
  const seg   = location.hash.slice(1).split('#').filter(Boolean);
  const page  = find(seg);
  const base  = hashOf(page);
  const anchor = seg.slice(base ? base.split('#').length : 0).join('#');

  if (currentPage !== page) {
    currentPage = page;
    DOC.documentElement.scrollTop = 0;
    DOC.body.scrollTop            = 0;
    breadcrumb(page);
    render(page, anchor);
    highlightCurrent(true);
    highlightSidebar(page);
  } else if (anchor) {
    const target = DOC.getElementById(anchor);
    if (target) {
      const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      target.scrollIntoView({ behavior });
    }
  }
}

/* ──────────────────────── GLOBAL UI & THEME  ────────────────────────── */
function initUI() {
  $('#wiki-title-text').textContent = TITLE;
  document.title = TITLE;
  buildTree();

  /* Theme */
  (function themeInit() {
    const btn   = $('#theme-toggle');
    const root  = DOC.documentElement;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const stored = localStorage.getItem('km-theme'); // 'dark' | 'light' | null
    const cfg    = DEFAULT_THEME === 'dark' || DEFAULT_THEME === 'light' ? DEFAULT_THEME : null;
    let dark     = stored ? stored === 'dark' : cfg ? cfg === 'dark' : media.matches;

    if (ACCENT) root.style.setProperty('--color-accent', ACCENT);
    const metaTheme = $('meta[name="theme-color"]');

    apply(dark);
    btn.onclick = () => {
      dark = !dark;
      apply(dark);
      localStorage.setItem('km-theme', dark ? 'dark' : 'light');
    };

    function apply(isDark) {
      root.style.setProperty('--color-main', isDark ? 'rgb(29,29,29)' : 'white');
      root.setAttribute('data-theme', isDark ? 'dark' : 'light');
      metaTheme?.setAttribute('content', isDark ? '#1d1d1d' : '#ffffff');
      KM.ensureHLJSTheme();
    }
  })();

  route();

  /* Build graph lazily */
  rememberObs(
    new IntersectionObserver((entries, obs) => {
      if (entries[0].isIntersecting) {
        buildGraph();
        obs.disconnect();
      }
    }),
  ).observe($('#mini'));

  /* Mini full-screen toggle */
  $('#expand').onclick = () => {
    const mini = $('#mini');
    mini.classList.toggle('fullscreen');
    updateMiniViewport();
    requestAnimationFrame(() => highlightCurrent(true));
    const running = !mini.classList.contains('fullscreen') || $('#util')?.classList.contains('open');
    graphs.mini?.sim.alphaTarget(running ? 0.15 : 0);
  };

  /* Search */
  const searchInput  = $('#search');
  const searchClear  = $('#search-clear');
  let debounce = 0;
  searchInput.oninput = e => {
    clearTimeout(debounce);
    const val = e.target.value;
    searchClear.style.display = val ? '' : 'none';
    debounce = setTimeout(() => search(val), 150);
  };
  searchClear.onclick = () => {
    searchInput.value = '';
    searchClear.style.display = 'none';
    search('');
    searchInput.focus();
  };

  /* Responsive panel toggles */
  const togglePanel = sel => {
    const elx = $(sel);
    const wasOpen = elx.classList.contains('open');
    closePanels();
    if (!wasOpen) {
      elx.classList.add('open');
      if (!elx.querySelector('.panel-close')) {
        elx.append(el('button', { class: 'panel-close', textContent: '✕', onclick: closePanels }));
      }
    }
  };
  $('#burger-sidebar').onclick = () => togglePanel('#sidebar');
  $('#burger-util').onclick    = () => togglePanel('#util');

  addEventListener('resize', () => {
    if (matchMedia('(min-width:1001px)').matches) closePanels();
    if ($('#mini')?.classList.contains('fullscreen')) {
      updateMiniViewport();
      highlightCurrent(true);
    }
  }, { passive: true });

  /* Sidebar tree interactions */
  $('#tree').addEventListener(
    'click',
    e => {
      const caret = e.target.closest('button.caret');
      if (caret) {
        const li  = caret.closest('li.folder');
        const sub = li.querySelector('ul');
        const open = !li.classList.contains('open');
        li.classList.toggle('open', open);
        caret.setAttribute('aria-expanded', String(open));
        if (sub) sub.style.display = open ? 'block' : 'none';
        return;
      }
      if (e.target.closest('a')) closePanels();
    },
    { passive: true },
  );

  $('#results').addEventListener('click', e => {
    if (e.target.closest('a')) closePanels();
  });

  addEventListener('hashchange', route, { passive: true });

  whenIdle(() => KM.ensureHighlight());
}

/* ─────────────────────────────── BOOT  ───────────────────────────────── */
(async () => {
  try {
    if (!MD) throw new Error('CONFIG.MD is empty.');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort('fetch-timeout'), 20000);
    const r = await fetch(MD, { cache: 'reload', signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`Failed to fetch MD (${r.status})`);
    const txt = await r.text();

    parseMarkdownBundle(txt);
    attachSecondaryHomes();
    computeHashes();

    await domReady();
    initUI();

    /* Initial graph highlight */
    await new Promise(res => requestAnimationFrame(res));
    highlightCurrent(true);
  } catch (err) {
    console.warn('Markdown load failed:', err);
    $('#content').innerHTML = `<h1>Content failed to load</h1>
                               <p>Could not fetch or parse the Markdown bundle. Check <code>window.CONFIG.MD</code> and network access.</p>
                               <pre>${String(err?.message || err)}</pre>`;
  }
})();
