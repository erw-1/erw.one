// Dockable panel layout for the editor side columns.
//
// Panels (explorer, metadata, config, problems) live in `panelStore` as
// detached content blocks. This module arranges them into two side columns,
// each holding one or two stacked docks. A dock shows its panels as tabs.
//
// Capabilities: drag a tab between docks/columns, drop on a dock's top/bottom
// edge to split it, drag the column gutter to resize width, drag the split
// bar to resize height. Layout persists to localStorage.
//
// ponytail: max two docks per column, no nested splits. A real tree layout is
// far more code; two-per-column covers "split top/bottom" without it. Widen to
// a recursive node tree only if someone actually needs 3+ regions per side.

const STORE_KEY = "km-editor-dock-layout";
const COLS = ["left", "right"];
const MIN_W = 160;

const panels = new Map(); // id -> { el, title, badge }
let state = null; // { left:{width,split,docks:[{panels,active}]}, right:{...} }
let store = null;
let colEls = {};
let gutterEls = {};
let dragging = null;

const div = className => {
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

// Make a loaded/legacy layout safe: every known panel appears exactly once,
// unknown ids dropped, actives valid. Missing panels land in the right column.
function sanitize(raw) {
	const s = raw && raw.left && raw.right ? raw : defaultState();
	const seen = new Set();
	for (const col of COLS) {
		const c = s[col] || (s[col] = { width: 280, split: 0.5, docks: [] });
		c.width = Math.max(MIN_W, Number(c.width) || 280);
		c.split = Math.min(0.85, Math.max(0.15, Number(c.split) || 0.5));
		c.docks = (c.docks || [])
			.map(d => ({ panels: (d.panels || []).filter(id => panels.has(id) && !seen.has(id) && seen.add(id)), active: d.active }))
			.filter(d => d.panels.length);
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

// Where a drop lands: "tab" (stack via the tab strip) or a "top"/"bottom" split
// of the body. Measured against the dock's fixed rect (not the live body, which
// shrinks once the preview is inserted) so the boundary can't oscillate.
// A column already split (two docks max) can only take tabs, so splits collapse
// to "tab" there.
function zoneAt(dockEl, col, clientY) {
	const barBottom = dockEl.querySelector(".dock-tabbar").getBoundingClientRect().bottom;
	if (clientY <= barBottom) return "tab";
	if (state[col].docks.length >= 2) return "tab";
	const mid = barBottom + (dockEl.getBoundingClientRect().bottom - barBottom) / 2;
	return clientY < mid ? "top" : "bottom";
}

// Live preview of the result: a "tab" drop highlights the tab strip; a split
// inserts a placeholder that reserves half the dock, pushing the current
// content into the other half.
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
	tab.addEventListener("dragstart", event => {
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

	dockEl.addEventListener("dragover", event => {
		if (!dragging) return;
		event.preventDefault();
		event.stopPropagation();
		const zone = zoneAt(dockEl, col, event.clientY);
		if (dockEl.dataset.zone === zone) return;
		clearPreviews();
		dockEl.dataset.zone = zone;
		showPreview(dockEl, zone);
	});
	dockEl.addEventListener("dragleave", event => {
		if (!dockEl.contains(event.relatedTarget)) clearPreviews();
	});
	dockEl.addEventListener("drop", event => {
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
	bar.addEventListener("mousedown", event => {
		event.preventDefault();
		const rect = colEls[col].getBoundingClientRect();
		const move = ev => {
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
		c.docks = c.docks.filter(d => d.panels.length);
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
	// Park every panel and badge so replaceChildren cannot orphan them.
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
	gutterEls[col].addEventListener("mousedown", event => {
		event.preventDefault();
		const startX = event.clientX;
		const startW = state[col].width;
		const move = ev => {
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

// Bring a panel's dock to the front (activate its tab), restoring its column
// if it was collapsed. Used by "open config" and rename actions.
export function revealPanel(id) {
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

export function initDocks({ workspace, panelStore }) {
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
