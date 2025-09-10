// marked + footnotes + alerts + emoji + mermaid (thème configurable)
let ready;

function escapeRegex(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function createInline({ name, delimiter, tag, hint = delimiter[0], notAfterOpen, notBeforeClose }) {
  const d = escapeRegex(delimiter);
  const after = notAfterOpen ? `(?!${notAfterOpen})` : "";
  const before = notBeforeClose ? `(?!${notBeforeClose})` : "";
  const re = new RegExp(`^${d}${after}(?=\\S)([\\s\\S]*?\\S)${d}${before}`);
  return {
    name, level: "inline",
    start(src){ return src.indexOf(hint); },
    tokenizer(src){ const m = re.exec(src); if (!m) return;
      return { type: name, raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) }; },
    renderer(tok){ return `<${tag}>${this.parser.parseInline(tok.tokens)}</${tag}>`; }
  };
}

export function ensureMarkdown(){
  if (ready) return ready;
  ready = Promise.all([
    import('https://cdn.jsdelivr.net/npm/marked@16.1.2/+esm'),
    import('https://cdn.jsdelivr.net/npm/marked-alert@2.1.2/+esm'),
    import('https://cdn.jsdelivr.net/npm/marked-footnote@1.4.0/+esm'),
    import('https://cdn.jsdelivr.net/npm/marked-emoji@2.0.1/+esm'),
    import('https://cdn.jsdelivr.net/npm/emojilib@4.0.2/+esm'),
    import('https://cdn.jsdelivr.net/npm/mermaid@11.11.0/+esm'),
  ]).then(([marked, alertMod, footnoteMod, emojiPluginMod, emojiLibMod, mermaidMod]) => {
    const mermaid = (mermaidMod.default ?? mermaidMod);
    mermaid.initialize({ startOnLoad:false });

    const emojiLib = emojiLibMod.default ?? emojiLibMod;
    const Emojis = Object.entries(emojiLib).reduce((d,[emoji,keywords])=>{
      if (Array.isArray(keywords)) for (const k of keywords) if (d[k]==null) d[k]=emoji;
      return d;
    },{});

    const markExt = createInline({ name:'mark', delimiter:'==', tag:'mark', hint:'=' });
    const supExt  = createInline({ name:'sup', delimiter:'^', tag:'sup', notAfterOpen:'\\[|\\^' });
    const subExt  = createInline({ name:'sub', delimiter:'~', tag:'sub', notAfterOpen:'~', notBeforeClose:'~' });
    const uExt    = createInline({ name:'underline', delimiter:'++', tag:'u', hint:'+', notAfterOpen:'\\+', notBeforeClose:'\\+' });

    const mermaidExt = {
      name:'mermaid', level:'block',
      start(src){ return src.indexOf('```mermaid'); },
      tokenizer(src){ const m = /^```(?:mermaid|Mermaid)[ \t]*\n([\s\S]*?)\n```[ \t]*(?=\n|$)/.exec(src);
        if (!m) return; return { type:'mermaid', raw:m[0], text:m[1] }; },
      renderer(tok){ const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        return `<div class="mermaid">${esc(tok.text)}</div>\n`; }
    };

    const md = new marked.Marked()
      .use((footnoteMod.default ?? footnoteMod)())
      .use((alertMod.default ?? alertMod)())
      .use((emojiPluginMod.markedEmoji ?? emojiPluginMod.default)({ emojis:Emojis, renderer:t=>t.emoji }))
      .use({ extensions:[mermaidExt, markExt, supExt, subExt, uExt] });

    async function renderMermaidLazy(root=document){
      const nodes = [...root.querySelectorAll('.mermaid')];
      if (!nodes.length) return;
      for (const el of nodes) {
        if (!el.dataset.mmdSrc) el.dataset.mmdSrc = el.textContent;
        el.removeAttribute('data-processed');
        try { await mermaid.run({ nodes:[el] }); } catch {}
      }
    }

    return {
      parse: (src, opt) => md.parse(src, { ...opt, mangle:false }),
      renderMermaidLazy,
      setMermaidTheme: (mode) => mermaid.initialize({ startOnLoad:false, theme:mode })
    };
  });
  return ready;
}