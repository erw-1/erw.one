/*
 * Pure hash-route interpretation.
 *
 * routes.js wires this to browser location and DOM anchor lookup. Keeping this
 * resolver pure makes the route edge cases easy to test.
 */

// Split a KM hash into non-empty route pieces.
//
// "#docs#api#1_2" becomes ["docs", "api", "1_2"]. Empty hashes and "#"
// become [], which means "root page".
export const splitHashSegments = hash =>
	String(hash || '').replace(/^#/, '').split('#').filter(Boolean)

// Parsed markdown headings are the cheapest anchor validation path.
//
// These section ids come from wiki_model.js and match the generated heading ids
// render.js places in the DOM.
export const pageHasParsedAnchor = (page, anchorId) =>
	!!(anchorId && page?.sections?.some(section => section.id === anchorId))

// Check whether a page can accept an anchor segment.
//
// Same-page anchors can come from authored HTML ids that were not visible to the
// markdown section parser, so the DOM lookup is allowed only for currentPage.
export function pageHasRouteAnchor(page, anchorId, currentPage, containerEl, hasDomAnchor) {
	if (pageHasParsedAnchor(page, anchorId)) return true
	return !!(
		page &&
		page === currentPage &&
		anchorId &&
		containerEl &&
		hasDomAnchor?.(containerEl, anchorId)
	)
}

// Interpret a browser hash or href as a KM route.
//
// Valid route shapes:
// - "" or "#"                 -> root page
// - "#docs#api"              -> page path
// - "#docs#api#1_2"          -> page path plus heading anchor
// - "#1_2"                   -> current-page DOM anchor or root parsed anchor
//
// The function is pure because callers provide page-path resolution, final-page
// eligibility, and DOM anchor lookup functions.
export function resolveRouteTarget({
	hashOrHref = '',
	locationHref = '',
	root = null,
	resolvePagePath,
	isPageRenderable = () => true,
	currentPage = null,
	containerEl = null,
	hasDomAnchor = () => false
} = {}) {
	if (!root) return null
	let href = ''
	try {
		// Accept either a raw hash ("#docs") or a full/relative href from an <a>.
		href = String(hashOrHref || '').startsWith('#')
			? hashOrHref
			: new URL(hashOrHref || '', locationHref || 'http://km.local/').hash
	} catch (_) {
		// Malformed href strings are not internal routes.
		return null
	}
	const target = (page, anchor = '') =>
		isPageRenderable(page) ? { page, anchor } : null
	if (href === '') return target(root)
	const seg = splitHashSegments(href)
	if (!seg.length) return target(root)

	// First consume as many leading segments as possible as a page path.
	const { page, matched } = resolvePagePath(seg)
	if (matched === seg.length) return target(page)

	if (
		matched === 0 &&
		seg.length === 1 &&
		currentPage &&
		hasDomAnchor(containerEl, seg[0])
	) {
		// Anchor-only links inside the currently rendered page can point at raw
		// HTML ids that do not exist in parsed markdown sections.
		return target(currentPage, seg[0])
	}

	if (matched === 0 && seg.length === 1 && pageHasParsedAnchor(root, seg[0])) {
		// With no current-page DOM match, a single segment can still be a root
		// page heading.
		return target(root, seg[0])
	}

	const anchorSegments = seg.slice(matched)
	if (matched > 0 && anchorSegments.length === 1) {
		// A page path may have exactly one remaining anchor segment. More than one
		// means the route tail is ambiguous/broken.
		const anchor = anchorSegments[0]
		return pageHasRouteAnchor(page, anchor, currentPage, containerEl, hasDomAnchor)
			? target(page, anchor)
			: null
	}
	return null
}
