/* eslint-env browser, es2022 */
'use strict';

/**
 * ui.js
 *  - Sidebar tree (expand/collapse + active highlight)
 *  - Header bits (title sync, theme toggle)
 *  - Search (client-side across heading sections)
 *  - TOC for current page (anchors)
 *  - Optional mini graph (if #graph canvas exists)
 *
 * Exported API:
 *   init({ data: { root, hashOf, nav } })
 *   onRoute(page, anchor)  // keep UI in sync with router
 */

import { $, $$, el, on, whenIdle, clearSelection } from './dom.js';
import { CFG, pages as ALL_PAGES } from './data.js';

let ctx = null;
let ROOT = null;
let hashOf = null;
let nav = null;

let $tree, $toc, $results, $search, $headerTitle, $graph;

/* ─────────────────────────────── init ──────────────────────────────────── */
export async function init(incoming) {
  ctx = incoming || {};
  ROOT = ctx.data?.root || null;
  hashOf = ctx.data?.hashOf || ((p) => p?.hash ?? '');
  nav = ctx.data?.nav || ((p) => (location.hash = '#' + hashOf(p)));

  // Cache common nodes if present (all optional, code no-ops if missing)
  $tree = $('#tree');
  $toc = $('#toc');
  $results = $('#results');
  $search = $('#search');
  $headerTitle = $('#header-title');
  $graph = $('#graph');

  // Header title / document title
  if (CFG?.TITLE && $headerTitle) $headerTitle.textContent = CFG.TITLE;
  if (CFG?.TITLE && !document.title) document.title = CFG.TITLE;

  // Theme toggle (expects a button with [data-theme-toggle])
  setupThemeToggle();

  // Sidebar tree
  if ($tree && ROOT) buildTree($tree, ROOT);

  // Search wiring (input#search and container#results)
  if ($search && $results) setupSearch($search, $results);

  // Optional small relationship graph if a <canvas id="graph"> exists
  if ($graph && ROOT && $graph.tagName === 'CANVAS') whenIdle(() => drawGraph($graph, ROOT));

  // Delegate clicks for links with data-nav (optional convenience)
  on(document, 'click', '[data-nav]', (ev, a) => {
    ev.preventDefault();
    const id = a.getAttribute('data-nav');
    const page = findById(id);
    if (page) nav(page);
  });
}

/* ────────────────────────────── onRoute ────────────────────────────────── */
export function onRoute(page, anchor) {
  if (!page) return;
  // Sidebar: mark active + expand branch
  if ($tree) markActiveInTree(page);

  // TOC: rebuild for current page
  if ($toc) buildTOC($toc, page, anchor);

  // If a search result was clicked, clear selection to avoid weird focus styles
  clearSelection();
}

/* ──────────────────────────── Sidebar Tree ─────────────────────────────── */
function buildTree(container, root) {
  container.innerHTML = '';
  container.append(renderNode(root, { depth: 0, isRoot: true }));

  // Toggle handlers
  on(container, 'click', '.km-toggle', (_ev, btn) => {
    const li = btn.closest('li');
    if (!li) return;
    const open = li.getAttribute('aria-expanded') === 'true';
    li.setAttribute('aria-expanded', open ? 'false' : 'true');
  });

  // Navigation
  on(container, 'click', '.km-node', (ev, a) => {
    ev.preventDefault();
    const id = a.getAttribute('data-id');
    const page = findById(id);
    if (page) nav(page);
  });
}

function renderNode(node, { depth, isRoot }) {
  const hasKids = (node.children || []).length > 0;
  const li = el('li', {
    class: `km-li depth-${depth}` + (isRoot ? ' km-root' : ''),
    'aria-expanded': hasKids ? 'true' : null
  });

  if (hasKids) {
    li.append(
      el('button', { class: 'km-toggle', title: 'Expand/collapse', 'aria-label': 'Toggle' }, '▸')
    );
  } else {
    li.append(el('span', { class: 'km-spacer' }, '•'));
  }

  li.append(
    el('a', {
      class: 'km-node',
      href: '#' + hashOf(node),
      'data-id': node.id
    }, node.title || node.id)
  );

  if (hasKids) {
    const ul = el('ul', { class: 'km-ul' });
    for (const c of node.children) {
      ul.append(renderNode(c, { depth: depth + 1 }));
    }
    li.append(ul);
  }
  return (isRoot ? el('ul', { class: 'km-ul km-tree' }, [li]) : li);
}

function markActiveInTree(page) {
  if (!$tree) return;
  // Remove previous active
  $$('.km-node.active', $tree).forEach(a => a.classList.remove('active'));

  // Add active and expand ancestors
  const ids = [];
  for (let n = page; n; n = n.parent) ids.unshift(n.id);
  // Query all links and match by data-id
  ids.forEach((id, i) => {
    const a = $(`.km-node[data-id="${cssEscape(id)}"]`, $tree);
    if (!a) return;
    if (i === ids.length - 1) a.classList.add('active');
    const li = a.closest('li[km-li], li') || a.closest('li');
    (li || a.closest('li'))?.setAttribute?.('aria-expanded', 'true');
    // Also expand the parent li
    const pli = li?.parentElement?.closest?.('li');
    pli?.setAttribute?.('aria-expanded', 'true');
    // Ensure visibility
    a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}

/* ──────────────────────────────── TOC ──────────────────────────────────── */
function buildTOC(container, page, currentAnchor) {
  container.innerHTML = '';
  const secs = page.sections || [];
  if (!secs.length) {
    container.append(el('div', { class: 'km-toc-empty' }, 'No headings on this page.'));
    return;
  }

  const ul = el('ul', { class: 'km-toc' });
  for (const s of secs) {
    const a = el('a', {
      href: '#' + hashOf(page) + (s.id ? '#' + s.id : ''),
      class: 'km-toc-link' + (currentAnchor === s.id ? ' active' : ''),
      'data-page-id': page.id,
      'data-anchor': s.id || ''
    }, s.txt || s.id);
    ul.append(el('li', null, a));
  }
  container.append(ul);

  // Delegate clicks to avoid full navigation reflow
  on(container, 'click', 'a.km-toc-link', (ev, a) => {
    ev.preventDefault();
    const pid = a.getAttribute('data-page-id');
    const pageNode = findById(pid);
    const anchor = a.getAttribute('data-anchor');
    if (pageNode) location.hash = '#' + hashOf(pageNode) + (anchor ? '#' + anchor : '');
  });
}

/* ──────────────────────────────── Search ───────────────────────────────── */
let SEARCH_INDEX = null;

function setupSearch($input, $out) {
  buildSearchIndexOnce();

  const run = () => {
    const q = ($input.value || '').trim().toLowerCase();
    $out.innerHTML = '';
    if (!q) return;

    const results = search(q, 60); // cap results
    if (!results.length) {
      $out.append(el('div', { class: 'km-nores' }, 'No results.'));
      return;
    }
    const list = el('ul', { class: 'km-results' });
    for (const r of results) {
      list.append(renderResult(r));
    }
    $out.append(list);
  };

  $input.addEventListener('input', run);
  // Enter → go to first result
  $input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      const first = $('.km-results a', $out);
      if (first) {
        ev.preventDefault();
        first.click();
      }
    }
  });
}

function buildSearchIndexOnce() {
  if (SEARCH_INDEX) return;
  const rows = [];
  for (const p of ALL_PAGES) {
    const secs = p.sections && p.sections.length ? p.sections : [{
      id: '',
      txt: p.title || p.id,
      body: (p.content || '').slice(0, 10_000),
      search: ((p.title || p.id) + ' ' + (p.content || '')).toLowerCase()
    }];
    for (const s of secs) {
      rows.push({
        page: p,
        sec: s,
        text: s.search || ((s.txt + ' ' + s.body).toLowerCase())
      });
    }
  }
  SEARCH_INDEX = rows;
}

function search(q, limit = 50) {
  // naive AND search on tokens
  const toks = q.split(/\s+/).filter(Boolean);
  const out = [];
  for (const row of SEARCH_INDEX) {
    let ok = true;
    for (const t of toks) {
      if (!row.text.includes(t)) { ok = false; break; }
    }
    if (ok) out.push(scoreRow(row, toks));
    if (out.length >= limit) break;
  }
  // sort by simple score desc
  out.sort((a, b) => b.score - a.score);
  return out;
}

function scoreRow(row, toks) {
  // simple score: sum of term frequencies (title hits weigh more)
  const hayTitle = (row.sec.txt || '').toLowerCase();
  const hay = row.text;
  let score = 0;
  for (const t of toks) {
    const re = new RegExp(escapeRegex(t), 'g');
    score += (hay.match(re)?.length || 0);
    score += (hayTitle.match(re)?.length || 0) * 2;
  }
  return { ...row, score };
}

function renderResult(r) {
  const url = '#' + hashOf(r.page) + (r.sec.id ? '#' + r.sec.id : '');
  const title = (r.page.title || r.page.id) + (r.sec.txt ? ' — ' + r.sec.txt : '');
  const snip = snippet(r.sec.body || '', r.text, 160);

  const a = el('a', { href: url }, title);
  a.addEventListener('click', (ev) => {
    ev.preventDefault();
    location.hash = url;
  });

  return el('li', { class: 'km-result' }, [
    el('div', { class: 'km-result-title' }, a),
    el('div', { class: 'km-result-snip' }, snip)
  ]);
}

/* ─────────────────────────────── Graph (mini) ──────────────────────────── */
/** Simple radial tree plot; nodes clickable. */
function drawGraph(canvas, root) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || 240;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const cx = canvas.getContext('2d');
  cx.scale(dpr, dpr);
  cx.clearRect(0, 0, w, h);

  // BFS to collect nodes with depth
  const nodes = [];
  const edges = [];
  const q = [{ n: root, d: 0, parent: null }];
  const maxDepth = 6;
  while (q.length) {
    const { n, d, parent } = q.shift();
    nodes.push({ n, d });
    if (parent) edges.push([parent, n]);
    if (d < maxDepth) for (const c of n.children || []) q.push({ n: c, d: d + 1, parent: n });
  }

  const byDepth = new Map();
  for (const it of nodes) (byDepth.get(it.d) || byDepth.set(it.d, []).get(it.d)).push(it);

  // Layout: circles per depth
  const R0 = 24;
  const step = Math.min(w, h) / (2 * (Math.max(...[...byDepth.keys()]) + 2));
  const center = { x: w / 2, y: h / 2 };
  const positions = new Map();

  for (const [d, arr] of byDepth) {
    const r = R0 + d * step;
    const k = arr.length;
    for (let i = 0; i < k; i++) {
      const theta = (i / k) * Math.PI * 2;
      const x = center.x + r * Math.cos(theta);
      const y = center.y + r * Math.sin(theta);
      positions.set(arr[i].n, { x, y });
    }
  }

  // Draw edges
  cx.lineWidth = 1;
  cx.strokeStyle = '#888';
  for (const [a, b] of edges) {
    const pa = positions.get(a), pb = positions.get(b);
    if (!pa || !pb) continue;
    cx.beginPath(); cx.moveTo(pa.x, pa.y); cx.lineTo(pb.x, pb.y); cx.stroke();
  }

  // Draw nodes
  cx.fillStyle = '#222';
  for (const { n } of nodes) {
    const p = positions.get(n);
    cx.beginPath(); cx.arc(p.x, p.y, 4, 0, Math.PI * 2); cx.fill();
  }

  // Hit map for clicks
  const pick = (x, y) => {
    let hit = null, best = 9e9;
    for (const { n } of nodes) {
      const p = positions.get(n);
      const dx = p.x - x, dy = p.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best && d2 < 9 * 9) { best = d2; hit = n; }
    }
    return hit;
  };

  canvas.addEventListener('click', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const n = pick(x, y);
    if (n) nav(n);
  });
}

/* ─────────────────────────────── Utilities ─────────────────────────────── */
function cssEscape(s) {
  // minimal css.escape
  return String(s).replace(/["\\]/g, '\\$&');
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function stripTags(s) {
  const div = el('div'); div.innerHTML = s; return div.textContent || '';
}
function snippet(body, hay, max = 160) {
  const plain = stripTags(body).replace(/\s+/g, ' ').trim();
  if (!plain) return '';
  const q = hay.split(/\s+/)[0] || '';
  const i = q ? plain.toLowerCase().indexOf(q.toLowerCase()) : -1;
  const start = Math.max(0, (i > 40 ? i - 40 : 0));
  const end = Math.min(plain.length, start + max);
  let out = plain.slice(start, end);
  if (start > 0) out = '…' + out;
  if (end < plain.length) out += '…';
  // light highlight (first token only)
  if (q) out = out.replace(new RegExp(escapeRegex(q), 'ig'), m => `<mark>${m}</mark>`);
  const span = el('span'); span.innerHTML = out; return span;
}
function findById(id) {
  // quick direct lookup by id across parsed pages
  for (const p of ALL_PAGES) if (p.id === id) return p;
  return null;
}

/* ───────────────────────────── Theme toggle ────────────────────────────── */
function setupThemeToggle() {
  const btn = $('[data-theme-toggle]');
  if (!btn) return;

  const key = 'km:theme';
  const apply = (t) => {
    if (!t) return;
    document.documentElement.setAttribute('data-theme', t);
  };

  // load stored
  const stored = localStorage.getItem(key) || CFG?.DEFAULT_THEME || '';
  if (stored) apply(stored);

  btn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    const nxt = cur === 'dark' ? 'light' : 'dark';
    apply(nxt);
    localStorage.setItem(key, nxt);
  });
}
