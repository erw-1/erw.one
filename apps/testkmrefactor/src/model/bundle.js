import { el } from '../core/dom.js';

// Expressions utilitaires (précompilées)
const RE_FENCE = /^(?:```|~~~)/;
const RE_HEADING = /^(#{1,6})\s+/;
const RE_HEADING_FULL = /^(#{1,6})\s+(.+)/;

export let pages = [];
export let byId  = new Map();
export let root  = null;

const descMemo = new Map();
const pageHTMLLRU = new Map(); // id → html
const PAGE_HTML_LRU_MAX = 40;

export function hashOf(page) { return page?.hash ?? ''; }

export function find(segs) {
  let n = root;
  for (const id of segs) {
    const c = n.children.find(k => k.id === id);
    if (!c) break;
    n = c;
  }
  return n;
}

export function nav(page) {
  if (page) location.hash = '#' + hashOf(page);
}

export function parseMarkdownBundle(txt) {
  pages = []; byId = new Map(); root = null;
  descMemo.clear(); pageHTMLLRU.clear();

  const m = txt.matchAll(/<!--([\s\S]*?)-->\s*([\s\S]*?)(?=<!--|$)/g);
  for (const [, hdr, body] of m) {
    const meta = {};
    hdr.replace(/(\w+):"([^"]+)"/g, (_, k, v) => (meta[k] = v.trim()));
    const page = { ...meta, content: (body || '').trim(), children: [] };
    pages.push(page); byId.set(page.id, page);
  }
  if (!pages.length) throw new Error('No pages parsed from MD bundle.');

  root = byId.get('home') || pages[0];

  pages.forEach(p => {
    if (p !== root) {
      const parent = byId.get((p.parent || '').trim());
      p.parent = parent || null;
      if (parent) parent.children.push(p);
    } else {
      p.parent = null;
    }
    p.tagsSet = new Set((p.tags || '').split(',').map(s => s.trim()).filter(Boolean));
    p.titleL  = (p.title || '').toLowerCase();
    p.tagsL   = [...p.tagsSet].join(' ').toLowerCase();
    p.bodyL   = (p.content || '').toLowerCase();
    p.searchStr = (p.titleL + ' ' + p.tagsL + ' ' + p.bodyL);
  });

  // Sections per heading
  pages.forEach(p => {
    const counters = [0,0,0,0,0,0];
    const sections = [];
    let inFence = false, offset = 0, prev = null;

    for (const line of p.content.split(/\r?\n/)) {
      if (RE_FENCE.test(line)) inFence = !inFence;
      if (!inFence && RE_HEADING.test(line)) {
        if (prev) {
          prev.body = p.content.slice(prev.bodyStart, offset).trim();
          prev.search = (prev.txt + ' ' + prev.body).toLowerCase();
          sections.push(prev);
        }
        const [, hashes, txt] = line.match(RE_HEADING_FULL);
        const level = hashes.length - 1;
        counters[level]++; for (let i = level + 1; i < 6; i++) counters[i] = 0;
        prev = { id: counters.slice(0, level + 1).filter(Boolean).join('_'),
                 txt: txt.trim(), bodyStart: offset + line.length + 1 };
      }
      offset += line.length + 1;
    }
    if (prev) { prev.body = p.content.slice(prev.bodyStart).trim();
                prev.search = (prev.txt + ' ' + prev.body).toLowerCase();
                sections.push(prev); }
    p.sections = sections;
  });
}

export function computeHashes() {
  pages.forEach(p => {
    const segs = [];
    for (let n = p; n && n.parent; n = n.parent) segs.unshift(n.id);
    p.hash = segs.join('#'); // "" pour root
  });
}

export function numberHeadings(elm) {
  const counters = [0,0,0,0,0,0,0];
  elm.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
    if (h.id) return;
    const level = +h.tagName[1] - 1;
    counters[level]++; for (let i = level + 1; i < 7; i++) counters[i] = 0;
    h.id = counters.slice(0, level + 1).filter(Boolean).join('_');
  });
}

export async function getParsedHTML(page, parser) {
  if (pageHTMLLRU.has(page.id)) {
    const html = pageHTMLLRU.get(page.id);
    pageHTMLLRU.delete(page.id); pageHTMLLRU.set(page.id, html);
    return html;
  }
  const tmp = el('div');
  tmp.innerHTML = parser.parse(page.content, { headerIds: false });
  numberHeadings(tmp);
  const html = tmp.innerHTML;
  pageHTMLLRU.set(page.id, html);
  if (pageHTMLLRU.size > PAGE_HTML_LRU_MAX) {
    const firstKey = pageHTMLLRU.keys().next().value;
    pageHTMLLRU.delete(firstKey);
  }
  return html;
}