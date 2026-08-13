import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("km-editor/src/js/toolbar.js", "utf8");
const toolbar = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const details = { ...toolbar.TOOL_DETAILS, ...toolbar.ACTION_DETAILS };
const shortcuts = Object.values(details).map(item => item.key);

assert.equal(new Set(shortcuts).size, shortcuts.length, "Toolbar shortcuts must be unique");
assert.ok(
	Object.values(details).every(item => /<[\w]/.test(item.example)),
	"Every toolbar preview must use rendered KM-style markup"
);
assert.ok(
	Object.values(details).every(item => typeof item.syntax === "string" && item.syntax.length),
	"Every toolbar command must document its markdown syntax"
);
for (const groups of Object.values(toolbar.CHEATSHEET_EXTRAS)) {
	for (const row of groups.flatMap(group => group.rows)) {
		assert.ok(row.label && row.syntax && row.example != null, "Cheatsheet extras need label, syntax, and example");
	}
}
for (const item of Object.values(details)) {
	const parts = item.key.split("+");
	assert.equal(
		toolbar.shortcutKey({
			code: parts.at(-1),
			ctrlKey: parts.includes("Mod"),
			metaKey: false,
			altKey: parts.includes("Alt"),
			shiftKey: parts.includes("Shift")
		}),
		item.key
	);
}

const html = await readFile("km-editor/index.html", "utf8");
assert.match(html, /data-history-action="undo"/);
assert.match(html, /data-history-action="redo"/);
assert.match(html, /data-tool="inline-spoiler"[^>]*>Inline spoiler<\/button>/);
assert.match(html, /data-tool="spoiler"[^>]*>Spoiler block<\/button>/);
assert.match(html, /data-tool="mermaid"[^>]*>Mermaid diagram<\/button>/);
assert.match(html, /data-tool="page-query"[^>]*>Page query<\/button>/);
assert.match(html, /data-tool="youtube"[^>]*>YouTube<\/button>/);
assert.match(html, /data-menu-panel="embeds" data-tool-list[\s\S]*data-tool="emoji"[^>]*>Emoji<\/button>/);
assert.doesNotMatch(html, /data-menu="emoji"/, "Emoji belongs to Insert and reaches its picker through the tool command");
const menuCommands = [...html.matchAll(/data-tool-list[^>]*>([\s\S]*?)<\/div>/g)]
	.flatMap(([, menu]) => [...menu.matchAll(/data-(tool|action)="([^"]+)"/g)])
	.map(([, type, id]) => `${type}:${id}`);
const detailedCommands = [
	...Object.keys(toolbar.TOOL_DETAILS).map(id => `tool:${id}`),
	...Object.keys(toolbar.ACTION_DETAILS).map(id => `action:${id}`)
];
assert.deepEqual(new Set(menuCommands), new Set(detailedCommands), "Every menu command needs display details");
for (const id of ["note", "tip", "important", "warning", "caution"])
	assert.ok(menuCommands.includes(`tool:${id}`), `Missing callout tool: ${id}`);
for (const group of ["Emphasis", "Special text", "Headings", "Lists", "Callouts", "Quotes and sections", "Links and references", "Media", "Code, diagrams, and formulas", "Advanced", "Reuse page content", "Create pages"])
	assert.match(html, new RegExp(`class="tool-group-title">${group}</strong>`), `Missing toolbar group: ${group}`);
assert.match(html, /data-action="cheatsheet"/, "The command bar needs the cheatsheet help button");
for (const key of Object.keys(toolbar.CHEATSHEET_EXTRAS)) {
	assert.match(html, new RegExp(`data-menu-panel="${key}" data-tool-list`), `Cheatsheet extras target a real menu panel: ${key}`);
}
const styles = await readFile("km-editor/src/css/styles.css", "utf8");
assert.match(styles, /grid-template-columns: 160px minmax\(140px, 1fr\) 130px 90px/);
assert.doesNotMatch(styles, /content:\s*"–"/, "Toolbar previews must not add separator dashes");
assert.match(styles, /\.tool-name\.opens-menu::after[\s\S]*content: "\\203a"/);
const sharedScriptPreview = /\.tool-example :is\(sup, sub\) \{([^}]*)\}/.exec(styles)?.[1] ?? "";
assert.doesNotMatch(sharedScriptPreview, /color|font-weight|vertical-align/, "Sub/sup emphasis must not leak into math previews");
assert.match(styles, /\.tool-menu-action\[data-tool="sub"\][\s\S]*font-size: 0\.6em/);
assert.match(source, /name\.classList\.toggle\("opens-menu", Boolean\(details\.opensMenu\)\)/);
assert.deepEqual(toolbar.pinsFromStorage(null), toolbar.DEFAULT_PINNED_TOOLS);
assert.deepEqual(toolbar.pinsFromStorage("[]"), [], "An explicitly empty favorites list must stay empty");
assert.deepEqual(toolbar.pinsFromStorage("broken"), toolbar.DEFAULT_PINNED_TOOLS);
assert.ok(toolbar.DEFAULT_PINNED_TOOLS.every(command => detailedCommands.includes(command)));
assert.ok(toolbar.DEFAULT_PINNED_TOOLS.includes("tool:emoji"), "Emoji is visible by default but can still be unpinned");
assert.deepEqual(
	Object.entries(toolbar.TOOL_DETAILS).filter(([, details]) => details.opensMenu).map(([tool]) => tool),
	["inline-math", "emoji", "youtube", "mermaid", "display-math", "iframe", "link-page", "page-query", "glossary"],
	"Only tools that open a secondary menu or dialog show the chevron"
);
for (const url of [
	"https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=tracking",
	"https://youtu.be/dQw4w9WgXcQ?si=tracking",
	"https://m.youtube.com/shorts/dQw4w9WgXcQ?feature=share",
	"https://www.youtube.com/live/dQw4w9WgXcQ",
	"https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=10"
]) assert.equal(
	toolbar.youtubeEmbedURL(url),
	"https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
);
assert.equal(toolbar.youtubeEmbedURL("https://example.com/watch?v=dQw4w9WgXcQ"), "");

// Global editor shortcuts live in app.js. A tool must never claim one exactly,
// and a global must not fire again once a tool has handled the keystroke.
const appSource = await readFile("km-editor/src/js/app.js", "utf8");
assert.match(source, /if \(tool === "iframe"\)[\s\S]*actions\.addIframe\(\)/);
assert.match(source, /if \(tool === "emoji"\)[\s\S]*actions\.openEmojiPicker\(\)/);
assert.match(source, /root\.classList\.contains\("simple-folder-active"\)/);
assert.match(appSource, /async function addIframe\(\)[\s\S]*showPrompt\("Embed iframe", "Page URL"[\s\S]*iframe\.outerHTML/);
const GLOBAL_SHORTCUTS = ["Mod+KeyS", "Mod+KeyO", "Mod+KeyD", "Mod+KeyZ", "Mod+Shift+KeyZ", "Mod+KeyY"];
assert.deepEqual(
	shortcuts.filter(key => GLOBAL_SHORTCUTS.includes(key)),
	[],
	"Tool shortcuts must not shadow Save, Open, Duplicate, Undo, or Redo"
);
assert.match(appSource, /if \(event\.defaultPrevented\) return;/, "Global keys must ignore keystrokes a tool already handled");
assert.match(appSource, /const exact = modifier && !event\.altKey && !event\.shiftKey;/);
for (const key of ["s", "o", "d"])
	assert.match(appSource, new RegExp(`exact && key === "${key}"`), `Global shortcut "${key}" must require exact modifiers`);

// AltGr keystrokes that type a character stay out of the shortcut table; the
// same Ctrl+Alt combination that types nothing is a shortcut.
const altGraph = (code, key) => toolbar.typesAltGraphCharacter({
	code,
	key,
	getModifierState: name => name === "AltGraph"
});
assert.equal(altGraph("KeyE", "€"), true, "AltGr+E types a euro sign, not a transclusion");
assert.equal(altGraph("Digit4", "{"), true);
assert.equal(altGraph("KeyR", "r"), false, "AltGr+R types nothing, so Ctrl+Alt+R stays a shortcut");
assert.equal(altGraph("KeyS", "S"), false);
assert.equal(
	toolbar.typesAltGraphCharacter({ code: "KeyE", key: "e", getModifierState: () => false }),
	false,
	"Layouts without AltGr are never affected"
);

console.log(`OK: ${detailedCommands.length} toolbar commands have unique shortcuts and display details.`);
