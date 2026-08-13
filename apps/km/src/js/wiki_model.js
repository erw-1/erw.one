/*
 * Pure wiki model helpers.
 *
 * These functions turn a markdown bundle into page objects, validate parent
 * links, derive search sections, attach detached clusters, and build glossary
 * lookup data. They intentionally do not read or write DOM state.
 *
 * Imports come from core/text.js rather than core/runtime.js so this file stays
 * importable in Node; test-wiki-model.mjs depends on that.
 */
import {
	RE_FENCE,
	RE_HEADING_FULL,
	escapeRegex
} from './core/text.js'

// Locale-aware, case-insensitive title sorting. This is nicer than plain string
// comparison for accented titles and mixed case.
const titleCollator = new Intl.Collator(undefined, { sensitivity: 'base' })

export const comparePagesByTitle = (a, b) =>
	titleCollator.compare(a.title, b.title)

// Normalize and validate the id from one <!--km ... --> header.
//
// Page ids become hash-route segments, so they must be present and they cannot
// contain "#", which is KM's route separator.
export function normalizePageId(rawId, index) {
	const id = String(rawId ?? '').trim()
	if (!id) throw new Error(`KM page #${index + 1} is missing an id.`)
	if (id.includes('#'))
		throw new Error(`KM page id "${id}" cannot contain "#".`)
	return id
}

// Parse the small metadata header inside a KM page marker.
//
// Supported shapes are intentionally simple:
// - id: home
// - title = Home
// - aliases: "one", "two"
//
// Quoted multi-values become arrays; unquoted values stay strings.
export function parseHeaderMeta(header) {
	const meta = {}
	for (const line of header.split(/\r?\n/)) {
		const match = /^\s*(\w+)\s*[:=]\s*(.+?)\s*$/.exec(line)
		if (!match) continue
		const [, key, rawValue] = match
		const quoted = [...rawValue.matchAll(/"((?:\\.|[^"\\])*)"/g)].map(
			([, value]) => value.replace(/\\"/g, '"').trim()
		)
		if (quoted.length > 1) meta[key] = quoted
		else if (quoted.length === 1) meta[key] = quoted[0]
		else {
			const bare = rawValue.trim().replace(/,$/, '')
			if (bare) meta[key] = bare
		}
	}
	return meta
}

// Temporarily hide HTML comment delimiters inside fenced code blocks.
//
// The page splitter looks for real <!--km --> markers. Authors may also show
// those markers as examples inside ``` fences; those should stay in the page
// body instead of becoming fake pages.
export function maskCommentMarkersInFencedBlocks(text) {
	const open = '\uE000'
	const close = '\uE001'
	const sanitized = text.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, block =>
		block.replace(/<!--/g, open).replace(/-->/g, close)
	)
	return { sanitized, open, close }
}

// Extract searchable heading sections from raw markdown content.
//
// Section ids mirror render.js's generated heading ids: counters are nested by
// heading level, so "# A / ## B / ## C" becomes "1", "1_1", "1_2".
export function parseSections(content) {
	const counters = [0, 0, 0, 0, 0, 0]
	const sections = []
	let inFence = false
	let current = null
	let bodyLines = []

	const flushCurrent = () => {
		if (!current) return
		// Store both visible heading text and body text so search can match a
		// section without reparsing markdown later.
		current.body = bodyLines.join('\n').trim()
		current.search = (current.txt + ' ' + current.body).toLowerCase()
		sections.push(current)
	}

	for (const line of content.split(/\r?\n/)) {
		// Fence tracking keeps headings in code examples out of the section list.
		if (RE_FENCE.test(line)) inFence = !inFence
		const headingMatch = !inFence ? line.match(RE_HEADING_FULL) : null
		if (headingMatch) {
			flushCurrent()
			const [, hashes, text] = headingMatch
			const level = hashes.length - 1
			counters[level]++
			for (let i = level + 1; i < 6; i++) counters[i] = 0
			current = {
				id: counters
					.slice(0, level + 1)
					.filter(Boolean)
					.join('_'),
				txt: text.trim()
			}
			bodyLines = []
		} else if (current) {
			bodyLines.push(line)
		}
	}
	flushCurrent()
	return sections
}

// Add derived fields used by search, navigation, graph, and glossary code.
//
// These fields are deliberately cached on the page object because all search
// queries run client-side against the loaded bundle.
export function enrichPage(page) {
	page.tagsSet = new Set(
		(page.tags || '')
			.split(',')
			.map(tag => tag.trim())
			.filter(Boolean)
	)
	page.titleL = (page.title || '').toLowerCase()
	page.tagsL = [...page.tagsSet].join(' ').toLowerCase()
	page.bodyL = (page.content || '').toLowerCase()
	page.searchStr = `${page.titleL} ${page.tagsL} ${page.bodyL}`
	page.sections = parseSections(page.content || '')
	return page
}

// Validate parent links before mutating the tree.
//
// Missing parents are allowed: those pages become detached clusters and are
// attached later as secondary roots. Cycles are not allowed because trail,
// hash, graph, and sidebar logic all walk parent chains.
export function validateParentGraph(parsedPages, mainRoot, pageById) {
	const visiting = new Set()
	const visited = new Set()
	const stack = []

	function visit(page) {
		if (!page || visited.has(page.id)) return
		if (visiting.has(page.id)) {
			// Keep the error readable by reporting the cycle path from the first
			// repeated page back to itself.
			const cycleStart = stack.indexOf(page.id)
			const cycle = stack.slice(Math.max(0, cycleStart)).concat(page.id)
			throw new Error(`KM parent cycle detected: ${cycle.join(' -> ')}`)
		}
		visiting.add(page.id)
		stack.push(page.id)
		if (page !== mainRoot && page.parentId) {
			if (page.parentId === page.id)
				throw new Error(`KM page "${page.id}" cannot be its own parent.`)
			visit(pageById.get(page.parentId))
		}
		stack.pop()
		visiting.delete(page.id)
		visited.add(page.id)
	}

	parsedPages.forEach(visit)
}

// Turn parentId strings into actual parent/children object links.
//
// The main root stays root even if the author gave it a parent. Missing parents
// are left detached for attachSecondaryRootsToModel().
export function linkPageParents(parsedPages, mainRoot, pageById) {
	parsedPages.forEach(page => {
		// Reset first so rebuilding the model from a fresh bundle cannot keep old
		// child links.
		page.children = []
		page.parent = null
	})
	parsedPages.forEach(page => {
		if (page === mainRoot || !page.parentId) return
		const parent = pageById.get(page.parentId)
		if (!parent) return
		page.parent = parent
		parent.children.push(page)
	})
}

// Mark explicitly declared simple folders and preserve the legacy structural
// convention for older bundles that predate the `kind: "simple"` marker.
//
// Explicit markers preserve the author's intent before a folder has children.
// A body wins over the marker so malformed metadata never hides authored
// content. The main root always remains an article route.
export function markSimpleFolders(parsedPages, mainRoot) {
	parsedPages.forEach(page => {
		const empty = !String(page.content || '').trim()
		const explicitlySimple = empty && page.kind === 'simple'
		const legacySimple =
			empty &&
			page.children.length > 0
		page.isSimpleFolder =
			page !== mainRoot &&
			(explicitlySimple || legacySimple)
	})
}

// Parse the full markdown bundle into the in-memory wiki model.
//
// A bundle is a sequence of <!--km ... --> headers followed by markdown bodies.
// This function intentionally performs only model work; fetching and DOM state
// belong to app.js/wiki.js/render.js.
export function parseBundle(text) {
	const { sanitized, open, close } = maskCommentMarkersInFencedBlocks(text)
	const parsedPages = []
	const pageById = new Map()
	const kmRe = /^[ \t]*<!--\s*km\b([\s\S]*?)-->[ \t]*\r?\n?([\s\S]*?)(?=^[ \t]*<!--\s*km\b|(?![\s\S]))/gm
	for (const [, header, body] of sanitized.matchAll(kmRe)) {
		const meta = parseHeaderMeta(header)
		// Restore example comment delimiters that were hidden inside fences before
		// splitting the bundle.
		const content = (body || '')
			.replace(new RegExp(open, 'g'), '<!--')
			.replace(new RegExp(close, 'g'), '-->')
			.trim()
		const page = {
			...meta,
			id: normalizePageId(meta.id, parsedPages.length),
			parentId: String(meta.parent ?? '').trim(),
			kind: String(meta.kind ?? '').trim().toLowerCase(),
			content,
			children: []
		}
		if (pageById.has(page.id))
			throw new Error(`Duplicate KM page id: "${page.id}".`)
		parsedPages.push(page)
		pageById.set(page.id, page)
	}
	if (!parsedPages.length) throw new Error('No pages parsed from MD bundle.')
	const mainRoot = pageById.get('home') || parsedPages[0]
	validateParentGraph(parsedPages, mainRoot, pageById)
	linkPageParents(parsedPages, mainRoot, pageById)
	parsedPages.forEach(page => enrichPage(page))
	markSimpleFolders(parsedPages, mainRoot)
	return { pages: parsedPages, byId: pageById, root: mainRoot }
}

// Parse optional glossary aliases from the top of a glossary section body.
//
// The first non-empty line may be "aliases: one, two". That line is metadata
// for matching, not part of the rendered definition body.
export function parseGlossarySectionBody(body) {
	const lines = (body || '').split(/\r?\n/)
	let aliases = []
	let i = 0
	while (i < lines.length && !lines[i].trim()) i++
	if (i < lines.length) {
		const match = /^\s*aliases?\s*:\s*(.+)\s*$/i.exec(lines[i])
		if (match) {
			aliases = match[1]
				.split(/\s*,\s*/)
				.map(value => value.trim())
				.filter(Boolean)
			lines.splice(i, 1)
		}
	}
	return { aliases, body: lines.join('\n').trim() }
}

// Skip a first section that simply repeats the glossary page title.
//
// Authors commonly start the glossary page with "# Glossary"; that heading is
// the page title, not a term definition.
export function isGlossaryLeadTitleSection(section, glossaryPage) {
	return (
		section === glossaryPage?.sections?.[0] &&
		(section?.txt || '').trim().toLocaleLowerCase() ===
			(glossaryPage?.title || '').trim().toLocaleLowerCase()
	)
}

// Build the glossary lookup model from the special km_glossary page.
//
// The result contains:
// - entries for rendering popovers
// - bySurface for case-insensitive term/alias lookup
// - matcher for scanning rendered text nodes
export function buildGlossaryModel(pageById) {
	const empty = {
		page: null,
		entries: [],
		byKey: new Map(),
		bySurface: new Map(),
		matcher: null
	}
	const glossaryPage = pageById.get('km_glossary')
	if (!glossaryPage?.sections?.length) return empty
	const glossaryModel = { ...empty, page: glossaryPage }
	let seq = 0
	for (const section of glossaryPage.sections) {
		const term = (section.txt || '').trim()
		if (!term || isGlossaryLeadTitleSection(section, glossaryPage)) continue
		const parsed = parseGlossarySectionBody(section.body || '')
		// Anchor id points back to the generated markdown heading id.
		const entry = {
			key: `glossary-${seq++}`,
			term,
			body: parsed.body,
			aliases: parsed.aliases,
			anchorId: section.id,
			page: glossaryPage
		}
		glossaryModel.entries.push(entry)
		glossaryModel.byKey.set(entry.key, entry)
		// All visible surfaces for a term share one entry: the term itself plus
		// any aliases declared in the section body.
		const surfaces = new Set([term, ...parsed.aliases])
		for (const surface0 of surfaces) {
			const surface = (surface0 || '').trim()
			const norm = surface.toLocaleLowerCase()
			if (
				!surface ||
				surface.length < 2 ||
				glossaryModel.bySurface.has(norm)
			)
				continue
			glossaryModel.bySurface.set(norm, { entry, surface })
		}
	}
	// Longest terms first prevents "JS" from matching inside "JavaScript" when
	// both are glossary surfaces.
	const terms = [...glossaryModel.bySurface.values()]
		.map(value => value.surface)
		.sort((a, b) => b.length - a.length || titleCollator.compare(a, b))
	if (terms.length) {
		glossaryModel.matcher = new RegExp(
			`(?<![\\p{L}\\p{N}])(${terms.map(escapeRegex).join('|')})(?![\\p{L}\\p{N}])`,
			'giu'
		)
	}
	return glossaryModel
}

// Count all descendants under a page.
//
// Secondary-root attachment uses this as a tie breaker when a detached cluster
// has more than one top-ish page and one should represent the cluster.
export function countDescendants(page) {
	let count = 0
	;(function walk(node) {
		node.children.forEach(child => {
			count++
			walk(child)
		})
	})(page)
	return count
}

// Attach detached clusters under the main root as secondary navigation roots.
//
// A detached cluster is any page group whose top ancestor is not the main root.
// We keep these pages reachable without pretending the author's missing parent
// metadata was valid.
export function attachSecondaryRootsToModel(parsedPages, mainRoot) {
	const getTopAncestor = page => {
		while (page.parent) page = page.parent
		return page
	}
	const pagesByDetachedRoot = new Map()
	for (const page of parsedPages) {
		const detachedRoot = getTopAncestor(page)
		if (detachedRoot === mainRoot) continue
		if (!pagesByDetachedRoot.has(detachedRoot))
			pagesByDetachedRoot.set(detachedRoot, [])
		pagesByDetachedRoot.get(detachedRoot).push(page)
	}
	let nextClusterId = 0
	for (const [, clusterPages] of pagesByDetachedRoot) {
		// Pick the page with the largest subtree as the sidebar representative.
		// This keeps a detached branch intact even if the first parsed page in the
		// branch is a leaf.
		const representative = clusterPages.reduce(
			(left, right) =>
				countDescendants(right) > countDescendants(left) ? right : left,
			clusterPages[0]
		)
		if (!representative.parent) {
			representative.parent = mainRoot
			representative.isSecondary = true
			representative.clusterId = nextClusterId++
			mainRoot.children.push(representative)
		}
	}
	return mainRoot
}

// Build the hash path for a page from its parent chain.
//
// The root page has an empty hash. Child pages join ids with "#", producing
// routes such as "docs#api".
export function buildPageHash(page) {
	const segments = []
	for (let node = page; node && node.parent; node = node.parent)
		segments.unshift(node.id)
	return segments.join('#')
}

// Resolve as many path segments as possible from the root.
//
// The router uses `matched` to decide whether remaining segments are a valid
// anchor or a broken route tail.
export function resolvePagePathInTree(root, segments = []) {
	let page = root
	let matched = 0
	for (const id of segments || []) {
		const child = page?.children?.find(candidate => candidate.id === id)
		if (!child) break
		page = child
		matched++
	}
	return { page, matched }
}
