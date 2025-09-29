/* eslint-env browser, es2022 */
'use strict';

import { DOC, $, $$, el, HEADINGS_SEL } from './config_dom.js';
import { __model, hashOf, nav } from './model.js';

/** Centralized helpers & config **/
export const DEFAULT_TREE_OPEN_DEPTH = 2; // folders open by default up to this depth

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

/**
 * Standalone tree renderer used by buildTree()
 * @param {Array} nodes - page-like nodes
 * @param {HTMLElement|DocumentFragment} container
 * @param {Object} opts
 * @param {number} opts.openDepth - folders open by default when depth < openDepth
 * @param {number} depth - current depth (internal)
 */
function renderTree(nodes, container, opts, depth = 0) {
  const openDepth = Number.isFinite(opts?.openDepth) ? opts.openDepth : DEFAULT_TREE_OPEN_DEPTH;
  nodes.forEach(p => {
    const li = el('li', { role: 'treeitem' });
    if (p.children.length) {
      const open = depth < openDepth;
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
      renderTree(p.children, sub, opts, depth + 1);
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
}

/** Build the collapsible tree in the sidebar */
export function buildTree(options = {}) {
  const ul = $('#tree');
  const { root } = __model;
  if (!ul || !root) return;

  ul.setAttribute('role', 'tree');
  ul.innerHTML = '';

  const prim = root.children.filter(c    => !c.isSecondary);
  const secs = root.children.filter(c    => c.isSecondary)
                            .sort((a, b) => a.clusterId - b.clusterId);

  const frag = DOC.createDocumentFragment();
  renderTree(prim, frag, { openDepth: options.openDepth ?? DEFAULT_TREE_OPEN_DEPTH });

  secs.forEach(rep => {
    const sep = el('div', {
      class: 'group-sep',
      role: 'presentation',
      'aria-hidden': 'true'
    }, el('hr', { role: 'presentation', 'aria-hidden': 'true' }));
    frag.append(sep);
    renderTree([rep], frag, { openDepth: options.openDepth ?? DEFAULT_TREE_OPEN_DEPTH });
  });

  ul.append(frag);
}

/** Highlight current page in the tree and open ancestors */
export function highlightSidebar(page) {
  const rootEl = $('#tree');
  if (!rootEl || !page) return;

  rootEl.querySelectorAll('.sidebar-current').forEach(a => a.classList.remove('sidebar-current'));
  const a = rootEl.querySelector(`a[data-page="\${page.id}"]`);
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
      siblings.forEach(s => {
        const li = el('li');
        const btn = el('button', { type: 'button', class: 'crumb-sibling', textContent: s.title });
        btn.addEventListener('click', () => nav(s));
        li.append(btn);
        ul.append(li);
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
    page.children.slice().sort((a, b) => a.title.localeCompare(b.title)).forEach(ch => {
      const li = el('li');
      const btn = el('button', { type: 'button', class: 'crumb-child', textContent: ch.title });
      btn.addEventListener('click', () => nav(ch));
      li.append(btn);
      ul.append(li);
    });
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
      const a = $(`#toc li[data-hid="\${id}"] > a`);
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

/** Keyboard shortcuts **/

function makeActions() {
  const $search = $('#search');
  const $theme  = $('#theme-toggle');
  const $expand = $('#expand');
  const $kbIcon = $('#kb-icon');

  const actions = {
    focusSearch: () => $search?.focus(),
    toggleTheme: () => $theme?.click(),
    toggleSidebar: () => window.__kmToggleSidebar?.(),
    toggleUtil: () => window.__kmToggleUtil?.(),
    toggleCrumb: () => window.__kmToggleCrumb?.(),
    fullscreenGraph: () => $expand?.click(),
    openHelp: () => openHelpDialog(),
    closeHelp: () => closeHelpDialog()
  };

  $kbIcon?.addEventListener('click', (e) => { e.preventDefault(); actions.openHelp(); });

  return actions;
}

function registerShortcuts(bindings, actions) {
  const isEditable = el => !!(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/i.test(el.tagName)));
  addEventListener('keydown', e => {
    const tgt = e.target;
    const list = isEditable(tgt) ? bindings.filter(b => b.inEditable) : bindings;
    for (const b of list) {
      if (b.when(e)) {
        e.preventDefault();
        typeof b.action === 'string' ? actions[b.action]() : b.action(e);
        return;
      }
    }
  }, { capture: true });
}

function createBindings() {
  const key = (e, k) => e.key === k || e.key.toLowerCase() === k.toLowerCase();
  const keyIn = (e, list) => list.some(k => key(e, k));
  const isMod = e => e.ctrlKey || e.metaKey;
  const noMods = e => !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;

  // Define actions with multiple equivalent keys to reduce duplication
  const combos = [
    { id: 'focusSearch', whens: [
      e => isMod(e) && key(e, 'k'),
      e => key(e, '/') && noMods(e),
      e => key(e, 's') && noMods(e)
    ], help: ['Ctrl/Cmd + K', '/', 'S'], inEditable: true },
    { id: 'toggleSidebar', whens: [ e => keyIn(e, ['a','q']) && noMods(e) ], help: ['A', 'Q'] },
    { id: 'toggleUtil',    whens: [ e => key(e, 'd') && noMods(e) ], help: ['D'] },
    { id: 'toggleCrumb',   whens: [ e => keyIn(e, ['w','z']) && noMods(e) ], help: ['W', 'Z'] },
    { id: 'toggleTheme',   whens: [ e => key(e, 't') && noMods(e) ], help: ['T'] },
    { id: 'fullscreenGraph', whens: [ e => key(e, 'g') && noMods(e) ], help: ['G'] },
    { id: 'openHelp', whens: [ e => key(e, '?') || (e.shiftKey && key(e, '/')) ], help: ['?'] },
  ];

  // Expand to flat binding list
  const bindings = [];
  for (const c of combos) {
    for (const when of c.whens) {
      bindings.push({ id: c.id, when, action: c.id, inEditable: !!c.inEditable, help: c.help.join(', ') });
    }
  }
  // Escape is special (UI-only, not shown in help items list)
  bindings.push({
    id: 'escape',
    when: e => key(e, 'Escape'),
    action: e => { const host = document.getElementById('kb-help'); if (host && !host.hidden) { e.preventDefault(); closeHelpDialog(); } },
    inEditable: true
  });

  return { bindings, combos };
}

function createHelpDialog(combos) {
  let host = DOC.getElementById('kb-help');
  if (host) return host;
  host = el('div', { id: 'kb-help', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Keyboard shortcuts', hidden: true, tabIndex: '-1' });
  const panel = el('div', { class: 'panel' });
  const title = el('h2', { textContent: 'Keyboard shortcuts' });
  const closeBtn = el('button', { type: 'button', class: 'close', title: 'Close', 'aria-label': 'Close help', textContent: '✕' });
  closeBtn.addEventListener('click', () => closeHelpDialog());
  const header = el('header', {}, [title, closeBtn]);

  const items = [
    { desc: 'Focus search', id: 'focusSearch' },
    { desc: 'Toggle header (breadcrumbs)', id: 'toggleCrumb' },
    { desc: 'Toggle left sidebar (pages & search)', id: 'toggleSidebar' },
    { desc: 'Toggle right sidebar (graph & ToC)', id: 'toggleUtil' },
    { desc: 'Cycle theme (light / dark)', id: 'toggleTheme' },
    { desc: 'Toggle fullscreen graph', id: 'fullscreenGraph' },
    { desc: 'Close panels & overlays', keys: ['Esc'] },
    { desc: 'Show this help panel', id: 'openHelp' }
  ];

  const list = el('ul');
  const kb = s => `<kbd>\${s}</kbd>`;

  for (const { desc, id, keys } of items) {
    const li = el('li');
    const left = el('span', { class: 'desc', textContent: desc });
    let rightHTML = '';
    if (keys) rightHTML = keys.map(kb).join(', ');
    else if (id) {
      const combo = combos.find(c => c.id === id);
      const shows = combo?.help || [];
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

function openHelpDialog() {
  const host = createHelpDialog(createBindings().combos);
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

function closeHelpDialog() {
  const host = document.getElementById('kb-help');
  if (host) host.hidden = true;
}

/** Initialize keyboard shortcuts */
export function initKeybinds() {
  const actions = makeActions();
  const { bindings } = createBindings();
  registerShortcuts(bindings, actions);
}

export function initPanelToggles() {
  const MQ_DESKTOP = window.matchMedia('(min-width: 1000px), (orientation: landscape)');
  const ROOT = document.body;

  function setHidden(flag, cls, region) {
    ROOT.classList.toggle(cls, !!flag);
    if (region) region.setAttribute('aria-hidden', flag ? 'true' : 'false');
  }

  // Keep globals for backward compatibility,
  // but also support data-action buttons to avoid tightly coupling HTML to names.
  const toggleSidebar = () => setHidden(!ROOT.classList.contains('hide-sidebar'), 'hide-sidebar', $('#sidebar'));
  const toggleUtil    = () => setHidden(!ROOT.classList.contains('hide-util'),    'hide-util',    $('#util'));
  const toggleCrumb   = () => setHidden(!ROOT.classList.contains('hide-crumb'),   'hide-crumb',   $('#crumb'));

  window.__kmToggleSidebar = toggleSidebar;
  window.__kmToggleUtil = toggleUtil;
  window.__kmToggleCrumb = toggleCrumb;

  // Event delegation for buttons with data-action attributes
  DOC.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const act = t.getAttribute('data-action');
    if (!act) return;
    if (act === 'toggle-sidebar')       { e.preventDefault(); toggleSidebar(); }
    else if (act === 'toggle-util')     { e.preventDefault(); toggleUtil(); }
    else if (act === 'toggle-crumb')    { e.preventDefault(); toggleCrumb(); }
  });

  // Reset toggles when switching to condensed layouts
  function resetForCondensed() {
    ROOT.classList.remove('hide-sidebar', 'hide-util', 'hide-crumb');
    $('#sidebar')?.setAttribute('aria-hidden', 'false');
    $('#util')?.setAttribute   ('aria-hidden', 'false');
    $('#crumb')?.setAttribute  ('aria-hidden', 'false');
  }
  MQ_DESKTOP.addEventListener('change', () => { if (!MQ_DESKTOP.matches) resetForCondensed(); });
}
