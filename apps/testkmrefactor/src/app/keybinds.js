// keybinds.js — fidèle au km_testing.js (aide + raccourcis) :contentReference[oaicite:1]{index=1}
(() => {
  const $ = (s) => document.querySelector(s);

  // --- Element refs
  const $search = $('#search');
  const $theme  = $('#theme-toggle');
  const $expand = $('#expand');
  const $kbIcon = $('#kb-icon');

  // --- Utilities
  const isEditable = (el) => !!(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/i.test(el.tagName)));
  const key   = (e, k) => e.key === k || e.key.toLowerCase() === (k + '').toLowerCase();
  const keyIn = (e, list) => list.some((k) => key(e, k));
  const isMod = (e) => e.ctrlKey || e.metaKey;
  const noMods = (e) => !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;

  // --- Actions
  let _helpOpener = null;
  const actions = {
    focusSearch:    () => $search?.focus(),
    toggleTheme:    () => $theme?.click(),
    toggleSidebar:  () => window.__kmToggleSidebar?.(),
    toggleUtil:     () => window.__kmToggleUtil?.(),
    toggleCrumb:    () => window.__kmToggleCrumb?.(),
    fullscreenGraph:() => $expand?.click(),
    openHelp,
    closeHelp,
  };

  // --- Key bindings (single source of truth)
  // `inEditable: true` => autorisé dans les champs éditables
  const bindings = [
    { id: 'search-ctrlk', when: (e) => isMod(e) && key(e, 'k'), action: 'focusSearch', inEditable: true, help: 'Ctrl/Cmd + K' },
    { id: 'search-slash', when: (e) => key(e, '/') && !e.shiftKey && noMods(e), action: 'focusSearch', help: '/' },
    { id: 'search-s',     when: (e) => key(e, 's') && noMods(e), action: 'focusSearch', help: 'S' },
    { id: 'left',         when: (e) => keyIn(e, ['a', 'q']) && noMods(e), action: 'toggleSidebar', help: 'A or Q' },
    { id: 'right',        when: (e) => key(e, 'd') && noMods(e), action: 'toggleUtil', help: 'D' },
    { id: 'crumb',        when: (e) => keyIn(e, ['w', 'z']) && noMods(e), action: 'toggleCrumb', help: 'W or Z' },
    { id: 'theme',        when: (e) => key(e, 't') && noMods(e), action: 'toggleTheme', help: 'T' },
    { id: 'graph',        when: (e) => key(e, 'g') && noMods(e), action: 'fullscreenGraph', help: 'G' },
    { id: 'help',         when: (e) => key(e, '?') || (e.shiftKey && key(e, '/')), action: 'openHelp', help: '?' },
    // Escape closes help only (let other Esc handlers elsewhere continue to work)
    { id: 'escape', when: (e) => key(e, 'Escape'), action: (e) => { const host = document.getElementById('kb-help'); if (host && !host.hidden) { e.preventDefault(); actions.closeHelp(); } }, inEditable: true }
  ]; // :contentReference[oaicite:2]{index=2}

  // --- Help panel (built from `bindings` so it never drifts)
  function el(tag, attrs = {}, kids = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'textContent') n.textContent = v;
      else if (k === 'innerHTML') n.innerHTML = v;
      else if (k === 'onclick' && typeof v === 'function') n.addEventListener('click', v);
      else n.setAttribute(k, v);
    }
    for (const k of kids) n.append(k);
    return n;
  }

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
      if (keys) {
        rightHTML = keys.map(kb).join(', ');
      } else if (ids) {
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
  } // :contentReference[oaicite:3]{index=3}

  function openHelp() {
    const host = ensureKbHelp();
    window.openHelp = openHelp;
    host.hidden = false;
    _helpOpener = document.activeElement;
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
    _helpOpener?.focus?.();
  } // :contentReference[oaicite:4]{index=4}

  // --- Global keydown handler
  addEventListener('keydown', (e) => {
    const tgt = e.target;

    // If typing in an editable control, allow only bindings explicitly marked for it
    if (isEditable(tgt)) {
      for (const b of bindings) {
        if (!b.inEditable) continue;
        if (b.when(e)) {
          e.preventDefault();
          typeof b.action === 'string' ? actions[b.action]() : b.action(e);
          return;
        }
      }
      return; // ignore the rest while editing
    }

    for (const b of bindings) {
      if (b.when(e)) {
        e.preventDefault();
        typeof b.action === 'string' ? actions[b.action]() : b.action(e);
        return;
      }
    }
  }, { capture: true }); // :contentReference[oaicite:5]{index=5}

  // --- Open help via icon
  $kbIcon?.addEventListener('click', (e) => { e.preventDefault(); actions.openHelp(); });

  // --- Close help on click outside the panel
  document.addEventListener('click', (e) => {
    const host = document.getElementById('kb-help');
    if (!host || host.hidden) return;
    if (e.target === host) actions.closeHelp();
  });
})();
