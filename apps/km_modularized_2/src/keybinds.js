import { $, $$, el } from './config_dom.js';

export function initKeybinds() {
  const $search = $('#search');
  const $theme = $('#theme-toggle');
  const $expand = $('#expand');
  const $kbIcon = $('#kb-icon');

  const isEditable = (el) => !!(el && (el.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/i.test(el.tagName)));
  const key = (e, k) => e.key === k || e.key.toLowerCase() === (k + '').toLowerCase();
  const keyIn = (e, list) => list.some(k => key(e, k));
  const isMod = (e) => e.ctrlKey || e.metaKey;
  const noMods = (e) => !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;

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
    { id: 'search-ctrlk', when: (e) => isMod(e) && key(e, 'k'),
      action: 'focusSearch', inEditable: true, help: 'Ctrl/Cmd + K' },
    { id: 'search-slash', when: (e) => key(e, '/') && !e.shiftKey && !isMod(e),
      action: 'focusSearch', help: '/' },
    { id: 'search-s', when: (e) => key(e, 's') && noMods(e),
      action: 'focusSearch', help: 'S' },
    { id: 'left', when: (e) => keyIn(e, ['a', 'q']) && noMods(e),
      action: 'toggleSidebar', help: 'A or Q' },
    { id: 'right', when: (e) => key(e, 'd') && noMods(e),
      action: 'toggleUtil', help: 'D' },
    { id: 'crumb', when: (e) => keyIn(e, ['w', 'z']) && noMods(e),
      action: 'toggleCrumb', help: 'W or Z' },
    { id: 'theme', when: (e) => key(e, 't') && noMods(e),
      action: 'toggleTheme', help: 'T' },
    { id: 'graph', when: (e) => key(e, 'g') && noMods(e),
      action: 'fullscreenGraph', help: 'G' },
    { id: 'help', when: (e) => key(e, '?') || (e.shiftKey && key(e, '/')),
      action: 'openHelp', help: '?' },
    { id: 'escape', when: (e) => key(e, 'Escape'), action: (e) => {
        const host = document.getElementById('kb-help');
        if (host && !host.hidden) {
          e.preventDefault();
          actions.closeHelp();
        }
      }, inEditable: true }
  ];

  function ensureKbHelp() {
    let host = document.getElementById('kb-help');
    if (host) return host;
    host = el('div', { id: 'kb-help', role: 'dialog', 'aria-modal': 'true',
                       'aria-label': 'Keyboard shortcuts', hidden: true, tabIndex: '-1' });
    const panel = el('div', { class: 'panel' });
    const title = el('h2', { textContent: 'Keyboard shortcuts' });
    const closeBtn = el('button', { type: 'button', class: 'close',
      title: 'Close', 'aria-label': 'Close help', textContent: '✕',
      onclick: () => actions.closeHelp() });
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
      if (keys) {
        rightHTML = keys.map(kb).join(', ');
      } else if (ids) {
        const shows = ids.map(id => bindings.find(b => b.id === id)?.help)
                         .filter(Boolean);
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
    const focusables = host.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])');
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    host.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
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

  $$('#kb-icon').forEach(icon => icon.addEventListener('click', (e) => {
    e.preventDefault();
    openHelp();
  }));
}
