/*
 * Hash-route controller for the static wiki.
 *
 * The router is the bridge between URL hash and visible article state:
 * - parse the current hash into { page, anchor }
 * - render a new page when the page changes
 * - scroll/highlight a heading when only the anchor changes
 * - keep breadcrumbs, sidebar, browser title, TOC, and graph in sync
 *
 * It deliberately does not know markdown syntax. routes.js parses hashes, and
 * content/render.js renders the page body.
 */
import { TITLE, DOC, $, CONTENT_SEL } from '../core/runtime.js'
import { wikiStore } from '../wiki.js'
import { syncCurrentGraphPage } from '../graph/graph.js'
import {
	renderPage,
	resetScrollTop,
	scrollToAnchor
} from '../content/render.js'
import {
	clearTocHighlight,
	highlightSidebar,
	highlightTocAnchor,
	renderBreadcrumbs
} from './nav.js'
import { parseRouteTarget } from './routes.js'

// Last page that successfully became the current rendered page.
//
// This lets the router distinguish between:
// - navigating to a different page
// - navigating to another heading on the same already-rendered page
let currentPage = null

// Read the page that is currently rendered in the main article.
//
// Preview routing uses this as the page context for short same-page links like
// "#footnote-1". Without that context, the route parser cannot know which page
// owns a DOM-only anchor such as a footnote id.
export const getCurrentPage = () => currentPage

// Monotonic route id used to ignore stale async renders.
//
// renderPage() can do async work. If the user changes routes before that work
// finishes, the older render must not overwrite state for the newer route.
let routeToken = 0

// Guard so startRouter() can be called more than once without adding duplicate
// hashchange listeners.
let routerStarted = false

// Hook supplied by shell.js. app.js passes shell.closePanels so mobile overlays
// close before the route changes.
let beforeRoute = () => {}

// Invalid or unresolvable hashes fall back to the wiki root.
const routeTargetOrRoot = (target, root) =>
	target ?? { page: root, anchor: '' }

// Browser tab title includes page title only when it differs from wiki title.
const getRouteDocumentTitle = (page, wikiTitle) => {
	const pageTitle = page?.title || ''
	return pageTitle && pageTitle !== wikiTitle
		? `${pageTitle} \u2022 ${wikiTitle}`
		: wikiTitle
}

// Async renders commit only when they rendered and are still the latest route.
const canCommitRenderedRoute = (rendered, token, activeToken) =>
	!!rendered && token === activeToken

// Parse the browser hash into a route target, with root fallback.
function getCurrentRouteTarget() {
	return routeTargetOrRoot(parseRouteTarget(location.hash, {
		currentPage,
		containerEl: $(CONTENT_SEL)
	}), wikiStore.root)
}

// A different page means full article rerender.
function applyPageRoute(page, anchor, token) {
	DOC.title = getRouteDocumentTitle(page, TITLE)
	renderBreadcrumbs(page)
	renderPage(page, anchor, { isCurrentToken: () => token === routeToken })
		.then(rendered => {
			if (canCommitRenderedRoute(rendered, token, routeToken))
				currentPage = page
		})
		.catch(err => {
			if (token === routeToken) console.warn('Route render failed:', err)
		})
	syncCurrentGraphPage(true)
	highlightSidebar(page)
}

// Same-page hash changes scroll or reset without rerendering the article.
function applySamePageRoute(page, anchor, token) {
	if (anchor) {
		scrollToAnchor(anchor, page, $(CONTENT_SEL))
		highlightTocAnchor(anchor)
		return
	}
	clearTocHighlight()
	requestAnimationFrame(() => {
		// If another route starts before the frame runs, skip this old scroll.
		if (token === routeToken) resetScrollTop()
	})
}

// Apply the current location.hash to the UI.
//
// This runs on initial startup and every hashchange event.
function applyRoute() {
	// Increment first so every async task launched during this route gets a
	// unique token to compare against later.
	const token = ++routeToken
	// Let the shell clean up route-adjacent UI, such as closing overlay panels.
	beforeRoute()
	const { page, anchor } = getCurrentRouteTarget()
	if (currentPage !== page) applyPageRoute(page, anchor, token)
	else applySamePageRoute(page, anchor, token)
}

// Start hash routing.
//
// app.js calls this after the shell and sidebar are ready. The initial
// applyRoute() handles whatever hash was already in the URL on page load.
export function startRouter({ beforeNavigate = () => {} } = {}) {
	// Store a valid hook function. Non-functions become a harmless no-op.
	beforeRoute =
		typeof beforeNavigate === 'function' ? beforeNavigate : () => {}
	if (!routerStarted) {
		// Passive because the router does not call preventDefault() on hashchange.
		addEventListener('hashchange', applyRoute, { passive: true })
		routerStarted = true
	}
	// Render the initial route immediately.
	applyRoute()
}
