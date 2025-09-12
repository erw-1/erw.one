/* eslint-env browser, es2022 */
'use strict';

import { DOC, $, $$, el, HEADINGS_SEL, __getVP, baseURLNoHash } from './config_dom.js';
import { __model, hashOf } from './model.js';
import { getParsedHTML, normalizeAnchors, wireCopyButtons, __cleanupObservers } from './markdown.js';
import { buildDeepURL, parseTarget, enhanceRendered } from './router_renderer.js';

export function closePanels() {
  $('#sidebar')?.classList.remove('open');
  $('#util')?.classList.remove('open');
}

export function setFolderOpen(li, open) {
  if (!li) return;
  li.classList.toggle('open', !!open);
  li.setAttribute('aria-expanded', String(!!open));
  const caret = li.querySelector('button.caret');
  if (caret) {
    caret.setAttribute('aria-expanded', String(!!open));
    caret.setAttribute('aria-label', open ? 'Collapse' : 'Expand');
  }
  const sub = li.querySelector('ul[role="group"]');
  if (sub) sub.style.display = open ? 'block' : 'none';
}

/** Build the collapsible tree in the sidebar */
export function buildTree() {
  const ul = $('#tree');
  const { root } = __model;
  if (!ul || !root) return;

  ul.setAttribute('role', 'tree');
  ul.innerHTML = '';

  const prim = root.children.filter(c => !c.isSecondary);
  const secs = root.children.filter(c => c.isSecondary)
                            .sort((a, b) => a.clusterId - b.clusterId);

  const rec = (nodes, container, depth = 0) => {
    nodes.forEach(p => {
      const li = el('li', { role: 'treeitem' });
      if (p.children.length) {
        const open = depth < 2;
        li.className = 'folder' + (open ? ' open' : '');
        li.setAttribute('aria-expanded', String(open));

        const groupId = `group-${p.id}`;
        const caret = el('button', {
          type: 'button',
          class: 'caret',
          'aria-controls': groupId,
          'aria-expanded': String(open),
          'aria-label': open ? 'Collapse' : 'Expand',
          textContent: '▸'
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

        li.append(caret, lbl, sub);
        container.append(li);
        rec(p.children, sub, depth + 1);
      } else {
        li.className = 'article';
        li.append(el('a', {
          dataset: { page: p.id },
          href: '#' + hashOf(p),
          textContent: p.title
        }));
        container.append(li);
      }
    });
  };

  const frag = DOC.createDocumentFragment();
  rec(prim, frag);

  secs.forEach(rep => {
    const sep = el('div', {
      class: 'group-sep',
      role: 'presentation',
      'aria-hidden': 'true'
    }, el('hr', { role: 'presentation', 'aria-hidden': 'true' }));
    frag.append(sep);
    rec([rep], frag);
  });

  ul.append(frag);
}

/** Highlight current page in the tree and open ancestors */
export function highlightSidebar(page) {
  const rootEl = $('#tree');
  if (!rootEl || !page) return;

  rootEl.querySelectorAll('.sidebar-current').forEach(a => a.classList.remove('sidebar-current'));
  const a = rootEl.querySelector(`a[data-page="${page.id}"]`);
  if (!a) return;

  a.classList.add('sidebar-current');
  let li = a.closest('li');
  while (li) {
    if (li.classList.contains('folder')) setFolderOpen(li, true);
    li = li.parentElement?.closest('li') || null;
  }

  const tree = $('#tree');
  if (tree) {
    const r = a.getBoundingClientRect();
    const tr = tree.getBoundingClientRect();
    requestAnimationFrame(() => {
      if (r.top < tr.top || r.bottom > tr.bottom) {
        a.scrollIntoView({ block: 'nearest' });
      }
    });
  }
}

/** Build the breadcrumb navigation */
export function breadcrumb(page) {
  const dyn = $('#crumb-dyn');
  if (!dyn) return;
  dyn.innerHTML = '';
  const chain = [];
  for (let n = page; n; n = n.parent) chain.unshift(n);
  if (chain.length) chain.shift(); // drop root label

  chain.forEach((n, i) => {
    if (i) dyn.insertAdjacentHTML('beforeend', '<span class="separator">▸</span>');
    const wrap = el('span', { class: 'dropdown' });
    const a = el('a', { textContent: n.title, href: '#' + n.hash });
    if (n === page) a.className = 'crumb-current';
    wrap.append(a);

    const siblings = n.parent.children.filter(s => s !== n);
    if (siblings.length) {
      const ul = el('ul');
      siblings.forEach(s =>
        ul.append(el('li', { textContent: s.title, onclick: () => KM.nav(s) }))
      );
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
    page.children.slice().sort((a, b) => a.title.localeCompare(b.title))
      .forEach(ch => ul.append(el('li', { textContent: ch.title, onclick: () => KM.nav(ch) })));
    dyn.append(box);
  }
}

let tocObserver = null;

/** Build Table of Contents (ToC) with live highlighting */
export function buildToc(page) {
  const tocEl = $('#toc');
  if (!tocEl) return;
  tocEl.innerHTML = '';
  const heads = $$('#content ' + HEADINGS_SEL);
  if (!heads.length) return;

  const ul = el('ul');
  heads.forEach(h => {
    const id  = h.id || '';
    const lvl = Math.min(6, Math.max(1, parseInt(h.tagName.slice(1), 10) || 1));
    const li  = el('li', { 'data-hid': id, 'data-lvl': String(lvl) }, [
      el('a', { href: '#' + (page.hash ? page.hash + '#' : '') + id, textContent: h.textContent || '' })
    ]);
    ul.append(li);
  });
  tocEl.append(ul);

  if (tocObserver) tocObserver.disconnect();
  tocObserver = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      const id = en.target.id;
      const a = $(`#toc li[data-hid="${id}"] > a`);
      if (!a) return;
      $('#toc .toc-current')?.classList.remove('toc-current');
      a.classList.add('toc-current');
    });
  }, { root: null, rootMargin: '0px 0px -70% 0px', threshold: 0 });
  heads.forEach(h => tocObserver.observe(h));
}

/** Prev/Next links */
export function prevNext(page) {
  const elx = $('#prevnext');
  if (!elx) return;
  const siblings = page.parent ? page.parent.children.slice() : [];
  const i = siblings.indexOf(page);
  const prev = i > 0 ? siblings[i - 1] : null;
  const next = i >= 0 && i < siblings.length - 1 ? siblings[i + 1] : null;

  elx.innerHTML = '';
  if (prev) elx.append(el('a', { href: '#' + hashOf(prev), class: 'prev', textContent: '← ' + prev.title }));
  if (next) elx.append(el('a', { href: '#' + hashOf(next), class: 'next', textContent: next.title + ' →' }));
}

/** "See also" based on shared tags */
export function seeAlso(page) {
  const elx = $('#seealso');
  if (!elx) return;
  elx.innerHTML = '';

  const tags = page.tagsSet || new Set();
  if (!tags.size) return;
  const same = __model.pages
    .filter(p => p !== page && p.parent !== page.parent && [...p.tagsSet].some(t => tags.has(t)))
    .slice(0, 6);

  same.forEach(p => elx.append(el('a', { href: '#' + hashOf(p), textContent: p.title })));
}

/** Hover link previews */
export function attachLinkPreviews() {
  const previewStack = [];
  const HOVER_DELAY_MS = 500;
  let hoverTimer = null;
  let hoverLinkEl = null;

  function cancelPendingHover() {
    if (hoverTimer) clearTimeout(hoverTimer);
    if (hoverLinkEl) {
      hoverLinkEl.style.cursor = '';
      delete hoverLinkEl.dataset.previewPending;
    }
    hoverTimer = null;
    hoverLinkEl = null;
  }

  function rewriteRelativeAnchors(panel, page) {
    normalizeAnchors(panel.body, page);
  }

  function positionPreview(panel, linkEl) {
    const rect = linkEl.getBoundingClientRect();
    const { __VPW: vw, __VPH: vh } = __getVP();
    const gap = 8;
    const elx = panel.el;
    const W = Math.max(1, elx.offsetWidth);
    const H = Math.max(1, elx.offsetHeight);
    const preferRight = rect.right + gap + W <= vw;
    const left = preferRight
      ? Math.min(rect.right + gap, vw - W - gap)
      : Math.max(gap, rect.left - gap - W);
    const top = Math.min(Math.max(gap, rect.top), Math.max(gap, vh - H - gap));
    Object.assign(panel.el.style, { left: left + 'px', top: top + 'px' });
  }

  function closeFrom(indexInclusive = 0) {
    for (let i = previewStack.length - 1; i >= indexInclusive; i--) {
      const p = previewStack[i];
      clearTimeout(p.timer);
      __cleanupObservers(p.el);
      p.el.remove();
      previewStack.pop();
    }
  }

  function anyPreviewOrTriggerActive() {
    const anyHoverPreview = Array.from(document.querySelectorAll('.km-link-preview')).some(p => p.matches(':hover'));
    if (anyHoverPreview) return true;
    const active = document.activeElement;
    const activeIsTrigger = active && active.closest && window.KM.isInternalPageLink?.(active.closest('a[href^="#"]'));
    if (activeIsTrigger) return true;
    const hoveringTrigger = previewStack.some(p => p.link && p.link.matches(':hover'));
    return hoveringTrigger;
  }

  let trimTimer;
  function scheduleTrim() {
    clearTimeout(trimTimer);
    trimTimer = setTimeout(() => { if (!anyPreviewOrTriggerActive()) closeFrom(0); }, 220);
  }

  async function fillPanel(panel, page, anchor) {
    panel.body.dataset.mathRendered = '0';
    panel.body.innerHTML = await getParsedHTML(page);
    rewriteRelativeAnchors(panel, page);
    await enhanceRendered(panel.body, page);

    if (anchor) {
      const container = panel.el;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const t = panel.body.querySelector('#' + CSS.escape(anchor));
      if (t) {
        const header = container.querySelector('header');
        const headerH = header ? header.offsetHeight : 0;
        const cRect = container.getBoundingClientRect();
        const tRect = t.getBoundingClientRect();
        const y = tRect.top - cRect.top + container.scrollTop;
        const top = Math.max(0, y - headerH - 6);
        container.scrollTo({ top, behavior: 'auto' });
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
    DOC.body.appendChild(container);

    const panel = { el: container, body, link: linkEl, timer: null };
    const idx = previewStack.push(panel) - 1;

    container.addEventListener('mouseenter', () => { clearTimeout(panel.timer); clearTimeout(trimTimer); }, { passive: true });
    container.addEventListener('mouseleave', e => {
      const to = e.relatedTarget;
      if (to && to.closest && to.closest('.km-link-preview')) return;
      panel.timer = setTimeout(() => closeFrom(idx), 240);
    }, { passive: true });
    header.querySelector('button').addEventListener('click', () => closeFrom(idx));
    container.addEventListener('mouseover', e => maybeOpenFromEvent(e), true);
    container.addEventListener('focusin', e => maybeOpenFromEvent(e), true);

    positionPreview(panel, linkEl);

    wireCopyButtons(panel.el, () => {
      const t = parseTarget(panel.link.getAttribute('href') || '');
      return buildDeepURL(t?.page, '') || (baseURLNoHash() + '#');
    });

    return panel;
  }

  async function openPreviewForLink(a) {
    const href = a.getAttribute('href') || '';
    const target = parseTarget(href);
    if (!target) return;

    const existingIdx = previewStack.findIndex(p => p.link === a);
    if (existingIdx >= 0) {
      const existing = previewStack[existingIdx];
      clearTimeout(existing.timer);
      positionPreview(existing, a);
      return;
    }

    const panel = createPanel(a);
    previewStack.forEach(p => clearTimeout(p.timer));
    await fillPanel(panel, target.page, target.anchor);
  }

  function isInternalPageLink(a) {
    const href = a?.getAttribute('href') || '';
    return !!parseTarget(href);
  }
  window.KM.isInternalPageLink = isInternalPageLink;

  function maybeOpenFromEvent(e) {
    const a = e.target?.closest('a[href^="#"]');
    if (!a || !isInternalPageLink(a)) return;

    if (e.type === 'focusin') {
      cancelPendingHover();
      openPreviewForLink(a);
      return;
    }

    // hover
    cancelPendingHover();
    hoverLinkEl = a;
    a.dataset.previewPending = '1';
    a.style.cursor = 'progress';

    hoverTimer = setTimeout(() => {
      a.style.cursor = '';
      delete a.dataset.previewPending;
      openPreviewForLink(a);
      hoverTimer = null;
      hoverLinkEl = null;
    }, HOVER_DELAY_MS);

    a.addEventListener('mouseleave', cancelPendingHover, { once: true });
    a.addEventListener('blur', cancelPendingHover, { once: true });
  }

  const root = $('#content');
  if (!root) return;
  if (root.dataset.kmPreviewsBound === '1') return;
  root.dataset.kmPreviewsBound = '1';
  root.addEventListener('mouseover', maybeOpenFromEvent, true);
  root.addEventListener('focusin', maybeOpenFromEvent, true);
  root.addEventListener('mouseout', e => {
    const to = e.relatedTarget;
    if (e.target?.closest('a[href^="#"]') && (!to || !to.closest || !to.closest('a[href^="#"]'))) {
      cancelPendingHover();
    }
    if (to && (to.closest && to.closest('.km-link-preview'))) return;
    scheduleTrim();
  }, true);

  addEventListener('hashchange', () => { cancelPendingHover(); closeFrom(0); }, { passive: true });
  addEventListener('scroll', () => { cancelPendingHover(); scheduleTrim(); }, { passive: true });
}

/** Initialize keyboard shortcuts */
export function initKeybinds() {
  const $search = $('#search');
  const $theme  = $('#theme-toggle');
  const $expand = $('#expand');

  const isEditable = el => !!(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/i.test(el.tagName)));
  const key = (e, k) => e.key === k || e.key.toLowerCase() === k.toLowerCase();
  const keyIn = (e, list) => list.some(k => key(e, k));
  const isMod = e => e.ctrlKey || e.metaKey;
  const noMods = e => !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;

  const actions = {
    focusSearch: () => $search?.focus(),
    toggleTheme: () => $theme?.click(),
    toggleSidebar: () => window.__kmToggleSidebar?.(),
    toggleUtil: () => window.__kmToggleUtil?.(),
    toggleCrumb: () => window.__kmToggleCrumb?.(),
    fullscreenGraph: () => $expand?.click(),
    openHelp, closeHelp
  };

  const bindings = [
    { id: 'search-ctrlk', when: e => isMod(e) && key(e, 'k'), action: 'focusSearch', inEditable: true, help: 'Ctrl/Cmd + K' },
    { id: 'search-slash', when: e => key(e, '/') && noMods(e), action: 'focusSearch', help: '/' },
    { id: 'search-s', when: e => key(e, 's') && noMods(e), action: 'focusSearch', help: 'S' },
    { id: 'left', when: e => keyIn(e, ['a','q']) && noMods(e), action: 'toggleSidebar', help: 'A or Q' },
    { id: 'right', when: e => key(e, 'd') && noMods(e), action: 'toggleUtil', help: 'D' },
    { id: 'crumb', when: e => keyIn(e, ['w','z']) && noMods(e), action: 'toggleCrumb', help: 'W or Z' },
    { id: 'theme', when: e => key(e, 't') && noMods(e), action: 'toggleTheme', help: 'T' },
    { id: 'graph', when: e => key(e, 'g') && noMods(e), action: 'fullscreenGraph', help: 'G' },
    { id: 'help', when: e => key(e, '?') || (e.shiftKey && key(e, '/')), action: 'openHelp', help: '?' },
    { id: 'escape', when: e => key(e, 'Escape'), action: e => { const host = document.getElementById('kb-help'); if (host && !host.hidden) { e.preventDefault(); actions.closeHelp(); } }, inEditable: true }
  ];

  function ensureKbHelp() {
    let host = DOC.getElementById('kb-help');
    if (host) return host;
    host = el('div', { id: 'kb-help', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Keyboard shortcuts', hidden: true, tabIndex: '-1' });
    const panel = el('div', { class: 'panel' });
    const title = el('h2', { textContent: 'Keyboard shortcuts' });
    const closeBtn = el('button', { type: 'button', class: 'close', title: 'Close', 'aria-label': 'Close help', textContent: '✕', onclick: () => actions.closeHelp() });
    const header = el('header', {}, [title, closeBtn]);

    const items = [
      { desc: 'Focus search', ids: ['search-slash', 'search-ctrlk', 'search-s'] },
      { desc: 'Toggle header (breadcrumbs)', ids: ['crumb'] },
      { desc: 'Toggle left sidebar (pages & search)', ids: ['left'] },
      { desc: 'Toggle right sidebar (graph & ToC)', ids: ['right'] },
      { desc: 'Cycle theme (light / dark)', ids: ['theme'] },
      { desc: 'Toggle fullscreen graph', ids: ['graph'] },
      { desc: 'Close panels & overlays', keys: ['Esc'] },
      { desc: 'Show this help panel', ids: ['help'] }
    ];

    const list = el('ul');
    const kb = s => `<kbd>${s}</kbd>`;

    for (const { desc, ids, keys } of items) {
      const li = el('li');
      const left = el('span', { class: 'desc', textContent: desc });
      let rightHTML = '';
      if (keys) rightHTML = keys.map(kb).join(', ');
      else if (ids) {
        const shows = ids.map(id => bindings.find(b => b.id === id)?.help).filter(Boolean);
        rightHTML = shows.map(kb).join(', ');
      }
      const right = el('span', { innerHTML: rightHTML });
      li.append(left, right);
      list.append(li);
    }

    panel.append(header, list);
    host.append(panel);
    DOC.body.appendChild(host);
    return host;
  }

  function openHelp() {
    const host = ensureKbHelp();
    host.hidden = false;
    const focusables = host.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])');
    const first = focusables[0], last = focusables[focusables.length - 1];
    host.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    });
    (first || host).focus();
  }
  function closeHelp() {
    const host = document.getElementById('kb-help');
    if (host) host.hidden = true;
  }

  addEventListener('keydown', e => {
    const tgt = e.target;
    if (isEditable(tgt)) {
      for (const b of bindings) {
        if (!b.inEditable) continue;
        if (b.when(e)) {
          e.preventDefault();
          typeof b.action === 'string' ? actions[b.action]() : b.action(e);
          return;
        }
      }
      return;
    }
    for (const b of bindings) {
      if (b.when(e)) {
        e.preventDefault();
        typeof b.action === 'string' ? actions[b.action]() : b.action(e);
        return;
      }
    }
  }, { capture: true });
}

export function initPanelToggles() {
  const MQ_DESKTOP = window.matchMedia('(min-width: 1000px), (orientation: landscape)');
  const ROOT = document.body;

  function setHidden(flag, cls, region) {
    ROOT.classList.toggle(cls, !!flag);
    if (region) region.setAttribute('aria-hidden', flag ? 'true' : 'false');
  }

  window.__kmToggleSidebar = () =>
    setHidden(!ROOT.classList.contains('hide-sidebar'), 'hide-sidebar', $('#sidebar'));
  window.__kmToggleUtil = () =>
    setHidden(!ROOT.classList.contains('hide-util'), 'hide-util', $('#util'));
  window.__kmToggleCrumb = () =>
    setHidden(!ROOT.classList.contains('hide-crumb'), 'hide-crumb', $('#crumb'));

  // Reset toggles when switching to condensed layouts
  function resetForCondensed() {
    ROOT.classList.remove('hide-sidebar', 'hide-util', 'hide-crumb');
    $('#sidebar')?.setAttribute('aria-hidden', 'false');
    $('#util')?.setAttribute('aria-hidden', 'false');
    $('#crumb')?.setAttribute('aria-hidden', 'false');
  }
  MQ_DESKTOP.addEventListener('change', () => { if (!MQ_DESKTOP.matches) resetForCondensed(); });
}
