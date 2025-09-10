/* eslint-env browser, es2022 */
'use strict';

import { $, domReady } from './dom.js';

// Keep tiny public surface for interop/testing if you rely on window.KM
window.KM = window.KM || {};
const KM = window.KM;

/**
 * App boot sequence:
 *  - lazy-import data/render/ui
 *  - init data (reads #km-config, fetches + parses MD, builds model)
 *  - init UI (sidebar/header/toggles/etc.)
 *  - route current hash and listen for hash changes
 */
async function boot() {
  await domReady();

  try {
    // Lazy (parallel) load of the other modules we’ll create next
    const [data, render, ui] = await Promise.all([
      import('./data.js'),   // exposes: init(), parseTarget(), hashOf(), root, nav()
      import('./render.js'), // exposes: showPage(page, anchor)
      import('./ui.js'),     // exposes: init(ctx), onRoute(page, anchor)
    ]);

    // Build data model from config + MD bundle
    await data.init();

    // Wire global nav helper (optional, handy for interop)
    KM.nav = (page) => { location.hash = '#' + data.hashOf(page); };

    // Init UI (sidebar, header, theme toggle, graph, etc.)
    await ui.init({
      data: {
        root: data.root,
        hashOf: data.hashOf,
        nav: data.nav ?? KM.nav,
      }
    });

    // Router
    function route(hash = location.hash) {
      const target = data.parseTarget(hash);
      if (!target) return; // non-existent path treated as no-op
      render.showPage(target.page, target.anchor);
      ui.onRoute?.(target.page, target.anchor);
    }

    // Initial render + navigation events
    window.addEventListener('hashchange', () => route(location.hash));
    route(location.hash || '#');

  } catch (err) {
    // Fail visibly (and noisily in console) instead of a blank page
    const host = $('#content') || document.body;
    host.innerHTML = `<pre class="km-error">Boot error: ${String(err?.message || err)}</pre>`;
    console.error(err);
  }
}

boot();
