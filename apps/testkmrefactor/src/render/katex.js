/* eslint-env browser, es2022 */
import { $$ } from '../core/dom.js';

let katex, cssLoaded = false;
const KATEX_OPTS = { throwOnError: false, output: 'html' };

export async function ensureKatex() {
  if (!katex) {
    katex = (await import('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.mjs')).default;
  }
  if (!cssLoaded) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
    document.head.append(link);
    cssLoaded = true;
  }
  return katex;
}

// ultra-basique : $$...$$ block, $...$ inline (non-gourmand)
export async function renderMathSafe(root = document) {
  await ensureKatex();
  const walk = (el) => {
    for (const n of [...el.childNodes]) {
      if (n.nodeType !== 3) { walk(n); continue; }
      const t = n.nodeValue;
      // block
      const block = t.match(/\$\$([\s\S]+?)\$\$/);
      if (block) {
        const span = document.createElement('div');
        katex.render(block[1], span, { ...KATEX_OPTS, displayMode: true });
        n.replaceWith(span);
        continue;
      }
      // inline (éviter $$)
      const inline = t.match(/(^|[^$])\$([^\s][\s\S]*?[^\s])\$/);
      if (inline) {
        const span = document.createElement('span');
        katex.render(inline[2], span, KATEX_OPTS);
        n.replaceWith(document.createTextNode(inline[1]), span);
      }
    }
  };
  walk(root);
}
