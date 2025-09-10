// ui.js

import { $, $$, el, clearSelection, baseURLNoHash, HEADINGS_SEL, wireCopyButtons } from './helpers.js';
import * as d3Sel from 'https://cdn.jsdelivr.net/npm/d3-selection@3.0.0/+esm';
import * as d3Force from 'https://cdn.jsdelivr.net/npm/d3-force@3.0.0/+esm';
import * as d3Drag from 'https://cdn.jsdelivr.net/npm/d3-drag@3.0.0/+esm';
const d3 = {
    select: d3Sel.select,
    selectAll: d3Sel.selectAll,
    forceSimulation: d3Force.forceSimulation,
    forceLink: d3Force.forceLink,
    forceManyBody: d3Force.forceManyBody,
    forceCenter: d3Force.forceCenter,
    drag: d3Drag.drag
};
import { pages, root, parseTarget, hashOf, find, nav, search as searchData, TITLE, DEFAULT_THEME, ACCENT } from './data.js';
import { renderPage } from './render.js';

const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
function sortByTitle(a, b) { return collator.compare(a.title, b.title); }

// Side navigation (sidebar) logic
export function buildTree() {
    const treeEl = $('#tree');
    if (!treeEl) return;
    treeEl.setAttribute('role', 'tree');
    treeEl.innerHTML = '';
    const prim = root.children.filter(c => !c.isSecondary);
    const secs = root.children.filter(c => c.isSecondary).sort((a,b)=>a.clusterId - b.clusterId);
    const buildList = (nodes, container, depth=0) => {
        nodes.forEach(p => {
            const li = el('li');
            if (p.children.length) {
                const open = depth < 2;
                li.className = 'folder' + (open ? ' open' : '');
                const groupId = `group-${p.id}`;
                const caret = el('button', {
                    type: 'button',
                    class: 'caret',
                    'aria-expanded': String(open),
                    'aria-controls': groupId,
                    'aria-label': open ? 'Collapse' : 'Expand'
                });
                const label = el('a', {
                    class: 'lbl',
                    dataset: { page: p.id },
                    href: '#' + hashOf(p),
                    textContent: p.title
                });
                const sub = el('ul', {
                    id: groupId,
                    role: 'group',
                    style: `display:${open?'block':'none'}`
                });
                li.setAttribute('role', 'treeitem');
                li.setAttribute('aria-expanded', String(open));
                li.append(caret, label, sub);
                container.append(li);
                buildList(p.children, sub, depth+1);
            } else {
                li.className = 'article';
                li.setAttribute('role', 'treeitem');
                li.append(el('a', {
                    dataset: { page: p.id },
                    href: '#' + hashOf(p),
                    textContent: p.title
                }));
                container.append(li);
            }
        });
    };
    const frag = document.createDocumentFragment();
    buildList(prim, frag);
    secs.forEach(r => {
        const sep = el('div', {
            class: 'group-sep',
            role: 'presentation',
            'aria-hidden': 'true'
        }, [el('hr', { role: 'presentation', 'aria-hidden': 'true' })]);
        frag.append(sep);
        buildList([r], frag);
    });
    treeEl.append(frag);
}

export function highlightSidebar(page) {
    $('#tree .sidebar-current')?.classList.remove('sidebar-current');
    const link = $(`#tree a[data-page="${page.id}"]`);
    if (!link) return;
    link.classList.add('sidebar-current');
    let li = link.closest('li');
    while (li) {
        if (li.classList.contains('folder')) {
            setFolderOpen(li, true);
        }
        li = li.parentElement?.closest('li');
    }
    const tree = $('#tree');
    if (tree && link) {
        const r = link.getBoundingClientRect();
        const tr = tree.getBoundingClientRect();
        requestAnimationFrame(() => {
            if (r.top < tr.top || r.bottom > tr.bottom) {
                link.scrollIntoView({ block: 'nearest' });
            }
        });
    }
}

export function setFolderOpen(li, open) {
    if (!li) return;
    li.classList.toggle('open', !!open);
    li.setAttribute('aria-expanded', String(!!open));
    const caret = li.querySelector('button.caret');
    if (caret) {
        caret.setAttribute('aria-expanded', String(!!open));
        caret.setAttribute('aria-label', !!open ? 'Collapse' : 'Expand');
    }
    const sub = li.querySelector('ul[role="group"]');
    if (sub) sub.style.display = !!open ? 'block' : 'none';
}

export function closePanels() {
    $('#sidebar')?.classList.remove('open');
    $('#util')?.classList.remove('open');
}

function togglePanel(selector) {
    const elp = $(selector);
    if (!elp) return;
    const wasOpen = elp.classList.contains('open');
    closePanels();
    if (!wasOpen) {
        elp.classList.add('open');
        if (!elp.querySelector('.panel-close')) {
            elp.append(el('button', {
                type: 'button',
                class: 'panel-close',
                'aria-label': 'Close panel',
                textContent: '✕',
                onclick: () => { closePanels(); }
            }));
        }
    }
}

// Breadcrumb (header navigation)
export function breadcrumb(page) {
    const dyn = $('#crumb-dyn');
    if (!dyn) return;
    dyn.innerHTML = '';
    const chain = [];
    for (let n = page; n; n = n.parent) {
        chain.unshift(n);
    }
    if (chain.length) chain.shift();
    chain.forEach((n, i) => {
        if (i) dyn.insertAdjacentHTML('beforeend', '<span class="separator">▸</span>');
        const wrap = el('span', { class: 'dropdown' });
        const a = el('a', { textContent: n.title, href: '#' + hashOf(n) });
        if (n === page) a.className = 'crumb-current';
        wrap.append(a);
        const siblings = n.parent.children.filter(s => s !== n);
        if (siblings.length) {
            const ul = el('ul');
            siblings.forEach(s => {
                ul.append(el('li', { textContent: s.title, onclick: () => nav(s) }));
            });
            wrap.append(ul);
        }
        dyn.append(wrap);
    });
    if (page.children.length) {
        const box = el('span', { class: 'childbox' }, [
            el('span', { class: 'toggle', textContent: '▾' }),
            el('ul')
        ]);
        const ul = box.querySelector('ul');
        page.children.sort(sortByTitle).forEach(ch => {
            ul.append(el('li', {
                textContent: ch.title,
                onclick: () => nav(ch)
            }));
        });
        dyn.append(box);
    }
}

// Theme toggling
function initTheme() {
    const btn = $('#theme-toggle');
    const rootEl = document.documentElement;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const stored = localStorage.getItem('km-theme');
    const cfg = (DEFAULT_THEME === 'dark' || DEFAULT_THEME === 'light') ? DEFAULT_THEME : null;
    let dark = stored ? (stored === 'dark') : (cfg ? (cfg === 'dark') : media.matches);
    if (ACCENT) rootEl.style.setProperty('--color-accent', ACCENT);
    applyTheme(dark);
    if (btn) {
        btn.setAttribute('aria-pressed', String(dark));
        btn.onclick = () => {
            dark = !dark;
            applyTheme(dark);
            btn.setAttribute('aria-pressed', String(dark));
            localStorage.setItem('km-theme', dark ? 'dark' : 'light');
        };
    }
    media.addEventListener('change', (e) => {
        const hasUserPref = !!localStorage.getItem('km-theme');
        if (!hasUserPref && !cfg) {
            dark = e.matches;
            applyTheme(dark);
        }
    });
    window.addEventListener('storage', (e) => {
        if (e.key === 'km-theme') {
            dark = e.newValue === 'dark';
            applyTheme(dark);
        }
    });
    function applyTheme(isDark) {
        rootEl.style.setProperty('--color-main', isDark ? 'rgb(29,29,29)' : 'white');
        rootEl.setAttribute('data-theme', isDark ? 'dark' : 'light');
        // Optionally hook syntax/theme functions if needed.
    }
}

// Mini graph (D3)
const IDS = {
    current: 'node_current',
    parent: 'node_parent',
    leaf: 'node_leaf',
    hierPRE: 'link_hier',
    tagPRE: 'link_tag'
};
let graphs = {};
let CURRENT = -1;

function getMiniSize() {
    const svg = $('#mini');
    if (!svg) return { w: 400, h: 300 };
    if (svg.classList.contains('fullscreen')) return { w: window.innerWidth, h: window.innerHeight };
    const r = svg.getBoundingClientRect();
    return { w: Math.max(1, r.width | 0), h: Math.max(1, r.height | 0) };
}

function updateMiniViewport() {
    if (!graphs.mini) return;
    const { svg, sim } = graphs.mini;
    const { w, h } = getMiniSize();
    graphs.mini.w = w;
    graphs.mini.h = h;
    svg.attr('viewBox', `0 0 ${w} ${h}`).attr('width', w).attr('height', h).attr('preserveAspectRatio', 'xMidYMid meet');
    sim.force('center', d3.forceCenter(w / 2, h / 2));
    setTimeout(() => { sim.alpha(0.2).restart(); }, 50);
}

function buildGraphData() {
    const nodes = [], links = [], adj = new Map(), hierPairs = new Set();
    const touch = (a, b) => {
        (adj.get(a) || adj.set(a, new Set()).get(a)).add(b);
        (adj.get(b) || adj.set(b, new Set()).get(b)).add(a);
    };
    const tierOf = n => n < 3 ? 1 : n < 6 ? 2 : n < 11 ? 3 : n < 21 ? 4 : 5;
    pages.forEach((p,i) => {
        p._i = i;
        nodes.push({ id: i, label: p.title, ref: p });
    });
    pages.forEach(p => {
        if (!p.parent) return;
        if (p.isSecondary && p.parent === root) return;
        const a = p._i, b = p.parent._i;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        links.push({ source: a, target: b, shared: 0, kind: 'hier', tier: tierOf(p.children.length) });
        hierPairs.add(key);
        touch(a, b);
    });
    const tagToPages = new Map();
    pages.forEach(p => {
        for (const t of p.tagsSet) {
            if (!tagToPages.has(t)) tagToPages.set(t, []);
            tagToPages.get(t).push(p._i);
        }
    });
    const shared = new Map();
    const MAX_PER_TAG = 80;
    for (const arr0 of tagToPages.values()) {
        const arr = arr0.slice(0, MAX_PER_TAG);
        for (let x = 0; x < arr.length; x++) {
            for (let y = x+1; y < arr.length; y++) {
                const i = arr[x], j = arr[y];
                const key = i < j ? `${i}|${j}` : `${j}|${i}`;
                shared.set(key, (shared.get(key) || 0) + 1);
            }
        }
    }
    for (const [key, count] of shared) {
        if (count < 2) continue;
        if (hierPairs.has(key)) continue;
        const [i, j] = key.split('|').map(Number);
        links.push({ source: i, target: j, shared: count, kind: 'tag' });
        touch(i, j);
    }
    return { nodes, links, adj };
}

async function buildGraph() {
    if (graphs.mini) return;
    const { nodes, links, adj } = buildGraphData();
    const svg = d3.select('#mini');
    const { w: W, h: H } = getMiniSize();
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('preserveAspectRatio', 'xMidYMid meet');
    const localN = nodes.map(n=>({...n})), localL = links.map(l=>({...l}));
    const sim = d3.forceSimulation(localN)
        .force('link', d3.forceLink(localL).id(d=>d.id).distance(80))
        .force('charge', d3.forceManyBody().strength(-240))
        .force('center', d3.forceCenter(W/2, H/2));
    const view = svg.append('g').attr('class', 'view');
    const link = view.append('g').selectAll('line')
        .data(localL).join('line')
        .attr('id', d => d.kind === 'hier' ? IDS.hierPRE + d.tier : IDS.tagPRE + Math.min(d.shared, 5));
    let node = view.append('g').selectAll('circle').data(localN).join('circle')
        .attr('r', 6)
        .attr('id', d => d.ref.children.length ? IDS.parent : IDS.leaf)
        .on('click', (e, d) => nav(d.ref))
        .on('mouseover', (e, d) => fade(d.id, 0.15))
        .on('mouseout', () => fade(null, 1))
        .call(d3.drag()
            .on('start', (e, d) => { d.fx = d.x; d.fy = d.y; })
            .on('drag', (e, d) => { sim.alphaTarget(0.25).restart(); d.fx = e.x; d.fy = e.y; })
            .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = d.fy = null; })
        );
    const label = view.append('g').selectAll('text')
        .data(localN).join('text')
        .attr('font-size', 10)
        .attr('pointer-events', 'none')
        .text(d => d.label);
    function fade(id, o) {
        node.style('opacity', d => (id==null || adj.get(id)?.has(d.id) || d.id===id) ? 1 : o);
        label.style('opacity', d => (id==null || adj.get(id)?.has(d.id) || d.id===id) ? 1 : o);
        link.style('opacity', l => id==null || l.source.id===id || l.target.id===id ? 1 : o);
    }
    sim.on('tick', () => {
        link.attr('x1', d=>d.source.x).attr('y1', d=>d.source.y)
            .attr('x2', d=>d.target.x).attr('y2', d=>d.target.y);
        node.attr('cx', d=>d.x).attr('cy', d=>d.y);
        label.attr('x', d=>d.x+8).attr('y', d=>d.y+3);
    });
    graphs.mini = { svg, node, label, sim, view, adj, w: W, h: H };
    observeMiniResize();
}

export function highlightCurrent(force = false) {
    if (!graphs.mini) return;
    const seg = location.hash.slice(1).split('#').filter(Boolean);
    const pg = find(seg);
    const id = pg?._i ?? -1;
    if (id === CURRENT && !force) return;
    const g = graphs.mini;
    g.node
        .attr('id', d => d.id===id ? IDS.current : (d.ref.children.length ? IDS.parent : IDS.leaf))
        .attr('r', d => d.id===id ? 8 : 6);
    g.label.classed('current', d => d.id===id);
    const cx = g.w/2, cy = g.h/2;
    g.node.filter(d => d.id===id).each(d => {
        const dx = cx - d.x, dy = cy - d.y;
        g.view.attr('transform', `translate(${dx},${dy})`);
        d.vx += (cx - d.x)*0.10;
        d.vy += (cy - d.y)*0.10;
    });
    g.sim.alphaTarget(0.15).restart();
    setTimeout(() => g.sim.alphaTarget(0), 250);
    CURRENT = id;
}

function observeMiniResize() {
    const elx = $('#mini');
    if (!elx) return;
    new ResizeObserver(() => {
        if (!graphs.mini) return;
        updateMiniViewport();
        highlightCurrent(true);
    }).observe(elx);
}

// Router
function route() {
    closePanels();
    const t = parseTarget(location.hash) || { page: root, anchor: '' };
    const page = t.page;
    const anchor = t.anchor;
    if (route.currentPage !== page) {
        route.currentPage = page;
        breadcrumb(page);
        renderPage(page, anchor);
        highlightCurrent(true);
        highlightSidebar(page);
        if (!anchor) {
            requestAnimationFrame(() => window.scrollTo(0, 0));
        }
    } else if (anchor) {
        const a = $(`#toc li[data-hid="${anchor}"] > a`);
        if (a) {
            $('#toc .toc-current')?.classList.remove('toc-current');
            a.classList.add('toc-current');
        }
        const target = document.getElementById(anchor);
        if (target) target.scrollIntoView({ behavior: 'smooth' });
    }
}
route.currentPage = null;

// Initialize UI after data is ready
export function initUI() {
    // Title and sidebar
    $('#wiki-title-text').textContent = TITLE;
    document.title = TITLE;
    buildTree();
    initTheme();
    // Initial route
    route();
    // Lazy mini-graph
    const miniEl = $('#mini');
    if (miniEl) {
        new IntersectionObserver((entries, obs) => {
            if (entries[0]?.isIntersecting) {
                buildGraph();
                obs.disconnect();
            }
        }).observe(miniEl);
    }
    // Fullscreen toggle
    const expandBtn = $('#expand'), mini = $('#mini');
    if (expandBtn && mini) {
        expandBtn.onclick = () => {
            const full = mini.classList.toggle('fullscreen');
            expandBtn.setAttribute('aria-pressed', String(full));
            updateMiniViewport();
            requestAnimationFrame(() => highlightCurrent(true));
        };
    }
    // Copy buttons for content
    wireCopyButtons($('#content'), () => baseURLNoHash() + '#');
    // Search input handling
    const searchInput = $('#search'), searchClear = $('#search-clear');
    let debounceTimer;
    if (searchInput && searchClear) {
        searchInput.oninput = e => {
            clearTimeout(debounceTimer);
            const val = e.target.value;
            searchClear.style.display = val ? '' : 'none';
            debounceTimer = setTimeout(() => searchData(val), 150);
        };
        searchClear.onclick = () => {
            searchInput.value = '';
            searchClear.style.display = 'none';
            searchData('');
            searchInput.focus();
        };
    }
    // Burger toggles
    const burgerSidebar = $('#burger-sidebar'), burgerUtil = $('#burger-util');
    if (burgerSidebar) burgerSidebar.onclick = () => togglePanel('#sidebar');
    if (burgerUtil) burgerUtil.onclick = () => togglePanel('#util');
    // Resize events
    window.addEventListener('resize', () => {
        if (window.matchMedia('(min-width:1001px)').matches) {
            closePanels();
            highlightCurrent(true);
        }
        if ($('#mini')?.classList.contains('fullscreen')) {
            updateMiniViewport();
            highlightCurrent(true);
        }
    }, { passive: true });
    // Clicking navigation
    $('#tree').addEventListener('click', e => {
        if (e.target.closest('button.caret')) {
            const li = e.target.closest('li.folder');
            setFolderOpen(li, !li.classList.contains('open'));
            return;
        }
        if (e.target.closest('a')) {
            closePanels();
        }
    }, { passive: true });
    // Hash and keyboard events
    window.addEventListener('hashchange', route, { passive: true });
    window.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            let acted = false;
            if ($('#sidebar')?.classList.contains('open') || $('#util')?.classList.contains('open')) {
                closePanels();
                acted = true;
            }
            if (mini && mini.classList.contains('fullscreen')) {
                mini.classList.remove('fullscreen');
                if (expandBtn) expandBtn.setAttribute('aria-pressed', 'false');
                updateMiniViewport();
                requestAnimationFrame(() => highlightCurrent(true));
                acted = true;
            }
            if (acted) e.preventDefault();
        }
        // Hotkeys
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
            searchInput?.focus();
            e.preventDefault();
        }
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            if (e.key === 'a' || e.key === 'q') { togglePanel('#sidebar'); e.preventDefault(); }
            if (e.key === 'd') { togglePanel('#util'); e.preventDefault(); }
            if (e.key === 't') { $('#theme-toggle')?.click(); e.preventDefault(); }
            if (e.key === 'g') { expandBtn?.click(); e.preventDefault(); }
        }
    });
}
