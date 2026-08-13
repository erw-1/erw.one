import {
	addGlossaryTerm,
	createDefaultConfig,
	createPage,
	createStarterState,
	deletePage,
	duplicatePage,
	canonicalCodeLanguage,
	findPage,
	findMissingCodeLanguages,
	movePage,
	normalizeCustomEmoji,
	pageImpact,
	pageKind,
	pageRoute,
	parseBundle,
	parseEditorState,
	refreshActiveUid,
	remoteAssetUrls,
	replaceRemoteAsset,
	serializeBundle,
	serializeEditorState,
	setPageContent,
	setSimpleFolder,
	updatePageMeta
} from "./km.js";
import { downloadMarkdown, downloadText, githubLoad, githubSave, markdownSourceUrl, openMarkdownFile } from "./storage.js";
import { renderTree } from "./tree.js";
import { initDocks } from "./docks.js";
import { cheatsheetSections, initToolbar, youtubeEmbedURL } from "./toolbar.js";
import { initEmojiPicker } from "./emoji.js";
import { initIssues } from "./issues.js";
import { initMathPanel, mathAtCursor, wrapMath } from "./math.js";
import { initMermaidPanel, mermaidAtCursor, wrapMermaid } from "./mermaid.js";
import {
	pageQueryAtCursor,
	serializePageQuery
} from "../../../km/src/js/content/directives.js";
import { assetKind } from "../../../km/src/js/content/media.js";
import {
	initDialogs,
	showCheatsheet,
	showConfirm,
	showGitHubModal,
	showGlossaryModal,
	showSaveChoiceModal,
	showLinkModal,
	showMessage,
	showPrompt,
	showSourceModal
} from "./dialogs.js";

const $ = selector => document.querySelector(selector);

const els = {
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

const COMMON_HLJS_LANGS = [
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

let state = createStarterState();
let previewTimer = 0;
let snapshotTimer = 0;
let previewUrl = "";
let fullPreviewUrl = "";
// Preview frames that have booted and can take content over postMessage.
const readyPreviewFrames = new Set();
let previewSignature = "";
let themeTransitionTimer = 0;
let oneFileTemplate = "";
let lastTextArea = els.raw;
let lastPreviewSelection = "";
let modeBeforeSimpleFolder = null;
let queryTarget = null;
let querySelection = null;
let queryEditRange = null;
let queryOriginalContent = null;
let queryPageUid = null;
let mathTarget = null;
let mathRange = null;
let mathExisting = null;
let diagramTarget = null;
let diagramRange = null;
let diagramEditing = false;
let emojiPicker = null;
const dismissedCodeLanguages = new Set();
const MERMAID_STARTER = "flowchart TD\n  A[Start] --> B[Finish]";
const SNAPSHOT_KEY = "km-editor-snapshots-v1";
// ponytail: keep full states in memory; move to patches only if real bundles make this expensive.
const EDIT_HISTORY_LIMIT = 100;
const editHistory = { current: "", undo: [], redo: [] };

function todayIso() {
	const now = new Date();
	now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
	return now.toISOString().slice(0, 10);
}

function cleanText(value) {
	return String(value ?? "").trim();
}

function safeFilePart(value, fallback = "page") {
	return cleanText(value)
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "_")
		.replace(/^_+|_+$/g, "") || fallback;
}

function parseTags(value) {
	const seen = new Set();
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
	const seen = new Set();
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
	const config = normalizeConfig(state.config);
	const customEmoji = redactImages
		? config.CUSTOM_EMOJI.map(({ alias, data }) => ({ alias, data: `[embedded ${Math.ceil(data.length / 1024)} KB image]` }))
		: config.CUSTOM_EMOJI;
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
	return `<script type="application/json" id="km-config">\n${json}\n</script>`;
}

function tagCounts() {
	const counts = new Map();
	for (const page of state.pages) {
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
	updatePageMeta(state, page, { title });
	if (pageKind(state.pages, page) !== "Simple folder") syncFirstH1(page, page.title);
}

// The Issues panel owns its own validation, list rendering, and fix UI. It
// cannot import app.js back, so everything it needs from editor state and the
// other panels arrives as callbacks here.
const issues = initIssues({
	list: els.validation,
	actions: els.problemActions,
	count: els.problemsCount,
	getState: () => state,
	goToPage: jumpToSourceUid,
	revealSource: revealProblemSource,
	onFixApplied(problem, page) {
		if (problem.code === "missing-title" && pageKind(state.pages, page) !== "Simple folder")
			syncFirstH1(page, page.title);
		markDirty();
		renderAll(false);
	},
	addConfigLang(lang) {
		setConfigLangs([...(state.config?.LANGS ?? []), lang]);
	},
	currentTheme,
	todayIso,
	openQueryBuilder: openPageQueryBuilder,
	openMathBuilder,
	openMermaidBuilder
});

refreshActiveUid(state);
initDialogs(els.modalRoot);
initTableGridPicker();

const activePage = () => findPage(state);
const mainRootPage = () => state.pages.find(page => page.id === "home") || state.pages[0] || null;

function previewablePage(page = activePage()) {
	if (!page || pageKind(state.pages, page) !== "Simple folder") return page;
	const prefix = pageRoute(state.pages, page);
	const descendant = state.pages.find(candidate =>
		pageKind(state.pages, candidate) !== "Simple folder" &&
		pageRoute(state.pages, candidate).startsWith(`${prefix}#`)
	);
	if (descendant) return descendant;
	const seen = new Set();
	for (let parent = state.pages.find(candidate => candidate.id === page.parent); parent;
		parent = state.pages.find(candidate => candidate.id === parent.parent)) {
		if (seen.has(parent.uid)) break;
		seen.add(parent.uid);
		if (pageKind(state.pages, parent) !== "Simple folder") return parent;
	}
	return state.pages.find(candidate => pageKind(state.pages, candidate) !== "Simple folder") || null;
}

function editorStateSource() {
	return serializeEditorState({
		...state,
		config: normalizeConfig(state.config)
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
	if (next.fileName && next.fileName !== state.fileName) state.fileHandle = null;
	state.fileName = next.fileName || state.fileName;
	state.preamble = String(next.preamble ?? "");
	state.pages = next.pages;
	state.config = normalizeConfig(next.config);
	refreshActiveUid(state);
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
	state.dirty = true;
	renderAll(true);
	scheduleSnapshot();
	updateFileStatus();
	updateTextHistoryButtons();
}

resetEditHistory();

function readSnapshots() {
	try {
		const value = JSON.parse(localStorage.getItem(SNAPSHOT_KEY));
		return Array.isArray(value) ? value.filter(item => item?.source && item?.at) : [];
	} catch {
		return [];
	}
}

function snapshotDiff(snapshot) {
	try {
		const oldState = snapshot.editorState
			? parseEditorState(snapshot.editorState)
			: { ...parseBundle(snapshot.source), config: null };
		const oldPages = new Map(oldState.pages.map(page => [page.id, page]));
		const currentPages = new Map(state.pages.map(page => [page.id, page]));
		const signature = page => JSON.stringify([
			page.title, page.parent, page.tags, page.trail, page.updated, page.updateComment, page.content
		]);
		let added = 0;
		let removed = 0;
		let changed = 0;
		for (const [id, page] of currentPages) {
			if (!oldPages.has(id)) added++;
			else if (signature(page) !== signature(oldPages.get(id))) changed++;
		}
		for (const id of oldPages.keys()) if (!currentPages.has(id)) removed++;
		const orderChanged =
			oldState.pages.map(page => page.id).join("\n") !== state.pages.map(page => page.id).join("\n");
		const configChanged = oldState.config &&
			JSON.stringify(normalizeConfig(oldState.config)) !== JSON.stringify(normalizeConfig(state.config));
		return [
			changed ? `${changed} changed` : "",
			added ? `${added} added` : "",
			removed ? `${removed} removed` : "",
			orderChanged ? "order changed" : "",
			configChanged ? "config changed" : ""
		].filter(Boolean).join(" · ") || "Current state";
	} catch {
		return "Unreadable snapshot";
	}
}

function renderSnapshots() {
	if (!els.snapshotList) return;
	const snapshots = readSnapshots();
	els.snapshotList.replaceChildren(...(
		snapshots.length
			? snapshots.map(snapshot => {
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
				summary.textContent = `${snapshot.fileName || "Bundle"} · ${snapshotDiff(snapshot)}`;
				item.append(open, restore, summary);
				return item;
			})
			: [Object.assign(document.createElement("div"), {
				className: "empty-state",
				textContent: "Snapshots appear automatically while you edit."
			})]
	));
}

function saveSnapshot() {
	const source = serializeBundle(state);
	const editorState = editorStateSource();
	const snapshots = readSnapshots();
	if (snapshots[0]?.editorState === editorState) {
		renderSnapshots();
		return;
	}
	snapshots.unshift({
		id: crypto.randomUUID(),
		at: new Date().toISOString(),
		fileName: state.fileName,
		source,
		editorState
	});
	snapshots.length = Math.min(snapshots.length, 8);
	// ponytail: localStorage keeps this dependency-free; move snapshots to
	// IndexedDB if real bundles regularly exceed the browser's storage quota.
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
	state.dirty = true;
	recordEditHistory();
	scheduleSnapshot();
	updateFileStatus();
}

function updateFileStatus() {
	els.fileStatus.textContent = state.fileName || state.config?.MD || "Untitled bundle";
	els.dirtyStatus.hidden = !state.dirty;
	if (els.themeSwitch) els.themeSwitch.textContent = `Theme: ${currentTheme()}`;
	issues.refresh();
}

function setStateFromBundle(parsed, extra = {}, preserveHistory = false) {
	closeCommandMenus();
	const previousMode = modeBeforeSimpleFolder || state.mode || "raw";
	modeBeforeSimpleFolder = null;
	const starter = createStarterState();
	state = {
		...starter,
		...parsed,
		...extra,
		config: normalizeConfig({
			...starter.config,
			...parsed.config,
			...extra.config
		}),
		activeUid: (parsed.pages.find(page => page.id === "home") || parsed.pages[0])?.uid ?? null,
		mode: previousMode,
		dirty: extra.dirty ?? false
	};
	refreshActiveUid(state);
	if (preserveHistory) markDirty();
	else resetEditHistory();
	renderAll(true);
	saveSnapshot();
}

function setMode(mode) {
	state.mode = mode;
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
	refreshActiveUid(state);
	renderTree(els.treeRoot, state, {
		onSelect(uid) {
			closeCommandMenus();
			state.activeUid = uid;
			renderAll(true);
		},
		onMove(draggedUid, targetUid, placement) {
			if (movePage(state, draggedUid, targetUid, placement)) {
				state.activeUid = draggedUid;
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
	const activeKeys = new Set(tags.map(tag => tag.toLowerCase()));
	const query = cleanText(els.tagSearch.value);
	const queryKey = query.toLowerCase();
	const labelsByKey = new Map();
	for (const candidate of state.pages) {
		for (const tag of parseTags(candidate.tags)) {
			const key = tag.toLowerCase();
			if (!labelsByKey.has(key)) labelsByKey.set(key, tag);
		}
	}
	const available = [...counts.keys()]
		.filter(key => !activeKeys.has(key) && (!queryKey || key.includes(queryKey)))
		.map(key => ({ key, label: labelsByKey.get(key) || key, count: counts.get(key) || 0 }))
		.sort((a, b) => a.label.localeCompare(b.label));
	els.tagsInput.value = tags.join(",");
	els.tagChips.replaceChildren(
		...tags.map(tag => {
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
			remove.textContent = "×";
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
	options.push(...available.map(tag => {
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
		...(options.length
			? options
			: [Object.assign(document.createElement("div"), {
				className: "tag-empty",
				textContent: query && activeKeys.has(queryKey) ? "Already added." : "No other tags yet."
			})])
	);
}

function renderConfigLangEditor(config) {
	const langs = uniqueList(config.LANGS);
	const active = new Set(langs.map(canonicalCodeLanguage));
	const query = cleanText(els.configLangSearch.value);
	const queryKey = query.toLowerCase();
	const queryModule = canonicalCodeLanguage(queryKey);
	const exactQuery = COMMON_HLJS_LANGS.includes(queryModule);
	const available = COMMON_HLJS_LANGS
		.filter(lang => !active.has(lang) && (
			!queryKey ||
			(exactQuery
				? lang === queryModule
				: lang.includes(queryKey) ||
					Object.entries(CODE_LANGUAGE_MODULE).some(([alias, module]) => module === lang && alias.includes(queryKey)))
		))
		.sort((a, b) => a.localeCompare(b));
	els.configLangsInput.value = langs.join(",");
	els.configLangChips.replaceChildren(
		...langs.map(lang => {
			const chip = document.createElement("span");
			chip.className = "tag-chip";
			const label = document.createElement("span");
			label.textContent = lang;
			const remove = document.createElement("button");
			remove.type = "button";
			remove.dataset.langRemove = lang;
			remove.title = `Remove ${lang}`;
			remove.textContent = "×";
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
	options.push(...available.map(lang => {
		const button = document.createElement("button");
		button.type = "button";
		button.dataset.langAdd = lang;
		button.textContent = lang;
		return button;
	}));
	els.configLangOptions.replaceChildren(
		...(options.length
			? options
			: [Object.assign(document.createElement("div"), {
				className: "tag-empty",
				textContent: query && active.has(queryKey) ? "Already loaded." : "No matching languages."
			})])
	);
}

function renderConfig() {
	if (!els.config) return;
	state.config = normalizeConfig(state.config);
	const config = state.config;
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
	const parent = state.pages.find(candidate => candidate.id === page.parent);
	els.parentLabel.textContent = parent
		? `${parent.id} - ${parent.title}`
		: page.parent
			? `${page.parent} (missing)`
			: "No parent";

	const choices = [{ id: "", title: "Top-level page" }, ...state.pages
		.filter(candidate => candidate.uid !== page.uid && candidate.id)
		.map(candidate => ({ id: candidate.id, title: candidate.title }))];
	els.parentOptions.replaceChildren(...choices.map(choice => {
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
	const kind = pageKind(state.pages, page);
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
		updated: page.updated || todayIso(),
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
		els.exportPageButton.title = simpleFolder
			? "A simple folder has no standalone page to export"
			: "Download only the selected page as a .md file";
	}

	const duplicateId = Boolean(page.id && state.pages.some(candidate => candidate.uid !== page.uid && candidate.id === page.id));
	const idField = els.metadata.elements.id;
	idField.classList.toggle("invalid", duplicateId);
	els.idError.hidden = !duplicateId;
	updateFileStatus();
}

// Reveal a dockable panel (metadata/config/problems) wherever it currently lives.
function setInspectorTab(tab) {
	docksApi?.reveal(tab);
}

const inCommandMenu = event =>
	event.composedPath().some(node => node.matches?.(".command-menu, [data-menu-panel]"));

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
	const panel = els.menuPanels.find(candidate => candidate.dataset.menuPanel === menu);
	const isOpen = panel && !panel.hidden;
	closeCommandMenus(isOpen ? null : menu);
	if (!isOpen && menu === "tag-picker") {
		els.tagSearch.value = "";
		renderTagEditor(activePage());
		els.tagSearch.focus();
	}
	if (!isOpen && menu === "config-lang-picker") {
		els.configLangSearch.value = "";
		renderConfigLangEditor(state.config);
		els.configLangSearch.focus();
	}
	if (!isOpen && menu === "emoji") {
		emojiPicker.load().then(() => {
			if (!panel.hidden) els.emojiSearch.focus();
		}).catch(() => {});
	}
}

const queryField = name => els.queryBuilder.elements.namedItem(name);

function fillQueryOptions(list, items) {
	list.replaceChildren(...items.map(item => {
		const option = document.createElement("option");
		option.value = typeof item === "string" ? item : item.value;
		if (typeof item !== "string" && item.label) option.label = item.label;
		return option;
	}));
}

function populateQuerySuggestions() {
	fillQueryOptions(
		els.queryTagOptions,
		uniqueList(state.pages.flatMap(page => parseTags(page.tags))).sort((a, b) => a.localeCompare(b))
	);
	fillQueryOptions(
		els.queryParentOptions,
		state.pages
			.filter(page => page.id)
			.map(page => ({ value: page.id, label: page.title }))
			.sort((a, b) => a.label.localeCompare(b.label))
	);
	fillQueryOptions(
		els.queryTrailOptions,
		uniqueList(state.pages
			.filter(page => pageKind(state.pages, page) !== "Simple folder")
			.flatMap(page => String(page.trail || "").split(","))).sort((a, b) => a.localeCompare(b))
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
	const page = state.pages.find(candidate => candidate.uid === queryPageUid);
	const range = queryEditRange || querySelection;
	if (!page || !range) return false;
	const replacement = queryEditRange ? source : `\n\n${source}\n\n`;
	page.content = queryOriginalContent.slice(0, range.start) +
		replacement +
		queryOriginalContent.slice(range.end);
	if (page.uid === state.activeUid) {
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
	const page = state.pages.find(candidate => candidate.uid === queryPageUid);
	if (page) page.content = queryOriginalContent;
	if (page?.uid === state.activeUid) {
		els.raw.value = page.content;
		els.compareRaw.value = page.content;
		queryTarget?.setSelectionRange(querySelection.start, querySelection.end);
		schedulePreviewRefresh();
	}
	queryOriginalContent = null;
	queryPageUid = null;
	if (state.dirty) scheduleSnapshot();
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
	const existing = issue?.start != null
		? { start: issue.start, end: issue.end, options: issue.options || {} }
		: pageQueryAtCursor(queryTarget.value, queryTarget.selectionStart);
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
	const page = state.pages.find(candidate => candidate.uid === queryPageUid);
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
		page.updated = todayIso();
		if (page.uid === state.activeUid) els.metadata.elements.updated.value = page.updated;
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
	// A selection means "turn this into math"; only a plain cursor edits the
	// formula it sits in.
	const existing = mathTarget.selectionStart === mathTarget.selectionEnd
		? mathAtCursor(mathTarget.value, mathTarget.selectionStart)
		: null;
	mathExisting = existing;
	mathRange = existing
		? { start: existing.start, end: existing.end }
		: { start: mathTarget.selectionStart, end: mathTarget.selectionEnd };
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
	// KM only renders `$$` blocks that stand alone, so a formula that was not
	// already a block gets its own blank lines.
	insertTextIntoTextarea(target, display && !mathExisting?.display ? `\n\n${source}\n\n` : source);
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
	diagramRange = existing
		? { start: existing.start, end: existing.end }
		: { start: diagramTarget.selectionStart, end: diagramTarget.selectionEnd };
	els.mermaidSubmit.textContent = diagramEditing ? "Update diagram" : "Insert diagram";
	closeCommandMenus("mermaid-builder");
	mermaidPanel.set(
		existing
			? existing.diagram
			: diagramTarget.value.slice(diagramRange.start, diagramRange.end).trim() ||
				MERMAID_STARTER
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
	insertTextIntoTextarea(target, diagramEditing ? source : `\n\n${source}\n\n`);
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
					const active =
						Number(cell.dataset.tableRows) <= row &&
						Number(cell.dataset.tableCols) <= col;
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
	const root = document.documentElement;
	root.classList.add("theme-transition");
	void root.offsetWidth;
	root.dataset.theme = theme;
	clearTimeout(themeTransitionTimer);
	themeTransitionTimer = setTimeout(() => root.classList.remove("theme-transition"), 220);
	for (const frame of [els.compareRendered, els.rendered])
		frame.contentWindow?.postMessage({ type: "km-editor-theme", theme }, "*");
	// An open diagram was drawn for the old theme.
	if (!els.mermaidBuilder.hidden) mermaidPanel.refresh();
}

function makeBundleUrl() {
	const url = URL.createObjectURL(new Blob([serializeBundle(state)], { type: "text/markdown" }));
	const oldUrl = previewUrl;
	previewUrl = url;
	if (oldUrl) setTimeout(() => URL.revokeObjectURL(oldUrl), 10_000);
	return url;
}

function contentPreviewUrl(page) {
	const config = normalizeConfig(state.config);
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
	// Short, because an update is now an in-place re-render rather than a reload.
	previewTimer = setTimeout(() => renderPreviewFrames(), 120);
}

// Everything the preview document reads once, at boot. Markdown is not in here:
// changing the text is what typing does, and that must not cost a reload.
function previewConfigSignature() {
	const config = normalizeConfig(state.config);
	// Theme is deliberately absent: applyEditorTheme() hands it to the running
	// preview over postMessage, so listing it here would reload the frame and
	// throw away the transition it just did.
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
	if (!page || pageKind(state.pages, page) === "Simple folder") return;
	globalThis.kmEditorCustomEmoji = normalizeConfig(state.config).CUSTOM_EMOJI;
	const signature = previewConfigSignature();
	const configChanged = signature !== previewSignature;
	previewSignature = signature;
	const frames = [];
	if (state.mode === "rendered") frames.push(els.rendered);
	if (state.mode === "compare") frames.push(els.compareRendered);
	for (const frame of frames) {
		// Hand the new markdown to a preview that is already running. Reloading it
		// blanked the pane on every pause in typing, refetched every module, and
		// threw away the scroll position.
		if (!configChanged && readyPreviewFrames.has(frame)) {
			frame.contentWindow?.postMessage({
				type: "km-editor-content",
				markdown: serializeBundle(state),
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

// Snapshot the preview selection as the formatbar is pressed, because taking
// focus clears it before the action runs.
//
// Read the frames directly, and overwrite even with "". Going through
// readPreviewSelection() re-remembered the previous value whenever the frames
// were empty, so one selection stuck forever: later formatbar presses with
// nothing selected wrapped that stale text instead of the placeholder.
function rememberPreviewSelection() {
	lastPreviewSelection =
		readFrameSelection(els.compareRendered) || readFrameSelection(els.rendered);
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
			// Preview iframes are normally same-origin. If a browser blocks access,
			// raw textarea selection still works.
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
	if (state.mode === "rendered") setMode("compare");
	const textarea = state.mode === "raw" ? els.raw : els.compareRaw;
	const lines = textarea.value.split("\n");
	const safeLine = Math.max(0, Math.min(lines.length - 1, Number(line) || 0));
	const start = lines.slice(0, safeLine).join("\n").length + (safeLine ? 1 : 0);
	textarea.focus();
	textarea.setSelectionRange(start, start + lines[safeLine].length);
	const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
	textarea.scrollTop = Math.max(0, safeLine * lineHeight - textarea.clientHeight / 3);
	lastTextArea = textarea;
}

// Switch to a page, then put the caret on one of its source lines. Preview
// navigation, the Issues list, and problem fixes all land here. Pass a null
// line to select the page without moving the caret.
function jumpToSourceUid(uid, line) {
	const page = state.pages.find(candidate => candidate.uid === uid);
	if (page && page.uid !== state.activeUid) {
		closeCommandMenus();
		state.activeUid = page.uid;
		renderAll(true);
	}
	if (line !== null) jumpToSourceLine(line);
}

function jumpToSourceLocation(pageId, line) {
	jumpToSourceUid(state.pages.find(candidate => candidate.id === pageId)?.uid, line);
}

// Show a problem's exact source text, selected and ready to retype.
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
	const simpleFolder = pageKind(state.pages, page) === "Simple folder";
	if (simpleFolder && state.mode !== "raw") {
		modeBeforeSimpleFolder ||= state.mode;
		setMode("raw");
		return;
	}
	if (!simpleFolder && modeBeforeSimpleFolder) {
		const mode = modeBeforeSimpleFolder;
		modeBeforeSimpleFolder = null;
		if (state.mode === "raw") {
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
	els.previewButton.title = canPreview
		? simpleFolder
			? "This folder has no article; preview the bundle at a nearby page"
			: "Preview this bundle in the real KM shell"
		: "This bundle has no page to preview";
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
	const top = textareaRect.top - hostRect.top + (parseFloat(style.paddingTop) || 0) +
		line * lineHeight - textarea.scrollTop;
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
		state.config?.LANGS
	).filter(language => !dismissedCodeLanguages.has(language.module));
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
	const textareaText = target?.tagName === "TEXTAREA"
		? target.value.slice(target.selectionStart, target.selectionEnd)
		: "";
	return textareaText || readPreviewSelection();
}

function activeTextTarget() {
	const active = document.activeElement;
	if ([els.raw, els.compareRaw].includes(active)) return active;
	if (state.mode === "raw") return els.raw;
	if (state.mode === "compare") return els.compareRaw;
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

// Insert a standalone block at the caret, on its own blank lines.
//
// This deliberately ignores the current selection. Its callers build a concrete
// snippet — a table, a video embed — so substituting whatever happened to be
// selected would silently insert that instead: selecting a formula and then
// picking a table size produced a second copy of the formula and no table.
// Wrapping a selection is wrapSelection()'s job, not this one's.
function insertBlock(snippet) {
	replaceSelection(`\n\n${snippet}\n\n`, 2, 2 + snippet.length);
}

function tableRow(cells) {
	return `| ${cells.join(" | ")} |`;
}

function tableDivider(alignments) {
	const token = alignment =>
		alignment === "left"
			? ":---"
			: alignment === "center"
				? ":---:"
				: alignment === "right"
					? "---:"
					: "---";
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
	const cells = trimmed.split("|").map(cell => cell.trim());
	return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

function parseTableRow(line) {
	return line
		.trim()
		.replace(/^\|/, "")
		.replace(/\|$/, "")
		.split("|")
		.map(cell => cell.trim());
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
	return rows.map(row => {
		const next = row.slice(0, columns);
		while (next.length < columns) next.push("");
		return next;
	});
}

function tableAtCursor(textarea = activeTextTarget()) {
	if (state.mode === "rendered") return null;
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
	const columns = Math.max(...rawRows.map(row => parseTableRow(row).length));
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
	return table.rows.map((row, index) =>
		index === table.divider ? tableDivider(table.alignments) : tableRow(row)
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
	const query = state.mode !== "rendered" &&
		textarea?.tagName === "TEXTAREA" &&
		pageQueryAtCursor(textarea.value, textarea.selectionStart);
	els.queryToolbar.hidden = !query;
}

function updateMathToolbar() {
	const textarea = activeTextTarget();
	const math = state.mode !== "rendered" &&
		textarea?.tagName === "TEXTAREA" &&
		mathAtCursor(textarea.value, textarea.selectionStart);
	els.mathToolbar.hidden = !math;
}

function updateMermaidToolbar() {
	const textarea = activeTextTarget();
	const diagram = state.mode !== "rendered" &&
		textarea?.tagName === "TEXTAREA" &&
		mermaidAtCursor(textarea.value, textarea.selectionStart);
	els.mermaidToolbar.hidden = !diagram;
}

function prefixLines(prefix, placeholder) {
	const value = selectedText() || placeholder;
	const prefixed = value
		.split(/\r?\n/)
		.map(line => `${prefix}${line.replace(/^#{1,6}\s+/, "")}`)
		.join("\n");
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
	setPageContent(page, `${page.content.trim()}\n\n[^${number}]: Footnote text.`);
	markDirty();
	renderEditors(true);
}

async function addGlossary() {
	rememberPreviewSelection();
	const entry = await showGlossaryModal(selectedText());
	if (!entry?.term) return;
	addGlossaryTerm(state, entry.term, entry.definition);
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
	const link = await showLinkModal(state, selectedText());
	if (!link) return;
	replaceSelection(`[${link.text}](${link.route})`);
}

function addPage(kind) {
	const current = activePage();
	const parent = current?.id || "";
	const page = createPage(state.pages, kind, parent);
	const index = state.pages.findIndex(candidate => candidate.uid === current?.uid);
	state.pages.splice(index + 1, 0, page);
	state.activeUid = page.uid;
	markDirty();
	renderAll(true);
}

function fullPreviewFrameUrl(page) {
	globalThis.kmEditorCustomEmoji = normalizeConfig(state.config).CUSTOM_EMOJI;
	const url = URL.createObjectURL(new Blob([serializeBundle(state)], { type: "text/markdown" }));
	const oldUrl = fullPreviewUrl;
	fullPreviewUrl = url;
	if (oldUrl) setTimeout(() => URL.revokeObjectURL(oldUrl), 10_000);
	const config = normalizeConfig(state.config);
	const params = new URLSearchParams({
		md: url,
		route: pageRoute(state.pages, page),
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

async function replaceBundleFromSource(source, fileName = state.fileName, fileHandle = state.fileHandle, preserveHistory = false) {
	const parsed = parseBundle(source);
	setStateFromBundle(parsed, {
		fileName,
		fileHandle,
		config: preserveHistory ? { ...state.config, MD: fileName } : { MD: fileName },
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
	if (state.dirty && !(await showConfirm("Replace draft", "Load the KM documentation example and discard unsaved changes?", "Load example"))) return;
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

async function sourceBundle(url) {
	const sourceUrl = markdownSourceUrl(url);
	const response = await fetch(sourceUrl);
	if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
	const source = await response.text();
	const isHtml = response.headers.get("content-type")?.includes("text/html") || /^\s*(?:<!doctype\s+html|<html[\s>])/i.test(source);
	const doc = isHtml ? new DOMParser().parseFromString(source, "text/html") : null;
	const configNode = doc?.getElementById("km-config");
	if (!configNode) {
		const fileName = safeFilePart(new URL(sourceUrl, location.href).pathname.split("/").pop(), "linked-bundle.md");
		return {
			parsed: parseBundle(source),
			fileName: fileName.endsWith(".md") ? fileName : `${fileName}.md`,
			config: { MD: sourceUrl }
		};
	}

	const config = JSON.parse(configNode.textContent);
	const inline = doc.getElementById("km-inline-md");
	let markdown;
	let mdSource = cleanText(config.MD);
	if (inline && inline.textContent.trim()) {
		markdown = inline.textContent.replace(/<\\\/script/gi, "</script");
	} else {
		if (!mdSource) throw new Error("KM page has no markdown source to load.");
		mdSource = markdownSourceUrl(new URL(mdSource, sourceUrl).href);
		const mdResponse = await fetch(mdSource);
		if (!mdResponse.ok) throw new Error(`Could not fetch markdown (HTTP ${mdResponse.status}).`);
		markdown = await mdResponse.text();
	}
	const slug = new URL(sourceUrl, location.href).pathname.split("/").filter(Boolean).pop();
	return {
		parsed: parseBundle(markdown),
		fileName: `${safeFilePart(slug || config.TITLE, "km-page")}.md`,
		config: { ...config, MD: mdSource }
	};
}

async function loadSourceUrl(url) {
	const bundle = await sourceBundle(url);
	setStateFromBundle(bundle.parsed, {
		fileName: bundle.fileName,
		fileHandle: null,
		config: bundle.config,
		dirty: false
	});
}

async function openLink() {
	const url = await showPrompt("Open from URL", "Markdown, HackMD, GitHub file, or KM URL");
	if (!url) return;
	try {
		await loadSourceUrl(url);
	} catch (error) {
		showMessage("Open link failed", error.message || String(error));
	}
}

// Sha of the GitHub file version this draft started from. githubSave sends it
// back so a push from elsewhere (another editor, HackMD) is detected instead of
// silently overwritten.
let githubSha = "";

function githubSettings() {
	try {
		return JSON.parse(localStorage.getItem("km-editor-github")) || null;
	} catch {
		return null;
	}
}

function rememberGithubSettings(settings) {
	// ponytail: token lives in localStorage, fine for a repo-scoped fine-grained
	// PAT on a personal machine; move to sessionStorage if that ever feels loose.
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
		text: serializeBundle(state),
		message: `Update ${settings.path} from km-editor`
	});
	state.dirty = false;
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
		// Nothing loaded this session, so this push replaces remote content the
		// editor has never seen. Confirm, then fetch the current sha so the write
		// is accepted; a missing file just means we are creating it.
		const overwrite = await showConfirm(
			"Overwrite remote file",
			`Nothing was loaded from GitHub this session. Push your local content over ${settings.path} in ${settings.repo}?`,
			"Overwrite remote",
			true
		);
		if (!overwrite) return;
		try {
			githubSha = (await githubLoad(settings)).sha;
		} catch {}
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

// Load from a deployed KM site (HTML), not a raw markdown file. Reads the
// page's km-config, then takes the markdown from an embedded one-file block or
// by fetching config.MD resolved against the page URL. The site's config
// (title, accent, langs, ...) comes along so a re-export matches the original.
async function openKmPage() {
	const url = await showPrompt("Open from existing KM page", "Published KM page URL", "https://");
	if (!url) return;
	try {
		await loadSourceUrl(url);
	} catch (error) {
		showMessage("Open KM page failed", error.message || String(error));
	}
}

async function openSourceQuery() {
	const source = new URLSearchParams(location.search).get("source");
	if (!source) return;
	try {
		await loadSourceUrl(source);
	} catch (error) {
		showMessage("Source failed to load", error.message || String(error));
	}
}

function exportBundleSource() {
	downloadMarkdown(serializeBundle(state), state.fileName || "km-bundle.md");
	state.dirty = false;
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
	const assets = new Map();
	for (const page of state.pages) {
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
		const root = await window.showDirectoryPicker({ mode: "readwrite" });
		const directory = await root.getDirectoryHandle("assets", { create: true });
		const used = new Set();
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
				`${existing.trim() ? `${existing.trim()}\n\n` : ""}## Collected ${new Date().toISOString()}\n\n${sources.join("\n")}\n`
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
		const config = normalizeConfig(state.config);
		if (mode === "online" && !cleanText(config.MD)) throw new Error("Set Markdown source before building an online HTML file.");
		if (mode === "offline") {
			config.MD = await markdownDataUrl(serializeBundle(state));
			config.CACHE_MD = "0";
		}
		const block = `<script type="application/json" id="km-config">\n${JSON.stringify(config, null, 2).replace(/<\/script/gi, "<\\/script")}\n</script>`;
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

// One save entry point for the Unsaved dot and Ctrl+S. Remembers the chosen
// destination when asked to; forceAsk reopens the chooser to change it.
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
		if (state.dirty && !(await showConfirm("Replace draft", "Create a new starter bundle and discard unsaved changes?", "Replace"))) return;
		state = createStarterState();
		refreshActiveUid(state);
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
		if (!page || pageKind(state.pages, page) === "Simple folder") return;
		downloadMarkdown(
			serializeBundle({ preamble: "", pages: [page] }),
			`${safeFilePart(page.id || page.title)}.md`
		);
	} else if (action === "source-modal") {
		const updated = await showSourceModal("Bundle source", serializeBundle(state), "Replace bundle");
		if (updated != null) replaceBundleFromSource(updated, state.fileName, state.fileHandle, true);
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
			// Drop any custom size from the resize handle so desktop is full-bleed.
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
		const copy = duplicatePage(state, activePage());
		if (copy) {
			state.activeUid = copy.uid;
			markDirty();
			renderAll(true);
		}
	} else if (action === "delete-page") {
		const page = activePage();
		const impact = page && pageImpact(state, page);
		const details = impact
			? [
				impact.children.length ? `${impact.children.length} child page${impact.children.length === 1 ? "" : "s"} will move up.` : "",
				impact.references.length ? `${impact.references.length} page${impact.references.length === 1 ? "" : "s"} will keep broken links or embeds.` : ""
			].filter(Boolean).join(" ")
			: "";
		if (page && await showConfirm("Delete page", `Delete "${page.title}"? ${details || "No other pages are affected."}`, "Delete", true)) {
			deletePage(state, page);
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
	state.activeUid = row.dataset.uid;
	renderAll(true);
	const panel = els.menuPanels.find(candidate => candidate.dataset.menuPanel === "tree-context");
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

const mermaidPanel = initMermaidPanel({
	form: els.mermaidBuilder,
	templates: els.mermaidTemplates,
	snippets: els.mermaidSnippets,
	input: els.mermaidInput,
	preview: els.mermaidPreview,
	status: els.mermaidStatus,
	themeOf: () => (currentTheme() === "light" ? "default" : "dark")
});

els.mermaidBuilder.addEventListener("submit", event => {
	event.preventDefault();
	insertMermaid();
});
els.mermaidBuilder.addEventListener("click", event => {
	if (!event.target.closest("[data-mermaid-cancel]")) return;
	closeCommandMenus();
	diagramTarget?.focus();
});
els.mermaidToolbar.addEventListener("click", event => {
	event.stopPropagation();
	openMermaidBuilder();
});

const mathPanel = initMathPanel({
	form: els.mathBuilder,
	tabs: els.mathTabs,
	palette: els.mathPalette,
	input: els.mathInput,
	preview: els.mathPreview,
	status: els.mathStatus
});

els.mathBuilder.addEventListener("submit", event => {
	event.preventDefault();
	insertMath();
});
els.mathBuilder.addEventListener("click", event => {
	if (!event.target.closest("[data-math-cancel]")) return;
	closeCommandMenus();
	mathTarget?.focus();
});
els.mathToolbar.addEventListener("click", event => {
	event.stopPropagation();
	openMathBuilder();
});

els.queryBuilder.addEventListener("input", renderQueryBuilder);
els.queryBuilder.addEventListener("submit", event => {
	event.preventDefault();
	insertPageQuery();
});
els.queryBuilder.addEventListener("click", event => {
	if (event.target.closest("[data-query-cancel]")) closePageQueryBuilder();
});
els.queryToolbar.addEventListener("click", event => {
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
	customEmoji: normalizeConfig(state.config).CUSTOM_EMOJI,
	onCustomEmojiChange(customEmoji) {
		state.config = normalizeConfig({ ...state.config, CUSTOM_EMOJI: customEmoji });
		markDirty();
		els.configPreview.textContent = configScript(true);
		renderPreviewFrames();
	}
});

document.addEventListener("pointerdown", event => {
	if (!inCommandMenu(event)) closeCommandMenus();
});

document.addEventListener("mousedown", event => {
	if (event.target.closest(".formatbar")) rememberPreviewSelection();
});

document.addEventListener("click", event => {
	const languageNotice = event.target.closest("[data-code-language-notice]");
	if (languageNotice && event.target.closest("[data-code-language-load]")) {
		setConfigLangs([...(state.config?.LANGS ?? []), languageNotice.dataset.codeLanguage]);
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
	// composedPath is captured at dispatch, so a button that replaces itself
	// during its own click still counts as a click inside its menu.
	else if (event.detail === 0 && !inCommandMenu(event)) closeCommandMenus();
});

els.modeTabs.forEach(button => button.addEventListener("click", () => {
	if (button.dataset.mode === "rendered" && state.mode === "rendered") openFullPreview();
	else setMode(button.dataset.mode);
}));
const docksApi = initDocks({
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

addEventListener("message", event => {
	const frame = [els.compareRendered, els.rendered].find(candidate => candidate.contentWindow === event.source);
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
	const page = state.pages.find(candidate => candidate.id === event.data.pageId);
	if (!page || page.uid === state.activeUid) return;
	jumpToSourceUid(page.uid, null);
});

els.snapshotList?.addEventListener("click", async event => {
	const button = event.target.closest("[data-restore-snapshot]");
	if (!button) return;
	const snapshot = readSnapshots().find(item => item.id === button.dataset.restoreSnapshot);
	if (!snapshot || !(await showConfirm("Restore checkpoint", `Restore ${new Date(snapshot.at).toLocaleString()}? Current content stays in History.`, "Restore"))) return;
	saveSnapshot();
	const parsed = parseBundle(snapshot.source);
	restoreEditorState(snapshot.editorState || serializeEditorState({
		...parsed,
		fileName: snapshot.fileName || state.fileName,
		config: state.config
	}));
	markDirty();
	renderAll(true);
});

els.metadata.addEventListener("submit", event => event.preventDefault());
els.metadata.addEventListener("input", event => {
	const page = activePage();
	if (!page) return;
	const field = event.target;
	if (!field.name || field.name === "tags") return;
	if (field.name === "title") {
		updateTitle(page, field.value);
		renderEditors(false);
	} else if (field.name === "updated") {
		updatePageMeta(state, page, { updated: field.value || todayIso() });
	} else {
		updatePageMeta(state, page, { [field.name]: field.value });
	}
	markDirty();
	renderAll(false);
});

function updateConfig(patch) {
	state.config = normalizeConfig({
		...state.config,
		...patch
	});
	markDirty();
	renderConfig();
	renderPreviewFrames();
	updateCodeLanguageNotices();
}

els.config.addEventListener("submit", event => event.preventDefault());
els.config.addEventListener("input", event => {
	const field = event.target;
	if (!field.name || field.name === "LANGS") return;
	const value =
		field.name === "ALLOW_JS_FROM_MD"
			? field.checked ? "true" : "false"
			: field.value;
	updateConfig({ [field.name]: value });
});

function setPageTags(tags) {
	const page = activePage();
	if (!page) return;
	updatePageMeta(state, page, { tags: parseTags(tags).join(",") });
	markDirty();
	renderAll(false);
}

function setPageParent(parent) {
	const page = activePage();
	if (!page) return;
	updatePageMeta(state, page, { parent });
	markDirty();
	renderAll(false);
}

async function makeSimpleFolder() {
	const page = activePage();
	if (!page || page === mainRootPage() || pageKind(state.pages, page) === "Simple folder") return;
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
	if (!page || pageKind(state.pages, page) !== "Simple folder") return;
	syncFirstH1(page, page.title);
	markDirty();
	renderAll(true);
	const textarea = state.mode === "raw" ? els.raw : els.compareRaw;
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

els.metadata.addEventListener("click", event => {
	const remove = event.target.closest("[data-tag-remove]");
	const add = event.target.closest("[data-tag-add]");
	if (!remove && !add) return;
	const page = activePage();
	if (!page) return;
	if (remove) setPageTags(parseTags(page.tags).filter(tag => tag !== remove.dataset.tagRemove));
	if (add) {
		els.tagSearch.value = "";
		setPageTags([...parseTags(page.tags), add.dataset.tagAdd]);
		closeCommandMenus();
	}
});

els.tagSearch.addEventListener("input", () => renderTagEditor(activePage()));
els.tagSearch.addEventListener("keydown", event => {
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

els.config.addEventListener("click", event => {
	const remove = event.target.closest("[data-lang-remove]");
	const add = event.target.closest("[data-lang-add]");
	if (!remove && !add) return;
	const langs = state.config?.LANGS ?? [];
	if (remove) setConfigLangs(langs.filter(lang => lang !== remove.dataset.langRemove));
	if (add) {
		els.configLangSearch.value = "";
		setConfigLangs([...langs, add.dataset.langAdd]);
		closeCommandMenus();
	}
});

els.configLangSearch.addEventListener("input", () => renderConfigLangEditor(state.config));
els.configLangSearch.addEventListener("keydown", event => {
	if (event.key !== "Enter") return;
	event.preventDefault();
	addConfigLangFromInput();
});

function hasPageDrag(event) {
	return [...(event.dataTransfer?.types ?? [])].includes("text/x-km-page");
}

function draggedPage(event) {
	const uid = event.dataTransfer?.getData("text/x-km-page");
	return state.pages.find(page => page.uid === uid) ?? null;
}

function textareaCharWidth(textarea) {
	if (!textareaCharWidth.canvas) textareaCharWidth.canvas = document.createElement("canvas");
	const canvas = textareaCharWidth.canvas;
	const context = canvas.getContext("2d");
	context.font = getComputedStyle(textarea).font;
	return context.measureText("M").width || 8;
}

// Where a drop would land, plus the geometry needed to draw that spot.
//
// `index` is the exact character an inline link takes; `lineEnd` is where a
// media block goes, after the hovered line.
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
	// Past the last line means the end of the text, not a column inside it.
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

// Draw where the drop will land: a caret between characters for an inline page
// link, a rule under the hovered line for a media block.
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
	const files = [...(event.dataTransfer?.types ?? [])].includes("Files");
	if (!hasPageDrag(event) && !files) return;
	const page = files ? null : draggedPage(event);
	if (page && pageKind(state.pages, page) === "Simple folder") {
		hideLinkDropNotice();
		return;
	}
	event.preventDefault();
	event.dataTransfer.dropEffect = "copy";
	els.linkDropNotice.textContent = files ? "Drop media here" : "Make page link";
	moveLinkDropNotice(event);
	showDropCaret(dropTargetAt(event.currentTarget, event.clientX, event.clientY), files);
}

// Copy dropped media into the bundle's assets folder.
//
// Returns the file names to reference. Without File System Access, or if the
// author dismisses the folder picker, the reference is still inserted and the
// missing-asset warning tells them to put the file there.
let assetDirectory = null;

async function saveDroppedMedia(files) {
	const fallback = () => files.map(file => safeFilePart(file.name, "asset"));
	if (!window.showDirectoryPicker) return fallback();
	try {
		if (!assetDirectory) {
			const root = await window.showDirectoryPicker({ mode: "readwrite" });
			assetDirectory = await root.getDirectoryHandle("assets", { create: true });
		}
		const used = new Set();
		const names = [];
		for (const file of files) {
			const name = await unusedAssetName(assetDirectory, safeFilePart(file.name, "asset"), used);
			await writeDirectoryFile(assetDirectory, name, file);
			names.push(name);
		}
		return names;
	} catch (error) {
		assetDirectory = null;
		// Report without blocking: the reference still goes in either way.
		if (error?.name !== "AbortError") showMessage("Could not save media", error.message || String(error));
		return fallback();
	}
}

// Drop position is captured before saving, because the drag data and the event
// target are gone by the time the folder picker resolves.
async function insertDroppedMedia(textarea, files, index) {
	const names = await saveDroppedMedia(files);
	const block = names
		.map((name, at) => `![${files[at].name.replace(/\.[^.]+$/, "")}](assets/${name})`)
		.join("\n\n");
	textarea.focus();
	textarea.setSelectionRange(index, index);
	insertTextIntoTextarea(textarea, `\n\n${block}\n\n`);
}

function handleLinkDrop(event) {
	hideLinkDropNotice();
	const textarea = event.currentTarget;
	const target = dropTargetAt(textarea, event.clientX, event.clientY);
	const media = [...(event.dataTransfer?.files ?? [])].filter(file => assetKind(file.name));
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
	if (!page?.id || pageKind(state.pages, page) === "Simple folder") return;
	textarea.focus();
	textarea.setSelectionRange(target.index, target.index);
	// A nested page needs its whole parent chain, not just its own id.
	insertTextIntoTextarea(textarea, `[${page.title || page.id}](#${pageRoute(state.pages, page)})`);
}

for (const textarea of [els.raw, els.compareRaw]) {
	textarea.addEventListener("dragenter", handleLinkDrag);
	textarea.addEventListener("dragover", handleLinkDrag);
	textarea.addEventListener("dragleave", event => {
		if (!els.editorPanel.contains(event.relatedTarget)) hideLinkDropNotice();
	});
	textarea.addEventListener("drop", handleLinkDrop);
}

document.addEventListener("dragover", event => event.preventDefault());
document.addEventListener("drop", async event => {
	if (hasPageDrag(event)) {
		hideLinkDropNotice();
		return;
	}
	const file = [...(event.dataTransfer?.files ?? [])].find(file => /\.md|\.markdown|\.txt/i.test(file.name));
	if (!file) return;
	event.preventDefault();
	const parsed = parseBundle(await file.text());
	setStateFromBundle(parsed, { fileName: file.name, fileHandle: null, config: { MD: file.name }, dirty: false });
});

document.addEventListener("dragend", hideLinkDropNotice);

document.addEventListener("keydown", event => {
	if (event.key === "Escape") closeCommandMenus();
	// A toolbar shortcut already handled this keystroke. Without this guard a
	// tool that adds Alt or Shift to a global letter would fire both.
	if (event.defaultPrevented) return;
	const modifier = event.ctrlKey || event.metaKey;
	// Global shortcuts are exact: Ctrl+Alt+Shift+S is a tool, not Save.
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
	// Page shortcuts only when not typing in a field.
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

const storedTheme = localStorage.getItem("km-editor-theme");
if (storedTheme === "dark" || storedTheme === "light") document.documentElement.dataset.theme = storedTheme;

setMode(state.mode);
renderAll(true);
saveSnapshot();
openSourceQuery();
