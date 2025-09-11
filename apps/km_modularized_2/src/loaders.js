/* eslint-env browser, es2022 */
'use strict';

import { DOC, LANGS } from './config_dom.js';

// Keep tiny global surface
const KM = (window.KM = window.KM || {});

// ───────────────────────────────── helpers ─────────────────────────────────
export const ensureOnce = (fn) => {
  let p;
  return () => (p ||= fn());
};

const isDark = () => DOC.documentElement.getAttribute('data-theme') === 'dark';

const ensureStylesheet = ({ selector, create, href }) => new Promise((res) => {
  let link = DOC.querySelector(selector);
  if (!link) {
    link = DOC.createElement('link');
    Object.assign(link, create);
    DOC.head.appendChild(link);
  }
  if (link.getAttribute('href') === href) return res();
  link.onload = link.onerror = res; // resolve either way; consumers handle absence if needed
  link.href = href;
});

// ────────────────────────────── D3 (trimmed bundle) ──────────────────────────────
KM.ensureD3 = ensureOnce(async () => {
  const [sel, force, drag] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/d3-selection@3.0.0/+esm'),
    import('https://cdn.jsdelivr.net/npm/d3-force@3.0.0/+esm'),
    import('https://cdn.jsdelivr.net/npm/d3-drag@3.0.0/+esm'),
  ]);
  KM.d3 = {
    select: sel.select,
    selectAll: sel.selectAll,
    forceSimulation: force.forceSimulation,
    forceLink: force.forceLink,
    forceManyBody: force.forceManyBody,
    forceCenter: force.forceCenter,
    drag: drag.drag,
  };
});

// ────────────────────────────── highlight.js ──────────────────────────────
KM.ensureHighlight = ensureOnce(async () => {
  const { default: hljs } =
    await import('https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/es/core/+esm');

  if (Array.isArray(LANGS) && LANGS.length) {
    await Promise.allSettled(LANGS.map(async (lang) => {
      try {
        const mod = await import(`https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/es/languages/${lang}/+esm`);
        hljs.registerLanguage(lang, mod.default);
      } catch {}
    }));
  }

  window.hljs = hljs; // expose for highlightElement()
});

// Theme swap for highlight.js (not memoized by design)
KM.ensureHLJSTheme = async () => {
  const THEME = {
    light: 'https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github.min.css',
    dark:  'https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github-dark.min.css',
  };
  await ensureStylesheet({
    selector: 'link[data-hljs-theme]',
    create: { rel: 'stylesheet', 'data-hljs-theme': '' },
    href: THEME[isDark() ? 'dark' : 'light'],
  });
};

// ────────────────────────────────── KaTeX ──────────────────────────────────
KM.ensureKatex = ensureOnce(async () => {
  const BASE = 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/';

  await ensureStylesheet({
    selector: '#katex-css',
    create: { id: 'katex-css', rel: 'stylesheet' },
    href: BASE + 'katex.min.css',
  });

  const [katex, auto] = await Promise.all([
    import(BASE + 'katex.min.js/+esm'),
    import(BASE + 'contrib/auto-render.min.js/+esm'),
  ]);

  window.katex = katex;
  window.renderMathInElement = auto.default;
});

// ───────── Marked + Mermaid + minimal extensions (loaded together) ─────────
let mdReady = null;
KM.ensureMarkdown = () => {
  if (mdReady) return mdReady;

  // symmetric inline extension factory: ==mark==, ^sup^, ~sub~, ++u++
  function createInline({ name, delimiter, tag, hint = delimiter[0], notAfterOpen, notBeforeClose }) {
    const d = delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const after  = notAfterOpen   ? `(?!${notAfterOpen})`     : '';
    const before = notBeforeClose ? `(?!${notBeforeClose})`   : '';
    const re = new RegExp(`^${d}${after}(?=\\S)([\\s\\S]*?\\S)${d}${before}`);

    return {
      name, level: 'inline',
      start(src) { return src.indexOf(hint); },
      tokenizer(src) {
        const m = re.exec(src);
        if (!m) return;
        return { type: name, raw: m[0], text: m[1] };
      },
      renderer(tok) {
        tok.tokens ??= this.lexer.inlineTokens(tok.text);
        return `<${tag}>${this.parser.parseInline(tok.tokens)}</${tag}>`;
      },
    };
  }

  function createCallouts() {
    return {
      name: 'callout', level: 'block',
      start(src) { return src.indexOf(':::'); },
      tokenizer(src) {
        const re = /^:::(success|info|warning|danger)(?:[ \t]+([^\n]*))?[ \t]*\n([\s\S]*?)\n:::[ \t]*(?=\n|$)/;
        const m = re.exec(src);
        if (!m) return;
        const [, kind, title = '', body] = m;
        return { type: 'callout', raw: m[0], kind, title, tokens: this.lexer.blockTokens(body) };
      },
      renderer(tok) {
        const inner = this.parser.parse(tok.tokens);
        const cls = ({ info: 'note', success: 'tip', warning: 'warning', danger: 'caution' })[tok.kind] || 'note';
        return `<div class="md-callout md-${cls}">\n${inner}\n</div>\n`;
      },
    };
  }

  function createSpoiler() {
    return {
      name: 'spoiler', level: 'block',
      start(src) { return src.indexOf(':::spoiler'); },
      tokenizer(src) {
        const re = /^:::spoiler(?:[ \t]+([^\n]*))?[ \t]*\n([\s\S]*?)\n:::[ \t]*(?=\n|$)/;
        const m = re.exec(src);
        if (!m) return;
        const [, title = '', body] = m;
        return { type: 'spoiler', raw: m[0], titleTokens: this.lexer.inlineTokens(title), tokens: this.lexer.blockTokens(body) };
      },
      renderer(tok) {
        const summary = this.parser.parseInline(tok.titleTokens);
        const inner = this.parser.parse(tok.tokens);
        return `<details class="md-spoiler"><summary>${summary}</summary>\n${inner}\n</details>\n`;
      },
    };
  }

  // Markdown ```mermaid``` fenced code to <div class="mermaid">…</div>
  const mermaidExt = {
    name: 'mermaid', level: 'block',
    start(src) { return src.indexOf('```mermaid'); },
    tokenizer(src) {
      const m = /^```(?:mermaid|Mermaid)[ \t]*\n([\s\S]*?)\n```[ \t]*(?=\n|$)/.exec(src);
      if (!m) return;
      return { type: 'mermaid', raw: m[0], text: m[1] };
    },
    renderer(tok) {
      const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<div class="mermaid">${esc(tok.text)}</div>\n`;
    },
  };

  // inline ext instances
  const markExt       = createInline({ name: 'mark',      delimiter: '==', tag: 'mark', hint: '=' });
  const supExt        = createInline({ name: 'sup',       delimiter: '^',  tag: 'sup',  notAfterOpen: '\\[|\\^' });
  const subExt        = createInline({ name: 'sub',       delimiter: '~',  tag: 'sub',  notAfterOpen: '~', notBeforeClose: '~' });
  const underlineExt  = createInline({ name: 'underline', delimiter: '++', tag: 'u',    hint: '+', notAfterOpen: '\\+', notBeforeClose: '\\+' });
  const calloutExt    = createCallouts();
  const spoilerExt    = createSpoiler();

  mdReady = Promise.all([
    import('https://cdn.jsdelivr.net/npm/marked@16.1.2/+esm'),
    import('https://cdn.jsdelivr.net/npm/marked-alert@2.1.2/+esm'),
    import('https://cdn.jsdelivr.net/npm/marked-footnote@1.4.0/+esm'),
    import('https://cdn.jsdelivr.net/npm/marked-emoji@2.0.1/+esm'),
    import('https://cdn.jsdelivr.net/npm/emojilib@4.0.2/+esm'),
    import('https://cdn.jsdelivr.net/npm/mermaid@11.11.0/+esm'),
  ]).then(([marked, alertMod, footnoteMod, emojiPluginMod, emojiLibMod, mermaidMod]) => {
    const emojiLib = emojiLibMod.default ?? emojiLibMod;
    const Emojis = Object.entries(emojiLib).reduce((acc, [emoji, keywords]) => {
      if (Array.isArray(keywords)) for (const k of keywords) if (acc[k] == null) acc[k] = emoji;
      return acc;
    }, {});

    const mermaid = (mermaidMod.default ?? mermaidMod);
    mermaid.initialize({ startOnLoad: false });
    KM.mermaid = mermaid;

    const setMermaidTheme = (mode) => mermaid.initialize({ startOnLoad: false, theme: mode });

    const md = new marked.Marked()
      .use((footnoteMod.default ?? footnoteMod)())
      .use((alertMod.default ?? alertMod)())
      .use((emojiPluginMod.markedEmoji ?? emojiPluginMod.default)({ emojis: Emojis, renderer: t => t.emoji }))
      .use({ extensions: [mermaidExt, markExt, supExt, subExt, underlineExt, calloutExt, spoilerExt] });

    return {
      parse: (src, opt) => md.parse(src, { ...opt, mangle: false }),
      renderMermaidLazy: async (root) => {
        const container = root || document;
        const nodes = [...container.querySelectorAll('.mermaid')];
        if (!nodes.length) return;

        async function renderOne(el) {
          if (el.dataset.mmdDone === '1') return;
          el.dataset.mmdSrc ||= el.textContent;
          if (el.querySelector('svg')) el.innerHTML = el.dataset.mmdSrc;
          el.removeAttribute('data-processed');
          el.dataset.mmdDone = '1';

          const done = (() => {
            let resolve;
            const p = new Promise((r) => (resolve = r));
            const mo = new MutationObserver(() => {
              if (el.getAttribute('data-processed') === 'true' || el.querySelector('svg')) {
                mo.disconnect(); resolve();
              }
            });
            mo.observe(el, { attributes: true, childList: true });
            const t = setTimeout(() => { mo.disconnect(); resolve(); }, 4000);
            p.finally(() => clearTimeout(t));
            return p;
          })();

          try { await KM.mermaid.run({ nodes: [el] }); }
          catch (e) { delete el.dataset.mmdDone; throw e; }

          await done;
        }

        for (const el of nodes) { try { await renderOne(el); } catch {} }
      },
      setMermaidTheme,
    };
  });

  return mdReady;
};

// ───────── Sync Mermaid theme with page and rerender previews ─────────
KM.syncMermaidThemeWithPage = async () => {
  const { setMermaidTheme, renderMermaidLazy } = await KM.ensureMarkdown();
  setMermaidTheme(isDark() ? 'dark' : 'default');

  async function resetAndRerender(root) {
    if (!root) return;
    root.querySelectorAll('.mermaid').forEach((el) => {
      el.dataset.mmdSrc ||= el.textContent;
      el.innerHTML = el.dataset.mmdSrc;
      el.removeAttribute('data-processed');
      delete el.dataset.mmdDone;
    });
    await renderMermaidLazy(root);
  }

  await resetAndRerender(DOC.getElementById('content'));
  DOC.querySelectorAll('.km-link-preview').forEach((p) => {
    resetAndRerender(p.querySelector(':scope > div'));
  });
};
