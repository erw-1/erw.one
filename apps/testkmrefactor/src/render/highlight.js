/* eslint-env browser, es2022 */
import { $$ } from '../core/namespace_dom.js';

let hljs, cssLoaded = false;

export async function ensureHighlight() {
  if (!hljs) {
    hljs = (await import('https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/+esm')).default;
  }
  if (!cssLoaded) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/styles/github.min.css';
    document.head.append(link);
    cssLoaded = true;
  }
  return hljs;
}

export async function highlightVisible(root = document) {
  await ensureHighlight();
  const blocks = $$('pre code', root).filter(c => !c.dataset.hlDone);
  if (!blocks.length) return;
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      try { hljs.highlightElement(e.target); } catch {}
      e.target.dataset.hlDone = '1';
      obs.unobserve(e.target);
    });
  }, { rootMargin: '200px 0px' });
  blocks.forEach(b => io.observe(b));
}

