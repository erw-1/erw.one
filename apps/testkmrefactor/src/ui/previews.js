/* eslint-env browser, es2022 */
import { $, $$, el } from '../core/dom.js';
import { parseTarget } from '../app/router.js';
import { pages } from '../model/bundle.js';

let tip;

function ensureTip() {
  tip ||= el('div', { class: 'km-preview', style: 'position:fixed;inset:auto auto 0 0;display:none;max-width:min(40ch, 60vw);' });
  document.body.append(tip);
}

function snippetFor(target) {
  const { page, anchor } = parseTarget(target);
  if (!page) return null;
  if (!anchor) {
    return (page.content || '').split(/\n/).slice(0, 6).join('\n').trim();
  }
  const sec = page.sections?.find(s => s.id === anchor);
  return sec ? (sec.body || '').split(/\n/).slice(0, 8).join('\n').trim() : null;
}

export function initLinkPreviews(rootEl = document) {
  ensureTip();

  rootEl.addEventListener('mouseover', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const snip = snippetFor(a.getAttribute('href'));
    if (!snip) return;
    tip.style.display = 'block';
    tip.textContent = snip;
  }, true);

  rootEl.addEventListener('mousemove', (e) => {
    if (!tip || tip.style.display === 'none') return;
    const x = Math.min(e.clientX + 16, window.innerWidth - 20);
    const y = Math.min(e.clientY + 16, window.innerHeight - 20);
    tip.style.left = x + 'px';
    tip.style.top  = y + 'px';
  }, true);

  rootEl.addEventListener('mouseout', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (a) tip.style.display = 'none';
  }, true);
}
