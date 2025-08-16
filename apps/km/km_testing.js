/* *********************************************************************
   KM WIKI ─ SINGLE-FILE CLIENT
   Refactor 2025-08-16
   ---------------------------------------------------------------------
   •  Order follows the actual load-time dependencies
   •  Related utilities live side-by-side
   •  “Early-critical” work (Markdown fetch) kicks off ASAP
   •  CPU-heavy bits run in idle blocks
*************************************************************************/


/* ═════════════════════════════════════════════════════════════════════
   0 • GLOBAL NAMESPACE  +  DOM SHORTHANDS
══════════════════════════════════════════════════════════════════════ */
window.KM = {};

const  $  = (s, c = document) => (c).querySelector(s);
const $$  = (s, c = document) => [...(c).querySelectorAll(s)];

Object.assign(KM, { $, $$ });

/* read config that the host page injected */
const { TITLE, MD } = window.CONFIG;


/* ═════════════════════════════════════════════════════════════════════
   1 • LAZY-LOADED LIBRARIES  (D3, Highlight.js, Markdown, KaTeX)
══════════════════════════════════════════════════════════════════════ */

/* --- 1-A  D3 micro-bundle ------------------------------------------ */
KM.ensureD3 = (() => {
  let ready;
  return function ensureD3 () {
    if (ready) return ready;
    ready = Promise.all([
      import('https://cdn.jsdelivr.net/npm/d3-selection@3/+esm'),
      import('https://cdn.jsdelivr.net/npm/d3-force@3/+esm'),
      import('https://cdn.jsdelivr.net/npm/d3-drag@3/+esm'),
    ]).then(([sel, force, drag]) => {
      KM.d3 = {
        select         : sel.select,
        selectAll      : sel.selectAll,
        forceSimulation: force.forceSimulation,
        forceLink      : force.forceLink,
        forceManyBody  : force.forceManyBody,
        forceCenter    : force.forceCenter,
        drag           : drag.drag,
      };
    });
    return ready;
  };
})();

/* --- 1-B  highlight.js core + languages ---------------------------- */
KM.ensureHighlight = (() => {
  let ready;
  return function ensureHighlight () {
    if (ready) return ready;

    ready = (async () => {
      const { LANGS = [] } = window.CONFIG;
      const core  = await import('https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/es/core/+esm');
      const hljs  = core.default;
      await Promise.all(
        LANGS.map(async lang => {
          const m = await import(`https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/es/languages/${lang}/+esm`);
          hljs.registerLanguage(lang, m.default);
        }),
      );
      window.hljs = hljs;          // dev-tools convenience
    })();

    return ready;
  };
})();

/* --- 1-C  highlight.js theme auto-switcher ------------------------- */
KM.ensureHLJSTheme = (() => {
  const CSS = {
    light: 'https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github.min.css',
    dark : 'https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github-dark.min.css',
  };

  let ready  = null;
  let wired  = false;

  function linkEl () {
    let l = document.querySelector('link[data-hljs-theme]');
    if (!l) {
      l = document.createElement('link');
      l.rel = 'stylesheet';
      l.setAttribute('data-hljs-theme', '');
      document.head.appendChild(l);
    }
    return l;
  }
  const mode = () =>
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

  function apply () {
    const href = CSS[mode()];
    const l    = linkEl();
    if (l.getAttribute('href') === href) return Promise.resolve();
    return new Promise(res => { l.onload = l.onerror = res; l.href = href; });
  }

  return function ensureHLJSTheme () {
    if (!ready) ready = apply();
    if (!wired) {
      wired = true;
      new MutationObserver(apply).observe(document.documentElement,
        { attributes:true, attributeFilter:['data-theme'] });
    }
    return ready;
  };
})();

/* --- 1-D  marked + extensions -------------------------------------- */
KM.ensureMarkdown = (() => {
  let ready;
  return function ensureMarkdown () {
    if (ready) return ready;
    ready = Promise.all([
      import('https://cdn.jsdelivr.net/npm/marked@16.1.2/lib/marked.esm.min.js'),
      import('https://cdn.jsdelivr.net/npm/marked-footnote/+esm'),
      import('https://cdn.jsdelivr.net/npm/marked-alert/+esm'),
    ]).then(([marked, foot, alert]) => {
      const md = new marked.Marked()
        .use(foot.default())
        .use(alert.default());
      return { parse : (src,opt) => md.parse(src, {...opt, mangle:false}) };
    });
    return ready;
  };
})();

/* --- 1-E  KaTeX + auto-render bundle -------------------------------- */
KM.ensureKatex = (() => {
  const BASE = 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/';
  let ready;
  return function ensureKatex () {
    if (ready) return ready;

    if (!$('#katex-css')) {
      const css = document.createElement('link');
      css.id   = 'katex-css';
      css.rel  = 'stylesheet';
      css.href = BASE + 'katex.min.css';
      document.head.appendChild(css);
    }

    ready = Promise.all([
      import(BASE + 'katex.min.js/+esm'),
      import(BASE + 'contrib/auto-render.min.js/+esm'),
    ]).then(([katex, auto]) => {
      window.katex              = katex;
      window.renderMathInElement = auto.default;
    });
    return ready;
  };
})();


/* ═════════════════════════════════════════════════════════════════════
   2 • GENERIC HELPERS  (idle-time, clipboard …)
══════════════════════════════════════════════════════════════════════ */

/* tiny rIC poly */
function whenIdle (cb, timeout = 1500) {
  ('requestIdleCallback' in window)
    ? requestIdleCallback(cb, { timeout })
    : setTimeout(cb, 1);
}

/* close slide-in panels (mobile) */
function closePanels () {
  $('#sidebar').classList.remove('open');
  $('#util').classList.remove('open');
}

/* visual clipboard feedback */
async function copyText (txt, node) {
  try {
    await navigator.clipboard.writeText(txt);
    node.classList.add('flash');
    setTimeout(() => node.classList.remove('flash'), 350);
  } catch (err) {
    console.warn('Clipboard API unavailable', err);
  }
}


/* ═════════════════════════════════════════════════════════════════════
   3 •   MARKDOWN  →  PAGE DB
   •  starts ASAP so the network fetch overlaps script parsing
══════════════════════════════════════════════════════════════════════ */

const pages  = [];
const byId   = new Map();
let   root   = null;

/* kick off network fetch right away */
fetch(MD, { cache:'reload' })
  .then(r => r.text())
  .then(parseMarkdownBundle)
  .then(attachSecondaryHomes)
  .then(initUI)              // DOM wiring, sidebar, listeners …
  .then(() => new Promise(r => setTimeout(r,50))) // paint-safety
  .then(highlightCurrent);   // sync mini-graph highlight

/* -------- markdown bundle parser ----------------------------------- */
function parseMarkdownBundle (txt) {
  /* 0. split bundle into pages (<!--meta-->\n body) */
  for (const [, hdr, body] of txt.matchAll(/<!--([\s\S]*?)-->\s*([\s\S]*?)(?=<!--|$)/g)) {
    const meta = {};
    hdr.replace(/(\w+):"([^"]+)"/g, (_,k,v) => meta[k]=v.trim());
    pages.push({ ...meta, content:body.trim(), children:[] });
  }

  /* 1.  lookup maps */
  pages.forEach(p => byId.set(p.id, p));
  root = byId.get('home') || pages[0];

  /* 2.  parent/child wiring */
  pages.forEach(p => {
    if (p===root) return;
    const par = byId.get((p.parent||'').trim());
    if (par) { p.parent = par; par.children.push(p); }
    else     { p.parent = null; }
  });

  /* 3.  tag sets + page-level search blob */
  pages.forEach(p => {
    p.tagsSet   = new Set((p.tags||'').split(',').filter(Boolean));
    p.searchStr = (p.title + ' ' + [...p.tagsSet].join(' ') + ' ' + p.content).toLowerCase();
  });

  /* 4.  per-heading section index (fence-aware) */
  pages.forEach(p => {
    const counters  = [0,0,0,0,0,0];
    const sections  = [];
    let   inFence   = false;
    let   offset    = 0;
    let   prev      = null;

    for (const line of p.content.split(/\r?\n/)) {
      if (/^(?:```|~~~)/.test(line)) inFence = !inFence;

      if (!inFence && /^(#{1,5})\s+/.test(line)) {
        if (prev) {                           // flush prior
          prev.body   = p.content.slice(prev.bodyStart, offset).trim();
          prev.search = (prev.txt + ' ' + prev.body).toLowerCase();
          sections.push(prev);
        }
        const [, hashes, txt] = line.match(/^(#{1,5})\s+(.+)/);
        const lvl = hashes.length-1;
        counters[lvl]++;
        for (let i=lvl+1;i<6;i++) counters[i]=0;
        prev = {
          id        : counters.slice(0,lvl+1).filter(Boolean).join('_'),
          txt       : txt.trim(),
          bodyStart : offset + line.length + 1
        };
      }
      offset += line.length + 1;
    }
    if (prev) {
      prev.body   = p.content.slice(prev.bodyStart).trim();
      prev.search = (prev.txt + ' ' + prev.body).toLowerCase();
      sections.push(prev);
    }
    p.sections = sections;
  });
}

/* -------- secondary “home” pages (cluster reps) -------------------- */
function attachSecondaryHomes () {
  const topOf = p => { while (p.parent) p=p.parent; return p; };

  const clusters = new Map();
  pages.forEach(p => {
    const t = topOf(p);
    if (t===root) return;
    (clusters.get(t) || clusters.set(t,[]).get(t)).push(p);
  });

  const descCount = page => {
    let n=0; (function rec(x){x.children.forEach(c=>{n++;rec(c)})})(page); return n;
  };

  let cid = 0;
  clusters.forEach((members, top) => {
    const rep = members.reduce((a,b)=>descCount(b)>descCount(a)?b:a, top);
    if (!rep.parent) {
      rep.parent = root;
      rep.isSecondary = true;
      rep.clusterId   = cid++;
      root.children.push(rep);
    }
  });
}


/* ═════════════════════════════════════════════════════════════════════
   4 • URL HELPERS & ROUTER PRIMITIVES
══════════════════════════════════════════════════════════════════════ */

const hashOf = page => {
  const segs=[];
  for (let n=page;n&&n.parent;n=n.parent) segs.unshift(n.id);
  return segs.join('#');
};

const find = segs => {
  let n=root;
  for (const id of segs) {
    const c = n.children.find(k=>k.id===id);
    if (!c) break;
    n=c;
  }
  return n;
};

const nav = page => (location.hash = '#' + hashOf(page));
KM.nav = nav;


/* ═════════════════════════════════════════════════════════════════════
   5 • SIDEBAR  /  SEARCH  /  BREADCRUMB
══════════════════════════════════════════════════════════════════════ */

let sidebarCurrent = null;

/* ---------- tree builder ------------------------------------------- */
function buildTree () {
  const ul = $('#tree');
  ul.innerHTML = '';

  const prim = root.children.filter(c=>!c.isSecondary)
                .sort((a,b)=>a.title.localeCompare(b.title));
  const sec  = root.children.filter(c=>c.isSecondary)
                .sort((a,b)=>a.clusterId-b.clusterId);

  const sep = () => {
    const li = document.createElement('li');
    li.className='group-sep';
    li.innerHTML='<hr>';
    ul.appendChild(li);
  };

  const rec = (nodes, container, depth=0) => {
    nodes.forEach(p=>{
      const li = document.createElement('li');

      if (p.children.length) {
        const open  = depth<2;
        li.className = 'folder'+(open?' open':'');
        const caret  = document.createElement('button');
        caret.className='caret';
        caret.setAttribute('aria-expanded',String(open));
        caret.onclick = e=>{
          e.stopPropagation();
          const t=li.classList.toggle('open');
          caret.setAttribute('aria-expanded',t);
          sub.style.display = t?'block':'none';
        };
        const lbl = document.createElement('a');
        lbl.className='lbl';
        lbl.dataset.page = p.id;
        lbl.href = '#' + hashOf(p);
        lbl.textContent = p.title;
        const sub = document.createElement('ul');
        sub.style.display = open?'block':'none';
        li.append(caret,lbl,sub);
        container.appendChild(li);
        rec(p.children.sort((a,b)=>a.title.localeCompare(b.title)), sub, depth+1);
      } else {
        li.className='article';
        const a=document.createElement('a');
        a.dataset.page=p.id;
        a.href='#'+hashOf(p);
        a.textContent=p.title;
        li.appendChild(a);
        container.appendChild(li);
      }
    });
  };

  rec(prim,ul);
  sec.forEach(r=>{ sep(); rec([r],ul); });
}

function highlightSidebar (page) {
  sidebarCurrent?.classList.remove('sidebar-current');
  sidebarCurrent = $(`#tree a[data-page="${page.id}"]`);
  sidebarCurrent?.classList.add('sidebar-current');
}

/* ---------- search -------------------------------------------------- */
function search (q) {
  const resUL = $('#results');
  const tree  = $('#tree');

  if (!q.trim()) {
    resUL.style.display='none';
    tree.style.display='';
    return;
  }

  const tokens = q.split(/\s+/).filter(t=>t.length>=2);
  resUL.innerHTML='';
  resUL.style.display='';
  tree .style.display='none';

  pages
    .filter(p=>tokens.every(tok=>p.searchStr.includes(tok)))
    .forEach(p=>{
      const li=document.createElement('li');
      li.className='page-result';
      li.textContent=p.title;
      li.onclick = ()=>{ nav(p); closePanels(); };
      resUL.appendChild(li);

      const secs=p.sections.filter(s=>tokens.every(tok=>s.search.includes(tok)));
      if (secs.length) {
        const subUL=document.createElement('ul');
        subUL.className='sub-results';
        secs.forEach(s=>{
          const sub=document.createElement('li');
          sub.className='heading-result';
          sub.textContent=s.txt;
          sub.onclick = e=>{
            e.stopPropagation();
            location.hash = `#${hashOf(p)}#${s.id}`;
            closePanels();
          };
          subUL.appendChild(sub);
        });
        li.appendChild(subUL);
      }
    });

  if (!resUL.children.length)
    resUL.innerHTML='<li id="no_result">No result</li>';
}

/* ---------- breadcrumb --------------------------------------------- */
function breadcrumb (page) {
  const dyn = $('#crumb-dyn');
  dyn.innerHTML='';

  /* ancestors (skip root because the home-icon stands for it) */
  const chain=[];
  for (let n=page;n;n=n.parent) chain.unshift(n);
  chain.shift();

  chain.forEach(n=>{
    dyn.insertAdjacentHTML('beforeend', '<span class="separator">▸</span>');

    const wrap = document.createElement('span');
    wrap.className='dropdown';

    const a=document.createElement('a');
    a.textContent=n.title;
    a.href='#'+hashOf(n);
    if (n===page) a.className='crumb-current';
    wrap.appendChild(a);

    const sibs=n.parent.children.filter(s=>s!==n);
    if (sibs.length) {
      const ul=document.createElement('ul');
      sibs.forEach(s=>{
        const li=document.createElement('li');
        li.textContent=s.title;
        li.onclick=()=>nav(s);
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
    }

    dyn.appendChild(wrap);
  });

  /* child quick-select */
  if (page.children.length) {
    const box=document.createElement('span');
    box.className='childbox';
    box.innerHTML='<span class="toggle">▾</span><ul></ul>';
    const ul=box.querySelector('ul');
    page.children.sort((a,b)=>a.title.localeCompare(b.title))
        .forEach(ch=>{
          const li=document.createElement('li');
          li.textContent=ch.title;
          li.onclick = ()=>nav(ch);
          ul.appendChild(li);
        });
    dyn.appendChild(box);
  }
}


/* ═════════════════════════════════════════════════════════════════════
   6 •  MARKDOWN  →  HTML RENDERER
══════════════════════════════════════════════════════════════════════ */

function numberHeadings (el) {
  const counters=[0,0,0,0,0,0];
  $$('h1,h2,h3,h4,h5',el).forEach(h=>{
    const lvl=+h.tagName[1]-1;
    counters[lvl]++;
    for (let i=lvl+1;i<6;i++) counters[i]=0;
    h.id=counters.slice(0,lvl+1).filter(Boolean).join('_');
  });
}

function fixFootnoteLinks (page) {
  const base=hashOf(page);
  if (!base) return;
  $$('#content a[href^="#"]').forEach(a=>{
    const href=a.getAttribute('href');
    if (/^#(?:fn|footnote)/.test(href) && !href.includes(base))
      a.setAttribute('href',`#${base}${href}`);
  });
}

async function render (page, anchor) {
  /* 1. Markdown → raw HTML */
  const { parse } = await KM.ensureMarkdown();
  $('#content').innerHTML = parse(page.content, { headerIds:false });

  /* 2. lazy-load images */
  $$('#content img').forEach(img=>{
    img.loading='lazy';
    img.decoding='async';
    if (!img.hasAttribute('fetchpriority'))
      img.setAttribute('fetchpriority','low');
  });

  fixFootnoteLinks(page);            // hash-aware footnotes
  numberHeadings($('#content'));     // stable ids

  /* 3. Syntax highlight (idle) */
  if ($('#content pre code')) {
    await KM.ensureHLJSTheme();
    await KM.ensureHighlight();
    whenIdle(()=>hljs.highlightAll());
  }

  /* 4. KaTeX (if needed) */
  if (/(\$[^$]+\$|\\\(|\\\[)/.test(page.content)) {
    await KM.ensureKatex();
    renderMathInElement($('#content'),{
      delimiters:[
        {left:'$$',right:'$$',display:true},
        {left:'\\[',right:'\\]',display:true},
        {left:'$', right:'$', display:false},
        {left:'\\(',right:'\\)',display:false},
      ],
      throwOnError:false
    });
  }

  /* 5. extras */
  buildToc(page);
  decorateHeadings(page);
  decorateCodeBlocks();
  prevNext(page);
  seeAlso(page);

  /* 6. deep-link scroll */
  if (anchor)
    document.getElementById(anchor)?.scrollIntoView({ behavior:'smooth' });
}


/* ---------- extras used in render() -------------------------------- */
let tocObserver=null;

function buildToc (page) {
  const nav=$('#toc');
  nav.innerHTML='';
  const hs=$$('#content h1,#content h2,#content h3');
  if (!hs.length) return;

  const ul=document.createElement('ul');
  hs.forEach(h=>{
    const li=document.createElement('li');
    li.dataset.level=h.tagName[1];
    li.dataset.hid=h.id;
    const a=document.createElement('a');
    const base=hashOf(page);
    a.href='#'+(base?base+'#':'')+h.id;
    a.textContent=h.textContent;
    li.appendChild(a);
    ul.appendChild(li);
  });
  nav.appendChild(ul);

  tocObserver?.disconnect();
  tocObserver = new IntersectionObserver(entries=>{
    entries.forEach(en=>{
      const a=$(`#toc li[data-hid="${en.target.id}"] > a`);
      if (!a) return;
      if (en.isIntersecting) {
        $('#toc').querySelectorAll('.toc-current').forEach(x=>x.classList.remove('toc-current'));
        a.classList.add('toc-current');
      }
    });
  },{ rootMargin:'0px 0px -70% 0px', threshold:0 });
  hs.forEach(h=>tocObserver.observe(h));
}

function decorateHeadings (page) {
  $$('#content h1,h2,h3,h4,h5').forEach(h=>{
    const b=document.createElement('button');
    b.className='heading-copy';
    b.title='Copy direct link';
    b.innerHTML=`
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor"
              d="M3.9 12c0-1.7 1.4-3.1 3.1-3.1h5.4v-2H7c-2.8 0-5 2.2-5 5s2.2 5
                 5 5h5.4v-2H7c-1.7 0-3.1-1.4-3.1-3.1zm5.4 1h6.4v-2H9.3v2zm9.7-8h-5.4v2H19
                 c1.7 0 3.1 1.4 3.1 3.1s-1.4 3.1-3.1 3.1h-5.4v2H19c2.8 0 5-2.2 5-5s-2.2-5-5-5z"/>
      </svg>`;
    h.appendChild(b);

    const copy = () => {
      const link=`${location.origin}${location.pathname}#${hashOf(page)}#${h.id}`;
      copyText(link,b);
    };
    h.style.cursor='pointer';
    h.onclick=copy;
    b.onclick = e=>{e.stopPropagation(); copy();};
  });
}

function decorateCodeBlocks () {
  $$('#content pre').forEach(pre=>{
    const b=document.createElement('button');
    b.className='code-copy';
    b.title='Copy code';
    b.innerHTML=`
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor"
              d="M19,21H5c-1.1,0-2-0.9-2-2V7h2v12h14V21z M21,3H9C7.9,3,7,3.9,7,5v12
                 c0,1.1,0.9,2,2,2h12c1.1,0,2-0.9,2-2V5C23,3.9,22.1,3,21,3z M21,17H9V5h12V17z"/>
      </svg>`;
    b.onclick=()=>copyText(pre.innerText,b);
    pre.appendChild(b);
  });
}

function prevNext (page) {
  $('#prev-next')?.remove();
  if (!page.parent) return;
  const sib=page.parent.children;
  if (sib.length<2) return;

  const i=sib.indexOf(page);
  const nav=document.createElement('div');
  nav.id='prev-next';

  if (i>0) nav.appendChild(Object.assign(document.createElement('a'),{
    href : '#'+hashOf(sib[i-1]),
    textContent : '← '+sib[i-1].title
  }));
  if (i<sib.length-1) nav.appendChild(Object.assign(document.createElement('a'),{
    href : '#'+hashOf(sib[i+1]),
    textContent : sib[i+1].title+' →'
  }));
  $('#content').appendChild(nav);
}

function seeAlso (page) {
  $('#see-also')?.remove();
  if (!page.tagsSet?.size) return;

  const related=pages
    .filter(p=>p!==page)
    .map(p=>({p, shared:[...p.tagsSet].filter(t=>page.tagsSet.has(t)).length}))
    .filter(r=>r.shared>0)
    .sort((a,b)=>b.shared-a.shared || a.p.title.localeCompare(b.p.title));

  if (!related.length) return;

  const wrap=document.createElement('div');
  wrap.id='see-also';
  wrap.innerHTML='<h2>See also</h2><ul></ul>';
  const ul=wrap.querySelector('ul');
  related.forEach(({p})=>{
    const li=document.createElement('li');
    li.innerHTML=`<a href="#${hashOf(p)}">${p.title}</a>`;
    ul.appendChild(li);
  });
  const pn=$('#prev-next');
  $('#content').insertBefore(wrap,pn??null);
}


/* ═════════════════════════════════════════════════════════════════════
   7 •  MINI-GRAPH  (build once, resizes, centres current page)
══════════════════════════════════════════════════════════════════════ */

const IDS = {
  current : 'node_current',
  parent  : 'node_parent',
  leaf    : 'node_leaf',
  hierPRE : 'link_hier',
  tagPRE  : 'link_tag',
  label   : 'graph_text',
};

const graphs={};      // graphs.mini{node,label,sim,view,w,h,adj}
let   CURRENT=-1;

async function buildGraph () {
  await KM.ensureD3();
  if (graphs.mini) return;

  const {nodes,links,adj} = buildGraphData();
  const svg  = KM.d3.select('#mini');
  const box  = svg.node().getBoundingClientRect();
  const W    = box.width  || 400;
  const H    = box.height || 300;

  const nLocal = nodes.map(n=>({...n}));
  const lLocal = links.map(l=>({...l}));

  const sim = KM.d3
    .forceSimulation(nLocal)
    .force('link', KM.d3.forceLink(lLocal).id(d=>d.id).distance(80))
    .force('charge', KM.d3.forceManyBody().strength(-240))
    .force('center', KM.d3.forceCenter(W/2,H/2));

  const view = svg.append('g').attr('class','view');

  const link = view.append('g').selectAll('line')
               .data(lLocal).join('line')
               .attr('id', d=>{
                 if (d.kind==='hier') return IDS.hierPRE+d.tier;
                 return IDS.tagPRE+Math.min(d.shared,5);
               });

  const node = view.append('g').selectAll('circle')
               .data(nLocal).join('circle')
               .attr('r',6)
               .attr('id',d=>d.ref.children.length?IDS.parent:IDS.leaf)
               .style('cursor','pointer')
               .on('click',(e,d)=>nav(d.ref))
               .on('mouseover',(e,d)=>fade(d.id,0.15))
               .on('mouseout',()=>fade(null,1))
               .call(KM.d3.drag()
                 .on('start',(e,d)=>{d.fx=d.x;d.fy=d.y;})
                 .on('drag',(e,d)=>{sim.alphaTarget(0.3).restart();d.fx=e.x;d.fy=e.y;})
                 .on('end' ,(e,d)=>{if(!e.active)sim.alphaTarget(0);d.fx=d.fy=null;}));

  const label = view.append('g').selectAll('text')
                .data(nLocal).join('text')
                .attr('id',IDS.label)
                .attr('font-size',10)
                .text(d=>d.label);

  function fade (id,o) {
    node .style('opacity',d=>(id==null||adj.get(id)?.has(d.id)||d.id===id)?1:o);
    label.style('opacity',d=>(id==null||adj.get(id)?.has(d.id)||d.id===id)?1:o);
    link .style('opacity',l=>(id==null||l.source.id===id||l.target.id===id)?1:o);
  }

  sim.on('tick',()=>{
    link
      .attr('x1',d=>d.source.x).attr('y1',d=>d.source.y)
      .attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
    node .attr('cx',d=>d.x).attr('cy',d=>d.y);
    label.attr('x',d=>d.x+8 ).attr('y',d=>d.y+3);
  });

  graphs.mini={node,label,sim,view,adj,w:W,h:H};
  observeMiniResize();
}

function highlightCurrent () {
  if (!graphs.mini) return;
  const seg=location.hash.slice(1).split('#').filter(Boolean);
  const pg = find(seg);
  const id = pg?._i ?? -1;
  if (id===CURRENT) return;

  const g=graphs.mini;
  g.node
    .attr('id',d=>d.id===id?IDS.current:(d.ref.children.length?IDS.parent:IDS.leaf))
    .attr('r' ,d=>d.id===id?8:6);
  g.label.classed('current',d=>d.id===id);

  const cx=g.w/2, cy=g.h/2;
  g.node.filter(d=>d.id===id).each(d=>{
    const dx=cx-d.x, dy=cy-d.y;
    g.view.attr('transform',`translate(${dx},${dy})`);
    const k=0.35; d.vx+=(cx-d.x)*k; d.vy+=(cy-d.y)*k;
  });

  g.sim.alphaTarget(0.7).restart();
  setTimeout(()=>g.sim.alphaTarget(0),400);
  CURRENT=id;
}

function observeMiniResize () {
  new ResizeObserver(entries=>{
    const g=graphs.mini; if (!g) return;
    const {width:w,height:h}=entries[0].contentRect;
    g.w=w; g.h=h;
    g.sim.force('center',KM.d3.forceCenter(w/2,h/2));
    g.sim.alpha(0.3).restart();
  }).observe($('#mini'));
}

/* --- raw data build helper ----------------------------------------- */
function buildGraphData () {
  const N=[], L=[], A=new Map(), hierPairs=new Set();

  const touch=(a,b)=>{ (A.get(a)||A.set(a,new Set()).get(a)).add(b);
                       (A.get(b)||A.set(b,new Set()).get(b)).add(a); };

  const descCount=p=>{let n=0;(function rec(x){x.children.forEach(c=>{n++;rec(c);});})(p);return n;};
  const tierOf=n=>n<3?1:n<6?2:n<11?3:n<21?4:5;
  const overlap=(A,B)=>{let n=0;for(const x of A)if(B.has(x))n++;return n;};

  pages.forEach((p,i)=>{p._i=i; N.push({id:i,label:p.title,ref:p});});

  pages.forEach(p=>{
    if (!p.parent) return;
    if (p.isSecondary && p.parent===root) return;
    const a=p._i,b=p.parent._i,key=a<b?`${a}|${b}`:`${b}|${a}`,tier=tierOf(descCount(p));
    L.push({source:a,target:b,shared:0,kind:'hier',tier}); hierPairs.add(key); touch(a,b);
  });

  pages.forEach((a,i)=>{
    for (let j=i+1;j<pages.length;j++){
      const b=pages[j], n=overlap(a.tagsSet,b.tagsSet);
      if (!n) continue;
      const key=i<j?`${i}|${j}`:`${j}|${i}`; if (hierPairs.has(key)) continue;
      L.push({source:i,target:j,shared:n,kind:'tag'}); touch(i,j);
    }
  });

  return {nodes:N,links:L,adj:A};
}


/* ═════════════════════════════════════════════════════════════════════
   8 •  UI BOOTSTRAP  +  EVENT LISTENERS
══════════════════════════════════════════════════════════════════════ */

function initUI () {
  /* header */
  $('#wiki-title-text').textContent=TITLE;
  document.title=TITLE;

  /* sidebar + first route */
  buildTree();
  route();

  /* mini-graph lazy */
  new IntersectionObserver((e,obs)=>{
    if (e[0].isIntersecting){ buildGraph(); obs.disconnect(); }
  }).observe($('#mini'));

  /* full-screen toggle */
  $('#expand').onclick = () => $('#mini').classList.toggle('fullscreen');

  /* search */
  const q = $('#search');
  const clr=$('#search-clear');
  let deb=0;
  q.oninput=e=>{
    clearTimeout(deb);
    const val=e.target.value;
    clr.style.display=val?'':'none';
    deb=setTimeout(()=>search(val.toLowerCase()),150);
  };
  clr.onclick=()=>{ q.value=''; clr.style.display='none'; search(''); q.focus(); };

  /* theme switch */
  (()=>{
    const btn=$('#theme-toggle');
    const root=document.documentElement;
    const media=matchMedia('(prefers-color-scheme: dark)');
    let dark = localStorage.getItem('km-theme')==='dark' ||
        (!localStorage.getItem('km-theme') && media.matches);
    const apply=isDark=>{
      root.style.setProperty('--color-main', isDark?'rgb(29,29,29)':'white');
      root.setAttribute('data-theme', isDark?'dark':'light');
    };
    apply(dark);
    btn.onclick=()=>{ dark=!dark; apply(dark); localStorage.setItem('km-theme',dark?'dark':'light'); };
  })();

  /* burger panels */
  const toggle = sel=>{
    const el=$(sel), was=el.classList.contains('open');
    closePanels();
    if (!was){
      el.classList.add('open');
      if (!el.querySelector('.panel-close')){
        const b=document.createElement('button');
        b.className='panel-close'; b.textContent='✕'; b.onclick=closePanels;
        el.appendChild(b);
      }
    }
  };
  $('#burger-sidebar').onclick=()=>toggle('#sidebar');
  $('#burger-util'   ).onclick=()=>toggle('#util');

  /* auto-close on desktop */
  addEventListener('resize',()=>{
    if (matchMedia('(min-width:1001px)').matches){ closePanels(); }
  });

  /* hash-router */
  addEventListener('hashchange',route);
}


/* ═════════════════════════════════════════════════════════════════════
   9 •  ROUTER  (hash → page  [+ optional anchor])
══════════════════════════════════════════════════════════════════════ */

function route () {
  closePanels();

  const seg   = location.hash.slice(1).split('#').filter(Boolean);
  const page  = find(seg);
  const anchor= seg.slice(hashOf(page).split('#').length).join('#');

  document.documentElement.scrollTop=0;
  document.body.scrollTop           =0;

  breadcrumb(page);
  render(page,anchor);
  highlightCurrent();
  highlightSidebar(page);
}
