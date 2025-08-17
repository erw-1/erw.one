/* eslint-env browser, es2022 */
/* km — Static No-Build Wiki runtime (ESM) • Two files only, libs via CDN */

'use strict';

// Public micro-namespace to expose a couple utilities for integrations.
window.KM = window.KM || {};

/* ─────────────────────────────── DOM helpers ───────────────────────────── */
const DOC = document;
const $   = (sel, c = DOC) => c.querySelector(sel);
const $$  = (sel, c = DOC) => [...c.querySelectorAll(sel)];
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
Object.assign(KM, { $, $$, DEBUG: false });

const CFG = window.CONFIG || {};
const { TITLE = 'Wiki', MD = '', LANGS = [], DEFAULT_THEME, ACCENT } = CFG;

const whenIdle = (cb, timeout = 1500) =>
  'requestIdleCallback' in window ? requestIdleCallback(cb, { timeout }) : setTimeout(cb, 1);

const domReady = () =>
  DOC.readyState !== 'loading'
    ? Promise.resolve()
    : new Promise(res => DOC.addEventListener('DOMContentLoaded', res, { once: true }));

/* ───────────────────────────── data model ──────────────────────────────── */
const pages = [];
const byId  = new Map();
let root    = null;
const descMemo = new Map();

/** Parse a Markdown bundle split by HTML comments; headers carry key:"value". */
function parseMarkdownBundle(txt) {
  const m = txt.matchAll(/<!--([\s\S]*?)-->\s*([\s\S]*?)(?=<!--|$)/g);
  for (const [, hdr, body] of m) {
    const meta = {};
    hdr.replace(/(\w+):"([^"]+)"/g, (_, k, v) => (meta[k] = v.trim()));
    pages.push({ ...meta, content: body.trim(), children: [] });
  }
  if (!pages.length) throw new Error('No pages parsed from MD bundle.');

  pages.forEach(p => byId.set(p.id, p));
  root = byId.get('home') || pages[0];

  // Link parent/children (top-level pages will get attached to root)
  pages.forEach(p => {
    if (p === root) return;
    const par = byId.get((p.parent || '').trim());
    p.parent = par || null;
    par && par.children.push(p);
  });

  // Tags + fast search blob
  pages.forEach(p => {
    p.tagsSet   = new Set((p.tags || '').split(',').map(s => s.trim()).filter(Boolean));
    p.searchStr = (p.title + ' ' + [...p.tagsSet].join(' ') + ' ' + p.content).toLowerCase();
  });

  // Section index (fence-aware) for deep search results
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

/** Descendants count with memoization (used for graph weighting & clustering). */
function descendants(page) {
  if (descMemo.has(page)) return descMemo.get(page);
  let n = 0; (function rec(x){ x.children.forEach(c => { n++; rec(c); }); })(page);
  descMemo.set(page, n);
  return n;
}

/** Lift one representative node from non-root clusters directly under root. */
function attachSecondaryHomes() {
  const topOf = p => { while (p.parent) p = p.parent; return p; };
  const clusters = new Map();

  for (const p of pages) {
    const top = topOf(p);
    if (top === root) continue;
    (clusters.get(top) || clusters.set(top, []).get(top)).push(p);
  }

  let cid = 0;
  for (const [top, members] of clusters) {
    const rep = members.reduce((a,b)=> descendants(b) > descendants(a) ? b : a, top);
    if (!rep.parent) { // only lift if not already attached under root
      rep.parent = root;
      rep.isSecondary = true;
      rep.clusterId = cid++;
      root.children.push(rep);
    }
  }
}

/** Pre-compute hash paths (id chains) for all pages. */
function computeHashes() {
  pages.forEach(p => {
    const segs = [];
    for (let n = p; n && n.parent; n = n.parent) segs.unshift(n.id);
    p.hash = segs.join('#'); // '' for root
  });
}

const hashOf = page => page?.hash ?? '';
const find = segs => {
  let n = root;
  for (const id of segs) {
    const c = n.children.find(k => k.id === id);
    if (!c) break;
    n = c;
  }
  return n;
};
function nav(page) { location.hash = '#' + hashOf(page); }
KM.nav = nav;

/* ───────────────────────────── asset loaders ───────────────────────────── */
const ensureOnce = fn => {
  let p; return () => (p ||= fn());
};

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
    const loads = LANGS.map(async lang => {
      try {
        const mod = await import(`https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/es/languages/${lang}/+esm`);
        hljs.registerLanguage(lang, mod.default);
      } catch (_) { /* ignore unknown language; continue */ }
    });
    await Promise.allSettled(loads);
  }
  window.hljs = hljs;
});

KM.ensureHLJSTheme = (() => {
  const THEME = {
    light: 'https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github.min.css',
    dark : 'https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github-dark.min.css',
  };
  let wired = false;
  const mode = () => DOC.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

  function linkEl() {
    let l = DOC.querySelector('link[data-hljs-theme]');
    if (!l) {
      l = DOC.createElement('link');
      l.rel = 'stylesheet';
      l.setAttribute('data-hljs-theme','');
      DOC.head.appendChild(l);
    }
    return l;
  }
  const apply = () => new Promise(res => {
    const href = THEME[mode()], l = linkEl();
    if (l.getAttribute('href') === href) return res();
    l.onload = l.onerror = res; l.setAttribute('href', href);
  });

  return ensureOnce(() => {
    if (!wired) {
      wired = true;
      new MutationObserver(apply).observe(DOC.documentElement, { attributes:true, attributeFilter:['data-theme'] });
    }
    return apply();
  });
})();

let mdReady = null;
KM.ensureMarkdown = () => {
  if (mdReady) return mdReady;
  mdReady = Promise.all([
    import('https://cdn.jsdelivr.net/npm/marked@16.1.2/+esm'),
    import('https://cdn.jsdelivr.net/npm/marked-alert@2.1.2/+esm'),
    import('https://cdn.jsdelivr.net/npm/marked-footnote@1.4.0/+esm'),
  ]).then(([marked, footnoteMod, alertMod]) => {
    const md = new marked.Marked().use(footnoteMod.default()).use(alertMod.default());
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
  window.katex = katex; window.renderMathInElement = auto.default;
});

/* ───────────────────────── UI decorations & utils ──────────────────────── */
async function copyText(txt, node) {
  try {
    await navigator.clipboard.writeText(txt);
    node?.classList.add('flash');
    setTimeout(() => node?.classList.remove('flash'), 300);
  } catch (e) {
    if (KM.DEBUG) console.warn('Clipboard API unavailable', e);
  }
}

function numberHeadings(elm) {
  const counters = [0,0,0,0,0,0];
  $$('h1,h2,h3,h4,h5', elm).forEach(h => {
    const level = +h.tagName[1] - 1;
    counters[level]++; for (let i = level + 1; i < 6; i++) counters[i] = 0;
    h.id = counters.slice(0, level+1).filter(Boolean).join('_');
  });
}

function buildToc(page) {
  const nav = $('#toc'); if (!nav) return;
  nav.innerHTML = '';
  const heads = $$('#content h1,#content h2,#content h3');
  if (!heads.length) return;

  const base = hashOf(page);
  const ulEl = el('ul');
  for (const h of heads) {
    const li = el('li', { dataset:{ level: h.tagName[1], hid: h.id } }, [
      el('a', { href: '#' + (base ? base + '#' : '') + h.id, textContent: h.textContent })
    ]);
    ulEl.append(li);
  }
  nav.append(ulEl);

  // Highlight current heading as it intersects the viewport.
  let tocObserver = new IntersectionObserver(entries => {
    for (const en of entries) {
      const a = $(`#toc li[data-hid="${en.target.id}"] > a`);
      if (!a) continue;
      if (en.isIntersecting) {
        $('#toc .toc-current')?.classList.remove('toc-current');
        a.classList.add('toc-current');
      }
    }
  }, { rootMargin:'0px 0px -70% 0px', threshold:0 });
  heads.forEach(h => tocObserver.observe(h));
}

function prevNext(page) {
  $('#prev-next')?.remove();
  if (!page.parent) return;
  const sib = page.parent.children; if (sib.length < 2) return;
  const i = sib.indexOf(page);
  const wrap = el('div', { id:'prev-next' });
  if (i > 0) wrap.append(el('a', { href:'#'+hashOf(sib[i-1]), textContent:'← '+sib[i-1].title }));
  if (i < sib.length-1) wrap.append(el('a', { href:'#'+hashOf(sib[i+1]), textContent:sib[i+1].title+' →' }));
  $('#content').append(wrap);
}

function seeAlso(page) {
  $('#see-also')?.remove();
  if (!page.tagsSet?.size) return;
  const related = pages
    .filter(p => p !== page)
    .map(p => ({ p, shared: [...p.tagsSet].filter(t => page.tagsSet.has(t)).length }))
    .filter(r => r.shared > 0)
    .sort((a,b)=> b.shared - a.shared || a.p.title.localeCompare(b.p.title));
  if (!related.length) return;

  const wrap = el('div', { id:'see-also' }, [ el('h2', { textContent:'See also' }), el('ul') ]);
  const ulEl = wrap.querySelector('ul');
  related.forEach(({p}) => ulEl.append(el('li', {}, [el('a', { href:'#'+hashOf(p), textContent:p.title })])));
  const content = $('#content'); const pn = $('#prev-next'); content.insertBefore(wrap, pn ?? null);
}

function fixFootnoteLinks(page) {
  const base = hashOf(page); if (!base) return;
  $$('#content a[href^="#"]').forEach(a => {
    const href = a.getAttribute('href');
    if (/^#(?:fn|footnote)/.test(href) && !href.includes(base + '#')) a.setAttribute('href', `#${base}${href}`);
  });
}

const ICONS = {
  link : 'M3.9 12c0-1.7 1.4-3.1 3.1-3.1h5.4v-2H7c-2.8 0-5 2.2-5 5s2.2 5 5 5h5.4v-2H7c-1.7 0-3.1-1.4-3.1-3.1zm5.4 1h6.4v-2H9.3v2zm9.7-8h-5.4v2H19c1.7 0 3.1 1.4 3.1 3.1s-1.4 3.1-3.1 3.1h-5.4v2H19c2.8 0 5-2.2 5-5s-2.2-5-5-5z',
  code : 'M19,21H5c-1.1,0-2-0.9-2-2V7h2v12h14V21z M21,3H9C7.9,3,7,3.9,7,5v12 c0,1.1,0.9,2,2,2h12c1.1,0,2-0.9,2-2V5C23,3.9,22.1,3,21,3z M21,17H9V5h12V17z',
};

const iconBtn = (title, path, cls, onClick) =>
  el('button', { class: cls, title, onclick:onClick, innerHTML:
    `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${path}"></path></svg>` });

function decorateHeadings(page) {
  const base = hashOf(page);
  $$('#content h1,h2,h3,h4,h5').forEach(h => {
    const url = `${location.origin}${location.pathname}#${base ? base + '#' : ''}${h.id}`;
    const btn = h.querySelector('button.heading-copy') ||
      h.appendChild(iconBtn('Copy direct link', ICONS.link, 'heading-copy', e => {
        e.stopPropagation(); copyText(url, h.querySelector('button.heading-copy'));
      }));
    h.style.cursor = 'pointer';
    h.onclick = () => copyText(url, btn);
  });
}

function decorateCodeBlocks() {
  $$('#content pre').forEach(pre => {
    if (pre.querySelector('button.code-copy')) return;
    pre.append(iconBtn('Copy code', ICONS.code, 'code-copy', () => copyText(pre.innerText, pre.querySelector('button.code-copy'))));
  });
}

/* ─────────────────────────── sidebar / search ──────────────────────────── */
let sidebarCurrent = null;

function buildTree() {
  const ul = $('#tree'); if (!ul) return;
  ul.innerHTML = '';
  const prim = root.children.filter(c => !c.isSecondary).sort((a,b)=>a.title.localeCompare(b.title));
  const secs = root.children.filter(c =>  c.isSecondary).sort((a,b)=>a.clusterId-b.clusterId);

  const rec = (nodes, container, depth=0) => {
    nodes.forEach(p => {
      const li = el('li');
      if (p.children.length) {
        const open = depth < 2;
        li.className = 'folder' + (open ? ' open' : '');
        const caret = el('button', { class:'caret', 'aria-expanded': String(open) });
        const lbl   = el('a', { class:'lbl', dataset:{ page:p.id }, href:'#'+hashOf(p), textContent:p.title });
        const sub   = el('ul', { style:`display:${open?'block':'none'}` });
        li.append(caret, lbl, sub); container.append(li);
        rec(p.children.sort((a,b)=>a.title.localeCompare(b.title)), sub, depth+1);
      } else {
        li.className = 'article';
        li.append(el('a', { dataset:{ page:p.id }, href:'#'+hashOf(p), textContent:p.title }));
        container.append(li);
      }
    });
  };

  rec(prim, ul);
  secs.forEach(r => { ul.append(el('li', { class:'group-sep', innerHTML:'<hr>' })); rec([r], ul); });
}

function highlightSidebar(page) {
  sidebarCurrent?.classList.remove('sidebar-current');
  sidebarCurrent = $(`#tree a[data-page="${page.id}"]`);
  sidebarCurrent?.classList.add('sidebar-current');
}

function search(q) {
  const resUL = $('#results'), treeUL = $('#tree');
  if (!resUL || !treeUL) return;

  if (!q.trim()) { resUL.style.display='none'; resUL.innerHTML=''; treeUL.style.display=''; return; }
  const tokens = q.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
  resUL.innerHTML=''; resUL.style.display=''; treeUL.style.display='none';

  const frag = DOC.createDocumentFragment();

  pages.filter(p => tokens.every(tok => p.searchStr.includes(tok))).forEach(p => {
    const li = el('li', { class:'page-result' }, [
      el('a', { href:'#'+hashOf(p), textContent:p.title })
    ]);
    const matches = p.sections.filter(sec => tokens.every(tok => sec.search.includes(tok)));
    if (matches.length) {
      const base = hashOf(p);
      const sub = el('ul', { class:'sub-results' });
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
function breadcrumb(page) {
  const dyn = $('#crumb-dyn'); if (!dyn) return;
  dyn.innerHTML = '';
  const chain = []; for (let n = page; n; n = n.parent) chain.unshift(n); chain.shift(); // drop root

  chain.forEach(n => {
    dyn.insertAdjacentHTML('beforeend', '<span class="separator">▸</span>');
    const wrap = el('span', { class:'dropdown' });
    const a = el('a', { textContent:n.title, href:'#'+hashOf(n) });
    if (n === page) a.className = 'crumb-current';
    wrap.append(a);

    const siblings = n.parent.children.filter(s => s !== n);
    if (siblings.length) {
      const ul = el('ul');
      siblings.forEach(s => ul.append(el('li', { textContent:s.title, onclick: () => nav(s) })));
      wrap.append(ul);
    }
    dyn.append(wrap);
  });

  if (page.children.length) {
    const box = el('span', { class:'childbox' }, [ el('span', { class:'toggle', textContent:'▾' }), el('ul') ]);
    const ul = box.querySelector('ul');
    page.children.sort((a,b)=>a.title.localeCompare(b.title)).forEach(ch =>
      ul.append(el('li', { textContent:ch.title, onclick: () => nav(ch) })));
    dyn.append(box);
  }
}

/* ───────────────────────────── mini graph (D3) ─────────────────────────── */
const IDS = { current:'node_current', parent:'node_parent', leaf:'node_leaf', hierPRE:'link_hier', tagPRE:'link_tag', label:'graph_text' };
const graphs = {}; let CURRENT = -1;

function getMiniSize() {
  const svg = $('#mini');
  if (!svg) return { w: 400, h: 300 };
  if (svg.classList.contains('fullscreen')) return { w: innerWidth, h: innerHeight };
  const r = svg.getBoundingClientRect();
  return { w: Math.max(1, r.width|0), h: Math.max(1, r.height|0) };
}

function updateMiniViewport() {
  if (!graphs.mini) return;
  const { svg, sim } = graphs.mini;
  const { w, h } = getMiniSize();
  graphs.mini.w = w; graphs.mini.h = h;

  svg.attr('viewBox', `0 0 ${w} ${h}`)
     .attr('width',  w)
     .attr('height', h)
     .attr('preserveAspectRatio', 'xMidYMid meet');

  sim.force('center', KM.d3.forceCenter(w/2, h/2));
  sim.alpha(0.2).restart();
}

function buildGraphData() {
  const N=[], L=[], A=new Map(); const hierPairs = new Set();
  const touch = (a,b) => { (A.get(a)||A.set(a,new Set()).get(a)).add(b); (A.get(b)||A.set(b,new Set()).get(b)).add(a); };
  const overlap = (Aset,Bset) => { let n=0; for (const x of Aset) if (Bset.has(x)) n++; return n; };
  const tierOf = n => n<3?1 : n<6?2 : n<11?3 : n<21?4 : 5;

  pages.forEach((p,i) => { p._i = i; N.push({ id:i, label:p.title, ref:p }); });

  pages.forEach(p => {
    if (!p.parent) return;
    if (p.isSecondary && p.parent === root) return;
    const a = p._i, b = p.parent._i, key = a<b?`${a}|${b}`:`${b}|${a}`;
    L.push({ source:a, target:b, shared:0, kind:'hier', tier: tierOf(descendants(p)) });
    hierPairs.add(key); touch(a,b);
  });

  for (let i=0; i<pages.length; i++) {
    const a = pages[i];
    for (let j=i+1; j<pages.length; j++) {
      const b = pages[j], n = overlap(a.tagsSet, b.tagsSet); if (!n) continue;
      const key = i<j?`${i}|${j}`:`${j}|${i}`; if (hierPairs.has(key)) continue;
      L.push({ source:i, target:j, shared:n, kind:'tag' }); touch(i,j);
    }
  }
  return { nodes:N, links:L, adj:A };
}

async function buildGraph() {
  await KM.ensureD3();
  if (graphs.mini) return;

  const { nodes, links, adj } = buildGraphData();
  const svg = KM.d3.select('#mini');
  const { w: W, h: H } = getMiniSize();
  svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('preserveAspectRatio', 'xMidYMid meet');

  const localN = nodes.map(n => ({...n}));
  const localL = links.map(l => ({...l}));

  const sim = KM.d3.forceSimulation(localN)
    .force('link',   KM.d3.forceLink(localL).id(d=>d.id).distance(80))
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

  // Larger, invisible hitboxes to improve pointer ergonomics.
  const hit = wireNode(
    view.append('g').attr('class','hitboxes').selectAll('circle')
      .data(localN).join('circle')
      .attr('r', 14)
      .attr('fill', 'transparent')
      .style('pointer-events', 'all')
  );

  const label = view.append('g').selectAll('text')
    .data(localN).join('text')
    .attr('id', IDS.label).attr('font-size', 10)
    .attr('pointer-events','none')
    .text(d => d.label);

  function fade(id, o) {
    node .style('opacity', d => (id==null || adj.get(id)?.has(d.id) || d.id===id) ? 1 : o);
    label.style('opacity', d => (id==null || adj.get(id)?.has(d.id) || d.id===id) ? 1 : o);
    link .style('opacity', l => id==null || l.source.id===id || l.target.id===id ? 1 : o);
  }

  sim.on('tick', () => {
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node .attr('cx', d => d.x).attr('cy', d => d.y);
    hit  .attr('cx', d => d.x).attr('cy', d => d.y);
    label.attr('x', d => d.x + 8).attr('y', d => d.y + 3);
  });

  graphs.mini = { svg, node, hit, label, sim, view, adj, w:W, h:H };
  observeMiniResize();
}

function highlightCurrent(force=false) {
  if (!graphs.mini) return;
  const seg = location.hash.slice(1).split('#').filter(Boolean);
  const pg = find(seg); const id = pg?._i ?? -1;
  if (id === CURRENT && !force) return;

  const g = graphs.mini;
  g.node
    .attr('id', d => d.id===id ? IDS.current : (d.ref.children.length ? IDS.parent : IDS.leaf))
    .attr('r',  d => d.id===id ? 8 : 6);
  g.label.classed('current', d => d.id === id);

  // Smoothly pan the 'view' group to center the current node and give it a gentle nudge.
  const cx = g.w/2, cy = g.h/2;
  g.node.filter(d => d.id===id).each(d => {
    const dx = cx - d.x, dy = cy - d.y;
    g.view.attr('transform', `translate(${dx},${dy})`);
    const k = 0.10; d.vx += (cx - d.x)*k; d.vy += (cy - d.y)*k;
  });

  g.sim.alphaTarget(0.15).restart();
  setTimeout(()=>g.sim.alphaTarget(0), 250);
  CURRENT = id;
}

function observeMiniResize() {
  const elx = $('#mini'); if (!elx) return;
  new ResizeObserver(() => {
    if (!graphs.mini) return;
    updateMiniViewport();
    highlightCurrent(true);
  }).observe(elx);
}

/* ───────────────────────── renderer + router + init ────────────────────── */
async function render(page, anchor) {
  const { parse } = await KM.ensureMarkdown();
  $('#content').innerHTML = parse(page.content, { headerIds:false });

  // Light image hints for faster layouts.
  $$('#content img').forEach(img => {
    img.loading='lazy'; img.decoding='async'; if (!img.hasAttribute('fetchpriority')) img.setAttribute('fetchpriority','high');
  });

  fixFootnoteLinks(page);
  numberHeadings($('#content'));

  // Syntax highlighting (theme CSS must match page theme first).
  if (DOC.querySelector('#content pre code')) {
    await KM.ensureHLJSTheme();
    await KM.ensureHighlight();
    window.hljs.highlightAll();
  }

  // Inline math blocks
  if (/(\$[^$]+\$|\\\(|\\\[)/.test(page.content)) {
    await KM.ensureKatex();
    window.renderMathInElement($('#content'), {
      delimiters: [
        { left:'$$', right:'$$', display:true },
        { left:'\\[', right:'\\]', display:true },
        { left:'$', right:'$', display:false },
        { left:'\\(', right:'\\)', display:false }
      ],
      throwOnError:false
    });
  }

  buildToc(page);
  decorateHeadings(page);
  decorateCodeBlocks();
  prevNext(page);
  seeAlso(page);

  if (anchor) DOC.getElementById(anchor)?.scrollIntoView({ behavior:'smooth' });
}

let currentPage = null;

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

    breadcrumb(page);
    render(page, anchor);
    highlightCurrent(true);
    highlightSidebar(page);
  } else if (anchor) {
    const target = DOC.getElementById(anchor);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
      const a = $(`#toc li[data-hid="${anchor}"] > a`);
      if (a) { $('#toc .toc-current')?.classList.remove('toc-current'); a.classList.add('toc-current'); }
    }
  }
}

/* ─────────────────────────── global UI + theme ─────────────────────────── */
function closePanels() {
  $('#sidebar')?.classList.remove('open');
  $('#util')?.classList.remove('open');
}

function initUI() {
  // Title
  $('#wiki-title-text').textContent = TITLE; document.title = TITLE;

  // Sidebar + first route
  buildTree();

  // Theme: persisted → config default → OS; single accent injection if provided.
  (function themeInit() {
    const btn = $('#theme-toggle');
    const rootEl = DOC.documentElement;
    const media = matchMedia('(prefers-color-scheme: dark)');

    const stored = localStorage.getItem('km-theme'); // 'dark' | 'light' | null
    const cfg = (DEFAULT_THEME === 'dark' || DEFAULT_THEME === 'light') ? DEFAULT_THEME : null;
    let dark = stored ? (stored === 'dark') : (cfg ? cfg === 'dark' : media.matches);

    if (typeof ACCENT === 'string' && ACCENT) rootEl.style.setProperty('--color-accent', ACCENT);

    apply(dark);
    btn.onclick = () => { dark = !dark; apply(dark); localStorage.setItem('km-theme', dark ? 'dark' : 'light'); };

    function apply(isDark) {
      rootEl.style.setProperty('--color-main', isDark ? 'rgb(29,29,29)' : 'white');
      rootEl.setAttribute('data-theme', isDark ? 'dark' : 'light');
    }
  })();

  route(); // initial render after theme applied

  // Mini-graph lazy init
  new IntersectionObserver((entries, obs) => {
    if (entries[0].isIntersecting) { buildGraph(); obs.disconnect(); }
  }).observe($('#mini'));

  // Fullscreen toggle for mini graph
  const mini = $('#mini');
  $('#expand').onclick = () => {
    mini.classList.toggle('fullscreen');
    updateMiniViewport();
    requestAnimationFrame(() => highlightCurrent(true));
  };

  // Search input (debounced) + clear
  const searchInput = $('#search'), searchClear = $('#search-clear'); let debounce = 0;
  searchInput.oninput = e => {
    clearTimeout(debounce);
    const val = e.target.value; searchClear.style.display = val ? '' : 'none';
    debounce = setTimeout(() => search(val.toLowerCase()), 150);
  };
  searchClear.onclick = () => { searchInput.value=''; searchClear.style.display='none'; search(''); searchInput.focus(); };

  // Burger toggles (mobile)
  const togglePanel = sel => {
    const elx = $(sel); const wasOpen = elx.classList.contains('open');
    closePanels(); if (!wasOpen) {
      elx.classList.add('open');
      if (!elx.querySelector('.panel-close')) {
        elx.append(el('button', { class:'panel-close', textContent:'✕', onclick: closePanels }));
      }
    }
  };
  $('#burger-sidebar').onclick = () => togglePanel('#sidebar');
  $('#burger-util').onclick    = () => togglePanel('#util');

  // Auto-close panels on desktop resize + keep fullscreen graph exact
  addEventListener('resize', () => {
    if (matchMedia('(min-width:1001px)').matches) { $('#sidebar').classList.remove('open'); $('#util').classList.remove('open'); }
    if ($('#mini')?.classList.contains('fullscreen')) { updateMiniViewport(); highlightCurrent(true); }
  }, { passive: true });

  // Event delegation: sidebar caret + links
  $('#tree').addEventListener('click', e => {
    const caret = e.target.closest('button.caret');
    if (caret) {
      const li = caret.closest('li.folder');
      const sub = li.querySelector('ul');
      const open = !li.classList.contains('open');
      li.classList.toggle('open', open);
      caret.setAttribute('aria-expanded', String(open));
      if (sub) sub.style.display = open ? 'block' : 'none';
      return;
    }
    if (e.target.closest('a')) closePanels();
  });

  // Close panels when selecting search results
  $('#results').addEventListener('click', e => {
    if (e.target.closest('a')) closePanels();
  });

  // In-app routing
  addEventListener('hashchange', route, { passive: true });

  // Warm caches during idle
  whenIdle(async () => { await KM.ensureHighlight(); });
}

/* ──────────────────────────────── boot ─────────────────────────────────── */
(async () => {
  try {
    if (!MD) throw new Error('CONFIG.MD is empty.');

    // Begin fetch ASAP; add a conservative timeout to avoid hanging UIs.
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

    // Ensure first graph highlighting after initial layout stabilizes
    await new Promise(res => setTimeout(res, 120));
    highlightCurrent(true);
  } catch (err) {
    console.warn('Markdown load failed:', err);
    const elc = $('#content');
    if (elc) {
      elc.innerHTML = `
        <h1>Content failed to load</h1>
        <p>Could not fetch or parse the Markdown bundle. Check <code>window.CONFIG.MD</code> and network access.</p>
        <pre>${String(err?.message || err)}</pre>`;
    }
  }
})();
