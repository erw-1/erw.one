/* eslint-env browser, es2022 */
import { $, el } from '../core/dom.js';
import { pages, root, hashOf } from '../model/bundle.js';

let d3;
export async function ensureD3() {
  if (d3) return d3;
  d3 = (await import('https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm')).default ?? (await import('https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm'));
  return d3;
}

export async function buildGraph(container = $('#mini-graph')) {
  await ensureD3();
  if (!container) return;
  container.innerHTML = '';
  const w = container.clientWidth || 300, h = container.clientHeight || 220;

  const nodes = pages.map((p,i) => ({ i, id: p.id, title: p.title || p.id, isRoot: p === root }));
  const links = [];
  pages.forEach(p => { if (p.parent) links.push({ source: p.parent.id, target: p.id }); });

  const svg = d3.select(container).append('svg').attr('width', w).attr('height', h);
  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(40))
    .force('charge', d3.forceManyBody().strength(-60))
    .force('center', d3.forceCenter(w/2, h/2));

  const gl = svg.append('g');
  gl.selectAll('line').data(links).enter().append('line').attr('stroke-width', 1);

  const gn = gl.selectAll('circle').data(nodes).enter().append('circle')
    .attr('r', d => d.isRoot ? 5 : 4)
    .attr('class', 'node')
    .on('click', (_,d) => location.hash = '#' + hashOf(pages.find(p=>p.id===d.id)));

  sim.on('tick', () => {
    gl.selectAll('line')
      .attr('x1', d => nodes.find(n=>n.id===d.source.id).x)
      .attr('y1', d => nodes.find(n=>n.id===d.source.id).y)
      .attr('x2', d => nodes.find(n=>n.id===d.target.id).x)
      .attr('y2', d => nodes.find(n=>n.id===d.target.id).y);
    gn.attr('cx', d => d.x).attr('cy', d => d.y);
  });

  return { svg, sim, nodes, links };
}

export function highlightCurrent(currentPage) {
  const id = currentPage?.id;
  const svg = $('#mini-graph svg'); if (!svg || !id) return;
  svg.querySelectorAll('circle').forEach(c => c.classList.toggle('is-active', c.__data__?.id === id));
}
