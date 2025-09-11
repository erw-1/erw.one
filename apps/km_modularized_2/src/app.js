/* eslint-env browser, es2022 */
'use strict';

import { DOC, $, $$, el, whenIdle, __getVP, __updateViewport, baseURLNoHash } from './dom.js';
import { CFG, TITLE, MD, DEFAULT_THEME, ACCENT, ALLOW_JS_FROM_MD, CACHE_MIN, readCache, writeCache } from './config.js';
import { __model, parseMarkdownBundle, attachSecondaryHomes, computeHashes } from './model.js';
import { getParsedHTML, decorateExternalLinks, normalizeAnchors, annotatePreviewableLinks, highlightVisibleCode, renderMathSafe, numberHeadings, decorateHeadings, decorateCodeBlocks, wireCopyButtons, __trackObserver, __cleanupObservers } from './markdown.js';
import { buildTree, highlightSidebar, setFolderOpen } from './ui-sidebar.js';
import { search, buildToc, prevNext, seeAlso } from './search.js';
import { buildGraph, highlightCurrent, updateMiniViewport } from './graph.js';
import { buildDeepURL, parseTarget, resetScrollTop } from './router.js';
import './loaders.js'; // registers KM.ensure* on window

const KM = (window.KM = window.KM || {});
let currentPage = null;   // debounces redundant renders on hash changes
let uiInited = false;

// ─────────────────────────── renderer + route ────────────────────────────
function scrollToAnchor(anchor) {
  if (!anchor) return;
  const target = DOC.getElementById(anchor);
  if (target) target.scrollIntoView({ behavior: 'smooth' });
}

async function enhanceRendered(containerEl, page) {
  decorateExternalLinks(containerEl);

  const imgs = $$('img', containerEl);
  imgs.forEach((img, i) => {
    img.loading = 'lazy';
    img.decoding = 'async';
    if (!img.hasAttribute('fetchpriority') && i < 2) img.setAttribute('fetchpriority', 'high');
  });

  normalizeAnchors(containerEl, page, { onlyFootnotes: true });
  annotatePreviewableLinks(containerEl);

  highlightVisibleCode(containerEl); // async

  KM.ensureMarkdown().then(({ renderMermaidLazy }) => renderMermaidLazy(containerEl));
  if (/(\$[^$]+\$|\\\(|\\\[)/.test(page.content)) {
    const obs = __trackObserver(new IntersectionObserver((entries, o) => {
      if (entries.some(en => en.isIntersecting)) {
        KM.ensureKatex().then(() => renderMathSafe(containerEl));
        o.disconnect();
      }
    }, { root: null, rootMargin: '200px 0px', threshold: 0 }), containerEl);
    obs.observe(containerEl);
  }

  decorateHeadings(page, containerEl);
  decorateCodeBlocks(containerEl);
}

async function render(page, anchor) {
  const contentEl = $('#content');
  if (!contentEl) return;
  __cleanupObservers();

  contentEl.dataset.mathRendered = '0';
  contentEl.innerHTML = await getParsedHTML(page);

  if (ALLOW_JS_FROM_MD === 'true') {
    // Run scripts embedded in the Markdown (main content only)
    contentEl.querySelectorAll('script').forEach(old => {
      const s = document.createElement('script');
      for (const { name, value } of [...old.attributes]) s.setAttribute(name, value);
      s.textContent = old.textContent || '';
      old.replaceWith(s);
    });
  }

  await enhanceRendered(contentEl, page);

  buildToc(page);
  prevNext(page);
  seeAlso(page);
  scrollToAnchor(anchor);
}

function route() {
  closePanels();
  const t = parseTarget(location.hash) ?? { page: __model.root, anchor: '' };
  const page = t.page;
  const anchor = t.anchor;

  if (currentPage !== page) {
    currentPage = page;
    breadcrumb(page);
    render(page, anchor);
    highlightCurrent(true);
    highlightSidebar(page);
    if (!anchor) requestAnimationFrame(() => resetScrollTop());
  } else if (anchor) {
    scrollToAnchor(anchor);
    const a = $(`#toc li[data-hid="${anchor}"] > a`);
    if (a) {
      $('#toc .toc-current')?.classList.remove('toc-current');
      a.classList.add('toc-current');
    }
  }
}

// ───────────────────────────── breadcrumb ────────────────────────────────
function breadcrumb(page) {
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
      siblings.forEach(s => ul.append(el('li', { textContent: s.title, onclick: () => KM.nav(s) })));
      wrap.append(ul);
    }
    dyn.append(wrap);
  });

  if (page.children.length) {
    const box = el('span', { class: 'childbox' }, [el('span', { class: 'toggle', textContent: '▾' }), el('ul')]);
    const ul = box.querySelector('ul');
    page.children.slice().sort((a,b)=>a.title.localeCompare(b.title)).forEach(ch => ul.append(el('li', { textContent: ch.title, onclick: () => KM.nav(ch) })));
    dyn.append(box);
  }
}

// ───────────────────────────── link previews ─────────────────────────────
(function linkPreviews() {
  const previewStack = []; // stack of { el, body, link, timer }
  let hoverDelay = null;

  function rewriteRelativeAnchors(panel, page) { normalizeAnchors(panel.body, page); }

  function positionPreview(panel, linkEl) {
    const rect = linkEl.getBoundingClientRect();
    const { __VPW: vw, __VPH: vh } = __getVP();
    const gap = 8;
    const el = panel.el;
    const W = Math.max(1, el.offsetWidth || 1);
    const H = Math.max(1, el.offsetHeight || 1);
    const preferRight = rect.right + gap + W <= vw;
    const left = preferRight ? Math.min(rect.right + gap, vw - W - gap) : Math.max(gap, rect.left - gap - W);
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
    const activeIsTrigger = !!(active && active.closest && window.KM.isInternalPageLink?.(active.closest('a[href^="#"]')));
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
    document.body.appendChild(container);

    const panel = { el: container, body, link: linkEl, timer: null };
    const idx = previewStack.push(panel) - 1;

    container.addEventListener('mouseenter', () => { clearTimeout(panel.timer); clearTimeout(trimTimer); }, { passive: true });
    container.addEventListener('mouseleave', (e) => {
      const to = e.relatedTarget;
      if (to && (to.closest && to.closest('.km-link-preview'))) return;
      panel.timer = setTimeout(() => { closeFrom(idx); }, 240);
    }, { passive: true });
    header.querySelector('button').addEventListener('click', () => closeFrom(idx));

    container.addEventListener('mouseover', (e) => maybeOpenFromEvent(e), true);
    container.addEventListener('focusin',  (e) => maybeOpenFromEvent(e), true);

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
  KM.isInternalPageLink = isInternalPageLink;

  function maybeOpenFromEvent(e) {
    const a = e.target?.closest?.('a[href^="#"]');
    if (!a || !isInternalPageLink(a)) return;
    clearTimeout(hoverDelay);
    const openNow = e.type === 'focusin';
    if (openNow) openPreviewForLink(a);
    else hoverDelay = setTimeout(() => openPreviewForLink(a), 220);
  }

  let __lpGlobalBound = false;
  KM.attachLinkPreviews = () => {
    const root = $('#content');
    if (!root) return;
    if (root.dataset.kmPreviewsBound === '1') return;
    root.dataset.kmPreviewsBound = '1';
    root.addEventListener('mouseover', maybeOpenFromEvent, true);
    root.addEventListener('focusin',  maybeOpenFromEvent, true);
    root.addEventListener('mouseout', (e) => {
      const to = e.relatedTarget;
      if (to && (to.closest && to.closest('.km-link-preview'))) return;
      scheduleTrim();
    }, true);

    if (!__lpGlobalBound) {
      addEventListener('hashchange', () => closeFrom(0), { passive: true });
      addEventListener('scroll', () => scheduleTrim(), { passive: true });
      __lpGlobalBound = true;
    }
  };
})();

// ───────────────────────────── theme + UI init ───────────────────────────
function closePanels() {
  $('#sidebar')?.classList.remove('open');
  $('#util')?.classList.remove('open');
}

function initUI() {
  try { KM.attachLinkPreviews(); } catch {}

  if (uiInited) return;
  uiInited = true;

  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch {}

  $('#wiki-title-text').textContent = TITLE;
  document.title = TITLE;
  buildTree();

  // THEME
  (function themeInit() {
    const btn = $('#theme-toggle');
    const rootEl = DOC.documentElement;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const stored = localStorage.getItem('km-theme');
    const cfg = (DEFAULT_THEME === 'dark' || DEFAULT_THEME === 'light') ? DEFAULT_THEME : null;
    let dark = stored ? (stored === 'dark') : (cfg ? cfg === 'dark' : media.matches);

    if (typeof ACCENT === 'string' && ACCENT) rootEl.style.setProperty('--color-accent', ACCENT);

    apply(dark);
    if (btn) {
      btn.setAttribute('aria-pressed', String(dark));
      btn.onclick = () => {
        dark = !dark;
        apply(dark);
        btn.setAttribute('aria-pressed', String(dark));
        localStorage.setItem('km-theme', dark ? 'dark' : 'light');
      };
    }

    media.addEventListener?.('change', (e) => {
      const hasUserPref = !!localStorage.getItem('km-theme');
      if (!hasUserPref && !cfg) {
        dark = e.matches;
        apply(dark);
      }
    });

    addEventListener('storage', (e) => {
      if (e.key === 'km-theme') {
        dark = e.newValue === 'dark';
        apply(dark);
      }
    });

    function apply(isDark) {
      rootEl.style.setProperty('--color-main', isDark ? 'rgb(29,29,29)' : 'white');
      rootEl.setAttribute('data-theme', isDark ? 'dark' : 'light');
      KM.ensureHLJSTheme();
      KM.syncMermaidThemeWithPage();
    }
  })();

  // Initial route/render
  route();

  // Lazy-build mini-graph
  const miniElForObserver = $('#mini');
  if (miniElForObserver) {
    new IntersectionObserver((entries, obs) => {
      if (entries[0]?.isIntersecting) { buildGraph(); obs.disconnect(); }
    }).observe(miniElForObserver);
  }

  // Graph fullscreen toggle
  const mini = $('#mini');
  const expandBtn = $('#expand');
  if (expandBtn && mini) {
    expandBtn.onclick = () => {
      const full = mini.classList.toggle('fullscreen');
      expandBtn.setAttribute('aria-pressed', String(full));
      updateMiniViewport();
      requestAnimationFrame(() => highlightCurrent(true));
    };
  }

  // Copy buttons (main)
  wireCopyButtons($('#content'), () => buildDeepURL(currentPage, '') || (baseURLNoHash() + '#'));

  // Search box
  const searchInput = $('#search'), searchClear = $('#search-clear');
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

  // Panels: exclusive toggles
  const togglePanel = sel => {
    const elx = $(sel);
    if (!elx) return;
    const wasOpen = elx.classList.contains('open');
    closePanels();
    if (!wasOpen) {
      elx.classList.add('open');
      if (!elx.querySelector('.panel-close')) elx.append(el('button', {
        type: 'button', class: 'panel-close', 'aria-label': 'Close panel', textContent: '✕', onclick: closePanels
      }));
    }
  };
  $('#burger-sidebar')?.addEventListener('click', () => togglePanel('#sidebar'));
  $('#burger-util')?.addEventListener('click', () => togglePanel('#util'));

  // Resize handling
  const onResize = () => {
    __updateViewport();
    if (matchMedia('(min-width:1001px)').matches) {
      closePanels();
      highlightCurrent(true);
    }
    if ($('#mini')?.classList.contains('fullscreen')) {
      updateMiniViewport();
      highlightCurrent(true);
    }
  };
  __updateViewport();
  addEventListener('resize', onResize, { passive: true });

  // Close panels upon nav clicks
  $('#tree')?.addEventListener('click', e => {
    const caret = e.target.closest('button.caret');
    if (caret) {
      const li = caret.closest('li.folder'), sub = li.querySelector('ul');
      const open = !li.classList.contains('open');
      setFolderOpen(li, open);
      return;
    }
    if (e.target.closest('a')) closePanels();
  }, { passive: true });
  $('#results')?.addEventListener('click', e => { if (e.target.closest('a')) closePanels(); }, { passive: true });

  // Router
  addEventListener('hashchange', route, { passive: true });

  // ESC behavior
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    let acted = false;
    const kb = $('#kb-help');
    if (kb && !kb.hidden) { kb.hidden = true; acted = true; }
    const sidebarOpen = $('#sidebar')?.classList.contains('open');
    const utilOpen = $('#util')?.classList.contains('open');
    if (sidebarOpen || utilOpen) { closePanels(); acted = true; }
    const mini = $('#mini'); const expandBtn = $('#expand');
    if (mini && mini.classList.contains('fullscreen')) {
      mini.classList.remove('fullscreen');
      if (expandBtn) expandBtn.setAttribute('aria-pressed', 'false');
      updateMiniViewport();
      requestAnimationFrame(() => highlightCurrent(true));
      acted = true;
    }
    if (acted) e.preventDefault();
  }, { capture: true });

  // ===== Keyboard Shortcuts (exact behavior preserved) =====
  (function keyboardShortcuts() {
    const $search = $('#search');
    const $theme = $('#theme-toggle');
    const $expand = $('#expand');
    const $kbIcon = $('#kb-icon');

    const isEditable = (el) => !!(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/i.test(el.tagName)));
    const key = (e, k) => e.key === k || e.key.toLowerCase() === (k + '').toLowerCase();
    const keyIn = (e, list) => list.some((k) => key(e, k));
    const isMod = (e) => e.ctrlKey || e.metaKey;
    const noMods = (e) => !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;

    let _helpOpener = null;
    const actions = {
      focusSearch: () => $search?.focus(),
      toggleTheme: () => $theme?.click(),
      toggleSidebar: () => window.__kmToggleSidebar?.(),
      toggleUtil: () => window.__kmToggleUtil?.(),
      toggleCrumb: () => window.__kmToggleCrumb?.(),
      fullscreenGraph: () => $expand?.click(),
      openHelp,
      closeHelp,
    };

    const bindings = [
      { id: 'search-ctrlk', when: (e) => isMod(e) && key(e, 'k'), action: 'focusSearch', inEditable: true, help: 'Ctrl/Cmd + K' },
      { id: 'search-slash', when: (e) => key(e, '/') && !e.shiftKey && !isMod(e), action: 'focusSearch', help: '/' },
      { id: 'search-s', when: (e) => key(e, 's') && noMods(e), action: 'focusSearch', help: 'S' },
      { id: 'left', when: (e) => keyIn(e, ['a', 'q']) && noMods(e), action: 'toggleSidebar', help: 'A or Q' },
      { id: 'right', when: (e) => key(e, 'd') && noMods(e), action: 'toggleUtil', help: 'D' },
      { id: 'crumb', when: (e) => keyIn(e, ['w', 'z']) && noMods(e), action: 'toggleCrumb', help: 'W or Z' },
      { id: 'theme', when: (e) => key(e, 't') && noMods(e), action: 'toggleTheme', help: 'T' },
      { id: 'graph', when: (e) => key(e, 'g') && noMods(e), action: 'fullscreenGraph', help: 'G' },
      { id: 'help', when: (e) => key(e, '?') || (e.shiftKey && key(e, '/')), action: 'openHelp', help: '?' },
      { id: 'escape', when: (e) => key(e, 'Escape'), action: (e) => { const host = document.getElementById('kb-help'); if (host && !host.hidden) { e.preventDefault(); actions.closeHelp(); } }, inEditable: true }
    ];

    function ensureKbHelp() {
      let host = document.getElementById('kb-help');
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
      const kb = (s) => `<kbd>${s}</kbd>`;

      for (const { desc, ids, keys } of items) {
        const li = el('li');
        const left = el('span', { class: 'desc', textContent: desc });
        let rightHTML = '';
        if (keys) rightHTML = keys.map(kb).join(', ');
        else if (ids) {
          const shows = ids.map((id) => bindings.find((b) => b.id === id)?.help).filter(Boolean);
          rightHTML = shows.map(kb).join(', ');
        }
        const right = el('span', { innerHTML: rightHTML });
        li.append(left, right);
        list.append(li);
      }

      panel.append(header, list);
      host.append(panel);
      document.body.appendChild(host);
      return host;
    }

    function openHelp() {
      const host = ensureKbHelp();
      window.openHelp = openHelp;
      host.hidden = false;
      let _helpOpener = document.activeElement;
      const focusables = host.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])');
      const first = focusables[0], last = focusables[focusables.length - 1];
      host.addEventListener('keydown', (e) => {
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

    addEventListener('keydown', (e) => {
      const tgt = e.target;
      if (isEditable(tgt)) {
        for (const b of bindings) {
          if (!b.inEditable) continue;
          if (b.when(e)) { e.preventDefault(); typeof b.action === 'string' ? actions[b.action]() : b.action(e); return; }
        }
        return;
      }
      for (const b of bindings) {
        if (b.when(e)) { e.preventDefault(); typeof b.action === 'string' ? actions[b.action]() : b.action(e); return; }
      }
    }, { capture: true });

    $kbIcon?.addEventListener('click', (e) => { e.preventDefault(); actions.openHelp(); });

    document.addEventListener('click', (e) => {
      const host = document.getElementById('kb-help');
      if (!host || host.hidden) return;
      if (e.target === host) actions.closeHelp();
    });
  })();

  // Desktop-only toggles and condensed reset
  (function desktopPanelToggles() {
    const MQ_DESKTOP = window.matchMedia('(min-width: 1000px), (orientation: landscape)');
    const ROOT = document.body;

    function isCondensed() { return !MQ_DESKTOP.matches; }

    function setHidden(flag, cls, region) {
      ROOT.classList.toggle(cls, !!flag);
      if (region) region.setAttribute('aria-hidden', flag ? 'true' : 'false');
    }

    window.__kmToggleSidebar = () => setHidden(!ROOT.classList.contains('hide-sidebar'), 'hide-sidebar', $('#sidebar'));
    window.__kmToggleUtil    = () => setHidden(!ROOT.classList.contains('hide-util'),    'hide-util',    $('#util'));
    window.__kmToggleCrumb   = () => setHidden(!ROOT.classList.contains('hide-crumb'),   'hide-crumb',   $('#crumb'));

    function resetForCondensed() {
      ROOT.classList.remove('hide-sidebar', 'hide-util', 'hide-crumb');
      $('#sidebar')?.setAttribute('aria-hidden', 'false');
      $('#util')?.setAttribute('aria-hidden', 'false');
      $('#crumb')?.setAttribute('aria-hidden', 'false');
    }

    MQ_DESKTOP.addEventListener('change', () => { if (isCondensed()) resetForCondensed(); });

    $('#kb-btn')?.addEventListener('click', (e) => { e.preventDefault(); (window.openHelp || (() => {}))(); });

    window.__kmIsCondensed = isCondensed;
    window.__kmResetForCondensed = resetForCondensed;
  })();

  whenIdle(() => {
    KM.ensureHighlight();
    KM.ensureMarkdown();
    KM.ensureKatex();
  });
}

// ──────────────────────────────── boot ───────────────────────────────────
(async () => {
  try {
    if (!MD) throw new Error('CONFIG.MD is empty.');
    let txt;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort('fetch-timeout'), 20000);

    const cached = CACHE_MIN > 0 ? readCache(MD) : null;
    const freshEnough = cached && (Date.now() - cached.ts) <= CACHE_MIN * 60_000;

    try {
      if (freshEnough) {
        txt = cached.txt;
      } else {
        const r = await fetch(MD, { cache: 'no-cache', signal: ctrl.signal });
        clearTimeout(timeout);
        if (!r.ok) throw new Error(`Failed to fetch MD (${r.status})`);
        txt = await r.text();
        if (CACHE_MIN > 0) writeCache(MD, txt);
      }
    } catch (err) {
      clearTimeout(timeout);
      if (cached?.txt) {
        console.warn('Network failed; using stale cached Markdown');
        txt = cached.txt;
      } else {
        throw err;
      }
    }

    parseMarkdownBundle(txt);
    attachSecondaryHomes();
    computeHashes();

    // Public nav (faithful small surface)
    KM.nav = (page) => { if (page) location.hash = '#' + (page.hash || ''); };

    // DOM ready + init UI
    if (DOC.readyState === 'loading') await new Promise(res => DOC.addEventListener('DOMContentLoaded', res, { once: true }));
    initUI();

    await new Promise(res => setTimeout(res, 120));
    highlightCurrent(true);
  } catch (err) {
    console.warn('Markdown load failed:', err);
    const elc = $('#content');
    if (elc) elc.innerHTML = `<h1>Content failed to load</h1><p>Could not fetch or parse the Markdown bundle. Check <code>window.CONFIG.MD</code> and network access.</p><pre>${String(err?.message || err)}</pre>`;
  }
})();

