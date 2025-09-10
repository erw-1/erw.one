/* eslint-env browser, es2022 */
import { $, DOC } from '../core/dom.js';
import { pages, root, find, hashOf } from '../model/bundle.js';

/* ───────────────────────────── mini graph (D3) ─────────────────────────── */
const IDS = {
  current: 'node_current',
  parent: 'node_parent',
  leaf: 'node_leaf',
  hierPRE: 'link_hier',
  tagPRE: 'link_tag',
  label: 'graph_text'
};

let d3 = null;
export async function ensureD3() {
  if (d3) return d3;
  const [sel, force, drag] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/d3-selection@3.0.0/+esm'),
    import('https://cdn.jsdelivr.net/npm/d3-force@3.0.0/+esm'),
    import('https://cdn.jsdelivr.net/npm/d3-drag@3.0.0/+esm')
  ]);
  d3 = {
    select: sel.select,
    selectAll: sel.selectAll,
    forceSimulation: force.forceSimulation,
    forceLink: force.forceLink,
    forceManyBody: force.forceManyBody,
    forceCenter: force.forceCenter,
    drag: drag.drag,
  };
  return d3;
}

const graphs = {};
let CURRENT = -1;

/** Return current <svg>#mini size (fullscreen aware) */
function getMiniSize() {
  const svg = $('#mini');
  if (!svg) return { w: 400, h: 300 };
  if (svg.classList.contains('fullscreen')) return { w: innerWidth, h: innerHeight };
  const r = svg.getBoundingClientRect();
  return { w: Math.max(1, r.width | 0), h: Math.max(1, r.height | 0) };
}

/** Count all descendants of a page. */
function descendants(page) {
  let n = 0;
  (function rec(x) { x.children.forEach(c => { n++; rec(c); }); })(page);
  return n;
}

/** Update the mini graph viewport and recentre the simulation. */
let _miniKick = 0;
export function updateMiniViewport() {
  if (!graphs.mini) return;
  const { svg, sim } = graphs.mini;
  const { w, h } = getMiniSize();
  graphs.mini.w = w;
  graphs.mini.h = h;
  svg.attr('viewBox', `0 0 ${w} ${h}`)
     .attr('width', w)
     .attr('height', h)
     .attr('preserveAspectRatio', 'xMidYMid meet');
  sim.force('center', d3.forceCenter(w / 2, h / 2));
  clearTimeout(_miniKick);
  _miniKick = setTimeout(() => { sim.alpha(0.2).restart(); }, 50);
}

/** Build nodes/links for the visualization. */
function buildGraphData() {
  const nodes = [], links = [], adj = new Map(), hierPairs = new Set();
  const touch = (a, b) => {
    (adj.get(a) || adj.set(a, new Set()).get(a)).add(b);
    (adj.get(b) || adj.set(b, new Set()).get(b)).add(a);
  };
  const tierOf = n => n < 3 ? 1 : n < 6 ? 2 : n < 11 ? 3 : n < 21 ? 4 : 5;

  pages.forEach((p, i) => {
    p._i = i;
    nodes.push({ id: i, label: p.title, ref: p });
  });

  // Hierarchical edges (unique per parent<->child)
  pages.forEach(p => {
    if (!p.parent) return;
    if (p.isSecondary && p.parent === root) return; // reduce noise for promoted reps
    const a = p._i, b = p.parent._i;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    links.push({ source: a, target: b, shared: 0, kind: 'hier', tier: tierOf(descendants(p)) });
    hierPairs.add(key);
    touch(a, b);
  });

  // Tag ties (pair counts as weights)
  const tagToPages = new Map();
  pages.forEach(p => {
    for (const t of p.tagsSet || []) {
      if (!tagToPages.has(t)) tagToPages.set(t, []);
      tagToPages.get(t).push(p._i);
    }
  });
  const shared = new Map();
  const MAX_PER_TAG = 80;
  for (const arr0 of tagToPages.values()) {
    const arr = arr0.slice(0, MAX_PER_TAG);
    for (let x = 0; x < arr.length; x++) {
      for (let y = x + 1; y < arr.length; y++) {
        const i = arr[x], j = arr[y];
        const key = i < j ? `${i}|${j}` : `${j}|${i}`;
        shared.set(key, (shared.get(key) || 0) + 1);
      }
    }
  }
  for (const [key, count] of shared) {
    if (count < 2) continue;               // drop weak ties
    if (hierPairs.has(key)) continue;      // don't double up with hierarchy
    const [i, j] = key.split('|').map(Number);
    links.push({ source: i, target: j, shared: count, kind: 'tag' });
    touch(i, j);
  }

  return { nodes, links, adj };
}

/** Build the mini force-directed graph lazily on first visibility. */
export async function buildGraph() {
  await ensureD3();
  if (graphs.mini) return; // idempotent

  const { nodes, links, adj } = buildGraphData();
  const svg = d3.select('#mini');
  const { w: W, h: H } = getMiniSize();
  svg.attr('viewBox', `0 0 ${W} ${H}`)
     .attr('width', W)
     .attr('height', H)
     .attr('preserveAspectRatio', 'xMidYMid meet');

  const localN = nodes.map(n => ({ ...n }));
  const localL = links.map(l => ({ ...l }));

  const sim = d3.forceSimulation(localN)
    .force('link', d3.forceLink(localL).id(d => d.id).distance(80))
    .force('charge', d3.forceManyBody().strength(-240))
    .force('center', d3.forceCenter(W / 2, H / 2));

  const view = svg.append('g').attr('class', 'view');

  const link = view.append('g').selectAll('line')
    .data(localL).join('line')
    .attr('id', d => d.kind === 'hier' ? IDS.hierPRE + d.tier : IDS.tagPRE + Math.min(d.shared, 5));

  const wireNode = sel => sel
    .attr('r', 6)
    .attr('id', d => d.ref.children.length ? IDS.parent : IDS.leaf)
    .on('click', (e, d) => { location.hash = '#' + hashOf(d.ref); })
    .on('mouseover', (e, d) => fade(d.id, 0.15))
    .on('mouseout', () => fade(null, 1))
    .call(d3.drag()
      .on('start', (e, d) => { d.fx = d.x; d.fy = d.y; })
      .on('drag',  (e, d) => { sim.alphaTarget(0.25).restart(); d.fx = e.x; d.fy = e.y; })
      .on('end',   (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = d.fy = null; }));

  const node = wireNode(view.append('g').selectAll('circle').data(localN).join('circle'));

  const label = view.append('g').selectAll('text')
    .data(localN).join('text')
    .attr('id', IDS.label)
    .attr('font-size', 10)
    .attr('pointer-events', 'none')
    .text(d => d.label);

  function fade(id, o) {
    node.style('opacity', d => (id == null || graphs.mini.adj.get(id)?.has(d.id) || d.id === id) ? 1 : o);
    label.style('opacity', d => (id == null || graphs.mini.adj.get(id)?.has(d.id) || d.id === id) ? 1 : o);
    link.style('opacity', l => id == null || l.source.id === id || l.target.id === id ? 1 : o);
  }

  sim.on('tick', () => {
    link
      .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node.attr('cx', d => d.x).attr('cy', d => d.y);
    label.attr('x', d => d.x + 8).attr('y', d => d.y + 3);
  });

  graphs.mini = { svg, node, label, sim, view, adj, w: W, h: H };
  observeMiniResize();
}

/** Highlight the current page’s node and pull it towards the center. */
export function highlightCurrent(force = false) {
  if (!graphs.mini) return;
  const seg = location.hash.slice(1).split('#').filter(Boolean);
  const pg = find(seg);
  const id = pg?._i ?? -1;
  if (id === CURRENT && !force) return;

  const g = graphs.mini;
  g.node
    .attr('id', d => d.id === id ? IDS.current : (d.ref.children.length ? IDS.parent : IDS.leaf))
    .attr('r', d => d.id === id ? 8 : 6);
  g.label.classed('current', d => d.id === id);

  const cx = g.w / 2, cy = g.h / 2;
  g.node.filter(d => d.id === id).each(d => {
    const dx = cx - d.x, dy = cy - d.y;
    g.view.attr('transform', `translate(${dx},${dy})`);
    const k = 0.10;
    d.vx += (cx - d.x) * k;
    d.vy += (cy - d.y) * k;
  });

  g.sim.alphaTarget(0.15).restart();
  setTimeout(() => g.sim.alphaTarget(0), 250);
  CURRENT = id;
}

/** Keep mini-graph responsive to container size and fullscreen changes. */
function observeMiniResize() {
  const elx = $('#mini');
  if (!elx) return;
  new ResizeObserver(() => {
    if (!graphs.mini) return;
    updateMiniViewport();
    highlightCurrent(true);
  }).observe(elx);
}
