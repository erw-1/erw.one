// src/ui.js
import {
  DOC, $, $$, el,
  __VPW, __VPH, updateViewport,
  escapeRegex, whenIdle, domReady, clearSelection, baseURLNoHash,
  ICONS, iconBtn, wireCopyButtons, HEADINGS_SEL,
} from './dom.js';

import {
  TITLE, DEFAULT_THEME, ACCENT,
  root, pages, descendants, byId,
  hashOf, buildDeepURL, parseTarget, nav,
} from './data.js';

import {
  getParsedHTML, enhanceRendered,
  normalizeAnchors, annotatePreviewableLinks,
  ensureHLJSTheme, syncMermaidThemeWithPage,
} from './render.js';

/* ───────────────────────────── Utilities ───────────────────────────── */

const ensureOnce = (fn) => { let p; return () => (p ??= fn()); };

/* Minimal d3 loader: selection + force + drag (smaller payload) */
const ensureD3 = ensureOnce(async () => {
  const [sel, force, drag] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/d3-selection@3.0.0/+esm'),
    import('https://cdn.jsdelivr.net/npm/d3-force@3.0.0/+esm'),
    import('https://cdn.jsdelivr.net/npm/d3-drag@3.0.0/+esm'),
  ]);
  return {
    select: sel.select,
    selectAll: sel.selectAll,
    forceSimulation: force.forceSimulation,
    forceLink: force.forceLink,
    forceManyBody: force.forceManyBody,
    forceCenter: force.forceCenter,
    drag: drag.drag,
  };
});

/* ───────────────────────────── Panels ───────────────────────────── */

export function closePanels() {
  $('#sidebar')?.classList.remove('open');
  $('#util')?.classList.remove('open');
}

/* ───────────────────────────── Header / Breadcrumb ───────────────────────── */

export function breadcrumb(page) {
  const bar = $('#crumb');
  if (!bar) return;
  bar.innerHTML = '';

  const path = [];
  for (let n = page; n; n = n.parent) path.unshift(n);
  if (path[0] !== root) path.unshift(root);

  path.forEach((n, i) => {
    if (i) bar.append(' › ');
    if (i === path.length - 1) {
      bar.append(el('span', { class: 'current', textContent: n.title }));
    } else {
      bar.append(el('a', { href: '#' + hashOf(n), textContent: n.title }));
    }
  });
}

/* ───────────────────────────── Sidebar Tree ───────────────────────────── */

function isOpenKey(id) { return `km.open.${id}`; }
function getStoredOpen(id) { return localStorage.getItem(isOpenKey(id)) === '1'; }
function setStoredOpen(id, v) { localStorage.setItem(isOpenKey(id), v ? '1' : '0'); }

function makeNodeLink(p) {
  const a = el('a', { href: '#' + hashOf(p), textContent: p.title, title: p.title });
  a.dataset.pid = p.id;
  return a;
}

function buildTreeNode(p) {
  const li = el('li', { 'data-id': p.id });
  const hasKids = (p.children && p.children.length);
  if (hasKids) {
    const toggle = el('button', { class: 'twisty', 'aria-label': 'Toggle section', 'aria-expanded': 'false' }, [ICONS.caret]);
    const head = el('div', { class: 'head' }, [toggle, makeNodeLink(p)]);
    const ul = el('ul', { class: 'children' });
    p.children.forEach(c => ul.append(buildTreeNode(c)));
    li.append(head, ul);

    const applyOpen = (open) => {
      li.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
    };
    const initial = getStoredOpen(p.id);
    applyOpen(initial);

    toggle.addEventListener('click', (e) => {
      const now = !li.classList.contains('open');
      applyOpen(now);
      setStoredOpen(p.id, now);
      e.stopPropagation();
    });
  } else {
    li.append(el('div', { class: 'head leaf' }, [makeNodeLink(p)]));
  }
  return li;
}

export function buildTree() {
  const tree = $('#tree');
  if (!tree) return;
  tree.innerHTML = '';
  const ul = el('ul', { class: 'root' });
  root.children.forEach(p => ul.append(buildTreeNode(p)));
  tree.append(ul);
}

export function highlightSidebar(page) {
  const tree = $('#tree'); if (!tree) return;
  tree.querySelector('.current')?.classList.remove('current');

  const a = tree.querySelector(`a[data-pid="${page.id}"]`);
  if (a) {
    a.classList.add('current');
    // open ancestors
    for (let n = a.closest('li'); n; n = n.parentElement?.closest('li')) {
      n.classList.add('open');
      const btn = n.querySelector(':scope > .head > .twisty');
      btn?.setAttribute('aria-expanded', 'true');
      setStoredOpen(n.dataset.id, true);
    }
  }
}

/* ───────────────────────────── ToC ───────────────────────────── */

let tocObserver;
export function buildToc(page) {
  const toc = $('#toc');
  if (!toc) return;
  toc.innerHTML = '';

  const hs = $$(HEADINGS_SEL, $('#content'));
  if (!hs.length) return;

  const ul = el('ul');
  hs.forEach(h => {
    const li = el('li', { 'data-hid': h.id, class: h.tagName.toLowerCase() }, [
      el('a', { href: buildDeepURL(page, h.id), textContent: h.textContent || '' })
    ]);
    ul.append(li);
  });
  toc.append(ul);

  // Scroll spy
  tocObserver?.disconnect();
  tocObserver = new IntersectionObserver((entries) => {
    const vis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    const id = (vis[0] && vis[0].target && vis[0].target.id) || '';
    if (id) {
      const curr = toc.querySelector('.toc-current');
      const next = toc.querySelector(`li[data-hid="${id}"] > a`);
      if (curr !== next) {
        curr?.classList.remove('toc-current');
        next?.classList.add('toc-current');
      }
    }
  }, { root: null, rootMargin: '0px 0px -70% 0px', threshold: 0 });

  hs.forEach(h => tocObserver.observe(h));
}

/* ───────────────────────────── Search ───────────────────────────── */

function tokenize(q) {
  return (q || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
}

export function search(q) {
  const resultsEl = $('#results');
  if (!resultsEl) return;

  const terms = tokenize(q);
  const reFull = new RegExp(escapeRegex(q).replace(/\s+/g, '\\s+'), 'i');
  const tokenRes = terms.map(t => new RegExp(escapeRegex(t), 'i'));

  const out = [];

  for (const page of pages) {
    let t = 0;
    if (reFull.test(page.title)) t += 8;
    if (page.tags && reFull.test(page.tags.join(' '))) t += 2;
    if (reFull.test(page.content || '')) t += 4;

    const matchedSecs = [];
    if (terms.length && Array.isArray(page.sections)) {
      for (const sec of page.sections) {
        let hits = 0;
        for (const r of tokenRes) if (r.test(sec.search)) hits++;
        if (hits) matchedSecs.push({ sec, hits });
      }
    }

    const score =
      Math.log(1 + 4 * t) +
      Math.log(1 + matchedSecs.length) +
      (terms.length ? terms.length * 0.1 : 0);

    if (t || matchedSecs.length) out.push({ page, score, matchedSecs });
  }

  out.sort((a, b) => b.score - a.score);
  renderSearchResults(out, q || '');
}

function highlightText(txt, terms) {
  if (!terms.length) return txt;
  let s = txt;
  for (const t of terms) {
    const re = new RegExp(`(${escapeRegex(t)})`, 'ig');
    s = s.replace(re, '<mark>$1</mark>');
  }
  return s;
}

function renderSearchResults(list, q) {
  const resultsEl = $('#results');
  const terms = tokenize(q);
  resultsEl.innerHTML = '';

  if (!list.length) {
    resultsEl.append(el('p', { class: 'empty', textContent: 'No results.' }));
    return;
  }

  const ol = el('ol', { class: 'search-list' });
  for (const { page, matchedSecs } of list.slice(0, 100)) {
    const li = el('li', { class: 'res' });
    const title = el('a', { class: 'page', href: '#' + hashOf(page) });
    title.innerHTML = highlightText(page.title, terms);
    li.append(title);

    if (matchedSecs.length) {
      const ul = el('ul', { class: 'sections' });
      matchedSecs.slice(0, 6).forEach(({ sec }) => {
        const a = el('a', { href: buildDeepURL(page, sec.id) });
        a.innerHTML = highlightText(sec.txt || sec.id, terms);
        const sli = el('li', {}, [a]);
        ul.append(sli);
      });
      li.append(ul);
    }

    ol.append(li);
  }
  resultsEl.append(ol);
}

/* ───────────────────────────── Mini Graph (D3) ───────────────────────────── */

const graph = {
  built: false,
  nodeSel: null,
  linkSel: null,
  sim: null,
  data: null,
  svg: null,
  g: null,
};

export async function buildGraph() {
  const mini = $('#mini'); if (!mini || graph.built) return;
  const d3 = await ensureD3();

  // data
  const nodes = [];
  const links = [];
  const idIdx = new Map();
  let i = 0;
  for (const p of descendants(root)) {
    idIdx.set(p.id, i++);
    nodes.push({ id: p.id, page: p, title: p.title });
    if (p.parent) links.push({ source: p.parent.id, target: p.id });
  }

  const svg = d3.select('#mini').append('svg')
    .attr('role', 'img')
    .attr('aria-label', 'Site map');

  const g = svg.append('g');

  const link = g.selectAll('line')
    .data(links)
    .enter().append('line')
    .attr('class', 'link');

  const node = g.selectAll('circle')
    .data(nodes)
    .enter().append('circle')
    .attr('class', 'node')
    .attr('r', d => d.page === root ? 6 : 4)
    .on('click', (e, d) => nav(d.page))
    .call(d3.drag()
      .on('start', (event, d) => {
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on('end', (event, d) => {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null; d.fy = null;
      }));

  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(30).strength(0.12))
    .force('charge', d3.forceManyBody().strength(-60))
    .force('center', d3.forceCenter(0, 0))
    .on('tick', () => {
      link
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('cx', d => d.x).attr('cy', d => d.y);
    });

  graph.built = true;
  graph.nodeSel = node;
  graph.linkSel = link;
  graph.sim = sim;
  graph.svg = svg;
  graph.g = g;

  updateMiniViewport();
  highlightCurrent(true);
}

export function updateMiniViewport() {
  const wrap = $('#mini');
  if (!wrap || !graph.svg) return;
  updateViewport();
  const w = Math.max(120, wrap.clientWidth || 300);
  const h = Math.max(80, wrap.clientHeight || 200);
  graph.svg.attr('width', w).attr('height', h);
  // fit content (we keep coordinates around 0,0)
  graph.svg.attr('viewBox', [-w / 2, -h / 2, w, h].join(' '));
}

export function highlightCurrent(force = false) {
  if (!graph.nodeSel) return;
  const { page } = parseTarget(location.hash) || { page: root };
  graph.nodeSel.classed('current', d => d.page === page);
  if (force) graph.sim?.alpha(0.05).restart();
}

/* ───────────────────────────── Link previews ───────────────────────────── */

(function attachLinkPreviews() {
  const stack = []; // { el, body, link }

  function remove(el) {
    const i = stack.findIndex(p => p.el === el);
    if (i >= 0) stack.splice(i, 1);
    el.remove();
  }

  function position(panel, linkEl) {
    const rect = linkEl.getBoundingClientRect();
    const gap = 8;
    const W = Math.max(1, panel.offsetWidth || 1);
    const H = Math.max(1, panel.offsetHeight || 1);
    const preferRight = rect.right + gap + W <= __VPW;
    const left = preferRight ? (rect.right + gap) : Math.max(8, rect.left - gap - W);
    const top = Math.min(__VPH - H - 8, Math.max(8, rect.top));
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  }

  async function openPreview(linkEl) {
    const href = linkEl.getAttribute('href') || '';
    if (!href.startsWith('#')) return;
    const { page, anchor } = parseTarget(href);
    if (!page) return;

    const wrapper = el('div', { class: 'km-link-preview', role: 'dialog' });
    const head = el('div', { class: 'kp-head' }, [
      el('span', { class: 'kp-title', textContent: page.title }),
      iconBtn('Close', ICONS.close, 'kp-close'),
    ]);
    const bodyWrap = el('div', { class: 'kp-body-wrap' });
    const body = el('div'); // content root (so mermaid can rerender later)
    bodyWrap.append(body);
    wrapper.append(head, bodyWrap);
    document.body.appendChild(wrapper);

    head.querySelector('.kp-close')?.addEventListener('click', () => remove(wrapper));

    // Fill content via render pipeline (but off-DOM HTML)
    const html = await getParsedHTML(page);
    body.innerHTML = html;
    await enhanceRendered(body, page);
    normalizeAnchors(body, page);
    annotatePreviewableLinks(body);

    if (anchor) {
      const tgt = body.querySelector('#' + CSS.escape(anchor));
      tgt?.scrollIntoView?.({ block: 'start' });
    }

    position(wrapper, linkEl);
    stack.push({ el: wrapper, body, link: linkEl });
  }

  // Delegated hover/focus on in-article previewable links
  document.addEventListener('mouseover', (e) => {
    const a = (e.target && e.target.closest?.('a.km-previewable'));
    if (!a) return;
    // avoid popping multiple for same link
    if (!stack.some(p => p.link === a)) openPreview(a);
  }, { passive: true });

  document.addEventListener('focusin', (e) => {
    const a = (e.target && e.target.closest?.('a.km-previewable'));
    if (!a) return;
    if (!stack.some(p => p.link === a)) openPreview(a);
  });

  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest?.('.kp-close');
    if (btn) e.preventDefault();
  });

  addEventListener('scroll', () => {
    // reposition visible panels relative to their link
    stack.forEach(p => position(p.el, p.link));
  }, { passive: true });
})();

/* ───────────────────────────── Keyboard shortcuts ───────────────────────── */

function nextPrevHeading(dir = 1) {
  const hs = $$(HEADINGS_SEL, $('#content'));
  if (!hs.length) return;
  const y = (document.scrollingElement || document.documentElement).scrollTop + 2;
  const idx = hs.findIndex(h => h.getBoundingClientRect().top + scrollY >= y);
  const tgt = dir > 0 ? (hs[Math.min(hs.length - 1, (idx < 0 ? 0 : idx + 1))]) : (hs[Math.max(0, (idx <= 0 ? 0 : idx - 1))]);
  tgt?.scrollIntoView({ behavior: 'smooth' });
}

function goSiblingPage(dir = 1) {
  const t = parseTarget(location.hash);
  const page = t?.page || root;
  const parent = page.parent || root;
  const sibs = parent.children || [];
  const idx = sibs.indexOf(page);
  const next = sibs[idx + dir];
  if (next) nav(next);
}

function openSidebar() { $('#sidebar')?.classList.add('open'); }
function openUtil() { $('#util')?.classList.add('open'); }

function wireKeyboard() {
  document.addEventListener('keydown', (e) => {
    // ignore when typing in inputs/textareas or a modifier is pressed
    const tag = (e.target && e.target.tagName) || '';
    if (/(INPUT|TEXTAREA|SELECT)/.test(tag)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    switch (e.key) {
      case 'j': e.preventDefault(); nextPrevHeading(+1); break;
      case 'k': e.preventDefault(); nextPrevHeading(-1); break;
      case 'J': e.preventDefault(); goSiblingPage(+1); break;
      case 'K': e.preventDefault(); goSiblingPage(-1); break;
      case '/': e.preventDefault(); openUtil(); $('#search')?.focus(); break;
      case '[': e.preventDefault(); openSidebar(); break;
      case 'Escape': closePanels(); break;
      case '?': {
        const o = $('#kb-overlay'); if (o) { o.hidden = !o.hidden; }
        break;
      }
    }
  });
}

/* ───────────────────────────── Theme (toggle + sync) ─────────────────────── */

function themeInit() {
  const btn = $('#theme-toggle');
  const rootEl = DOC.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  const stored = localStorage.getItem('km-theme'); // 'dark' | 'light' | null
  const cfg = (DEFAULT_THEME === 'dark' || DEFAULT_THEME === 'light') ? DEFAULT_THEME : null;
  let dark = stored ? (stored === 'dark') : (cfg ? cfg === 'dark' : media.matches);

  if (typeof ACCENT === 'string' && ACCENT) rootEl.style.setProperty('--color-accent', ACCENT);

  apply(dark);
  if (btn) {
    btn.setAttribute('aria-pressed', String(dark));
    btn.onclick = () => {
      dark = !dark; apply(dark);
      btn.setAttribute('aria-pressed', String(dark));
      localStorage.setItem('km-theme', dark ? 'dark' : 'light');
    };
  }

  media.addEventListener?.('change', (e) => {
    const hasUserPref = !!localStorage.getItem('km-theme');
    if (!hasUserPref && !cfg) {
      dark = e.matches; apply(dark);
    }
  });

  addEventListener('storage', (e) => {
    if (e.key === 'km-theme') {
      dark = e.newValue === 'dark'; apply(dark);
    }
  });

  function apply(isDark) {
    rootEl.style.setProperty('--color-main', isDark ? 'rgb(29,29,29)' : 'white');
    rootEl.setAttribute('data-theme', isDark ? 'dark' : 'light');
    ensureHLJSTheme();
    syncMermaidThemeWithPage();
  }
}

/* ───────────────────────────── Init ───────────────────────────── */

let inited = false;

export async function initUI() {
  if (inited) return;
  inited = true;

  await domReady();

  // Title
  $('#wiki-title-text') && ($('#wiki-title-text').textContent = TITLE);
  document.title = TITLE;

  // Sidebar tree
  buildTree();

  // Theme
  themeInit();

  // Mini graph: build lazily on first visibility
  const miniEl = $('#mini');
  if (miniEl) {
    new IntersectionObserver((entries, obs) => {
      if (entries[0]?.isIntersecting) {
        buildGraph();
        obs.disconnect();
      }
    }).observe(miniEl);
  }

  // Graph fullscreen toggle
  const expandBtn = $('#expand');
  if (expandBtn && miniEl) {
    expandBtn.onclick = () => {
      const full = miniEl.classList.toggle('fullscreen');
      expandBtn.setAttribute('aria-pressed', String(full));
      updateMiniViewport();
      requestAnimationFrame(() => highlightCurrent(true));
    };
  }

  // Panels toggles
  $('#sidebar-toggle')?.addEventListener('click', () => $('#sidebar')?.classList.toggle('open'));
  $('#util-toggle')?.addEventListener('click', () => $('#util')?.classList.toggle('open'));

  // Search wiring
  const si = $('#search');
  si?.addEventListener('input', () => search(si.value));
  $('#search-clear')?.addEventListener('click', () => { si.value = ''; search(''); si.focus(); });

  // Keyboard
  wireKeyboard();

  // Rebuild ToC whenever the main content is (re)rendered
  document.addEventListener('km:content-rendered', (e) => {
    const page = e?.detail?.page || parseTarget(location.hash)?.page || root;
    buildToc(page);
  });

  // Resize hook → keep graph viewBox correct
  addEventListener('resize', () => updateMiniViewport(), { passive: true });

  // Copy buttons in side panels (if any snippets there later)
  whenIdle(() => wireCopyButtons($('#util'), () => {
    const t = parseTarget(location.hash);
    return buildDeepURL(t?.page || root, '') || (baseURLNoHash() + '#');
  }));
}
