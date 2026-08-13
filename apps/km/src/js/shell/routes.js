/*
 * Pure hash-route helpers. These know how KM hashes map to pages and anchors,
 * but they do not render anything.
 *
 * KM routes are hash-only because the app is a static local webpage.
 *
 * Common shapes:
 * - #                         -> root page
 * - #drones                   -> page whose path from root is "drones"
 * - #drones#intro             -> child page under drones
 * - #drones#intro#1_2         -> heading 1_2 inside that page
 * - #1_2                      -> heading 1_2 on the current page, when valid
 *
 * This file answers "what page/anchor does this hash mean?" and "what hash
 * should this page/anchor link use?". Rendering happens in router.js/render.js.
 */
import {
	$,
	CONTENT_SEL,
	baseURLNoHash,
	queryById
} from '../core/runtime.js'
import { getPageHash, isSimpleFolderPage, resolvePagePath, wikiStore } from '../wiki.js'
import { resolveRouteTarget } from './routes_core.js'

// Build a full browser URL for a page and optional heading anchor.
//
// Examples:
// - page hash "drones#intro", no anchor -> ".../index.html#drones#intro#"
// - page hash "drones#intro", anchor "1_2" -> ".../index.html#drones#intro#1_2"
// - root page, anchor "1" -> ".../index.html#1"
//
// The trailing "#" for page-only links is intentional historical behavior: it
// keeps copied page links clearly hash-routed even when there is no anchor.
export const buildPageDeepLink = (page, anchorId = '') => {
	const pageHash = getPageHash(page) || ''
	// Start from the current URL without any existing hash so copied links do
	// not accidentally keep an old page/section route.
	const base = baseURLNoHash() + '#' + pageHash
	return anchorId
		// Anchor link. Add an extra separator only when the page hash is non-empty.
		? base + (pageHash ? '#' : '') + anchorId
		: pageHash
			// Page link for non-root pages.
			? base + '#'
			// Root page link.
			: base
}

// Parse a hash or href into { page, anchor }.
//
// Returns:
// - { page, anchor } when the route is valid
// - null when the hash/href is not an internal KM route
//
// `currentPage` and `containerEl` let anchor-only links like "#1_2" resolve to
// the currently displayed page when the DOM actually contains that heading.
export function parseRouteTarget(
	hashOrHref = location.hash,
	{ currentPage = null, containerEl = $(CONTENT_SEL) } = {}
) {
	return resolveRouteTarget({
		hashOrHref,
		locationHref: location.href,
		root: wikiStore.root,
		resolvePagePath,
		isPageRenderable: page => !isSimpleFolderPage(page),
		currentPage,
		containerEl,
		hasDomAnchor: (root, id) => !!queryById(root, id)
	})
}

// True when an anchor element points to a valid internal KM page/anchor route.
//
// Used by preview/decorator code to decide whether a link should get internal
// wiki behavior instead of being treated as a normal external URL.
export function isInternalPageLink(anchor, options) {
	const href = anchor?.getAttribute('href') || ''
	// Missing href is not a link. Do not let parseRouteTarget('') fall back to
	// the current page hash and accidentally bless a non-link target.
	if (!href) return false
	return !!parseRouteTarget(href, options)
}
