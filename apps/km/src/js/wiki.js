/*
 * Live wiki store facade.
 *
 * The pure parsing/model work lives in wiki_model.js. This module owns the
 * mutable current wiki instance used by rendering, search, routing, and graph
 * code.
 */
import {
	attachSecondaryRootsToModel,
	buildGlossaryModel,
	buildPageHash,
	comparePagesByTitle,
	countDescendants,
	parseBundle,
	resolvePagePathInTree
} from './wiki_model.js'

export { comparePagesByTitle, countDescendants }

// Current loaded wiki model.
//
// This module is the one mutable bridge between pure model helpers and the
// browser UI. Keeping the state here lets render/search/router/graph modules
// import a small stable API instead of passing the whole model everywhere.
let pages = []
let root = null
let glossary = null
let byId = new Map()

// Clear all model state before loading a new markdown bundle.
//
// In normal use the app loads one bundle at startup, but resetting here keeps
// tests and future reload workflows from accidentally sharing old pages.
function resetModelState() {
	pages = []
	byId = new Map()
	root = null
	glossary = null
}

// Parse a raw markdown bundle and install it as the active wiki model.
//
// Secondary roots and hashes are computed as separate steps because app.js keeps
// the startup flow visible: parse -> attach detached clusters -> compute routes.
export function loadMarkdownBundle(txt) {
	resetModelState()
	const parsed = parseBundle(txt)
	pages = parsed.pages
	byId = parsed.byId
	root = parsed.root
}

// Attach detached page clusters under the main root.
//
// This preserves reachability when author metadata references missing parents or
// intentionally creates separate top-level groups.
export function attachSecondaryRoots() {
	if (root) attachSecondaryRootsToModel(pages, root)
}

// Precompute hash routes once after the tree is final.
//
// Many UI call sites need hashes for links, search results, breadcrumbs, and
// graph navigation. Storing them avoids rebuilding parent paths repeatedly.
export function computePageHashes() {
	pages.forEach(page => {
		page.hash = buildPageHash(page)
	})
}

// A root page has an empty hash, so normalize missing hash values to "".
export const getPageHash = page => page?.hash ?? ''

// Resolve a hash path against the active root.
export function resolvePagePath(segments = []) {
	return resolvePagePathInTree(root, segments)
}

// Convenience wrapper for callers that only need the final page object.
export const findPageByPath = segments => resolvePagePath(segments).page

// Navigate by writing the static hash route.
//
// The router listens to hashchange and performs the actual render.
export function navigateToPage(page) {
	if (page) location.hash = '#' + getPageHash(page)
}

// Folder-only pages are navigation structure, not article content.
export const isSimpleFolderPage = page => !!page?.isSimpleFolder

// Split root children into the normal tree and secondary detached clusters.
export function getSidebarRoots() {
	if (!root) return { primary: [], secondary: [] }
	const primary = []
	const secondary = []
	root.children.forEach(page => {
		;(page.isSecondary ? secondary : primary).push(page)
	})
	// Preserve cluster attachment order for deterministic sidebar rendering.
	secondary.sort((a, b) => a.clusterId - b.clusterId)
	return { primary, secondary }
}

// Build breadcrumb trail from root child to the current page.
//
// The root itself is omitted because the shell already has a fixed home link.
export function getPageTrail(page) {
	const trail = []
	for (let node = page; node; node = node.parent) trail.unshift(node)
	if (trail.length) trail.shift()
	return trail
}

// Find previous/next article pages among a page's siblings.
//
// Folder-only siblings are skipped because they cannot render an article.
export function getSiblingNav(page) {
	if (!page) return { siblings: [], prev: null, next: null }
	const siblings = page.parent
		? page.parent.children.filter(candidate => !candidate.isSimpleFolder)
		: []
	const index = siblings.indexOf(page)
	return {
		siblings,
		prev: index > 0 ? siblings[index - 1] : null,
		next:
			index >= 0 && index < siblings.length - 1
				? siblings[index + 1]
				: null
	}
}

// Named trails follow bundle order, independent of the page tree.
export function getReadingTrail(page) {
	const name = String(page?.trail ?? '').split(',')[0].trim()
	if (!name) return null
	const trailPages = pages.filter(candidate =>
		!isSimpleFolderPage(candidate) &&
		String(candidate.trail ?? '').split(',').map(value => value.trim()).includes(name)
	)
	const index = trailPages.indexOf(page)
	if (index < 0) return null
	return {
		name,
		pages: trailPages,
		index,
		prev: trailPages[index - 1] || null,
		next: trailPages[index + 1] || null
	}
}

// Count shared tags between two page tag sets.
function countSharedTags(leftTags, rightTags) {
	let shared = 0
	for (const tag of leftTags) {
		if (rightTags.has(tag)) shared++
	}
	return shared
}

// Rank related pages by shared tags.
//
// Pages outside the current sibling group are listed first so "See also" tends
// to broaden navigation instead of repeating the local prev/next list.
function buildRelatedPages(page) {
	const tags = page.tagsSet || new Set()
	if (!tags.size) return []
	const scored = pages
		.filter(candidate => candidate !== page && !candidate.isSimpleFolder)
		.map(candidate => ({
			page: candidate,
			shared: countSharedTags(candidate.tagsSet, tags)
		}))
		.filter(item => item.shared > 0)
		.sort(
			(a, b) => b.shared - a.shared || comparePagesByTitle(a.page, b.page)
		)
	return [
		...scored.filter(item => item.page.parent !== page.parent),
		...scored.filter(item => item.page.parent === page.parent)
	].map(item => item.page)
}

// Public related-page lookup with a small default cap for the article footer.
export function getRelatedPages(page, limit = 6) {
	if (!page) return []
	return buildRelatedPages(page).slice(0, limit)
}

// Build glossary model lazily.
//
// Most pages do not need glossary matching during initial model load. The first
// render/annotation pass asks for it and then reuses the cached result.
export function getGlossaryModel() {
	glossary ||= buildGlossaryModel(byId)
	return glossary
}

// Read-only accessors for the active model.
//
// Search/router/graph code import this object and always see the latest loaded
// pages/root without being able to replace the arrays directly.
export const wikiStore = {
	get pages() {
		return pages
	},
	get root() {
		return root
	}
}
