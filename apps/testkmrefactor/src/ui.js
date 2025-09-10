'use strict';
import { $, $$, el, escapeRegex, copyText, clearSelection, HEADINGS_SEL, whenIdle } from './helpers.js';
import { pages, root, hashOf, find, TITLE as KM_TITLE, DEFAULT_THEME, ACCENT } from './data.js';
import { getParsedHTML, enhanceRendered, normalizeAnchors } from './render.js';
import { ensureHighlight, ensureMarkdown, ensureKatex } from './render.js';

// UI state and global toggles
const graphs = {};       // for mini graph(s)
let CURRENT = -1;
let __lpGlobalBound = false;
let tocObserver = null;
export function closePanels() {
    $('#sidebar')?.classList.remove('open');
    $('#util')?.classList.remove('open');
}
function setFolderOpen(li, open) {
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
    const treeEl = $('#tree');
    if (treeEl && link) {
        const r = link.getBoundingClientRect();
        const tr = treeEl.getBoundingClientRect();
        requestAnimationFrame(() => {
            if (r.top < tr.top || r.bottom > tr.bottom) {
                link.scrollIntoView({ block: 'nearest' });
            }
        });
    }
}
function buildTree() {
    const ul = $('#tree');
    if (!ul) return;
    ul.setAttribute('role', 'tree');
    ul.innerHTML = '';
    const prim = root.children.filter(c => !c.isSecondary);
    const secs = root.children.filter(c => c.isSecondary).sort((a, b) => a.clusterId - b.clusterId);
    const rec = (nodes, container, depth = 0) => {
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
                const lbl = el('a', {
                    class: 'lbl',
                    dataset: { page: p.id },
                    href: '#' + hashOf(p),
                    textContent: p.title
                });
                const sub = el('ul', {
                    id: groupId,
                    role: 'group',
                    style: `display:${open ? 'block' : 'none'}`
                });
                li.setAttribute('role', 'treeitem');
                li.setAttribute('aria-expanded', String(open));
                li.append(caret, lbl, sub);
                container.append(li);
                rec(p.children, sub, depth + 1);
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
    rec(prim, ul);
    secs.forEach(r => {
        const sep = el('div', {
            class: 'group-sep',
            role: 'presentation',
            'aria-hidden': 'true'
        }, [ el('hr', { role: 'presentation', 'aria-hidden': 'true' }) ]);
        ul.append(sep);
        rec([r], ul);
    });
}
// Breadcrumb sibling navigation and related content
let collator = new Intl.Collator(undefined, { sensitivity: 'base' });
const sortByTitle = (a, b) => collator.compare(a.title, b.title);
function seeAlso(page) {
    $('#see-also')?.remove();
    if (!page.tagsSet?.size) return;
    const related = pages
        .filter(p => p !== page)
        .map(p => ({ p, shared: [...p.tagsSet].filter(t => page.tagsSet.has(t)).length }))
        .filter(r => r.shared > 0)
        .sort((a, b) => (b.shared - a.shared) || sortByTitle(a.p, b.p));
    if (!related.length) return;
    const wrap = el('div', { id: 'see-also' }, [ el('h2', { textContent: 'See also' }), el('ul') ]);
    const ulEl = wrap.querySelector('ul');
    related.forEach(({ p }) => ulEl.append(el('li', {}, [
        el('a', { href: '#' + hashOf(p), textContent: p.title })
    ])));
    const contentEl = $('#content'), pn = $('#prev-next');
    contentEl.insertBefore(wrap, pn ?? null);
}
function prevNext(page) {
    $('#prev-next')?.remove();
    if (!page.parent) return;
    if (page.parent === root) { if (page.isSecondary) return; }
    let sib = page.parent.children;
    if (page.parent === root && !page.isSecondary) sib = sib.filter(p => !p.isSecondary);
    if (sib.length < 2) return;
    const i = sib.indexOf(page);
    const wrap = el('div', { id: 'prev-next' });
    if (i > 0) wrap.append(el('a', {
        href: '#' + hashOf(sib[i - 1]),
        textContent: '← ' + sib[i - 1].title
    }));
    if (i < sib.length - 1) wrap.append(el('a', {
        href: '#' + hashOf(sib[i + 1]),
        textContent: sib[i + 1].title + ' →'
    }));
    $('#content').append(wrap);
}
function search(q) {
    const resUL = $('#results'), treeUL = $('#tree');
    if (!resUL || !treeUL) return;
    const val = q.trim().toLowerCase();
    resUL.setAttribute('aria-live', 'polite');
    resUL.setAttribute('aria-busy', 'true');
    if (!val) {
        resUL.style.display = 'none';
        resUL.innerHTML = '';
        treeUL.style.display = '';
        return;
    }
    const tokens = val.split(/\s+/).filter(t => t.length >= 2);
    resUL.innerHTML = '';
    resUL.style.display = '';
    treeUL.style.display = 'none';
    const W = { title: 5, tag: 3, body: 1, secTitle: 3, secBody: 1, phraseTitle: 5, phraseBody: 2, secCountCap: 4 };
    const phrase = tokens.length > 1 ? val : null;
    const scored = [];
    for (const p of pages) {
        if (!tokens.every(tok => p.searchStr.includes(tok))) continue;
        let score = 0;
        // per-token weighting
        for (const t of tokens) {
            const r = new RegExp('\\b' + escapeRegex(t) + '\\b');
            if (r.test(p.titleL)) score += W.title;
            if (r.test(p.tagsL))  score += W.tag;
            if (r.test(p.bodyL))  score += W.body;
        }
        // phrase bonus
        if (phrase) {
            if (p.titleL.includes(phrase)) score += W.phraseTitle;
            else if (p.bodyL.includes(phrase)) score += W.phraseBody;
        }
        // section sub-results
        const matchedSecs = [];
        for (const sec of p.sections) {
            if (!tokens.every(tok => sec.search.includes(tok))) continue;
            let s = 0;
            for (const t of tokens) {
                const r = new RegExp('\\b' + escapeRegex(t) + '\\b');
                if (r.test(sec.txt.toLowerCase())) s += W.secTitle;
                if (r.test(sec.body.toLowerCase()))  s += W.secBody;
            }
            if (phrase && (sec.txt.toLowerCase().includes(phrase) || sec.body.toLowerCase().includes(phrase))) s += 1;
            matchedSecs.push({ sec, s });
        }
        matchedSecs.sort((a, b) => b.s - a.s);
        score += Math.min(W.secCountCap, matchedSecs.length);
        scored.push({ p, score, matchedSecs });
    }
    scored.sort((a, b) => b.score - a.score || sortByTitle(a.p, b.p));
    const frag = document.createDocumentFragment();
    for (const { p, matchedSecs } of scored) {
        const li = el('li', { class: 'page-result' }, [
            el('a', { href: '#' + hashOf(p), textContent: p.title })
        ]);
        if (matchedSecs.length) {
            const base = hashOf(p);
            const sub = el('ul', { class: 'sub-results' });
            matchedSecs.forEach(({ sec }) => {
                sub.append(el('li', { class: 'heading-result' }, [
                    el('a', { href: `#${base ? base + '#' : ''}${sec.id}`, textContent: sec.txt })
                ]));
            });
            li.append(sub);
        }
        frag.append(li);
    }
    resUL.append(frag);
    if (!resUL.children.length) resUL.innerHTML = '<li id="no_result">No result</li>';
    resUL.setAttribute('aria-busy', 'false');
}
export function wireCopyButtons(root, getBaseUrl) {
    if (!root) return;
    root.addEventListener('click', (e) => {
        const btn = e.target?.closest('button.heading-copy, button.code-copy');
        if (!btn) return;
        if (btn.classList.contains('heading-copy')) {
            const h = btn.closest(HEADINGS_SEL);
            if (!h) return;
            const base = getBaseUrl() || (location.href.replace(/#.*$/, '') + '#');
            copyText(base + h.id, btn);
        } else {
            const pre = btn.closest('pre');
            const code = pre?.querySelector('code');
            copyText(code ? code.innerText : pre?.innerText || '', btn);
        }
    });
}

// D3 and mini-graph integration
const ensureD3 = ensureOnce(async () => {
    const [sel, force, drag] = await Promise.all([
        import('https://cdn.jsdelivr.net/npm/d3-selection@3.0.0/+esm'),
        import('https://cdn.jsdelivr.net/npm/d3-force@3.0.0/+esm'),
        import('https://cdn.jsdelivr.net/npm/d3-drag@3.0.0/+esm')
    ]);
    KM.d3 = {
        select: sel.select,
        selectAll: sel.selectAll,
        forceSimulation: force.forceSimulation,
        forceLink: force.forceLink,
        forceManyBody: force.forceManyBody,
        forceCenter: force.forceCenter,
        drag: drag.drag
    };
});
function getMiniSize() {
    const svgEl = $('#mini');
    if (!svgEl) return { w: 400, h: 300 };
    if (svgEl.classList.contains('fullscreen')) return { w: innerWidth, h: innerHeight };
    const r = svgEl.getBoundingClientRect();
    return { w: Math.max(1, r.width | 0), h: Math.max(1, r.height | 0) };
}
function updateMiniViewport() {
    if (!graphs.mini) return;
    const { svg, sim } = graphs.mini;
    const { w, h } = getMiniSize();
    graphs.mini.w = w; graphs.mini.h = h;
    svg.attr('viewBox', `0 0 ${w} ${h}`).attr('width', w).attr('height', h).attr('preserveAspectRatio', 'xMidYMid meet');
    clearTimeout(graphs.mini._kick);
    graphs.mini._kick = setTimeout(() => { sim.alpha(0.2).restart(); }, 50);
}
function buildGraphData() {
    const nodes = [], links = [], hierPairs = new Set(), adj = new Map();
    const touch = (a, b) => {
        (adj.get(a) || adj.set(a, new Set()).get(a)).add(b);
        (adj.get(b) || adj.set(b, new Set()).get(b)).add(a);
    };
    const tierOf = n => n < 3 ? 1 : n < 6 ? 2 : n < 11 ? 3 : n < 21 ? 4 : 5;
    pages.forEach((p, i) => { p._i = i; nodes.push({ id: i, label: p.title, ref: p }); });
    pages.forEach(p => {
        if (!p.parent) return;
        if (p.isSecondary && p.parent === root) return;
        const a = p._i, b = p.parent._i;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        links.push({ source: a, target: b, shared: 0, kind: 'hier', tier: tierOf((() => {
            let n = 0; (function rec(x) { x.children.forEach(c => { n++; rec(c); }); })(p); return n;
        })()) });
        hierPairs.add(key);
        touch(a, b);
    });
    const tagToPages = new Map();
    pages.forEach(p => { for (const t of p.tagsSet) { if (!tagToPages.has(t)) tagToPages.set(t, []); tagToPages.get(t).push(p._i); } });
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
        if (count < 2) continue;
        if (hierPairs.has(key)) continue;
        const [i, j] = key.split('|').map(Number);
        links.push({ source: i, target: j, shared: count, kind: 'tag' });
        touch(i, j);
    }
    return { nodes, links, adj };
}
export async function buildGraph() {
    await ensureD3();
    if (graphs.mini) return;
    const { nodes, links, adj } = buildGraphData();
    const svg = KM.d3.select('#mini');
    const { w: W, h: H } = getMiniSize();
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('preserveAspectRatio', 'xMidYMid meet');
    const localN = nodes.map(n => ({ ...n })), localL = links.map(l => ({ ...l }));
    const sim = KM.d3.forceSimulation(localN)
        .force('link', KM.d3.forceLink(localL).id(d => d.id).distance(80))
        .force('charge', KM.d3.forceManyBody().strength(-240))
        .force('center', KM.d3.forceCenter(W / 2, H / 2));
    const view = svg.append('g').attr('class', 'view');
    const link = view.append('g').selectAll('line')
        .data(localL).join('line')
        .attr('id', d => d.kind === 'hier' ? `link_hier${d.tier}` : `link_tag${Math.min(d.shared, 5)}`);
    const wireNode = sel => sel
        .attr('r', 6)
        .attr('id', d => d.ref.children.length ? 'node_parent' : 'node_leaf')
        .on('click', (e, d) => KM.nav(d.ref))
        .on('mouseover', (e, d) => fade(d.id, 0.15))
        .on('mouseout', () => fade(null, 1))
        .call(KM.d3.drag()
            .on('start', (e, d) => { d.fx = d.x; d.fy = d.y; })
            .on('drag',  (e, d) => { sim.alphaTarget(0.25).restart(); d.fx = e.x; d.fy = e.y; })
            .on('end',   (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = d.fy = null; }));
    const node = wireNode(view.append('g').selectAll('circle').data(localN).join('circle'));
    const label = view.append('g').selectAll('text')
        .data(localN).join('text')
        .attr('id', 'graph_text').attr('font-size', 10)
        .attr('pointer-events', 'none')
        .text(d => d.label);
    function fade(id, o) {
        node.style('opacity', d => (id == null || adj.get(id)?.has(d.id) || d.id === id) ? 1 : o);
        label.style('opacity', d => (id == null || adj.get(id)?.has(d.id) || d.id === id) ? 1 : o);
        link.style('opacity', l => id == null || l.source.id === id || l.target.id === id ? 1 : o);
    }
    sim.on('tick', () => {
        link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
        node.attr('cx', d => d.x).attr('cy', d => d.y);
        label.attr('x', d => d.x + 8).attr('y', d => d.y + 3);
    });
    graphs.mini = { svg, node, label, sim, view, adj, w: W, h: H, _kick: null };
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
        .attr('id', d => d.id === id ? 'node_current' : (d.ref.children.length ? 'node_parent' : 'node_leaf'))
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
function observeMiniResize() {
    const elx = $('#mini');
    if (!elx) return;
    new ResizeObserver(() => {
        if (!graphs.mini) return;
        updateMiniViewport();
        highlightCurrent(true);
    }).observe(elx);
}

// Hover Link Previews
function attachLinkPreviews() {
    const rootEl = $('#content');
    if (!rootEl) return;
    if (rootEl.dataset.kmPreviewsBound === '1') return;
    rootEl.dataset.kmPreviewsBound = '1';
    const previewStack = [];
    let hoverDelay = null;
    function closeFrom(indexInclusive = 0) {
        for (let i = previewStack.length - 1; i >= indexInclusive; i--) {
            const p = previewStack[i];
            clearTimeout(p.timer);
            normalizeAnchors(p.body, p.linkPage);
            p.el.remove();
            previewStack.pop();
        }
    }
    function anyPreviewOrTriggerActive() {
        const anyHoverPreview = Array.from(document.querySelectorAll('.km-link-preview'))
            .some(p => p.matches(':hover'));
        if (anyHoverPreview) return true;
        const active = document.activeElement;
        const activeIsTrigger = !!(active && active.closest && active.closest('a[href^="#"]'));
        if (activeIsTrigger) return true;
        const hoveringTrigger = previewStack.some(p => p.link && p.link.matches(':hover'));
        return hoveringTrigger;
    }
    let trimTimer;
    function scheduleTrim() {
        clearTimeout(trimTimer);
        trimTimer = setTimeout(() => {
            if (!anyPreviewOrTriggerActive()) closeFrom(0);
        }, 220);
    }
    async function fillPanel(panel, page, anchor) {
        panel.body.dataset.mathRendered = '0';
        panel.body.innerHTML = await getParsedHTML(page);
        normalizeAnchors(panel.body, page);
        await enhanceRendered(panel.body, page);
        if (anchor) {
            // Wait two frames for content to settle, then scroll the preview to anchor
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            const t = panel.body.querySelector('#' + CSS.escape(anchor));
            if (t) {
                const header = panel.el.querySelector('header');
                const headerH = header ? header.offsetHeight : 0;
                const cRect = panel.el.getBoundingClientRect();
                const tRect = t.getBoundingClientRect();
                const y = tRect.top - cRect.top + panel.el.scrollTop;
                const top = Math.max(0, y - headerH - 6);
                panel.el.scrollTo({ top, behavior: 'auto' });
                t.classList.add('km-preview-focus');
            }
        }
    }
    function createPanel(linkEl) {
        const container = el('div', { class: 'km-link-preview', role: 'dialog', 'aria-label': 'Preview' });
        const header = el('header', {}, [
            el('button', { type: 'button', class: 'km-preview-close', title: 'Close', 'aria-label': 'Close', innerHTML: '✕' })
        ]);
        const body = el('div');
        container.append(header, body);
        document.body.appendChild(container);
        const panel = { el: container, body, link: linkEl, linkPage: null, timer: null };
        const idx = previewStack.push(panel) - 1;
        // Hover lifecycle events for panel
        container.addEventListener('mouseenter', () => {
            clearTimeout(panel.timer);
            clearTimeout(trimTimer);
        }, { passive: true });
        container.addEventListener('mouseleave', (e) => {
            const to = e.relatedTarget;
            if (to && (to.closest && to.closest('.km-link-preview'))) return;
            panel.timer = setTimeout(() => { closeFrom(idx); }, 240);
        }, { passive: true });
        header.querySelector('button').addEventListener('click', () => closeFrom(idx));
        // Allow nested previews: bind events inside this panel too
        container.addEventListener('mouseover', (e) => maybeOpenFromEvent(e), true);
        container.addEventListener('focusin',  (e) => maybeOpenFromEvent(e), true);
        positionPreview(panel, linkEl);
        // Attach copy buttons inside preview
        wireCopyButtons(panel.el, () => {
            const t = parseTarget(linkEl.getAttribute('href') || '');
            return buildDeepURL(t?.page, '') || (location.href.replace(/#.*$/, '') + '#');
        });
        return panel;
    }
    async function openPreviewForLink(linkEl) {
        const href = linkEl.getAttribute('href') || '';
        const target = parseTarget(href);
        if (!target) return;
        // If this link already has an open preview, reposition it instead of opening a new one
        const existingIdx = previewStack.findIndex(p => p.link === linkEl);
        if (existingIdx >= 0) {
            const existing = previewStack[existingIdx];
            clearTimeout(existing.timer);
            positionPreview(existing, linkEl);
            return;
        }
        const panel = createPanel(linkEl);
        // Cancel close timers on existing panels when a new one opens
        previewStack.forEach(p => clearTimeout(p.timer));
        panel.linkPage = target.page;
        await fillPanel(panel, target.page, target.anchor);
    }
    function isInternalPageLink(a) {
        const href = a?.getAttribute('href') || '';
        return !!parseTarget(href);
    }
    function maybeOpenFromEvent(e) {
        const a = e.target?.closest('a[href^="#"]');
        if (!a || !isInternalPageLink(a)) return;
        clearTimeout(hoverDelay);
        const openNow = e.type === 'focusin';
        if (openNow) {
            openPreviewForLink(a);
        } else {
            hoverDelay = setTimeout(() => openPreviewForLink(a), 220);
        }
    }
    // Bind events on main content for hover and focus
    rootEl.addEventListener('mouseover', maybeOpenFromEvent, true);
    rootEl.addEventListener('focusin',  maybeOpenFromEvent, true);
    rootEl.addEventListener('mouseout', (e) => {
        const to = e.relatedTarget;
        if (to && (to.closest && to.closest('.km-link-preview'))) return;
        scheduleTrim();
    }, true);
    if (!__lpGlobalBound) {
        addEventListener('hashchange', () => closeFrom(0), { passive: true });
        addEventListener('scroll',     () => scheduleTrim(), { passive: true });
        __lpGlobalBound = true;
    }
}
function positionPreview(panel, linkEl) {
    const rect = linkEl.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const gap = 8;
    // Force layout to measure the panel after adding it to DOM
    const W = Math.max(1, panel.el.offsetWidth || 1);
    const H = Math.max(1, panel.el.offsetHeight || 1);
    const preferRight = rect.right + gap + W <= vw;
    const left = preferRight
        ? Math.min(rect.right + gap, vw - W - gap)
        : Math.max(gap, rect.left - gap - W);
    const top = Math.min(Math.max(gap, rect.top), Math.max(gap, vh - H - gap));
    Object.assign(panel.el.style, { left: left + 'px', top: top + 'px' });
}

// Initialize UI after data is loaded
export function initUI() {
    try { attachLinkPreviews(); } catch (_) {}
    if (window.__kmUIInited) return;
    window.__kmUIInited = true;
    $('#wiki-title-text').textContent = document.title = (window.KM_TITLE || TITLE || 'Wiki');
    buildTree();
    // Trigger mini-graph build when it comes into view
    const miniEl = $('#mini');
    if (miniEl) {
        new IntersectionObserver((entries, obs) => {
            if (entries[0]?.isIntersecting) {
                buildGraph();
                obs.disconnect();
            }
        }).observe(miniEl);
    }
    // Theme and accent initialization
    const btn = $('#theme-toggle'),
          rootEl = document.documentElement,
          media = matchMedia('(prefers-color-scheme: dark)');
    const stored = localStorage.getItem('km-theme');
    const cfgTheme = (DEFAULT_THEME === 'dark' || DEFAULT_THEME === 'light') ? DEFAULT_THEME : null;
    let dark = stored ? (stored === 'dark') : (cfgTheme ? cfgTheme === 'dark' : media.matches);
    if (typeof ACCENT === 'string' && ACCENT) rootEl.style.setProperty('--color-accent', ACCENT);
    function applyTheme(isDark) {
        rootEl.style.setProperty('--color-main', isDark ? 'rgb(29,29,29)' : 'white');
        rootEl.setAttribute('data-theme', isDark ? 'dark' : 'light');
        // Swap highlight.js theme CSS asynchronously (via highlight dynamic loading)
        ensureHighlight();
        // Sync Mermaid diagrams to new theme
        ensureMarkdown().then(() => KM.syncMermaidThemeWithPage?.());
    }
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
        if (!hasUserPref && !cfgTheme) {
            dark = e.matches;
            applyTheme(dark);
        }
    });
    addEventListener('storage', (e) => {
        if (e.key === 'km-theme') {
            dark = e.newValue === 'dark';
            applyTheme(dark);
        }
    });
    // Search input behavior
    const searchInput = $('#search'),
          searchClear = $('#search-clear');
    let debounce = 0;
    if (searchInput && searchClear) {
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
    }
    // Panel toggle controls
    const togglePanel = sel => {
        const elx = $(sel);
        if (!elx) return;
        const wasOpen = elx.classList.contains('open');
        closePanels();
        if (!wasOpen) {
            elx.classList.add('open');
            if (!elx.querySelector('.panel-close')) {
                elx.append(el('button', {
                    type: 'button',
                    class: 'panel-close',
                    'aria-label': 'Close panel',
                    textContent: '✕',
                    onclick: closePanels
                }));
            }
        }
    };
    window.__kmToggleSidebar = () => togglePanel('#sidebar');
    window.__kmToggleUtil = () => togglePanel('#util');
    window.__kmToggleCrumb = () => togglePanel('#crumb');
    const burgerSidebar = $('#burger-sidebar');
    const burgerUtil = $('#burger-util');
    if (burgerSidebar) burgerSidebar.onclick = () => togglePanel('#sidebar');
    if (burgerUtil) burgerUtil.onclick = () => togglePanel('#util');
    // Update layout on resize
    const updateViewport = () => { window.__VPW = window.innerWidth; window.__VPH = window.innerHeight; };
    const onResize = () => {
        updateViewport();
        if (matchMedia('(min-width:1001px)').matches) {
            closePanels();
            highlightCurrent(true);
        }
        if ($('#mini')?.classList.contains('fullscreen')) {
            updateMiniViewport();
            highlightCurrent(true);
        }
    };
    updateViewport();
    addEventListener('resize', onResize, { passive: true });
    // Close panels when clicking sidebar or search results links
    $('#tree').addEventListener('click', e => {
        const caretBtn = e.target.closest('button.caret');
        if (caretBtn) {
            const li = caretBtn.closest('li.folder'),
                  sub = li.querySelector('ul');
            const open = !li.classList.contains('open');
            setFolderOpen(li, open);
            return;
        }
        if (e.target.closest('a')) closePanels();
    }, { passive: true });
    $('#results').addEventListener('click', e => {
        if (e.target.closest('a')) closePanels();
    }, { passive: true });
    // Help icon next to watermark opens keyboard shortcuts help panel
    $('#kb-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        const open = (window.openHelp || (() => {}));
        open();
    });
    // Preload resources when main thread is idle
    whenIdle(() => {
        ensureHighlight();
        ensureMarkdown();
        ensureKatex();
    });
}
