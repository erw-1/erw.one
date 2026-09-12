/*
 * Diagram authoring surface: templates, per-type snippets, and a live Mermaid
 * preview of the fence under the cursor.
 *
 * Mermaid source is prose, not symbols, so the palette is whole diagrams plus
 * the few lines you add most often once a diagram type is chosen. The preview
 * keeps the last good drawing on screen while typing, because a half-typed line
 * is a parse error on nearly every keystroke.
 */
import { ensureDiagramSupport, loadMermaid } from "../../../km/src/js/content/mermaid_loader.js";
import { MERMAID_SNIPPETS, MERMAID_TEMPLATES } from "./mermaid_samples.js";

export { MERMAID_SNIPPETS, MERMAID_TEMPLATES };

const MERMAID_BLOCK = /```(?:mermaid|Mermaid)[ \t]*\n([\s\S]*?)\n```[ \t]*(?=\n|$)/g;

// Every mermaid fence on a page, in source order. `line` is the fence line, so
// a parse error reported at diagram line N maps to `line + N`.
export function findMermaidBlocks(source) {
	const text = String(source ?? "");
	MERMAID_BLOCK.lastIndex = 0;
	return [...text.matchAll(MERMAID_BLOCK)].map(match => ({
		start: match.index,
		end: match.index + match[0].length,
		diagram: match[1],
		line: text.slice(0, match.index).split("\n").length - 1
	}));
}

export function mermaidAtCursor(source, cursor = 0) {
	const text = String(source ?? "");
	const at = Math.max(0, Math.min(text.length, Number(cursor) || 0));
	return findMermaidBlocks(text).find(block => at >= block.start && at <= block.end) ?? null;
}

export function wrapMermaid(diagram) {
	return `\`\`\`mermaid\n${String(diagram ?? "").trim()}\n\`\`\``;
}

// The keyword Mermaid uses to pick a parser, ignoring comments and directives.
export function diagramType(source) {
	const first = String(source ?? "")
		.split("\n")
		.map(line => line.trim())
		.find(line => line && !line.startsWith("%%")) ?? "";
	return first.split(/[\s;{(]/)[0] ?? "";
}

// Mermaid errors are multi-line and end with an ASCII pointer at the bad token,
// which is noise in a one-line list. Keep the first sentence.
export function diagramMessage(error) {
	const text = String(error?.message || error || "Diagram could not be parsed.");
	return text.split("\n").map(line => line.trim()).find(Boolean) ?? text;
}

// Problems for diagrams that Mermaid refuses to parse. `errorFor` is injected
// because Mermaid answers asynchronously, so app.js caches its verdicts.
export function findDiagramProblems(pages, errorFor) {
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

// Mermaid renders into the editor page itself, so keep its own strict mode on
// and turn off the error diagram: the status line reports failures instead.
const mermaidConfig = theme => ({
	startOnLoad: false,
	securityLevel: "strict",
	suppressErrorRendering: true,
	theme
});

let mermaid = null;
let appliedTheme = "";

export async function ensureMermaid(theme = "default", source = "") {
	if (!mermaid) mermaid = await loadMermaid();
	if (theme !== appliedTheme) {
		appliedTheme = theme;
		mermaid.initialize(mermaidConfig(theme));
	}
	// Diagram types that ship outside Mermaid core, such as ZenUML.
	return ensureDiagramSupport(mermaid, source);
}

// Which diagram line failed, counting from 1.
//
// Mermaid reports `hash.line` zero-based even though its message says "line 2",
// while `loc.first_line` is one-based. Normalize before anyone adds an offset.
export function diagramErrorLine(error) {
	if (Number.isInteger(error?.hash?.line)) return error.hash.line + 1;
	return Number(error?.hash?.loc?.first_line) || 1;
}

// Parse without drawing. Resolves to null when the diagram is valid.
export async function parseDiagram(diagram, theme) {
	try {
		await (await ensureMermaid(theme, diagram)).parse(diagram);
		return null;
	} catch (error) {
		return { message: diagramMessage(error), line: diagramErrorLine(error) };
	}
}

let renderSeq = 0;

export function initMermaidPanel({ form, templates, snippets, input, preview, status, themeOf }) {
	let renderTimer = 0;

	// One split button per diagram type: the name inserts the first variant, the
	// caret opens the rest. Types with a single variant get no caret.
	function renderTemplates() {
		templates.replaceChildren(...MERMAID_TEMPLATES.map(template => {
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
				more.textContent = "▾";
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
		const template = MERMAID_TEMPLATES.find(item => item.name === button.dataset.mermaidMore);
		const open = button.getAttribute("aria-expanded") === "true";
		closeVariantMenu();
		if (open) return;
		button.setAttribute("aria-expanded", "true");
		const menu = document.createElement("div");
		menu.className = "mermaid-variants";
		menu.append(...template.variants.map(variant => {
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
		const template = MERMAID_TEMPLATES.find(item => item.name === name);
		const variant = template?.variants.find(item => item.name === variantName);
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
		// Rebuilding on every keystroke would also detach a snippet button in the
		// middle of its own click.
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
		// Hide the whole section, heading included, when a type has no parts.
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
			// A later keystroke already started its own render.
			if (token !== renderSeq) return;
			const { svg } = await engine.render(`km-editor-diagram-${token}`, diagram);
			if (token !== renderSeq) return;
			// Mermaid built this markup from the source above, with its own strict
			// mode on, and it is the only way to show a drawing.
			preview.innerHTML = svg;
			status.hidden = true;
			status.textContent = "";
		} catch (error) {
			if (token !== renderSeq) return;
			// Keep the last good drawing: a half-typed line fails on every keystroke.
			status.hidden = false;
			status.textContent = diagramMessage(error);
		}
	}

	function schedulePreview() {
		clearTimeout(renderTimer);
		renderTimer = setTimeout(drawPreview, 250);
	}

	function insertSnippet(text) {
		const start = input.selectionStart ?? input.value.length;
		const lineStart = input.value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
		const atLineStart = input.value.slice(lineStart, start).trim() === "";
		const block = `${atLineStart ? "" : "\n"}${text}\n`;
		input.focus();
		if (!document.execCommand("insertText", false, block))
			input.setRangeText(block, start, input.selectionEnd ?? start, "end");
		renderSnippets();
		schedulePreview();
	}

	templates.addEventListener("click", event => {
		const more = event.target.closest("[data-mermaid-more]");
		if (more) {
			openVariantMenu(more);
			return;
		}
		const sample = event.target.closest("[data-mermaid-sample]");
		if (sample) useSample(sample.dataset.mermaidSample, sample.dataset.mermaidVariant);
		else closeVariantMenu();
	});

	// Pointer dismissal happens on press, not on a later mouse-up after dragging.
	document.addEventListener("pointerdown", event => {
		if (!event.composedPath().some(node => node.classList?.contains("mermaid-sample"))) closeVariantMenu();
	});
	document.addEventListener("click", event => {
		if (event.detail === 0 && !event.composedPath().some(node => node.classList?.contains("mermaid-sample"))) closeVariantMenu();
	});
	form.addEventListener("keydown", event => {
		if (event.key === "Escape" && templates.querySelector(".mermaid-variants")) {
			event.stopPropagation();
			closeVariantMenu();
		}
	});

	snippets.addEventListener("click", event => {
		const button = event.target.closest("[data-mermaid-snippet]");
		if (button) insertSnippet(button.dataset.mermaidSnippet);
	});

	input.addEventListener("input", () => {
		renderSnippets();
		schedulePreview();
	});

	// Diagrams are indented, so Tab indents instead of leaving the field.
	input.addEventListener("keydown", event => {
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
