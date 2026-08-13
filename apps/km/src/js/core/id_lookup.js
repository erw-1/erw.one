/*
 * Safe id lookup helpers.
 *
 * Rendered markdown and generated headings can create ids that are valid HTML
 * but awkward CSS selectors. This module centralizes the fallback chain used by
 * routes, previews, decorators, and section reveal logic.
 */

// Try querySelector without letting malformed selectors escape to callers.
function querySelectorSafe(root, selector) {
	if (!selector || typeof root?.querySelector !== 'function') return null
	try {
		return root.querySelector(selector)
	} catch (_) {
		return null
	}
}

// Preferred browser path: CSS.escape lets us use a normal id selector for
// generated headings and hand-authored anchors with unusual characters.
function queryByEscapedSelector(root, id) {
	if (typeof CSS === 'undefined' || typeof CSS.escape !== 'function')
		return null
	return querySelectorSafe(root, '#' + CSS.escape(id))
}

// Document roots have a native id lookup that does not need CSS escaping.
function queryDocumentById(root, id) {
	return root.nodeType === 9 && typeof root.getElementById === 'function'
		? root.getElementById(id)
		: null
}

// Element-root queries should be allowed to match the root itself.
function matchRootId(root, id) {
	return root.nodeType === 1 && root.id === id ? root : null
}

// Last fallback for environments without CSS.escape and non-document roots.
function queryByAttributeId(root, id) {
	const attrId = String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
	return querySelectorSafe(root, `[id="${attrId}"]`)
}

// Safely find an element by id inside a specific root.
//
// If root/id is missing, or the browser rejects a fallback selector for any
// reason, the caller simply gets null.
export function queryElementById(root, id) {
	if (!root || !id) return null
	return (
		queryByEscapedSelector(root, id) ||
		queryDocumentById(root, id) ||
		matchRootId(root, id) ||
		queryByAttributeId(root, id)
	)
}
