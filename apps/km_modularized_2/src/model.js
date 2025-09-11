import { RE_FENCE, RE_HEADING, RE_HEADING_FULL } from './config_dom.js';

let pages = [];
let byId = new Map();
let root = null;
const descMemo = new Map();
const PAGE_HTML_LRU_MAX = 40;
const pageHTMLLRU = new Map();

export function parseMarkdownBundle(txt) {
  pages = [];
  byId = new Map();
  root = null;
  descMemo.clear();
  pageHTMLLRU.clear();

  const m = txt.matchAll(/<!--([\s\S]*?)-->\s*([\s\S]*?)(?=<!--|$)/g);
  for (const [, hdr, body] of m) {
    const meta = {};
    hdr.replace(/(\w+):"([^"]+)"/g, (_, k, v) => (meta[k] = v.trim()));
    const page = { ...meta, content: (body || '').trim(), children: [] };
    pages.push(page);
    byId.set(page.id, page);
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
    p.titleL = (p.title || '').toLowerCase();
    p.tagsL = [...p.tagsSet].join(' ').toLowerCase();
    p.bodyL = (p.content || '').toLowerCase();
    p.searchStr = `${p.titleL} ${p.tagsL} ${p.bodyL}`;
  });

  pages.forEach(p => {
    const counters = [0, 0, 0, 0, 0, 0];
    const sections = [];
    let inFence = false, offset = 0, prev = null;

    for (const line of p.content.split(/\r?\n/)) {
      if (RE_FENCE.test(line)) inFence = !inFence;
      if (!inFence && RE_HEADING.test(line)) {
        if (prev) {
          prev.body = p.content.slice(prev.bodyStart, offset).trim();
          prev.search = `${prev.txt} ${prev.body}`.toLowerCase();
          sections.push(prev);
        }
        const [, hashes, txt] = line.match(RE_HEADING_FULL);
        const level = hashes.length - 1;
        counters[level]++;
        for (let i = level + 1; i < 6; i++) counters[i] = 0;
        prev = {
          id: counters.slice(0, level + 1).filter(Boolean).join('_'),
          txt: txt.trim(),
          bodyStart: offset + line.length + 1
        };
      }
      offset += line.length + 1;
    }
    if (prev) {
      prev.body = p.content.slice(prev.bodyStart).trim();
      prev.search = `${prev.txt} ${prev.body}`.toLowerCase();
      sections.push(prev);
    }
    p.sections = sections;
  });
}

export function descendants(page) {
  if (descMemo.has(page)) return descMemo.get(page);
  let n = 0;
  (function rec(x) { x.children.forEach(c => { n++; rec(c); }); })(page);
  descMemo.set(page, n);
  return n;
}

export function attachSecondaryHomes() {
  const topOf = p => { while (p.parent) p = p.parent; return p; };
  const clusters = new Map();

  for (const p of pages) {
    const top = topOf(p);
    if (top === root) continue;
    if (!clusters.has(top)) clusters.set(top, []);
    clusters.get(top).push(p);
  }

  let cid = 0;
  for (const [, members] of clusters) {
    const rep = members.reduce((a, b) => (descendants(b) > descendants(a) ? b : a), members[0]);
    if (!rep.parent) {
      rep.parent = root;
      rep.isSecondary = true;
      rep.clusterId = cid++;
      root.children.push(rep);
    }
  }
}

export function computeHashes() {
  pages.forEach(p => {
    const segs = [];
    for (let n = p; n && n.parent; n = n.parent) segs.unshift(n.id);
    p.hash = segs.join('#');
  });
}
export const hashOf = page => page?.hash ?? '';

export const find = segs => {
  let n = root;
  for (const id of segs) {
    const c = n.children.find(k => k.id === id);
    if (!c) break;
    n = c;
  }
  return n;
};

export function nav(page) {
  if (page) location.hash = '#' + hashOf(page);
}
export const __model = {
  get pages() { return pages; },
  get root() { return root; },
  get byId() { return byId; }
};

export function getFromHTMLLRU(pageId) {
  if (!pageHTMLLRU.has(pageId)) return null;
  const html = pageHTMLLRU.get(pageId);
  pageHTMLLRU.delete(pageId);
  pageHTMLLRU.set(pageId, html);
  return html;
}

export function setHTMLLRU(pageId, html) {
  pageHTMLLRU.set(pageId, html);
  if (pageHTMLLRU.size > PAGE_HTML_LRU_MAX) {
    const firstKey = pageHTMLLRU.keys().next().value;
    pageHTMLLRU.delete(firstKey);
  }
}

export const __collator = new Intl.Collator(undefined, { sensitivity: 'base' });
export const sortByTitle = (a, b) => __collator.compare(a.title, b.title);
