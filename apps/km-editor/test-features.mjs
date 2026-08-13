import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function importSource(path) {
	const source = await readFile(path, "utf8");
	return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const km = await importSource("km-editor/src/js/km.js");
const storage = await importSource("km-editor/src/js/storage.js");
const directives = await importSource("km/src/js/content/directives.js");
const deps = await importSource("km/src/js/core/deps.js");
assert.equal(
	deps.twitterEmojiURL("❤️"),
	"https://cdn.jsdelivr.net/npm/emoji-datasource-twitter@16.0.0/img/twitter/64/2764-fe0f.png"
);
assert.deepEqual(
	deps.emojiDataEntries([
		{ unified: "1F600", short_name: "grinning", short_names: ["grinning"], name: "GRINNING FACE", category: "Smileys & Emotion" },
		{ unified: "1F602", short_name: "joy", short_names: ["joy"], name: "FACE WITH TEARS OF JOY", category: "Smileys & Emotion" }
	]).map(({ emoji, shortcode, aliases }) => ({ emoji, shortcode, aliases })),
	[
		{ emoji: "😀", shortcode: "grinning", aliases: ["grinning"] },
		{ emoji: "😂", shortcode: "joy", aliases: ["joy"] }
	]
);
assert.equal(
	storage.markdownSourceUrl("https://hackmd.io/@h-s-n/doc_test"),
	"https://hackmd.io/@h-s-n/doc_test.md"
);
assert.equal(
	storage.markdownSourceUrl("https://hackmd.io/@h-s-n/doc_test.md"),
	"https://hackmd.io/@h-s-n/doc_test.md"
);
assert.equal(storage.markdownSourceUrl("https://example.com/bundle.md"), "https://example.com/bundle.md");
const appSource = await readFile("km-editor/src/js/app.js", "utf8");
const issuesSource = await readFile("km-editor/src/js/issues.js", "utf8");
const treeSource = await readFile("km-editor/src/js/tree.js", "utf8");
assert.match(appSource, /function openLink\(\)[\s\S]*markdownSourceUrl\(url\)[\s\S]*fetch\(sourceUrl\)[\s\S]*MD: sourceUrl/);
assert.match(appSource, /function renderQueryBuilder\(\)[\s\S]*previewPageQuery\(source\)/);
assert.match(appSource, /function closeCommandMenus\(except = null\)[\s\S]*cancelPageQueryPreview\(\)/);
assert.match(appSource, /function insertPageQuery\(\)[\s\S]*queryOriginalContent = null;[\s\S]*markDirty\(\)/);
assert.match(appSource, /const inCommandMenu = event =>[\s\S]*\.command-menu, \[data-menu-panel\]/);
assert.match(appSource, /document\.addEventListener\("pointerdown"[\s\S]*if \(!inCommandMenu\(event\)\) closeCommandMenus\(\)/);
assert.match(appSource, /event\.detail === 0 && !inCommandMenu\(event\)/, "pointer release is not outside dismissal");
const markdownSource = await readFile("km/src/js/content/markdown_runtime.js", "utf8");
const renderSource = await readFile("km/src/js/content/render.js", "utf8");
const contentStyles = await readFile("km/src/css/content.css", "utf8");
const navSource = await readFile("km/src/js/shell/nav.js", "utf8");
const navStyles = await readFile("km/src/css/nav.css", "utf8");
const decoratorsSource = await readFile("km/src/js/content/decorators.js", "utf8");
const linkPreviewsSource = await readFile("km/src/js/content/previews.js", "utf8");
const overlayStyles = await readFile("km/src/css/overlays.css", "utf8");
const graphSource = await readFile("km/src/js/graph/graph.js", "utf8");
const graphDataSource = await readFile("km/src/js/graph/graph_data.js", "utf8");
const graphStyles = await readFile("km/src/css/graph.css", "utf8");
const lightboxSource = await readFile("km/src/js/content/lightbox.js", "utf8");
const emojiSource = await readFile("km-editor/src/js/emoji.js", "utf8");
const editorStyles = await readFile("km-editor/src/css/styles.css", "utf8");
const oneFileBuilderSource = await readFile("km/scripts/build-offline-onefile.py", "utf8");
const previewSource = await readFile("km-editor/src/preview/content.html", "utf8");
const editorHtml = await readFile("km-editor/index.html", "utf8");
const buildSource = await readFile("build.bat", "utf8");
const editorLauncher = await readFile("start editor.bat", "utf8");
const kmLauncher = await readFile("start km.bat", "utf8");
assert.match(markdownSource, /name: 'inlineSpoiler'[\s\S]*delimiter: '\|\|'/);
// Audio and video playback comes from image syntax pointing at a media file.
const media = await importSource("km/src/js/content/media.js");
assert.equal(media.mediaTag("assets/example-video.webm"), "video");
assert.equal(media.mediaTag("https://cdn.example.com/a/clip.MP4?v=2"), "video");
assert.equal(media.mediaTag("assets/example-audio.wav"), "audio");
assert.equal(media.mediaTag("assets/example-image.png"), "");
assert.equal(media.mediaTag(""), "");
assert.equal(media.assetKind("holiday.JPG"), "image");
assert.equal(media.assetKind("clip.webm"), "video");
assert.equal(media.assetKind("track.flac"), "audio");
assert.equal(media.assetKind("notes.pdf"), "", "Only files markdown can embed are droppable");
// Dropped media lands in the assets folder and is referenced from the drop line.
assert.match(appSource, /function insertDroppedMedia\(textarea, files, index\)[\s\S]*!\[\$\{files\[at\]\.name\.replace/);
assert.match(appSource, /async function saveDroppedMedia\(files\)[\s\S]*getDirectoryHandle\("assets", \{ create: true \}\)/);
assert.match(appSource, /const media = \[\.\.\.\(event\.dataTransfer\?\.files \?\? \[\]\)\]\.filter\(file => assetKind\(file\.name\)\)/);
// The drop caret previews the same spot the drop will use.
assert.match(appSource, /function dropTargetAt\(textarea, clientX, clientY\)[\s\S]*lineEnd: lineStart \+ length/);
assert.match(appSource, /insertDroppedMedia\(textarea, media, target\.lineEnd\)/);
assert.match(appSource, /setSelectionRange\(target\.index, target\.index\)/);
assert.match(appSource, /showDropCaret\(dropTargetAt\(event\.currentTarget, event\.clientX, event\.clientY\), files\)/);
assert.match(appSource, /function hideLinkDropNotice\(\)[\s\S]*els\.dropCaret\.hidden = true/);
assert.match(editorHtml, /id="drop-caret"/);
assert.match(editorStyles, /\.drop-caret \{[\s\S]*pointer-events: none/);
assert.match(editorStyles, /\.drop-caret\.block \{[\s\S]*height: 2px/);
// Published KM leaves paths alone; previews resolve them against the KM root.
assert.equal(media.resolveAssetURL("assets/a.png", ""), "assets/a.png");
assert.equal(media.resolveAssetURL("assets/a.png", "../../../km"), "../../../km/assets/a.png");
assert.equal(media.resolveAssetURL("/assets/a.png", "../../../km/"), "/assets/a.png");
assert.equal(media.resolveAssetURL("https://x.test/a.png", "../../../km/"), "https://x.test/a.png");
assert.match(markdownSource, /renderer: \{ image: renderMediaImage \}/);
assert.match(markdownSource, /function renderMediaImage\([\s\S]*if \(!tag\) return false/);
assert.match(markdownSource, /controls preload="metadata"/, "Media elements use the browser's own player");
assert.match(decoratorsSource, /function resolveAssetPaths\([\s\S]*if \(!ASSET_BASE\) return/);
assert.match(renderSource, /resolveAssetPaths\(root\)/);
for (const preview of [previewSource, await readFile("km-editor/src/preview/full.html", "utf8")])
	assert.match(preview, /ASSET_BASE: "\.\.\/\.\.\/\.\.\/km\/"/);
// Missing image, video, and audio files are yellow warnings.
assert.deepEqual(
	km.assetReferences("![a](assets/x.png)\n\n<video src=\"assets/y.webm\"></video>\n![b](data:image/png;base64,AAA)")
		.map(reference => [reference.url, reference.line]),
	[["assets/x.png", 0], ["assets/y.webm", 2]]
);
const assetPages = [{ uid: "p1", id: "home", title: "Home", content: "![a](assets/gone.png)" }];
assert.deepEqual(km.assetProblems(assetPages, () => false), []);
const [assetProblem] = km.assetProblems(assetPages, url => url === "assets/gone.png");
assert.equal(assetProblem.level, "warning");
assert.equal(assetProblem.code, "missing-asset");
assert.match(assetProblem.text, /references "assets\/gone.png", which does not load/);
assert.match(contentStyles, /#content \.km-media[\s\S]*max-width: 100%/);
assert.match(contentStyles, /#content \.km-video[\s\S]*min-width: 200px;[\s\S]*resize: both;[\s\S]*overflow: hidden;/);
assert.match(previewSource, /"h1,h2,h3,h4,h5,h6,p,li,pre,blockquote,table,img,iframe,video,audio,"/);
assert.match(editorHtml, /data-tool="video"[^>]*>Video<\/button>/);
assert.match(editorHtml, /data-tool="audio"[^>]*>Audio<\/button>/);
assert.equal(
	km.remoteAssetUrls("![Clip](https://cdn.example.com/a/clip.mp4)\n<audio src=\"https://cdn.example.com/a/t.mp3\">").length,
	2,
	"Collect remote assets must pick up media files"
);
assert.match(renderSource, /function wireInlineSpoilers\(root\)[\s\S]*aria-expanded', 'true'/);
assert.match(contentStyles, /\.md-inline-spoiler\.is-revealed/);
assert.match(markdownSource, /renderer: token => emojiHTML\([\s\S]*twitterEmojiURL\(token\.emoji\)/);
assert.match(markdownSource, /CUSTOM_EMOJI_DATA = \/\^data:image/);
assert.match(markdownSource, /name: 'customEmoji'[\s\S]*const custom = customEmojiMap\.get\(match\[1\]\)[\s\S]*if \(!custom\) return/);
assert.match(markdownSource, /title=":\$\{escapeAttribute\(alias\)\}:"/);
assert.match(renderSource, /function wireEmojiFallbacks\(root\)[\s\S]*img\.km-emoji/);
assert.doesNotMatch(renderSource, /km-glossary-page/);
assert.match(contentStyles, /\.km-emoji-box[\s\S]*object-fit: contain/);
assert.doesNotMatch(contentStyles, /km-glossary-page/);
assert.match(navSource, /page\.id === 'km_glossary' \? 'glossary-link'/);
assert.match(navStyles, /#tree \.glossary-link::before/);
assert.match(contentStyles, /#content \.km-query-card[\s\S]*box-sizing: border-box;[\s\S]*max-width: 100%/);
assert.match(contentStyles, /grid-template-columns: minmax\(0, 1fr\) auto 1\.75rem/);
assert.match(contentStyles, /\.km-query-card-link::before[\s\S]*inset: 0/, "the card link covers the whole card");
assert.match(decoratorsSource, /class: 'km-preview-button'/, "internal links get a real preview button");
assert.match(decoratorsSource, /anchor\.matches\('\.km-query-card-link'\)[\s\S]*if \(card\) \{[\s\S]*host\.append\(button\)/, "cards reuse their structural container");
assert.match(decoratorsSource, /title: label[\s\S]*class: 'km-query-card-arrow'[\s\S]*title: t\('preview\.openPage'\)/, "both card actions have tooltips");
assert.match(overlayStyles, /a\.km-has-preview:not\(\.km-query-card-link\)/, "generic link chrome must not override card layout");
assert.match(linkPreviewsSource, /pointerAction: false[\s\S]*openPreview\(trigger, runtime\)/, "hover only reveals; clicking opens");
assert.doesNotMatch(linkPreviewsSource, /HOVER_DELAY_MS|setPendingPreviewLink/);
assert.doesNotMatch(overlayStyles, /data-preview-pending|cursor: progress/);
assert.match(linkPreviewsSource, /function closeUnpinnedFrom[\s\S]*panel\.pinned = !panel\.pinned/, "pinned previews survive automatic cleanup");
assert.match(linkPreviewsSource, /setPointerCapture[\s\S]*clamp\(event\.clientX/, "pinned previews drag within the viewport");
assert.match(linkPreviewsSource, /class: 'km-preview-access'[\s\S]*\[accessLink, pinButton, closeButton\][\s\S]*closest\('button, a'\)[\s\S]*accessLink\.href = buildPageDeepLink\(target\.page, target\.anchor\)/, "normal and pinned previews can navigate to their resolved page");
assert.match(overlayStyles, /\.km-link-preview\.is-pinned[\s\S]*resize: both/);
assert.match(graphSource, /export async function mountQueryGraphs[\s\S]*buildGraphData\(pages\)[\s\S]*ResizeObserver/);
assert.match(graphDataSource, /pageIds\.has\(page\.parent\.id\)/, "query graphs keep only links whose endpoints matched");
assert.match(graphStyles, /\.km-query-graph[\s\S]*\.km-graph-svg/);
assert.match(previewSource, /km:graph-node-open[\s\S]*km-editor-page/, "query graph nodes navigate in the editor preview");
assert.match(overlayStyles, /\.km-link-preview>div>:first-child[\s\S]*margin-top: 0/);
assert.match(overlayStyles, /\.km-preview-button[\s\S]*color: var\(--color-quarter-contrast\)[\s\S]*opacity: 0\.55/);
assert.match(decoratorsSource, /img:not\(\.km-emoji\)/);
assert.match(decoratorsSource, /Promise\.all\(\[ensureHighlight\(\), ensureHLJSTheme\(\)\]\)/);
assert.match(lightboxSource, /img:not\(\.km-emoji\), \.mermaid/);
assert.match(emojiSource, /\{ name: "Custom", icon: "🧩", custom: true \}/);
assert.match(emojiSource, /function customEmojiManager\(\)/);
assert.match(emojiSource, /async function importCustomEmoji\(files\)/);
assert.match(emojiSource, /const files = \[\.\.\.input\.files\][\s\S]*importCustomEmoji\(files\)/);
assert.match(emojiSource, /importCustomEmoji\(\[\.\.\.\(event\.dataTransfer\?\.files \?\? \[\]\)\]\)/);
assert.match(emojiSource, /const scrollTop = root\.scrollTop;[\s\S]*root\.scrollTop = scrollTop;[\s\S]*setActiveGroup\("Custom"\)/);
assert.match(emojiSource, /customAliases\.has\(alias\)/);
assert.match(editorStyles, /\.emoji-themes \.twemoji[\s\S]*filter: grayscale\(1\)/);
assert.match(editorStyles, /\.emoji-autocomplete[\s\S]*position: fixed/);
assert.match(editorStyles, /\.custom-emoji-manager[\s\S]*\.custom-emoji-item/);
assert.match(editorStyles, /\.tree-row\.glossary \.tree-title::before/);
assert.equal([...editorHtml.matchAll(/data-simple-folder-notice/g)].length, 2);
assert.equal([...editorHtml.matchAll(/data-action="turn-into-page"/g)].length, 2);
assert.match(appSource, /function renderEditors\(forcePreview = false\)[\s\S]*pageKind\(state\.pages, page\) === "Simple folder"[\s\S]*readOnly = simpleFolder[\s\S]*textarea\.inert = simpleFolder[\s\S]*data-simple-folder-notice/);
assert.match(appSource, /simpleFolder && state\.mode !== "raw"[\s\S]*modeBeforeSimpleFolder \|\|= state\.mode[\s\S]*setMode\("raw"\)/);
assert.match(appSource, /!simpleFolder && modeBeforeSimpleFolder[\s\S]*setMode\(mode\)/);
assert.match(appSource, /button\.hidden = simpleFolder && button\.dataset\.mode !== "raw"/);
assert.match(appSource, /els\.compareRendered\.hidden = simpleFolder/);
assert.match(appSource, /const canPreview = Boolean\(previewablePage\(page\)\)[\s\S]*els\.previewButton\.disabled = !canPreview/);
assert.match(appSource, /function insertTextIntoTextarea\([\s\S]*textarea\.readOnly\) return false/);
assert.match(appSource, /action === "turn-into-page"/);
assert.match(appSource, /function turnSimpleFolderIntoPage\(\)[\s\S]*syncFirstH1\(page, page\.title\)[\s\S]*markDirty\(\)[\s\S]*renderAll\(true\)/);
assert.match(appSource, /function updateTitle\([\s\S]*pageKind\(state\.pages, page\) !== "Simple folder"[\s\S]*syncFirstH1/);
assert.match(appSource, /function makeSimpleFolder\([\s\S]*setSimpleFolder\(page\)/);
assert.match(editorStyles, /\.source-pane\.simple-folder textarea[\s\S]*background:/);
assert.match(editorStyles, /\.simple-folder-notice \{[\s\S]*place-content: center/);
assert.match(editorStyles, /\.simple-folder-notice button:hover,[\s\S]*background:/);
assert.match(editorStyles, /\.preview-button:disabled,[\s\S]*cursor: default/);
assert.doesNotMatch(editorStyles, /\.compare-view\.active:has\(\.source-pane\.simple-folder\)/);
assert.match(appSource, /function renderInspector\(\)[\s\S]*button\.hidden = simpleFolder \|\| page === mainRootPage\(\)/);
assert.match(appSource, /function renderPreviewFrames\(\)[\s\S]*pageKind\(state\.pages, page\) === "Simple folder"\) return/);
assert.match(appSource, /function openFullPreview\(\)[\s\S]*const page = previewablePage\(\)[\s\S]*fullPreviewFrameUrl\(page\)/);
assert.match(treeSource, /const kindLabel = pageKind\(state\.pages, node\.page\)/);
assert.match(treeSource, /kindLabel === "Folder" \? "▾" : kindLabel === "Simple folder" \? "▹" : "–"/);
assert.match(treeSource, /kind\.setAttribute\("role", "img"\)[\s\S]*kind\.setAttribute\("aria-label", kindLabel\)/);
assert.match(treeSource, /row\.setAttribute\("role", "treeitem"\)[\s\S]*event\.key !== "Enter" && event\.key !== " "/);
assert.match(editorHtml, /id="tree-root"[^>]*role="tree"/);
assert.match(editorStyles, /\.tree-row\.simple-folder \.tree-kind/);
assert.match(editorStyles, /\.tree-row\.simple-folder\.active \.tree-title[\s\S]*var\(--text-strong\)/);
assert.match(appSource, /autocompleteTextareas: \[els\.raw, els\.compareRaw\]/);
assert.match(appSource, /onCustomEmojiChange\(customEmoji\)[\s\S]*markDirty\(\)/);
assert.match(previewSource, /CUSTOM_EMOJI: window\.parent\.kmEditorCustomEmoji \|\| \[\]/);
assert.match(appSource, /snapshotTimer = setTimeout\(saveSnapshot, 1200\)/);
assert.doesNotMatch(editorHtml, /data-action="save-snapshot"/);
assert.doesNotMatch(appSource, /action === "save-snapshot"/);
for (const launcher of [editorLauncher, kmLauncher]) {
	assert.match(launcher, /Get-NetTCPConnection -LocalPort 8765 -State Listen/);
	assert.match(launcher, /dev-server\.py 8765 --bind 127\.0\.0\.1/);
	assert.match(launcher, /http:\/\/127\.0\.0\.1:8765\//);
}
// Modules must not be heuristically cached, or edits keep serving stale copies.
assert.match(await readFile("dev-server.py", "utf8"), /Cache-Control", "no-store/);
assert.match(oneFileBuilderSource, /emojiDataMod, loadCustomEmojiMap\(\)/);
assert.doesNotMatch(buildSource, /build-custom-emoji-index/);
const emojiTestSource = emojiSource.replace(
	/^import .+;\r?\n/,
	'const pkgURL = () => ""; const twitterEmojiURL = () => "";\n'
);
const emoji = await import(
	`data:text/javascript;base64,${Buffer.from(emojiTestSource).toString("base64")}`
);
assert.deepEqual(
	emoji.emojiQueryAtCursor("Hello :smi", 10),
	{ start: 6, end: 10, query: "smi" }
);
assert.deepEqual(
	emoji.emojiQueryAtCursor("(:Hea", 5),
	{ start: 1, end: 5, query: "hea" }
);
assert.equal(emoji.emojiQueryAtCursor("word:smi", 8), null);
assert.equal(emoji.emojiQueryAtCursor(":::spoiler", 10), null);
assert.equal(emoji.emojiQueryAtCursor(":smile:", 7), null);
assert.deepEqual(emoji.fitEmojiSize(512, 256), { width: 128, height: 64 });
assert.deepEqual(emoji.fitEmojiSize(32, 64), { width: 32, height: 64 });
const mermaidSource = await readFile("km-editor/src/js/mermaid.js", "utf8");
// The catalogue is plain data, so it imports as-is; the panel needs its browser
// imports stubbed out.
const samples = await importSource("km-editor/src/js/mermaid_samples.js");
const diagrams = await import(
	`data:text/javascript;base64,${Buffer.from(
		mermaidSource
			.replace(/^import .+mermaid_loader\.js";\r?\n/m, "const ensureDiagramSupport = m => m;\nconst loadMermaid = () => Promise.reject();\n")
			.replace(/^import \{[\s\S]*?\} from "\.\/mermaid_samples\.js";\r?\n/m, "const MERMAID_TEMPLATES = [];\nconst MERMAID_SNIPPETS = {};\n")
	).toString("base64")}`
);
const diagramPage = "intro\n\n```mermaid\nflowchart TD\n  A --> B\n```\n\ntail";
assert.deepEqual(
	diagrams.findMermaidBlocks(diagramPage).map(block => [block.line, block.diagram]),
	[[2, "flowchart TD\n  A --> B"]]
);
assert.equal(diagrams.findMermaidBlocks("```js\nnot a diagram\n```").length, 0);
assert.equal(diagrams.mermaidAtCursor(diagramPage, 20)?.diagram, "flowchart TD\n  A --> B");
assert.equal(diagrams.mermaidAtCursor(diagramPage, 0), null);
assert.equal(diagrams.wrapMermaid("  flowchart TD\n  A --> B  "), "```mermaid\nflowchart TD\n  A --> B\n```");
assert.equal(diagrams.diagramType("%% comment\n\nsequenceDiagram\n  A->>B: hi"), "sequenceDiagram");
assert.equal(diagrams.diagramType("pie title Kinds"), "pie");
// Mermaid's hash.line is zero-based while loc.first_line is one-based.
assert.equal(diagrams.diagramErrorLine({ hash: { line: 1, loc: { first_line: 2 } } }), 2);
assert.equal(diagrams.diagramErrorLine({ hash: { line: 0 } }), 1);
assert.equal(diagrams.diagramErrorLine({ hash: { loc: { first_line: 3 } } }), 3);
assert.equal(diagrams.diagramErrorLine(new Error("boom")), 1);
// Mermaid reports the line inside the diagram; problems point at the real line.
const brokenPages = [{ uid: "p1", id: "home", title: "Home", content: diagramPage }];
assert.deepEqual(diagrams.findDiagramProblems(brokenPages, () => null), []);
const [diagramProblem] = diagrams.findDiagramProblems(brokenPages, () => ({ message: "Parse error", line: 2 }));
assert.equal(diagramProblem.level, "warning");
assert.equal(diagramProblem.code, "invalid-diagram");
assert.equal(diagramPage.split("\n")[diagramProblem.line], "  A --> B");
assert.match(diagramProblem.text, /diagram that will not render: Parse error/);
const diagramTypes = samples.MERMAID_TEMPLATES.map(template => template.type);
assert.equal(new Set(diagramTypes).size, diagramTypes.length, "One entry per diagram type");
for (const template of samples.MERMAID_TEMPLATES) {
	assert.ok(template.variants.length, `${template.name} needs at least one variant`);
	assert.equal(
		diagrams.diagramType(template.variants[0].source),
		template.type,
		`${template.name} declares a type its sample does not use`
	);
	const names = template.variants.map(variant => variant.name);
	assert.equal(new Set(names).size, names.length, `${template.name} has duplicate variant names`);
}
for (const type of Object.keys(samples.MERMAID_SNIPPETS))
	assert.ok(diagramTypes.includes(type), `Snippets for ${type} need a matching sample`);
// Every type Mermaid 11.16 can parse, checked against the live parser in the browser.
for (const type of [
	"flowchart", "sequenceDiagram", "classDiagram", "stateDiagram-v2", "erDiagram", "journey",
	"gantt", "pie", "quadrantChart", "requirementDiagram", "gitGraph", "C4Context", "mindmap",
	"timeline", "sankey-beta", "xychart-beta", "block-beta", "packet", "kanban",
	"architecture-beta", "radar-beta", "treemap-beta", "venn-beta", "ishikawa-beta",
	"wardley-beta", "cynefin-beta", "eventmodeling", "treeView-beta", "zenuml",
	"railroad-abnf-beta", "railroad-ebnf-beta", "railroad-beta", "railroad-peg-beta"
]) assert.ok(diagramTypes.includes(type), `Missing diagram template: ${type}`);
// ZenUML is not in Mermaid core; it must be registered from its own package.
assert.match(await readFile("km/src/js/content/mermaid_loader.js", "utf8"), /registerExternalDiagrams/);
assert.match(deps.pkgURL("@mermaid-js/mermaid-zenuml"), /mermaid-zenuml@0\.2\.3/);
assert.match(markdownSource, /ensureDiagramSupport\(mermaid, node\.dataset\.mmdSrc\)/, "Published pages load plugins too");
// Samples replace the diagram, parts add a line: the panel must say which.
assert.match(editorHtml, /Start from a sample<small>replaces the whole diagram/);
assert.match(editorHtml, /Add a part<small>inserts one line at the cursor/);
assert.match(mermaidSource, /function openVariantMenu\(button\)/);
assert.match(mermaidSource, /document\.addEventListener\("pointerdown"[\s\S]*closeVariantMenu\(\)/, "variant menus dismiss on outside press");
assert.match(editorStyles, /\.mermaid-variants \{[\s\S]*position: absolute/);
assert.match(deps.pkgURL("mermaid"), /mermaid@11\.16\.0/, "Newer diagram types need Mermaid 11.16");
// Keywords cannot be placeholder names.
assert.doesNotMatch(
	JSON.stringify(samples.MERMAID_SNIPPETS["architecture-beta"]),
	/in group"/,
	"`group` is a keyword in architecture diagrams"
);
assert.match(mermaidSource, /securityLevel: "strict"/, "Diagrams render inside the editor page");
assert.match(issuesSource, /"invalid-diagram": \{ label: "Edit diagram"/);
assert.match(issuesSource, /function queueDiagramChecks\(\)[\s\S]*renderProblems\(validateEditorState\(\)\)/);
assert.match(editorHtml, /id="mermaid-builder"[^>]*data-menu-panel="mermaid-builder"/);
assert.match(editorHtml, /id="mermaid-toolbar"[\s\S]*Edit diagram/);
assert.match(editorStyles, /\.mermaid-body[\s\S]*grid-template-columns/);
assert.match(markdownSource, /mermaidReady = loadMermaid\(\)/, "One pinned Mermaid import");

const mathSource = await readFile("km-editor/src/js/math.js", "utf8");
const math = await import(
	`data:text/javascript;base64,${Buffer.from(
		mathSource.replace(/^import .+;\r?\n/m, 'const pkgURL = () => "";\n')
	).toString("base64")}`
);
for (const category of math.MATH_CATEGORIES) {
	for (const group of category.groups) {
		if (group.templates) {
			for (const template of group.templates)
				assert.ok(template.name && template.latex, `Templates need a name and latex: ${group.title}`);
			continue;
		}
		for (const snippet of group.items.split(/\s+/)) {
			assert.ok(snippet.length, `Empty snippet in ${category.id}/${group.title}`);
			assert.doesNotMatch(snippet, /\s/, `Palette snippets cannot contain spaces: ${snippet}`);
		}
	}
}
const mathCategoryIds = math.MATH_CATEGORIES.map(category => category.id);
assert.equal(new Set(mathCategoryIds).size, mathCategoryIds.length, "Math category ids must be unique");
for (const id of ["common", "greek", "text", "science"])
	assert.ok(mathCategoryIds.includes(id), `Missing math category: ${id}`);
assert.deepEqual(
	math.mathAtCursor("text $E=mc^2$ more", 8),
	{ start: 5, end: 13, display: false, latex: "E=mc^2" }
);
assert.deepEqual(
	math.mathAtCursor("a\n\n$$\n\\frac{1}{2}\n$$\n\nb", 8),
	{ start: 3, end: 20, display: true, latex: "\\frac{1}{2}" }
);
// A price line is not math: KM's inline rule ignores `$` before a digit.
assert.equal(math.mathAtCursor("costs $5 and $6 today", 10), null);
assert.equal(math.mathAtCursor("no math here", 4), null);
assert.equal(math.wrapMath("  E=mc^2  "), "$E=mc^2$");
assert.equal(math.wrapMath("2x+1"), "${}2x+1$", "Inline math starting with a digit needs an opening group");
assert.equal(math.wrapMath("a\n b", false), "$a b$", "Inline math stays on one line");
assert.equal(math.wrapMath("\\frac{a}{b}", true), "$$\n\\frac{a}{b}\n$$");
assert.equal(math.snippetCaret("\\frac{}{}"), 6, "The caret lands inside the first placeholder");
assert.equal(math.snippetCaret("\\alpha"), 6);
assert.equal(math.sampleSnippet("\\frac{}{}"), "\\frac{a}{b}", "Palette previews show samples, not empty boxes");
assert.equal(math.findFormulas("`$x$` and $y$").length, 1, "Inline code is not math");
assert.equal(math.findFormulas("```\n$x$\n```\n").length, 0, "Fenced code is not math");
assert.equal(math.findFormulas("$$a+b$$").length, 1, "A one-line display block counts once");
assert.deepEqual(
	math.findFormulas("intro\n\n$$\nx^2\n$$\n\ntail $y$ end").map(formula => [formula.display, formula.latex]),
	[[true, "x^2"], [false, "y"]]
);
assert.match(appSource, /function openMathBuilder\(display = false\)[\s\S]*mathAtCursor\(mathTarget\.value/);
// Both content warnings offer a jump-to-source fix.
assert.match(issuesSource, /"invalid-math": \{ label: "Edit formula"/);
assert.match(issuesSource, /"missing-asset": \{ label: "Edit source"/);
assert.match(appSource, /function revealProblemSource\(problem\)[\s\S]*setSelectionRange\(problem\.start, problem\.end\)/);
assert.match(issuesSource, /function openProblemMathEditor\(problem\)[\s\S]*openMathBuilder\(\)/);
// Only panel-opening fixes stop the click, or the document handler closes them.
assert.deepEqual(
	[...issuesSource.matchAll(/"([\w-]+)": \{ label: [^}]*panel: true/g)].map(([, code]) => code),
	["invalid-query", "query-missing-parent", "invalid-math", "invalid-diagram"]
);
assert.match(appSource, /function updateMathToolbar\(\)[\s\S]*els\.mathToolbar\.hidden = !math/);
assert.match(editorHtml, /id="math-builder"[^>]*data-menu-panel="math-builder"/);
assert.match(editorHtml, /id="math-toolbar"[\s\S]*Edit formula/);
assert.match(editorStyles, /\.math-palette[\s\S]*grid-template-columns/);
const logoData = `data:image/webp;base64,${(await readFile("km/assets/logo.webp")).toString("base64")}`;
assert.deepEqual(km.normalizeCustomEmoji([
	{ alias: "smile", data: logoData },
	{ alias: "smile", data: logoData },
	{ alias: "../bad", data: logoData }
]), [{ alias: "smile", data: logoData }]);
const datedPage = { content: "Before", updated: "2000-01-01" };
assert.equal(km.setPageContent(datedPage, "After", "2040-02-03"), true);
assert.deepEqual(datedPage, { content: "After", updated: "2040-02-03" });
assert.equal(km.setPageContent(datedPage, "After", "2050-01-01"), false);

const simpleState = km.createStarterState();
const simpleFolder = km.createPage(simpleState.pages, "simple", "home", "Topics");
simpleState.pages.push(simpleFolder);
assert.equal(simpleFolder.content, "");
assert.equal(simpleFolder.kind, "simple");
assert.equal(km.pageKind(simpleState.pages, simpleFolder), "Simple folder");
const simpleChild = km.createPage(simpleState.pages, "page", simpleFolder.id, "Child");
simpleState.pages.push(simpleChild);
assert.equal(km.pageKind(simpleState.pages, simpleFolder), "Simple folder");
const simpleCopy = km.duplicatePage(simpleState, simpleFolder);
assert.equal(simpleCopy.kind, "simple", "duplicating a simple folder preserves its identity without copying children");
assert.equal(km.pageKind(simpleState.pages, simpleCopy), "Simple folder");
const explicitSimpleSource = km.serializeBundle({ preamble: "", pages: [simpleCopy] });
assert.match(explicitSimpleSource, /kind:"simple"/);
assert.equal(km.parseBundle(explicitSimpleSource).pages[0].kind, "simple");
km.setPageContent(simpleFolder, "# Topics", "2040-02-03");
assert.equal(simpleFolder.kind, undefined, "adding content clears explicit simple-folder identity");
assert.equal(km.pageKind(simpleState.pages, simpleFolder), "Folder");
assert.equal(simpleFolder.updated, "2040-02-03");

const emptiedPage = km.createPage(simpleState.pages, "page", "home", "Empty draft");
km.setPageContent(emptiedPage, "", "2040-02-04");
assert.equal(km.pageKind([...simpleState.pages, emptiedPage], emptiedPage), "Page", "emptying a page does not mark it simple");
assert.equal(km.setSimpleFolder(emptiedPage), true);
assert.equal(km.pageKind([...simpleState.pages, emptiedPage], emptiedPage), "Simple folder");
km.setPageContent(emptiedPage, "# Empty draft");
assert.equal(km.pageKind([...simpleState.pages, emptiedPage], emptiedPage), "Page");

const legacySimple = km.parseBundle(`<!--km
id:"home"
title:"Home"
-->

# Home

<!--km
id:"legacy"
title:"Legacy folder"
parent:"home"
-->

<!--km
id:"legacy_child"
title:"Legacy child"
parent:"legacy"
-->

# Legacy child
`);
const upgradedLegacy = legacySimple.pages.find(page => page.id === "legacy");
assert.equal(upgradedLegacy.kind, "simple", "legacy empty parents are upgraded while parsing bundles");
assert.match(km.serializeBundle(legacySimple), /id:"legacy"[\s\S]*?kind:"simple"/);

const state = km.createStarterState();
const home = state.pages.find(page => page.id === "home");
const first = state.pages.find(page => page.id === "first_page");
home.content += "\n\n[Read](#first_page)\n\n![[first_page#Start]]";
km.updatePageMeta(state, first, { id: "intro" });
assert.match(home.content, /\(#intro\)/);
assert.match(home.content, /!\[\[intro#Start\]\]/);
assert.equal(first.parent, "home");
km.updatePageMeta(state, first, { id: "" });
km.updatePageMeta(state, first, { id: "getting_started" });
assert.match(home.content, /\(#getting_started\)/);
assert.match(home.content, /!\[\[getting_started#Start\]\]/);

const moveState = km.createStarterState();
const moveHome = moveState.pages[0];
const folder = km.createPage(moveState.pages, "folder", "home", "Folder");
moveState.pages.push(folder);
const leaf = km.createPage(moveState.pages, "page", folder.id, "Leaf");
moveState.pages.push(leaf);
moveHome.content += `\n\n[Leaf](#${folder.id}#${leaf.id}#1)`;
assert.equal(km.movePage(moveState, leaf.uid, moveHome.uid, "inside"), true);
assert.match(moveHome.content, new RegExp(`\\(#${leaf.id}#1\\)`));

const serialized = km.serializeBundle(state);
assert.match(serialized, /trail:"Getting started"/);
assert.equal(km.parseBundle(serialized).pages[0].trail, "Getting started");

const editorState = km.parseEditorState(km.serializeEditorState({
	...state,
	fileName: "guide.md",
	config: {
		TITLE: "Guide",
		ACCENT: "#123456",
		CUSTOM_EMOJI: [{ alias: "smile", data: logoData }]
	}
}));
assert.equal(editorState.fileName, "guide.md");
assert.deepEqual(editorState.pages.map(page => page.id), state.pages.map(page => page.id));
assert.equal(editorState.pages[0].title, state.pages[0].title);
assert.equal(editorState.config.ACCENT, "#123456");
assert.deepEqual(editorState.config.CUSTOM_EMOJI, [{ alias: "smile", data: logoData }]);

assert.deepEqual(
	km.remoteAssetUrls('![Photo](https://example.com/a.png)\n[Site](https://example.com)\n[PDF](https://example.com/a.pdf)'),
	["https://example.com/a.png", "https://example.com/a.pdf"]
);

const pages = [
	{
		id: "home",
		title: "Home",
		hash: "",
		content: '{{pages tag="guide" sort="title" view="table"}}',
		tags: "",
		trail: "",
		updated: "2026-07-24",
		searchStr: ""
	},
	{
		id: "guide",
		title: "Guide",
		hash: "guide",
		content: "# Guide\n\n## Install\n\nInstall body.\n\n### Detail\n\nNested detail.\n\n## Other\n\nOther body.",
		tags: "guide,docs",
		trail: "Trail demo,Other trail",
		updated: "2026-07-24",
		searchStr: "guide install"
	}
];
assert.match(directives.expandPageDirectives(pages[0], pages), /\[Guide\]\(#guide\)/);
const section = directives.extractSectionMarkdown(pages[1].content, "Install");
assert.match(section.body, /Nested detail/);
assert.doesNotMatch(section.body, /Other body/);

pages[0].content = "![[guide#Install]]";
const transclusion = directives.expandPageDirectives(pages[0], pages);
assert.match(transclusion, /From \[Guide\]\(#guide#1_1\)/);
assert.match(transclusion, /Install body/);
assert.match(transclusion, /data-km-source-page="guide"/);
assert.match(transclusion, /data-km-source-line="\d+"/);

const simpleTarget = {
	id: "labels",
	title: "Labels",
	kind: "simple",
	content: "",
	hash: "labels"
};
pages.push(simpleTarget);
pages[0].content = "![[labels]]";
assert.equal(
	directives.expandPageDirectives(pages[0], pages, page => page.kind !== "simple"),
	"![[labels]]",
	"navigation-only folders are not expanded as empty quotes"
);
assert.match(directives.findDirectiveProblems(pages)[0].text, /navigation-only folder/);
pages.pop();

// A transclusion inside an inline code span is being shown, not used. The
// renderer and the validator have to agree, or a page renders a broken-pull
// notice that the Issues panel never reported.
pages[0].content = "Shown: `![[guide]]` and `![[no_such_page]]`.\n\nUsed:\n\n![[guide]]\n";
const spanned = directives.expandPageDirectives(pages[0], pages);
assert.match(spanned, /`!\[\[guide\]\]`/, "code-span transclusion stays literal");
assert.match(spanned, /`!\[\[no_such_page\]\]`/, "code-span missing target stays literal");
assert.doesNotMatch(spanned, /Missing transclusion/, "no notice for a shown transclusion");
assert.match(spanned, /From \[Guide\]/, "a real transclusion on its own line still expands");
assert.deepEqual(
	directives.findDirectiveProblems(pages).filter(problem => problem.code !== "broken-link"),
	[],
	"validator reports nothing for transclusions that only appear in code spans"
);

pages[0].content = '{{pages tag="guide" view="cards"}}';
const cards = directives.expandPageDirectives(pages[0], pages);
assert.match(cards, /class="km-query-cards"/);
assert.match(cards, /class="km-query-card"/);
assert.match(cards, /class="km-query-card"><a class="km-query-card-link"/, "cards have one container and one stretched link");
assert.match(cards, /guide · docs/);

pages[0].content = '{{pages trail="Trail demo" view="timeline"}}';
const timeline = directives.expandPageDirectives(pages[0], pages);
assert.match(timeline, /\[Guide\]/);
assert.doesNotMatch(timeline, /—/);

pages[0].content = '{{pages tag="guide" view="graph"}}';
const graph = directives.expandPageDirectives(pages[0], pages);
assert.match(graph, /class="km-query-graph"/);
assert.match(graph, /data-pages="\[&quot;guide&quot;\]"/);
assert.deepEqual(directives.findDirectiveProblems(pages), []);
assert.match(editorHtml, /name="view" value="graph"/);

const querySource = directives.serializePageQuery({
	tag: "guide",
	parent: "home",
	trail: "Trail demo",
	text: 'API "client"',
	current: "false",
	sort: "updated",
	limit: "4",
	empty: "Nothing here",
	view: "cards"
});
const queryDocument = `Before\n${querySource}\nAfter`;
const queryAtCursor = directives.pageQueryAtCursor(queryDocument, querySource.length);
assert.deepEqual(queryAtCursor.options, {
	tag: "guide",
	parent: "home",
	trail: "Trail demo",
	text: 'API "client"',
	current: "false",
	sort: "updated",
	limit: "4",
	empty: "Nothing here",
	view: "cards"
});
assert.equal(queryDocument.slice(queryAtCursor.start, queryAtCursor.end), querySource);

const example = km.parseBundle(await readFile("_content_examples/km-docs.md", "utf8"));
assert.ok(example.pages.every(page => page.id), "the manual must not create pages from inline KM header examples");
assert.ok(example.pages.some(page => page.id === "reading_trails"));
assert.equal(km.pageKind(example.pages, example.pages.find(page => page.id === "simple_folder_example")), "Simple folder");
assert.equal(example.pages.find(page => page.id === "simple_folder_child").parent, "simple_folder_example");
assert.equal(example.pages.filter(page => page.trail === "Trail demo").length, 3);
assert.match(example.pages.find(page => page.id === "reading_trails").content, /\{\{pages trail="Trail demo" view="cards"\}\}/);
for (const id of ["workspace", "writing", "page_config", "preview", "problems_history", "undo_history", "km_config", "open_save_publish", "assets_builds", "shortcuts"])
	assert.ok(example.pages.some(page => page.id === id), `Missing editor manual page: ${id}`);
assert.match(example.pages.find(page => page.id === "problems_history").content, /Every issue has a fix button/);
assert.match(example.pages.find(page => page.id === "undo_history").content, /Undo and redo/);
assert.match(example.pages.find(page => page.id === "organize_pages").content, /Raw, Compare, and Rendered page views are unavailable[\s\S]*Turn into page/);
assert.match(example.pages.find(page => page.id === "live_queries").content, /rendered result update together/);
assert.match(example.pages.find(page => page.id === "live_queries").content, /view="graph"/);
assert.deepEqual(
	example.pages.filter(page => page.tags).map(page => [page.id, page.tags]),
	[["quick_start", "query-demo"], ["pages_and_links", "query-demo"]]
);
assert.match(example.pages.find(page => page.id === "live_queries").content, /\{\{pages tag="query-demo"/);

const missingLanguages = km.findMissingCodeLanguages(
	"> *example:*\n> ```md\n> bundle source\n> ```\n\n```js\nalert('loaded')\n```\n\n```py\nprint('missing')\n```",
	["javascript"]
);
assert.deepEqual(missingLanguages, [
	{ language: "md", module: "markdown", line: 1 },
	{ language: "py", module: "python", line: 9 }
]);
const languageState = km.createStarterState();
languageState.pages[0].content = "> ```md\n> bundle source\n> ```\n\n```py\nprint('missing')\n```";
assert.deepEqual(
	km.validateState(languageState).filter(message => message.level === "warning").map(message => message.text),
	['Code language "md" is not loaded.', 'Code language "py" is not loaded.']
);
const oldStress = km.parseBundle(await readFile("_content_examples/old stresstest.md", "utf8"));
assert.equal(km.findMissingCodeLanguages(oldStress.pages[0].content)[0]?.language, "md");

const problemStress = km.parseBundle(await readFile("_content_examples/editor-problems-stresstest.md", "utf8"));
const problemMessages = km.validateState({ ...problemStress, config: km.createDefaultConfig() });
const directiveProblems = directives.findDirectiveProblems(problemStress.pages);
assert.equal(problemMessages.length, 15);
assert.equal(directiveProblems.length, 6);
assert.deepEqual(
	[...new Set(problemMessages.map(message => message.code))].sort(),
	[
		"broken-link",
		"duplicate-glossary-alias",
		"duplicate-glossary-term",
		"duplicate-id",
		"invalid-date",
		"invalid-id",
		"missing-id",
		"missing-language",
		"missing-parent",
		"parent-cycle",
		"self-parent"
	]
);
assert.deepEqual(
	[...new Set(directiveProblems.map(message => message.code))].sort(),
	[
		"circular-transclusion",
		"invalid-query",
		"missing-transclusion",
		"missing-transclusion-section",
		"query-missing-parent"
	]
);
// KaTeX cannot run here, so the math check is driven by a stand-in renderer.
const brokenMath = latex => (/\\fraq/.test(latex) || /\{[^{}]*$/.test(latex) ? "Expected '}'" : "");
const mathProblems = math.findMathProblems(problemStress.pages, brokenMath);
assert.equal(mathProblems.length, 2, "The stress test has exactly two broken formulas");
assert.ok(mathProblems.every(problem => problem.code === "invalid-math" && problem.level === "warning"));
assert.ok(mathProblems.every(problem => /will not render/.test(problem.text)));
assert.deepEqual(
	mathProblems.map(problem =>
		problemStress.pages.find(page => page.uid === problem.pageUid).content.split("\n")[problem.line]
	),
	["$$", "Inline $\\fraq{1}{2}$ is a typo for `\\frac`."]
);
assert.deepEqual(math.findMathProblems(problemStress.pages), [], "Without KaTeX no formula is judged");
// The stress bundle carries three dead references and three shipped examples.
const stressAssets = problemStress.pages.flatMap(page => km.assetReferences(page.content).map(r => r.url));
assert.deepEqual(
	stressAssets.filter(url => url.includes("does-not-exist")),
	["assets/does-not-exist.png", "assets/does-not-exist.webm", "assets/does-not-exist.wav"]
);
for (const example of ["assets/example-image.png", "assets/example-video.webm", "assets/example-audio.wav"]) {
	assert.ok(stressAssets.includes(example), `Stress test must show a working ${example}`);
	await readFile(`km/${example}`);
}
assert.equal(
	km.assetProblems(problemStress.pages, url => url.includes("does-not-exist")).length,
	3,
	"Missing media is reported once per reference"
);
assert.equal(problemMessages.filter(message => message.code === "self-parent").length, 1);
assert.equal(directiveProblems.find(message => message.code === "invalid-query")?.options.parent, "does_not_exist");
for (const pattern of [
	/is missing an id/,
	/id cannot contain "#"/,
	/Duplicate page id/,
	/Code language "md" is not loaded/,
	/Code language "python" is not loaded/,
	/Code language "js" is not loaded/,
	/cannot parent itself/,
	/references missing parent/,
	/is in a parent cycle/,
	/broken KM link/,
	/invalid updated date/,
	/Glossary alias/,
	/has 2 entries/
]) assert.ok(problemMessages.some(message => pattern.test(message.text)), `Missing problem: ${pattern}`);
assert.equal(problemMessages.length + directiveProblems.length, 21);
assert.equal([...problemMessages, ...directiveProblems].filter(message => message.level === "error").length, 13);
assert.equal([...problemMessages, ...directiveProblems].filter(message => message.level === "warning").length, 8);
problemStress.pages.find(page => page.id === "blank_title_trigger").title = "";
assert.ok(km.validateState(problemStress).some(message => /is missing a title/.test(message.text)));

const repairStress = km.parseBundle(await readFile("_content_examples/editor-problems-stresstest.md", "utf8"));
repairStress.config = km.createDefaultConfig();
for (;;) {
	const problem = km.validateState(repairStress).find(message => message.level !== "ok");
	if (!problem) break;
	const value =
		problem.code === "duplicate-id"
			? { pageUid: problem.pageUids[1], id: "duplicate_id_b" }
			: problem.code === "missing-parent"
				? { parent: "problem_dashboard" }
				: problem.code === "invalid-date"
					? { updated: "2026-07-24" }
					: problem.code === "duplicate-glossary-alias"
						? { surface: "Unique surface" }
						: problem.code === "duplicate-glossary-term"
							? { keepEntry: problem.entries[1].entry }
						: problem.code === "broken-link"
							? { targetPageUid: repairStress.pages[0].uid, anchor: "" }
				: {};
	assert.equal(km.repairProblem(repairStress, problem, value), true, `Could not repair ${problem.code}`);
}
assert.deepEqual(km.validateState(repairStress).map(message => message.level), ["ok"]);
assert.doesNotMatch(repairStress.pages.find(page => page.id === "km_glossary").content, /First actual entry/);
assert.match(repairStress.pages.find(page => page.id === "km_glossary").content, /Second actual entry/);
for (;;) {
	const problem = directives.findDirectiveProblems(repairStress.pages)[0];
	if (!problem) break;
	const target = repairStress.pages.find(page => page.id === "blank_title_trigger");
	const value =
		problem.code === "invalid-query"
			? { source: '{{pages view="list"}}' }
			: { targetPageUid: target.uid, section: "" };
	assert.equal(km.repairProblem(repairStress, problem, value), true, `Could not repair ${problem.code}`);
}
assert.deepEqual(directives.findDirectiveProblems(repairStress.pages), []);
const titlePage = repairStress.pages.find(page => page.id === "blank_title_trigger");
titlePage.title = "";
const titleProblem = km.validateState(repairStress).find(message => message.code === "missing-title");
assert.equal(km.repairProblem(repairStress, titleProblem, { title: "Restored title" }), true);
assert.deepEqual(km.validateState(repairStress).map(message => message.level), ["ok"]);

const plainMarkdown = await readFile("_content_examples/editor-no-header-stresstest.md", "utf8");
const importedMarkdown = km.parseBundle(plainMarkdown);
assert.equal(importedMarkdown.pages[0].content, plainMarkdown.trim());
const importProblem = km.validateState(importedMarkdown).find(message => message.code === "missing-km-header");
assert.ok(importProblem);
assert.equal(km.repairProblem(importedMarkdown, importProblem), true);
assert.deepEqual(km.validateState(importedMarkdown).map(message => message.level), ["ok"]);

// Every generated KM link must carry the page's whole parent chain. Dropping a
// page into the editor and the Link tool both used to emit the bare id, which
// only resolves for top-level pages; nested targets produced a broken link.
{
	const header = (id, title, parent) =>
		`<!--km
id:"${id}"
title:"${title}"${parent ? `
parent:"${parent}"` : ""}
-->

# ${title}
`;
	const bundle = body =>
		[
			header("home", "Home"),
			body,
			header("organize_pages", "Organize pages", "home"),
			header("pages_and_links", "Pages and links", "organize_pages")
		].join("\n");

	const routed = km.parseBundle(bundle(""));
	const nested = routed.pages.find(page => page.id === "pages_and_links");
	assert.equal(km.pageRoute(routed.pages, nested), "organize_pages#pages_and_links");
	assert.equal(km.pageRoute(routed.pages, routed.pages[0]), "", "the root page routes to an empty hash");
	const reordered = [routed.pages[1], routed.pages[0], ...routed.pages.slice(2)];
	assert.equal(km.pageRoute(reordered, routed.pages[0]), "", "home remains the root when it is not first");
	const reorderedState = { pages: reordered, activeUid: null };
	assert.equal(km.findPage(reorderedState).id, "home", "editor fallback selection matches the runtime root");
	const detached = { ...km.createPage(routed.pages, "page", "", "Detached"), id: "detached" };
	const detachedChild = { ...km.createPage([...routed.pages, detached], "page", "detached", "Detached child"), id: "detached_child" };
	assert.equal(
		km.pageRoute([...routed.pages, detached, detachedChild], detachedChild),
		"detached#detached_child",
		"a detached subtree includes its top-level id"
	);

	const brokenLinks = markdown => {
		const state = km.parseBundle(markdown);
		return km.validateState({ ...state, config: km.createDefaultConfig(), activeUid: state.pages[0].uid })
			.filter(problem => problem.code === "broken-link").length;
	};
	assert.equal(brokenLinks(bundle("[Nested](#organize_pages#pages_and_links)")), 0, "a full route resolves");
	assert.equal(brokenLinks(bundle("[Nested](#pages_and_links)")), 1, "the bare id does not resolve");
	const simpleLinkBundle = km.serializeBundle({
		preamble: "",
		pages: [
			routed.pages[0],
			{ ...routed.pages[1], content: "", kind: "simple" },
			routed.pages[2]
		]
	});
	assert.equal(brokenLinks(simpleLinkBundle.replace("# Home", "# Home\n\n[Folder](#organize_pages)")), 1, "a simple folder is not a direct link target");
	assert.equal(brokenLinks(simpleLinkBundle.replace("# Home", "# Home\n\n[Child](#organize_pages#pages_and_links)")), 0, "a child route may pass through a simple folder");

	// The two places that write links must both go through pageRoute().
	assert.ok(
		appSource.includes("](#${pageRoute(state.pages, page)})`)"),
		"the page-drop handler builds its route with pageRoute()"
	);
	const dialogsSource = await readFile("km-editor/src/js/dialogs.js", "utf8");
	assert.ok(
		dialogsSource.includes("const route = pageRoute(state.pages, page)"),
		"the link modal builds its route with pageRoute()"
	);
	assert.ok(
		!dialogsSource.includes("route: `#${page.id}`"),
		"the link modal no longer emits a bare page id"
	);
}

// The remembered preview selection must be a snapshot of the live frames, not a
// value read back through readPreviewSelection(). Reading through it meant an
// empty frame re-remembered the previous value, so one preview selection stuck
// forever and later formatbar presses wrapped that stale text.
{
	const body = /function rememberPreviewSelection\(\) \{([\s\S]*?)\n\}/.exec(appSource)?.[1] ?? "";
	assert.ok(body.length, "rememberPreviewSelection still exists");
	assert.ok(body.includes("readFrameSelection"), "it snapshots the frames directly");
	assert.ok(
		!body.includes("readPreviewSelection"),
		"it must not read back through its own fallback"
	);
	assert.ok(!/if \(selection\)/.test(body), "it must overwrite with an empty selection too");
}

// insertBlock builds a concrete snippet, so it must never substitute the current
// selection. It used to insert `selection || snippet`, which meant picking a
// table size inserted whatever happened to be selected instead of the table --
// including a stale *preview pane* selection, since selectedText() falls back to
// readPreviewSelection(). That flattened rendered KaTeX into the document.
{
	const body = /function insertBlock\(snippet\) \{([\s\S]*?)\n\}/.exec(appSource)?.[1] ?? "";
	assert.ok(body.length, "insertBlock still exists");
	assert.ok(body.includes("${snippet}"), "insertBlock inserts the snippet it was given");
	assert.ok(
		!body.includes("selectedText"),
		"insertBlock must not fall back to the current selection"
	);
}

// The full preview reproduces KM's shell markup in its own file, which AGENTS.md
// warns against. Until it is generated from km/index.html, this is the guard:
// any landmark or command added to one and not the other fails here instead of
// silently making the preview diverge from the published page.
{
	const kmShell = await readFile("km/index.html", "utf8");
	const previewShell = await readFile("km-editor/src/preview/full.html", "utf8");
	const attrSet = (source, attr) =>
		[...source.matchAll(new RegExp(`\\s${attr}="([^"]+)"`, "g"))].map(match => match[1]).sort();
	for (const attr of ["id", "data-command"])
		assert.deepEqual(
			attrSet(previewShell, attr),
			attrSet(kmShell, attr),
			`full.html and km/index.html must expose the same ${attr} set; update both or generate one from the other`
		);
}

console.log("OK: refactors, trails, assets, query views, docs examples, transclusion, and code-language checks pass.");
