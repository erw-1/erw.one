/* *********************************************************************
   📚 MONOLITH – REFACTORED FOR READABILITY & SPEED
   Order:
   1) Config & globals
   2) Markdown → Data-model (fetch starts immediately)
   3) Generic helpers: idle/clipboard/DOM + URL + Lazy-loaders (D3, HLJS+theme,
      Markdown, KaTeX) + small UI helpers
   4) DOM builders: Sidebar, Search, Breadcrumb, Mini-graph
   5) Clean listeners + Router + Renderer + Boot pipeline

   Applied improvements: 
   (1) One-pass headings (IDs + copy + ToC), 
   (3) Abort-safe renderer, 
   (4) On-demand HLJS language loading, 
   (5) LRU cache for parsed HTML, 
   (6) DocumentFragments in heavy DOM builders, 
   (7) Robust hash parsing, 
   (8) Resilient Markdown fetch (timeout + error UI)
************************************************************************ */

/* =====================================================================
   1) CONFIG & GLOBALS
====================================================================== */
window.KM = {};                                      // micro-namespace
const $  = (s, c=document) => c.querySelector(s);    // tiny DOM helpers
const $$ = (s, c=document) => [...c.querySelectorAll(s)];
Object.assign(KM, { $, $$ });

const { TITLE, MD } = window.CONFIG || { TITLE:'Wiki', MD:'' }; // resilient defaults


/* =====================================================================
   2) MARKDOWN → DATA-MODEL
====================================================================== */
const pages = [];               // every article
const byId  = new Map();        // id → page
let root    = null;             // set after parsing

function parseMarkdownBundle(txt) {
  // 0) split bundle into individual pages
  for (const [, hdr, body] of txt.matchAll(/<!--([\s\S]*?)-->\s*([\s\S]*?)(?=<!--|$)/g)) {
    const meta = {};
    hdr.replace(/(\w+):"([^"]+)"/g, (_, k, v) => (meta[k] = v.trim()));
    pages.push({ ...meta, content: body.trim(), children: [] });
  }

  // 1) lookups
  pages.forEach(p => byId.set(p.id, p));
  root = byId.get('home') || pages[0];

  // 2) parent / children
  pages.forEach(p => {
    if (p === root) return;
    const par = byId.get((p.parent || '').trim());
    if (par) { p.parent = par; par.children.push(p); }
    else     { p.parent = null; }
  });

  // 3) tag sets + fast search blob
  pages.forEach(p => {
    p.tagsSet   = new Set((p.tags || '').split(',').filter(Boolean));
    p.searchStr = (p.title + ' ' + [...p.tagsSet].join(' ') + ' ' + p.content).toLowerCase();
  });

  // 4) section index (fence-aware)
  pages.forEach(p => {
    const counters = [0,0,0,0,0,0], sections = [];
    let inFence = false, offset = 0, prev = null;

    for (const line of p.content.split(/\r?\n/)) {
      if (/^(?:```|~~~)/.test(line)) inFence = !inFence;

      if (!inFence && /^(#{1,5})\s+/.test(line)) {
        if (prev) { // flush
          prev.body = p.content.slice(prev.bodyStart, offset).trim();
          prev.search = (prev.txt + ' ' + prev.body).toLowerCase();
          sections.push(prev);
        }
        const [, hashes, txt] = line.match(/^(#{1,5})\s+(.+)/);
        const level = hashes.length - 1;
        counters[level]++; for (let i = level + 1; i < 6; i++) counters[i] = 0;
        prev = { id: counters.slice(0, level+1).filter(Boolean).join('_'),
                 txt: txt.trim(),
                 bodyStart: offset + line.length + 1 };
      }
      offset += line.length + 1;
    }
    if (prev) { // last section
      prev.body = p.content.slice(prev.bodyStart).trim();
      prev.search = (prev.txt + ' ' + prev.body).toLowerCase();
      sections.push(prev);
    }
    p.sections = sections;
  });
}

function attachSecondaryHomes() {
  const topOf = p => { while (p.parent) p = p.parent; return p; };
  const clusters = new Map();
  pages.forEach(p => {
    const top = topOf(p);
    if (top === root) return;
    (clusters.get(top) || clusters.set(top, []).get(top)).push(p);
  });

  let cid = 0;
  const descCount = page => {
    let n = 0; (function rec(x){ x.children.forEach(c => { n++; rec(c); }); })(page);
    return n;
  };

  clusters.forEach((members, top) => {
    const rep = members.reduce((a,b)=>descCount(b)>descCount(a)?b:a, top);
    if (!rep.parent) {
      rep.parent = root;
      rep.isSecondary = true;
      rep.clusterId = cid++;
      root.children.push(rep);
    }
  });
}


/* =====================================================================
   3) GENERIC HELPERS
   ─ idle / clipboard / URL helpers
   ─ lazy loaders: D3, Highlight (+theme), Markdown, KaTeX
   ─ tiny UI helpers
====================================================================== */
// idle (rIC fallback)
function whenIdle(cb, timeout = 1500) {
  ('requestIdleCallback' in window)
    ? requestIdleCallback(cb, { timeout })
    : setTimeout(cb, 1);
}

// clipboard
async function copyText(txt, node) {
  try {
    await navigator.clipboard.writeText(txt);
    node?.classList.add('flash');
    setTimeout(() => node?.classList.remove('flash'), 350);
  } catch (e) { console.warn('Clipboard API unavailable', e); }
}

// URL helpers
function hashOf(page) {
  const segs = []; for (let n = page; n && n.parent; n = n.parent) segs.unshift(n.id);
  return segs.join('#');
}
function find(segs) {
  let n = root;
  for (const id of segs) { const c = n.children.find(k => k.id === id); if (!c) break; n = c; }
  return n;
}
function nav(page) { location.hash = '#' + hashOf(page); }
KM.nav = nav;
// robust hash splitting (anchors may contain '#')
function splitHash() { return location.hash.slice(1).split('#').filter(Boolean); }

// ── Lazy-loaders ─────────────────────────────────────────────────────
KM.ensureD3 = (() => {
  let ready;
  return function ensureD3 () {
    if (ready) return ready;
    ready = Promise.all([
      import('https://cdn.jsdelivr.net/npm/d3-selection@3/+esm'),
      import('https://cdn.jsdelivr.net/npm/d3-force@3/+esm'),
      import('https://cdn.jsdelivr.net/npm/d3-drag@3/+esm')
    ]).then(([sel, force, drag]) => {
      KM.d3 = {
        select: sel.select, selectAll: sel.selectAll,
        forceSimulation: force.forceSimulation,
        forceLink: force.forceLink, forceManyBody: force.forceManyBody, forceCenter: force.forceCenter,
        drag: drag.drag
      };
    });
    return ready;
  };
})();

KM.ensureHighlight = (() => {
  let ready;
  return function ensureHighlight() {
    if (ready) return ready;
    ready = (async () => {
      const { LANGS = [] } = window.CONFIG || {};
      const core = await import('https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/es/core/+esm');
      const hljs = core.default;
      await Promise.all(LANGS.map(async lang => {
        const mod = await import(`https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/es/languages/${lang}/+esm`);
        hljs.registerLanguage(lang, mod.default);
      }));
      window.hljs = hljs;
    })();
    return ready;
  };
})();

KM.ensureHLJSTheme = (() => {
  const THEME = {
    light: 'https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github.min.css',
    dark : 'https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github-dark.min.css',
  };
  let ready = null, wired = false;

  function getLink() {
    let l = document.querySelector('link[data-hljs-theme]');
    if (!l) { l = document.createElement('link'); l.rel='stylesheet'; l.setAttribute('data-hljs-theme',''); document.head.appendChild(l); }
    return l;
  }
  function mode() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function apply() {
    const href = THEME[mode()], l = getLink();
    if (l.getAttribute('href') === href) return Promise.resolve();
    return new Promise(res => { l.onload = l.onerror = res; l.setAttribute('href', href); });
  }
  return function ensureHLJSTheme() {
    if (!ready) ready = apply();
    if (!wired) {
      wired = true;
      new MutationObserver(apply).observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] });
    }
    return ready;
  };
})();

let mdReady = null;
KM.ensureMarkdown = () => {
  if (mdReady) return mdReady;
  mdReady = Promise.all([
    import('https://cdn.jsdelivr.net/npm/marked@16.1.2/lib/marked.esm.min.js'),
    import('https://cdn.jsdelivr.net/npm/marked-footnote/+esm'),
    import('https://cdn.jsdelivr.net/npm/marked-alert/+esm'),
  ]).then(([marked, footnoteMod, alertMod]) => {
    const md = new marked.Marked().use(footnoteMod.default()).use(alertMod.default());
    return { parse: (src, opt) => md.parse(src, { ...opt, mangle:false }) };
  });
  return mdReady;
};

KM.ensureKatex = (() => {
  const BASE = 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/';
  let ready;
  return function ensureKatex() {
    if (ready) return ready;
    if (!document.getElementById('katex-css')) {
      const link = Object.assign(document.createElement('link'), { id:'katex-css', rel:'stylesheet', href: BASE + 'katex.min.css' });
      document.head.appendChild(link);
    }
    ready = Promise.all([
      import(BASE + 'katex.min.js/+esm'),
      import(BASE + 'contrib/auto-render.min.js/+esm')
    ]).then(([katex, auto]) => {
      window.katex = katex; window.renderMathInElement = auto.default;
    });
    return ready;
  };
})();

// On-demand HLJS languages
const loadedLangs = new Set((window.CONFIG?.LANGS)||[]);
KM.ensureHLJSLanguage = async (lang) => {
  if (!window.hljs || loadedLangs.has(lang)) return;
  const mod = await import(`https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/es/languages/${lang}/+esm`);
  hljs.registerLanguage(lang, mod.default);
  loadedLangs.add(lang);
};

// Small UI helpers
function closePanels() { $('#sidebar').classList.remove('open'); $('#util').classList.remove('open'); }

function decorateCodeBlocks() {
  $$('#content pre').forEach(pre => {
    const btn = document.createElement('button');
    btn.className = 'code-copy'; btn.title = 'Copy code';
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor"
          d="M19,21H5c-1.1,0-2-0.9-2-2V7h2v12h14V21z M21,3H9C7.9,3,7,3.9,7,5v12
             c0,1.1,0.9,2,2,2h12c1.1,0,2-0.9,2-2V5C23,3.9,22.1,3,21,3z M21,17H9V5h12V17z"/>
      </svg>`;
    btn.onclick = () => copyText(pre.innerText, btn);
    pre.appendChild(btn);
  });
}

// One-pass headings: IDs + copy buttons + ToC + scroll spy
let tocObserver = null;
function indexHeadingsAndBuildToc(page) {
  const content = $('#content');
  const counters = [0,0,0,0,0,0];
  const heads = content.querySelectorAll('h1,h2,h3,h4,h5');
  const nav = $('#toc'); nav.innerHTML = '';

  if (!heads.length) return;

  const ul = document.createElement('ul');
  const frag = document.createDocumentFragment();

  heads.forEach(h => {
    const level = +h.tagName[1] - 1;
    counters[level]++; for (let i=level+1;i<6;i++) counters[i]=0;
    const id = counters.slice(0, level+1).filter(Boolean).join('_');
    h.id = id;

    // copy button
    const btn = document.createElement('button');
    btn.className = 'heading-copy';
    btn.title = 'Copy direct link';
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3.9 12c0-1.7 1.4-3.1 3.1-3.1h5.4v-2H7c-2.8 0-5 2.2-5 5s2.2 5 5 5h5.4v-2H7c-1.7 0-3.1-1.4-3.1-3.1zm5.4 1h6.4v-2H9.3v2zm9.7-8h-5.4v2H19c1.7 0 3.1 1.4 3.1 3.1s-1.4 3.1-3.1 3.1h-5.4v2H19c2.8 0 5-2.2 5-5s-2.2-5-5-5z"/></svg>`;
    const copy = () => copyText(`${location.origin}${location.pathname}#${hashOf(page)}#${id}`, btn);
    h.style.cursor = 'pointer'; h.onclick = copy; btn.onclick = e => { e.stopPropagation(); copy(); };
    h.appendChild(btn);

    // ToC for levels h1..h3
    if (level <= 2) {
      const li = document.createElement('li');
      li.dataset.level = String(level+1);
      li.dataset.hid = id;
      const a = document.createElement('a');
      const base = hashOf(page);
      a.href = '#' + (base ? base + '#' : '') + id;
      a.textContent = h.textContent;
      li.appendChild(a); frag.appendChild(li);
    }
  });

  ul.appendChild(frag);
  nav.appendChild(ul);

  // scroll-spy
  tocObserver?.disconnect();
  tocObserver = new IntersectionObserver(entries => {
    entries.forEach(en => {
      const a = $(`#toc li[data-hid="${en.target.id}"] > a`);
      if (!a) return;
      if (en.isIntersecting) {
        $('#toc').querySelectorAll('.toc-current').forEach(x => x.classList.remove('toc-current'));
        a.classList.add('toc-current');
      }
    });
  }, { rootMargin:'0px 0px -70% 0px', threshold:0 });
  heads.forEach(h => tocObserver.observe(h));
}


/* =====================================================================
   4) DOM BUILDERS
   ─ Sidebar tree + highlight
   ─ Search
   ─ Breadcrumb
   ─ Mini-graph (D3)
====================================================================== */
// Sidebar
let sidebarCurrent = null;
function buildTree() {
  const ul = $('#tree'); ul.innerHTML = '';
  const frag = document.createDocumentFragment();

  const prim = root.children.filter(c => !c.isSecondary).sort((a,b)=>a.title.localeCompare(b.title));
  const secs = root.children.filter(c =>  c.isSecondary).sort((a,b)=>a.clusterId-b.clusterId);

  const rec = (nodes, container, depth=0) => {
    const localFrag = document.createDocumentFragment();
    nodes.forEach(p => {
      const li = document.createElement('li');
      if (p.children.length) {
        const open = depth < 2;
        li.className = 'folder' + (open ? ' open' : '');
        const caret = document.createElement('button'); caret.className='caret'; caret.setAttribute('aria-expanded', String(open));
        const lbl = document.createElement('a'); lbl.className='lbl'; lbl.dataset.page=p.id; lbl.href = '#'+hashOf(p); lbl.textContent = p.title;
        const sub = document.createElement('ul'); sub.style.display = open ? 'block':'none';
        caret.onclick = e => { e.stopPropagation(); const t = li.classList.toggle('open'); caret.setAttribute('aria-expanded', t); sub.style.display = t ? 'block':'none'; };
        li.append(caret, lbl, sub); localFrag.appendChild(li);
        rec(p.children.sort((a,b)=>a.title.localeCompare(b.title)), sub, depth+1);
      } else {
        li.className = 'article';
        const a = document.createElement('a'); a.dataset.page=p.id; a.href = '#'+hashOf(p); a.textContent = p.title;
        li.appendChild(a); localFrag.appendChild(li);
      }
    });
    container.appendChild(localFrag);
  };

  rec(prim, frag);
  secs.forEach(r => {
    const sep = document.createElement('li'); sep.className='group-sep'; sep.innerHTML='<hr>'; frag.appendChild(sep);
    const tmp = document.createElement('ul'); rec([r], tmp);
    frag.append(...tmp.childNodes);
  });

  ul.appendChild(frag);
}
function highlightSidebar(page) {
  sidebarCurrent?.classList.remove('sidebar-current');
  sidebarCurrent = $(`#tree a[data-page="${page.id}"]`);
  sidebarCurrent?.classList.add('sidebar-current');
}

// Search
function search(q) {
  const resUL = $('#results'), treeUL = $('#tree');
  if (!q.trim()) { resUL.style.display='none'; treeUL.style.display=''; return; }
  const tokens = q.split(/\s+/).filter(t => t.length >= 2);
  resUL.innerHTML=''; resUL.style.display=''; treeUL.style.display='none';

  const frag = document.createDocumentFragment();

  pages.filter(p => tokens.every(tok => p.searchStr.includes(tok))).forEach(p => {
    const li = document.createElement('li'); li.className='page-result'; li.textContent=p.title;
    li.onclick = () => { nav(p); closePanels(); }; frag.appendChild(li);

    const subMatches = p.sections.filter(sec => tokens.every(tok => sec.search.includes(tok)));
    if (subMatches.length) {
      const subUL = document.createElement('ul'); subUL.className='sub-results';
      const subFrag = document.createDocumentFragment();
      subMatches.forEach(sec => {
        const subLI = document.createElement('li'); subLI.className='heading-result'; subLI.textContent = sec.txt;
        subLI.onclick = e => { e.stopPropagation(); location.hash = `#${hashOf(p)}#${sec.id}`; closePanels(); };
        subFrag.appendChild(subLI);
      });
      subUL.appendChild(subFrag);
      li.appendChild(subUL);
    }
  });

  resUL.appendChild(frag);
  if (!resUL.children.length) resUL.innerHTML = '<li id="no_result">No result</li>';
}

// Breadcrumb
function breadcrumb(page) {
  const dyn = $('#crumb-dyn'); dyn.innerHTML = '';
  const chain = []; for (let n = page; n; n = n.parent) chain.unshift(n); chain.shift(); // drop root
  chain.forEach(n => {
    dyn.insertAdjacentHTML('beforeend', '<span class="separator">▸</span>');
    const wrap = document.createElement('span'); wrap.className='dropdown';
    const a = document.createElement('a'); a.textContent = n.title; a.href = '#'+hashOf(n); if (n===page) a.className='crumb-current';
    wrap.appendChild(a);

    const siblings = n.parent.children.filter(s => s !== n);
    if (siblings.length) {
      const ul = document.createElement('ul');
      siblings.forEach(s => { const li = document.createElement('li'); li.textContent = s.title; li.onclick = () => nav(s); ul.appendChild(li); });
      wrap.appendChild(ul);
    }
    dyn.appendChild(wrap);
  });

  if (page.children.length) {
    const box = document.createElement('span'); box.className='childbox'; box.innerHTML = '<span class="toggle">▾</span><ul></ul>';
    const ul = box.querySelector('ul');
    page.children.sort((a,b)=>a.title.localeCompare(b.title)).forEach(ch => {
      const li = document.createElement('li'); li.textContent = ch.title; li.onclick = () => nav(ch); ul.appendChild(li);
    });
    dyn.appendChild(box);
  }
}

// Mini-graph (single SVG, can go fullscreen)
const IDS = { current:'node_current', parent:'node_parent', leaf:'node_leaf', hierPRE:'link_hier', tagPRE:'link_tag', label:'graph_text' };
const graphs = {}; let CURRENT = -1;

async function buildGraph() {
  await KM.ensureD3();
  if (graphs.mini) return;

  const { nodes, links, adj } = buildGraphData();
  const svg = KM.d3.select('#mini');
  const box = svg.node().getBoundingClientRect();
  const W = box.width || 400, H = box.height || 300;

  const localN = nodes.map(n => ({...n}));
  const localL = links.map(l => ({...l}));

  const sim = KM.d3.forceSimulation(localN)
    .force('link',   KM.d3.forceLink(localL).id(d=>d.id).distance(80))
    .force('charge', KM.d3.forceManyBody().strength(-240))
    .force('center', KM.d3.forceCenter(W/2, H/2));

  const view = svg.append('g').attr('class','view');

  const link = view.append('g').selectAll('line')
    .data(localL).join('line')
    .attr('id', d => d.kind === 'hier' ? IDS.hierPRE + d.tier : IDS.tagPRE + Math.min(d.shared,5));

  const node = view.append('g').selectAll('circle')
    .data(localN).join('circle')
    .attr('r', 6)
    .attr('id', d => d.ref.children.length ? IDS.parent : IDS.leaf)
    .style('cursor','pointer')
    .on('click', (e,d) => KM.nav(d.ref))
    .on('mouseover', (e,d) => fade(d.id, 0.15))
    .on('mouseout', () => fade(null, 1))
    .call(KM.d3.drag()
      .on('start', (e,d) => { d.fx = d.x; d.fy = d.y; })
      .on('drag',  (e,d) => { sim.alphaTarget(0.3).restart(); d.fx = e.x; d.fy = e.y; })
      .on('end',   (e,d) => { if (!e.active) sim.alphaTarget(0); d.fx = d.fy = null; }));

  const label = view.append('g').selectAll('text')
    .data(localN).join('text')
    .attr('id', IDS.label).attr('font-size', 10)
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
    label.attr('x', d => d.x + 8).attr('y', d => d.y + 3);
  });

  graphs.mini = { node, label, sim, view, adj, w:W, h:H };
  observeMiniResize();
}
function highlightCurrent() {
  if (!graphs.mini) return;
  const seg = splitHash();
  const pg = find(seg); const id = pg?._i ?? -1; if (id === CURRENT) return;

  const g = graphs.mini;
  g.node
    .attr('id', d => d.id===id ? IDS.current : (d.ref.children.length ? IDS.parent : IDS.leaf))
    .attr('r',  d => d.id===id ? 8 : 6);
  g.label.classed('current', d => d.id === id);

  const cx = g.w/2, cy = g.h/2;
  g.node.filter(d => d.id===id).each(d => {
    const dx = cx - d.x, dy = cy - d.y;
    g.view.attr('transform', `translate(${dx},${dy})`);
    const k = 0.35; d.vx += (cx - d.x)*k; d.vy += (cy - d.y)*k;
  });

  g.sim.alphaTarget(0.7).restart(); setTimeout(()=>g.sim.alphaTarget(0), 400);
  CURRENT = id;
}
function observeMiniResize() {
  new ResizeObserver(entries => {
    const g = graphs.mini; if (!g) return;
    const { width:w, height:h } = entries[0].contentRect;
    g.w = w; g.h = h;
    g.sim.force('center', KM.d3.forceCenter(w/2, h/2));
    g.sim.alpha(0.3).restart();
  }).observe(document.getElementById('mini'));
}
function buildGraphData() {
  const N=[], L=[], A=new Map(); const hierPairs = new Set();
  const touch = (a,b) => { (A.get(a)||A.set(a,new Set()).get(a)).add(b); (A.get(b)||A.set(b,new Set()).get(b)).add(a); };
  const overlap = (Aset,Bset) => { let n=0; for (const x of Aset) if (Bset.has(x)) n++; return n; };
  const descCount = p => { let n=0; (function rec(x){ x.children.forEach(c=>{ n++; rec(c); }); })(p); return n; };
  const tierOf = n => n<3?1 : n<6?2 : n<11?3 : n<21?4 : 5;

  pages.forEach((p,i) => { p._i = i; p.tagsSet = p.tagsSet || new Set(p.tags);
    N.push({ id:i, label:p.title, ref:p }); });

  pages.forEach(p => {
    if (!p.parent) return;
    if (p.isSecondary && p.parent === root) return;
    const a = p._i, b = p.parent._i, key = a<b?`${a}|${b}`:`${b}|${a}`;
    L.push({ source:a, target:b, shared:0, kind:'hier', tier: tierOf(descCount(p)) });
    hierPairs.add(key); touch(a,b);
  });

  pages.forEach((a,i) => {
    for (let j=i+1; j<pages.length; j++) {
      const b = pages[j], n = overlap(a.tagsSet, b.tagsSet); if (!n) continue;
      const key = i<j?`${i}|${j}`:`${j}|${i}`; if (hierPairs.has(key)) continue;
      L.push({ source:i, target:j, shared:n, kind:'tag' }); touch(i,j);
    }
  });

  return { nodes:N, links:L, adj:A };
}


/* =====================================================================
   5) CLEAN LISTENERS + ROUTER + RENDERER + BOOT PIPELINE
====================================================================== */
// Render cache (LRU of parsed HTML)
const renderCache = new Map(); // id -> html
const MAX_CACHE = 20;
let renderToken = 0;            // abort-safety for async renders

// Renderer
async function render(page, anchor) {
  const token = ++renderToken;

  // cache hit?
  if (renderCache.has(page.id)) {
    $('#content').innerHTML = renderCache.get(page.id);
  } else {
    const { parse } = await KM.ensureMarkdown();
    if (token !== renderToken) return;
    const html = parse(page.content, { headerIds:false });
    $('#content').innerHTML = html;
    // LRU discipline
    renderCache.set(page.id, html);
    if (renderCache.size > MAX_CACHE) {
      const firstKey = renderCache.keys().next().value;
      renderCache.delete(firstKey);
    }
  }
  if (token !== renderToken) return;

  // images: defer work
  document.querySelectorAll('#content img').forEach(img => {
    img.loading='lazy'; img.decoding='async'; if (!img.hasAttribute('fetchpriority')) img.setAttribute('fetchpriority','low');
  });

  fixFootnoteLinks(page);
  indexHeadingsAndBuildToc(page); // one-pass headings + ToC

  // Syntax highlight (theme + core + missing languages)
  if (document.querySelector('#content pre code')) {
    await KM.ensureHLJSTheme();             if (token !== renderToken) return;
    await KM.ensureHighlight();             if (token !== renderToken) return;
    const langsInPage = new Set(
      [...$('#content').querySelectorAll('pre code[class*="language-"]')]
        .map(n => (n.className.match(/language-([\w+-]+)/)||[])[1])
        .filter(Boolean)
    );
    for (const lang of langsInPage) { await KM.ensureHLJSLanguage(lang); if (token !== renderToken) return; }
    window.hljs.highlightAll();
  }

  // Math typesetting
  if (/(\$[^$]+\$|\\\(|\\\[)/.test(page.content)) {
    await KM.ensureKatex();                 if (token !== renderToken) return;
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

  decorateCodeBlocks();
  prevNext(page);
  seeAlso(page);

  if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior:'smooth' });
}

// Router
function route() {
  closePanels();
  const seg = splitHash();
  const page = find(seg);
  const baseHash = hashOf(page);
  const baseLen = baseHash ? baseHash.split('#').length : 0;
  const anchor = seg.slice(baseLen).join('#'); // preserves sub-ids containing '#'

  // reset scroll (iOS Safari needs both roots)
  document.documentElement.scrollTop = 0; document.body.scrollTop = 0;

  breadcrumb(page);
  render(page, anchor);
  highlightCurrent();
  highlightSidebar(page);
}

// UI init + listeners (runs once after data is ready)
function initUI() {
  // header
  $('#wiki-title-text').textContent = TITLE; document.title = TITLE;

  // sidebar + first route
  buildTree();
  route();

  // mini-graph lazy init
  new IntersectionObserver((entries, obs) => {
    if (entries[0].isIntersecting) { buildGraph(); obs.disconnect(); }
  }).observe($('#mini'));

  // fullscreen toggle
  const mini = $('#mini'); $('#expand').onclick = () => mini.classList.toggle('fullscreen');

  // search
  const searchInput = $('#search'), searchClear = $('#search-clear'); let debounce = 0;
  searchInput.oninput = e => {
    clearTimeout(debounce);
    const val = e.target.value; searchClear.style.display = val ? '' : 'none';
    debounce = setTimeout(() => search(val.toLowerCase()), 150);
  };
  searchClear.onclick = () => { searchInput.value=''; searchClear.style.display='none'; search(''); searchInput.focus(); };

  // theme toggle (persist + live)
  (() => {
    const btn = $('#theme-toggle');
    const rootEl = document.documentElement;
    const media = matchMedia('(prefers-color-scheme: dark)');
    let dark = localStorage.getItem('km-theme') === 'dark' || (!localStorage.getItem('km-theme') && media.matches);
    apply(dark);
    btn.onclick = () => { dark = !dark; apply(dark); localStorage.setItem('km-theme', dark ? 'dark' : 'light'); };
    function apply(isDark) {
      rootEl.style.setProperty('--color-main', isDark ? 'rgb(29,29,29)' : 'white');
      rootEl.setAttribute('data-theme', isDark ? 'dark' : 'light');
    }
  })();

  // burger toggles (mobile)
  const togglePanel = sel => {
    const el = $(sel); const wasOpen = el.classList.contains('open');
    closePanels(); if (!wasOpen) {
      el.classList.add('open');
      if (!el.querySelector('.panel-close')) {
        const btn = document.createElement('button'); btn.className='panel-close'; btn.textContent='✕'; btn.onclick = closePanels; el.appendChild(btn);
      }
    }
  };
  $('#burger-sidebar').onclick = () => togglePanel('#sidebar');
  $('#burger-util').onclick    = () => togglePanel('#util');

  // auto-close panels on desktop resize
  addEventListener('resize', () => {
    if (matchMedia('(min-width:1001px)').matches) { $('#sidebar').classList.remove('open'); $('#util').classList.remove('open'); }
  });

  // in-app routing
  addEventListener('hashchange', route);

  // idle preloads (no DOM churn)
  whenIdle(async () => { await KM.ensureHighlight(); /* warm cache for snappy code blocks */ });
}


/* =====================================================================
   6) FOOTNOTE & RELATED UTILITIES
====================================================================== */
/**
 * Prefixes in-page footnote links with current page-hash.
 */
function fixFootnoteLinks(page) {
  const base = hashOf(page); if (!base) return;
  $$('#content a[href^="#"]').forEach(a => {
    const href = a.getAttribute('href');
    if (/^#(?:fn|footnote)/.test(href) && !href.includes(base)) a.setAttribute('href', `#${base}${href}`);
  });
}

/** Injects «previous / next» links between siblings for linear reading. */
function prevNext(page) {
  $('#prev-next')?.remove();
  if (!page.parent) return;
  const sib = page.parent.children; if (sib.length < 2) return;
  const i = sib.indexOf(page);
  const nav = document.createElement('div'); nav.id = 'prev-next';
  if (i > 0) nav.appendChild(Object.assign(document.createElement('a'), { href:'#'+hashOf(sib[i-1]), textContent:'← '+sib[i-1].title }));
  if (i < sib.length-1) nav.appendChild(Object.assign(document.createElement('a'), { href:'#'+hashOf(sib[i+1]), textContent:sib[i+1].title+' →' }));
  $('#content').appendChild(nav);
}

/**
 * Inserts a “See also” list with pages that share at least one tag.
 */
function seeAlso(page) {
  $('#see-also')?.remove();
  if (!page.tagsSet?.size) return;

  const related = pages
    .filter(p => p !== page)
    .map(p => ({ p, shared: [...p.tagsSet].filter(t => page.tagsSet.has(t)).length }))
    .filter(r => r.shared > 0)
    .sort((a,b)=> b.shared - a.shared || a.p.title.localeCompare(b.p.title));

  if (!related.length) return;

  const wrap = document.createElement('div'); wrap.id='see-also'; wrap.innerHTML = '<h2>See also</h2><ul></ul>';
  const ul = wrap.querySelector('ul');
  related.forEach(({p}) => { const li = document.createElement('li'); li.innerHTML = `<a href="#${hashOf(p)}">${p.title}</a>`; ul.appendChild(li); });
  const content = $('#content'); const prevNextEl = $('#prev-next'); content.insertBefore(wrap, prevNextEl ?? null);
}


/* =====================================================================
   7) BOOTSTRAP: robust Markdown fetch (timeout, error UI)
====================================================================== */
(async () => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10000); // 10s timeout
  try {
    const res = await fetch(MD, { cache:'reload', signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const txt = await res.text();
    parseMarkdownBundle(txt);
    attachSecondaryHomes();
    initUI();
    await new Promise(r => setTimeout(r, 50));
    highlightCurrent();
  } catch (e) {
    console.error('Failed to load MD bundle:', e);
    $('#content')?.insertAdjacentHTML('afterbegin',
      `<p class="error">Failed to load content. Please check your connection and reload.</p>`);
  } finally {
    clearTimeout(t);
  }
})();
