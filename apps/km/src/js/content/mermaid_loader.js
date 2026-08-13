/*
 * One pinned Mermaid import, shared by the KM renderer and the editor.
 *
 * Each document initializes it with its own theme: the published page follows
 * the site theme, the editor's diagram builder follows the editor theme. They
 * are separate documents, so a shared module here means one pinned version
 * rather than one shared configuration.
 */
import { pkgURL } from '../core/deps.js'

let pending = null
let zenumlPending = null

export function loadMermaid() {
	// Reuse the in-flight or finished import.
	if (!pending) pending = import(pkgURL('mermaid', '/+esm'))
		// Handle default vs module-object export shapes.
		.then(mod => mod.default ?? mod)
	return pending
}

// ZenUML ships outside Mermaid core, so it is registered only for the diagrams
// that ask for it. Every other page skips the download.
const NEEDS_ZENUML = /^\s*(?:---[\s\S]*?---\s*)?zenuml\b/

export function ensureDiagramSupport(mermaid, source = '') {
	if (!NEEDS_ZENUML.test(String(source))) return Promise.resolve(mermaid)
	if (!zenumlPending) zenumlPending = import(pkgURL('@mermaid-js/mermaid-zenuml', '/+esm'))
		.then(mod => mermaid.registerExternalDiagrams([mod.default ?? mod]))
		// A failed plugin load must not break the diagrams that do work.
		.catch(() => {})
	return zenumlPending.then(() => mermaid)
}
