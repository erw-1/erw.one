const inlineTools = {
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

const blockSnippets = {
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

export function youtubeEmbedURL(value) {
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
		id = url.searchParams.get("v") ||
			/^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname)?.[1] ||
			"";
	}
	return /^[A-Za-z0-9_-]{11}$/.test(id)
		? `https://www.youtube-nocookie.com/embed/${id}`
		: "";
}

export const TOOL_DETAILS = {
	bold: { syntax: "**bold**", example: "<strong>bold text</strong>", shortcut: "Ctrl+B", key: "Mod+KeyB", pin: "B" },
	italic: { syntax: "*italic*", example: "<em>italic text</em>", shortcut: "Ctrl+I", key: "Mod+KeyI", pin: "I" },
	"bold-italic": { syntax: "***both***", example: "<strong><em>bold italic text</em></strong>", shortcut: "Ctrl+Shift+B", key: "Mod+Shift+KeyB", pin: "BI" },
	underline: { syntax: "++underline++", example: "<u>underlined text</u>", shortcut: "Ctrl+U", key: "Mod+KeyU", pin: "U" },
	strike: { syntax: "~~strike~~", example: "<del>struck text</del>", shortcut: "Ctrl+Shift+X", key: "Mod+Shift+KeyX", pin: "S" },
	highlight: { syntax: "==highlight==", example: "<mark>highlighted text</mark>", shortcut: "Ctrl+Shift+H", key: "Mod+Shift+KeyH", pin: "==" },
	"inline-spoiler": { syntax: "||spoiler||", example: "<span class=\"md-inline-spoiler\">spoiler text</span>", shortcut: "Ctrl+Alt+Shift+S", key: "Mod+Alt+Shift+KeyS", pin: "||" },
	"inline-code": { syntax: "`code`", example: "<code>code</code>", shortcut: "Ctrl+`", key: "Mod+Backquote", pin: "</>" },
	kbd: { syntax: "<kbd>Ctrl</kbd>", example: "<kbd>Ctrl</kbd>", shortcut: "Ctrl+Shift+K", key: "Mod+Shift+KeyK", pin: "Key" },
	"inline-math": { syntax: "$E=mc^2$", example: "<span class=\"km-math\"><i>E</i> = mc<sup>2</sup></span>", shortcut: "Ctrl+Shift+M", key: "Mod+Shift+KeyM", pin: "∑", opensMenu: true },
	sub: { syntax: "H~2~O", example: "H<sub>2</sub>O", shortcut: "Ctrl+,", key: "Mod+Comma", pin: "X₂" },
	sup: { syntax: "x^2^", example: "x<sup>2</sup>", shortcut: "Ctrl+.", key: "Mod+Period", pin: "X²" },
	h1: { syntax: "# Heading", example: "<span class=\"km-heading km-h1\">Heading 1</span>", shortcut: "Ctrl+Alt+1", key: "Mod+Alt+Digit1", pin: "H1" },
	h2: { syntax: "## Heading", example: "<span class=\"km-heading km-h2\">Heading 2</span>", shortcut: "Ctrl+Alt+2", key: "Mod+Alt+Digit2", pin: "H2" },
	h3: { syntax: "### Heading", example: "<span class=\"km-heading km-h3\">Heading 3</span>", shortcut: "Ctrl+Alt+3", key: "Mod+Alt+Digit3", pin: "H3" },
	h4: { syntax: "#### Heading", example: "<span class=\"km-heading km-h4\">Heading 4</span>", shortcut: "Ctrl+Alt+4", key: "Mod+Alt+Digit4", pin: "H4" },
	h5: { syntax: "##### Heading", example: "<span class=\"km-heading km-h5\">Heading 5</span>", shortcut: "Ctrl+Alt+5", key: "Mod+Alt+Digit5", pin: "H5" },
	h6: { syntax: "###### Heading", example: "<span class=\"km-heading km-h6\">Heading 6</span>", shortcut: "Ctrl+Alt+6", key: "Mod+Alt+Digit6", pin: "H6" },
	quote: { syntax: "> quote", example: "<span class=\"km-quote\">Quoted text</span>", shortcut: "Ctrl+Shift+.", key: "Mod+Shift+Period", pin: "Quote" },
	ul: { syntax: "- item", example: "<span class=\"km-list\">•&ensp;List item</span>", shortcut: "Ctrl+Shift+8", key: "Mod+Shift+Digit8", pin: "• List" },
	ol: { syntax: "1. item", example: "<span class=\"km-list\">1.&ensp;List item</span>", shortcut: "Ctrl+Shift+7", key: "Mod+Shift+Digit7", pin: "1. List" },
	task: { syntax: "- [ ] task", example: "<span class=\"km-task\"><span aria-hidden=\"true\">☐</span>&ensp;Task item</span>", shortcut: "Ctrl+Shift+9", key: "Mod+Shift+Digit9", pin: "☐ Task" },
	divider: { syntax: "---", example: "<span aria-hidden=\"true\">────────</span>", shortcut: "Ctrl+Alt+Shift+D", key: "Mod+Alt+Shift+KeyD", pin: "Divider" },
	note: { syntax: "> [!NOTE]", example: "<span class=\"markdown-alert markdown-alert-note\">Useful context</span>", shortcut: "Ctrl+Alt+Shift+N", key: "Mod+Alt+Shift+KeyN", pin: "Note" },
	tip: { syntax: "> [!TIP]", example: "<span class=\"markdown-alert markdown-alert-tip\">Helpful note</span>", shortcut: "Ctrl+Alt+T", key: "Mod+Alt+KeyT", pin: "Tip" },
	important: { syntax: "> [!IMPORTANT]", example: "<span class=\"markdown-alert markdown-alert-important\">Key information</span>", shortcut: "Ctrl+Alt+Shift+I", key: "Mod+Alt+Shift+KeyI", pin: "Important" },
	warning: { syntax: "> [!WARNING]", example: "<span class=\"markdown-alert markdown-alert-warning\">Important warning</span>", shortcut: "Ctrl+Alt+W", key: "Mod+Alt+KeyW", pin: "Warn" },
	caution: { syntax: "> [!CAUTION]", example: "<span class=\"markdown-alert markdown-alert-caution\">Risk or consequence</span>", shortcut: "Ctrl+Alt+Shift+C", key: "Mod+Alt+Shift+KeyC", pin: "Caution" },
	spoiler: { syntax: ":::spoiler … :::", example: "<span class=\"md-spoiler\">▸&ensp;Click to reveal</span>", shortcut: "Ctrl+Alt+R", key: "Mod+Alt+KeyR", pin: "Spoiler" },
	image: { syntax: "![alt](assets/pic.png)", example: "<span class=\"km-image\">▧&ensp;Image</span>", shortcut: "Ctrl+Alt+I", key: "Mod+Alt+KeyI", pin: "Image" },
	emoji: { syntax: ":joy: or :custom_name:", example: "<span>😂</span>", shortcut: "Ctrl+Alt+Shift+E", key: "Mod+Alt+Shift+KeyE", pin: "Emoji", opensMenu: true },
	video: { syntax: "![caption](assets/clip.webm)", example: "<span class=\"km-iframe\">▶&ensp;Video player</span>", shortcut: "Ctrl+Alt+V", key: "Mod+Alt+KeyV", pin: "Video" },
	audio: { syntax: "![caption](assets/track.wav)", example: "<span class=\"km-iframe\">♪&ensp;Audio player</span>", shortcut: "Ctrl+Alt+A", key: "Mod+Alt+KeyA", pin: "Audio" },
	youtube: { syntax: "<iframe src=… >", example: "<span class=\"km-iframe\">YouTube video</span>", shortcut: "Ctrl+Alt+Y", key: "Mod+Alt+KeyY", pin: "YouTube", opensMenu: true },
	"code-block": { syntax: "```js … ```", example: "<code class=\"km-code-block\">const x = 1</code>", shortcut: "Ctrl+Alt+C", key: "Mod+Alt+KeyC", pin: "Code" },
	mermaid: { syntax: "```mermaid … ```", example: "<span class=\"km-mermaid\"><b>A</b><span>→</span><b>B</b></span>", shortcut: "Ctrl+Alt+D", key: "Mod+Alt+KeyD", pin: "Diagram", opensMenu: true },
	"display-math": { syntax: "$$ E=mc^2 $$", example: "<span class=\"km-math km-display-math\"><i>E</i> = mc<sup>2</sup></span>", shortcut: "Ctrl+Alt+M", key: "Mod+Alt+KeyM", pin: "Math", opensMenu: true },
	html: { syntax: "<div>…</div>", example: "<code>&lt;div&gt;…&lt;/div&gt;</code>", shortcut: "Ctrl+Alt+H", key: "Mod+Alt+KeyH", pin: "HTML" },
	iframe: { syntax: "<iframe … >", example: "<span class=\"km-iframe\">Embedded page</span>", shortcut: "Ctrl+Alt+F", key: "Mod+Alt+KeyF", pin: "Iframe", opensMenu: true },
	"link-page": { syntax: "[text](url or id)", example: "<span class=\"km-link\">Linked page</span>", shortcut: "Ctrl+K", key: "Mod+KeyK", pin: "Link", opensMenu: true },
	transclude: { syntax: "![[page#section]]", example: "<span class=\"km-quote\">Embedded page section</span>", shortcut: "Ctrl+Alt+E", key: "Mod+Alt+KeyE", pin: "Embed" },
	"page-query": { syntax: "{{pages …}}", example: "<span class=\"km-list\">Live page list</span>", shortcut: "Ctrl+Alt+Q", key: "Mod+Alt+KeyQ", pin: "Query", opensMenu: true },
	footnote: { syntax: "text[^1] + [^1]: note", example: "Text<sup class=\"km-link\">1</sup>", shortcut: "Ctrl+Alt+N", key: "Mod+Alt+KeyN", pin: "Footnote" },
	glossary: { syntax: "## Term + definition", example: "<span class=\"km-glossary-term\">Defined term</span>", shortcut: "Ctrl+Alt+G", key: "Mod+Alt+KeyG", pin: "Glossary", opensMenu: true }
};

export const ACTION_DETAILS = {
	"create-page": { syntax: "<!--km id:\"…\" -->", example: "<span class=\"km-page\">New page</span>", shortcut: "Ctrl+Alt+P", key: "Mod+Alt+KeyP", pin: "+ Page" },
	"create-folder": { syntax: "<!--km id:\"…\" -->", example: "<span class=\"km-page\">▾&ensp;Folder</span>", shortcut: "Ctrl+Alt+Shift+P", key: "Mod+Alt+Shift+KeyP", pin: "+ Folder" },
	"create-simple-folder": { syntax: "<!--km id:\"…\" kind:\"simple\" -->", example: "<span class=\"km-page\">▹&ensp;Simple folder</span>", shortcut: "Ctrl+Alt+Shift+F", key: "Mod+Alt+Shift+KeyF", pin: "+ Simple" }
};

// Cheatsheet-only rows for surfaces that are not tool-list buttons.
export const CHEATSHEET_EXTRAS = {
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
			{ label: "Page header", syntax: "<!--km\nid:\"page_id\"\ntitle:\"Title\"\nparent:\"parent_id\"\ntags:\"tag1, tag2\"\ntrail:\"trail-name\"\nupdated:\"2026-07-29\"\n-->", example: "<span class=\"km-page\">One page in the bundle</span>", shortcut: "" }
		]
	}]
};

export function cheatsheetSections(root) {
	const sections = [];
	for (const panel of root.querySelectorAll("[data-tool-list]")) {
		const tab = panel.closest(".command-menu").querySelector("[data-menu]").textContent.trim();
		const groups = [...panel.querySelectorAll(".tool-group")].map(group => ({
			title: group.querySelector(".tool-group-title").textContent.trim(),
			rows: [...group.querySelectorAll("button[data-tool], button[data-action]")].map(button => ({
				label: button.querySelector(".tool-name")?.textContent ?? button.textContent.trim(),
				...commandFor(button).details
			}))
		}));
		sections.push({ tab, groups: groups.concat(CHEATSHEET_EXTRAS[panel.dataset.menuPanel] ?? []) });
	}
	return sections;
}

const PIN_STORE_KEY = "km-editor-pinned-tools";
export const DEFAULT_PINNED_TOOLS = [
	"tool:bold",
	"tool:italic",
	"tool:h2",
	"tool:code-block",
	"tool:link-page",
	"tool:emoji"
];

// Windows reports AltGr as Ctrl+Alt, so on layouts like AZERTY every Ctrl+Alt
// shortcut looks like an AltGr keystroke. Only step aside when AltGr actually
// produced a different character (AltGr+E types "€"); a combination that types
// nothing, like AltGr+R, is the user reaching for the shortcut.
export function typesAltGraphCharacter(event) {
	if (!event.getModifierState?.("AltGraph")) return false;
	if (event.key.length !== 1) return false;
	const base = String(event.code || "").replace(/^(Key|Digit)/, "").toLowerCase();
	return base !== event.key.toLowerCase();
}

export function shortcutKey(event) {
	const parts = [];
	if (event.ctrlKey || event.metaKey) parts.push("Mod");
	if (event.altKey) parts.push("Alt");
	if (event.shiftKey) parts.push("Shift");
	parts.push(event.code);
	return parts.join("+");
}

export function pinsFromStorage(value) {
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

function enhanceMenus(root, actions) {
	const pinnedRoot = root.querySelector("[data-pinned-tools]");
	const sourceButtons = [...root.querySelectorAll("[data-tool-list] button[data-tool], [data-tool-list] button[data-action]")];
	const catalog = new Map();
	const shortcuts = new Map();
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
		// Preview HTML is controlled by TOOL_DETAILS/ACTION_DETAILS above.
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
			const pin = root.querySelector(`[data-pin-tool="${token}"]`);
			const active = pins.has(token);
			pin.textContent = active ? "★" : "☆";
			pin.setAttribute("aria-pressed", String(active));
			pin.setAttribute("aria-label", `${active ? "Unpin" : "Pin"} ${item.label}`);
			pin.title = `${active ? "Remove" : "Keep"} ${item.label} ${active ? "from" : "on"} the toolbar`;
			if (!active) continue;
			const button = document.createElement("button");
			button.type = "button";
			button.className = "pinned-tool";
			button.textContent = item.details.pin || item.label;
			button.title = `${item.label} (${item.details.shortcut})`;
			button.disabled = root.classList.contains("simple-folder-active");
			if (item.button.dataset.tool) button.dataset.tool = item.button.dataset.tool;
			else button.dataset.action = item.button.dataset.action;
			pinnedRoot.append(button);
		}
		pinnedRoot.hidden = !pinnedRoot.childElementCount;
	};

	root.addEventListener("click", event => {
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
				// Pinning still works for this session when storage is unavailable.
			}
			renderPins();
			return;
		}

		const button = event.target.closest("[data-tool]");
		if (!button || root.classList.contains("simple-folder-active")) return;
		const tool = button.dataset.tool;
		// Math and diagrams open their own builders instead of pasting a snippet.
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

	document.addEventListener("keydown", event => {
		if (
			event.defaultPrevented ||
			event.repeat ||
			typesAltGraphCharacter(event) ||
			!event.target.matches?.("textarea")
		) return;
		const button = shortcuts.get(shortcutKey(event));
		if (!button) return;
		event.preventDefault();
		if (button.dataset.action) event.target.blur();
		button.click();
	});

	renderPins();
}

export function initToolbar(root, actions) {
	enhanceMenus(root, actions);
}
