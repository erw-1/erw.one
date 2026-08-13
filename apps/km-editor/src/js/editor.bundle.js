(() => {
  // km-editor/src/js/km.js
  var HEADER_RE = /^[ \t]*<!--\s*km\b([\s\S]*?)-->[ \t]*\r?\n?([\s\S]*?)(?=^[ \t]*<!--\s*km\b|(?![\s\S]))/gm;
  var FENCE_RE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
  var CODE_FENCE_RE = /^[ \t]{0,3}(?:>[ \t]?)*[ \t]{0,3}(?:`{3,}|~{3,})[ \t]*([\w#+.-]+)/;
  var CODE_LANGUAGE_MODULE2 = {
    atom: "xml",
    "c#": "csharp",
    "c++": "cpp",
    cc: "cpp",
    console: "shell",
    cs: "csharp",
    cts: "typescript",
    cxx: "cpp",
    docker: "dockerfile",
    gemspec: "ruby",
    golang: "go",
    gyp: "python",
    h: "c",
    "h++": "cpp",
    hh: "cpp",
    hpp: "cpp",
    html: "xml",
    htm: "xml",
    hxx: "cpp",
    irb: "ruby",
    js: "javascript",
    jsx: "javascript",
    jsp: "java",
    kt: "kotlin",
    md: "markdown",
    mkd: "markdown",
    mkdown: "markdown",
    mts: "typescript",
    patch: "diff",
    plist: "xml",
    podspec: "ruby",
    ps: "powershell",
    ps1: "powershell",
    py: "python",
    rb: "ruby",
    rss: "xml",
    rs: "rust",
    sh: "bash",
    svg: "xml",
    text: "plaintext",
    thor: "ruby",
    toml: "ini",
    ts: "typescript",
    tsx: "typescript",
    txt: "plaintext",
    xhtml: "xml",
    xjb: "xml",
    xsd: "xml",
    xsl: "xml",
    zsh: "bash",
    yml: "yaml"
  };
  var CODE_LANGUAGE_SKIP = /* @__PURE__ */ new Set(["mermaid", "nohighlight", "plain", "plaintext", "text", "txt"]);
  var uid = () => crypto?.randomUUID?.() ?? `uid_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  var clean = (value) => String(value ?? "").trim();
  var canonicalCodeLanguage = (language) => {
    const value = clean(language).toLowerCase();
    return CODE_LANGUAGE_MODULE2[value] || value;
  };
  function findMissingCodeLanguages(markdown, loadedLanguages = []) {
    const loaded = new Set(loadedLanguages.map(canonicalCodeLanguage));
    const missing = /* @__PURE__ */ new Map();
    for (const [line, source] of String(markdown ?? "").split(/\r?\n/).entries()) {
      const match = CODE_FENCE_RE.exec(source);
      if (!match) continue;
      const language = match[1].toLowerCase();
      const module = canonicalCodeLanguage(language);
      if (CODE_LANGUAGE_SKIP.has(module) || loaded.has(module) || missing.has(module)) continue;
      missing.set(module, { language, module, line });
    }
    return [...missing.values()];
  }
  var todayIso = () => {
    const now = /* @__PURE__ */ new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 10);
  };
  function setPageContent(page, content, updated = todayIso()) {
    const next = String(content ?? "");
    if (!page) return false;
    const contentChanged = page.content !== next;
    const clearsSimpleKind = page.kind === "simple" && Boolean(clean(next));
    if (!contentChanged && !clearsSimpleKind) return false;
    page.content = next;
    if (clearsSimpleKind) delete page.kind;
    if (contentChanged) page.updated = updated;
    return true;
  }
  function setSimpleFolder(page, updated = todayIso()) {
    if (!page) return false;
    const markerChanged = page.kind !== "simple";
    page.kind = "simple";
    return setPageContent(page, "", updated) || markerChanged;
  }
  var escapeMeta = (value) => String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  var unescapeMeta = (value) => value.replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();
  function createDefaultConfig(patch = {}) {
    return {
      LANG: "en",
      TITLE: "Your Wiki",
      MD: "content.md",
      DEFAULT_THEME: "dark",
      ACCENT: "#3fabd1",
      LANGS: [],
      CACHE_MD: "0",
      ALLOW_JS_FROM_MD: "false",
      CUSTOM_EMOJI: [],
      ...patch
    };
  }
  var CUSTOM_EMOJI_DATA = /^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml);base64,[a-z0-9+/]+={0,2}$/i;
  function normalizeCustomEmoji(value) {
    const seen = /* @__PURE__ */ new Set();
    const result = [];
    let totalLength = 0;
    for (const item of Array.isArray(value) ? value : []) {
      const alias = String(item?.alias ?? "").trim();
      const data = String(item?.data ?? "");
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(alias) || !CUSTOM_EMOJI_DATA.test(data) || seen.has(alias) || totalLength + data.length > 28e5) continue;
      seen.add(alias);
      totalLength += data.length;
      result.push({ alias, data });
    }
    return result;
  }
  function slugifyTitle(title) {
    return clean(title).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "page";
  }
  function uniquePageId(pages, base) {
    const root2 = slugifyTitle(base);
    const ids = new Set(pages.map((page) => page.id).filter(Boolean));
    if (!ids.has(root2)) return root2;
    let i = 2;
    while (ids.has(`${root2}_${i}`)) i++;
    return `${root2}_${i}`;
  }
  function maskCommentMarkersInFences(text) {
    return text.replace(
      FENCE_RE,
      (block) => block.replace(/<!--/g, "<~~!").replace(/-->/g, "~~>")
    );
  }
  function restoreCommentMarkers(text) {
    return text.replace(/<~~!/g, "<!--").replace(/~~>/g, "-->");
  }
  function parseHeaderMeta(header) {
    const meta = {};
    for (const line of header.split(/\r?\n/)) {
      const match = /^\s*(\w+)\s*[:=]\s*(.+?)\s*$/.exec(line);
      if (!match) continue;
      const [, key, rawValue] = match;
      const quoted = [...rawValue.matchAll(/"((?:\\.|[^"\\])*)"/g)].map(
        ([, value]) => unescapeMeta(value)
      );
      if (quoted.length > 1) meta[key] = quoted;
      else if (quoted.length === 1) meta[key] = quoted[0];
      else meta[key] = rawValue.trim().replace(/,$/, "");
    }
    return meta;
  }
  function parseBundle(text) {
    const source = String(text ?? "");
    const masked = maskCommentMarkersInFences(source);
    const matches = [...masked.matchAll(HEADER_RE)];
    if (!matches.length) {
      const page = createPage([], "page", "", "Imported Markdown");
      page.id = "home";
      page.content = source.trim();
      page._missingKmHeader = true;
      return {
        preamble: "",
        pages: [page],
        fileName: "untitled.md"
      };
    }
    const preamble = restoreCommentMarkers(source.slice(0, matches[0].index)).trim();
    const pages = matches.map((match, index) => {
      const meta = parseHeaderMeta(match[1]);
      const updatedParts = Array.isArray(meta.updated) ? meta.updated : [clean(meta.updated), clean(meta.updateComment ?? meta.update_comment)];
      const page = {
        uid: uid(),
        id: clean(meta.id),
        title: clean(meta.title) || clean(meta.id) || `Untitled ${index + 1}`,
        parent: clean(meta.parent),
        tags: Array.isArray(meta.tags) ? meta.tags.join(",") : clean(meta.tags),
        trail: clean(meta.trail),
        updated: clean(updatedParts[0]) || todayIso(),
        updateComment: clean(updatedParts[1]),
        content: restoreCommentMarkers(match[2] || "").trim()
      };
      if (clean(meta.kind).toLowerCase() === "simple" && !clean(page.content)) page.kind = "simple";
      return page;
    });
    upgradeLegacySimpleFolders(pages);
    return { preamble, pages, fileName: "untitled.md" };
  }
  function formatHeader(page) {
    const lines = [
      "<!--km",
      `id:"${escapeMeta(page.id)}"`,
      `title:"${escapeMeta(page.title)}"`
    ];
    if (page.kind === "simple" && !clean(page.content)) lines.push('kind:"simple"');
    if (clean(page.parent)) lines.push(`parent:"${escapeMeta(page.parent)}"`);
    if (clean(page.tags)) lines.push(`tags:"${escapeMeta(page.tags)}"`);
    if (clean(page.trail)) lines.push(`trail:"${escapeMeta(page.trail)}"`);
    if (clean(page.updated) && clean(page.updateComment)) {
      lines.push(`updated:"${escapeMeta(page.updated)}" "${escapeMeta(page.updateComment)}"`);
    } else if (clean(page.updated)) {
      lines.push(`updated:"${escapeMeta(page.updated)}"`);
    }
    lines.push("-->");
    return lines.join("\n");
  }
  function serializeBundle(state3) {
    const parts = [];
    if (clean(state3.preamble)) parts.push(state3.preamble.trim());
    for (const page of state3.pages) {
      const pageSource = [formatHeader(page), page.content.trim()].filter(Boolean).join("\n\n");
      parts.push(pageSource);
    }
    return `${parts.join("\n\n")}
`;
  }
  function serializeEditorState(state3) {
    return JSON.stringify({
      fileName: String(state3.fileName ?? ""),
      preamble: String(state3.preamble ?? ""),
      pages: state3.pages ?? [],
      config: state3.config ?? {}
    });
  }
  function parseEditorState(source) {
    const value = JSON.parse(source);
    if (!value || !Array.isArray(value.pages)) throw new Error("Invalid editor history state");
    return value;
  }
  function createStarterState() {
    return {
      preamble: "# KM Editor draft\n\nText above the first KM header is preserved but not rendered by KM.",
      pages: [
        {
          uid: uid(),
          id: "home",
          title: "Home",
          parent: "",
          tags: "start",
          trail: "Getting started",
          updated: todayIso(),
          updateComment: "",
          content: "# Home\n\nWelcome to your KM bundle.\n\n- [First page](#first_page)\n- [Glossary](#km_glossary)"
        },
        {
          uid: uid(),
          id: "first_page",
          title: "First page",
          parent: "home",
          tags: "example",
          trail: "Getting started",
          updated: todayIso(),
          updateComment: "",
          content: "# First page\n\nStart writing here. Try ==highlighted $E=mc^2$== or a footnote.[^1]\n\n[^1]: A starter footnote."
        },
        {
          uid: uid(),
          id: "km_glossary",
          title: "Glossary",
          parent: "home",
          tags: "glossary",
          trail: "",
          updated: todayIso(),
          updateComment: "",
          content: "# Glossary\n\n## KM\n\nA static markdown wiki made from page headers and markdown content."
        }
      ],
      activeUid: null,
      mode: "compare",
      dirty: false,
      fileHandle: null,
      fileName: "untitled.md",
      config: createDefaultConfig({ MD: "untitled.md" })
    };
  }
  function createPage(pages, kind = "page", parent = "", title = "") {
    const label = title || (kind === "folder" ? "New folder" : kind === "simple" ? "New simple folder" : "New page");
    const id = uniquePageId(pages, label);
    const body = kind === "simple" ? "" : kind === "folder" ? `# ${label}

Folder overview. Drag child pages under this node.` : `# ${label}

Start writing here.`;
    return {
      uid: uid(),
      id,
      title: label,
      parent: clean(parent),
      tags: "",
      trail: "",
      updated: todayIso(),
      updateComment: "",
      content: body,
      ...kind === "simple" ? { kind: "simple" } : {}
    };
  }
  function findPage(state3, pageUid = state3.activeUid) {
    return state3.pages.find((page) => page.uid === pageUid) ?? state3.pages.find((page) => page.id === "home") ?? state3.pages[0] ?? null;
  }
  function childrenOf(pages, page) {
    if (!page?.id) return [];
    return pages.filter((candidate) => candidate.parent === page.id);
  }
  var mainRootOf = (pages) => pages.find((page) => page.id === "home") || pages[0] || null;
  function upgradeLegacySimpleFolders(pages) {
    const mainRoot = mainRootOf(pages);
    for (const page of pages) {
      if (page.kind !== "simple" && page !== mainRoot && !clean(page.content) && childrenOf(pages, page).length) page.kind = "simple";
    }
  }
  function pageKind(pages, page) {
    const hasChildren = childrenOf(pages, page).length > 0;
    if (page !== mainRootOf(pages) && page?.kind === "simple" && !clean(page.content))
      return "Simple folder";
    if (hasChildren) return "Folder";
    return "Page";
  }
  function parseHeadings(markdown) {
    const counters = [0, 0, 0, 0, 0, 0];
    const headings = [];
    let inFence = false;
    for (const line of String(markdown ?? "").split(/\r?\n/)) {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      if (inFence) continue;
      const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (!match) continue;
      const level = match[1].length;
      counters[level - 1]++;
      for (let i = level; i < counters.length; i++) counters[i] = 0;
      headings.push({
        level,
        text: match[2].trim(),
        anchor: counters.slice(0, level).filter(Boolean).join("_")
      });
    }
    return headings;
  }
  function buildTree(state3) {
    const pages = state3.pages;
    const byId = /* @__PURE__ */ new Map();
    for (const page of pages) if (page.id && !byId.has(page.id)) byId.set(page.id, page);
    const nodes = new Map(pages.map((page) => [page.uid, { page, children: [], missingParent: false }]));
    const roots = [];
    for (const page of pages) {
      const node = nodes.get(page.uid);
      const parent = page.parent ? byId.get(page.parent) : null;
      if (parent && parent.uid !== page.uid) nodes.get(parent.uid)?.children.push(node);
      else {
        node.missingParent = Boolean(page.parent);
        roots.push(node);
      }
    }
    return roots;
  }
  function wouldCreateCycle(pages, pageUid, parentId) {
    const page = pages.find((candidate) => candidate.uid === pageUid);
    if (!page || !parentId) return false;
    if (page.id === parentId) return true;
    const byId = /* @__PURE__ */ new Map();
    for (const candidate of pages) if (candidate.id && !byId.has(candidate.id)) byId.set(candidate.id, candidate);
    let current = byId.get(parentId);
    const seen = /* @__PURE__ */ new Set();
    while (current) {
      if (current.uid === pageUid) return true;
      if (!current.parent || seen.has(current.uid)) return false;
      seen.add(current.uid);
      current = byId.get(current.parent);
    }
    return false;
  }
  function pageRoute(pages, page) {
    const byId = new Map(pages.map((candidate) => [candidate.id, candidate]));
    const mainRoot = mainRootOf(pages);
    const segments = [];
    const seen = /* @__PURE__ */ new Set();
    for (let current = page; current && current !== mainRoot && !seen.has(current.uid); current = byId.get(current.parent)) {
      seen.add(current.uid);
      if (current.id) segments.unshift(current.id);
      if (!current.parent) break;
    }
    return segments.join("#");
  }
  function rewriteContentRoute(content, oldRoute, newRoute) {
    const rewrite = (route) => route === oldRoute || route.startsWith(`${oldRoute}#`) ? newRoute + route.slice(oldRoute.length) : route;
    return String(content ?? "").replace(/(\]\(\s*#)([^\s)]+)/g, (_, prefix, route) => prefix + rewrite(route)).replace(/(href\s*=\s*["']#)([^"']+)/gi, (_, prefix, route) => prefix + rewrite(route));
  }
  function movePage(state3, draggedUid, targetUid, placement) {
    if (!draggedUid || !targetUid || draggedUid === targetUid) return false;
    const pages = state3.pages;
    const dragged = pages.find((page) => page.uid === draggedUid);
    const target = pages.find((page) => page.uid === targetUid);
    if (!dragged || !target) return false;
    const oldRoute = pageRoute(pages, dragged);
    const nextParent = placement === "inside" ? target.id : target.parent;
    if (wouldCreateCycle(pages, dragged.uid, nextParent)) return false;
    dragged.parent = clean(nextParent);
    const withoutDragged = pages.filter((page) => page.uid !== draggedUid);
    const targetIndex = withoutDragged.findIndex((page) => page.uid === targetUid);
    const insertIndex = placement === "before" ? targetIndex : placement === "after" ? targetIndex + 1 : targetIndex + 1;
    withoutDragged.splice(Math.max(0, insertIndex), 0, dragged);
    state3.pages = withoutDragged;
    const newRoute = pageRoute(state3.pages, dragged);
    if (oldRoute && newRoute && oldRoute !== newRoute) {
      for (const page of state3.pages)
        setPageContent(page, rewriteContentRoute(page.content, oldRoute, newRoute));
    }
    return true;
  }
  function updatePageMeta(state3, page, patch) {
    if (!page) return;
    const oldId = page.id;
    const referenceId = oldId || page._previousId;
    Object.assign(page, patch);
    page.id = clean(page.id);
    page.title = clean(page.title);
    page.parent = clean(page.parent);
    page.tags = clean(page.tags);
    page.trail = clean(page.trail);
    page.updated = clean(page.updated);
    page.updateComment = clean(page.updateComment);
    if (oldId && !page.id) page._previousId = oldId;
    if (referenceId && page.id && referenceId !== page.id) {
      rewritePageReferences(state3, referenceId, page.id);
      delete page._previousId;
    }
  }
  function replaceProblemContent(page, problem, replacement) {
    if (!page || !Number.isInteger(problem.start) || !Number.isInteger(problem.end) || problem.start < 0 || problem.end < problem.start || problem.end > page.content.length) return false;
    return setPageContent(
      page,
      page.content.slice(0, problem.start) + replacement + page.content.slice(problem.end)
    );
  }
  function repairProblem(state3, problem, value = {}) {
    const page = state3.pages.find((candidate) => candidate.uid === (value.pageUid || problem.pageUid));
    switch (problem.code) {
      case "missing-km-header":
        if (!page) return false;
        delete page._missingKmHeader;
        return true;
      case "missing-id":
        if (!page) return false;
        updatePageMeta(state3, page, { id: uniquePageId(state3.pages, page.title) });
        return true;
      case "invalid-id":
        if (!page) return false;
        updatePageMeta(state3, page, {
          id: uniquePageId(state3.pages.filter((candidate) => candidate.uid !== page.uid), page.id)
        });
        return true;
      case "missing-title": {
        const title = clean(value.title);
        if (!page || !title) return false;
        updatePageMeta(state3, page, { title });
        return true;
      }
      case "duplicate-id": {
        const id = clean(value.id);
        if (!page || !id || id.includes("#") || state3.pages.some((candidate) => candidate.uid !== page.uid && candidate.id === id)) return false;
        page.id = id;
        return true;
      }
      case "missing-language": {
        const module = canonicalCodeLanguage(problem.module);
        if (!module) return false;
        const loaded = Array.isArray(state3.config?.LANGS) ? state3.config.LANGS : [];
        state3.config = {
          ...createDefaultConfig(),
          ...state3.config,
          LANGS: [.../* @__PURE__ */ new Set([...loaded.map(canonicalCodeLanguage), module])]
        };
        return true;
      }
      case "invalid-date": {
        const updated = clean(value.updated);
        if (!page || !isValidIsoDate(updated)) return false;
        updatePageMeta(state3, page, { updated });
        return true;
      }
      case "duplicate-glossary-alias": {
        const surface = clean(value.surface);
        if (!page || !surface) return false;
        const duplicate = glossarySurfaceOccurrences(page).some(
          (occurrence) => occurrence.entry !== problem.entry && occurrence.surface.toLocaleLowerCase() === surface.toLocaleLowerCase()
        );
        if (duplicate) return false;
        const lines = page.content.split(/\r?\n/);
        if (problem.kind === "term") {
          lines[problem.line] = lines[problem.line]?.replace(
            /^(\s*#{1,6}\s+)(.+?)(\s+#+\s*)?$/,
            (_, prefix, _term, suffix = "") => `${prefix}${surface}${suffix}`
          );
        } else {
          const match = /^(\s*aliases?\s*:\s*)(.+)\s*$/i.exec(lines[problem.line] || "");
          if (!match) return false;
          const aliases = match[2].split(/\s*,\s*/);
          aliases[problem.aliasIndex] = surface;
          lines[problem.line] = `${match[1]}${aliases.join(", ")}`;
        }
        return setPageContent(page, lines.join("\n"));
      }
      case "duplicate-glossary-term": {
        const keepEntry = Number(value.keepEntry);
        if (!page || !problem.entries?.some((entry) => entry.entry === keepEntry)) return false;
        const lines = page.content.split(/\r?\n/);
        for (const entry of problem.entries.filter((entry2) => entry2.entry !== keepEntry).sort((a, b) => b.startLine - a.startLine))
          lines.splice(entry.startLine, entry.endLine - entry.startLine);
        return setPageContent(page, lines.join("\n").trim());
      }
      case "broken-link": {
        const target = state3.pages.find((candidate) => candidate.uid === value.targetPageUid);
        if (!page || !target) return false;
        const route = pageRoute(state3.pages, target);
        const anchor = clean(value.anchor);
        return replaceProblemContent(page, problem, `#${route}${anchor ? `${route ? "#" : ""}${anchor}` : ""}`);
      }
      case "missing-transclusion":
      case "missing-transclusion-section":
      case "circular-transclusion": {
        if (value.remove) return replaceProblemContent(page, problem, "");
        const target = state3.pages.find((candidate) => candidate.uid === value.targetPageUid);
        if (!page || !target) return false;
        const section = clean(value.section);
        return replaceProblemContent(page, problem, `![[${target.id}${section ? `#${section}` : ""}]]`);
      }
      case "invalid-query":
        return replaceProblemContent(page, problem, value.remove ? "" : clean(value.source));
      case "self-parent":
      case "missing-parent":
      case "parent-cycle": {
        const parent = clean(value.parent);
        if (!page || wouldCreateCycle(state3.pages, page.uid, parent)) return false;
        updatePageMeta(state3, page, { parent });
        return true;
      }
      default:
        return false;
    }
  }
  function referenceIds(content) {
    const ids = /* @__PURE__ */ new Set();
    for (const match of String(content ?? "").matchAll(/(?:\]\(\s*|href\s*=\s*["'])#([^\s)"']+)/gi))
      for (const segment of match[1].split("#")) if (segment) ids.add(segment);
    for (const match of String(content ?? "").matchAll(/!\[\[([^#\]\n]+)(?:#[^\]\n]+)?\]\]/g))
      ids.add(clean(match[1]));
    return ids;
  }
  function rewriteContentPageId(content, oldId, newId) {
    const rewriteRoute = (route) => route.split("#").map((segment) => segment === oldId ? newId : segment).join("#");
    return String(content ?? "").replace(/(\]\(\s*#)([^\s)]+)/g, (_, prefix, route) => prefix + rewriteRoute(route)).replace(/(href\s*=\s*["']#)([^"']+)/gi, (_, prefix, route) => prefix + rewriteRoute(route)).replace(
      /(!\[\[)([^#\]\n]+)([^\]\n]*\]\])/g,
      (_, open, id, close) => open + (clean(id) === oldId ? newId : id) + close
    );
  }
  function rewritePageReferences(state3, oldId, newId) {
    for (const candidate of state3.pages) {
      if (candidate.parent === oldId) candidate.parent = newId;
      setPageContent(candidate, rewriteContentPageId(candidate.content, oldId, newId));
    }
  }
  function pageImpact(state3, page) {
    return {
      children: childrenOf(state3.pages, page),
      references: state3.pages.filter(
        (candidate) => candidate !== page && referenceIds(candidate.content).has(page.id)
      )
    };
  }
  var DOWNLOADABLE_LINK_RE = /\.(?:avif|docx?|gif|jpe?g|mp3|mp4|ogg|pdf|png|svg|webm|webp|xlsx?|zip)(?:[?#].*)?$/i;
  function remoteAssetUrls(content) {
    const urls = /* @__PURE__ */ new Set();
    for (const match of String(content ?? "").matchAll(/(!?)\[[^\]]*\]\((https?:\/\/[^\s)]+)(?:\s+["'][^"']*["'])?\)/gi)) {
      if (match[1] || DOWNLOADABLE_LINK_RE.test(match[2])) urls.add(match[2]);
    }
    for (const match of String(content ?? "").matchAll(/<(?:audio|img|source|video)\b[^>]*\bsrc\s*=\s*["'](https?:\/\/[^"']+)["']/gi))
      urls.add(match[1]);
    return [...urls];
  }
  var ASSET_REF_RE = /!\[[^\]\n]*\]\(\s*([^\s)]+?)(?:\s+["'][^"']*["'])?\s*\)|<(?:audio|img|source|video)\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;
  function assetReferences(content) {
    const text = String(content ?? "");
    const references = [];
    for (const match of text.matchAll(ASSET_REF_RE)) {
      const url = match[1] ?? match[2];
      if (!url || url.startsWith("data:")) continue;
      const start = match.index + match[0].indexOf(url);
      references.push({
        url,
        start,
        end: start + url.length,
        line: text.slice(0, start).split("\n").length - 1
      });
    }
    return references;
  }
  function assetProblems(pages, isMissing) {
    const problems = [];
    for (const page of pages) {
      for (const reference of assetReferences(page.content)) {
        if (!isMissing(reference.url)) continue;
        problems.push({
          level: "warning",
          code: "missing-asset",
          pageUid: page.uid,
          line: reference.line,
          start: reference.start,
          end: reference.end,
          url: reference.url,
          text: `${page.title || page.id || "(untitled page)"} references "${reference.url}", which does not load.`
        });
      }
    }
    return problems;
  }
  function replaceRemoteAsset(content, url, localPath) {
    return String(content ?? "").split(url).join(localPath);
  }
  function duplicatePage(state3, page) {
    if (!page) return null;
    const copy = {
      ...page,
      uid: uid(),
      id: uniquePageId(state3.pages, `${page.id || page.title}_copy`),
      title: `${page.title || "Untitled"} copy`
    };
    if (pageKind(state3.pages, page) === "Simple folder") copy.kind = "simple";
    else delete copy.kind;
    const index = state3.pages.findIndex((candidate) => candidate.uid === page.uid);
    state3.pages.splice(index + 1, 0, copy);
    return copy;
  }
  function deletePage(state3, page) {
    if (!page || state3.pages.length <= 1) return false;
    const children = childrenOf(state3.pages, page);
    for (const child of children) child.parent = page.parent;
    state3.pages = state3.pages.filter((candidate) => candidate.uid !== page.uid);
    state3.activeUid = state3.pages[0]?.uid ?? null;
    return true;
  }
  function detectCycles(pages) {
    const byId = /* @__PURE__ */ new Map();
    for (const page of pages) if (page.id && !byId.has(page.id)) byId.set(page.id, page);
    const cycles = [];
    for (const page of pages) {
      const seen = /* @__PURE__ */ new Set();
      let current = page;
      while (current?.parent) {
        if (current.parent === current.id) break;
        if (seen.has(current.uid)) {
          cycles.push({
            level: "error",
            code: "parent-cycle",
            pageUid: page.uid,
            text: `${page.title || page.id} is in a parent cycle`
          });
          break;
        }
        seen.add(current.uid);
        current = byId.get(current.parent);
      }
    }
    return [...new Map(cycles.map((problem) => [`${problem.code}:${problem.pageUid}`, problem])).values()];
  }
  function isValidIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }
  function glossarySurfaceOccurrences(page) {
    const lines = String(page?.content ?? "").split(/\r?\n/);
    const headings = [];
    let inFence = false;
    for (let line = 0; line < lines.length; line++) {
      if (/^\s*(```|~~~)/.test(lines[line])) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(lines[line]);
      if (match) headings.push({ line, term: match[2].trim() });
    }
    const occurrences = [];
    for (let entry = 0; entry < headings.length; entry++) {
      const heading = headings[entry];
      const end = headings[entry + 1]?.line ?? lines.length;
      if (entry === 0 && heading.term.toLocaleLowerCase() === clean(page.title).toLocaleLowerCase()) continue;
      const common = {
        entry,
        startLine: heading.line,
        endLine: end,
        content: lines.slice(heading.line, end).join("\n").trim()
      };
      occurrences.push({ ...common, kind: "term", line: heading.line, surface: heading.term });
      let line = heading.line + 1;
      while (line < end && !lines[line].trim()) line++;
      const aliases = /^\s*aliases?\s*:\s*(.+)\s*$/i.exec(lines[line] || "");
      if (!aliases) continue;
      aliases[1].split(/\s*,\s*/).forEach((surface, aliasIndex) => {
        if (surface) occurrences.push({ ...common, kind: "alias", line, aliasIndex, surface });
      });
    }
    return occurrences;
  }
  function duplicateGlossaryProblems(pages) {
    const glossary = pages.find((page) => page.id === "km_glossary");
    if (!glossary) return [];
    const occurrences = glossarySurfaceOccurrences(glossary);
    const problems = [];
    const terms = /* @__PURE__ */ new Map();
    for (const occurrence of occurrences.filter((occurrence2) => occurrence2.kind === "term")) {
      const key = occurrence.surface.toLocaleLowerCase();
      if (!terms.has(key)) terms.set(key, []);
      terms.get(key).push(occurrence);
    }
    for (const matches of terms.values()) {
      if (matches.length < 2) continue;
      problems.push({
        level: "warning",
        code: "duplicate-glossary-term",
        pageUid: glossary.uid,
        surface: matches[0].surface,
        entries: matches,
        text: `Glossary term "${matches[0].surface}" has ${matches.length} entries.`
      });
    }
    const seen = new Map(occurrences.filter((occurrence) => occurrence.kind === "term").map((occurrence) => [occurrence.surface.toLocaleLowerCase(), occurrence]));
    for (const occurrence of occurrences.filter((occurrence2) => occurrence2.kind === "alias")) {
      const key = occurrence.surface.toLocaleLowerCase();
      const previous = seen.get(key);
      if (!previous) {
        seen.set(key, occurrence);
        continue;
      }
      if (previous.entry === occurrence.entry) continue;
      problems.push({
        ...occurrence,
        level: "warning",
        code: "duplicate-glossary-alias",
        pageUid: glossary.uid,
        text: `Glossary alias "${occurrence.surface}" duplicates another entry.`
      });
    }
    return problems;
  }
  function pageAnchorIds(page, includeHtml = false) {
    const anchors = new Set(parseHeadings(page?.content).map((heading) => heading.anchor));
    if (includeHtml)
      for (const match of String(page?.content ?? "").matchAll(/\bid\s*=\s*["']([^"']+)["']/gi))
        anchors.add(match[1]);
    return anchors;
  }
  function isValidInternalLink(pages, sourcePage, href) {
    const route = String(href ?? "").replace(/^#/, "");
    const segments = route.split("#").filter(Boolean);
    if (!segments.length) return true;
    const routes = new Map(pages.map((page) => [pageRoute(pages, page), page]));
    const exactTarget = routes.get(segments.join("#"));
    if (exactTarget) return pageKind(pages, exactTarget) !== "Simple folder";
    if (segments.length === 1 && pageAnchorIds(sourcePage, true).has(segments[0])) return true;
    if (segments.length === 1 && pageAnchorIds(mainRootOf(pages)).has(segments[0])) return true;
    for (let count = segments.length - 1; count > 0; count--) {
      const target = routes.get(segments.slice(0, count).join("#"));
      if (target && segments.length - count === 1 && pageAnchorIds(target).has(segments[count])) return true;
    }
    return false;
  }
  function isInsideInlineCode(source, index) {
    let delimiters = 0;
    for (const match of source.slice(0, index).matchAll(/`+/g))
      if (source[match.index - 1] !== "\\") delimiters++;
    return delimiters % 2 === 1;
  }
  function brokenLinkProblems(pages) {
    const problems = [];
    for (const page of pages) {
      let inFence = false;
      let offset = 0;
      const lines = String(page.content ?? "").split("\n");
      for (let line = 0; line < lines.length; line++) {
        const source = lines[line].replace(/\r$/, "");
        if (/^\s*(```|~~~)/.test(source)) {
          inFence = !inFence;
        } else if (!inFence) {
          const matches = [
            ...source.matchAll(/\[[^\]\n]*\]\(\s*(#[^\s)"']*)(?:\s+["'][^"']*["'])?\s*\)/g),
            ...source.matchAll(/\bhref\s*=\s*["'](#[^"']*)["']/gi)
          ].sort((a, b) => a.index - b.index);
          for (const match of matches) {
            if (source[match.index - 1] === "!" || isInsideInlineCode(source, match.index) || isValidInternalLink(pages, page, match[1])) continue;
            const localStart = match.index + match[0].indexOf(match[1]);
            problems.push({
              level: "error",
              code: "broken-link",
              pageUid: page.uid,
              line,
              start: offset + localStart,
              end: offset + localStart + match[1].length,
              target: match[1],
              text: `${page.title || page.id} has broken KM link "${match[1]}".`
            });
          }
        }
        offset += lines[line].length + 1;
      }
    }
    return problems;
  }
  function validateState(state3) {
    const messages = [];
    const ids = /* @__PURE__ */ new Map();
    const missingLanguages = /* @__PURE__ */ new Map();
    for (const page of state3.pages) {
      const label = page.title || page.id || "(untitled page)";
      if (page._missingKmHeader) messages.push({
        level: "error",
        code: "missing-km-header",
        pageUid: page.uid,
        text: "Imported Markdown had no KM page header and was preserved as a new Home page."
      });
      if (!page.id) messages.push({
        level: "error",
        code: "missing-id",
        pageUid: page.uid,
        text: `${label} is missing an id.`
      });
      if (page.id.includes("#")) messages.push({
        level: "error",
        code: "invalid-id",
        pageUid: page.uid,
        text: `${label} id cannot contain "#".`
      });
      if (!page.title) messages.push({
        level: "error",
        code: "missing-title",
        pageUid: page.uid,
        text: `${page.id || "(missing id)"} is missing a title.`
      });
      if (page.updated && !isValidIsoDate(page.updated)) messages.push({
        level: "warning",
        code: "invalid-date",
        pageUid: page.uid,
        text: `${label} has invalid updated date "${page.updated}".`
      });
      if (page.id) {
        if (!ids.has(page.id)) ids.set(page.id, []);
        ids.get(page.id).push(page);
      }
      for (const language of findMissingCodeLanguages(page.content, state3.config?.LANGS))
        if (!missingLanguages.has(language.module)) missingLanguages.set(language.module, language);
    }
    for (const [id, matches] of ids) {
      if (matches.length > 1) messages.push({
        level: "error",
        code: "duplicate-id",
        id,
        pageUids: matches.map((page) => page.uid),
        text: `Duplicate page id "${id}".`
      });
    }
    for (const language of missingLanguages.values())
      messages.push({
        level: "warning",
        code: "missing-language",
        ...language,
        text: `Code language "${language.language}" is not loaded.`
      });
    for (const page of state3.pages) {
      if (!page.parent) continue;
      if (page.parent === page.id) messages.push({
        level: "error",
        code: "self-parent",
        pageUid: page.uid,
        text: `${page.title} cannot parent itself.`
      });
      else if (!ids.has(page.parent)) {
        messages.push({
          level: "warning",
          code: "missing-parent",
          pageUid: page.uid,
          text: `${page.title} references missing parent "${page.parent}".`
        });
      }
    }
    messages.push(...detectCycles(state3.pages));
    messages.push(...brokenLinkProblems(state3.pages));
    messages.push(...duplicateGlossaryProblems(state3.pages));
    if (!messages.length) messages.push({ level: "ok", text: "Bundle is valid enough to export." });
    return messages;
  }
  function ensureGlossaryPage(state3) {
    let glossary = state3.pages.find((page) => page.id === "km_glossary");
    if (!glossary) {
      glossary = {
        uid: uid(),
        id: "km_glossary",
        title: "Glossary",
        parent: state3.pages[0]?.id || "",
        tags: "glossary",
        updated: todayIso(),
        updateComment: "",
        content: "# Glossary"
      };
      state3.pages.push(glossary);
    }
    return glossary;
  }
  function addGlossaryTerm(state3, term, definition = "") {
    const cleanTerm = clean(term);
    if (!cleanTerm) return null;
    const glossary = ensureGlossaryPage(state3);
    const headingPattern = new RegExp(`^#{2,6}\\s+${cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
    if (!headingPattern.test(glossary.content)) {
      const body = clean(definition) || `Definition for ${cleanTerm}.`;
      setPageContent(glossary, `${glossary.content.trim()}

## ${cleanTerm}

${body}`.trim());
    } else if (clean(definition)) {
      setPageContent(glossary, `${glossary.content.trim()}

${clean(definition)}`.trim());
    }
    return glossary;
  }
  function refreshActiveUid(state3) {
    if (!state3.activeUid || !state3.pages.some((page) => page.uid === state3.activeUid)) {
      state3.activeUid = (state3.pages.find((page) => page.id === "home") || state3.pages[0])?.uid ?? null;
    }
    return state3.activeUid;
  }

  // km-editor/src/js/storage.js
  async function openMarkdownFile(fallbackInput) {
    if ("showOpenFilePicker" in window) {
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: "Markdown",
            accept: { "text/markdown": [".md", ".markdown"], "text/plain": [".txt"] }
          }
        ],
        excludeAcceptAllOption: false,
        multiple: false
      });
      const file = await handle.getFile();
      return { text: await file.text(), fileName: file.name, fileHandle: handle };
    }
    return new Promise((resolve, reject) => {
      fallbackInput.value = "";
      fallbackInput.onchange = async () => {
        const file = fallbackInput.files?.[0];
        if (!file) {
          reject(new Error("No file selected."));
          return;
        }
        resolve({ text: await file.text(), fileName: file.name, fileHandle: null });
      };
      fallbackInput.click();
    });
  }
  function markdownSourceUrl(value) {
    const source = String(value ?? "").trim();
    let url;
    try {
      url = new URL(source);
    } catch {
      return source;
    }
    if (url.hostname.toLowerCase() !== "hackmd.io" || /\.md$/i.test(url.pathname)) return source;
    url.pathname = `${url.pathname.replace(/\/$/, "")}.md`;
    url.hash = "";
    return url.href;
  }
  var GITHUB_API = "https://api.github.com/repos";
  function githubHeaders(token) {
    const headers = { Accept: "application/vnd.github+json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }
  function githubFileUrl({ repo, path }, query = "") {
    const safePath = String(path).split("/").map(encodeURIComponent).join("/");
    return `${GITHUB_API}/${repo}/contents/${safePath}${query}`;
  }
  function encodeBase64(text) {
    let binary = "";
    for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  function decodeBase64(base64) {
    return new TextDecoder().decode(Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)));
  }
  async function githubLoad({ repo, branch, path, token }) {
    const response = await fetch(githubFileUrl({ repo, path }, `?ref=${encodeURIComponent(branch)}`), {
      headers: githubHeaders(token)
    });
    if (!response.ok) throw new Error(`GitHub load failed (HTTP ${response.status}).`);
    const data = await response.json();
    return { text: decodeBase64(String(data.content ?? "").replace(/\n/g, "")), sha: data.sha };
  }
  async function githubSave({ repo, branch, path, token, sha, text, message }) {
    const response = await fetch(githubFileUrl({ repo, path }), {
      method: "PUT",
      headers: githubHeaders(token),
      body: JSON.stringify({ message, branch, content: encodeBase64(text), ...sha ? { sha } : {} })
    });
    if (!response.ok) {
      const error = new Error(`GitHub save failed (HTTP ${response.status}).`);
      error.conflict = response.status === 409 || response.status === 422;
      throw error;
    }
    const data = await response.json();
    return data.content.sha;
  }
  function downloadText(text, fileName = "download.txt", type = "text/plain;charset=utf-8") {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName || "download.txt";
    link.click();
    requestAnimationFrame(() => URL.revokeObjectURL(url));
  }
  function downloadMarkdown(text, fileName = "km-bundle.md") {
    downloadText(text, fileName || "km-bundle.md", "text/markdown;charset=utf-8");
  }

  // km-editor/src/js/tree.js
  function matchesNode(node, query) {
    if (!query) return true;
    const haystack = `${node.page.title} ${node.page.id} ${node.page.tags}`.toLowerCase();
    return haystack.includes(query) || node.children.some((child) => matchesNode(child, query));
  }
  function childList(nodes, state3, options, query) {
    const ul = document.createElement("ul");
    ul.className = "tree-list";
    ul.setAttribute("role", "group");
    for (const node of nodes) {
      if (!matchesNode(node, query)) continue;
      ul.append(treeItem(node, state3, options, query));
    }
    return ul;
  }
  function dropZone(uid2, placement, onMove) {
    const zone = document.createElement("div");
    zone.className = "drop-zone";
    zone.dataset.uid = uid2;
    zone.dataset.placement = placement;
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("drag-over");
      const draggedUid = event.dataTransfer.getData("text/x-km-page");
      onMove(draggedUid, uid2, placement);
    });
    return zone;
  }
  function treeItem(node, state3, options, query) {
    const { onSelect, onMove } = options;
    const li = document.createElement("li");
    li.className = "tree-item";
    li.dataset.uid = node.page.uid;
    li.append(dropZone(node.page.uid, "before", onMove));
    const row = document.createElement("div");
    row.className = "tree-row";
    const kindLabel = pageKind(state3.pages, node.page);
    if (node.page.uid === state3.activeUid) row.classList.add("active");
    if (node.missingParent) row.classList.add("missing-parent");
    if (node.page.id === "km_glossary") row.classList.add("glossary");
    if (node.isHome) row.classList.add("home");
    if (kindLabel === "Simple folder") row.classList.add("simple-folder");
    row.draggable = true;
    row.dataset.uid = node.page.uid;
    row.setAttribute("role", "treeitem");
    row.setAttribute("aria-selected", String(node.page.uid === state3.activeUid));
    row.tabIndex = node.page.uid === state3.activeUid ? 0 : -1;
    row.title = node.missingParent ? `Missing parent: ${node.page.parent}` : `${kindLabel}: ${node.page.id}`;
    const kind = document.createElement("span");
    kind.className = "tree-kind";
    kind.textContent = kindLabel === "Folder" ? "\u25BE" : kindLabel === "Simple folder" ? "\u25B9" : "\u2013";
    kind.setAttribute("role", "img");
    kind.setAttribute("aria-label", kindLabel);
    const title = document.createElement("span");
    title.className = "tree-title";
    title.textContent = node.page.title || node.page.id || "(untitled)";
    row.append(kind, title);
    const select = () => {
      const treeRoot = row.closest(".tree-root");
      onSelect(node.page.uid);
      queueMicrotask(() => [...treeRoot.querySelectorAll(".tree-row")].find((candidate) => candidate.dataset.uid === node.page.uid)?.focus());
    };
    row.addEventListener("click", select);
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      select();
    });
    row.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/x-km-page", node.page.uid);
      event.dataTransfer.setData("text/plain", node.page.title || node.page.id || "");
      event.dataTransfer.effectAllowed = "copyMove";
    });
    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      row.classList.remove("drag-over");
      const draggedUid = event.dataTransfer.getData("text/x-km-page");
      onMove(draggedUid, node.page.uid, "inside");
    });
    li.append(row);
    if (node.children.length) li.append(childList(node.children, state3, options, query));
    li.append(dropZone(node.page.uid, "after", onMove));
    return li;
  }
  function renderTree(root2, state3, options, query = "") {
    const normalizedQuery = query.trim().toLowerCase();
    const nodes = buildTree(state3);
    const homeNode = nodes.find((node) => node.page.id === "home") || nodes.find((node) => !node.missingParent);
    if (homeNode) homeNode.isHome = true;
    root2.replaceChildren(childList(nodes, state3, options, normalizedQuery));
    const rows = [...root2.querySelectorAll(".tree-row")];
    if (!rows.some((row) => row.tabIndex === 0) && rows[0]) rows[0].tabIndex = 0;
  }

  // km-editor/src/js/docks.js
  var STORE_KEY = "km-editor-dock-layout";
  var COLS = ["left", "right"];
  var MIN_W = 160;
  var panels = /* @__PURE__ */ new Map();
  var state = null;
  var store = null;
  var colEls = {};
  var gutterEls = {};
  var dragging = null;
  var div = (className) => {
    const el = document.createElement("div");
    el.className = className;
    return el;
  };
  function defaultState() {
    return {
      left: { width: 260, split: 0.5, docks: [{ panels: ["explorer"], active: "explorer" }] },
      right: { width: 320, split: 0.5, docks: [{ panels: ["metadata", "config", "problems"], active: "metadata" }] }
    };
  }
  function sanitize(raw) {
    const s = raw && raw.left && raw.right ? raw : defaultState();
    const seen = /* @__PURE__ */ new Set();
    for (const col of COLS) {
      const c = s[col] || (s[col] = { width: 280, split: 0.5, docks: [] });
      c.width = Math.max(MIN_W, Number(c.width) || 280);
      c.split = Math.min(0.85, Math.max(0.15, Number(c.split) || 0.5));
      c.docks = (c.docks || []).map((d) => ({ panels: (d.panels || []).filter((id) => panels.has(id) && !seen.has(id) && seen.add(id)), active: d.active })).filter((d) => d.panels.length);
      for (const d of c.docks) if (!d.panels.includes(d.active)) d.active = d.panels[0];
    }
    for (const id of panels.keys()) {
      if (seen.has(id)) continue;
      const c = s.right;
      if (!c.docks.length) c.docks.push({ panels: [], active: id });
      c.docks[0].panels.push(id);
      c.docks[0].active = c.docks[0].active || id;
    }
    return s;
  }
  function load() {
    try {
      return sanitize(JSON.parse(localStorage.getItem(STORE_KEY)));
    } catch {
      return defaultState();
    }
  }
  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }
  function clearPreviews() {
    for (const space of document.querySelectorAll(".dock-drop-space")) space.remove();
    for (const bar of document.querySelectorAll(".dock-tabbar.drop-tab")) bar.classList.remove("drop-tab");
    for (const dock of document.querySelectorAll(".dock")) delete dock.dataset.zone;
  }
  function zoneAt(dockEl, col, clientY) {
    const barBottom = dockEl.querySelector(".dock-tabbar").getBoundingClientRect().bottom;
    if (clientY <= barBottom) return "tab";
    if (state[col].docks.length >= 2) return "tab";
    const mid = barBottom + (dockEl.getBoundingClientRect().bottom - barBottom) / 2;
    return clientY < mid ? "top" : "bottom";
  }
  function showPreview(dockEl, zone) {
    if (zone === "tab") {
      dockEl.querySelector(".dock-tabbar").classList.add("drop-tab");
      return;
    }
    const space = div("dock-drop-space");
    const body = dockEl.querySelector(".dock-body");
    if (zone === "top") body.before(space);
    else body.after(space);
  }
  function buildTab(dock, id) {
    const panel = panels.get(id);
    const tab = div("dock-tab" + (id === dock.active ? " active" : ""));
    tab.draggable = true;
    tab.dataset.panel = id;
    const label = document.createElement("span");
    label.textContent = panel.title;
    tab.append(label);
    if (panel.badge) tab.append(panel.badge);
    tab.addEventListener("click", () => {
      dock.active = id;
      save();
      render();
    });
    tab.addEventListener("dragstart", (event) => {
      dragging = id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/x-km-dock", id);
    });
    tab.addEventListener("dragend", () => {
      dragging = null;
      clearPreviews();
    });
    return tab;
  }
  function buildDock(col, index, dock) {
    const dockEl = div("dock");
    const bar = div("dock-tabbar");
    for (const id of dock.panels) bar.append(buildTab(dock, id));
    const body = div("dock-body");
    const active = panels.get(dock.active);
    if (active) body.append(active.el);
    dockEl.append(bar, body);
    dockEl.addEventListener("dragover", (event) => {
      if (!dragging) return;
      event.preventDefault();
      event.stopPropagation();
      const zone = zoneAt(dockEl, col, event.clientY);
      if (dockEl.dataset.zone === zone) return;
      clearPreviews();
      dockEl.dataset.zone = zone;
      showPreview(dockEl, zone);
    });
    dockEl.addEventListener("dragleave", (event) => {
      if (!dockEl.contains(event.relatedTarget)) clearPreviews();
    });
    dockEl.addEventListener("drop", (event) => {
      if (!dragging) return;
      event.preventDefault();
      event.stopPropagation();
      const zone = zoneAt(dockEl, col, event.clientY);
      clearPreviews();
      movePanel(dragging, col, index, zone === "tab" ? "center" : zone);
      dragging = null;
    });
    return dockEl;
  }
  function buildSplitter(col) {
    const bar = div("v-splitter");
    bar.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const rect = colEls[col].getBoundingClientRect();
      const move = (ev) => {
        state[col].split = Math.min(0.85, Math.max(0.15, (ev.clientY - rect.top) / rect.height));
        const docks = colEls[col].querySelectorAll(".dock");
        if (docks[0]) docks[0].style.flex = `${state[col].split} 1 0`;
        if (docks[1]) docks[1].style.flex = `${1 - state[col].split} 1 0`;
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        save();
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
    return bar;
  }
  function removePanel(id) {
    for (const col of COLS) {
      const c = state[col];
      for (const d of c.docks) {
        const i = d.panels.indexOf(id);
        if (i < 0) continue;
        d.panels.splice(i, 1);
        if (d.active === id) d.active = d.panels[i] || d.panels[i - 1] || d.panels[0];
      }
      c.docks = c.docks.filter((d) => d.panels.length);
    }
  }
  function movePanel(id, col, index, zone) {
    const target = state[col];
    const targetDock = target.docks[index];
    removePanel(id);
    if (zone === "center") {
      if (targetDock && target.docks.includes(targetDock)) {
        targetDock.panels.push(id);
        targetDock.active = id;
      } else {
        target.docks.push({ panels: [id], active: id });
      }
    } else if (target.docks.length >= 2) {
      const half = zone === "top" ? target.docks[0] : target.docks[target.docks.length - 1];
      half.panels.push(id);
      half.active = id;
    } else {
      const fresh = { panels: [id], active: id };
      if (zone === "top") target.docks.unshift(fresh);
      else target.docks.push(fresh);
      target.split = 0.5;
    }
    if (target.width < MIN_W) target.width = 300;
    save();
    render();
  }
  function render() {
    for (const panel of panels.values()) {
      store.append(panel.el);
      if (panel.badge) store.append(panel.badge);
    }
    for (const col of COLS) {
      const c = state[col];
      const colEl = colEls[col];
      colEl.replaceChildren();
      const empty = !c.docks.length;
      colEl.hidden = empty;
      gutterEls[col].hidden = empty;
      if (empty) continue;
      colEl.style.width = `${c.width}px`;
      c.docks.forEach((dock, i) => {
        const dockEl = buildDock(col, i, dock);
        if (c.docks.length === 2) dockEl.style.flex = `${i === 0 ? c.split : 1 - c.split} 1 0`;
        colEl.append(dockEl);
        if (c.docks.length === 2 && i === 0) colEl.append(buildSplitter(col));
      });
    }
  }
  function wireGutter(col) {
    gutterEls[col].addEventListener("mousedown", (event) => {
      event.preventDefault();
      const startX = event.clientX;
      const startW = state[col].width;
      const move = (ev) => {
        const delta = col === "left" ? ev.clientX - startX : startX - ev.clientX;
        state[col].width = Math.max(MIN_W, Math.min(window.innerWidth * 0.5, startW + delta));
        colEls[col].style.width = `${state[col].width}px`;
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        save();
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
  }
  function revealPanel(id) {
    for (const col of COLS) {
      for (const dock of state[col].docks) {
        if (!dock.panels.includes(id)) continue;
        dock.active = id;
        if (state[col].width < MIN_W) state[col].width = 300;
        save();
        render();
        return;
      }
    }
  }
  function initDocks({ workspace, panelStore }) {
    store = panelStore;
    for (const el of panelStore.querySelectorAll(".dock-panel")) {
      panels.set(el.dataset.panel, {
        el,
        title: el.dataset.panelTitle || el.dataset.panel,
        badge: el.querySelector("[data-tab-badge]")
      });
    }
    for (const col of COLS) {
      colEls[col] = workspace.querySelector(`[data-col="${col}"]`);
      gutterEls[col] = workspace.querySelector(`[data-gutter="${col}"]`);
      wireGutter(col);
    }
    state = load();
    render();
    return { reveal: revealPanel };
  }

  // km-editor/src/js/toolbar.js
  var inlineTools = {
    bold: ["**", "**", "bold text"],
    italic: ["*", "*", "italic text"],
    "bold-italic": ["***", "***", "bold italic text"],
    highlight: ["==", "==", "highlighted text"],
    underline: ["++", "++", "underlined text"],
    strike: ["~~", "~~", "struck text"],
    "inline-spoiler": ["||", "||", "spoiler text"],
    "inline-code": ["`", "`", "code"],
    kbd: ["<kbd>", "</kbd>", "Key"],
    sub: ["~", "~", "2"],
    sup: ["^", "^", "2"]
  };
  var blockSnippets = {
    ul: "- List item\n- Another item",
    ol: "1. First item\n2. Second item",
    task: "- [ ] Task item\n- [x] Done item",
    quote: "> Quoted text",
    divider: "---",
    note: "> [!NOTE]\n> Useful context.",
    tip: "> [!TIP]\n> Helpful note.",
    important: "> [!IMPORTANT]\n> Key information.",
    warning: "> [!WARNING]\n> Important warning.",
    caution: "> [!CAUTION]\n> Risk or consequence.",
    spoiler: ":::spoiler Click to reveal\nHidden content.\n:::",
    "code-block": "```js\nconsole.log('KM');\n```",
    html: "<div>\n  Trusted HTML block.\n</div>",
    image: "![Image description](assets/example-image.png)\n\n[ image: describe the needed image ]",
    video: "![Video caption](assets/example-video.webm)",
    audio: "![Audio caption](assets/example-audio.wav)",
    transclude: "![[page_id#section]]"
  };
  function youtubeEmbedURL(value) {
    let url;
    try {
      url = new URL(String(value).trim());
    } catch {
      return "";
    }
    const host = url.hostname.toLowerCase().replace(/^(?:www|m|music)\./, "");
    let id = "";
    if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] || "";
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      id = url.searchParams.get("v") || /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname)?.[1] || "";
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : "";
  }
  var TOOL_DETAILS = {
    bold: { syntax: "**bold**", example: "<strong>bold text</strong>", shortcut: "Ctrl+B", key: "Mod+KeyB", pin: "B" },
    italic: { syntax: "*italic*", example: "<em>italic text</em>", shortcut: "Ctrl+I", key: "Mod+KeyI", pin: "I" },
    "bold-italic": { syntax: "***both***", example: "<strong><em>bold italic text</em></strong>", shortcut: "Ctrl+Shift+B", key: "Mod+Shift+KeyB", pin: "BI" },
    underline: { syntax: "++underline++", example: "<u>underlined text</u>", shortcut: "Ctrl+U", key: "Mod+KeyU", pin: "U" },
    strike: { syntax: "~~strike~~", example: "<del>struck text</del>", shortcut: "Ctrl+Shift+X", key: "Mod+Shift+KeyX", pin: "S" },
    highlight: { syntax: "==highlight==", example: "<mark>highlighted text</mark>", shortcut: "Ctrl+Shift+H", key: "Mod+Shift+KeyH", pin: "==" },
    "inline-spoiler": { syntax: "||spoiler||", example: '<span class="md-inline-spoiler">spoiler text</span>', shortcut: "Ctrl+Alt+Shift+S", key: "Mod+Alt+Shift+KeyS", pin: "||" },
    "inline-code": { syntax: "`code`", example: "<code>code</code>", shortcut: "Ctrl+`", key: "Mod+Backquote", pin: "</>" },
    kbd: { syntax: "<kbd>Ctrl</kbd>", example: "<kbd>Ctrl</kbd>", shortcut: "Ctrl+Shift+K", key: "Mod+Shift+KeyK", pin: "Key" },
    "inline-math": { syntax: "$E=mc^2$", example: '<span class="km-math"><i>E</i> = mc<sup>2</sup></span>', shortcut: "Ctrl+Shift+M", key: "Mod+Shift+KeyM", pin: "\u2211", opensMenu: true },
    sub: { syntax: "H~2~O", example: "H<sub>2</sub>O", shortcut: "Ctrl+,", key: "Mod+Comma", pin: "X\u2082" },
    sup: { syntax: "x^2^", example: "x<sup>2</sup>", shortcut: "Ctrl+.", key: "Mod+Period", pin: "X\xB2" },
    h1: { syntax: "# Heading", example: '<span class="km-heading km-h1">Heading 1</span>', shortcut: "Ctrl+Alt+1", key: "Mod+Alt+Digit1", pin: "H1" },
    h2: { syntax: "## Heading", example: '<span class="km-heading km-h2">Heading 2</span>', shortcut: "Ctrl+Alt+2", key: "Mod+Alt+Digit2", pin: "H2" },
    h3: { syntax: "### Heading", example: '<span class="km-heading km-h3">Heading 3</span>', shortcut: "Ctrl+Alt+3", key: "Mod+Alt+Digit3", pin: "H3" },
    h4: { syntax: "#### Heading", example: '<span class="km-heading km-h4">Heading 4</span>', shortcut: "Ctrl+Alt+4", key: "Mod+Alt+Digit4", pin: "H4" },
    h5: { syntax: "##### Heading", example: '<span class="km-heading km-h5">Heading 5</span>', shortcut: "Ctrl+Alt+5", key: "Mod+Alt+Digit5", pin: "H5" },
    h6: { syntax: "###### Heading", example: '<span class="km-heading km-h6">Heading 6</span>', shortcut: "Ctrl+Alt+6", key: "Mod+Alt+Digit6", pin: "H6" },
    quote: { syntax: "> quote", example: '<span class="km-quote">Quoted text</span>', shortcut: "Ctrl+Shift+.", key: "Mod+Shift+Period", pin: "Quote" },
    ul: { syntax: "- item", example: '<span class="km-list">\u2022&ensp;List item</span>', shortcut: "Ctrl+Shift+8", key: "Mod+Shift+Digit8", pin: "\u2022 List" },
    ol: { syntax: "1. item", example: '<span class="km-list">1.&ensp;List item</span>', shortcut: "Ctrl+Shift+7", key: "Mod+Shift+Digit7", pin: "1. List" },
    task: { syntax: "- [ ] task", example: '<span class="km-task"><span aria-hidden="true">\u2610</span>&ensp;Task item</span>', shortcut: "Ctrl+Shift+9", key: "Mod+Shift+Digit9", pin: "\u2610 Task" },
    divider: { syntax: "---", example: '<span aria-hidden="true">\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500</span>', shortcut: "Ctrl+Alt+Shift+D", key: "Mod+Alt+Shift+KeyD", pin: "Divider" },
    note: { syntax: "> [!NOTE]", example: '<span class="markdown-alert markdown-alert-note">Useful context</span>', shortcut: "Ctrl+Alt+Shift+N", key: "Mod+Alt+Shift+KeyN", pin: "Note" },
    tip: { syntax: "> [!TIP]", example: '<span class="markdown-alert markdown-alert-tip">Helpful note</span>', shortcut: "Ctrl+Alt+T", key: "Mod+Alt+KeyT", pin: "Tip" },
    important: { syntax: "> [!IMPORTANT]", example: '<span class="markdown-alert markdown-alert-important">Key information</span>', shortcut: "Ctrl+Alt+Shift+I", key: "Mod+Alt+Shift+KeyI", pin: "Important" },
    warning: { syntax: "> [!WARNING]", example: '<span class="markdown-alert markdown-alert-warning">Important warning</span>', shortcut: "Ctrl+Alt+W", key: "Mod+Alt+KeyW", pin: "Warn" },
    caution: { syntax: "> [!CAUTION]", example: '<span class="markdown-alert markdown-alert-caution">Risk or consequence</span>', shortcut: "Ctrl+Alt+Shift+C", key: "Mod+Alt+Shift+KeyC", pin: "Caution" },
    spoiler: { syntax: ":::spoiler \u2026 :::", example: '<span class="md-spoiler">\u25B8&ensp;Click to reveal</span>', shortcut: "Ctrl+Alt+R", key: "Mod+Alt+KeyR", pin: "Spoiler" },
    image: { syntax: "![alt](assets/pic.png)", example: '<span class="km-image">\u25A7&ensp;Image</span>', shortcut: "Ctrl+Alt+I", key: "Mod+Alt+KeyI", pin: "Image" },
    emoji: { syntax: ":joy: or :custom_name:", example: "<span>\u{1F602}</span>", shortcut: "Ctrl+Alt+Shift+E", key: "Mod+Alt+Shift+KeyE", pin: "Emoji", opensMenu: true },
    video: { syntax: "![caption](assets/clip.webm)", example: '<span class="km-iframe">\u25B6&ensp;Video player</span>', shortcut: "Ctrl+Alt+V", key: "Mod+Alt+KeyV", pin: "Video" },
    audio: { syntax: "![caption](assets/track.wav)", example: '<span class="km-iframe">\u266A&ensp;Audio player</span>', shortcut: "Ctrl+Alt+A", key: "Mod+Alt+KeyA", pin: "Audio" },
    youtube: { syntax: "<iframe src=\u2026 >", example: '<span class="km-iframe">YouTube video</span>', shortcut: "Ctrl+Alt+Y", key: "Mod+Alt+KeyY", pin: "YouTube", opensMenu: true },
    "code-block": { syntax: "```js \u2026 ```", example: '<code class="km-code-block">const x = 1</code>', shortcut: "Ctrl+Alt+C", key: "Mod+Alt+KeyC", pin: "Code" },
    mermaid: { syntax: "```mermaid \u2026 ```", example: '<span class="km-mermaid"><b>A</b><span>\u2192</span><b>B</b></span>', shortcut: "Ctrl+Alt+D", key: "Mod+Alt+KeyD", pin: "Diagram", opensMenu: true },
    "display-math": { syntax: "$$ E=mc^2 $$", example: '<span class="km-math km-display-math"><i>E</i> = mc<sup>2</sup></span>', shortcut: "Ctrl+Alt+M", key: "Mod+Alt+KeyM", pin: "Math", opensMenu: true },
    html: { syntax: "<div>\u2026</div>", example: "<code>&lt;div&gt;\u2026&lt;/div&gt;</code>", shortcut: "Ctrl+Alt+H", key: "Mod+Alt+KeyH", pin: "HTML" },
    iframe: { syntax: "<iframe \u2026 >", example: '<span class="km-iframe">Embedded page</span>', shortcut: "Ctrl+Alt+F", key: "Mod+Alt+KeyF", pin: "Iframe", opensMenu: true },
    "link-page": { syntax: "[text](url or id)", example: '<span class="km-link">Linked page</span>', shortcut: "Ctrl+K", key: "Mod+KeyK", pin: "Link", opensMenu: true },
    transclude: { syntax: "![[page#section]]", example: '<span class="km-quote">Embedded page section</span>', shortcut: "Ctrl+Alt+E", key: "Mod+Alt+KeyE", pin: "Embed" },
    "page-query": { syntax: "{{pages \u2026}}", example: '<span class="km-list">Live page list</span>', shortcut: "Ctrl+Alt+Q", key: "Mod+Alt+KeyQ", pin: "Query", opensMenu: true },
    footnote: { syntax: "text[^1] + [^1]: note", example: 'Text<sup class="km-link">1</sup>', shortcut: "Ctrl+Alt+N", key: "Mod+Alt+KeyN", pin: "Footnote" },
    glossary: { syntax: "## Term + definition", example: '<span class="km-glossary-term">Defined term</span>', shortcut: "Ctrl+Alt+G", key: "Mod+Alt+KeyG", pin: "Glossary", opensMenu: true }
  };
  var ACTION_DETAILS = {
    "create-page": { syntax: '<!--km id:"\u2026" -->', example: '<span class="km-page">New page</span>', shortcut: "Ctrl+Alt+P", key: "Mod+Alt+KeyP", pin: "+ Page" },
    "create-folder": { syntax: '<!--km id:"\u2026" -->', example: '<span class="km-page">\u25BE&ensp;Folder</span>', shortcut: "Ctrl+Alt+Shift+P", key: "Mod+Alt+Shift+KeyP", pin: "+ Folder" },
    "create-simple-folder": { syntax: '<!--km id:"\u2026" kind:"simple" -->', example: '<span class="km-page">\u25B9&ensp;Simple folder</span>', shortcut: "Ctrl+Alt+Shift+F", key: "Mod+Alt+Shift+KeyF", pin: "+ Simple" }
  };
  var CHEATSHEET_EXTRAS = {
    blocks: [{
      title: "Tables",
      rows: [
        { label: "Table", syntax: "| A | B |\n| --- | --- |\n| 1 | 2 |", example: "<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td></tr></tbody></table>", shortcut: "Table menu" },
        { label: "Column alignment", syntax: "| :--- | :---: | ---: |", example: "left, center, right", shortcut: "Table menu" }
      ]
    }],
    km: [{
      title: "Bundle format",
      rows: [
        { label: "Page header", syntax: '<!--km\nid:"page_id"\ntitle:"Title"\nparent:"parent_id"\ntags:"tag1, tag2"\ntrail:"trail-name"\nupdated:"2026-07-29"\n-->', example: '<span class="km-page">One page in the bundle</span>', shortcut: "" }
      ]
    }]
  };
  function cheatsheetSections(root2) {
    const sections = [];
    for (const panel of root2.querySelectorAll("[data-tool-list]")) {
      const tab = panel.closest(".command-menu").querySelector("[data-menu]").textContent.trim();
      const groups = [...panel.querySelectorAll(".tool-group")].map((group) => ({
        title: group.querySelector(".tool-group-title").textContent.trim(),
        rows: [...group.querySelectorAll("button[data-tool], button[data-action]")].map((button) => ({
          label: button.querySelector(".tool-name")?.textContent ?? button.textContent.trim(),
          ...commandFor(button).details
        }))
      }));
      sections.push({ tab, groups: groups.concat(CHEATSHEET_EXTRAS[panel.dataset.menuPanel] ?? []) });
    }
    return sections;
  }
  var PIN_STORE_KEY = "km-editor-pinned-tools";
  var DEFAULT_PINNED_TOOLS = [
    "tool:bold",
    "tool:italic",
    "tool:h2",
    "tool:code-block",
    "tool:link-page",
    "tool:emoji"
  ];
  function typesAltGraphCharacter(event) {
    if (!event.getModifierState?.("AltGraph")) return false;
    if (event.key.length !== 1) return false;
    const base = String(event.code || "").replace(/^(Key|Digit)/, "").toLowerCase();
    return base !== event.key.toLowerCase();
  }
  function shortcutKey(event) {
    const parts = [];
    if (event.ctrlKey || event.metaKey) parts.push("Mod");
    if (event.altKey) parts.push("Alt");
    if (event.shiftKey) parts.push("Shift");
    parts.push(event.code);
    return parts.join("+");
  }
  function pinsFromStorage(value) {
    if (value == null) return [...DEFAULT_PINNED_TOOLS];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [...DEFAULT_PINNED_TOOLS];
    } catch {
      return [...DEFAULT_PINNED_TOOLS];
    }
  }
  function storedPins() {
    try {
      return pinsFromStorage(localStorage.getItem(PIN_STORE_KEY));
    } catch {
      return [...DEFAULT_PINNED_TOOLS];
    }
  }
  function commandFor(button) {
    if (button.dataset.tool) {
      return {
        token: `tool:${button.dataset.tool}`,
        details: TOOL_DETAILS[button.dataset.tool]
      };
    }
    return {
      token: `action:${button.dataset.action}`,
      details: ACTION_DETAILS[button.dataset.action]
    };
  }
  function enhanceMenus(root2, actions) {
    const pinnedRoot = root2.querySelector("[data-pinned-tools]");
    const sourceButtons = [...root2.querySelectorAll("[data-tool-list] button[data-tool], [data-tool-list] button[data-action]")];
    const catalog = /* @__PURE__ */ new Map();
    const shortcuts = /* @__PURE__ */ new Map();
    const pins = new Set(storedPins());
    for (const button of sourceButtons) {
      const label = button.textContent.trim();
      const { token, details } = commandFor(button);
      if (!details) continue;
      const row = document.createElement("div");
      const pin = document.createElement("button");
      const name = document.createElement("span");
      const example = document.createElement("span");
      const syntax = document.createElement("code");
      const shortcut = document.createElement("kbd");
      row.className = "tool-menu-row";
      row.dataset.command = token.split(":")[1];
      pin.type = "button";
      pin.className = "tool-pin";
      pin.dataset.pinTool = token;
      name.className = "tool-name";
      name.textContent = label;
      name.classList.toggle("opens-menu", Boolean(details.opensMenu));
      example.className = "tool-example";
      example.innerHTML = details.example;
      syntax.className = "tool-syntax";
      syntax.textContent = details.syntax;
      shortcut.className = "tool-shortcut";
      shortcut.textContent = details.shortcut;
      button.classList.add("tool-menu-action");
      button.replaceChildren(name, example, syntax, shortcut);
      button.title = `${label} (${details.shortcut})`;
      button.replaceWith(row);
      row.append(pin, button);
      catalog.set(token, { button, details, label });
      shortcuts.set(details.key, button);
    }
    const renderPins = () => {
      pinnedRoot.replaceChildren();
      for (const [token, item] of catalog) {
        const pin = root2.querySelector(`[data-pin-tool="${token}"]`);
        const active = pins.has(token);
        pin.textContent = active ? "\u2605" : "\u2606";
        pin.setAttribute("aria-pressed", String(active));
        pin.setAttribute("aria-label", `${active ? "Unpin" : "Pin"} ${item.label}`);
        pin.title = `${active ? "Remove" : "Keep"} ${item.label} ${active ? "from" : "on"} the toolbar`;
        if (!active) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "pinned-tool";
        button.textContent = item.details.pin || item.label;
        button.title = `${item.label} (${item.details.shortcut})`;
        button.disabled = root2.classList.contains("simple-folder-active");
        if (item.button.dataset.tool) button.dataset.tool = item.button.dataset.tool;
        else button.dataset.action = item.button.dataset.action;
        pinnedRoot.append(button);
      }
      pinnedRoot.hidden = !pinnedRoot.childElementCount;
    };
    root2.addEventListener("click", (event) => {
      const history = event.target.closest("[data-history-action]");
      if (history) {
        actions.history(history.dataset.historyAction);
        return;
      }
      const pin = event.target.closest("[data-pin-tool]");
      if (pin) {
        event.preventDefault();
        const token = pin.dataset.pinTool;
        if (pins.has(token)) pins.delete(token);
        else pins.add(token);
        try {
          localStorage.setItem(PIN_STORE_KEY, JSON.stringify([...pins]));
        } catch {
        }
        renderPins();
        return;
      }
      const button = event.target.closest("[data-tool]");
      if (!button || root2.classList.contains("simple-folder-active")) return;
      const tool = button.dataset.tool;
      if (tool === "inline-math" || tool === "display-math") {
        event.stopPropagation();
        actions.openMathBuilder(tool === "display-math");
        return;
      }
      if (tool === "mermaid") {
        event.stopPropagation();
        actions.openMermaidBuilder();
        return;
      }
      if (inlineTools[tool]) {
        const [open, close, placeholder] = inlineTools[tool];
        actions.wrapSelection(open, close, placeholder);
        return;
      }
      if (/^h[1-6]$/.test(tool)) {
        actions.prefixLines(`${"#".repeat(Number(tool[1]))} `, "Heading");
        return;
      }
      if (tool === "page-query") {
        event.stopPropagation();
        actions.openPageQueryBuilder();
        return;
      }
      if (tool === "youtube") {
        actions.addYouTube();
        return;
      }
      if (tool === "iframe") {
        actions.addIframe();
        return;
      }
      if (tool === "emoji") {
        event.stopPropagation();
        actions.openEmojiPicker();
        return;
      }
      if (blockSnippets[tool]) {
        actions.insertBlock(blockSnippets[tool]);
        return;
      }
      if (tool === "link-page") actions.linkPage();
      else if (tool === "footnote") actions.addFootnote();
      else if (tool === "glossary") actions.addGlossary();
    });
    document.addEventListener("keydown", (event) => {
      if (event.defaultPrevented || event.repeat || typesAltGraphCharacter(event) || !event.target.matches?.("textarea")) return;
      const button = shortcuts.get(shortcutKey(event));
      if (!button) return;
      event.preventDefault();
      if (button.dataset.action) event.target.blur();
      button.click();
    });
    renderPins();
  }
  function initToolbar(root2, actions) {
    enhanceMenus(root2, actions);
  }

  // km/src/js/core/deps.js
  var DEPS = {
    // Graph rendering stack. `graph.js` imports these together through
    // loaders.js so D3 is downloaded only when the graph is initialized.
    "d3-selection": "3.0.0",
    "d3-force-3d": "3.0.6",
    "d3-drag": "3.0.0",
    // Code block syntax highlighting and math rendering. These stay lazy so a
    // plain text page does not pay for Highlight.js or KaTeX.
    "highlight.js": "11.11.1",
    "katex": "0.16.22",
    // Markdown parser plus the exact Marked extensions KM enables:
    // alerts, footnotes, emoji shortcodes, and Mermaid blocks.
    "marked": "16.1.2",
    "marked-alert": "2.1.2",
    "marked-footnote": "1.4.0",
    "marked-emoji": "2.0.1",
    // Twemoji artwork (Twitter/Discord style), CC-BY 4.0:
    // https://github.com/jdecked/twemoji
    "emoji-datasource-twitter": "16.0.0",
    // 11.16 adds the newer diagram types the editor's builder offers: venn,
    // ishikawa, wardley, and cynefin. ZenUML lives outside Mermaid core and is
    // registered only for diagrams that start with `zenuml`.
    "mermaid": "11.16.0",
    "@mermaid-js/mermaid-zenuml": "0.2.3",
    // Local developer tooling version. The static app does not load esbuild in
    // the browser, but documenting it here keeps the included tool version easy
    // to find next to the browser dependency versions.
    "esbuild": "0.28.0"
  };
  var CDN_ROOT = "https://cdn.jsdelivr.net/npm";
  var pkgURL = (name, suffix = "") => `${CDN_ROOT}/${name}@${DEPS[name]}${suffix}`;
  var twitterEmojiURL = (emoji) => pkgURL(
    "emoji-datasource-twitter",
    `/img/twitter/64/${[...emoji].map((char) => char.codePointAt(0).toString(16)).join("-")}.png`
  );
  function emojiDataEntries(module) {
    const data = module.default ?? module;
    return data.flatMap((row) => {
      const aliases = Array.isArray(row.short_names) ? row.short_names.filter(Boolean) : [];
      if (!row.unified || !aliases.length) return [];
      return [{
        emoji: String.fromCodePoint(...row.unified.split("-").map((hex) => parseInt(hex, 16))),
        shortcode: row.short_name || aliases[0],
        aliases,
        name: row.name || "",
        group: row.category === "Component" ? "People & Body" : row.category
      }];
    });
  }

  // km-editor/src/js/emoji.js
  var EMOJI_GROUPS = [
    { name: "Smileys & Emotion", icon: "\u{1F600}" },
    { name: "People & Body", icon: "\u{1F44B}" },
    { name: "Animals & Nature", icon: "\u{1F43B}" },
    { name: "Food & Drink", icon: "\u{1F354}" },
    { name: "Travel & Places", icon: "\u{1F697}" },
    { name: "Activities", icon: "\u26BD" },
    { name: "Objects", icon: "\u{1F4A1}" },
    { name: "Symbols", icon: "\u2764\uFE0F" },
    { name: "Flags", icon: "\u{1F3F3}\uFE0F" },
    { name: "Custom", icon: "\u{1F9E9}", custom: true }
  ];
  var CUSTOM_EMOJI_ALIAS = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
  var CUSTOM_EMOJI_TYPES = {
    webp: "image/webp",
    png: "image/png",
    gif: "image/gif",
    avif: "image/avif",
    svg: "image/svg+xml",
    jpg: "image/jpeg",
    jpeg: "image/jpeg"
  };
  var MAX_CUSTOM_EMOJI_SOURCE_BYTES = 20 * 1024 * 1024;
  var MAX_CUSTOM_EMOJI_DATA_LENGTH = 28e5;
  function groupId(name) {
    return `emoji-group-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  }
  function emojiEntries(emojiData) {
    return emojiDataEntries(emojiData).map((entry) => ({
      ...entry,
      searchText: `${entry.name} ${entry.aliases.join(" ")}`.replaceAll("_", " ").toLowerCase()
    }));
  }
  function emojiQueryAtCursor(text, cursor) {
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > text.length) return null;
    const match = /:([A-Za-z0-9_-]{1,32})$/.exec(text.slice(0, cursor));
    if (!match) return null;
    const start = cursor - match[0].length;
    if (start > 0 && /[A-Za-z0-9_:\\]/.test(text[start - 1])) return null;
    return { start, end: cursor, query: match[1].toLowerCase() };
  }
  function emojiButton(entry) {
    const button = document.createElement("button");
    button.type = "button";
    button.append(emojiImage(entry.emoji, entry.src, entry.emoji || `:${entry.shortcode}:`));
    button.dataset.emoji = entry.emoji;
    if (entry.src) button.dataset.emojiSrc = entry.src;
    button.dataset.emojiShortcode = entry.shortcode;
    button.title = `:${entry.shortcode}:`;
    button.setAttribute("aria-label", `Insert :${entry.shortcode}:`);
    return button;
  }
  function emojiImage(emoji, src = twitterEmojiURL(emoji), fallback = emoji) {
    const image = document.createElement("img");
    image.className = "twemoji";
    image.src = src;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.draggable = false;
    image.addEventListener("error", () => image.replaceWith(document.createTextNode(fallback)), { once: true });
    return image;
  }
  function customEmojiEntries(items) {
    return items.map((item) => ({
      emoji: "",
      group: "Custom",
      shortcode: item.alias,
      aliases: [item.alias],
      searchText: item.alias.replaceAll("_", " ").toLowerCase(),
      src: item.data
    }));
  }
  function aliasFromFilename(name) {
    return name.slice(0, Math.max(0, name.lastIndexOf("."))).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_-]+/g, "_").replace(/^[_-]+|[_-]+$/g, "").slice(0, 64) || "emoji";
  }
  function uniqueAlias(base, items) {
    const aliases = new Set(items.map((item) => item.alias));
    if (!aliases.has(base)) return base;
    let index = 2;
    while (aliases.has(`${base}_${index}`)) index++;
    return `${base.slice(0, 63 - String(index).length)}_${index}`;
  }
  async function imageDataURL(file, mime) {
    const blob = new Blob([file], { type: mime });
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("Could not read image"));
      reader.readAsDataURL(blob);
    });
  }
  function fitEmojiSize(width, height, max = 128) {
    const scale = Math.min(1, max / width, max / height);
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale))
    };
  }
  async function optimizedImageDataURL(file, mime) {
    if (mime === "image/gif") return imageDataURL(file, mime);
    const url = URL.createObjectURL(new Blob([file], { type: mime }));
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const size = fitEmojiSize(image.naturalWidth, image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not resize image");
      context.drawImage(image, 0, 0, size.width, size.height);
      return canvas.toDataURL("image/webp", 0.9);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  function initEmojiPicker({
    root: root2,
    search,
    status,
    themes,
    onSelect,
    autocompleteTextareas = [],
    onAutocompleteSelect,
    customEmoji = [],
    onCustomEmojiChange
  }) {
    let entries = [];
    let builtInEntries = [];
    let customItems = [...customEmoji];
    let loadPromise = null;
    let countText = "";
    function showStatus(value) {
      if (typeof value === "string") {
        status.textContent = value;
        return;
      }
      const label = document.createElement("strong");
      label.textContent = `:${value.shortcode}:`;
      status.replaceChildren(
        emojiImage(value.emoji, value.src, value.emoji || `:${value.shortcode}:`),
        label
      );
    }
    function setActiveGroup(name) {
      for (const button of themes.querySelectorAll("[data-emoji-group]")) {
        button.classList.toggle("active", button.dataset.emojiGroup === name);
      }
    }
    function renderThemes() {
      themes.replaceChildren(
        ...EMOJI_GROUPS.map((group) => {
          const button = document.createElement("button");
          button.type = "button";
          button.append(emojiImage(group.icon));
          button.title = group.name;
          button.dataset.emojiGroup = group.name;
          button.setAttribute("aria-label", group.name);
          return button;
        })
      );
      setActiveGroup(EMOJI_GROUPS[0].name);
    }
    function rebuildEntries() {
      const customEntries = customEmojiEntries(customItems);
      const customAliases = new Set(customEntries.map((entry) => entry.shortcode));
      const builtIns = builtInEntries.flatMap((entry) => {
        const aliases = entry.aliases.filter((alias) => !customAliases.has(alias));
        return aliases.length ? [{ ...entry, aliases, shortcode: aliases[0] }] : [];
      });
      entries = [...customEntries, ...builtIns];
    }
    function setCustomEmoji(items) {
      const next = Array.isArray(items) ? [...items] : [];
      if (next.length === customItems.length && next.every(
        (item, index) => item.alias === customItems[index].alias && item.data === customItems[index].data
      )) return;
      customItems = next;
      if (!builtInEntries.length) return;
      rebuildEntries();
      render2();
    }
    function commitCustomEmoji(items, message) {
      const scrollTop = root2.scrollTop;
      setCustomEmoji(items);
      root2.scrollTop = scrollTop;
      setActiveGroup("Custom");
      onCustomEmojiChange?.(customItems);
      if (message) showStatus(message);
    }
    async function importCustomEmoji(files) {
      const next = [...customItems];
      let totalLength = next.reduce((total, item) => total + item.data.length, 0);
      let added = 0;
      let skipped = 0;
      for (const file of files) {
        const extension = file.name.split(".").pop()?.toLowerCase();
        const mime = CUSTOM_EMOJI_TYPES[extension];
        if (!mime || file.size > MAX_CUSTOM_EMOJI_SOURCE_BYTES) {
          skipped++;
          continue;
        }
        let data;
        try {
          data = await optimizedImageDataURL(file, mime);
        } catch {
          skipped++;
          continue;
        }
        if (totalLength + data.length > MAX_CUSTOM_EMOJI_DATA_LENGTH) {
          skipped++;
          continue;
        }
        const alias = uniqueAlias(aliasFromFilename(file.name), next);
        next.push({ alias, data });
        totalLength += data.length;
        added++;
      }
      if (added) commitCustomEmoji(
        next,
        `Added ${added} custom emoji${added === 1 ? "" : "s"}${skipped ? `; skipped ${skipped}` : ""}`
      );
      else showStatus(
        skipped ? "No images added. Check the format, file size, and available embedded storage." : "No images selected."
      );
    }
    function customEmojiManager() {
      const manager = document.createElement("div");
      manager.className = "custom-emoji-manager";
      const drop = document.createElement("div");
      drop.className = "custom-emoji-drop";
      drop.textContent = "Drop emoji images here";
      const add = document.createElement("button");
      add.type = "button";
      add.textContent = "Add images";
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.hidden = true;
      input.accept = ".webp,.png,.gif,.avif,.svg,.jpg,.jpeg,image/*";
      add.addEventListener("click", () => input.click());
      input.addEventListener("change", () => {
        const files = [...input.files];
        input.value = "";
        importCustomEmoji(files).catch(() => showStatus("Could not read one of the images."));
      });
      for (const eventName of ["dragenter", "dragover"]) {
        drop.addEventListener(eventName, (event) => {
          event.preventDefault();
          drop.classList.add("dragging");
        });
      }
      drop.addEventListener("dragleave", () => drop.classList.remove("dragging"));
      drop.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        drop.classList.remove("dragging");
        importCustomEmoji([...event.dataTransfer?.files ?? []]).catch(() => showStatus("Could not read one of the images."));
      });
      drop.append(add, input);
      const help = document.createElement("small");
      help.textContent = "Static images are fitted to 128 px and saved as WebP. GIF animation is preserved.";
      const list = document.createElement("div");
      list.className = "custom-emoji-list";
      if (!customItems.length) {
        list.append(Object.assign(document.createElement("span"), {
          className: "emoji-empty",
          textContent: "No custom emoji yet."
        }));
      }
      for (const item of customItems) {
        const row = document.createElement("div");
        row.className = "custom-emoji-item";
        row.append(emojiImage("", item.data, `:${item.alias}:`));
        const alias = document.createElement("input");
        alias.value = item.alias;
        alias.maxLength = 64;
        alias.setAttribute("aria-label", `Rename :${item.alias}:`);
        alias.addEventListener("change", () => {
          const value = alias.value.trim();
          if (!CUSTOM_EMOJI_ALIAS.test(value) || customItems.some((candidate) => candidate !== item && candidate.alias === value)) {
            alias.setCustomValidity("Use a unique alias with letters, numbers, hyphens, or underscores.");
            alias.reportValidity();
            return;
          }
          commitCustomEmoji(
            customItems.map((candidate) => candidate === item ? { ...candidate, alias: value } : candidate),
            `Renamed :${item.alias}: to :${value}:`
          );
        });
        alias.addEventListener("input", () => alias.setCustomValidity(""));
        alias.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            alias.blur();
          } else if (event.key === "Escape") {
            alias.value = item.alias;
            alias.blur();
          }
        });
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "custom-emoji-remove";
        remove.textContent = "\xD7";
        remove.title = `Remove :${item.alias}:`;
        remove.setAttribute("aria-label", remove.title);
        remove.addEventListener("click", () => commitCustomEmoji(
          customItems.filter((candidate) => candidate !== item),
          `Removed :${item.alias}:`
        ));
        row.append(alias, remove);
        list.append(row);
      }
      manager.append(drop, help, list);
      return manager;
    }
    function render2() {
      const query = search.value.trim().toLowerCase().replaceAll("_", " ");
      const filtered = entries.filter((entry) => !query || entry.searchText.includes(query));
      const sections = EMOJI_GROUPS.flatMap((group) => {
        const matches = filtered.filter((entry) => entry.group === group.name);
        if (!matches.length && (!group.custom || query)) return [];
        const section = document.createElement("section");
        section.className = "emoji-section";
        section.id = groupId(group.name);
        section.dataset.emojiSection = group.name;
        const heading = document.createElement("h3");
        heading.className = "emoji-section-title";
        heading.textContent = group.name;
        section.append(heading);
        if (group.custom && !query) section.append(customEmojiManager());
        if (matches.length) {
          section.append(...matches.map(emojiButton));
        }
        return [section];
      });
      root2.replaceChildren(...sections);
      root2.scrollTop = 0;
      countText = filtered.length ? `${filtered.length} emoji${filtered.length === 1 ? "" : "s"}` : "No emoji found";
      showStatus(countText);
      for (const button of themes.querySelectorAll("[data-emoji-group]")) {
        button.disabled = query ? !filtered.some((entry) => entry.group === button.dataset.emojiGroup) : false;
      }
      setActiveGroup(sections[0]?.dataset.emojiSection ?? "");
    }
    async function load2() {
      if (builtInEntries.length) return;
      if (!loadPromise) {
        showStatus("Loading emoji...");
        search.disabled = true;
        loadPromise = import(pkgURL("emoji-datasource-twitter", "/emoji.json/+esm")).then((emojiData) => {
          builtInEntries = emojiEntries(emojiData);
          rebuildEntries();
          search.disabled = false;
          renderThemes();
          render2();
        }).catch((error) => {
          loadPromise = null;
          showStatus("Could not load emoji");
          throw error;
        });
      }
      return loadPromise;
    }
    search.addEventListener("input", render2);
    themes.addEventListener("click", (event) => {
      const button = event.target.closest("[data-emoji-group]");
      if (!button || button.disabled) return;
      const section = document.getElementById(groupId(button.dataset.emojiGroup));
      if (!section) return;
      root2.scrollTo({ top: section.offsetTop, behavior: "smooth" });
      setActiveGroup(button.dataset.emojiGroup);
    });
    root2.addEventListener("scroll", () => {
      const sections = [...root2.querySelectorAll("[data-emoji-section]")];
      const atBottom = root2.scrollTop + root2.clientHeight >= root2.scrollHeight - 8;
      const current = atBottom ? sections.at(-1) : sections.findLast((section) => section.offsetTop <= root2.scrollTop + 8);
      if (current) setActiveGroup(current.dataset.emojiSection);
    });
    const showButton = (event) => {
      const button = event.target.closest("[data-emoji-shortcode]");
      if (!button) return;
      showStatus({
        emoji: button.dataset.emoji,
        src: button.dataset.emojiSrc,
        shortcode: button.dataset.emojiShortcode
      });
    };
    root2.addEventListener("pointerover", showButton);
    root2.addEventListener("focusin", showButton);
    root2.addEventListener("pointerleave", () => showStatus(countText));
    root2.addEventListener("click", (event) => {
      const button = event.target.closest("[data-emoji-shortcode]");
      if (!button) return;
      onSelect(`:${button.dataset.emojiShortcode}:`);
    });
    if (autocompleteTextareas.length && onAutocompleteSelect) {
      const autocomplete = document.createElement("div");
      autocomplete.id = "emoji-autocomplete";
      autocomplete.className = "emoji-autocomplete";
      autocomplete.role = "listbox";
      autocomplete.hidden = true;
      document.body.append(autocomplete);
      let autocompleteState = null;
      let activeIndex = 0;
      const hideAutocomplete = () => {
        autocomplete.hidden = true;
        autocompleteState = null;
        for (const textarea of autocompleteTextareas) {
          textarea.setAttribute("aria-expanded", "false");
          textarea.removeAttribute("aria-activedescendant");
        }
      };
      const setActiveSuggestion = (index) => {
        const buttons = [...autocomplete.querySelectorAll("button")];
        if (!buttons.length) return;
        activeIndex = (index + buttons.length) % buttons.length;
        buttons.forEach((button, buttonIndex) => {
          const active2 = buttonIndex === activeIndex;
          button.classList.toggle("active", active2);
          button.setAttribute("aria-selected", String(active2));
        });
        const active = buttons[activeIndex];
        autocompleteState.textarea.setAttribute("aria-activedescendant", active.id);
        active.scrollIntoView({ block: "nearest" });
      };
      const chooseSuggestion = (button) => {
        if (!autocompleteState || !button) return;
        const { textarea, start, end } = autocompleteState;
        hideAutocomplete();
        onAutocompleteSelect({
          textarea,
          start,
          end,
          shortcode: button.dataset.emojiShortcode
        });
      };
      const positionAutocomplete = (textarea) => {
        const rect = textarea.getBoundingClientRect();
        const style = getComputedStyle(textarea);
        const before = textarea.value.slice(0, textarea.selectionStart);
        const lineStart = before.lastIndexOf("\n") + 1;
        const line = before.slice(0, lineStart).split("\n").length - 1;
        const column = before.length - lineStart;
        const lineHeight = parseFloat(style.lineHeight) || 20;
        const characterWidth = (parseFloat(style.fontSize) || 13) * 0.62;
        let left = rect.left + (parseFloat(style.paddingLeft) || 0) + column * characterWidth - textarea.scrollLeft;
        let top = rect.top + (parseFloat(style.paddingTop) || 0) + (line + 1) * lineHeight - textarea.scrollTop;
        left = Math.max(8, Math.min(left, innerWidth - autocomplete.offsetWidth - 8));
        if (top + autocomplete.offsetHeight > Math.min(rect.bottom, innerHeight) - 8)
          top -= autocomplete.offsetHeight + lineHeight;
        autocomplete.style.left = `${left}px`;
        autocomplete.style.top = `${Math.max(8, top)}px`;
      };
      const updateAutocomplete = async (textarea) => {
        const trigger = emojiQueryAtCursor(textarea.value, textarea.selectionStart);
        if (!trigger || textarea.selectionStart !== textarea.selectionEnd) {
          hideAutocomplete();
          return;
        }
        try {
          await load2();
        } catch {
          hideAutocomplete();
          return;
        }
        const current = emojiQueryAtCursor(textarea.value, textarea.selectionStart);
        if (!current || current.start !== trigger.start || current.query !== trigger.query) return;
        const suggestions = [];
        for (const entry of entries) {
          for (const alias of entry.aliases) {
            if (!alias.toLowerCase().startsWith(current.query)) continue;
            suggestions.push({ ...entry, shortcode: alias });
            if (suggestions.length === 8) break;
          }
          if (suggestions.length === 8) break;
        }
        if (!suggestions.length) {
          hideAutocomplete();
          return;
        }
        autocomplete.replaceChildren(...suggestions.map((entry, index) => {
          const button = document.createElement("button");
          button.type = "button";
          button.id = `emoji-autocomplete-option-${index}`;
          button.role = "option";
          button.dataset.emojiShortcode = entry.shortcode;
          button.append(
            emojiImage(entry.emoji, entry.src, entry.emoji || `:${entry.shortcode}:`),
            Object.assign(document.createElement("code"), {
              textContent: `:${entry.shortcode}:`
            })
          );
          return button;
        }));
        autocompleteState = { textarea, ...current };
        autocomplete.hidden = false;
        textarea.setAttribute("aria-expanded", "true");
        positionAutocomplete(textarea);
        setActiveSuggestion(0);
      };
      autocomplete.addEventListener("mousedown", (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        event.preventDefault();
        chooseSuggestion(button);
      });
      for (const textarea of autocompleteTextareas) {
        textarea.setAttribute("aria-autocomplete", "list");
        textarea.setAttribute("aria-controls", autocomplete.id);
        textarea.setAttribute("aria-expanded", "false");
        textarea.addEventListener("input", () => updateAutocomplete(textarea));
        textarea.addEventListener("click", () => updateAutocomplete(textarea));
        textarea.addEventListener("blur", () => setTimeout(hideAutocomplete));
        textarea.addEventListener("scroll", hideAutocomplete, { passive: true });
        textarea.addEventListener("keydown", (event) => {
          if (autocomplete.hidden) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setActiveSuggestion(activeIndex + (event.key === "ArrowDown" ? 1 : -1));
          } else if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            chooseSuggestion(autocomplete.querySelectorAll("button")[activeIndex]);
          } else if (event.key === "Escape") {
            event.preventDefault();
            hideAutocomplete();
          }
        });
      }
    }
    return { load: load2, setCustomEmoji };
  }

  // km-editor/src/js/math.js
  var KATEX_ROOT = pkgURL("katex", "/dist/");
  var MATH_CATEGORIES = [
    {
      id: "common",
      label: "Common symbols",
      icon: "\\times\\cap\\propto",
      groups: [
        {
          title: "Binary operations",
          items: "+ - \\times \\div \\pm \\mp \\triangleleft \\triangleright \\cdot \\setminus \\star \\ast \\cup \\cap \\sqcup \\sqcap \\vee \\wedge \\circ \\bullet \\oplus \\ominus \\odot \\oslash \\otimes \\bigcirc \\diamond \\uplus \\bigtriangleup \\bigtriangledown \\lhd \\rhd \\unlhd \\unrhd \\amalg \\wr \\dagger \\ddagger"
        },
        {
          title: "Binary relations",
          items: "< > = \\le \\ge \\equiv \\ll \\gg \\doteq \\prec \\succ \\sim \\preceq \\succeq \\simeq \\approx \\subset \\supset \\subseteq \\supseteq \\sqsubset \\sqsupset \\sqsubseteq \\sqsupseteq \\cong \\bowtie \\propto \\in \\ni \\vdash \\dashv \\models \\mid \\parallel \\perp \\smile \\frown \\asymp \\notin \\neq"
        },
        {
          title: "Arrows",
          items: "\\leftarrow \\rightarrow \\longleftarrow \\longrightarrow \\uparrow \\downarrow \\updownarrow \\leftrightarrow \\Uparrow \\Downarrow \\Updownarrow \\longleftrightarrow \\Leftarrow \\Rightarrow \\Longleftarrow \\Longrightarrow \\Leftrightarrow \\Longleftrightarrow \\iff \\mapsto \\longmapsto \\nearrow \\searrow \\swarrow \\nwarrow \\hookleftarrow \\hookrightarrow \\rightleftharpoons \\leftharpoonup \\rightharpoonup \\leftharpoondown \\rightharpoondown"
        },
        {
          title: "Others",
          items: "\\because \\therefore \\cdots \\ldots \\vdots \\ddots \\forall \\exists \\nexists \\neg \\emptyset \\infty \\nabla \\partial \\triangle \\square \\Diamond \\bot \\top \\angle \\measuredangle \\surd \\heartsuit \\clubsuit \\spadesuit \\flat \\natural \\sharp"
        }
      ]
    },
    {
      id: "greek",
      label: "Greek letters",
      icon: "\\alpha\\beta\\gamma",
      groups: [
        {
          title: "Lowercase",
          items: "\\alpha \\beta \\gamma \\delta \\epsilon \\varepsilon \\zeta \\eta \\theta \\vartheta \\iota \\kappa \\lambda \\mu \\nu \\xi \\pi \\varpi \\rho \\varrho \\sigma \\varsigma \\tau \\upsilon \\phi \\varphi \\chi \\psi \\omega"
        },
        {
          title: "Uppercase",
          items: "\\Gamma \\Delta \\Theta \\Lambda \\Xi \\Pi \\Sigma \\Upsilon \\Phi \\Psi \\Omega"
        },
        {
          title: "Others",
          items: "\\hbar \\imath \\jmath \\ell \\Re \\Im \\aleph \\beth \\gimel \\daleth \\wp \\mho \\complement \\circledS \\S \\mathbb{ABC} \\mathfrak{ABC} \\mathcal{ABC} \\mathsf{ABC} \\operatorname{def}"
        }
      ]
    },
    {
      id: "fractions",
      label: "Fractions and derivatives",
      icon: "\\frac{x}{y}",
      groups: [
        {
          title: "Fractions",
          items: "\\frac{}{} \\dfrac{}{} \\tfrac{}{} \\cfrac{}{} \\mathrm{d}t \\frac{\\mathrm{d}y}{\\mathrm{d}x} \\partial{t} \\frac{\\partial{y}}{\\partial{x}} \\nabla\\psi \\frac{\\partial^{2}y}{\\partial{x_1}\\partial{x_2}}"
        },
        {
          title: "Derivative",
          items: "\\dot{a} \\ddot{a} f' f'' f^{(n)}"
        },
        {
          title: "Modular arithmetic",
          items: "a\\bmod{b} a\\equiv{b}\\pmod{m} \\gcd(m,n) \\operatorname{lcm}(m,n)"
        }
      ]
    },
    {
      id: "roots",
      label: "Roots and scripts",
      icon: "\\sqrt{e^x}",
      groups: [
        {
          title: "Radicals",
          items: "\\sqrt{} \\sqrt[n]{}"
        },
        {
          title: "Sub and super",
          items: "x^{} x_{} x_{a}^{b} x_{a}^{b}y^{c}"
        },
        {
          title: "Accents and others",
          items: "\\hat{a} \\check{a} \\grave{a} \\acute{a} \\tilde{a} \\breve{a} \\bar{a} \\vec{a} 37^\\circ \\widehat{abc} \\widetilde{abc} \\overleftarrow{abc} \\overrightarrow{abc} \\overline{abc} \\underline{abc} \\overbrace{abc} \\underbrace{abc} \\overset{a}{abc} \\underset{a}{abc} \\stackrel{a}{\\longrightarrow}"
        }
      ]
    },
    {
      id: "limits",
      label: "Limits and logs",
      icon: "\\lim_{n\\to\\infty}",
      groups: [
        {
          title: "Limits",
          items: "\\lim \\lim_{x\\to0} \\lim_{x\\to\\infty} \\lim_{{}\\to{}} \\max_{} \\min_{}"
        },
        {
          title: "Logarithms and exponentials",
          items: "\\log_{a}{b} \\lg{a} \\ln{a} \\exp{a} e^{x} a^{x}"
        },
        {
          title: "Bounds",
          items: "\\min{x} \\max{y} \\sup{t} \\inf{s} \\limsup{w} \\liminf{v} \\dim{p} \\ker{\\phi}"
        }
      ]
    },
    {
      id: "trig",
      label: "Trig functions",
      icon: "\\sin\\alpha",
      groups: [
        {
          title: "Trigonometric functions",
          items: "\\sin{\\alpha} \\cos{\\alpha} \\tan{\\alpha} \\cot{\\alpha} \\sec{\\alpha} \\csc{\\alpha}"
        },
        {
          title: "Inverse trigonometric functions",
          items: "\\sin^{-1}{\\alpha} \\cos^{-1}{\\alpha} \\tan^{-1}{\\alpha} \\cot^{-1}{\\alpha} \\sec^{-1}{\\alpha} \\csc^{-1}{\\alpha} \\arcsin{a} \\arccos{a} \\arctan{a} \\operatorname{arccot}{a} \\operatorname{arcsec}{a} \\operatorname{arccsc}{a}"
        },
        {
          title: "Hyperbolic functions",
          items: "\\sinh{\\alpha} \\cosh{\\alpha} \\tanh{\\alpha} \\coth{\\alpha} \\operatorname{sech}{\\alpha} \\operatorname{csch}{\\alpha}"
        },
        {
          title: "Inverse hyperbolic functions",
          items: "\\sinh^{-1}{\\alpha} \\cosh^{-1}{\\alpha} \\tanh^{-1}{\\alpha} \\coth^{-1}{\\alpha} \\operatorname{sech}^{-1}{\\alpha} \\operatorname{csch}^{-1}{\\alpha}"
        }
      ]
    },
    {
      id: "integrals",
      label: "Integrals",
      icon: "\\int_a^b",
      groups: [
        {
          title: "Integral",
          items: "\\int \\int_{a}^{b} \\int\\limits_{a}^{b}"
        },
        {
          title: "Double and triple",
          items: "\\iint \\iint_{a}^{b} \\iiint \\iiint_{a}^{b}"
        },
        {
          title: "Closed line or path integral",
          items: "\\oint \\oint_{C} \\oint_{a}^{b}"
        }
      ]
    },
    {
      id: "operators",
      label: "Large operators",
      icon: "\\sum_{i=0}^{n}",
      groups: [
        {
          title: "Summation",
          items: "\\sum \\sum_{a}^{b} \\sum\\nolimits_{a}^{b} \\sum_{i=0}^{n}"
        },
        {
          title: "Product and coproduct",
          items: "\\prod \\prod_{a}^{b} \\coprod \\coprod_{a}^{b}"
        },
        {
          title: "Union and intersection",
          items: "\\bigcup \\bigcup_{a}^{b} \\bigcap \\bigcap_{a}^{b} \\biguplus \\bigsqcup"
        },
        {
          title: "Disjunction and conjunction",
          items: "\\bigvee \\bigvee_{a}^{b} \\bigwedge \\bigwedge_{a}^{b} \\bigoplus \\bigotimes \\bigodot"
        }
      ]
    },
    {
      id: "brackets",
      label: "Brackets and floors",
      icon: "\\{[()]\\}",
      groups: [
        {
          title: "Brackets",
          items: "\\left({}\\right) \\left[{}\\right] \\left\\langle{}\\right\\rangle \\left\\{{}\\right\\} \\left|{}\\right| \\left\\|{}\\right\\| \\left\\lfloor{}\\right\\rfloor \\left\\lceil{}\\right\\rceil"
        },
        {
          title: "Commons",
          items: "\\binom{n}{r} [0,1) \\langle\\psi| |\\psi\\rangle \\langle\\psi|\\psi\\rangle"
        }
      ]
    },
    {
      id: "matrices",
      label: "Arrays and matrices",
      icon: "\\begin{bmatrix}0&1\\\\1&0\\end{bmatrix}",
      groups: [
        {
          title: "Matrices",
          items: "\\begin{matrix}a&b\\\\c&d\\end{matrix} \\begin{pmatrix}a&b\\\\c&d\\end{pmatrix} \\begin{bmatrix}a&b\\\\c&d\\end{bmatrix} \\begin{vmatrix}a&b\\\\c&d\\end{vmatrix} \\begin{Vmatrix}a&b\\\\c&d\\end{Vmatrix} \\begin{Bmatrix}a&b\\\\c&d\\end{Bmatrix}"
        },
        {
          title: "Arrays and cases",
          items: "\\begin{cases}a&x>0\\\\b&x\\le0\\end{cases} \\begin{aligned}y&=x+1\\\\z&=x\\end{aligned} \\begin{array}{cc}a&b\\\\c&d\\end{array} \\cdots \\vdots \\ddots"
        }
      ]
    },
    {
      id: "text",
      label: "Text and color",
      icon: "\\textcolor{#4ea1ff}{Aa}",
      groups: [
        {
          title: "Text and fonts",
          items: "\\text{} \\textrm{} \\textbf{} \\textit{} \\texttt{} \\textsf{} \\mathrm{} \\mathbf{} \\mathit{} \\mathbb{ABC} \\mathcal{ABC} \\mathfrak{ABC} \\mathscr{ABC} \\operatorname{}"
        },
        {
          title: "Color",
          items: "\\textcolor{red}{} \\textcolor{blue}{} \\textcolor{green}{} \\textcolor{orange}{} \\textcolor{purple}{} \\textcolor{teal}{} \\textcolor{#4ea1ff}{} \\colorbox{yellow}{} \\fcolorbox{red}{white}{}"
        },
        {
          title: "Boxes and marks",
          items: "\\boxed{} \\fbox{} \\underline{} \\overline{} \\cancel{} \\bcancel{} \\xcancel{} \\sout{}"
        },
        {
          title: "Size and style",
          items: "{\\tiny{}} {\\small{}} {\\large{}} {\\Large{}} {\\huge{}} {\\displaystyle\\frac{a}{b}} {\\textstyle\\frac{a}{b}} {\\scriptstyle\\frac{a}{b}}"
        },
        {
          title: "Spacing and breaks",
          items: "a\\,b a\\:b a\\;b a\\!b a\\quad{b} a\\qquad{b} a\\hspace{1em}b a\\\\b a\\phantom{b}c \\substack{a\\\\b}"
        }
      ]
    },
    {
      id: "science",
      label: "Science templates",
      icon: "E=mc^2",
      groups: [
        {
          title: "Physics",
          templates: [
            { name: "Mass-energy", latex: "E = mc^2" },
            { name: "Schrodinger equation", latex: "i\\hbar\\frac{\\partial}{\\partial t}\\Psi = \\hat{H}\\Psi" },
            { name: "Einstein field equations", latex: "G_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} = \\frac{8\\pi G}{c^4} T_{\\mu\\nu}" },
            { name: "Lorentz factor", latex: "\\gamma = \\frac{1}{\\sqrt{1 - v^2/c^2}}" },
            { name: "Maxwell-Faraday", latex: "\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}" }
          ]
        },
        {
          title: "Chemistry",
          templates: [
            { name: "Ideal gas law", latex: "PV = nRT" },
            { name: "Equilibrium constant", latex: "K_{eq} = \\frac{[\\mathrm{C}]^c[\\mathrm{D}]^d}{[\\mathrm{A}]^a[\\mathrm{B}]^b}" },
            { name: "Arrhenius equation", latex: "k = A e^{-E_a / (RT)}" },
            { name: "Nernst equation", latex: "E = E^\\circ - \\frac{RT}{zF}\\ln Q" },
            { name: "pH", latex: "\\mathrm{pH} = -\\log_{10}[\\mathrm{H}^+]" }
          ]
        },
        {
          title: "Biology and medicine",
          templates: [
            { name: "Michaelis-Menten", latex: "v = \\frac{V_{\\max}[S]}{K_M + [S]}" },
            { name: "Hardy-Weinberg", latex: "p^2 + 2pq + q^2 = 1" },
            { name: "Logistic growth", latex: "\\frac{dN}{dt} = rN\\left(1 - \\frac{N}{K}\\right)" },
            { name: "SIR infected", latex: "\\frac{dI}{dt} = \\beta SI - \\gamma I" },
            { name: "Reproduction number", latex: "R_0 = \\frac{\\beta}{\\gamma}" }
          ]
        },
        {
          title: "Statistics and data",
          templates: [
            { name: "Normal distribution", latex: "f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}" },
            { name: "Bayes theorem", latex: "P(A \\mid B) = \\frac{P(B \\mid A)\\,P(A)}{P(B)}" },
            { name: "Linear model", latex: "\\hat{y} = \\beta_0 + \\sum_{i=1}^{n} \\beta_i x_i" },
            { name: "Confidence interval", latex: "\\bar{x} \\pm z\\frac{s}{\\sqrt{n}}" },
            { name: "Standard deviation", latex: "\\sigma = \\sqrt{\\frac{1}{N}\\sum_{i=1}^{N}(x_i - \\mu)^2}" }
          ]
        },
        {
          title: "Machine learning",
          templates: [
            { name: "Scaled dot-product attention", latex: "\\mathrm{Attention}(Q,K,V) = \\mathrm{softmax}\\left(\\frac{QK^\\top}{\\sqrt{d_k}}\\right)V" },
            { name: "Softmax", latex: "\\sigma(z)_i = \\frac{e^{z_i}}{\\sum_{j=1}^{K} e^{z_j}}" },
            { name: "Cross-entropy loss", latex: "\\mathcal{L} = -\\sum_{i} y_i \\log \\hat{y}_i" },
            { name: "Gradient descent step", latex: "\\theta_{t+1} = \\theta_t - \\eta \\nabla_\\theta \\mathcal{L}(\\theta_t)" },
            { name: "KL divergence", latex: "D_{\\mathrm{KL}}(P \\parallel Q) = \\sum_x P(x)\\log\\frac{P(x)}{Q(x)}" }
          ]
        },
        {
          title: "Quantum computing",
          templates: [
            { name: "Qubit state", latex: "|\\psi\\rangle = \\alpha|0\\rangle + \\beta|1\\rangle" },
            { name: "Born rule", latex: "P(x) = |\\langle x|\\psi\\rangle|^2" },
            { name: "Hadamard gate", latex: "H = \\frac{1}{\\sqrt{2}}\\begin{pmatrix}1 & 1\\\\1 & -1\\end{pmatrix}" },
            { name: "Bell state", latex: "|\\Phi^+\\rangle = \\frac{1}{\\sqrt{2}}(|00\\rangle + |11\\rangle)" }
          ]
        },
        {
          title: "Engineering and signals",
          templates: [
            { name: "Fourier transform", latex: "\\hat{f}(\\xi) = \\int_{-\\infty}^{\\infty} f(x)e^{-2\\pi i x\\xi}\\,dx" },
            { name: "Convolution", latex: "(f * g)(t) = \\int_{-\\infty}^{\\infty} f(\\tau)g(t-\\tau)\\,d\\tau" },
            { name: "Laplace transform", latex: "F(s) = \\int_{0}^{\\infty} f(t)e^{-st}\\,dt" },
            { name: "Channel capacity", latex: "C = B\\log_2\\left(1 + \\frac{S}{N}\\right)" }
          ]
        },
        {
          title: "Climate and energy",
          templates: [
            { name: "Radiative forcing", latex: "\\Delta F = 5.35\\ln\\frac{C}{C_0}" },
            { name: "Stefan-Boltzmann", latex: "P = \\sigma A T^4" },
            { name: "Levelized cost of energy", latex: "\\mathrm{LCOE} = \\frac{\\sum_t (I_t + M_t)(1+r)^{-t}}{\\sum_t E_t(1+r)^{-t}}" }
          ]
        }
      ]
    }
  ];
  var INLINE_MATH = /\$(?!\$|\s|\d)(?:\\.|[^\n$\\])*\S\$(?!\$)/g;
  var DISPLAY_MATH = /\$\$[\s\S]*?\$\$/g;
  function maskCode(text) {
    let inFence = false;
    return text.split("\n").map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return " ".repeat(line.length);
      }
      if (inFence) return " ".repeat(line.length);
      return line.replace(/`[^`\n]*`/g, (match) => " ".repeat(match.length));
    }).join("\n");
  }
  function findFormulas(source) {
    const text = String(source ?? "");
    const masked = maskCode(text);
    const formulas = [];
    for (const [pattern, display] of [[DISPLAY_MATH, true], [INLINE_MATH, false]]) {
      pattern.lastIndex = 0;
      for (const match of masked.matchAll(pattern)) {
        const start = match.index;
        const end = start + match[0].length;
        if (formulas.some((other) => start >= other.start && end <= other.end)) continue;
        const pad = display ? 2 : 1;
        formulas.push({ start, end, display, latex: text.slice(start + pad, end - pad).trim() });
      }
    }
    return formulas.sort((a, b) => a.start - b.start);
  }
  function mathAtCursor(source, cursor = 0) {
    const text = String(source ?? "");
    const at = Math.max(0, Math.min(text.length, Number(cursor) || 0));
    return findFormulas(text).find((formula) => at >= formula.start && at <= formula.end) ?? null;
  }
  var katexMessage = (error) => String(error?.message || error).replace(/^KaTeX parse error:\s*/, "").replace(/ at (position \d+|end of input):[\s\S]*$/, "");
  function katexError(latex, display = false) {
    if (!katex) return "";
    try {
      katex.renderToString(latex, { displayMode: display, throwOnError: true });
      return "";
    } catch (error) {
      return katexMessage(error);
    }
  }
  function findMathProblems(pages, check = katexError) {
    const problems = [];
    for (const page of pages) {
      const text = String(page.content ?? "");
      for (const formula of findFormulas(text)) {
        const error = check(formula.latex, formula.display);
        if (!error) continue;
        problems.push({
          // A warning, not an error: KM still publishes the page, it just
          // shows the formula as broken red output.
          level: "warning",
          code: "invalid-math",
          pageUid: page.uid,
          line: text.slice(0, formula.start).split("\n").length - 1,
          start: formula.start,
          end: formula.end,
          text: `${page.title || page.id || "(untitled page)"} has math that will not render: ${error}`
        });
      }
    }
    return problems;
  }
  function wrapMath(latex, display = false) {
    const source = String(latex ?? "").trim();
    if (display) return `$$
${source}
$$`;
    const inline = source.replace(/\s*\n\s*/g, " ");
    return `$${/^[\d\s]/.test(inline) ? "{}" : ""}${inline}$`;
  }
  function snippetCaret(snippet) {
    const index = snippet.indexOf("{}");
    return index < 0 ? snippet.length : index + 1;
  }
  function sampleSnippet(snippet) {
    let used = 0;
    return snippet.replaceAll("{}", () => `{${String.fromCharCode(97 + used++)}}`);
  }
  function insertSnippet(field, snippet) {
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    field.focus();
    if (!document.execCommand("insertText", false, snippet)) field.setRangeText(snippet, start, end, "end");
    const caret = start + snippetCaret(snippet);
    field.setSelectionRange(caret, caret);
  }
  function ensureKatexCss() {
    if (document.getElementById("katex-css")) return;
    document.head.append(Object.assign(document.createElement("link"), {
      id: "katex-css",
      rel: "stylesheet",
      href: `${KATEX_ROOT}katex.min.css`
    }));
  }
  var katex = null;
  var katexLoad = null;
  function ensureKatex() {
    if (!katexLoad) {
      ensureKatexCss();
      katexLoad = import(pkgURL("katex", "/dist/katex.min.js/+esm")).then((module) => {
        katex = module.default ?? module;
        return katex;
      });
    }
    return katexLoad;
  }
  function initMathPanel({ form, tabs, palette, input, preview, status }) {
    let loading = false;
    let active = MATH_CATEGORIES[0].id;
    const displayMode = () => form.elements.display.value === "block";
    function typeset(target, latex, display = false) {
      target.replaceChildren();
      if (!katex) {
        target.textContent = latex;
        return null;
      }
      try {
        target.innerHTML = katex.renderToString(latex, { displayMode: display, throwOnError: true });
        return null;
      } catch (error) {
        target.textContent = latex;
        return katexMessage(error);
      }
    }
    function load2() {
      if (loading) return;
      loading = true;
      status.hidden = false;
      status.textContent = "Loading KaTeX...";
      ensureKatex().then(() => {
        status.hidden = true;
        status.textContent = "";
        renderTabs();
        renderPalette();
        renderPreview();
      }).catch(() => {
        status.hidden = false;
        status.textContent = "KaTeX could not load. LaTeX still inserts as typed.";
      });
    }
    function renderTabs() {
      tabs.replaceChildren(...MATH_CATEGORIES.map((category) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.mathCategory = category.id;
        button.classList.toggle("active", category.id === active);
        button.title = category.label;
        const icon = document.createElement("span");
        icon.className = "math-tab-icon";
        typeset(icon, category.icon);
        const label = document.createElement("span");
        label.className = "math-tab-label";
        label.textContent = category.label;
        button.append(icon, label);
        return button;
      }));
    }
    function snippetButton(snippet) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.math = snippet;
      button.title = snippet;
      button.setAttribute("aria-label", `Insert ${snippet}`);
      typeset(button, sampleSnippet(snippet));
      return button;
    }
    function templateButton({ name, latex }) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "math-template";
      button.dataset.math = latex;
      button.title = latex;
      button.setAttribute("aria-label", `Insert ${name}`);
      const label = document.createElement("span");
      label.className = "math-template-name";
      label.textContent = name;
      const formula = document.createElement("span");
      formula.className = "math-template-formula";
      typeset(formula, latex);
      button.append(label, formula);
      return button;
    }
    function renderPalette() {
      const category = MATH_CATEGORIES.find((item) => item.id === active) ?? MATH_CATEGORIES[0];
      palette.replaceChildren(...category.groups.flatMap((group) => {
        const title = document.createElement("strong");
        title.className = "math-group-title";
        title.textContent = group.title;
        const buttons = group.templates ? group.templates.map(templateButton) : group.items.split(/\s+/).map(snippetButton);
        return [title, ...buttons];
      }));
    }
    function renderPreview() {
      const latex = input.value.trim();
      if (!latex) {
        preview.replaceChildren();
        if (katex) status.hidden = true;
        return;
      }
      const error = typeset(preview, latex, displayMode());
      if (!katex) return;
      status.hidden = !error;
      status.textContent = error ?? "";
    }
    tabs.addEventListener("click", (event) => {
      const button = event.target.closest("[data-math-category]");
      if (!button) return;
      active = button.dataset.mathCategory;
      for (const tab of tabs.children) tab.classList.toggle("active", tab === button);
      renderPalette();
    });
    palette.addEventListener("click", (event) => {
      const button = event.target.closest("[data-math]");
      if (!button) return;
      insertSnippet(input, button.dataset.math);
      renderPreview();
    });
    form.addEventListener("input", renderPreview);
    return {
      // Paint on open, then let load() re-render once KaTeX can typeset.
      set(latex, display) {
        input.value = latex;
        form.elements.display.value = display ? "block" : "inline";
        renderTabs();
        renderPalette();
        renderPreview();
        load2();
      },
      get: () => ({ latex: input.value.trim(), display: displayMode() })
    };
  }

  // km/src/js/content/mermaid_loader.js
  var pending = null;
  var zenumlPending = null;
  function loadMermaid() {
    if (!pending) pending = import(pkgURL("mermaid", "/+esm")).then((mod) => mod.default ?? mod);
    return pending;
  }
  var NEEDS_ZENUML = /^\s*(?:---[\s\S]*?---\s*)?zenuml\b/;
  function ensureDiagramSupport(mermaid2, source = "") {
    if (!NEEDS_ZENUML.test(String(source))) return Promise.resolve(mermaid2);
    if (!zenumlPending) zenumlPending = import(pkgURL("@mermaid-js/mermaid-zenuml", "/+esm")).then((mod) => mermaid2.registerExternalDiagrams([mod.default ?? mod])).catch(() => {
    });
    return zenumlPending.then(() => mermaid2);
  }

  // km-editor/src/js/mermaid_samples.js
  var MERMAID_TEMPLATES = [
    {
      name: "Flowchart",
      type: "flowchart",
      variants: [
        {
          name: "Basic",
          source: "flowchart TD\n  A[Start] --> B{Choice}\n  B -->|yes| C[Do the thing]\n  B -->|no| D[Stop]"
        },
        {
          name: "Retry loop",
          source: "flowchart TD\n  Draft([Write draft]) --> Review[Ask for review]\n  Review --> Ok{Approved?}\n  Ok -->|No| Draft\n  Ok -->|Yes| Publish[Publish page]\n  Publish --> Done([Announce])"
        },
        {
          name: "Subgraphs",
          source: "flowchart LR\n  subgraph write[Writing]\n    Draft[Draft] --> Edit[Edit]\n  end\n\n  subgraph check[Checks]\n    Links[Check links] --> Issues{Issues clear?}\n  end\n\n  Edit --> Links\n  Issues -->|Yes| Publish[Publish]\n  Issues -->|No| Edit"
        }
      ]
    },
    {
      name: "Sequence",
      type: "sequenceDiagram",
      variants: [
        {
          name: "Basic",
          source: "sequenceDiagram\n  participant Reader\n  participant KM\n  Reader->>KM: Open page\n  KM-->>Reader: Rendered markdown"
        },
        {
          name: "Branching",
          source: "sequenceDiagram\n  autonumber\n  actor Reader\n  participant Shell\n  participant Store as Bundle\n\n  Reader->>Shell: Request page\n  activate Shell\n  Shell->>Store: Look up id\n  alt Page exists\n    Store-->>Shell: Markdown\n    Shell-->>Reader: Rendered page\n  else Missing id\n    Store-->>Shell: Nothing\n    Shell-->>Reader: Not found notice\n  end\n  deactivate Shell"
        },
        {
          name: "Parallel work",
          source: "sequenceDiagram\n  participant Editor\n  participant Validator\n  participant Preview\n\n  Editor->>Validator: Content changed\n  par Check issues\n    Validator-->>Editor: Problem list\n  and Redraw\n    Editor->>Preview: Refresh\n  end\n  loop While typing\n    Editor->>Preview: Debounced update\n  end"
        }
      ]
    },
    {
      name: "Class",
      type: "classDiagram",
      variants: [
        {
          name: "Basic",
          source: "classDiagram\n  class Page {\n    +String id\n    +String title\n    +render()\n  }\n  Page <|-- Folder\n  Page <|-- Glossary"
        },
        {
          name: "Relationships",
          source: 'classDiagram\n  direction LR\n  class Bundle {\n    +List~Page~ pages\n    +serialize() string\n  }\n  class Page {\n    +String id\n    +String title\n  }\n  class Tag {\n    +String name\n  }\n  class Renderer {\n    <<interface>>\n    +render(Page page) string\n  }\n  class MarkdownRenderer {\n    +render(Page page) string\n  }\n\n  Bundle "1" *-- "1..*" Page : contains\n  Page "0..*" --> "0..*" Tag : carries\n  Renderer <|.. MarkdownRenderer\n  Bundle --> Renderer : rendered by'
        }
      ]
    },
    {
      name: "State",
      type: "stateDiagram-v2",
      variants: [
        {
          name: "Basic",
          source: "stateDiagram-v2\n  [*] --> Draft\n  Draft --> Review: submit\n  Review --> Published: approve\n  Review --> Draft: changes\n  Published --> [*]"
        },
        {
          name: "Composite",
          source: "stateDiagram-v2\n  direction LR\n  [*] --> Draft\n  Draft --> Editing : open in editor\n\n  state Editing {\n    [*] --> Typing\n    Typing --> Validating : pause\n    Validating --> Typing : issues found\n    Validating --> [*] : clean\n  }\n\n  Editing --> Published : export\n  Published --> [*]\n\n  note right of Editing\n    Undo history keeps\n    100 states in memory\n  end note"
        },
        {
          name: "Choice",
          source: "stateDiagram-v2\n  state has_issues <<choice>>\n  [*] --> Validated\n  Validated --> has_issues\n  has_issues --> Blocked : errors remain\n  has_issues --> Ready : only warnings\n  Ready --> [*]\n  Blocked --> Validated : fix and recheck"
        }
      ]
    },
    {
      name: "Entity relationship",
      type: "erDiagram",
      variants: [
        {
          name: "Basic",
          source: "erDiagram\n  PAGE ||--o{ TAG : carries\n  PAGE {\n    string id\n    string title\n  }\n  TAG {\n    string name\n  }"
        },
        {
          name: "Keys and comments",
          source: 'erDiagram\n  BUNDLE ||--|{ PAGE : contains\n  PAGE ||--o{ PAGE_TAG : has\n  TAG ||--o{ PAGE_TAG : "applied through"\n  PAGE ||--o{ TRAIL_STEP : "appears in"\n\n  BUNDLE {\n    string id PK\n    string title\n  }\n  PAGE {\n    string id PK\n    string bundleId FK\n    string title "Shown in Explorer"\n    date updated\n  }\n  TAG {\n    string name PK\n  }\n  TRAIL_STEP {\n    string trail PK\n    int position\n    string pageId FK\n  }'
        }
      ]
    },
    {
      name: "User journey",
      type: "journey",
      variants: [
        {
          name: "Basic",
          source: "journey\n  title Reading a page\n  section Arrive\n    Open link: 5: Reader\n    Skim headings: 3: Reader\n  section Read\n    Follow trail: 4: Reader"
        },
        {
          name: "Several actors",
          source: "journey\n  title Publishing a bundle\n  section Write\n    Draft page: 4: Author\n    Add diagrams: 3: Author\n  section Check\n    Fix issues: 2: Author, Editor\n    Approve: 5: Editor\n  section Ship\n    Export bundle: 5: Author\n    Read it: 7: Reader"
        }
      ]
    },
    {
      name: "Gantt",
      type: "gantt",
      variants: [
        {
          name: "Basic",
          source: "gantt\n  title Release plan\n  dateFormat YYYY-MM-DD\n  section Writing\n  Draft :a1, 2026-08-01, 7d\n  Review :after a1, 3d"
        },
        {
          name: "Dependencies",
          source: "gantt\n  title Manual rewrite\n  dateFormat YYYY-MM-DD\n  excludes weekends\n\n  section Research\n    Read old manual :done, read, 2026-08-03, 4d\n    Collect feedback :done, feedback, 2026-08-05, 3d\n\n  section Writing\n    New outline :active, outline, after feedback, 5d\n    First draft :draft, after outline, 10d\n    Diagrams :crit, art, after outline, 6d\n\n  section Release\n    Review pass :review, after draft art, 4d\n    Publish :milestone, after review, 0d"
        }
      ]
    },
    {
      name: "Pie",
      type: "pie",
      variants: [
        {
          name: "Basic",
          source: 'pie title Page kinds\n  "Articles" : 42\n  "Folders" : 9\n  "Glossary" : 3'
        },
        {
          name: "With values",
          source: 'pie showData title Where editing time goes (minutes)\n  "Writing" : 180\n  "Diagrams" : 75\n  "Fixing links" : 40\n  "Previewing" : 25'
        }
      ]
    },
    {
      name: "Quadrant",
      type: "quadrantChart",
      variants: [
        {
          name: "Basic",
          source: "quadrantChart\n  title Effort and value\n  x-axis Low effort --> High effort\n  y-axis Low value --> High value\n  Rewrite intro: [0.3, 0.8]\n  Fix typos: [0.2, 0.3]\n  New diagrams: [0.7, 0.7]"
        },
        {
          name: "Labelled quadrants",
          source: "quadrantChart\n  title Page backlog\n  x-axis Not urgent --> Urgent\n  y-axis Low impact --> High impact\n  quadrant-1 Do first\n  quadrant-2 Schedule\n  quadrant-3 Drop\n  quadrant-4 Delegate\n  Broken links: [0.85, 0.9]\n  Manual rewrite: [0.3, 0.8]\n  Tag cleanup: [0.25, 0.2]\n  Screenshot refresh: [0.7, 0.3]"
        }
      ]
    },
    {
      name: "Requirement",
      type: "requirementDiagram",
      variants: [
        {
          name: "Basic",
          source: "requirementDiagram\n\n  requirement search {\n    id: 1\n    text: Pages must be findable\n    risk: medium\n    verifymethod: test\n  }\n\n  element index {\n    type: index\n  }\n\n  index - satisfies -> search"
        },
        {
          name: "Full tree",
          source: 'requirementDiagram\n\n  requirement readable {\n    id: 1\n    text: A published bundle must be readable offline.\n    risk: high\n    verifymethod: test\n  }\n\n  functionalRequirement offline_assets {\n    id: 1.1\n    text: Every asset ships with the bundle.\n    risk: medium\n    verifymethod: inspection\n  }\n\n  performanceRequirement first_paint {\n    id: 1.2\n    text: First page paints within one second.\n    risk: low\n    verifymethod: demonstration\n  }\n\n  element collector {\n    type: tool\n    docRef: "editor/collect-assets"\n  }\n\n  readable - contains -> offline_assets\n  readable - contains -> first_paint\n  collector - satisfies -> offline_assets'
        }
      ]
    },
    {
      name: "Git",
      type: "gitGraph",
      variants: [
        {
          name: "Basic",
          source: 'gitGraph\n  commit id: "draft"\n  branch review\n  commit id: "edits"\n  checkout main\n  merge review\n  commit id: "publish"'
        },
        {
          name: "Release and hotfix",
          source: 'gitGraph\n  commit id: "first bundle"\n  branch develop\n  commit id: "add glossary"\n  commit id: "add diagrams"\n  checkout main\n  merge develop tag: "v1.0.0"\n  branch hotfix\n  commit id: "fix broken link"\n  checkout main\n  merge hotfix tag: "v1.0.1"\n  checkout develop\n  commit id: "new trail"\n  checkout main\n  merge develop tag: "v1.1.0"'
        },
        {
          name: "Marked commits",
          source: 'gitGraph TB:\n  commit id: "groundwork"\n  commit id: "schema change" type: HIGHLIGHT\n  commit id: "undo experiment" type: REVERSE\n  commit id: "stabilise" tag: "v2.0.0-rc1"'
        }
      ]
    },
    {
      name: "C4",
      type: "C4Context",
      variants: [
        {
          name: "Context",
          source: 'C4Context\n  title Reader and KM\n  Person(reader, "Reader", "Reads the wiki")\n  System(km, "KM", "Static wiki")\n  System_Ext(host, "Static host", "Serves the files")\n  Rel(reader, km, "Opens pages")\n  Rel(km, host, "Fetches markdown", "HTTPS")'
        },
        {
          name: "Containers",
          source: 'C4Container\n  title Inside a KM site\n\n  Person(reader, "Reader", "Reads pages")\n\n  Container_Boundary(site, "KM site") {\n    Container(shell, "Shell", "HTML, JS", "Routes and renders pages")\n    Container(renderer, "Renderer", "JS", "Markdown to HTML")\n    ContainerDb(bundle, "Bundle", "Markdown file", "Every page in one file")\n  }\n\n  Rel(reader, shell, "Opens", "HTTPS")\n  Rel(shell, renderer, "Asks to render")\n  Rel(renderer, bundle, "Reads")'
        }
      ]
    },
    {
      name: "Mindmap",
      type: "mindmap",
      variants: [
        {
          name: "Basic",
          source: "mindmap\n  root((KM))\n    Pages\n      Tags\n      Trails\n    Rendering\n      Markdown\n      Diagrams"
        },
        {
          name: "Shapes and icons",
          source: "mindmap\n  root((Bundle))\n    Content\n      ::icon(fa fa-file-lines)\n      Pages\n      Glossary\n    Media\n      Images\n      Video and audio\n    Checks\n      reminder{{Run the Issues panel}}\n      Broken links\n      Missing media"
        }
      ]
    },
    {
      name: "Timeline",
      type: "timeline",
      variants: [
        {
          name: "Basic",
          source: "timeline\n  title Bundle history\n  2026-07 : First draft\n  2026-08 : Review : Published"
        },
        {
          name: "Sections",
          source: "timeline\n  title Documentation year\n  section First half\n    January : Outline agreed\n    March : Manual rewritten : Diagrams added\n  section Second half\n    August : Media support\n    November : Translation pass"
        }
      ]
    },
    {
      name: "Sankey",
      type: "sankey-beta",
      variants: [
        {
          name: "Basic",
          source: "sankey-beta\n\nSearch,Article,40\nSearch,Glossary,10\nArticle,Trail,25"
        },
        {
          name: "Funnel",
          source: "sankey-beta\n\nVisits,Home page,320\nHome page,Search,140\nHome page,Trail start,90\nHome page,Left,90\nSearch,Article,110\nSearch,Left,30\nTrail start,Article,70\nTrail start,Left,20\nArticle,Glossary,45\nArticle,Left,135"
        }
      ]
    },
    {
      name: "XY chart",
      type: "xychart-beta",
      variants: [
        {
          name: "Bar and line",
          source: 'xychart-beta\n  title "Pages per month"\n  x-axis [jan, feb, mar, apr]\n  y-axis "Pages" 0 --> 60\n  bar [12, 24, 38, 55]\n  line [12, 24, 38, 55]'
        },
        {
          name: "Two lines",
          source: 'xychart-beta\n  title "Pages added and archived"\n  x-axis [Q1, Q2, Q3, Q4]\n  y-axis "Pages" 0 --> 80\n  line [20, 45, 62, 78]\n  line [4, 9, 12, 18]'
        }
      ]
    },
    {
      name: "Block",
      type: "block-beta",
      variants: [
        {
          name: "Three tiers",
          source: 'block-beta\n  columns 3\n  reader(("Reader")):3\n  space:3\n  shell["Shell"] render["Renderer"] store[("Bundle")]\n\n  reader --> shell\n  shell --> render\n  render --> store'
        },
        {
          name: "Nested blocks",
          source: 'block-beta\ncolumns 1\n  input(("Markdown"))\n  arrow<["&nbsp;&nbsp;&nbsp;"]>(down)\n  block:pipeline\n    parse["Parse"]\n    enhance["Enhance"]\n    paint["Paint"]\n  end\n  space\n  page["Page"]\n  pipeline --> page'
        }
      ]
    },
    {
      name: "Packet",
      type: "packet",
      variants: [
        {
          name: "Header",
          source: 'packet\n  title Page record\n  0-15: "Page id"\n  16-31: "Flags"\n  32-63: "Updated"\n  64-127: "Title"'
        },
        {
          name: "Relative widths",
          source: 'packet\n  title Asset record\n  +16: "Kind"\n  +16: "Name length"\n  +32: "Byte length"\n  64-127: "Name (variable length)"'
        }
      ]
    },
    {
      name: "Kanban",
      type: "kanban",
      variants: [
        {
          name: "Basic",
          source: "kanban\n  Todo\n    [Write intro]\n  Doing\n    [Review diagrams]\n  Done\n    [Ship bundle]"
        },
        {
          name: "With metadata",
          source: "kanban\n  todo[Todo]\n    links[Fix broken links]@{ priority: 'High' }\n    trail[Plan a reading trail]\n  doing[In progress]\n    manual[Rewrite the manual]@{ assigned: 'erwan', priority: 'Very High' }\n  done[Done]\n    media[Add media support]@{ assigned: 'erwan' }"
        }
      ]
    },
    {
      name: "Architecture",
      type: "architecture-beta",
      variants: [
        {
          name: "Basic",
          source: "architecture-beta\n  group site(cloud)[Static site]\n  service pages(server)[Pages] in site\n  service assets(disk)[Assets] in site\n  pages:R -- L:assets"
        },
        {
          name: "Two groups",
          source: "architecture-beta\n  group edge(cloud)[Edge]\n  group origin(cloud)[Origin]\n\n  service browser(internet)[Browser] in edge\n  service cdn(server)[CDN] in edge\n  service host(server)[Static host] in origin\n  service bundle(disk)[Bundle] in origin\n\n  browser:R --> L:cdn\n  cdn:R --> L:host\n  host:B --> T:bundle"
        },
        {
          name: "Junction",
          source: "architecture-beta\n  service reader(internet)[Reader]\n  service balancer(server)[Balancer]\n  service one(server)[Mirror one]\n  service two(server)[Mirror two]\n  junction fanout\n\n  reader:R -- L:balancer\n  balancer:R -- L:fanout\n  one:B -- T:fanout\n  two:T -- B:fanout"
        }
      ]
    },
    {
      name: "Radar",
      type: "radar-beta",
      variants: [
        {
          name: "Basic",
          source: 'radar-beta\n  title Page quality\n  axis clarity["Clarity"], depth["Depth"], links["Links"], media["Media"]\n  curve now["Now"]{3, 4, 2, 5}'
        },
        {
          name: "Compared",
          source: 'radar-beta\n  title Before and after the rewrite\n  axis clarity["Clarity"], depth["Depth"], links["Links"]\n  axis media["Media"], search["Findability"]\n\n  curve before["Before"]{2, 3, 2, 1, 2}\n  curve after["After"]{4, 4, 5, 4, 5}\n\n  graticule polygon\n  max 5\n  min 0'
        }
      ]
    },
    {
      name: "Treemap",
      type: "treemap-beta",
      variants: [
        {
          name: "Basic",
          source: 'treemap-beta\n"Bundle"\n  "Articles": 42\n  "Folders": 9\n  "Glossary": 3'
        },
        {
          name: "Nested",
          source: 'treemap-beta\n"Bundle size"\n    "Text"\n        "Pages": 180\n        "Glossary": 40\n    "Media"\n        "Images": 320\n        "Video": 240\n        "Audio": 60\n    "Config": 12'
        }
      ]
    },
    {
      name: "Venn",
      type: "venn-beta",
      variants: [
        {
          name: "Basic",
          source: 'venn-beta\n  title "Page kinds"\n  set Tagged\n  set Trailed\n  union Tagged,Trailed["Both"]'
        },
        {
          name: "Sized and styled",
          source: 'venn-beta\n  title "Where our pages overlap"\n  set REF["Reference"]:20\n    text r1["API notes"]\n  set HOW["How-to"]:16\n    text h1["Quick start"]\n  union REF,HOW["Both"]:6\n    text b1["Cheatsheet"]\n  style REF fill:skyblue\n  style HOW fill:lightgreen'
        }
      ]
    },
    {
      name: "Ishikawa",
      type: "ishikawa-beta",
      variants: [
        {
          name: "Basic",
          source: "ishikawa-beta\n  Page went stale\n    People\n      No owner\n    Process\n      No review date"
        },
        {
          name: "Full fishbone",
          source: "ishikawa-beta\n  Readers cannot find pages\n    People\n      Nobody tags new pages\n      Trail owner left\n    Process\n      No review after publishing\n      Titles written last\n    Tooling\n      SEARCH\n        Titles only\n        No synonyms\n      NAVIGATION\n        Deep nesting\n    Content\n      Duplicate glossary terms\n      Empty landing pages"
        }
      ]
    },
    {
      name: "Wardley",
      type: "wardley-beta",
      variants: [
        {
          name: "Basic",
          source: "wardley-beta\n  title Publishing chain\n  anchor Reader [0.9, 0.7]\n  component Page [0.75, 0.6]\n  component Bundle [0.6, 0.4]\n  Reader -> Page\n  Page -> Bundle"
        },
        {
          name: "Evolution and notes",
          source: 'wardley-beta\ntitle Wiki value chain\nsize [1100, 800]\n\nanchor Reader [0.95, 0.70]\ncomponent Page [0.80, 0.62]\ncomponent Markdown [0.66, 0.72]\ncomponent Renderer [0.52, 0.55]\ncomponent Static host [0.30, 0.85]\n\nReader -> Page\nPage -> Markdown\nPage -> Renderer\nRenderer -> Static host\n\nevolve Renderer 0.72\n\nnote "Hosting is a commodity" [0.28, 0.80]'
        },
        {
          name: "Pipeline",
          source: "wardley-beta\ntitle Renderer pipeline\nsize [1100, 800]\n\ncomponent Renderer [0.57, 0.45]\ncomponent Static host [0.10, 0.70]\n\nRenderer -> Static host\n\npipeline Renderer {\n  component Server rendered [0.35]\n  component Browser rendered [0.60]\n  component Prebuilt [0.80]\n}"
        }
      ]
    },
    {
      name: "Cynefin",
      type: "cynefin-beta",
      variants: [
        {
          name: "Basic",
          source: 'cynefin-beta\n  clear "Fix a typo"\n  complicated "Restructure trails"\n  complex "Rewrite the manual"\n  chaotic "Recover a lost bundle"'
        },
        {
          name: "With transitions",
          source: 'cynefin-beta\n  title Editing decisions\n\n  clear\n    "Fix a typo"\n    "Rename a page"\n\n  complicated\n    "Restructure trails"\n    "Split a long page"\n\n  complex\n    "Rewrite the manual"\n\n  chaotic\n    "Recover a lost bundle"\n\n  confusion\n    "Unclear scope"\n\n  complex --> complicated : "Shape emerges"\n  complicated --> clear : "Playbook written"'
        }
      ]
    },
    {
      name: "Event modeling",
      type: "eventmodeling",
      variants: [
        {
          name: "Basic",
          source: "eventmodeling\n\ntf 01 ui SearchUI\ntf 02 cmd OpenPage\ntf 03 evt PageOpened\ntf 04 rmo ReadingTrail ->> 03"
        },
        {
          name: "Cross system",
          source: "eventmodeling\n\ntf 01 ui EditorUI\ntf 02 cmd SavePage [[SavePage01]]\ntf 03 evt PageSaved [[PageSaved]]\n\nrf 04 evt Host.BundleUploaded\ntf 05 pcr PublishProcessor\ntf 06 cmd RefreshIndex\ntf 07 evt Site.IndexRefreshed\n\ndata SavePage01 {\n  id: 'home'\n  title: 'Home'\n}\n\ndata PageSaved {\n  id: string\n  updated: date\n}"
        }
      ]
    },
    {
      name: "Tree view",
      type: "treeView-beta",
      variants: [
        {
          name: "Files",
          source: "treeView-beta\n    km-bundle/\n        pages/\n            home.md\n            glossary.md\n        assets/\n            example-image.png\n        content.md"
        },
        {
          name: "Quoted names",
          source: 'treeView-beta\n    "Team bundle"\n        "Reference pages"\n            "Query syntax.md"\n            "Page headers.md"\n        "Media"\n            "intro clip.webm"\n        "Notes"'
        }
      ]
    },
    // Railroad ships four grammar dialects, each its own diagram type.
    {
      name: "Railroad (ABNF)",
      type: "railroad-abnf-beta",
      variants: [
        {
          name: "Page route",
          source: 'railroad-abnf-beta\n    title Page route\n\n    route = "#" page-id *( "#" page-id ) ;\n    page-id = 1*( ALPHA / DIGIT / "_" ) ;'
        }
      ]
    },
    {
      name: "Railroad (EBNF)",
      type: "railroad-ebnf-beta",
      variants: [
        {
          name: "Query option",
          source: 'railroad-ebnf-beta\n    title Query option\n\n    query = "{{pages" option* "}}" ;\n    option = name "=" value ;\n    name = letter+ ;\n    letter = "a" | "b" | "c" ;'
        }
      ]
    },
    {
      name: "Railroad (IR)",
      type: "railroad-beta",
      variants: [
        {
          name: "Page route",
          source: 'railroad-beta\n    title Page route\n\n    route = sequence(terminal("#"), nonterminal("id"), zeroOrMore(sequence(terminal("#"), nonterminal("id")))) ;\n    id = oneOrMore(nonterminal("letter")) ;\n    letter = choice(terminal("a"), terminal("b")) ;'
        }
      ]
    },
    {
      name: "Railroad (PEG)",
      type: "railroad-peg-beta",
      variants: [
        {
          name: "Tag filter",
          source: 'railroad-peg-beta\n    title Tag filter\n\n    Filter <- Tag ("," Tag)* ;\n    Tag <- Letter+ ;\n    Letter <- "a" / "b" / "c" ;'
        }
      ]
    },
    {
      name: "ZenUML",
      type: "zenuml",
      variants: [
        {
          name: "Basic",
          source: "zenuml\n  title Page request\n  @Actor Reader\n  @Boundary Shell\n  Reader->Shell.openPage(id) {\n    Renderer.render(page)\n  }"
        },
        {
          name: "Grouped services",
          source: "zenuml\n  title Publishing\n  @Actor Author\n  @Boundary Editor\n  group Backend {\n    @Lambda Validator\n    @EC2 Publisher\n  }\n\n  @Starter(Author)\n  Editor.save(bundle) {\n    Validator.check(bundle) {\n      if (clean) {\n        Publisher.publish(bundle)\n      }\n    }\n  }"
        }
      ]
    }
  ];
  var MERMAID_SNIPPETS = {
    flowchart: [
      ["Node", "  N[Label]"],
      ["Rounded", "  N(Label)"],
      ["Decision", "  N{Label}"],
      ["Database", "  N[(Store)]"],
      ["Arrow", "  A --> B"],
      ["Labelled", "  A -->|text| B"],
      ["Dotted", "  A -.-> B"],
      ["Thick", "  A ==> B"],
      ["Subgraph", "  subgraph Group\n    A --> B\n  end"],
      ["Class", "  class A highlight"]
    ],
    sequenceDiagram: [
      ["Participant", "  participant Name"],
      ["Actor", "  actor Name"],
      ["Message", "  A->>B: text"],
      ["Reply", "  B-->>A: text"],
      ["Activate", "  activate B"],
      ["Note", "  note over A,B: text"],
      ["Loop", "  loop every day\n    A->>B: ping\n  end"],
      ["Alt", "  alt success\n    A->>B: ok\n  else failure\n    A->>B: retry\n  end"]
    ],
    "stateDiagram-v2": [
      ["State", "  Name"],
      ["Transition", "  A --> B: event"],
      ["Start", "  [*] --> A"],
      ["End", "  A --> [*]"],
      ["Composite", "  state Parent {\n    [*] --> Child\n  }"],
      ["Note", "  note right of A: text"]
    ],
    classDiagram: [
      ["Class", "  class Name {\n    +String field\n    +method()\n  }"],
      ["Inheritance", "  Base <|-- Derived"],
      ["Composition", "  Whole *-- Part"],
      ["Aggregation", "  Whole o-- Part"],
      ["Association", "  A --> B : label"]
    ],
    erDiagram: [
      ["Entity", "  NAME {\n    string id\n  }"],
      ["One to many", "  A ||--o{ B : has"],
      ["One to one", "  A ||--|| B : has"],
      ["Many to many", "  A }o--o{ B : has"]
    ],
    gantt: [
      ["Section", "  section Name"],
      ["Task", "  Task name :a1, 2026-08-01, 5d"],
      ["After", "  Task name :after a1, 3d"],
      ["Milestone", "  Ship :milestone, 2026-08-15, 0d"]
    ],
    pie: [["Slice", '  "Label" : 10']],
    mindmap: [["Branch", "    Branch"], ["Leaf", "      Leaf"]],
    timeline: [["Event", "  2026-08 : Something happened"], ["Section", "  section Name"]],
    journey: [
      ["Section", "  section Name"],
      ["Step", "    Do a thing: 4: Actor"]
    ],
    gitGraph: [
      ["Commit", '  commit id: "name"'],
      ["Branch", "  branch name"],
      ["Checkout", "  checkout main"],
      ["Merge", "  merge name"],
      ["Tag", '  commit tag: "v1"']
    ],
    kanban: [["Column", "  Column name"], ["Card", "    [Card text]"]],
    "sankey-beta": [["Flow", "Source,Target,10"]],
    quadrantChart: [
      ["Point", "  Label: [0.5, 0.5]"],
      ["X axis", "  x-axis Low --> High"],
      ["Y axis", "  y-axis Low --> High"],
      ["Quadrant", "  quadrant-1 Name"]
    ],
    "block-beta": [
      ["Block", '  name["Label"]'],
      ["Round", '  name(("Label"))'],
      ["Store", '  name[("Label")]'],
      ["Space", "  space"],
      ["Arrow", "  a --> b"]
    ],
    "xychart-beta": [
      ["Bar", "  bar [1, 2, 3]"],
      ["Line", "  line [1, 2, 3]"],
      ["X axis", "  x-axis [a, b, c]"],
      ["Y axis", '  y-axis "Value" 0 --> 10']
    ],
    "architecture-beta": [
      ["Group", "  group groupId(cloud)[Label]"],
      ["Service", "  service serviceId(server)[Label] in groupId"],
      ["Junction", "  junction pointId"],
      ["Edge", "  a:R -- L:b"]
    ],
    requirementDiagram: [
      ["Requirement", "  requirement name {\n    id: 1\n    text: what it must do\n    risk: low\n    verifymethod: test\n  }"],
      ["Element", "  element elementId {\n    type: doc\n  }"],
      ["Satisfies", "  elementId - satisfies -> requirementId"]
    ],
    C4Context: [
      ["Person", '  Person(id, "Name", "Role")'],
      ["System", '  System(id, "Name", "What it does")'],
      ["Relation", '  Rel(from, to, "Label")']
    ],
    "radar-beta": [
      ["Axes", '  axis a["A"], b["B"], c["C"]'],
      ["Curve", '  curve name["Name"]{1, 2, 3}']
    ],
    "treemap-beta": [["Leaf", '  "Label": 10'], ["Branch", '"Label"']],
    "venn-beta": [
      ["Set", '  set name ["Label"]'],
      ["Union", '  union a,b["Label"]']
    ],
    "ishikawa-beta": [["Category", "    Category"], ["Cause", "      Cause"]],
    "wardley-beta": [
      ["Anchor", "  anchor Name [0.9, 0.7]"],
      ["Component", "  component Name [0.6, 0.4]"],
      ["Link", "  A -> B"],
      ["Evolve", "  evolve Name 0.8"]
    ],
    "cynefin-beta": [
      ["Clear", '  clear "Item"'],
      ["Complicated", '  complicated "Item"'],
      ["Complex", '  complex "Item"'],
      ["Chaotic", '  chaotic "Item"']
    ],
    packet: [["Field", '  0-7: "Name"'], ["Relative", '  +16: "Name"']],
    eventmodeling: [
      ["Screen", "tf 01 ui ScreenName"],
      ["Command", "tf 02 cmd CommandName"],
      ["Event", "tf 03 evt EventName"],
      ["Read model", "tf 04 rmo ViewName ->> 03"]
    ],
    "treeView-beta": [["Folder", "    folder/"], ["File", "        file.md"]],
    "railroad-abnf-beta": [["Rule", '    name = "a" ;']],
    "railroad-ebnf-beta": [["Rule", '    name = "a" | "b" ;']],
    "railroad-beta": [["Rule", '    name = choice(terminal("a"), terminal("b")) ;']],
    "railroad-peg-beta": [["Rule", '    Name <- "a" / "b" ;']],
    zenuml: [
      ["Actor", "  @Actor Name"],
      ["Call", "  A.method(arg) {\n  }"],
      ["Group", "  group Name {\n    @Lambda Service\n  }"]
    ]
  };

  // km-editor/src/js/mermaid.js
  var MERMAID_BLOCK = /```(?:mermaid|Mermaid)[ \t]*\n([\s\S]*?)\n```[ \t]*(?=\n|$)/g;
  function findMermaidBlocks(source) {
    const text = String(source ?? "");
    MERMAID_BLOCK.lastIndex = 0;
    return [...text.matchAll(MERMAID_BLOCK)].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
      diagram: match[1],
      line: text.slice(0, match.index).split("\n").length - 1
    }));
  }
  function mermaidAtCursor(source, cursor = 0) {
    const text = String(source ?? "");
    const at = Math.max(0, Math.min(text.length, Number(cursor) || 0));
    return findMermaidBlocks(text).find((block) => at >= block.start && at <= block.end) ?? null;
  }
  function wrapMermaid(diagram) {
    return `\`\`\`mermaid
${String(diagram ?? "").trim()}
\`\`\``;
  }
  function diagramType(source) {
    const first = String(source ?? "").split("\n").map((line) => line.trim()).find((line) => line && !line.startsWith("%%")) ?? "";
    return first.split(/[\s;{(]/)[0] ?? "";
  }
  function diagramMessage(error) {
    const text = String(error?.message || error || "Diagram could not be parsed.");
    return text.split("\n").map((line) => line.trim()).find(Boolean) ?? text;
  }
  function findDiagramProblems(pages, errorFor) {
    const problems = [];
    for (const page of pages) {
      for (const block of findMermaidBlocks(page.content)) {
        const failure = errorFor(block.diagram);
        if (!failure) continue;
        problems.push({
          level: "warning",
          code: "invalid-diagram",
          pageUid: page.uid,
          // Mermaid counts from the first diagram line, which follows the fence.
          line: block.line + Math.max(1, Number(failure.line) || 1),
          start: block.start,
          end: block.end,
          text: `${page.title || page.id || "(untitled page)"} has a diagram that will not render: ${failure.message}`
        });
      }
    }
    return problems;
  }
  var mermaidConfig = (theme) => ({
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    theme
  });
  var mermaid = null;
  var appliedTheme = "";
  async function ensureMermaid(theme = "default", source = "") {
    if (!mermaid) mermaid = await loadMermaid();
    if (theme !== appliedTheme) {
      appliedTheme = theme;
      mermaid.initialize(mermaidConfig(theme));
    }
    return ensureDiagramSupport(mermaid, source);
  }
  function diagramErrorLine(error) {
    if (Number.isInteger(error?.hash?.line)) return error.hash.line + 1;
    return Number(error?.hash?.loc?.first_line) || 1;
  }
  async function parseDiagram(diagram, theme) {
    try {
      await (await ensureMermaid(theme, diagram)).parse(diagram);
      return null;
    } catch (error) {
      return { message: diagramMessage(error), line: diagramErrorLine(error) };
    }
  }
  var renderSeq = 0;
  function initMermaidPanel({ form, templates, snippets, input, preview, status, themeOf }) {
    let renderTimer = 0;
    function renderTemplates() {
      templates.replaceChildren(...MERMAID_TEMPLATES.map((template) => {
        const group = document.createElement("div");
        group.className = "mermaid-sample";
        const pick = document.createElement("button");
        pick.type = "button";
        pick.className = "mermaid-sample-name";
        pick.dataset.mermaidSample = template.name;
        pick.dataset.mermaidVariant = template.variants[0].name;
        pick.textContent = template.name;
        pick.title = `Replace the diagram with: ${template.variants[0].name}`;
        group.append(pick);
        if (template.variants.length > 1) {
          const more = document.createElement("button");
          more.type = "button";
          more.className = "mermaid-sample-more";
          more.dataset.mermaidMore = template.name;
          more.setAttribute("aria-label", `${template.name} variants`);
          more.setAttribute("aria-expanded", "false");
          more.textContent = "\u25BE";
          group.append(more);
        }
        return group;
      }));
    }
    function closeVariantMenu() {
      templates.querySelector(".mermaid-variants")?.remove();
      for (const button of templates.querySelectorAll("[data-mermaid-more]"))
        button.setAttribute("aria-expanded", "false");
    }
    function openVariantMenu(button) {
      const template = MERMAID_TEMPLATES.find((item) => item.name === button.dataset.mermaidMore);
      const open = button.getAttribute("aria-expanded") === "true";
      closeVariantMenu();
      if (open) return;
      button.setAttribute("aria-expanded", "true");
      const menu = document.createElement("div");
      menu.className = "mermaid-variants";
      menu.append(...template.variants.map((variant) => {
        const choice = document.createElement("button");
        choice.type = "button";
        choice.dataset.mermaidSample = template.name;
        choice.dataset.mermaidVariant = variant.name;
        choice.textContent = variant.name;
        return choice;
      }));
      button.parentElement.append(menu);
    }
    function useSample(name, variantName) {
      const template = MERMAID_TEMPLATES.find((item) => item.name === name);
      const variant = template?.variants.find((item) => item.name === variantName);
      if (!variant) return;
      closeVariantMenu();
      input.value = variant.source;
      input.focus();
      renderSnippets();
      drawPreview();
    }
    let snippetType = null;
    function renderSnippets() {
      const type = diagramType(input.value);
      if (type === snippetType) return;
      snippetType = type;
      const items = MERMAID_SNIPPETS[type] ?? [];
      snippets.replaceChildren(...items.map(([label, text]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.mermaidSnippet = text;
        button.textContent = label;
        button.title = text;
        return button;
      }));
      (snippets.closest(".mermaid-parts") ?? snippets).hidden = !items.length;
    }
    async function drawPreview() {
      const diagram = input.value.trim();
      if (!diagram) {
        preview.replaceChildren();
        status.hidden = true;
        return;
      }
      const token = ++renderSeq;
      try {
        const engine = await ensureMermaid(themeOf(), diagram);
        if (token !== renderSeq) return;
        const { svg } = await engine.render(`km-editor-diagram-${token}`, diagram);
        if (token !== renderSeq) return;
        preview.innerHTML = svg;
        status.hidden = true;
        status.textContent = "";
      } catch (error) {
        if (token !== renderSeq) return;
        status.hidden = false;
        status.textContent = diagramMessage(error);
      }
    }
    function schedulePreview() {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(drawPreview, 250);
    }
    function insertSnippet2(text) {
      const start = input.selectionStart ?? input.value.length;
      const lineStart = input.value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
      const atLineStart = input.value.slice(lineStart, start).trim() === "";
      const block = `${atLineStart ? "" : "\n"}${text}
`;
      input.focus();
      if (!document.execCommand("insertText", false, block))
        input.setRangeText(block, start, input.selectionEnd ?? start, "end");
      renderSnippets();
      schedulePreview();
    }
    templates.addEventListener("click", (event) => {
      const more = event.target.closest("[data-mermaid-more]");
      if (more) {
        openVariantMenu(more);
        return;
      }
      const sample = event.target.closest("[data-mermaid-sample]");
      if (sample) useSample(sample.dataset.mermaidSample, sample.dataset.mermaidVariant);
      else closeVariantMenu();
    });
    document.addEventListener("pointerdown", (event) => {
      if (!event.composedPath().some((node) => node.classList?.contains("mermaid-sample"))) closeVariantMenu();
    });
    document.addEventListener("click", (event) => {
      if (event.detail === 0 && !event.composedPath().some((node) => node.classList?.contains("mermaid-sample"))) closeVariantMenu();
    });
    form.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && templates.querySelector(".mermaid-variants")) {
        event.stopPropagation();
        closeVariantMenu();
      }
    });
    snippets.addEventListener("click", (event) => {
      const button = event.target.closest("[data-mermaid-snippet]");
      if (button) insertSnippet2(button.dataset.mermaidSnippet);
    });
    input.addEventListener("input", () => {
      renderSnippets();
      schedulePreview();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      if (!event.shiftKey) document.execCommand("insertText", false, "  ");
    });
    renderTemplates();
    return {
      set(diagram) {
        input.value = diagram;
        renderSnippets();
        drawPreview();
      },
      get: () => input.value.trim(),
      refresh: drawPreview
    };
  }

  // km/src/js/content/directives.js
  var FENCE_RE2 = /^\s*(```|~~~)/;
  var TRANSCLUSION_RE = /!\[\[([^\]\n]+)\]\]/g;
  var QUERY_RE = /^\s*\{\{pages\b([^}]*)\}\}\s*$/;
  var clean2 = (value) => String(value ?? "").trim();
  var isSimpleFolder = (page) => !!(page?.isSimpleFolder || page?.kind === "simple" && !clean2(page.content));
  function parseQueryOptions(source = "") {
    const options = {};
    for (const match of source.matchAll(/(\w+)\s*=\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+))/g)) {
      const quoted = match[2] ?? match[3];
      const value = quoted == null ? match[4] ?? "" : quoted.replace(/\\(["'\\])/g, "$1");
      options[match[1].toLowerCase()] = value;
    }
    return options;
  }
  var QUERY_OPTION_ORDER = ["tag", "parent", "trail", "text", "current", "sort", "limit", "empty", "view"];
  var QUERY_OPTION_SET = new Set(QUERY_OPTION_ORDER);
  var QUERY_TOKEN_RE = /(\w+)\s*=\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+))/g;
  function serializePageQuery(options = {}) {
    const values = QUERY_OPTION_ORDER.flatMap((key) => {
      const value = clean2(options[key]);
      return value ? [`${key}=${JSON.stringify(value)}`] : [];
    });
    return `{{pages${values.length ? ` ${values.join(" ")}` : ""}}}`;
  }
  function pageQueryAtCursor(source, cursor = 0) {
    const text = String(source ?? "");
    const safeCursor = Math.max(0, Math.min(text.length, Number(cursor) || 0));
    const start = text.lastIndexOf("\n", Math.max(0, safeCursor - 1)) + 1;
    const nextBreak = text.indexOf("\n", safeCursor);
    const end = nextBreak < 0 ? text.length : nextBreak;
    const match = QUERY_RE.exec(text.slice(start, end));
    return match ? { start, end, options: parseQueryOptions(match[1]) } : null;
  }
  function queryOptionProblems(source) {
    const problems = [];
    const seen = /* @__PURE__ */ new Set();
    let cursor = 0;
    for (const match of source.matchAll(QUERY_TOKEN_RE)) {
      if (source.slice(cursor, match.index).trim()) problems.push("malformed syntax");
      cursor = match.index + match[0].length;
      const key = match[1].toLowerCase();
      if (!QUERY_OPTION_SET.has(key)) problems.push(`unknown option "${key}"`);
      if (seen.has(key)) problems.push(`duplicate option "${key}"`);
      seen.add(key);
      if (match[4]?.startsWith('"') || match[4]?.startsWith("'")) problems.push(`unclosed quote for "${key}"`);
    }
    if (source.slice(cursor).trim()) problems.push("malformed syntax");
    const options = parseQueryOptions(source);
    if (options.view && !["list", "cards", "table", "timeline", "graph"].includes(options.view))
      problems.push(`invalid view "${options.view}"`);
    if (options.sort && !["title", "updated"].includes(options.sort))
      problems.push(`invalid sort "${options.sort}"`);
    if (options.current && options.current !== "false")
      problems.push(`invalid current value "${options.current}"`);
    if (options.limit && !/^[1-9]\d*$/.test(options.limit))
      problems.push(`invalid limit "${options.limit}"`);
    return { options, problems: [...new Set(problems)] };
  }
  function headingKey(value) {
    return clean2(value).toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }
  function extractSectionMarkdown(content, selector) {
    const wanted = headingKey(selector);
    const lines = String(content ?? "").split(/\r?\n/);
    const counters = [0, 0, 0, 0, 0, 0];
    let inFence = false;
    let start = -1;
    let level = 0;
    let anchor = "";
    for (let index = 0; index < lines.length; index++) {
      if (FENCE_RE2.test(lines[index])) inFence = !inFence;
      if (inFence) continue;
      const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(lines[index]);
      if (!match) continue;
      const nextLevel = match[1].length;
      counters[nextLevel - 1]++;
      for (let i = nextLevel; i < counters.length; i++) counters[i] = 0;
      const nextAnchor = counters.slice(0, nextLevel).filter(Boolean).join("_");
      if (start >= 0 && nextLevel <= level)
        return { body: lines.slice(start + 1, index).join("\n").trim(), anchor, line: start };
      if (nextAnchor === selector || headingKey(match[2]) === wanted) {
        start = index;
        level = nextLevel;
        anchor = nextAnchor;
      }
    }
    return start >= 0 ? { body: lines.slice(start + 1).join("\n").trim(), anchor, line: start } : null;
  }
  function isInsideInlineCode2(source, index) {
    let delimiters = 0;
    for (const ticks of source.slice(0, index).matchAll(/`+/g))
      if (source[ticks.index - 1] !== "\\") delimiters++;
    return delimiters % 2 === 1;
  }
  function transclusionsIn(content) {
    const matches = [];
    let inFence = false;
    let offset = 0;
    const lines = String(content ?? "").split("\n");
    for (let line = 0; line < lines.length; line++) {
      const source = lines[line].replace(/\r$/, "");
      if (FENCE_RE2.test(source)) {
        inFence = !inFence;
      } else if (!inFence) {
        for (const match of source.matchAll(TRANSCLUSION_RE)) {
          if (isInsideInlineCode2(source, match.index)) continue;
          const [pageId, ...sectionParts] = match[1].split("#");
          matches.push({
            raw: match[0],
            pageId: clean2(pageId),
            section: clean2(sectionParts.join("#")),
            line,
            start: offset + match.index,
            end: offset + match.index + match[0].length
          });
        }
      }
      offset += lines[line].length + 1;
    }
    return matches;
  }
  function transclusionReaches(page, section, wantedId, byId, seen = /* @__PURE__ */ new Set()) {
    const key = `${page.id}#${section}`;
    if (seen.has(key)) return false;
    seen.add(key);
    const content = section ? extractSectionMarkdown(page.content, section)?.body : page.content;
    if (content == null) return false;
    for (const occurrence of transclusionsIn(content)) {
      if (occurrence.pageId === wantedId) return true;
      const target = byId.get(occurrence.pageId);
      if (target && transclusionReaches(target, occurrence.section, wantedId, byId, seen)) return true;
    }
    return false;
  }
  function findDirectiveProblems(pages = []) {
    const problems = [];
    const byId = new Map(pages.map((page) => [page.id, page]));
    for (const page of pages) {
      let inFence = false;
      let offset = 0;
      const lines = String(page.content ?? "").split("\n");
      for (let line = 0; line < lines.length; line++) {
        const source = lines[line].replace(/\r$/, "");
        if (FENCE_RE2.test(source)) {
          inFence = !inFence;
        } else if (!inFence && /^\s*\{\{pages\b/.test(source)) {
          const exact = QUERY_RE.exec(source);
          const queryBody = exact ? exact[1] : source.replace(/^\s*\{\{pages\b/, "").replace(/\}\}\s*$/, "");
          const detail = queryOptionProblems(queryBody);
          if (!exact) detail.problems = [.../* @__PURE__ */ new Set(["malformed syntax", ...detail.problems])];
          if (detail.problems.length) problems.push({
            level: "error",
            code: "invalid-query",
            pageUid: page.uid,
            pageId: page.id,
            line,
            start: offset,
            end: offset + source.length,
            malformed: !exact,
            options: detail.options,
            text: `${page.title || page.id} has an invalid page query: ${detail.problems.join(", ")}.`
          });
          if (detail.options.parent && !byId.has(detail.options.parent)) problems.push({
            level: "warning",
            code: "query-missing-parent",
            pageUid: page.uid,
            pageId: page.id,
            line,
            start: offset,
            end: offset + source.length,
            options: detail.options,
            text: `${page.title || page.id} query references missing parent "${detail.options.parent}".`
          });
        }
        offset += lines[line].length + 1;
      }
      for (const occurrence of transclusionsIn(page.content)) {
        const target = byId.get(occurrence.pageId);
        const common = {
          pageUid: page.uid,
          pageId: page.id,
          line: occurrence.line,
          start: occurrence.start,
          end: occurrence.end,
          targetId: occurrence.pageId,
          section: occurrence.section
        };
        if (!target) {
          problems.push({
            ...common,
            level: "error",
            code: "missing-transclusion",
            text: `${page.title || page.id} transcludes missing page "${occurrence.pageId}".`
          });
          continue;
        }
        if (isSimpleFolder(target)) {
          problems.push({
            ...common,
            level: "error",
            code: "missing-transclusion",
            text: `${page.title || page.id} transcludes navigation-only folder "${target.id}".`
          });
          continue;
        }
        if (occurrence.section && !extractSectionMarkdown(target.content, occurrence.section)) {
          problems.push({
            ...common,
            level: "error",
            code: "missing-transclusion-section",
            text: `${page.title || page.id} transcludes missing section "${target.id}#${occurrence.section}".`
          });
          continue;
        }
        if (target.id === page.id || transclusionReaches(target, occurrence.section, page.id, byId)) problems.push({
          ...common,
          level: "error",
          code: "circular-transclusion",
          text: `${page.title || page.id} has a circular transclusion through "${target.id}".`
        });
      }
    }
    return problems;
  }

  // km/src/js/content/media.js
  var MEDIA_TAGS = [
    ["video", /\.(?:mp4|webm|ogv|mov|m4v)(?:[?#]|$)/i],
    ["audio", /\.(?:mp3|m4a|aac|oga|ogg|opus|wav|flac)(?:[?#]|$)/i]
  ];
  var IMAGE_FILE = /\.(?:png|jpe?g|gif|webp|avif|svg|bmp|ico)(?:[?#]|$)/i;
  var mediaTag = (url) => MEDIA_TAGS.find(([, pattern]) => pattern.test(String(url ?? "")))?.[0] ?? "";
  var assetKind = (url) => mediaTag(url) || (IMAGE_FILE.test(String(url ?? "")) ? "image" : "");
  function resolveAssetURL(url, base = "") {
    const value = String(url ?? "");
    if (!base || !value || /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(value)) return value;
    return `${base.replace(/\/?$/, "/")}${value}`;
  }

  // km-editor/src/js/issues.js
  var PREVIEW_ASSET_BASE = new URL("../km/", location.href).href;
  function initIssues({
    list,
    actions,
    count,
    getState,
    goToPage,
    revealSource,
    onFixApplied,
    addConfigLang,
    currentTheme: currentTheme2,
    todayIso: todayIso3,
    openQueryBuilder,
    openMathBuilder: openMathBuilder2,
    openMermaidBuilder: openMermaidBuilder2
  }) {
    const brokenDiagrams = /* @__PURE__ */ new Map();
    let diagramCheckRun = null;
    const missingAssets = /* @__PURE__ */ new Map();
    let assetProbeRun = null;
    let mathValidationQueued = false;
    function validateEditorState() {
      const state3 = getState();
      const messages = [
        ...validateState(state3).filter((message) => message.level !== "ok"),
        ...findDirectiveProblems(state3.pages),
        ...findMathProblems(state3.pages),
        ...findDiagramProblems(state3.pages, (diagram) => brokenDiagrams.get(diagram) || null),
        ...assetProblems(state3.pages, (url) => missingAssets.get(url) === true)
      ];
      return messages.length ? messages : [{ level: "ok", text: "Bundle is valid enough to export." }];
    }
    function queueDiagramChecks() {
      if (diagramCheckRun) return;
      const unchecked = [...new Set(getState().pages.flatMap(
        (page) => findMermaidBlocks(page.content).map((block) => block.diagram)
      ))].filter((diagram) => !brokenDiagrams.has(diagram));
      if (!unchecked.length) return;
      for (const diagram of unchecked) brokenDiagrams.set(diagram, null);
      diagramCheckRun = Promise.all(unchecked.map(
        (diagram) => parseDiagram(diagram, currentTheme2() === "light" ? "default" : "dark").then((failure) => brokenDiagrams.set(diagram, failure)).catch(() => {
        })
      )).then(() => {
        diagramCheckRun = null;
        renderProblems(validateEditorState());
      });
    }
    function probeAsset(url) {
      return new Promise((resolve) => {
        const tag = mediaTag(url) || "img";
        const node = document.createElement(tag);
        if (tag !== "img") node.preload = "metadata";
        const settle = (loaded) => resolve(loaded);
        node.addEventListener(tag === "img" ? "load" : "loadedmetadata", () => settle(true), { once: true });
        node.addEventListener("error", () => settle(false), { once: true });
        node.src = resolveAssetURL(url, PREVIEW_ASSET_BASE);
      });
    }
    function queueAssetChecks() {
      if (assetProbeRun) return;
      const unchecked = [...new Set(getState().pages.flatMap(
        (page) => assetReferences(page.content).map((reference) => reference.url)
      ))].filter((url) => !missingAssets.has(url));
      if (!unchecked.length) return;
      for (const url of unchecked) missingAssets.set(url, false);
      assetProbeRun = Promise.all(unchecked.map(
        (url) => probeAsset(url).then((loaded) => missingAssets.set(url, !loaded))
      )).then(() => {
        assetProbeRun = null;
        renderProblems(validateEditorState());
      });
    }
    function queueMathValidation() {
      if (mathValidationQueued) return;
      if (!getState().pages.some((page) => findFormulas(page.content).length)) return;
      mathValidationQueued = true;
      ensureKatex().then(() => renderProblems(validateEditorState()), () => {
      });
    }
    function appendProblemText(container, message) {
      const page = getState().pages.find((candidate) => candidate.uid === message.pageUid);
      const label = page?.title || page?.id;
      const at = label ? message.text.indexOf(label) : -1;
      if (at < 0) {
        container.textContent = message.text;
        return;
      }
      const link = document.createElement("button");
      link.type = "button";
      link.className = "problem-page-link";
      link.dataset.problemPage = page.uid;
      link.textContent = label;
      link.title = `Go to ${label}`;
      container.append(message.text.slice(0, at), link, message.text.slice(at + label.length));
    }
    function renderProblems(messages) {
      const problems = messages.filter((message) => message.level !== "ok");
      const errors = messages.filter((message) => message.level === "error").length;
      const warnings = messages.filter((message) => message.level === "warning").length;
      count.textContent = String(problems.length);
      count.className = `problem-ping ${errors ? "error" : warnings ? "warning" : "ok"}`;
      list.replaceChildren(
        ...messages.map((message) => {
          const li = document.createElement("li");
          li.className = message.level;
          li._problem = message;
          const row = document.createElement("div");
          row.className = "problem-row";
          const text = document.createElement("span");
          text.className = "problem-text";
          appendProblemText(text, message);
          row.append(text);
          if (PROBLEM_FIXES[message.code]) {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.problemFix = message.code;
            button.textContent = PROBLEM_FIXES[message.code].label;
            row.append(button);
          }
          li.append(row);
          return li;
        })
      );
      actions.hidden = !messages.every((message) => message.level === "ok");
      queueMathValidation();
      queueDiagramChecks();
      queueAssetChecks();
    }
    function problemField(text, control) {
      const label = document.createElement("label");
      label.append(
        Object.assign(document.createElement("span"), { textContent: text }),
        control
      );
      return label;
    }
    function commitProblemFix(problem, value = {}) {
      const state3 = getState();
      if (problem.code === "missing-language") {
        addConfigLang(problem.module);
        return true;
      }
      const page = state3.pages.find((candidate) => candidate.uid === (value.pageUid || problem.pageUid));
      if (!repairProblem(state3, problem, value)) return false;
      onFixApplied(problem, page);
      return true;
    }
    function appendProblemTargetFields(form, problem, mode) {
      const state3 = getState();
      const pageSelect = document.createElement("select");
      pageSelect.name = "targetPageUid";
      for (const page of state3.pages) {
        if (!page.id || pageKind(state3.pages, page) === "Simple folder" || mode === "transclusion" && page.uid === problem.pageUid) continue;
        pageSelect.append(Object.assign(document.createElement("option"), {
          value: page.uid,
          textContent: `${page.title || page.id} (${page.id})`
        }));
      }
      const wanted = state3.pages.find(
        (page) => page.id === problem.targetId || mode === "link" && page.uid === problem.pageUid
      );
      if (wanted && [...pageSelect.options].some((option) => option.value === wanted.uid))
        pageSelect.value = wanted.uid;
      const sectionSelect = document.createElement("select");
      sectionSelect.name = mode === "link" ? "anchor" : "section";
      const fillSections = () => {
        const page = state3.pages.find((candidate) => candidate.uid === pageSelect.value);
        sectionSelect.replaceChildren(Object.assign(document.createElement("option"), {
          value: "",
          textContent: mode === "link" ? "Page top" : "Whole page"
        }));
        for (const heading of parseHeadings(page?.content)) {
          sectionSelect.append(Object.assign(document.createElement("option"), {
            value: mode === "link" ? heading.anchor : heading.text,
            textContent: heading.text
          }));
        }
      };
      pageSelect.addEventListener("change", fillSections);
      fillSections();
      if (problem.section && [...sectionSelect.options].some((option) => option.value === problem.section))
        sectionSelect.value = problem.section;
      form.append(
        problemField(mode === "link" ? "Target page" : "Page to transclude", pageSelect),
        problemField("Section", sectionSelect)
      );
      return pageSelect;
    }
    function openProblemQueryEditor(problem) {
      goToPage(problem.pageUid, problem.line);
      openQueryBuilder(problem);
    }
    function openProblemMathEditor(problem) {
      const target = revealSource(problem);
      target.setSelectionRange(problem.start, problem.start);
      openMathBuilder2();
    }
    function openProblemDiagramEditor(problem) {
      const target = revealSource(problem);
      target.setSelectionRange(problem.start, problem.start);
      openMermaidBuilder2();
    }
    function openProblemFixForm(problem, li) {
      const state3 = getState();
      for (const form2 of list.querySelectorAll(".problem-fix-form")) form2.remove();
      const form = document.createElement("form");
      form.className = "problem-fix-form";
      let focusTarget;
      if (problem.code === "missing-title") {
        const input = document.createElement("input");
        input.name = "title";
        input.required = true;
        input.placeholder = "Page title";
        form.append(problemField("Title", input));
        focusTarget = input;
      } else if (problem.code === "duplicate-id") {
        const select = document.createElement("select");
        select.name = "pageUid";
        for (const pageUid of problem.pageUids) {
          const page = state3.pages.find((candidate) => candidate.uid === pageUid);
          if (!page) continue;
          select.append(Object.assign(document.createElement("option"), {
            value: page.uid,
            textContent: page.title || "(untitled page)"
          }));
        }
        select.selectedIndex = Math.min(1, select.options.length - 1);
        const input = document.createElement("input");
        input.name = "id";
        input.required = true;
        const suggestId = () => {
          const page = state3.pages.find((candidate) => candidate.uid === select.value);
          input.value = uniquePageId(state3.pages, page?.title || `${problem.id}_copy`);
        };
        select.addEventListener("change", suggestId);
        suggestId();
        form.append(problemField("Page to rename", select), problemField("New ID", input));
        focusTarget = input;
      } else if (["self-parent", "missing-parent", "parent-cycle"].includes(problem.code)) {
        const page = state3.pages.find((candidate) => candidate.uid === problem.pageUid);
        const select = document.createElement("select");
        select.name = "parent";
        select.append(Object.assign(document.createElement("option"), {
          value: "",
          textContent: "No parent (top level)"
        }));
        for (const candidate of state3.pages) {
          if (!candidate.id || candidate.uid === page?.uid || wouldCreateCycle(state3.pages, page?.uid, candidate.id)) continue;
          select.append(Object.assign(document.createElement("option"), {
            value: candidate.id,
            textContent: `${candidate.title || candidate.id} (${candidate.id})`
          }));
        }
        form.append(problemField("Replacement parent", select));
        focusTarget = select;
      } else if (problem.code === "invalid-date") {
        const input = document.createElement("input");
        input.type = "date";
        input.name = "updated";
        input.required = true;
        input.value = todayIso3();
        form.append(problemField("Updated date", input));
        focusTarget = input;
      } else if (problem.code === "duplicate-glossary-alias") {
        const input = document.createElement("input");
        input.name = "surface";
        input.required = true;
        input.value = `${problem.surface} 2`;
        form.append(problemField("Replacement alias", input));
        focusTarget = input;
      } else if (problem.code === "duplicate-glossary-term") {
        const choices = document.createElement("fieldset");
        choices.className = "problem-entry-choices";
        choices.append(Object.assign(document.createElement("legend"), {
          textContent: `Keep one "${problem.surface}" entry`
        }));
        for (const [index, entry] of problem.entries.entries()) {
          const label = document.createElement("label");
          const input = document.createElement("input");
          input.type = "radio";
          input.name = "keepEntry";
          input.value = entry.entry;
          input.required = true;
          input.checked = index === 0;
          const content = document.createElement("pre");
          content.textContent = entry.content;
          label.append(input, content);
          choices.append(label);
        }
        form.append(choices);
        focusTarget = choices.querySelector("input");
      } else if (problem.code === "broken-link") {
        focusTarget = appendProblemTargetFields(form, problem, "link");
      } else if (["missing-transclusion", "missing-transclusion-section", "circular-transclusion"].includes(problem.code)) {
        focusTarget = appendProblemTargetFields(form, problem, "transclusion");
      }
      const actionRow = document.createElement("div");
      actionRow.className = "problem-fix-form-actions";
      const save2 = document.createElement("button");
      save2.type = "submit";
      save2.textContent = "Apply";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => form.remove());
      if (["missing-transclusion", "missing-transclusion-section", "circular-transclusion"].includes(problem.code)) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Remove";
        remove.addEventListener("click", () => commitProblemFix(problem, { remove: true }));
        actionRow.append(remove);
      }
      actionRow.append(save2, cancel);
      form.append(actionRow);
      form.addEventListener("input", (event) => event.target.setCustomValidity?.(""));
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const value = Object.fromEntries(new FormData(form));
        if (commitProblemFix(problem, value)) return;
        const input = form.querySelector("input");
        if (!input) return;
        input.setCustomValidity("Choose a valid value that resolves this problem.");
        input.reportValidity();
      });
      li.append(form);
      focusTarget?.focus();
    }
    const PROBLEM_FIXES = {
      "missing-id": { label: "Generate ID" },
      "invalid-id": { label: "Fix ID" },
      "missing-language": { label: "Load" },
      "missing-km-header": { label: "Accept conversion" },
      "missing-title": { label: "Set title", open: openProblemFixForm },
      "duplicate-id": { label: "Rename", open: openProblemFixForm },
      "invalid-date": { label: "Set date", open: openProblemFixForm },
      "duplicate-glossary-alias": { label: "Rename alias", open: openProblemFixForm },
      "duplicate-glossary-term": { label: "Choose entry", open: openProblemFixForm },
      "broken-link": { label: "Choose target", open: openProblemFixForm },
      "missing-transclusion": { label: "Choose page", open: openProblemFixForm },
      "missing-transclusion-section": { label: "Choose section", open: openProblemFixForm },
      "circular-transclusion": { label: "Change target", open: openProblemFixForm },
      "self-parent": { label: "Choose parent", open: openProblemFixForm },
      "missing-parent": { label: "Choose parent", open: openProblemFixForm },
      "parent-cycle": { label: "Break cycle", open: openProblemFixForm },
      "missing-asset": { label: "Edit source", open: revealSource },
      "invalid-query": { label: "Fix query", open: openProblemQueryEditor, panel: true },
      "query-missing-parent": { label: "Edit query", open: openProblemQueryEditor, panel: true },
      "invalid-math": { label: "Edit formula", open: openProblemMathEditor, panel: true },
      "invalid-diagram": { label: "Edit diagram", open: openProblemDiagramEditor, panel: true }
    };
    list.addEventListener("click", (event) => {
      const pageLink = event.target.closest("[data-problem-page]");
      if (pageLink) {
        const problem2 = pageLink.closest("li")?._problem;
        goToPage(pageLink.dataset.problemPage, Number.isInteger(problem2?.line) ? problem2.line : null);
        return;
      }
      const button = event.target.closest("[data-problem-fix]");
      if (!button) return;
      const li = button.closest("li");
      const problem = li?._problem;
      if (!problem) return;
      const fix = PROBLEM_FIXES[problem.code];
      if (fix?.panel) event.stopPropagation();
      if (fix?.open) fix.open(problem, li);
      else commitProblemFix(problem);
    });
    return { refresh: () => renderProblems(validateEditorState()) };
  }

  // km-editor/src/js/dialogs.js
  var root = null;
  function initDialogs(modalRoot) {
    root = modalRoot;
  }
  function closeModal(value, resolve) {
    root.hidden = true;
    root.replaceChildren();
    resolve(value);
  }
  function modal(title, bodyBuilder, footerBuilder) {
    return new Promise((resolve) => {
      root.hidden = false;
      const card = document.createElement("section");
      card.className = "modal-card";
      card.innerHTML = `
			<header>
				<h2>${title}</h2>
				<button type="button" data-close title="Close">Close</button>
			</header>
			<div class="modal-body"></div>
			<footer></footer>
		`;
      const body = card.querySelector(".modal-body");
      const footer = card.querySelector("footer");
      bodyBuilder(body, (value) => closeModal(value, resolve));
      footerBuilder?.(footer, (value) => closeModal(value, resolve));
      card.querySelector("[data-close]").addEventListener("click", () => closeModal(null, resolve));
      root.replaceChildren(card);
      const firstField = card.querySelector("input, textarea, button");
      firstField?.focus();
    });
  }
  function showMessage(title, message) {
    return modal(
      title,
      (body) => {
        const paragraph = document.createElement("p");
        paragraph.textContent = message;
        body.append(paragraph);
      },
      (footer, done) => {
        const ok = document.createElement("button");
        ok.type = "button";
        ok.textContent = "OK";
        ok.addEventListener("click", () => done(true));
        footer.append(ok);
      }
    );
  }
  function showConfirm(title, message, confirmLabel = "OK", danger = false) {
    return modal(
      title,
      (body) => {
        const paragraph = document.createElement("p");
        paragraph.textContent = message;
        body.append(paragraph);
      },
      (footer, done) => {
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", () => done(false));
        const ok = document.createElement("button");
        ok.type = "button";
        if (danger) ok.className = "danger";
        ok.textContent = confirmLabel;
        ok.addEventListener("click", () => done(true));
        footer.append(cancel, ok);
      }
    );
  }
  function showPrompt(title, label, initialValue = "") {
    return modal(
      title,
      (body) => {
        const fieldLabel = document.createElement("label");
        fieldLabel.innerHTML = `<span>${label}</span>`;
        const input = document.createElement("input");
        input.value = initialValue;
        fieldLabel.append(input);
        body.append(fieldLabel);
      },
      (footer, done) => {
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", () => done(null));
        const ok = document.createElement("button");
        ok.type = "button";
        ok.textContent = "Insert";
        ok.addEventListener("click", () => {
          const value = root.querySelector("input")?.value ?? "";
          done(value);
        });
        footer.append(cancel, ok);
      }
    );
  }
  function cheatsheetRow({ label, syntax, example, shortcut }) {
    const row = document.createElement("div");
    row.className = "cheatsheet-row";
    const name = document.createElement("span");
    name.className = "tool-name";
    name.textContent = label;
    const code = document.createElement("code");
    code.className = "tool-syntax";
    code.textContent = syntax || "";
    const preview = document.createElement("span");
    preview.className = "tool-example";
    preview.innerHTML = example;
    const key = document.createElement("kbd");
    key.className = "tool-shortcut";
    key.textContent = shortcut || "";
    row.append(name, code, preview, key);
    return row;
  }
  function showCheatsheet(sections) {
    return modal("Syntax cheatsheet", (body) => {
      const tabs = document.createElement("nav");
      tabs.className = "cheatsheet-tabs";
      body.append(tabs);
      const views = sections.map(({ tab: title, groups }, index) => {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.textContent = title;
        tab.classList.toggle("active", index === 0);
        tabs.append(tab);
        const panel = document.createElement("div");
        panel.className = "cheatsheet-panel";
        panel.hidden = index > 0;
        for (const group of groups) {
          const heading = document.createElement("strong");
          heading.className = "tool-group-title";
          heading.textContent = group.title;
          panel.append(heading, ...group.rows.map(cheatsheetRow));
        }
        body.append(panel);
        return { tab, panel };
      });
      for (const view of views) view.tab.addEventListener("click", () => {
        for (const other of views) {
          other.tab.classList.toggle("active", other === view);
          other.panel.hidden = other !== view;
        }
      });
    });
  }
  function showSourceModal(title, source, applyLabel = "Apply") {
    return modal(
      title,
      (body) => {
        const textarea = document.createElement("textarea");
        textarea.value = source;
        textarea.spellcheck = false;
        body.append(textarea);
      },
      (footer, done) => {
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", () => done(null));
        const apply = document.createElement("button");
        apply.type = "button";
        apply.textContent = applyLabel;
        apply.addEventListener("click", () => done(root.querySelector("textarea")?.value ?? ""));
        footer.append(cancel, apply);
      }
    );
  }
  function showSaveChoiceModal(remembered = false) {
    return modal(
      "Save changes",
      (body) => {
        body.innerHTML = `
				<p>Where should this bundle be saved?</p>
				<label class="modal-checkbox">
					<input type="checkbox" data-save-remember>
					<span>Don't ask again, reopen from Export &gt; Set save shortcut</span>
				</label>
			`;
        body.querySelector("[data-save-remember]").checked = remembered;
      },
      (footer, done) => {
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", () => done(null));
        const pick = (mode, label) => {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = label;
          button.addEventListener("click", () => done({
            mode,
            remember: root.querySelector("[data-save-remember]")?.checked ?? false
          }));
          return button;
        };
        footer.append(cancel, pick("export", "Export file"), pick("github", "Push to GitHub"));
      }
    );
  }
  function showGitHubModal(initial, confirmLabel = "Save") {
    return modal(
      "GitHub file",
      (body) => {
        body.innerHTML = `
				<label>
					<span>Repository (owner/name)</span>
					<input data-gh-repo autocomplete="off" placeholder="gwanox/conclave-guide">
				</label>
				<label>
					<span>Branch</span>
					<input data-gh-branch autocomplete="off" placeholder="main">
				</label>
				<label>
					<span>File path</span>
					<input data-gh-path autocomplete="off" placeholder="content.md">
				</label>
				<label>
					<span>Fine-grained token, contents read/write on this repo only (needed to save; loading a public repo works without it)</span>
					<input data-gh-token type="password" autocomplete="off" placeholder="github_pat_...">
				</label>
			`;
        body.querySelector("[data-gh-repo]").value = initial?.repo ?? "";
        body.querySelector("[data-gh-branch]").value = initial?.branch ?? "main";
        body.querySelector("[data-gh-path]").value = initial?.path ?? "content.md";
        body.querySelector("[data-gh-token]").value = initial?.token ?? "";
      },
      (footer, done) => {
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", () => done(null));
        const ok = document.createElement("button");
        ok.type = "button";
        ok.textContent = confirmLabel;
        ok.addEventListener("click", () => {
          const field = (name) => root.querySelector(`[data-gh-${name}]`)?.value.trim() ?? "";
          const repo = field("repo");
          if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) return;
          done({
            repo,
            branch: field("branch") || "main",
            path: field("path") || "content.md",
            token: field("token")
          });
        });
        footer.append(cancel, ok);
      }
    );
  }
  function showGlossaryModal(initialTerm = "") {
    return modal(
      "Add glossary term",
      (body) => {
        body.innerHTML = `
				<label>
					<span>Term</span>
					<input data-glossary-term autocomplete="off">
				</label>
				<label>
					<span>Definition</span>
					<textarea class="compact-textarea" data-glossary-definition spellcheck="true" placeholder="Write the definition that will be added under this glossary heading."></textarea>
				</label>
			`;
        body.querySelector("[data-glossary-term]").value = initialTerm;
      },
      (footer, done) => {
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", () => done(null));
        const add = document.createElement("button");
        add.type = "button";
        add.textContent = "Add term";
        add.addEventListener("click", () => {
          done({
            term: root.querySelector("[data-glossary-term]")?.value ?? "",
            definition: root.querySelector("[data-glossary-definition]")?.value ?? ""
          });
        });
        footer.append(cancel, add);
      }
    );
  }
  function showLinkModal(state3, selectedText2 = "") {
    return modal(
      "Insert link",
      (body, done) => {
        body.innerHTML = `
				<div class="link-custom-form">
					<label>
						<span>Link text</span>
						<input data-link-text autocomplete="off">
					</label>
					<label>
						<span>URL or KM route</span>
						<input data-link-url autocomplete="off" placeholder="https://example.com or #page#anchor">
					</label>
				</div>
				<h3 class="modal-subhead">Page and heading suggestions</h3>
				<label>
					<span>Search pages</span>
					<input type="search" data-link-filter placeholder="Type a page title or id...">
				</label>
				<ul class="choice-list" data-link-list></ul>
			`;
        const textInput = body.querySelector("[data-link-text]");
        const urlInput = body.querySelector("[data-link-url]");
        const filter = body.querySelector("[data-link-filter]");
        const list = body.querySelector("[data-link-list]");
        textInput.value = selectedText2;
        const renderChoices = () => {
          const query = filter.value.trim().toLowerCase();
          list.replaceChildren();
          for (const page of state3.pages) {
            if (pageKind(state3.pages, page) === "Simple folder") continue;
            const pageText = `${page.title} ${page.id}`.toLowerCase();
            if (query && !pageText.includes(query)) continue;
            const pageItem = document.createElement("li");
            const route = pageRoute(state3.pages, page);
            const pageButton = document.createElement("button");
            pageButton.type = "button";
            pageButton.textContent = `${page.title}  #${route}`;
            pageButton.addEventListener("click", () => {
              done({
                text: textInput.value.trim() || selectedText2 || page.title,
                route: `#${route}`
              });
            });
            pageItem.append(pageButton);
            list.append(pageItem);
            for (const heading of parseHeadings(page.content).slice(0, 8)) {
              const headingItem = document.createElement("li");
              const headingButton = document.createElement("button");
              headingButton.type = "button";
              const anchorRoute = `#${route}${route ? "#" : ""}${heading.anchor}`;
              headingButton.textContent = `${"  ".repeat(Math.max(0, heading.level - 1))}${heading.text}  ${anchorRoute}`;
              headingButton.addEventListener("click", () => {
                done({
                  text: textInput.value.trim() || selectedText2 || heading.text,
                  route: anchorRoute
                });
              });
              headingItem.append(headingButton);
              list.append(headingItem);
            }
          }
        };
        filter.addEventListener("input", renderChoices);
        urlInput.addEventListener("keydown", (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          const route = urlInput.value.trim();
          if (!route) return;
          done({
            text: textInput.value.trim() || route,
            route
          });
        });
        renderChoices();
      },
      (footer, done) => {
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", () => done(null));
        const insert = document.createElement("button");
        insert.type = "button";
        insert.textContent = "Insert custom link";
        insert.addEventListener("click", () => {
          const route = root.querySelector("[data-link-url]")?.value.trim() ?? "";
          if (!route) return;
          done({
            text: root.querySelector("[data-link-text]")?.value.trim() || route,
            route
          });
        });
        footer.append(cancel, insert);
      }
    );
  }

  // km-editor/src/js/app.js
  var $ = (selector) => document.querySelector(selector);
  var els = {
    app: $("#app"),
    fileStatus: $("#file-status"),
    dirtyStatus: $("#dirty-status"),
    treeRoot: $("#tree-root"),
    treeFilter: $("#tree-filter"),
    modeTabs: [...document.querySelectorAll("[data-mode]")],
    modeViews: [...document.querySelectorAll("[data-view]")],
    raw: $("#raw-editor"),
    compareRaw: $("#compare-raw-editor"),
    sourcePanes: [...document.querySelectorAll("[data-source-pane]")],
    rendered: $("#rendered-editor"),
    compareRendered: $("#compare-rendered-editor"),
    codeLanguageNotices: [...document.querySelectorAll("[data-code-language-notice]")],
    editorPanel: $(".editor-panel"),
    linkDropNotice: $("#link-drop-notice"),
    dropCaret: $("#drop-caret"),
    tableToolbar: $("#table-toolbar"),
    queryToolbar: $("#query-toolbar"),
    mathToolbar: $("#math-toolbar"),
    mermaidToolbar: $("#mermaid-toolbar"),
    mermaidBuilder: $("#mermaid-builder"),
    mermaidTemplates: $("#mermaid-templates"),
    mermaidSnippets: $("#mermaid-snippets"),
    mermaidInput: $("#mermaid-input"),
    mermaidPreview: $("#mermaid-preview"),
    mermaidStatus: $("#mermaid-status"),
    mermaidSubmit: $("#mermaid-submit"),
    mathBuilder: $("#math-builder"),
    mathTabs: $("#math-tabs"),
    mathPalette: $("#math-palette"),
    mathInput: $("#math-input"),
    mathPreview: $("#math-preview"),
    mathStatus: $("#math-status"),
    mathSubmit: $("#math-submit"),
    tableGridPicker: $("#table-grid-picker"),
    tableGridLabel: $("#table-grid-label"),
    queryBuilder: $("#query-builder"),
    querySyntax: $("#query-builder-syntax"),
    querySubmit: $("#query-builder-submit"),
    queryTagOptions: $("#query-tag-options"),
    queryParentOptions: $("#query-parent-options"),
    queryTrailOptions: $("#query-trail-options"),
    emojiPicker: $("#emoji-picker"),
    emojiSearch: $("#emoji-search"),
    emojiStatus: $("#emoji-status"),
    emojiThemes: $("#emoji-themes"),
    previewButton: $('[data-action="preview-km"]'),
    exportPageButton: $('[data-action="export-page"]'),
    fullPreview: $("#full-km-preview"),
    previewOverlay: $("#km-preview-overlay"),
    metadata: $("#metadata-form"),
    config: $("#config-form"),
    pageKind: $("#page-kind"),
    makeSimpleFolderButtons: [...document.querySelectorAll('[data-action="make-simple-folder"]')],
    validation: $("#validation-list"),
    problemActions: $("#problem-actions"),
    problemsCount: $("#problems-count"),
    snapshotList: $("#snapshot-list"),
    idError: $("#id-error"),
    parentButton: $("#parent-picker-button"),
    parentLabel: $("#parent-picker-label"),
    parentOptions: $("#parent-options"),
    tagsInput: $("#tags-input"),
    tagChips: $("#tag-chips"),
    tagOptions: $("#tag-options"),
    tagSearch: $("#tag-search"),
    configLangsInput: $("#config-langs-input"),
    configLangChips: $("#config-lang-chips"),
    configLangOptions: $("#config-lang-options"),
    configLangSearch: $("#config-lang-search"),
    configPreview: $("#config-preview"),
    themeSwitch: $("#theme-switch"),
    fileInput: $("#fallback-file-input"),
    modalRoot: $("#modal-root"),
    formatbar: $(".formatbar"),
    historyButtons: [...document.querySelectorAll("[data-history-action]")],
    inspectorTabs: [...document.querySelectorAll("[data-inspector-tab]")],
    inspectorPanels: [...document.querySelectorAll("[data-inspector-panel]")],
    menuButtons: [...document.querySelectorAll("[data-menu]")],
    menuPanels: [...document.querySelectorAll("[data-menu-panel]")]
  };
  var COMMON_HLJS_LANGS = [
    "bash",
    "c",
    "cpp",
    "csharp",
    "css",
    "diff",
    "dockerfile",
    "go",
    "ini",
    "java",
    "javascript",
    "json",
    "kotlin",
    "lua",
    "markdown",
    "mermaid",
    "php",
    "plaintext",
    "powershell",
    "python",
    "r",
    "ruby",
    "rust",
    "scss",
    "shell",
    "sql",
    "swift",
    "typescript",
    "xml",
    "yaml"
  ];
  var state2 = createStarterState();
  var previewTimer = 0;
  var snapshotTimer = 0;
  var previewUrl = "";
  var fullPreviewUrl = "";
  var readyPreviewFrames = /* @__PURE__ */ new Set();
  var previewSignature = "";
  var themeTransitionTimer = 0;
  var oneFileTemplate = "";
  var lastTextArea = els.raw;
  var lastPreviewSelection = "";
  var modeBeforeSimpleFolder = null;
  var queryTarget = null;
  var querySelection = null;
  var queryEditRange = null;
  var queryOriginalContent = null;
  var queryPageUid = null;
  var mathTarget = null;
  var mathRange = null;
  var mathExisting = null;
  var diagramTarget = null;
  var diagramRange = null;
  var diagramEditing = false;
  var emojiPicker = null;
  var dismissedCodeLanguages = /* @__PURE__ */ new Set();
  var MERMAID_STARTER = "flowchart TD\n  A[Start] --> B[Finish]";
  var SNAPSHOT_KEY = "km-editor-snapshots-v1";
  var EDIT_HISTORY_LIMIT = 100;
  var editHistory = { current: "", undo: [], redo: [] };
  function todayIso2() {
    const now = /* @__PURE__ */ new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 10);
  }
  function cleanText(value) {
    return String(value ?? "").trim();
  }
  function safeFilePart(value, fallback = "page") {
    return cleanText(value).toLowerCase().replace(/[^a-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || fallback;
  }
  function parseTags(value) {
    const seen = /* @__PURE__ */ new Set();
    const tags = [];
    for (const tag of String(value ?? "").split(",")) {
      const cleanTag = tag.trim();
      const key = cleanTag.toLowerCase();
      if (!cleanTag || seen.has(key)) continue;
      seen.add(key);
      tags.push(cleanTag);
    }
    return tags;
  }
  function uniqueList(values) {
    const seen = /* @__PURE__ */ new Set();
    const items = [];
    for (const value of values ?? []) {
      const cleanValue = cleanText(value);
      const key = cleanValue.toLowerCase();
      if (!cleanValue || seen.has(key)) continue;
      seen.add(key);
      items.push(cleanValue);
    }
    return items;
  }
  function normalizeConfig(config = {}) {
    const base = createDefaultConfig();
    const next = {
      ...base,
      ...config
    };
    const cacheMinutes = Math.max(0, Number(next.CACHE_MD) || 0);
    return {
      LANG: cleanText(next.LANG) || base.LANG,
      TITLE: cleanText(next.TITLE) || base.TITLE,
      MD: cleanText(next.MD) || base.MD,
      DEFAULT_THEME: next.DEFAULT_THEME === "light" ? "light" : "dark",
      ACCENT: /^#[\da-f]{6}$/i.test(cleanText(next.ACCENT)) ? cleanText(next.ACCENT) : base.ACCENT,
      LANGS: uniqueList(Array.isArray(next.LANGS) ? next.LANGS : parseTags(next.LANGS)),
      CACHE_MD: String(cacheMinutes),
      ALLOW_JS_FROM_MD: next.ALLOW_JS_FROM_MD === true || next.ALLOW_JS_FROM_MD === "true" ? "true" : "false",
      CUSTOM_EMOJI: normalizeCustomEmoji(next.CUSTOM_EMOJI)
    };
  }
  function configScript(redactImages = false) {
    const config = normalizeConfig(state2.config);
    const customEmoji = redactImages ? config.CUSTOM_EMOJI.map(({ alias, data }) => ({ alias, data: `[embedded ${Math.ceil(data.length / 1024)} KB image]` })) : config.CUSTOM_EMOJI;
    const json = [
      "{",
      `  "LANG":             ${JSON.stringify(config.LANG)},`,
      `  "TITLE":            ${JSON.stringify(config.TITLE)},`,
      `  "MD":               ${JSON.stringify(config.MD)},`,
      `  "DEFAULT_THEME":    ${JSON.stringify(config.DEFAULT_THEME)},`,
      `  "ACCENT":           ${JSON.stringify(config.ACCENT)},`,
      `  "LANGS":            ${JSON.stringify(config.LANGS)},`,
      `  "CACHE_MD":         ${JSON.stringify(config.CACHE_MD)},`,
      `  "ALLOW_JS_FROM_MD": ${JSON.stringify(config.ALLOW_JS_FROM_MD)},`,
      `  "CUSTOM_EMOJI":     ${JSON.stringify(customEmoji)}`,
      "}"
    ].join("\n");
    return `<script type="application/json" id="km-config">
${json}
<\/script>`;
  }
  function tagCounts() {
    const counts = /* @__PURE__ */ new Map();
    for (const page of state2.pages) {
      for (const tag of parseTags(page.tags)) {
        const key = tag.toLowerCase();
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return counts;
  }
  function syncFirstH1(page, title) {
    const cleanTitle = cleanText(title) || "Untitled";
    const lines = String(page.content ?? "").split(/\r?\n/);
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*(```|~~~)/.test(lines[i])) inFence = !inFence;
      if (inFence) continue;
      if (/^#\s+/.test(lines[i])) {
        lines[i] = `# ${cleanTitle}`;
        setPageContent(page, lines.join("\n"));
        return;
      }
    }
    setPageContent(page, [`# ${cleanTitle}`, cleanText(page.content)].filter(Boolean).join("\n\n"));
  }
  function updateTitle(page, title) {
    updatePageMeta(state2, page, { title });
    if (pageKind(state2.pages, page) !== "Simple folder") syncFirstH1(page, page.title);
  }
  var issues = initIssues({
    list: els.validation,
    actions: els.problemActions,
    count: els.problemsCount,
    getState: () => state2,
    goToPage: jumpToSourceUid,
    revealSource: revealProblemSource,
    onFixApplied(problem, page) {
      if (problem.code === "missing-title" && pageKind(state2.pages, page) !== "Simple folder")
        syncFirstH1(page, page.title);
      markDirty();
      renderAll(false);
    },
    addConfigLang(lang) {
      setConfigLangs([...state2.config?.LANGS ?? [], lang]);
    },
    currentTheme,
    todayIso: todayIso2,
    openQueryBuilder: openPageQueryBuilder,
    openMathBuilder,
    openMermaidBuilder
  });
  refreshActiveUid(state2);
  initDialogs(els.modalRoot);
  initTableGridPicker();
  var activePage = () => findPage(state2);
  var mainRootPage = () => state2.pages.find((page) => page.id === "home") || state2.pages[0] || null;
  function previewablePage(page = activePage()) {
    if (!page || pageKind(state2.pages, page) !== "Simple folder") return page;
    const prefix = pageRoute(state2.pages, page);
    const descendant = state2.pages.find(
      (candidate) => pageKind(state2.pages, candidate) !== "Simple folder" && pageRoute(state2.pages, candidate).startsWith(`${prefix}#`)
    );
    if (descendant) return descendant;
    const seen = /* @__PURE__ */ new Set();
    for (let parent = state2.pages.find((candidate) => candidate.id === page.parent); parent; parent = state2.pages.find((candidate) => candidate.id === parent.parent)) {
      if (seen.has(parent.uid)) break;
      seen.add(parent.uid);
      if (pageKind(state2.pages, parent) !== "Simple folder") return parent;
    }
    return state2.pages.find((candidate) => pageKind(state2.pages, candidate) !== "Simple folder") || null;
  }
  function editorStateSource() {
    return serializeEditorState({
      ...state2,
      config: normalizeConfig(state2.config)
    });
  }
  function resetEditHistory() {
    editHistory.current = editorStateSource();
    editHistory.undo.length = 0;
    editHistory.redo.length = 0;
    updateTextHistoryButtons();
  }
  function recordEditHistory() {
    const next = editorStateSource();
    if (next === editHistory.current) return;
    if (editHistory.current) editHistory.undo.push(editHistory.current);
    if (editHistory.undo.length > EDIT_HISTORY_LIMIT) editHistory.undo.shift();
    editHistory.current = next;
    editHistory.redo.length = 0;
    updateTextHistoryButtons();
  }
  function restoreEditorState(source) {
    closeCommandMenus();
    const next = parseEditorState(source);
    if (next.fileName && next.fileName !== state2.fileName) state2.fileHandle = null;
    state2.fileName = next.fileName || state2.fileName;
    state2.preamble = String(next.preamble ?? "");
    state2.pages = next.pages;
    state2.config = normalizeConfig(next.config);
    refreshActiveUid(state2);
  }
  function runEditorHistory(action) {
    cancelPageQueryPreview();
    const from = action === "undo" ? editHistory.undo : editHistory.redo;
    if (!from.length) return;
    const to = action === "undo" ? editHistory.redo : editHistory.undo;
    to.push(editHistory.current);
    editHistory.current = from.pop();
    document.activeElement?.blur();
    restoreEditorState(editHistory.current);
    state2.dirty = true;
    renderAll(true);
    scheduleSnapshot();
    updateFileStatus();
    updateTextHistoryButtons();
  }
  resetEditHistory();
  function readSnapshots() {
    try {
      const value = JSON.parse(localStorage.getItem(SNAPSHOT_KEY));
      return Array.isArray(value) ? value.filter((item) => item?.source && item?.at) : [];
    } catch {
      return [];
    }
  }
  function snapshotDiff(snapshot) {
    try {
      const oldState = snapshot.editorState ? parseEditorState(snapshot.editorState) : { ...parseBundle(snapshot.source), config: null };
      const oldPages = new Map(oldState.pages.map((page) => [page.id, page]));
      const currentPages = new Map(state2.pages.map((page) => [page.id, page]));
      const signature = (page) => JSON.stringify([
        page.title,
        page.parent,
        page.tags,
        page.trail,
        page.updated,
        page.updateComment,
        page.content
      ]);
      let added = 0;
      let removed = 0;
      let changed = 0;
      for (const [id, page] of currentPages) {
        if (!oldPages.has(id)) added++;
        else if (signature(page) !== signature(oldPages.get(id))) changed++;
      }
      for (const id of oldPages.keys()) if (!currentPages.has(id)) removed++;
      const orderChanged = oldState.pages.map((page) => page.id).join("\n") !== state2.pages.map((page) => page.id).join("\n");
      const configChanged = oldState.config && JSON.stringify(normalizeConfig(oldState.config)) !== JSON.stringify(normalizeConfig(state2.config));
      return [
        changed ? `${changed} changed` : "",
        added ? `${added} added` : "",
        removed ? `${removed} removed` : "",
        orderChanged ? "order changed" : "",
        configChanged ? "config changed" : ""
      ].filter(Boolean).join(" \xB7 ") || "Current state";
    } catch {
      return "Unreadable snapshot";
    }
  }
  function renderSnapshots() {
    if (!els.snapshotList) return;
    const snapshots = readSnapshots();
    els.snapshotList.replaceChildren(...snapshots.length ? snapshots.map((snapshot) => {
      const item = document.createElement("div");
      item.className = "snapshot-item";
      const open = document.createElement("button");
      open.type = "button";
      open.dataset.restoreSnapshot = snapshot.id;
      open.textContent = new Date(snapshot.at).toLocaleString();
      const restore = document.createElement("button");
      restore.type = "button";
      restore.dataset.restoreSnapshot = snapshot.id;
      restore.textContent = "Restore";
      const summary = document.createElement("small");
      summary.textContent = `${snapshot.fileName || "Bundle"} \xB7 ${snapshotDiff(snapshot)}`;
      item.append(open, restore, summary);
      return item;
    }) : [Object.assign(document.createElement("div"), {
      className: "empty-state",
      textContent: "Snapshots appear automatically while you edit."
    })]);
  }
  function saveSnapshot() {
    const source = serializeBundle(state2);
    const editorState = editorStateSource();
    const snapshots = readSnapshots();
    if (snapshots[0]?.editorState === editorState) {
      renderSnapshots();
      return;
    }
    snapshots.unshift({
      id: crypto.randomUUID(),
      at: (/* @__PURE__ */ new Date()).toISOString(),
      fileName: state2.fileName,
      source,
      editorState
    });
    snapshots.length = Math.min(snapshots.length, 8);
    while (snapshots.length) {
      try {
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshots));
        break;
      } catch {
        snapshots.pop();
      }
    }
    renderSnapshots();
  }
  function scheduleSnapshot() {
    clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(saveSnapshot, 1200);
  }
  function markDirty() {
    cancelPageQueryPreview();
    state2.dirty = true;
    recordEditHistory();
    scheduleSnapshot();
    updateFileStatus();
  }
  function updateFileStatus() {
    els.fileStatus.textContent = state2.fileName || state2.config?.MD || "Untitled bundle";
    els.dirtyStatus.hidden = !state2.dirty;
    if (els.themeSwitch) els.themeSwitch.textContent = `Theme: ${currentTheme()}`;
    issues.refresh();
  }
  function setStateFromBundle(parsed, extra = {}, preserveHistory = false) {
    closeCommandMenus();
    const previousMode = modeBeforeSimpleFolder || state2.mode || "raw";
    modeBeforeSimpleFolder = null;
    const starter = createStarterState();
    state2 = {
      ...starter,
      ...parsed,
      ...extra,
      config: normalizeConfig({
        ...starter.config,
        ...parsed.config,
        ...extra.config
      }),
      activeUid: (parsed.pages.find((page) => page.id === "home") || parsed.pages[0])?.uid ?? null,
      mode: previousMode,
      dirty: extra.dirty ?? false
    };
    refreshActiveUid(state2);
    if (preserveHistory) markDirty();
    else resetEditHistory();
    renderAll(true);
    saveSnapshot();
  }
  function setMode(mode) {
    state2.mode = mode;
    for (const button of els.modeTabs) {
      const active = button.dataset.mode === mode;
      button.classList.toggle("active", active);
      if (button.dataset.mode === "rendered")
        button.title = active ? "Click again to preview in KM" : "Show the rendered page";
    }
    for (const view of els.modeViews) view.classList.toggle("active", view.dataset.view === mode);
    renderEditors(true);
    updateTableToolbar();
    updateQueryToolbar();
    updateMathToolbar();
    updateMermaidToolbar();
    updateFileStatus();
  }
  function renderAll(forcePreview = false) {
    refreshActiveUid(state2);
    renderTree(els.treeRoot, state2, {
      onSelect(uid2) {
        closeCommandMenus();
        state2.activeUid = uid2;
        renderAll(true);
      },
      onMove(draggedUid, targetUid, placement) {
        if (movePage(state2, draggedUid, targetUid, placement)) {
          state2.activeUid = draggedUid;
          markDirty();
          renderAll(true);
        }
      }
    }, els.treeFilter.value);
    renderInspector();
    renderConfig();
    renderEditors(forcePreview);
    renderSnapshots();
    updateFileStatus();
  }
  function renderTagEditor(page) {
    const counts = tagCounts();
    const tags = parseTags(page.tags);
    const activeKeys = new Set(tags.map((tag) => tag.toLowerCase()));
    const query = cleanText(els.tagSearch.value);
    const queryKey = query.toLowerCase();
    const labelsByKey = /* @__PURE__ */ new Map();
    for (const candidate of state2.pages) {
      for (const tag of parseTags(candidate.tags)) {
        const key = tag.toLowerCase();
        if (!labelsByKey.has(key)) labelsByKey.set(key, tag);
      }
    }
    const available = [...counts.keys()].filter((key) => !activeKeys.has(key) && (!queryKey || key.includes(queryKey))).map((key) => ({ key, label: labelsByKey.get(key) || key, count: counts.get(key) || 0 })).sort((a, b) => a.label.localeCompare(b.label));
    els.tagsInput.value = tags.join(",");
    els.tagChips.replaceChildren(
      ...tags.map((tag) => {
        const chip = document.createElement("span");
        chip.className = "tag-chip";
        const label = document.createElement("span");
        label.textContent = tag;
        const count = document.createElement("small");
        const pages = counts.get(tag.toLowerCase()) || 1;
        count.textContent = String(pages);
        count.title = `${pages} page${pages === 1 ? "" : "s"} use this tag`;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.dataset.tagRemove = tag;
        remove.title = `Remove ${tag}`;
        remove.textContent = "\xD7";
        chip.append(label, count, remove);
        return chip;
      })
    );
    const options = [];
    if (query && !available.length && !activeKeys.has(queryKey) && !labelsByKey.has(queryKey)) {
      const create = document.createElement("button");
      create.type = "button";
      create.className = "create-option";
      create.dataset.tagAdd = query;
      create.textContent = `+ Create "${query}"`;
      options.push(create);
    }
    options.push(...available.map((tag) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.tagAdd = tag.label;
      const label = document.createElement("span");
      label.textContent = tag.label;
      const count = document.createElement("small");
      count.textContent = String(tag.count);
      count.title = `${tag.count} page${tag.count === 1 ? "" : "s"} use this tag`;
      button.append(label, count);
      return button;
    }));
    els.tagOptions.replaceChildren(
      ...options.length ? options : [Object.assign(document.createElement("div"), {
        className: "tag-empty",
        textContent: query && activeKeys.has(queryKey) ? "Already added." : "No other tags yet."
      })]
    );
  }
  function renderConfigLangEditor(config) {
    const langs = uniqueList(config.LANGS);
    const active = new Set(langs.map(canonicalCodeLanguage));
    const query = cleanText(els.configLangSearch.value);
    const queryKey = query.toLowerCase();
    const queryModule = canonicalCodeLanguage(queryKey);
    const exactQuery = COMMON_HLJS_LANGS.includes(queryModule);
    const available = COMMON_HLJS_LANGS.filter((lang) => !active.has(lang) && (!queryKey || (exactQuery ? lang === queryModule : lang.includes(queryKey) || Object.entries(CODE_LANGUAGE_MODULE).some(([alias, module]) => module === lang && alias.includes(queryKey))))).sort((a, b) => a.localeCompare(b));
    els.configLangsInput.value = langs.join(",");
    els.configLangChips.replaceChildren(
      ...langs.map((lang) => {
        const chip = document.createElement("span");
        chip.className = "tag-chip";
        const label = document.createElement("span");
        label.textContent = lang;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.dataset.langRemove = lang;
        remove.title = `Remove ${lang}`;
        remove.textContent = "\xD7";
        chip.append(label, remove);
        return chip;
      })
    );
    const options = [];
    if (query && !available.length && !active.has(queryModule) && !exactQuery) {
      const create = document.createElement("button");
      create.type = "button";
      create.className = "create-option";
      create.dataset.langAdd = query;
      create.textContent = `+ Add "${query}"`;
      options.push(create);
    }
    options.push(...available.map((lang) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.langAdd = lang;
      button.textContent = lang;
      return button;
    }));
    els.configLangOptions.replaceChildren(
      ...options.length ? options : [Object.assign(document.createElement("div"), {
        className: "tag-empty",
        textContent: query && active.has(queryKey) ? "Already loaded." : "No matching languages."
      })]
    );
  }
  function renderConfig() {
    if (!els.config) return;
    state2.config = normalizeConfig(state2.config);
    const config = state2.config;
    for (const [name, value] of Object.entries({
      MD: config.MD,
      TITLE: config.TITLE,
      LANG: config.LANG,
      DEFAULT_THEME: config.DEFAULT_THEME,
      ACCENT: config.ACCENT,
      CACHE_MD: config.CACHE_MD
    })) {
      const field = els.config.elements[name];
      if (field && field !== document.activeElement && field.value !== value) field.value = value;
    }
    const allowScripts = els.config.elements.ALLOW_JS_FROM_MD;
    if (allowScripts) allowScripts.checked = config.ALLOW_JS_FROM_MD === "true";
    renderConfigLangEditor(config);
    emojiPicker?.setCustomEmoji(config.CUSTOM_EMOJI);
    els.configPreview.textContent = configScript(true);
  }
  function renderParentPicker(page) {
    const parent = state2.pages.find((candidate) => candidate.id === page.parent);
    els.parentLabel.textContent = parent ? `${parent.id} - ${parent.title}` : page.parent ? `${page.parent} (missing)` : "No parent";
    const choices = [{ id: "", title: "Top-level page" }, ...state2.pages.filter((candidate) => candidate.uid !== page.uid && candidate.id).map((candidate) => ({ id: candidate.id, title: candidate.title }))];
    els.parentOptions.replaceChildren(...choices.map((choice) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.parentId = choice.id;
      button.classList.toggle("selected", choice.id === page.parent);
      button.append(
        Object.assign(document.createElement("strong"), {
          textContent: choice.id || "No parent"
        }),
        Object.assign(document.createElement("small"), {
          textContent: choice.title
        })
      );
      return button;
    }));
  }
  function renderInspector() {
    const page = activePage();
    if (!page) return;
    const kind = pageKind(state2.pages, page);
    const simpleFolder = kind === "Simple folder";
    els.pageKind.textContent = kind;
    for (const button of els.makeSimpleFolderButtons)
      button.hidden = simpleFolder || page === mainRootPage();
    for (const [name, value] of Object.entries({
      id: page.id,
      title: page.title,
      parent: page.parent,
      tags: page.tags,
      trail: page.trail || "",
      updated: page.updated || todayIso2(),
      updateComment: page.updateComment
    })) {
      const field = els.metadata.elements[name];
      if (field && field !== document.activeElement && field.value !== value) field.value = value;
    }
    renderTagEditor(page);
    renderParentPicker(page);
    const trailField = els.metadata.elements.trail;
    trailField.disabled = simpleFolder;
    trailField.title = simpleFolder ? "Simple folders are skipped by reading trails" : "";
    if (els.exportPageButton) {
      els.exportPageButton.disabled = simpleFolder;
      els.exportPageButton.title = simpleFolder ? "A simple folder has no standalone page to export" : "Download only the selected page as a .md file";
    }
    const duplicateId = Boolean(page.id && state2.pages.some((candidate) => candidate.uid !== page.uid && candidate.id === page.id));
    const idField = els.metadata.elements.id;
    idField.classList.toggle("invalid", duplicateId);
    els.idError.hidden = !duplicateId;
    updateFileStatus();
  }
  function setInspectorTab(tab) {
    docksApi?.reveal(tab);
  }
  var inCommandMenu = (event) => event.composedPath().some((node) => node.matches?.(".command-menu, [data-menu-panel]"));
  function closeCommandMenus(except = null) {
    if (except !== "query-builder" && !els.queryBuilder.hidden) cancelPageQueryPreview();
    for (const button of els.menuButtons) {
      const isExcept = button.dataset.menu === except;
      button.setAttribute("aria-expanded", isExcept ? "true" : "false");
      button.classList.toggle("active", isExcept);
    }
    for (const panel of els.menuPanels) panel.hidden = panel.dataset.menuPanel !== except;
  }
  function toggleCommandMenu(menu) {
    const panel = els.menuPanels.find((candidate) => candidate.dataset.menuPanel === menu);
    const isOpen = panel && !panel.hidden;
    closeCommandMenus(isOpen ? null : menu);
    if (!isOpen && menu === "tag-picker") {
      els.tagSearch.value = "";
      renderTagEditor(activePage());
      els.tagSearch.focus();
    }
    if (!isOpen && menu === "config-lang-picker") {
      els.configLangSearch.value = "";
      renderConfigLangEditor(state2.config);
      els.configLangSearch.focus();
    }
    if (!isOpen && menu === "emoji") {
      emojiPicker.load().then(() => {
        if (!panel.hidden) els.emojiSearch.focus();
      }).catch(() => {
      });
    }
  }
  var queryField = (name) => els.queryBuilder.elements.namedItem(name);
  function fillQueryOptions(list, items) {
    list.replaceChildren(...items.map((item) => {
      const option = document.createElement("option");
      option.value = typeof item === "string" ? item : item.value;
      if (typeof item !== "string" && item.label) option.label = item.label;
      return option;
    }));
  }
  function populateQuerySuggestions() {
    fillQueryOptions(
      els.queryTagOptions,
      uniqueList(state2.pages.flatMap((page) => parseTags(page.tags))).sort((a, b) => a.localeCompare(b))
    );
    fillQueryOptions(
      els.queryParentOptions,
      state2.pages.filter((page) => page.id).map((page) => ({ value: page.id, label: page.title })).sort((a, b) => a.label.localeCompare(b.label))
    );
    fillQueryOptions(
      els.queryTrailOptions,
      uniqueList(state2.pages.filter((page) => pageKind(state2.pages, page) !== "Simple folder").flatMap((page) => String(page.trail || "").split(","))).sort((a, b) => a.localeCompare(b))
    );
  }
  function queryBuilderOptions() {
    return {
      tag: queryField("tag").value,
      parent: queryField("parent").value,
      trail: queryField("trail").value,
      text: queryField("text").value,
      current: queryField("current").checked ? "" : "false",
      sort: queryField("sort").value,
      limit: queryField("limit").value,
      empty: queryField("empty").value,
      view: queryField("view").value || "list"
    };
  }
  function renderQueryBuilder() {
    const source = serializePageQuery(queryBuilderOptions());
    els.querySyntax.textContent = source;
    previewPageQuery(source);
  }
  function previewPageQuery(source = serializePageQuery(queryBuilderOptions())) {
    if (queryOriginalContent == null) return false;
    const page = state2.pages.find((candidate) => candidate.uid === queryPageUid);
    const range = queryEditRange || querySelection;
    if (!page || !range) return false;
    const replacement = queryEditRange ? source : `

${source}

`;
    page.content = queryOriginalContent.slice(0, range.start) + replacement + queryOriginalContent.slice(range.end);
    if (page.uid === state2.activeUid) {
      els.raw.value = page.content;
      els.compareRaw.value = page.content;
      const sourceStart = range.start + (queryEditRange ? 0 : 2);
      queryTarget?.setSelectionRange(sourceStart, sourceStart + source.length);
      schedulePreviewRefresh();
    }
    return true;
  }
  function cancelPageQueryPreview() {
    if (queryOriginalContent == null) return;
    const page = state2.pages.find((candidate) => candidate.uid === queryPageUid);
    if (page) page.content = queryOriginalContent;
    if (page?.uid === state2.activeUid) {
      els.raw.value = page.content;
      els.compareRaw.value = page.content;
      queryTarget?.setSelectionRange(querySelection.start, querySelection.end);
      schedulePreviewRefresh();
    }
    queryOriginalContent = null;
    queryPageUid = null;
    if (state2.dirty) scheduleSnapshot();
  }
  function openPageQueryBuilder(issue = null) {
    if (!els.queryBuilder.hidden) {
      closeCommandMenus();
      queryTarget?.focus();
      return;
    }
    queryTarget = activeTextTarget();
    const page = activePage();
    queryOriginalContent = page?.content ?? "";
    queryPageUid = page?.uid ?? null;
    clearTimeout(snapshotTimer);
    querySelection = {
      start: queryTarget.selectionStart,
      end: queryTarget.selectionEnd
    };
    const existing = issue?.start != null ? { start: issue.start, end: issue.end, options: issue.options || {} } : pageQueryAtCursor(queryTarget.value, queryTarget.selectionStart);
    queryEditRange = existing ? { start: existing.start, end: existing.end } : null;
    populateQuerySuggestions();
    els.queryBuilder.reset();
    const options = existing?.options || {};
    for (const name of ["tag", "parent", "trail", "text", "sort", "limit", "empty"])
      queryField(name).value = options[name] || "";
    const view = ["list", "cards", "table", "timeline", "graph"].includes(options.view) ? options.view : "list";
    els.queryBuilder.querySelector(`[name="view"][value="${view}"]`).checked = true;
    queryField("current").checked = options.current !== "false";
    els.querySubmit.textContent = existing ? "Update query" : "Insert query";
    closeCommandMenus("query-builder");
    renderQueryBuilder();
    requestAnimationFrame(() => queryField("tag").focus());
  }
  function closePageQueryBuilder() {
    closeCommandMenus();
    queryTarget?.focus();
  }
  function insertPageQuery() {
    const target = queryTarget?.isConnected ? queryTarget : activeTextTarget();
    const page = state2.pages.find((candidate) => candidate.uid === queryPageUid);
    const source = serializePageQuery(queryBuilderOptions());
    const range = queryEditRange || querySelection || {
      start: target.selectionStart,
      end: target.selectionEnd
    };
    if (!previewPageQuery(source)) return;
    const sourceStart = range.start + (queryEditRange ? 0 : 2);
    target.focus();
    target.setSelectionRange(sourceStart, sourceStart + source.length);
    if (page) {
      page.updated = todayIso2();
      if (page.uid === state2.activeUid) els.metadata.elements.updated.value = page.updated;
    }
    queryOriginalContent = null;
    queryPageUid = null;
    markDirty();
    renderEditors(false);
    closeCommandMenus();
  }
  function openMathBuilder(display = false) {
    if (!els.mathBuilder.hidden) {
      closeCommandMenus();
      mathTarget?.focus();
      return;
    }
    mathTarget = activeTextTarget();
    const existing = mathTarget.selectionStart === mathTarget.selectionEnd ? mathAtCursor(mathTarget.value, mathTarget.selectionStart) : null;
    mathExisting = existing;
    mathRange = existing ? { start: existing.start, end: existing.end } : { start: mathTarget.selectionStart, end: mathTarget.selectionEnd };
    els.mathSubmit.textContent = existing ? "Update formula" : "Insert formula";
    closeCommandMenus("math-builder");
    mathPanel.set(
      existing ? existing.latex : mathTarget.value.slice(mathRange.start, mathRange.end).trim(),
      existing ? existing.display : display
    );
    requestAnimationFrame(() => els.mathInput.focus());
  }
  function insertMath() {
    const { latex, display } = mathPanel.get();
    if (!latex) return;
    const target = mathTarget?.isConnected ? mathTarget : activeTextTarget();
    const source = wrapMath(latex, display);
    target.focus();
    target.setSelectionRange(mathRange.start, mathRange.end);
    insertTextIntoTextarea(target, display && !mathExisting?.display ? `

${source}

` : source);
    closeCommandMenus();
    updateMathToolbar();
    updateMermaidToolbar();
  }
  function openMermaidBuilder() {
    if (!els.mermaidBuilder.hidden) {
      closeCommandMenus();
      diagramTarget?.focus();
      return;
    }
    diagramTarget = activeTextTarget();
    const existing = mermaidAtCursor(diagramTarget.value, diagramTarget.selectionStart);
    diagramEditing = Boolean(existing);
    diagramRange = existing ? { start: existing.start, end: existing.end } : { start: diagramTarget.selectionStart, end: diagramTarget.selectionEnd };
    els.mermaidSubmit.textContent = diagramEditing ? "Update diagram" : "Insert diagram";
    closeCommandMenus("mermaid-builder");
    mermaidPanel.set(
      existing ? existing.diagram : diagramTarget.value.slice(diagramRange.start, diagramRange.end).trim() || MERMAID_STARTER
    );
    requestAnimationFrame(() => els.mermaidInput.focus());
  }
  function insertMermaid() {
    const diagram = mermaidPanel.get();
    if (!diagram) return;
    const target = diagramTarget?.isConnected ? diagramTarget : activeTextTarget();
    const source = wrapMermaid(diagram);
    target.focus();
    target.setSelectionRange(diagramRange.start, diagramRange.end);
    insertTextIntoTextarea(target, diagramEditing ? source : `

${source}

`);
    closeCommandMenus();
    updateMermaidToolbar();
  }
  function initTableGridPicker() {
    const cells = [];
    for (let row = 1; row <= 10; row++) {
      for (let col = 1; col <= 10; col++) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.tableRows = String(row);
        button.dataset.tableCols = String(col);
        button.title = `${col} columns x ${row} rows`;
        button.addEventListener("mouseenter", () => {
          for (const cell of cells) {
            const active = Number(cell.dataset.tableRows) <= row && Number(cell.dataset.tableCols) <= col;
            cell.classList.toggle("active", active);
          }
          els.tableGridLabel.textContent = `${col} x ${row}`;
        });
        cells.push(button);
      }
    }
    els.tableGridPicker.replaceChildren(...cells);
    els.tableGridPicker.addEventListener("mouseleave", () => {
      for (const cell of cells) cell.classList.remove("active");
      els.tableGridLabel.textContent = "Select table size";
    });
  }
  function currentTheme() {
    return document.documentElement.dataset.theme === "light" ? "light" : "dark";
  }
  function applyEditorTheme(theme) {
    const root2 = document.documentElement;
    root2.classList.add("theme-transition");
    void root2.offsetWidth;
    root2.dataset.theme = theme;
    clearTimeout(themeTransitionTimer);
    themeTransitionTimer = setTimeout(() => root2.classList.remove("theme-transition"), 220);
    for (const frame of [els.compareRendered, els.rendered])
      frame.contentWindow?.postMessage({ type: "km-editor-theme", theme }, "*");
    if (!els.mermaidBuilder.hidden) mermaidPanel.refresh();
  }
  function makeBundleUrl() {
    const url = URL.createObjectURL(new Blob([serializeBundle(state2)], { type: "text/markdown" }));
    const oldUrl = previewUrl;
    previewUrl = url;
    if (oldUrl) setTimeout(() => URL.revokeObjectURL(oldUrl), 1e4);
    return url;
  }
  function contentPreviewUrl(page) {
    const config = normalizeConfig(state2.config);
    const params = new URLSearchParams({
      md: makeBundleUrl(),
      page: page?.id || "home",
      theme: currentTheme(),
      allowJs: config.ALLOW_JS_FROM_MD === "true" ? "true" : "false",
      lang: config.LANG,
      title: config.TITLE,
      accent: config.ACCENT,
      langs: config.LANGS.join(","),
      cache: config.CACHE_MD
    });
    return `src/preview/content.html?${params}`;
  }
  function schedulePreviewRefresh() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => renderPreviewFrames(), 120);
  }
  function previewConfigSignature() {
    const config = normalizeConfig(state2.config);
    return JSON.stringify([
      config.LANG,
      config.TITLE,
      config.ACCENT,
      config.LANGS,
      config.CACHE_MD,
      config.ALLOW_JS_FROM_MD,
      config.CUSTOM_EMOJI
    ]);
  }
  function renderPreviewFrames() {
    const page = activePage();
    if (!page || pageKind(state2.pages, page) === "Simple folder") return;
    globalThis.kmEditorCustomEmoji = normalizeConfig(state2.config).CUSTOM_EMOJI;
    const signature = previewConfigSignature();
    const configChanged = signature !== previewSignature;
    previewSignature = signature;
    const frames = [];
    if (state2.mode === "rendered") frames.push(els.rendered);
    if (state2.mode === "compare") frames.push(els.compareRendered);
    for (const frame of frames) {
      if (!configChanged && readyPreviewFrames.has(frame)) {
        frame.contentWindow?.postMessage({
          type: "km-editor-content",
          markdown: serializeBundle(state2),
          pageId: page.id
        }, "*");
        continue;
      }
      readyPreviewFrames.delete(frame);
      frame.src = contentPreviewUrl(page);
    }
  }
  function readFrameSelection(frame) {
    try {
      return cleanText(frame.contentWindow?.getSelection?.().toString());
    } catch {
      return "";
    }
  }
  function readPreviewSelection() {
    return readFrameSelection(els.compareRendered) || readFrameSelection(els.rendered) || lastPreviewSelection;
  }
  function rememberPreviewSelection() {
    lastPreviewSelection = readFrameSelection(els.compareRendered) || readFrameSelection(els.rendered);
  }
  function watchPreviewSelection(frame) {
    frame.addEventListener("load", () => {
      try {
        const doc = frame.contentDocument;
        if (!doc) return;
        const remember = () => {
          const selection = cleanText(frame.contentWindow?.getSelection?.().toString());
          if (selection) lastPreviewSelection = selection;
        };
        doc.addEventListener("selectionchange", remember);
        doc.addEventListener("mouseup", remember);
        doc.addEventListener("keyup", remember);
        syncPreviewSource();
      } catch {
      }
    });
  }
  function syncPreviewSource(event) {
    const textarea = event?.currentTarget?.tagName === "TEXTAREA" ? event.currentTarget : activeTextTarget();
    if (!textarea) return;
    const line = textarea.value.slice(0, textarea.selectionStart).split("\n").length - 1;
    for (const frame of [els.compareRendered, els.rendered])
      frame.contentWindow?.postMessage({
        type: "km-editor-source-line",
        pageId: activePage()?.id,
        line
      }, "*");
  }
  function jumpToSourceLine(line) {
    if (state2.mode === "rendered") setMode("compare");
    const textarea = state2.mode === "raw" ? els.raw : els.compareRaw;
    const lines = textarea.value.split("\n");
    const safeLine = Math.max(0, Math.min(lines.length - 1, Number(line) || 0));
    const start = lines.slice(0, safeLine).join("\n").length + (safeLine ? 1 : 0);
    textarea.focus();
    textarea.setSelectionRange(start, start + lines[safeLine].length);
    const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
    textarea.scrollTop = Math.max(0, safeLine * lineHeight - textarea.clientHeight / 3);
    lastTextArea = textarea;
  }
  function jumpToSourceUid(uid2, line) {
    const page = state2.pages.find((candidate) => candidate.uid === uid2);
    if (page && page.uid !== state2.activeUid) {
      closeCommandMenus();
      state2.activeUid = page.uid;
      renderAll(true);
    }
    if (line !== null) jumpToSourceLine(line);
  }
  function jumpToSourceLocation(pageId, line) {
    jumpToSourceUid(state2.pages.find((candidate) => candidate.id === pageId)?.uid, line);
  }
  function revealProblemSource(problem) {
    jumpToSourceUid(problem.pageUid, problem.line);
    const target = activeTextTarget();
    target.focus();
    target.setSelectionRange(problem.start, problem.end);
    return target;
  }
  function rememberTextTarget(event) {
    const target = event.currentTarget;
    if (target?.tagName === "TEXTAREA") lastTextArea = target;
  }
  function renderEditors(forcePreview = false) {
    const page = activePage();
    if (!page) return;
    const simpleFolder = pageKind(state2.pages, page) === "Simple folder";
    if (simpleFolder && state2.mode !== "raw") {
      modeBeforeSimpleFolder || (modeBeforeSimpleFolder = state2.mode);
      setMode("raw");
      return;
    }
    if (!simpleFolder && modeBeforeSimpleFolder) {
      const mode = modeBeforeSimpleFolder;
      modeBeforeSimpleFolder = null;
      if (state2.mode === "raw") {
        setMode(mode);
        return;
      }
    }
    if (simpleFolder && document.activeElement?.matches?.("[data-source-pane] textarea")) {
      document.activeElement.blur();
    }
    if (els.raw.value !== page.content) els.raw.value = page.content;
    if (els.compareRaw.value !== page.content) {
      els.compareRaw.value = page.content;
    }
    els.formatbar.classList.toggle("simple-folder-active", simpleFolder);
    for (const button of els.modeTabs)
      button.hidden = simpleFolder && button.dataset.mode !== "raw";
    els.compareRendered.hidden = simpleFolder;
    const canPreview = Boolean(previewablePage(page));
    els.previewButton.disabled = !canPreview;
    els.previewButton.title = canPreview ? simpleFolder ? "This folder has no article; preview the bundle at a nearby page" : "Preview this bundle in the real KM shell" : "This bundle has no page to preview";
    for (const pane of els.sourcePanes) {
      const textarea = pane.querySelector("textarea");
      pane.classList.toggle("simple-folder", simpleFolder);
      textarea.readOnly = simpleFolder;
      textarea.inert = simpleFolder;
      textarea.tabIndex = simpleFolder ? -1 : 0;
      pane.querySelector("[data-simple-folder-notice]").hidden = !simpleFolder;
    }
    for (const button of els.formatbar.querySelectorAll('[data-tool], [data-menu="table-insert"]'))
      button.disabled = simpleFolder;
    if (forcePreview) renderPreviewFrames();
    else schedulePreviewRefresh();
    updateCodeLanguageNotices();
    updateTableToolbar();
    updateQueryToolbar();
    updateMathToolbar();
    updateMermaidToolbar();
    updateTextHistoryButtons();
  }
  function positionCodeLanguageNotice(textarea, notice, line) {
    const hostRect = notice.parentElement.getBoundingClientRect();
    const textareaRect = textarea.getBoundingClientRect();
    const style = getComputedStyle(textarea);
    const lineHeight = parseFloat(style.lineHeight) || 20;
    const top = textareaRect.top - hostRect.top + (parseFloat(style.paddingTop) || 0) + line * lineHeight - textarea.scrollTop;
    const minTop = textareaRect.top - hostRect.top + 4;
    const maxTop = textareaRect.bottom - hostRect.top - notice.offsetHeight - 4;
    notice.style.visibility = top >= minTop && top <= maxTop ? "visible" : "hidden";
    notice.style.top = `${Math.max(minTop, Math.min(top, maxTop))}px`;
    notice.style.left = `${Math.max(
      textareaRect.left - hostRect.left + 8,
      textareaRect.right - hostRect.left - notice.offsetWidth - 8
    )}px`;
  }
  function updateCodeLanguageNotices() {
    const missing = findMissingCodeLanguages(
      activePage()?.content,
      state2.config?.LANGS
    ).filter((language) => !dismissedCodeLanguages.has(language.module));
    for (const template of els.codeLanguageNotices) {
      const textarea = template.parentElement.querySelector("textarea");
      const notices = [...template.parentElement.querySelectorAll("[data-code-language-notice]")];
      while (notices.length < missing.length) {
        const notice = template.cloneNode(true);
        template.parentElement.append(notice);
        notices.push(notice);
      }
      for (const [index, notice] of notices.entries()) {
        const language = missing[index];
        notice.hidden = !language;
        if (!language || !textarea) continue;
        notice.dataset.codeLanguage = language.module;
        notice.querySelector("[data-code-language-name]").textContent = language.language;
        positionCodeLanguageNotice(textarea, notice, language.line);
      }
    }
  }
  function updateContentFromText(text) {
    const page = activePage();
    if (!setPageContent(page, text)) return;
    const updated = els.metadata.elements.updated;
    if (updated && updated !== document.activeElement) updated.value = page.updated;
    markDirty();
    renderEditors(false);
  }
  function selectedText() {
    const target = activeTextTarget();
    const textareaText = target?.tagName === "TEXTAREA" ? target.value.slice(target.selectionStart, target.selectionEnd) : "";
    return textareaText || readPreviewSelection();
  }
  function activeTextTarget() {
    const active = document.activeElement;
    if ([els.raw, els.compareRaw].includes(active)) return active;
    if (state2.mode === "raw") return els.raw;
    if (state2.mode === "compare") return els.compareRaw;
    if (lastTextArea?.isConnected) return lastTextArea;
    return els.raw;
  }
  function updateTextHistoryButtons() {
    for (const button of els.historyButtons) {
      const stack = button.dataset.historyAction === "undo" ? editHistory.undo : editHistory.redo;
      button.disabled = !stack.length;
    }
  }
  function insertTextIntoTextarea(textarea, text, selectStart = null, selectEnd = null) {
    if (!textarea || textarea.readOnly) return false;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.focus();
    if (!document.execCommand("insertText", false, text)) {
      textarea.value = `${textarea.value.slice(0, start)}${text}${textarea.value.slice(end)}`;
      updateContentFromText(textarea.value);
    }
    const cursorStart = selectStart == null ? start + text.length : start + selectStart;
    const cursorEnd = selectEnd == null ? cursorStart : start + selectEnd;
    textarea.setSelectionRange(cursorStart, cursorEnd);
    return true;
  }
  function replaceSelection(text, selectStart = null, selectEnd = null) {
    const target = activeTextTarget();
    insertTextIntoTextarea(target, text, selectStart, selectEnd);
  }
  function wrapSelection(open, close, placeholder) {
    const value = selectedText() || placeholder;
    replaceSelection(`${open}${value}${close}`, open.length, open.length + value.length);
  }
  function insertBlock(snippet) {
    replaceSelection(`

${snippet}

`, 2, 2 + snippet.length);
  }
  function tableRow(cells) {
    return `| ${cells.join(" | ")} |`;
  }
  function tableDivider(alignments) {
    const token = (alignment) => alignment === "left" ? ":---" : alignment === "center" ? ":---:" : alignment === "right" ? "---:" : "---";
    return tableRow(alignments.map(token));
  }
  function markdownTable(bodyRows, columns) {
    const cols = Math.max(1, Math.min(10, columns));
    const rows = Math.max(1, Math.min(10, bodyRows));
    const header = Array.from({ length: cols }, (_, index) => `Column ${index + 1}`);
    const blankRow = Array.from({ length: cols }, () => "Value");
    return [
      tableRow(header),
      tableDivider(Array.from({ length: cols }, () => "")),
      ...Array.from({ length: rows }, () => tableRow(blankRow))
    ].join("\n");
  }
  function insertTable(bodyRows, columns) {
    insertBlock(markdownTable(bodyRows, columns));
    updateTableToolbar();
  }
  function lineInfo(text, index) {
    const before = text.slice(0, index);
    const line = before.split("\n").length - 1;
    const lineStart = before.lastIndexOf("\n") + 1;
    return { line, lineStart };
  }
  function isTableLikeLine(line) {
    return line.includes("|") && line.trim() !== "";
  }
  function isDividerLine(line) {
    const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    const cells = trimmed.split("|").map((cell) => cell.trim());
    return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
  }
  function parseTableRow(line) {
    return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
  }
  function parseAlignments(line, columns) {
    const cells = parseTableRow(line);
    return Array.from({ length: columns }, (_, index) => {
      const cell = cells[index] || "---";
      const left = cell.startsWith(":");
      const right = cell.endsWith(":");
      return left && right ? "center" : right ? "right" : left ? "left" : "";
    });
  }
  function normalizeTableRows(rows, columns) {
    return rows.map((row) => {
      const next = row.slice(0, columns);
      while (next.length < columns) next.push("");
      return next;
    });
  }
  function tableAtCursor(textarea = activeTextTarget()) {
    if (state2.mode === "rendered") return null;
    if (!textarea || textarea.tagName !== "TEXTAREA") return null;
    const lines = textarea.value.split("\n");
    const { line, lineStart } = lineInfo(textarea.value, textarea.selectionStart);
    if (!isTableLikeLine(lines[line] || "")) return null;
    let start = line;
    while (start > 0 && isTableLikeLine(lines[start - 1])) start--;
    let end = line;
    while (end < lines.length - 1 && isTableLikeLine(lines[end + 1])) end++;
    const rawRows = lines.slice(start, end + 1);
    const dividerOffset = rawRows.findIndex(isDividerLine);
    if (dividerOffset < 1) return null;
    const columns = Math.max(...rawRows.map((row) => parseTableRow(row).length));
    const rows = normalizeTableRows(rawRows.map(parseTableRow), columns);
    const alignments = parseAlignments(rawRows[dividerOffset], columns);
    const offsetInLine = textarea.selectionStart - lineStart;
    const beforeCursor = (lines[line] || "").slice(0, offsetInLine);
    const leadingPipe = (lines[line] || "").trimStart().startsWith("|") ? 1 : 0;
    const column = Math.max(0, Math.min(columns - 1, (beforeCursor.match(/\|/g)?.length || 0) - leadingPipe));
    return {
      textarea,
      lines,
      start,
      end,
      line,
      row: line - start,
      divider: dividerOffset,
      rows,
      alignments,
      columns,
      column
    };
  }
  function serializeTable(table) {
    return table.rows.map(
      (row, index) => index === table.divider ? tableDivider(table.alignments) : tableRow(row)
    );
  }
  function replaceTable(table) {
    const start = table.lines.slice(0, table.start).join("\n").length + (table.start ? 1 : 0);
    const end = table.lines.slice(0, table.end + 1).join("\n").length;
    table.textarea.setSelectionRange(start, end);
    insertTextIntoTextarea(table.textarea, serializeTable(table).join("\n"));
    const targetLine = Math.min(table.start + table.row, table.start + table.rows.length - 1);
    const index = table.textarea.value.split("\n").slice(0, targetLine).join("\n").length + (targetLine ? 1 : 0);
    table.textarea.setSelectionRange(index, index);
    updateTableToolbar();
  }
  function runTableAction(action) {
    const table = tableAtCursor();
    if (!table) return false;
    const row = table.row;
    const column = table.column;
    const bodyRow = row > table.divider;
    if (action === "row-add-after") {
      const insertAt = row <= table.divider ? table.divider + 1 : row + 1;
      table.rows.splice(insertAt, 0, Array.from({ length: table.columns }, () => ""));
      if (insertAt <= table.divider) table.divider++;
      table.row = insertAt;
    } else if (action === "row-delete" && bodyRow && table.rows.length > table.divider + 2) {
      table.rows.splice(row, 1);
    } else if (action === "row-up" && bodyRow && row > table.divider + 1) {
      [table.rows[row - 1], table.rows[row]] = [table.rows[row], table.rows[row - 1]];
      table.row--;
    } else if (action === "row-down" && bodyRow && row < table.rows.length - 1) {
      [table.rows[row + 1], table.rows[row]] = [table.rows[row], table.rows[row + 1]];
      table.row++;
    } else if (action === "col-add-after") {
      for (const rowCells of table.rows) rowCells.splice(column + 1, 0, "");
      table.alignments.splice(column + 1, 0, "");
      table.columns++;
      table.column++;
    } else if (action === "col-delete" && table.columns > 1) {
      for (const rowCells of table.rows) rowCells.splice(column, 1);
      table.alignments.splice(column, 1);
      table.columns--;
      table.column = Math.min(column, table.columns - 1);
    } else if (action === "col-left" && column > 0) {
      for (const rowCells of table.rows) [rowCells[column - 1], rowCells[column]] = [rowCells[column], rowCells[column - 1]];
      [table.alignments[column - 1], table.alignments[column]] = [table.alignments[column], table.alignments[column - 1]];
      table.column--;
    } else if (action === "col-right" && column < table.columns - 1) {
      for (const rowCells of table.rows) [rowCells[column + 1], rowCells[column]] = [rowCells[column], rowCells[column + 1]];
      [table.alignments[column + 1], table.alignments[column]] = [table.alignments[column], table.alignments[column + 1]];
      table.column++;
    } else if (action.startsWith("align-")) {
      table.alignments[column] = action.slice("align-".length);
    } else {
      return false;
    }
    replaceTable(table);
    return true;
  }
  function updateTableToolbar() {
    const table = tableAtCursor();
    els.tableToolbar.hidden = !table;
  }
  function updateQueryToolbar() {
    const textarea = activeTextTarget();
    const query = state2.mode !== "rendered" && textarea?.tagName === "TEXTAREA" && pageQueryAtCursor(textarea.value, textarea.selectionStart);
    els.queryToolbar.hidden = !query;
  }
  function updateMathToolbar() {
    const textarea = activeTextTarget();
    const math = state2.mode !== "rendered" && textarea?.tagName === "TEXTAREA" && mathAtCursor(textarea.value, textarea.selectionStart);
    els.mathToolbar.hidden = !math;
  }
  function updateMermaidToolbar() {
    const textarea = activeTextTarget();
    const diagram = state2.mode !== "rendered" && textarea?.tagName === "TEXTAREA" && mermaidAtCursor(textarea.value, textarea.selectionStart);
    els.mermaidToolbar.hidden = !diagram;
  }
  function prefixLines(prefix, placeholder) {
    const value = selectedText() || placeholder;
    const prefixed = value.split(/\r?\n/).map((line) => `${prefix}${line.replace(/^#{1,6}\s+/, "")}`).join("\n");
    replaceSelection(prefixed, prefix.length, prefixed.length);
  }
  function nextFootnoteNumber(content) {
    const numbers = [...content.matchAll(/\[\^(\d+)\]/g)].map(([, number]) => Number(number));
    return Math.max(0, ...numbers) + 1;
  }
  async function addFootnote() {
    const page = activePage();
    if (!page) return;
    const number = nextFootnoteNumber(page.content);
    const selection = selectedText();
    replaceSelection(`${selection || "Text"}[^${number}]`);
    setPageContent(page, `${page.content.trim()}

[^${number}]: Footnote text.`);
    markDirty();
    renderEditors(true);
  }
  async function addGlossary() {
    rememberPreviewSelection();
    const entry = await showGlossaryModal(selectedText());
    if (!entry?.term) return;
    addGlossaryTerm(state2, entry.term, entry.definition);
    markDirty();
    renderAll(true);
  }
  async function addYouTube() {
    const url = await showPrompt("Embed YouTube video", "YouTube link", selectedText());
    if (!url) return;
    const embed = youtubeEmbedURL(url);
    if (!embed) {
      showMessage("Invalid YouTube link", "Use a YouTube watch, share, Shorts, Live, or embed link.");
      return;
    }
    insertBlock(`<iframe title="YouTube video" src="${embed}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`);
  }
  async function addIframe() {
    const url = await showPrompt("Embed iframe", "Page URL", selectedText());
    if (!url?.trim()) return;
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "Embedded page");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.setAttribute("src", url.trim());
    insertBlock(iframe.outerHTML);
  }
  async function linkPage() {
    const link = await showLinkModal(state2, selectedText());
    if (!link) return;
    replaceSelection(`[${link.text}](${link.route})`);
  }
  function addPage(kind) {
    const current = activePage();
    const parent = current?.id || "";
    const page = createPage(state2.pages, kind, parent);
    const index = state2.pages.findIndex((candidate) => candidate.uid === current?.uid);
    state2.pages.splice(index + 1, 0, page);
    state2.activeUid = page.uid;
    markDirty();
    renderAll(true);
  }
  function fullPreviewFrameUrl(page) {
    globalThis.kmEditorCustomEmoji = normalizeConfig(state2.config).CUSTOM_EMOJI;
    const url = URL.createObjectURL(new Blob([serializeBundle(state2)], { type: "text/markdown" }));
    const oldUrl = fullPreviewUrl;
    fullPreviewUrl = url;
    if (oldUrl) setTimeout(() => URL.revokeObjectURL(oldUrl), 1e4);
    const config = normalizeConfig(state2.config);
    const params = new URLSearchParams({
      md: url,
      route: pageRoute(state2.pages, page),
      theme: currentTheme(),
      allowJs: config.ALLOW_JS_FROM_MD === "true" ? "true" : "false",
      lang: config.LANG,
      title: config.TITLE,
      accent: config.ACCENT,
      langs: config.LANGS.join(","),
      cache: config.CACHE_MD
    });
    return `src/preview/full.html?${params}`;
  }
  function openFullPreview() {
    const page = previewablePage();
    if (!page) return;
    els.fullPreview.src = fullPreviewFrameUrl(page);
    els.previewOverlay.hidden = false;
  }
  function closeFullPreview() {
    els.previewOverlay.hidden = true;
    els.fullPreview.src = "about:blank";
  }
  async function replaceBundleFromSource(source, fileName = state2.fileName, fileHandle = state2.fileHandle, preserveHistory = false) {
    const parsed = parseBundle(source);
    setStateFromBundle(parsed, {
      fileName,
      fileHandle,
      config: preserveHistory ? { ...state2.config, MD: fileName } : { MD: fileName },
      dirty: true
    }, preserveHistory);
  }
  async function openFile() {
    try {
      const file = await openMarkdownFile(els.fileInput);
      const parsed = parseBundle(file.text);
      setStateFromBundle(parsed, {
        fileName: file.fileName,
        fileHandle: file.fileHandle,
        config: { MD: file.fileName },
        dirty: false
      });
    } catch (error) {
      if (error?.name !== "AbortError") showMessage("Open failed", error.message || String(error));
    }
  }
  async function openDocsExample() {
    if (state2.dirty && !await showConfirm("Replace draft", "Load the KM documentation example and discard unsaved changes?", "Load example")) return;
    try {
      const response = await fetch(new URL("../_content_examples/km-docs.md", location.href));
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
      const fileName = "km-docs.md";
      setStateFromBundle(parseBundle(await response.text()), {
        fileName,
        fileHandle: null,
        config: { MD: fileName, TITLE: "KM Editor manual" },
        dirty: false
      });
    } catch (error) {
      showMessage("Example failed to load", error.message || String(error));
    }
  }
  async function openLink() {
    const url = await showPrompt("Open from URL", "Markdown or HackMD URL");
    if (!url) return;
    try {
      const sourceUrl = markdownSourceUrl(url);
      const response = await fetch(sourceUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
      const source = await response.text();
      const fileName = safeFilePart(new URL(sourceUrl, location.href).pathname.split("/").pop(), "linked-bundle.md");
      setStateFromBundle(parseBundle(source), {
        fileName: fileName.endsWith(".md") ? fileName : `${fileName}.md`,
        fileHandle: null,
        config: { MD: sourceUrl },
        dirty: false
      });
    } catch (error) {
      showMessage("Open link failed", error.message || String(error));
    }
  }
  var githubSha = "";
  function githubSettings() {
    try {
      return JSON.parse(localStorage.getItem("km-editor-github")) || null;
    } catch {
      return null;
    }
  }
  function rememberGithubSettings(settings) {
    localStorage.setItem("km-editor-github", JSON.stringify(settings));
  }
  function rawGithubUrl({ repo, branch, path }) {
    return `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
  }
  async function openFromGithub() {
    const settings = await showGitHubModal(githubSettings(), "Load");
    if (!settings) return;
    rememberGithubSettings(settings);
    try {
      const file = await githubLoad(settings);
      githubSha = file.sha;
      setStateFromBundle(parseBundle(file.text), {
        fileName: settings.path.split("/").pop(),
        fileHandle: null,
        config: { MD: rawGithubUrl(settings) },
        dirty: false
      });
    } catch (error) {
      showMessage("GitHub load failed", error.message || String(error));
    }
  }
  async function pushToGithub(settings, sha) {
    githubSha = await githubSave({
      ...settings,
      sha,
      text: serializeBundle(state2),
      message: `Update ${settings.path} from km-editor`
    });
    state2.dirty = false;
    updateFileStatus();
    showMessage("Saved to GitHub", `Pushed ${settings.path} to ${settings.repo} (${settings.branch}).`);
  }
  async function saveToGithub() {
    let settings = githubSettings();
    if (!settings?.token) {
      settings = await showGitHubModal(settings, "Save");
      if (!settings) return;
      rememberGithubSettings(settings);
    }
    if (!githubSha) {
      const overwrite = await showConfirm(
        "Overwrite remote file",
        `Nothing was loaded from GitHub this session. Push your local content over ${settings.path} in ${settings.repo}?`,
        "Overwrite remote",
        true
      );
      if (!overwrite) return;
      try {
        githubSha = (await githubLoad(settings)).sha;
      } catch {
      }
    }
    try {
      await pushToGithub(settings, githubSha);
    } catch (error) {
      if (!error.conflict) {
        showMessage("GitHub save failed", error.message || String(error));
        return;
      }
      const overwrite = await showConfirm(
        "Remote file changed",
        "The GitHub file changed since you loaded it (maybe a HackMD push). Overwrite the remote version with your local content?",
        "Overwrite remote",
        true
      );
      if (!overwrite) return;
      try {
        const remote = await githubLoad(settings);
        await pushToGithub(settings, remote.sha);
      } catch (retryError) {
        showMessage("GitHub save failed", retryError.message || String(retryError));
      }
    }
  }
  async function openKmPage() {
    const url = await showPrompt("Open from existing KM page", "Published KM page URL", "https://");
    if (!url) return;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
      const doc = new DOMParser().parseFromString(await response.text(), "text/html");
      const configNode = doc.getElementById("km-config");
      if (!configNode) throw new Error("No km-config block found. Is this a KM page?");
      const config = JSON.parse(configNode.textContent);
      const inline = doc.getElementById("km-inline-md");
      let markdown;
      let mdSource = cleanText(config.MD);
      if (inline && inline.textContent.trim()) {
        markdown = inline.textContent.replace(/<\\\/script/gi, "<\/script");
      } else {
        if (!mdSource) throw new Error("KM page has no markdown source to load.");
        mdSource = new URL(mdSource, url).href;
        const mdResponse = await fetch(mdSource);
        if (!mdResponse.ok) throw new Error(`Could not fetch markdown (HTTP ${mdResponse.status}).`);
        markdown = await mdResponse.text();
      }
      const slug = new URL(url, location.href).pathname.split("/").filter(Boolean).pop();
      setStateFromBundle(parseBundle(markdown), {
        fileName: `${safeFilePart(slug || config.TITLE, "km-page")}.md`,
        fileHandle: null,
        config: { ...config, MD: mdSource },
        dirty: false
      });
    } catch (error) {
      showMessage("Open KM page failed", error.message || String(error));
    }
  }
  function exportBundleSource() {
    downloadMarkdown(serializeBundle(state2), state2.fileName || "km-bundle.md");
    state2.dirty = false;
    updateFileStatus();
  }
  async function writeDirectoryFile(directory, name, value) {
    const handle = await directory.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(value);
    await writable.close();
  }
  async function unusedAssetName(directory, rawName, used) {
    const dot = rawName.lastIndexOf(".");
    const stem = dot > 0 ? rawName.slice(0, dot) : rawName;
    const extension = dot > 0 ? rawName.slice(dot) : "";
    for (let number = 1; ; number++) {
      const name = number === 1 ? rawName : `${stem}-${number}${extension}`;
      if (used.has(name)) continue;
      try {
        await directory.getFileHandle(name);
      } catch {
        used.add(name);
        return name;
      }
    }
  }
  async function collectRemoteAssets() {
    if (!window.showDirectoryPicker) {
      await showMessage("Asset collection unavailable", "This browser cannot write an assets folder. Use the editor in Brave or Chrome.");
      return;
    }
    const assets = /* @__PURE__ */ new Map();
    for (const page of state2.pages) {
      for (const url of remoteAssetUrls(page.content)) {
        if (!assets.has(url)) assets.set(url, []);
        assets.get(url).push(page);
      }
    }
    if (!assets.size) {
      await showMessage("No remote assets", "No remote images or downloadable attachments were found.");
      return;
    }
    try {
      const root2 = await window.showDirectoryPicker({ mode: "readwrite" });
      const directory = await root2.getDirectoryHandle("assets", { create: true });
      const used = /* @__PURE__ */ new Set();
      const sources = [];
      const failed = [];
      for (const [url, pages] of assets) {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          const pathname = decodeURIComponent(new URL(url).pathname);
          let name = safeFilePart(pathname.split("/").pop(), "asset");
          if (!/\.[a-z0-9]{2,5}$/i.test(name)) {
            const extension = {
              "image/jpeg": ".jpg",
              "image/png": ".png",
              "image/svg+xml": ".svg",
              "image/webp": ".webp",
              "application/pdf": ".pdf"
            }[blob.type] || "";
            name += extension;
          }
          name = await unusedAssetName(directory, name, used);
          await writeDirectoryFile(directory, name, blob);
          const localPath = `assets/${name}`;
          for (const page of pages)
            setPageContent(page, replaceRemoteAsset(page.content, url, localPath));
          sources.push(`- \`${name}\` - ${url} - License: verify at source`);
        } catch (error) {
          failed.push(`${url} (${error.message || error})`);
        }
      }
      if (sources.length) {
        const sourceHandle = await directory.getFileHandle("SOURCES.md", { create: true });
        const existing = await (await sourceHandle.getFile()).text();
        await writeDirectoryFile(
          directory,
          "SOURCES.md",
          `${existing.trim() ? `${existing.trim()}

` : ""}## Collected ${(/* @__PURE__ */ new Date()).toISOString()}

${sources.join("\n")}
`
        );
        markDirty();
        renderAll(true);
      }
      await showMessage(
        "Asset collection complete",
        `${sources.length} saved and rewritten.${failed.length ? ` ${failed.length} failed: ${failed.join("; ")}` : ""}`
      );
    } catch (error) {
      if (error?.name !== "AbortError") await showMessage("Asset collection failed", error.message || String(error));
    }
  }
  async function copyConfigScript() {
    const source = configScript();
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API is not available.");
      await navigator.clipboard.writeText(source);
      showMessage("KM config copied", "Paste the copied script into the KM HTML shell in place of the existing km-config block.");
    } catch {
      showSourceModal("Copy KM config HTML", source, "Close");
    }
  }
  async function loadOneFileTemplate() {
    if (oneFileTemplate) return oneFileTemplate;
    const response = await fetch(new URL("../km/build/online-onefile/km-online-onefile.html", location.href));
    if (!response.ok && response.status !== 0) throw new Error(`Could not load the KM one-file template (HTTP ${response.status}).`);
    oneFileTemplate = await response.text();
    return oneFileTemplate;
  }
  async function markdownDataUrl(markdown) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("Could not embed the Markdown."));
      reader.readAsDataURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    });
  }
  async function downloadOneFile(mode) {
    const button = $(`[data-action="download-${mode}-onefile"]`);
    const label = button.textContent;
    button.disabled = true;
    button.textContent = "Building...";
    try {
      const config = normalizeConfig(state2.config);
      if (mode === "online" && !cleanText(config.MD)) throw new Error("Set Markdown source before building an online HTML file.");
      if (mode === "offline") {
        config.MD = await markdownDataUrl(serializeBundle(state2));
        config.CACHE_MD = "0";
      }
      const block = `<script type="application/json" id="km-config">
${JSON.stringify(config, null, 2).replace(/<\/script/gi, "<\\/script")}
<\/script>`;
      const template = await loadOneFileTemplate();
      let html = template.replace(
        /<script type="application\/json" id="km-config">[\s\S]*?<\/script>/i,
        () => block
      );
      if (html === template) throw new Error("The KM one-file template has no config block.");
      html = html.replace(
        /^<!-- Generated by .*? -->/m,
        `<!-- Generated by km-editor (${mode} one-file). -->`
      );
      if (mode === "offline") {
        html = html.replace(
          /<meta name="robots" content="[^"]*">/i,
          '<meta name="robots" content="noindex,nofollow,noarchive">'
        );
      }
      downloadText(
        html,
        `${safeFilePart(config.TITLE, "km")}-${mode}-onefile.html`,
        "text/html;charset=utf-8"
      );
    } catch (error) {
      showMessage("One-file build failed", error.message || String(error));
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }
  async function saveBundle(forceAsk = false) {
    let mode = localStorage.getItem("km-editor-save-mode") || "";
    if (!mode || forceAsk) {
      const choice = await showSaveChoiceModal(Boolean(mode));
      if (!choice) return;
      mode = choice.mode;
      if (choice.remember) localStorage.setItem("km-editor-save-mode", mode);
      else localStorage.removeItem("km-editor-save-mode");
    }
    if (mode === "github") saveToGithub();
    else exportBundleSource();
  }
  async function handleAction(action) {
    if (action === "new-bundle") {
      if (state2.dirty && !await showConfirm("Replace draft", "Create a new starter bundle and discard unsaved changes?", "Replace")) return;
      state2 = createStarterState();
      refreshActiveUid(state2);
      resetEditHistory();
      renderAll(true);
      saveSnapshot();
    } else if (action === "open-file") {
      openFile();
    } else if (action === "open-docs-example") {
      openDocsExample();
    } else if (action === "paste-import") {
      const source = await showSourceModal("Paste KM bundle source", "", "Import");
      if (source != null) replaceBundleFromSource(source, "pasted-bundle.md", null);
    } else if (action === "open-link") {
      openLink();
    } else if (action === "km-page") {
      openKmPage();
    } else if (action === "github-open") {
      openFromGithub();
    } else if (action === "github-save") {
      saveToGithub();
    } else if (action === "collect-assets") {
      collectRemoteAssets();
    } else if (action === "export-file") {
      exportBundleSource();
    } else if (action === "export-page") {
      const page = activePage();
      if (!page || pageKind(state2.pages, page) === "Simple folder") return;
      downloadMarkdown(
        serializeBundle({ preamble: "", pages: [page] }),
        `${safeFilePart(page.id || page.title)}.md`
      );
    } else if (action === "source-modal") {
      const updated = await showSourceModal("Bundle source", serializeBundle(state2), "Replace bundle");
      if (updated != null) replaceBundleFromSource(updated, state2.fileName, state2.fileHandle, true);
    } else if (action === "cheatsheet") {
      showCheatsheet(cheatsheetSections(els.formatbar));
    } else if (action === "config-tab") {
      setInspectorTab("config");
    } else if (action === "dirty-export") {
      saveBundle();
    } else if (action === "save-shortcut") {
      saveBundle(true);
    } else if (action === "copy-config") {
      copyConfigScript();
    } else if (action === "show-config") {
      showSourceModal("KM config HTML", configScript(), "Close");
    } else if (action === "download-offline-onefile") {
      downloadOneFile("offline");
    } else if (action === "download-online-onefile") {
      downloadOneFile("online");
    } else if (action === "preview-km") {
      openFullPreview();
    } else if (action === "toggle-phone-preview") {
      const phone = els.previewOverlay.classList.toggle("phone");
      const button = $("[data-action='toggle-phone-preview']");
      if (button) button.textContent = phone ? "Desktop view" : "Phone view";
      if (!phone) {
        const wrap = $("#km-preview-frame-wrap");
        wrap.style.width = "";
        wrap.style.height = "";
      }
    } else if (action === "return-editor") {
      closeFullPreview();
    } else if (action === "toggle-theme") {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      applyEditorTheme(next);
      localStorage.setItem("km-editor-theme", next);
      updateFileStatus();
    } else if (action === "create-page") {
      addPage("page");
    } else if (action === "create-folder") {
      addPage("folder");
    } else if (action === "create-simple-folder") {
      addPage("simple");
    } else if (action === "duplicate-page") {
      const copy = duplicatePage(state2, activePage());
      if (copy) {
        state2.activeUid = copy.uid;
        markDirty();
        renderAll(true);
      }
    } else if (action === "delete-page") {
      const page = activePage();
      const impact = page && pageImpact(state2, page);
      const details = impact ? [
        impact.children.length ? `${impact.children.length} child page${impact.children.length === 1 ? "" : "s"} will move up.` : "",
        impact.references.length ? `${impact.references.length} page${impact.references.length === 1 ? "" : "s"} will keep broken links or embeds.` : ""
      ].filter(Boolean).join(" ") : "";
      if (page && await showConfirm("Delete page", `Delete "${page.title}"? ${details || "No other pages are affected."}`, "Delete", true)) {
        deletePage(state2, page);
        markDirty();
        renderAll(true);
      }
    } else if (action === "make-simple-folder") {
      await makeSimpleFolder();
    } else if (action === "turn-into-page") {
      turnSimpleFolderIntoPage();
    } else if (action === "rename-page") {
      renameActivePage();
    }
  }
  function renameActivePage() {
    setInspectorTab("metadata");
    const title = els.metadata.elements.title;
    title?.focus();
    title?.select();
  }
  function openTreeContextMenu(event) {
    const row = event.target.closest(".tree-row[data-uid]");
    if (!row) return;
    event.preventDefault();
    closeCommandMenus();
    state2.activeUid = row.dataset.uid;
    renderAll(true);
    const panel = els.menuPanels.find((candidate) => candidate.dataset.menuPanel === "tree-context");
    if (!panel) return;
    closeCommandMenus();
    panel.hidden = false;
    panel.style.left = `${Math.min(event.clientX, window.innerWidth - 190)}px`;
    panel.style.top = `${Math.min(event.clientY, window.innerHeight - panel.offsetHeight - 10)}px`;
  }
  initToolbar(els.formatbar, {
    history: runEditorHistory,
    wrapSelection,
    insertBlock,
    prefixLines,
    linkPage,
    addFootnote,
    addGlossary,
    addYouTube,
    addIframe,
    openPageQueryBuilder,
    openMathBuilder,
    openMermaidBuilder,
    openEmojiPicker: () => toggleCommandMenu("emoji")
  });
  var mermaidPanel = initMermaidPanel({
    form: els.mermaidBuilder,
    templates: els.mermaidTemplates,
    snippets: els.mermaidSnippets,
    input: els.mermaidInput,
    preview: els.mermaidPreview,
    status: els.mermaidStatus,
    themeOf: () => currentTheme() === "light" ? "default" : "dark"
  });
  els.mermaidBuilder.addEventListener("submit", (event) => {
    event.preventDefault();
    insertMermaid();
  });
  els.mermaidBuilder.addEventListener("click", (event) => {
    if (!event.target.closest("[data-mermaid-cancel]")) return;
    closeCommandMenus();
    diagramTarget?.focus();
  });
  els.mermaidToolbar.addEventListener("click", (event) => {
    event.stopPropagation();
    openMermaidBuilder();
  });
  var mathPanel = initMathPanel({
    form: els.mathBuilder,
    tabs: els.mathTabs,
    palette: els.mathPalette,
    input: els.mathInput,
    preview: els.mathPreview,
    status: els.mathStatus
  });
  els.mathBuilder.addEventListener("submit", (event) => {
    event.preventDefault();
    insertMath();
  });
  els.mathBuilder.addEventListener("click", (event) => {
    if (!event.target.closest("[data-math-cancel]")) return;
    closeCommandMenus();
    mathTarget?.focus();
  });
  els.mathToolbar.addEventListener("click", (event) => {
    event.stopPropagation();
    openMathBuilder();
  });
  els.queryBuilder.addEventListener("input", renderQueryBuilder);
  els.queryBuilder.addEventListener("submit", (event) => {
    event.preventDefault();
    insertPageQuery();
  });
  els.queryBuilder.addEventListener("click", (event) => {
    if (event.target.closest("[data-query-cancel]")) closePageQueryBuilder();
  });
  els.queryToolbar.addEventListener("click", (event) => {
    event.stopPropagation();
    openPageQueryBuilder();
  });
  for (const button of els.tableToolbar.querySelectorAll("[data-table-action]")) {
    const source = els.formatbar.querySelector(`[data-table-action="${button.dataset.tableAction}"]`);
    const icon = source?.querySelector("svg");
    if (!icon) continue;
    button.classList.add("table-icon-button");
    button.setAttribute("aria-label", button.title);
    button.replaceChildren(icon.cloneNode(true));
  }
  emojiPicker = initEmojiPicker({
    root: els.emojiPicker,
    search: els.emojiSearch,
    status: els.emojiStatus,
    themes: els.emojiThemes,
    onSelect(shortcode) {
      replaceSelection(shortcode);
      closeCommandMenus();
    },
    autocompleteTextareas: [els.raw, els.compareRaw],
    onAutocompleteSelect({ textarea, start, end, shortcode }) {
      textarea.setSelectionRange(start, end);
      insertTextIntoTextarea(textarea, `:${shortcode}:`);
    },
    customEmoji: normalizeConfig(state2.config).CUSTOM_EMOJI,
    onCustomEmojiChange(customEmoji) {
      state2.config = normalizeConfig({ ...state2.config, CUSTOM_EMOJI: customEmoji });
      markDirty();
      els.configPreview.textContent = configScript(true);
      renderPreviewFrames();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!inCommandMenu(event)) closeCommandMenus();
  });
  document.addEventListener("mousedown", (event) => {
    if (event.target.closest(".formatbar")) rememberPreviewSelection();
  });
  document.addEventListener("click", (event) => {
    const languageNotice = event.target.closest("[data-code-language-notice]");
    if (languageNotice && event.target.closest("[data-code-language-load]")) {
      setConfigLangs([...state2.config?.LANGS ?? [], languageNotice.dataset.codeLanguage]);
      return;
    }
    if (languageNotice && event.target.closest("[data-code-language-dismiss]")) {
      dismissedCodeLanguages.add(languageNotice.dataset.codeLanguage);
      updateCodeLanguageNotices();
      return;
    }
    const parentOption = event.target.closest("[data-parent-id]");
    if (parentOption) {
      setPageParent(parentOption.dataset.parentId);
      closeCommandMenus();
      return;
    }
    const menuButton = event.target.closest("[data-menu]");
    if (menuButton) {
      toggleCommandMenu(menuButton.dataset.menu);
      return;
    }
    const tableSizeButton = event.target.closest("[data-table-rows][data-table-cols]");
    if (tableSizeButton) {
      insertTable(Number(tableSizeButton.dataset.tableRows), Number(tableSizeButton.dataset.tableCols));
      closeCommandMenus();
      return;
    }
    const tableActionButton = event.target.closest("[data-table-action]");
    if (tableActionButton) {
      runTableAction(tableActionButton.dataset.tableAction);
      return;
    }
    const actionButton = event.target.closest("[data-action]");
    const toolButton = event.target.closest("[data-tool]");
    if (actionButton) handleAction(actionButton.dataset.action);
    if (actionButton || toolButton) closeCommandMenus();
    else if (event.detail === 0 && !inCommandMenu(event)) closeCommandMenus();
  });
  els.modeTabs.forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.mode === "rendered" && state2.mode === "rendered") openFullPreview();
    else setMode(button.dataset.mode);
  }));
  var docksApi = initDocks({
    workspace: document.querySelector(".workspace"),
    panelStore: document.getElementById("panel-store")
  });
  els.treeFilter.addEventListener("input", () => renderAll(false));
  els.raw.addEventListener("input", () => {
    updateContentFromText(els.raw.value);
    updateTableToolbar();
    updateQueryToolbar();
    updateMathToolbar();
    updateMermaidToolbar();
  });
  els.compareRaw.addEventListener("input", () => {
    updateContentFromText(els.compareRaw.value);
    updateTableToolbar();
    updateQueryToolbar();
    updateMathToolbar();
    updateMermaidToolbar();
  });
  for (const textarea of [els.raw, els.compareRaw]) {
    for (const eventName of ["focus", "click", "keyup", "select", "mouseup"]) {
      textarea.addEventListener(eventName, rememberTextTarget);
      textarea.addEventListener(eventName, updateTableToolbar);
      textarea.addEventListener(eventName, updateQueryToolbar);
      textarea.addEventListener(eventName, updateMathToolbar);
      textarea.addEventListener(eventName, updateMermaidToolbar);
      textarea.addEventListener(eventName, syncPreviewSource);
    }
    textarea.addEventListener("scroll", updateCodeLanguageNotices, { passive: true });
  }
  addEventListener("resize", updateCodeLanguageNotices, { passive: true });
  watchPreviewSelection(els.compareRendered);
  watchPreviewSelection(els.rendered);
  addEventListener("message", (event) => {
    const frame = [els.compareRendered, els.rendered].find((candidate) => candidate.contentWindow === event.source);
    if (!frame) return;
    if (event.data?.type === "km-editor-preview-ready") {
      readyPreviewFrames.add(frame);
      return;
    }
    if (event.data?.type === "km-editor-source") {
      jumpToSourceLocation(event.data.pageId, event.data.line);
      return;
    }
    if (event.data?.type !== "km-editor-page") return;
    const page = state2.pages.find((candidate) => candidate.id === event.data.pageId);
    if (!page || page.uid === state2.activeUid) return;
    jumpToSourceUid(page.uid, null);
  });
  els.snapshotList?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-restore-snapshot]");
    if (!button) return;
    const snapshot = readSnapshots().find((item) => item.id === button.dataset.restoreSnapshot);
    if (!snapshot || !await showConfirm("Restore checkpoint", `Restore ${new Date(snapshot.at).toLocaleString()}? Current content stays in History.`, "Restore")) return;
    saveSnapshot();
    const parsed = parseBundle(snapshot.source);
    restoreEditorState(snapshot.editorState || serializeEditorState({
      ...parsed,
      fileName: snapshot.fileName || state2.fileName,
      config: state2.config
    }));
    markDirty();
    renderAll(true);
  });
  els.metadata.addEventListener("submit", (event) => event.preventDefault());
  els.metadata.addEventListener("input", (event) => {
    const page = activePage();
    if (!page) return;
    const field = event.target;
    if (!field.name || field.name === "tags") return;
    if (field.name === "title") {
      updateTitle(page, field.value);
      renderEditors(false);
    } else if (field.name === "updated") {
      updatePageMeta(state2, page, { updated: field.value || todayIso2() });
    } else {
      updatePageMeta(state2, page, { [field.name]: field.value });
    }
    markDirty();
    renderAll(false);
  });
  function updateConfig(patch) {
    state2.config = normalizeConfig({
      ...state2.config,
      ...patch
    });
    markDirty();
    renderConfig();
    renderPreviewFrames();
    updateCodeLanguageNotices();
  }
  els.config.addEventListener("submit", (event) => event.preventDefault());
  els.config.addEventListener("input", (event) => {
    const field = event.target;
    if (!field.name || field.name === "LANGS") return;
    const value = field.name === "ALLOW_JS_FROM_MD" ? field.checked ? "true" : "false" : field.value;
    updateConfig({ [field.name]: value });
  });
  function setPageTags(tags) {
    const page = activePage();
    if (!page) return;
    updatePageMeta(state2, page, { tags: parseTags(tags).join(",") });
    markDirty();
    renderAll(false);
  }
  function setPageParent(parent) {
    const page = activePage();
    if (!page) return;
    updatePageMeta(state2, page, { parent });
    markDirty();
    renderAll(false);
  }
  async function makeSimpleFolder() {
    const page = activePage();
    if (!page || page === mainRootPage() || pageKind(state2.pages, page) === "Simple folder") return;
    const confirmed = await showConfirm(
      "Make simple folder",
      `Remove all markdown content from "${page.title}" and keep only its page header/tree position?`,
      "Make simple folder",
      true
    );
    if (!confirmed) return;
    setSimpleFolder(page);
    markDirty();
    renderAll(true);
  }
  function turnSimpleFolderIntoPage() {
    const page = activePage();
    if (!page || pageKind(state2.pages, page) !== "Simple folder") return;
    syncFirstH1(page, page.title);
    markDirty();
    renderAll(true);
    const textarea = state2.mode === "raw" ? els.raw : els.compareRaw;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }
  function addTagFromInput() {
    const tag = cleanText(els.tagSearch.value);
    if (!tag) return;
    const page = activePage();
    if (!page) return;
    els.tagSearch.value = "";
    setPageTags([...parseTags(page.tags), tag]);
    closeCommandMenus();
  }
  els.metadata.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-tag-remove]");
    const add = event.target.closest("[data-tag-add]");
    if (!remove && !add) return;
    const page = activePage();
    if (!page) return;
    if (remove) setPageTags(parseTags(page.tags).filter((tag) => tag !== remove.dataset.tagRemove));
    if (add) {
      els.tagSearch.value = "";
      setPageTags([...parseTags(page.tags), add.dataset.tagAdd]);
      closeCommandMenus();
    }
  });
  els.tagSearch.addEventListener("input", () => renderTagEditor(activePage()));
  els.tagSearch.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addTagFromInput();
  });
  function setConfigLangs(langs) {
    updateConfig({ LANGS: uniqueList(langs.map(canonicalCodeLanguage)) });
  }
  function addConfigLangFromInput() {
    els.configLangOptions.querySelector("[data-lang-add]")?.click();
  }
  els.config.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-lang-remove]");
    const add = event.target.closest("[data-lang-add]");
    if (!remove && !add) return;
    const langs = state2.config?.LANGS ?? [];
    if (remove) setConfigLangs(langs.filter((lang) => lang !== remove.dataset.langRemove));
    if (add) {
      els.configLangSearch.value = "";
      setConfigLangs([...langs, add.dataset.langAdd]);
      closeCommandMenus();
    }
  });
  els.configLangSearch.addEventListener("input", () => renderConfigLangEditor(state2.config));
  els.configLangSearch.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addConfigLangFromInput();
  });
  function hasPageDrag(event) {
    return [...event.dataTransfer?.types ?? []].includes("text/x-km-page");
  }
  function draggedPage(event) {
    const uid2 = event.dataTransfer?.getData("text/x-km-page");
    return state2.pages.find((page) => page.uid === uid2) ?? null;
  }
  function textareaCharWidth(textarea) {
    if (!textareaCharWidth.canvas) textareaCharWidth.canvas = document.createElement("canvas");
    const canvas = textareaCharWidth.canvas;
    const context = canvas.getContext("2d");
    context.font = getComputedStyle(textarea).font;
    return context.measureText("M").width || 8;
  }
  function dropTargetAt(textarea, clientX, clientY) {
    const style = getComputedStyle(textarea);
    const rect = textarea.getBoundingClientRect();
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.55;
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const x = Math.max(0, clientX - rect.left - paddingLeft + textarea.scrollLeft);
    const y = Math.max(0, clientY - rect.top - paddingTop + textarea.scrollTop);
    const lines = textarea.value.split("\n");
    const hovered = Math.max(0, Math.floor(y / lineHeight));
    const row = Math.min(lines.length - 1, hovered);
    const length = lines[row]?.length ?? 0;
    const charWidth = textareaCharWidth(textarea);
    const column = hovered > row ? length : Math.min(length, Math.max(0, Math.round(x / charWidth)));
    let lineStart = 0;
    for (let i = 0; i < row; i++) lineStart += lines[i].length + 1;
    return {
      index: lineStart + column,
      lineEnd: lineStart + length,
      top: rect.top + paddingTop + row * lineHeight - textarea.scrollTop,
      left: rect.left + paddingLeft + column * charWidth - textarea.scrollLeft,
      width: rect.width - paddingLeft * 2,
      contentLeft: rect.left + paddingLeft,
      lineHeight
    };
  }
  function showDropCaret(target, block) {
    const panel = els.editorPanel.getBoundingClientRect();
    const caret = els.dropCaret;
    caret.className = `drop-caret ${block ? "block" : "inline"}`;
    caret.style.top = `${target.top - panel.top + (block ? target.lineHeight - 1 : 0)}px`;
    caret.style.left = `${(block ? target.contentLeft : target.left) - panel.left}px`;
    caret.style.width = block ? `${target.width}px` : "";
    caret.style.height = block ? "" : `${target.lineHeight}px`;
    caret.hidden = false;
  }
  function moveLinkDropNotice(event) {
    const rect = els.editorPanel.getBoundingClientRect();
    const maxLeft = Math.max(10, rect.width - 130);
    const maxTop = Math.max(10, rect.height - 36);
    els.linkDropNotice.hidden = false;
    els.linkDropNotice.style.left = `${Math.min(Math.max(event.clientX - rect.left + 12, 10), maxLeft)}px`;
    els.linkDropNotice.style.top = `${Math.min(Math.max(event.clientY - rect.top + 12, 10), maxTop)}px`;
  }
  function hideLinkDropNotice() {
    els.linkDropNotice.hidden = true;
    els.dropCaret.hidden = true;
  }
  function handleLinkDrag(event) {
    const files = [...event.dataTransfer?.types ?? []].includes("Files");
    if (!hasPageDrag(event) && !files) return;
    const page = files ? null : draggedPage(event);
    if (page && pageKind(state2.pages, page) === "Simple folder") {
      hideLinkDropNotice();
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    els.linkDropNotice.textContent = files ? "Drop media here" : "Make page link";
    moveLinkDropNotice(event);
    showDropCaret(dropTargetAt(event.currentTarget, event.clientX, event.clientY), files);
  }
  var assetDirectory = null;
  async function saveDroppedMedia(files) {
    const fallback = () => files.map((file) => safeFilePart(file.name, "asset"));
    if (!window.showDirectoryPicker) return fallback();
    try {
      if (!assetDirectory) {
        const root2 = await window.showDirectoryPicker({ mode: "readwrite" });
        assetDirectory = await root2.getDirectoryHandle("assets", { create: true });
      }
      const used = /* @__PURE__ */ new Set();
      const names = [];
      for (const file of files) {
        const name = await unusedAssetName(assetDirectory, safeFilePart(file.name, "asset"), used);
        await writeDirectoryFile(assetDirectory, name, file);
        names.push(name);
      }
      return names;
    } catch (error) {
      assetDirectory = null;
      if (error?.name !== "AbortError") showMessage("Could not save media", error.message || String(error));
      return fallback();
    }
  }
  async function insertDroppedMedia(textarea, files, index) {
    const names = await saveDroppedMedia(files);
    const block = names.map((name, at) => `![${files[at].name.replace(/\.[^.]+$/, "")}](assets/${name})`).join("\n\n");
    textarea.focus();
    textarea.setSelectionRange(index, index);
    insertTextIntoTextarea(textarea, `

${block}

`);
  }
  function handleLinkDrop(event) {
    hideLinkDropNotice();
    const textarea = event.currentTarget;
    const target = dropTargetAt(textarea, event.clientX, event.clientY);
    const media = [...event.dataTransfer?.files ?? []].filter((file) => assetKind(file.name));
    if (media.length) {
      event.preventDefault();
      event.stopPropagation();
      insertDroppedMedia(textarea, media, target.lineEnd);
      return;
    }
    if (!hasPageDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const page = draggedPage(event);
    if (!page?.id || pageKind(state2.pages, page) === "Simple folder") return;
    textarea.focus();
    textarea.setSelectionRange(target.index, target.index);
    insertTextIntoTextarea(textarea, `[${page.title || page.id}](#${pageRoute(state2.pages, page)})`);
  }
  for (const textarea of [els.raw, els.compareRaw]) {
    textarea.addEventListener("dragenter", handleLinkDrag);
    textarea.addEventListener("dragover", handleLinkDrag);
    textarea.addEventListener("dragleave", (event) => {
      if (!els.editorPanel.contains(event.relatedTarget)) hideLinkDropNotice();
    });
    textarea.addEventListener("drop", handleLinkDrop);
  }
  document.addEventListener("dragover", (event) => event.preventDefault());
  document.addEventListener("drop", async (event) => {
    if (hasPageDrag(event)) {
      hideLinkDropNotice();
      return;
    }
    const file = [...event.dataTransfer?.files ?? []].find((file2) => /\.md|\.markdown|\.txt/i.test(file2.name));
    if (!file) return;
    event.preventDefault();
    const parsed = parseBundle(await file.text());
    setStateFromBundle(parsed, { fileName: file.name, fileHandle: null, config: { MD: file.name }, dirty: false });
  });
  document.addEventListener("dragend", hideLinkDropNotice);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCommandMenus();
    if (event.defaultPrevented) return;
    const modifier = event.ctrlKey || event.metaKey;
    const exact = modifier && !event.altKey && !event.shiftKey;
    const key = event.key.toLowerCase();
    if (modifier && !event.altKey && (key === "z" || key === "y")) {
      event.preventDefault();
      runEditorHistory(key === "y" || event.shiftKey ? "redo" : "undo");
      return;
    }
    if (exact && key === "s") {
      event.preventDefault();
      saveBundle();
    }
    if (exact && key === "o") {
      event.preventDefault();
      openFile();
    }
    if (event.target.closest?.("input, textarea, select")) return;
    if (event.key === "Delete") {
      handleAction("delete-page");
    } else if (exact && key === "d") {
      event.preventDefault();
      handleAction("duplicate-page");
    } else if (event.key === "F2") {
      event.preventDefault();
      renameActivePage();
    }
  });
  els.treeRoot.addEventListener("contextmenu", openTreeContextMenu);
  var storedTheme = localStorage.getItem("km-editor-theme");
  if (storedTheme === "dark" || storedTheme === "light") document.documentElement.dataset.theme = storedTheme;
  setMode(state2.mode);
  renderAll(true);
  saveSnapshot();
})();
