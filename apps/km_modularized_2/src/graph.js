/* eslint-env browser, es2022 */
'use strict';

import { DOC, $, el, __getVP } from './config_dom.js';
import { __model } from './model.js';

let svg, g, sim, nodesSel, linksSel;
let built = false;

const KM = (window.KM = window.KM || {});

function getAllPages() {
  // Flat list of pages excluding the invisible synthetic root
  return (__model?.pages || []).filter(p => p !== __model.root);
}

function buildData() {
  const pages = getAllPages();
  const nodes = pages.map(p => ({ id: p.id, hash: p.hash, title: p.title, isSecondary: !!p.isSecondary, _p: p }));
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const links = [];
  for (const p of pages) {
    if (p.parent && nodeById.has(p.parent.id)) {
      links.push({ source: p.id, target: p.parent.id });
    }
  }
  return { nodes, links, nodeById };
}

function sizeOf(container) {
  const r = container.getBoundingClientRect();
  return { w: Math.max(1, r.width || 1), h: Math.max(1, r.height || 1) };
}

function ensureSVG(container) {
  if (svg) return svg;
  svg = el('svg', { xmlns: 'http://www.w3.org/2000/svg', tabindex: '0', role: 'img', 'aria-label': 'Site graph' });
  g = el('g');
  svg.append(g);
  container.append(svg);
  return svg;
}

function nodeClass(d, currentHash) {
  const isCurrent = currentHash && d.hash === currentHash;
  return 'node' + (d.isSecondary ? ' secondary' : '') + (isCurrent ? ' current' : '');
}

function wireExpand(container) {
  const btn = $('#expand');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const on = !container.classList.contains('fullscreen');
    container.classList.toggle('fullscreen', on);
    btn.setAttribute('aria-pressed', String(on));
    updateMiniViewport();
    requestAnimationFrame(() => highlightCurrent(true));
  });
}

function currentPageHash() {
  const raw = (location.hash || '').slice(1);
  return raw.split('#')[0] || '';
}

async function draw() {
  const container = $('#mini');
  if (!container) return;

  ensureSVG(container);
  wireExpand(container);

  const { nodes, links, nodeById } = buildData();
  const d3 = KM.d3 || {};
  const {
    select, forceSimulation, forceLink, forceManyBody, forceCenter, drag
  } = d3;

  if (!forceSimulation) {
    // D3 not ready; show simple list fallback
    g.innerHTML = '';
    const list = el('foreignObject', { width: '100%', height: '100%' }, [
      el('div', { xmlns: 'http://www.w3.org/1999/xhtml', class: 'graph-fallback' })
    ]);
    const host = list.querySelector('div');
    nodes.slice(0, 50).forEach(n => {
      const a = el('a', { href: '#' + n.hash, textContent: n.title });
      host.append(a);
    });
    g.append(list);
    return;
  }

  select(g).selectAll('*').remove();

  linksSel = select(g).append('g').attr('class', 'links')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke-linecap', 'round');

  nodesSel = select(g).append('g').attr('class', 'nodes')
    .selectAll('circle')
    .data(nodes, d => d.id)
    .join('circle')
    .attr('r', 4)
    .attr('class', d => nodeClass(d, currentPageHash()))
    .on('click', (_, d) => { location.hash = '#' + (d.hash || ''); })
    .call(drag()
      .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
    );

  sim?.stop();
  sim = forceSimulation(nodes)
    .force('link', forceLink(links).id(d => d.id).distance(35).strength(0.12))
    .force('charge', forceManyBody().strength(-40))
    .force('center', forceCenter(0, 0))
    .on('tick', () => {
      linksSel
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      nodesSel
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);
    });

  // Fit graph into viewBox
  fitToViewBox(nodes);

  // Keyboard focus handling
  svg.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const cur = getCurrentNode(nodeById);
    if (cur) { e.preventDefault(); location.hash = '#' + (cur.hash || ''); }
  }, { capture: true });

  built = true;
  highlightCurrent(true);
}

function fitToViewBox(nodes) {
  const { w, h } = sizeOf(svg);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));

  // Reset transform then compute bounds
  g.setAttribute('transform', 'translate(' + (w / 2) + ',' + (h / 2) + ')');
  if (!nodes?.length) { svg.setAttribute('viewBox', `0 0 ${w} ${h}`); return; }

  const xs = nodes.map(n => n.x || 0);
  const ys = nodes.map(n => n.y || 0);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  const pad = 30;
  const vbW = Math.max(1, (maxX - minX) + pad * 2);
  const vbH = Math.max(1, (maxY - minY) + pad * 2);
  const vbX = minX - pad, vbY = minY - pad;

  svg.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
}

function getCurrentNode(nodeById) {
  const h = currentPageHash();
  const page = getAllPages().find(p => p.hash === h);
  if (!page) return null;
  const id = page.id;
  if (nodeById?.get) return nodeById.get(id);
  // fallback when nodeById not provided
  const datum = nodesSel?.data()?.find?.(d => d.id === id);
  return datum || null;
}

// ───────────────────────────── public API ─────────────────────────────
export async function buildGraph() {
  const container = $('#mini');
  if (!container) return;
  try { await KM.ensureD3?.(); } catch {}
  draw();
}

export function updateMiniViewport() {
  const container = $('#mini');
  if (!container || !svg) return;
  const { __VPW, __VPH } = __getVP();
  const { w, h } = container.classList.contains('fullscreen')
    ? { w: __VPW, h: __VPH }
    : sizeOf(container);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  fitToViewBox(nodesSel?.data?.() || []);
}

export function highlightCurrent(centerOn = false) {
  if (!built || !nodesSel) return;

  const hash = currentPageHash();
  nodesSel.attr('class', d => nodeClass(d, hash));

  if (!centerOn) return;

  // Center current node if visible
  const d = nodesSel.data().find(n => n.hash === hash);
  if (!d) return;

  // Translate viewBox to keep current node near the center
  const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
  const { w, h } = sizeOf(svg);
  const curX = d.x || 0, curY = d.y || 0;
  if (vb.length === 4) {
    const [x, y, vw, vh] = vb;
    const nx = curX - vw / 2;
    const ny = curY - vh / 2;
    svg.setAttribute('viewBox', `${nx} ${ny} ${vw} ${vh}`);
    g.setAttribute('transform', `translate(${w / 2},${h / 2})`);
  }
}

// Keep classes for theming
DOC.addEventListener('DOMContentLoaded', () => {
  const styleId = 'graph-inline-style';
  if (document.getElementById(styleId)) return;
  const s = el('style', { id: styleId, textContent: `
  #mini svg { width: 100%; height: 100%; }
  #mini .links line { stroke: var(--graph-link, #999); opacity: .4; }
  #mini .nodes .node { fill: var(--graph-node, #666); cursor: pointer; }
  #mini .nodes .node.secondary { opacity: .6; }
  #mini .nodes .node.current { fill: var(--color-accent, #06f); r: 5; }
  #mini.fullscreen { position: fixed; inset: 0; z-index: 50; background: var(--bg, #fff); }
  #expand[aria-pressed="true"] { outline: 2px solid var(--color-accent, #06f); }
  `});
  document.head.appendChild(s);
});
