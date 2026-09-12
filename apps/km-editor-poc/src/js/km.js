const HEADER_RE = /^[ \t]*<!--\s*km\b([\s\S]*?)-->[ \t]*\r?\n?([\s\S]*?)(?=^[ \t]*<!--\s*km\b|(?![\s\S]))/gm;
const FENCE_RE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/gm;
const CODE_FENCE_RE = /^[ \t]{0,3}(?:>[ \t]?)*[ \t]{0,3}(?:`{3,}|~{3,})[ \t]*([\w#+.-]+)/;
const CODE_LANGUAGE_MODULE = {
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
const CODE_LANGUAGE_SKIP = new Set(["mermaid", "nohighlight", "plain", "plaintext", "text", "txt"]);

const uid = () =>
	crypto?.randomUUID?.() ?? `uid_${Date.now()}_${Math.random().toString(36).slice(2)}`;

const clean = value => String(value ?? "").trim();

export const canonicalCodeLanguage = language => {
	const value = clean(language).toLowerCase();
	return CODE_LANGUAGE_MODULE[value] || value;
};

export function findMissingCodeLanguages(markdown, loadedLanguages = []) {
	const loaded = new Set(loadedLanguages.map(canonicalCodeLanguage));
	const missing = new Map();
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

const todayIso = () => {
	const now = new Date();
	now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
	return now.toISOString().slice(0, 10);
};

export function setPageContent(page, content, updated = todayIso()) {
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

export function setSimpleFolder(page, updated = todayIso()) {
	if (!page) return false;
	const markerChanged = page.kind !== "simple";
	page.kind = "simple";
	return setPageContent(page, "", updated) || markerChanged;
}

const escapeMeta = value => String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const unescapeMeta = value => value.replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();

export function createDefaultConfig(patch = {}) {
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

const CUSTOM_EMOJI_DATA = /^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml);base64,[a-z0-9+/]+={0,2}$/i;

export function normalizeCustomEmoji(value) {
	const seen = new Set();
	const result = [];
	let totalLength = 0;
	for (const item of Array.isArray(value) ? value : []) {
		const alias = String(item?.alias ?? "").trim();
		const data = String(item?.data ?? "");
		if (
			!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(alias) ||
			!CUSTOM_EMOJI_DATA.test(data) ||
			seen.has(alias) ||
			totalLength + data.length > 2_800_000
		) continue;
		seen.add(alias);
		totalLength += data.length;
		result.push({ alias, data });
	}
	return result;
}

export function slugifyTitle(title) {
	return clean(title)
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "") || "page";
}

export function uniquePageId(pages, base) {
	const root = slugifyTitle(base);
	const ids = new Set(pages.map(page => page.id).filter(Boolean));
	if (!ids.has(root)) return root;
	let i = 2;
	while (ids.has(`${root}_${i}`)) i++;
	return `${root}_${i}`;
}

function maskCommentMarkersInFences(text) {
	return text.replace(FENCE_RE, block =>
		block.replace(/<!--/g, "<~~!").replace(/-->/g, "~~>")
	);
}

function restoreCommentMarkers(text) {
	return text.replace(/<~~!/g, "<!--").replace(/~~>/g, "-->");
}

export function parseHeaderMeta(header) {
	const meta = {};
	for (const line of header.split(/\r?\n/)) {
		const match = /^\s*(\w+)\s*[:=]\s*(.+?)\s*$/.exec(line);
		if (!match) continue;
		const [, key, rawValue] = match;
		const quoted = [...rawValue.matchAll(/"((?:\\.|[^"\\])*)"/g)].map(([, value]) =>
			unescapeMeta(value)
		);
		if (quoted.length > 1) meta[key] = quoted;
		else if (quoted.length === 1) meta[key] = quoted[0];
		else meta[key] = rawValue.trim().replace(/,$/, "");
	}
	return meta;
}

export function parseBundle(text) {
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
		const updatedParts = Array.isArray(meta.updated)
			? meta.updated
			: [clean(meta.updated), clean(meta.updateComment ?? meta.update_comment)];
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

export function serializeBundle(state) {
	const parts = [];
	if (clean(state.preamble)) parts.push(state.preamble.trim());
	for (const page of state.pages) {
		const pageSource = [formatHeader(page), page.content.trim()].filter(Boolean).join("\n\n");
		parts.push(pageSource);
	}
	return `${parts.join("\n\n")}\n`;
}

export function serializeEditorState(state) {
	return JSON.stringify({
		fileName: String(state.fileName ?? ""),
		preamble: String(state.preamble ?? ""),
		pages: state.pages ?? [],
		config: state.config ?? {}
	});
}

export function parseEditorState(source) {
	const value = JSON.parse(source);
	if (!value || !Array.isArray(value.pages)) throw new Error("Invalid editor history state");
	return value;
}

export function createStarterState() {
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

export function createPage(pages, kind = "page", parent = "", title = "") {
	const label =
		title ||
		(kind === "folder" ? "New folder" : kind === "simple" ? "New simple folder" : "New page");
	const id = uniquePageId(pages, label);
	const body =
		kind === "simple"
			? ""
			: kind === "folder"
				? `# ${label}\n\nFolder overview. Drag child pages under this node.`
				: `# ${label}\n\nStart writing here.`;
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
		...(kind === "simple" ? { kind: "simple" } : {})
	};
}

export function findPage(state, pageUid = state.activeUid) {
	return state.pages.find(page => page.uid === pageUid) ??
		state.pages.find(page => page.id === "home") ?? state.pages[0] ?? null;
}

export function childrenOf(pages, page) {
	if (!page?.id) return [];
	return pages.filter(candidate => candidate.parent === page.id);
}

const mainRootOf = pages => pages.find(page => page.id === "home") || pages[0] || null;

function upgradeLegacySimpleFolders(pages) {
	const mainRoot = mainRootOf(pages);
	for (const page of pages) {
		if (
			page.kind !== "simple" &&
			page !== mainRoot &&
			!clean(page.content) &&
			childrenOf(pages, page).length
		) page.kind = "simple";
	}
}

export function pageKind(pages, page) {
	const hasChildren = childrenOf(pages, page).length > 0;
	if (page !== mainRootOf(pages) && page?.kind === "simple" && !clean(page.content))
		return "Simple folder";
	if (hasChildren) return "Folder";
	return "Page";
}

export function parseHeadings(markdown) {
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

export function buildTree(state) {
	const pages = state.pages;
	const byId = new Map();
	for (const page of pages) if (page.id && !byId.has(page.id)) byId.set(page.id, page);
	const nodes = new Map(pages.map(page => [page.uid, { page, children: [], missingParent: false }]));
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

export function wouldCreateCycle(pages, pageUid, parentId) {
	const page = pages.find(candidate => candidate.uid === pageUid);
	if (!page || !parentId) return false;
	if (page.id === parentId) return true;
	const byId = new Map();
	for (const candidate of pages) if (candidate.id && !byId.has(candidate.id)) byId.set(candidate.id, candidate);
	let current = byId.get(parentId);
	const seen = new Set();
	while (current) {
		if (current.uid === pageUid) return true;
		if (!current.parent || seen.has(current.uid)) return false;
		seen.add(current.uid);
		current = byId.get(current.parent);
	}
	return false;
}

// The full hash route for a page: its parent chain joined with "#", empty for
// the root. Anything that writes a KM link must use this, not the bare page id.
export function pageRoute(pages, page) {
	const byId = new Map(pages.map(candidate => [candidate.id, candidate]));
	const mainRoot = mainRootOf(pages);
	const segments = [];
	const seen = new Set();
	for (let current = page; current && current !== mainRoot && !seen.has(current.uid); current = byId.get(current.parent)) {
		seen.add(current.uid);
		if (current.id) segments.unshift(current.id);
		if (!current.parent) break;
	}
	return segments.join("#");
}

function rewriteContentRoute(content, oldRoute, newRoute) {
	const rewrite = route =>
		route === oldRoute || route.startsWith(`${oldRoute}#`)
			? newRoute + route.slice(oldRoute.length)
			: route;
	return String(content ?? "")
		.replace(/(\]\(\s*#)([^\s)]+)/g, (_, prefix, route) => prefix + rewrite(route))
		.replace(/(href\s*=\s*["']#)([^"']+)/gi, (_, prefix, route) => prefix + rewrite(route));
}

export function movePage(state, draggedUid, targetUid, placement) {
	if (!draggedUid || !targetUid || draggedUid === targetUid) return false;
	const pages = state.pages;
	const dragged = pages.find(page => page.uid === draggedUid);
	const target = pages.find(page => page.uid === targetUid);
	if (!dragged || !target) return false;
	const oldRoute = pageRoute(pages, dragged);

	const nextParent = placement === "inside" ? target.id : target.parent;
	if (wouldCreateCycle(pages, dragged.uid, nextParent)) return false;

	dragged.parent = clean(nextParent);
	const withoutDragged = pages.filter(page => page.uid !== draggedUid);
	const targetIndex = withoutDragged.findIndex(page => page.uid === targetUid);
	const insertIndex =
		placement === "before" ? targetIndex : placement === "after" ? targetIndex + 1 : targetIndex + 1;
	withoutDragged.splice(Math.max(0, insertIndex), 0, dragged);
	state.pages = withoutDragged;
	const newRoute = pageRoute(state.pages, dragged);
	if (oldRoute && newRoute && oldRoute !== newRoute) {
		for (const page of state.pages)
			setPageContent(page, rewriteContentRoute(page.content, oldRoute, newRoute));
	}
	return true;
}

export function updatePageMeta(state, page, patch) {
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
		rewritePageReferences(state, referenceId, page.id);
		delete page._previousId;
	}
}

function replaceProblemContent(page, problem, replacement) {
	if (!page || !Number.isInteger(problem.start) || !Number.isInteger(problem.end) ||
		problem.start < 0 || problem.end < problem.start || problem.end > page.content.length) return false;
	return setPageContent(
		page,
		page.content.slice(0, problem.start) + replacement + page.content.slice(problem.end)
	);
}

export function repairProblem(state, problem, value = {}) {
	const page = state.pages.find(candidate => candidate.uid === (value.pageUid || problem.pageUid));
	switch (problem.code) {
		case "missing-km-header":
			if (!page) return false;
			delete page._missingKmHeader;
			return true;
		case "missing-id":
			if (!page) return false;
			updatePageMeta(state, page, { id: uniquePageId(state.pages, page.title) });
			return true;
		case "invalid-id":
			if (!page) return false;
			updatePageMeta(state, page, {
				id: uniquePageId(state.pages.filter(candidate => candidate.uid !== page.uid), page.id)
			});
			return true;
		case "missing-title": {
			const title = clean(value.title);
			if (!page || !title) return false;
			updatePageMeta(state, page, { title });
			return true;
		}
		case "duplicate-id": {
			const id = clean(value.id);
			if (!page || !id || id.includes("#") ||
				state.pages.some(candidate => candidate.uid !== page.uid && candidate.id === id)) return false;
			// Duplicate references are ambiguous; keep them on the page retaining the old ID.
			page.id = id;
			return true;
		}
		case "missing-language": {
			const module = canonicalCodeLanguage(problem.module);
			if (!module) return false;
			const loaded = Array.isArray(state.config?.LANGS) ? state.config.LANGS : [];
			state.config = {
				...createDefaultConfig(),
				...state.config,
				LANGS: [...new Set([...loaded.map(canonicalCodeLanguage), module])]
			};
			return true;
		}
		case "invalid-date": {
			const updated = clean(value.updated);
			if (!page || !isValidIsoDate(updated)) return false;
			updatePageMeta(state, page, { updated });
			return true;
		}
		case "duplicate-glossary-alias": {
			const surface = clean(value.surface);
			if (!page || !surface) return false;
			const duplicate = glossarySurfaceOccurrences(page).some(occurrence =>
				occurrence.entry !== problem.entry &&
				occurrence.surface.toLocaleLowerCase() === surface.toLocaleLowerCase()
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
			if (!page || !problem.entries?.some(entry => entry.entry === keepEntry)) return false;
			const lines = page.content.split(/\r?\n/);
			for (const entry of problem.entries
				.filter(entry => entry.entry !== keepEntry)
				.sort((a, b) => b.startLine - a.startLine))
				lines.splice(entry.startLine, entry.endLine - entry.startLine);
			return setPageContent(page, lines.join("\n").trim());
		}
		case "broken-link": {
			const target = state.pages.find(candidate => candidate.uid === value.targetPageUid);
			if (!page || !target) return false;
			const route = pageRoute(state.pages, target);
			const anchor = clean(value.anchor);
			return replaceProblemContent(page, problem, `#${route}${anchor ? `${route ? "#" : ""}${anchor}` : ""}`);
		}
		case "missing-transclusion":
		case "missing-transclusion-section":
		case "circular-transclusion": {
			if (value.remove) return replaceProblemContent(page, problem, "");
			const target = state.pages.find(candidate => candidate.uid === value.targetPageUid);
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
			if (!page || wouldCreateCycle(state.pages, page.uid, parent)) return false;
			updatePageMeta(state, page, { parent });
			return true;
		}
		default:
			return false;
	}
}

function referenceIds(content) {
	const ids = new Set();
	for (const match of String(content ?? "").matchAll(/(?:\]\(\s*|href\s*=\s*["'])#([^\s)"']+)/gi))
		for (const segment of match[1].split("#")) if (segment) ids.add(segment);
	for (const match of String(content ?? "").matchAll(/!\[\[([^#\]\n]+)(?:#[^\]\n]+)?\]\]/g))
		ids.add(clean(match[1]));
	return ids;
}

function rewriteContentPageId(content, oldId, newId) {
	const rewriteRoute = route => route.split("#").map(segment => segment === oldId ? newId : segment).join("#");
	return String(content ?? "")
		.replace(/(\]\(\s*#)([^\s)]+)/g, (_, prefix, route) => prefix + rewriteRoute(route))
		.replace(/(href\s*=\s*["']#)([^"']+)/gi, (_, prefix, route) => prefix + rewriteRoute(route))
		.replace(/(!\[\[)([^#\]\n]+)([^\]\n]*\]\])/g, (_, open, id, close) =>
			open + (clean(id) === oldId ? newId : id) + close
		);
}

export function rewritePageReferences(state, oldId, newId) {
	for (const candidate of state.pages) {
		if (candidate.parent === oldId) candidate.parent = newId;
		setPageContent(candidate, rewriteContentPageId(candidate.content, oldId, newId));
	}
}

export function pageImpact(state, page) {
	return {
		children: childrenOf(state.pages, page),
		references: state.pages.filter(candidate =>
			candidate !== page && referenceIds(candidate.content).has(page.id)
		)
	};
}

const DOWNLOADABLE_LINK_RE = /\.(?:avif|docx?|gif|jpe?g|mp3|mp4|ogg|pdf|png|svg|webm|webp|xlsx?|zip)(?:[?#].*)?$/i;

export function remoteAssetUrls(content) {
	const urls = new Set();
	for (const match of String(content ?? "").matchAll(/(!?)\[[^\]]*\]\((https?:\/\/[^\s)]+)(?:\s+["'][^"']*["'])?\)/gi)) {
		if (match[1] || DOWNLOADABLE_LINK_RE.test(match[2])) urls.add(match[2]);
	}
	for (const match of String(content ?? "").matchAll(/<(?:audio|img|source|video)\b[^>]*\bsrc\s*=\s*["'](https?:\/\/[^"']+)["']/gi))
		urls.add(match[1]);
	return [...urls];
}

// Every image, video, or audio reference on a page, with its position.
//
// Markdown image syntax covers media too, since KM renders `![x](clip.webm)` as
// a player, and raw HTML media tags are matched as well.
const ASSET_REF_RE = /!\[[^\]\n]*\]\(\s*([^\s)]+?)(?:\s+["'][^"']*["'])?\s*\)|<(?:audio|img|source|video)\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;

export function assetReferences(content) {
	const text = String(content ?? "");
	const references = [];
	for (const match of text.matchAll(ASSET_REF_RE)) {
		const url = match[1] ?? match[2];
		// Embedded data (custom emoji, inlined images) is always present.
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

// Warnings for assets that could not be loaded. `isMissing` is injected because
// only the browser can answer it, and only after the probe has run.
export function assetProblems(pages, isMissing) {
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

export function replaceRemoteAsset(content, url, localPath) {
	return String(content ?? "").split(url).join(localPath);
}

export function duplicatePage(state, page) {
	if (!page) return null;
	const copy = {
		...page,
		uid: uid(),
		id: uniquePageId(state.pages, `${page.id || page.title}_copy`),
		title: `${page.title || "Untitled"} copy`
	};
	if (pageKind(state.pages, page) === "Simple folder") copy.kind = "simple";
	else delete copy.kind;
	const index = state.pages.findIndex(candidate => candidate.uid === page.uid);
	state.pages.splice(index + 1, 0, copy);
	return copy;
}

export function deletePage(state, page) {
	if (!page || state.pages.length <= 1) return false;
	const children = childrenOf(state.pages, page);
	for (const child of children) child.parent = page.parent;
	state.pages = state.pages.filter(candidate => candidate.uid !== page.uid);
	state.activeUid = state.pages[0]?.uid ?? null;
	return true;
}

function detectCycles(pages) {
	const byId = new Map();
	for (const page of pages) if (page.id && !byId.has(page.id)) byId.set(page.id, page);
	const cycles = [];

	for (const page of pages) {
		const seen = new Set();
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
	return [...new Map(cycles.map(problem => [`${problem.code}:${problem.pageUid}`, problem])).values()];
}

function isValidIsoDate(value) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const date = new Date(`${value}T00:00:00Z`);
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
	const glossary = pages.find(page => page.id === "km_glossary");
	if (!glossary) return [];
	const occurrences = glossarySurfaceOccurrences(glossary);
	const problems = [];

	const terms = new Map();
	for (const occurrence of occurrences.filter(occurrence => occurrence.kind === "term")) {
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

	const seen = new Map(occurrences
		.filter(occurrence => occurrence.kind === "term")
		.map(occurrence => [occurrence.surface.toLocaleLowerCase(), occurrence]));
	for (const occurrence of occurrences.filter(occurrence => occurrence.kind === "alias")) {
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
	const anchors = new Set(parseHeadings(page?.content).map(heading => heading.anchor));
	if (includeHtml)
		for (const match of String(page?.content ?? "").matchAll(/\bid\s*=\s*["']([^"']+)["']/gi))
			anchors.add(match[1]);
	return anchors;
}

function isValidInternalLink(pages, sourcePage, href) {
	const route = String(href ?? "").replace(/^#/, "");
	const segments = route.split("#").filter(Boolean);
	if (!segments.length) return true;
	const routes = new Map(pages.map(page => [pageRoute(pages, page), page]));
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
					if (source[match.index - 1] === "!" || isInsideInlineCode(source, match.index) ||
						isValidInternalLink(pages, page, match[1])) continue;
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

export function validateState(state) {
	const messages = [];
	const ids = new Map();
	const missingLanguages = new Map();

	for (const page of state.pages) {
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
		for (const language of findMissingCodeLanguages(page.content, state.config?.LANGS))
			if (!missingLanguages.has(language.module)) missingLanguages.set(language.module, language);
	}

	for (const [id, matches] of ids) {
		if (matches.length > 1) messages.push({
			level: "error",
			code: "duplicate-id",
			id,
			pageUids: matches.map(page => page.uid),
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

	for (const page of state.pages) {
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

	messages.push(...detectCycles(state.pages));
	messages.push(...brokenLinkProblems(state.pages));
	messages.push(...duplicateGlossaryProblems(state.pages));
	if (!messages.length) messages.push({ level: "ok", text: "Bundle is valid enough to export." });
	return messages;
}

export function ensureGlossaryPage(state) {
	let glossary = state.pages.find(page => page.id === "km_glossary");
	if (!glossary) {
		glossary = {
			uid: uid(),
			id: "km_glossary",
			title: "Glossary",
			parent: state.pages[0]?.id || "",
			tags: "glossary",
			updated: todayIso(),
			updateComment: "",
			content: "# Glossary"
		};
		state.pages.push(glossary);
	}
	return glossary;
}

export function addGlossaryTerm(state, term, definition = "") {
	const cleanTerm = clean(term);
	if (!cleanTerm) return null;
	const glossary = ensureGlossaryPage(state);
	const headingPattern = new RegExp(`^#{2,6}\\s+${cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
	if (!headingPattern.test(glossary.content)) {
		const body = clean(definition) || `Definition for ${cleanTerm}.`;
		setPageContent(glossary, `${glossary.content.trim()}\n\n## ${cleanTerm}\n\n${body}`.trim());
	} else if (clean(definition)) {
		setPageContent(glossary, `${glossary.content.trim()}\n\n${clean(definition)}`.trim());
	}
	return glossary;
}

export function refreshActiveUid(state) {
	if (!state.activeUid || !state.pages.some(page => page.uid === state.activeUid)) {
		state.activeUid = (state.pages.find(page => page.id === "home") || state.pages[0])?.uid ?? null;
	}
	return state.activeUid;
}

export { HEADING_RE };
