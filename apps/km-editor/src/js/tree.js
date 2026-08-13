import { buildTree, pageKind } from "./km.js";

function matchesNode(node, query) {
	if (!query) return true;
	const haystack = `${node.page.title} ${node.page.id} ${node.page.tags}`.toLowerCase();
	return haystack.includes(query) || node.children.some(child => matchesNode(child, query));
}

function childList(nodes, state, options, query) {
	const ul = document.createElement("ul");
	ul.className = "tree-list";
	ul.setAttribute("role", "group");
	for (const node of nodes) {
		if (!matchesNode(node, query)) continue;
		ul.append(treeItem(node, state, options, query));
	}
	return ul;
}

function dropZone(uid, placement, onMove) {
	const zone = document.createElement("div");
	zone.className = "drop-zone";
	zone.dataset.uid = uid;
	zone.dataset.placement = placement;
	zone.addEventListener("dragover", event => {
		event.preventDefault();
		zone.classList.add("drag-over");
	});
	zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
	zone.addEventListener("drop", event => {
		event.preventDefault();
		zone.classList.remove("drag-over");
		const draggedUid = event.dataTransfer.getData("text/x-km-page");
		onMove(draggedUid, uid, placement);
	});
	return zone;
}

function treeItem(node, state, options, query) {
	const { onSelect, onMove } = options;
	const li = document.createElement("li");
	li.className = "tree-item";
	li.dataset.uid = node.page.uid;
	li.append(dropZone(node.page.uid, "before", onMove));

	const row = document.createElement("div");
	row.className = "tree-row";
	const kindLabel = pageKind(state.pages, node.page);
	if (node.page.uid === state.activeUid) row.classList.add("active");
	if (node.missingParent) row.classList.add("missing-parent");
	if (node.page.id === "km_glossary") row.classList.add("glossary");
	if (node.isHome) row.classList.add("home");
	if (kindLabel === "Simple folder") row.classList.add("simple-folder");
	row.draggable = true;
	row.dataset.uid = node.page.uid;
	row.setAttribute("role", "treeitem");
	row.setAttribute("aria-selected", String(node.page.uid === state.activeUid));
	row.tabIndex = node.page.uid === state.activeUid ? 0 : -1;
	row.title = node.missingParent
		? `Missing parent: ${node.page.parent}`
		: `${kindLabel}: ${node.page.id}`;

	const kind = document.createElement("span");
	kind.className = "tree-kind";
	kind.textContent = kindLabel === "Folder" ? "▾" : kindLabel === "Simple folder" ? "▹" : "–";
	kind.setAttribute("role", "img");
	kind.setAttribute("aria-label", kindLabel);
	const title = document.createElement("span");
	title.className = "tree-title";
	title.textContent = node.page.title || node.page.id || "(untitled)";
	row.append(kind, title);

	const select = () => {
		const treeRoot = row.closest(".tree-root");
		onSelect(node.page.uid);
		queueMicrotask(() => [...treeRoot.querySelectorAll(".tree-row")]
			.find(candidate => candidate.dataset.uid === node.page.uid)?.focus());
	};
	row.addEventListener("click", select);
	row.addEventListener("keydown", event => {
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		select();
	});
	row.addEventListener("dragstart", event => {
		event.dataTransfer.setData("text/x-km-page", node.page.uid);
		event.dataTransfer.setData("text/plain", node.page.title || node.page.id || "");
		event.dataTransfer.effectAllowed = "copyMove";
	});
	row.addEventListener("dragover", event => {
		event.preventDefault();
		row.classList.add("drag-over");
	});
	row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
	row.addEventListener("drop", event => {
		event.preventDefault();
		row.classList.remove("drag-over");
		const draggedUid = event.dataTransfer.getData("text/x-km-page");
		onMove(draggedUid, node.page.uid, "inside");
	});

	li.append(row);
	if (node.children.length) li.append(childList(node.children, state, options, query));
	li.append(dropZone(node.page.uid, "after", onMove));
	return li;
}

export function renderTree(root, state, options, query = "") {
	const normalizedQuery = query.trim().toLowerCase();
	const nodes = buildTree(state);
	// KM uses the explicit home id even when bundle order changes.
	const homeNode = nodes.find(node => node.page.id === "home") ||
		nodes.find(node => !node.missingParent);
	if (homeNode) homeNode.isHome = true;
	root.replaceChildren(childList(nodes, state, options, normalizedQuery));
	const rows = [...root.querySelectorAll(".tree-row")];
	if (!rows.some(row => row.tabIndex === 0) && rows[0]) rows[0].tabIndex = 0;
}
