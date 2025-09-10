/* eslint-env browser, es2022 */
import { $, $$ } from '../core/namespace_dom.js';
import { getParsedHTML, numberHeadings } from '../model/bundle.js';
import { highlightVisible } from './highlight.js';
import { renderMathSafe } from './katex.js';

export async function enhanceRendered(containerEl, page, md) {
  // liens externes sûrs
  $$('a[href]', containerEl).forEach(a => {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    if (!/^https?:\/\//i.test(href)) return;
    let url; try { url = new URL(href); } catch { return; }
    if (url.origin === location.origin) return;
    a.setAttribute('target','_blank');
    const rel = new Set((a.getAttribute('rel')||'').split(/\s+/).filter(Boolean));
    rel.add('noopener'); rel.add('noreferrer'); rel.add('external');
    a.setAttribute('rel', Array.from(rel).join(' '));
    if (!a.hasAttribute('aria-label')) a.setAttribute('aria-label', `${a.textContent} (new tab, ${url.hostname})`);
  });

  // images progressives
  $$('img', containerEl).forEach((img, i) => {
    img.loading='lazy'; img.decoding='async';
    if (!img.hasAttribute('fetchpriority') && i < 2) img.setAttribute('fetchpriority','high');
  });

  // code: bouton copier
  $$('pre', containerEl).forEach(pre => {
    if (pre.querySelector('button.code-copy')) return;
    const b = document.createElement('button');
    b.className='code-copy'; b.type='button'; b.textContent='Copy';
    b.addEventListener('click', () => {
      const code = pre.querySelector('code');
      const txt = code ? code.innerText : pre.innerText;
      navigator.clipboard?.writeText(txt).catch(()=>{});
    });
    pre.append(b);
  });

  // Mermaid + Math + Highlight.js (lazy)
  await md.renderMermaidLazy(containerEl);
  await renderMathSafe(containerEl);
  await highlightVisible(containerEl);
}

export async function render(contentEl, page, mdParser) {
  contentEl.dataset.mathRendered = '0';
  contentEl.innerHTML = await getParsedHTML(page, mdParser);
  numberHeadings(contentEl);
  await enhanceRendered(contentEl, page, mdParser);
}

