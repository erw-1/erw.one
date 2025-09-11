import { $, el, baseURLNoHash, __getVP } from './config_dom.js';
import { getParsedHTML, normalizeAnchors, wireCopyButtons, __cleanupObservers } from './markdown.js';
import { parseTarget, buildDeepURL, enhanceRendered } from './router_renderer.js';

/**
 * Attach hover previews for internal page links.
 */
export function attachLinkPreviews() {
  const previewStack = []; // stack of { el, body, link, timer }
  let hoverDelay = null;
  let trimTimer = null;

  function positionPreview(panel, linkEl) {
    const rect = linkEl.getBoundingClientRect();
    const { __VPW: vw, __VPH: vh } = __getVP();
    const gap = 8;
    const elx = panel.el;
    const W = Math.max(1, elx.offsetWidth || 1);
    const H = Math.max(1, elx.offsetHeight || 1);
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
    const anyHoverPreview = Array.from(document.querySelectorAll('.km-link-preview'))
                                 .some(p => p.matches(':hover'));
    if (anyHoverPreview) return true;
    const active = document.activeElement;
    const activeIsTrigger = !!(active && active.closest && 
      window.KM.isInternalPageLink?.(active.closest('a[href^="#"]')));
    if (activeIsTrigger) return true;
    return previewStack.some(p => p.link && p.link.matches(':hover'));
  }

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
      el('button', { type: 'button', class: 'km-preview-close', title: 'Close', 'aria-label': 'Close',
                     innerHTML: '✕' })
    ]);
    const body = el('div');
    container.append(header, body);
    document.body.append(container);

    const panel = { el: container, body, link: linkEl, timer: null };
    const idx = previewStack.push(panel) - 1;

    container.addEventListener('mouseenter', () => {
      clearTimeout(panel.timer);
      clearTimeout(trimTimer);
    }, { passive: true });
    container.addEventListener('mouseleave', (e) => {
      const to = e.relatedTarget;
      if (to && to.closest && to.closest('.km-link-preview')) return;
      panel.timer = setTimeout(() => { closeFrom(idx); }, 240);
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
    clearTimeout(hoverDelay);
    if (e.type === 'focusin') {
      openPreviewForLink(a);
    } else {
      hoverDelay = setTimeout(() => openPreviewForLink(a), 220);
    }
  }

  const root = $('#content');
  if (!root) return;
  if (root.dataset.kmPreviewsBound === '1') return;
  root.dataset.kmPreviewsBound = '1';
  root.addEventListener('mouseover', maybeOpenFromEvent, true);
  root.addEventListener('focusin', maybeOpenFromEvent, true);
  root.addEventListener('mouseout', (e) => {
    const to = e.relatedTarget;
    if (to && to.closest && to.closest('.km-link-preview')) return;
    scheduleTrim();
  }, true);

  if (!window.__lpGlobalBound) {
    addEventListener('hashchange', () => closeFrom(0), { passive: true });
    addEventListener('scroll', () => scheduleTrim(), { passive: true });
    window.__lpGlobalBound = true;
  }
}
