/*
 * The Issues panel: collect problems, render the list, and repair them.
 *
 * This owns everything behind the Issues tab — the validation run, the async
 * KaTeX/Mermaid/asset checks whose verdicts arrive late, the rendered list, and
 * the per-code fix UI. app.js owns editor state and every other surface, so
 * this module reaches back through the callbacks passed to initIssues() rather
 * than importing app.js, which would be circular.
 *
 * `getState` is a function, not a value: app.js reassigns `state` whenever a
 * bundle loads, so a captured reference would go stale.
 */
import {
	assetProblems,
	assetReferences,
	pageKind,
	parseHeadings,
	repairProblem,
	uniquePageId,
	validateState,
	wouldCreateCycle
} from "./km.js";
import { ensureKatex, findFormulas, findMathProblems } from "./math.js";
import { findDiagramProblems, findMermaidBlocks, parseDiagram } from "./mermaid.js";
import { findDirectiveProblems } from "../../../km/src/js/content/directives.js";
import { mediaTag, resolveAssetURL } from "../../../km/src/js/content/media.js";

// Previews render from the KM runtime folder, so probe the same URL the preview
// will request. An asset that loads there is one the published site can serve.
const PREVIEW_ASSET_BASE = new URL("../km/", location.href).href;

export function initIssues({
	list,
	actions,
	count,
	getState,
	goToPage,
	revealSource,
	onFixApplied,
	addConfigLang,
	currentTheme,
	todayIso,
	openQueryBuilder,
	openMathBuilder,
	openMermaidBuilder
}) {
	// diagram source -> parse failure, or null once Mermaid accepted it. Mermaid
	// answers asynchronously, so verdicts are cached and the list re-renders.
	const brokenDiagrams = new Map();
	let diagramCheckRun = null;

	// url -> true once a load attempt failed. Loading an element is the only check
	// that works for both local files and cross-origin URLs.
	const missingAssets = new Map();
	let assetProbeRun = null;

	let mathValidationQueued = false;

	function validateEditorState() {
		const state = getState();
		const messages = [
			...validateState(state).filter(message => message.level !== "ok"),
			...findDirectiveProblems(state.pages),
			...findMathProblems(state.pages),
			...findDiagramProblems(state.pages, diagram => brokenDiagrams.get(diagram) || null),
			...assetProblems(state.pages, url => missingAssets.get(url) === true)
		];
		return messages.length ? messages : [{ level: "ok", text: "Bundle is valid enough to export." }];
	}

	function queueDiagramChecks() {
		if (diagramCheckRun) return;
		const unchecked = [...new Set(getState().pages.flatMap(page =>
			findMermaidBlocks(page.content).map(block => block.diagram)
		))].filter(diagram => !brokenDiagrams.has(diagram));
		if (!unchecked.length) return;
		for (const diagram of unchecked) brokenDiagrams.set(diagram, null);
		diagramCheckRun = Promise.all(unchecked.map(diagram =>
			parseDiagram(diagram, currentTheme() === "light" ? "default" : "dark")
				.then(failure => brokenDiagrams.set(diagram, failure))
				// A load failure is not the author's problem: stay quiet.
				.catch(() => {})
		)).then(() => {
			diagramCheckRun = null;
			renderProblems(validateEditorState());
		});
	}

	function probeAsset(url) {
		return new Promise(resolve => {
			const tag = mediaTag(url) || "img";
			const node = document.createElement(tag);
			if (tag !== "img") node.preload = "metadata";
			const settle = loaded => resolve(loaded);
			node.addEventListener(tag === "img" ? "load" : "loadedmetadata", () => settle(true), { once: true });
			node.addEventListener("error", () => settle(false), { once: true });
			node.src = resolveAssetURL(url, PREVIEW_ASSET_BASE);
		});
	}

	function queueAssetChecks() {
		if (assetProbeRun) return;
		const unchecked = [...new Set(getState().pages.flatMap(page =>
			assetReferences(page.content).map(reference => reference.url)
		))].filter(url => !missingAssets.has(url));
		if (!unchecked.length) return;
		// Assume present until a probe says otherwise, so nothing is queued twice.
		for (const url of unchecked) missingAssets.set(url, false);
		assetProbeRun = Promise.all(unchecked.map(url =>
			probeAsset(url).then(loaded => missingAssets.set(url, !loaded))
		)).then(() => {
			assetProbeRun = null;
			renderProblems(validateEditorState());
		});
	}

	// Only KaTeX can say whether a formula renders, so load it once a bundle
	// actually contains math and re-check the Issues list when it arrives.
	function queueMathValidation() {
		if (mathValidationQueued) return;
		if (!getState().pages.some(page => findFormulas(page.content).length)) return;
		mathValidationQueued = true;
		ensureKatex().then(() => renderProblems(validateEditorState()), () => {});
	}

	function appendProblemText(container, message) {
		const page = getState().pages.find(candidate => candidate.uid === message.pageUid);
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
		const problems = messages.filter(message => message.level !== "ok");
		const errors = messages.filter(message => message.level === "error").length;
		const warnings = messages.filter(message => message.level === "warning").length;
		count.textContent = String(problems.length);
		count.className = `problem-ping ${errors ? "error" : warnings ? "warning" : "ok"}`;
		list.replaceChildren(
			...messages.map(message => {
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
		actions.hidden = !messages.every(message => message.level === "ok");
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
		const state = getState();
		if (problem.code === "missing-language") {
			addConfigLang(problem.module);
			return true;
		}
		const page = state.pages.find(candidate => candidate.uid === (value.pageUid || problem.pageUid));
		if (!repairProblem(state, problem, value)) return false;
		onFixApplied(problem, page);
		return true;
	}

	function appendProblemTargetFields(form, problem, mode) {
		const state = getState();
		const pageSelect = document.createElement("select");
		pageSelect.name = "targetPageUid";
		for (const page of state.pages) {
			if (!page.id || pageKind(state.pages, page) === "Simple folder" ||
				(mode === "transclusion" && page.uid === problem.pageUid)) continue;
			pageSelect.append(Object.assign(document.createElement("option"), {
				value: page.uid,
				textContent: `${page.title || page.id} (${page.id})`
			}));
		}
		const wanted = state.pages.find(page =>
			page.id === problem.targetId || (mode === "link" && page.uid === problem.pageUid)
		);
		if (wanted && [...pageSelect.options].some(option => option.value === wanted.uid))
			pageSelect.value = wanted.uid;

		const sectionSelect = document.createElement("select");
		sectionSelect.name = mode === "link" ? "anchor" : "section";
		const fillSections = () => {
			const page = state.pages.find(candidate => candidate.uid === pageSelect.value);
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
		if (problem.section && [...sectionSelect.options].some(option => option.value === problem.section))
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
		// Collapse onto the formula: a selection would mean "wrap this as math".
		target.setSelectionRange(problem.start, problem.start);
		openMathBuilder();
	}

	function openProblemDiagramEditor(problem) {
		const target = revealSource(problem);
		target.setSelectionRange(problem.start, problem.start);
		openMermaidBuilder();
	}

	function openProblemFixForm(problem, li) {
		const state = getState();
		for (const form of list.querySelectorAll(".problem-fix-form")) form.remove();
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
				const page = state.pages.find(candidate => candidate.uid === pageUid);
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
				const page = state.pages.find(candidate => candidate.uid === select.value);
				input.value = uniquePageId(state.pages, page?.title || `${problem.id}_copy`);
			};
			select.addEventListener("change", suggestId);
			suggestId();
			form.append(problemField("Page to rename", select), problemField("New ID", input));
			focusTarget = input;
		} else if (["self-parent", "missing-parent", "parent-cycle"].includes(problem.code)) {
			const page = state.pages.find(candidate => candidate.uid === problem.pageUid);
			const select = document.createElement("select");
			select.name = "parent";
			select.append(Object.assign(document.createElement("option"), {
				value: "",
				textContent: "No parent (top level)"
			}));
			for (const candidate of state.pages) {
				if (!candidate.id || candidate.uid === page?.uid ||
					wouldCreateCycle(state.pages, page?.uid, candidate.id)) continue;
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
			input.value = todayIso();
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
		const save = document.createElement("button");
		save.type = "submit";
		save.textContent = "Apply";
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
		actionRow.append(save, cancel);
		form.append(actionRow);
		form.addEventListener("input", event => event.target.setCustomValidity?.(""));
		form.addEventListener("submit", event => {
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

	// One table per problem code: the fix button's label and what pressing it
	// does. No `open` means the repair needs no input and is applied directly.
	// `panel: true` marks fixes that open a floating builder; that click must not
	// reach the document handler which closes open panels.
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

	list.addEventListener("click", event => {
		const pageLink = event.target.closest("[data-problem-page]");
		if (pageLink) {
			const problem = pageLink.closest("li")?._problem;
			goToPage(pageLink.dataset.problemPage, Number.isInteger(problem?.line) ? problem.line : null);
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

	// Re-run validation and repaint the list. Every editor change funnels here
	// through markDirty() -> updateFileStatus().
	return { refresh: () => renderProblems(validateEditorState()) };
}
