/*
 * Derives graph-ready nodes, links, adjacency, and descendant maps from the wiki
 * model so the interactive scene can stay focused on rendering and interaction.
 *
 * This module is pure data preparation:
 * - one node per selected wiki page
 * - hierarchy links between parent/child pages
 * - tag links between pages that share tags
 * - adjacency map for "nearby/connected" highlighting
 * - descendant map for folding/hiding graph branches
 */
import { wikiStore } from '../wiki.js'

// Add an undirected edge to the adjacency map.
//
// The graph uses adjacency to know which nodes are directly connected to a
// hovered/current node, regardless of whether the visual link points parent ->
// child or child -> parent.
export function connectAdjacency(adjacency, a, b) {
	// Ensure both ids have a Set before adding neighbors.
	if (!adjacency.has(a)) adjacency.set(a, new Set())
	if (!adjacency.has(b)) adjacency.set(b, new Set())
	// Store both directions because graph highlighting is undirected.
	adjacency.get(a).add(b)
	adjacency.get(b).add(a)
}

// Stable key for an unordered pair of page ids.
//
// pairKey("b", "a") and pairKey("a", "b") both become "a|b", so we do not
// create duplicate links for the same two pages.
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)

// Build graph data from selected pages, or the full current model by default.
export function buildGraphData(sourcePages = wikiStore.pages, root = wikiStore.root) {
	const pages = [...sourcePages]
	const pageIds = new Set(pages.map(page => page.id))
	const nodes = []
	const links = []
	// id -> Set(neighbor ids)
	const adj = new Map()
	// id -> Set(descendant ids)
	const descById = new Map()
	// Convert descendant counts into a small visual tier for hierarchy links.
	// Larger subtrees get stronger/thicker hierarchy links in the graph.
	const tierOf = n => (n < 3 ? 1 : n < 6 ? 2 : n < 11 ? 3 : n < 21 ? 4 : 5)
	pages.forEach(page => {
		// Keep a reference to the wiki page so graph interactions can navigate,
		// inspect children, tags, title, etc.
		nodes.push({
			id: page.id,
			label: page.title,
			ref: page,
			// Special pages draw as glyphs instead of circles in the scene.
			isRoot: page === root,
			isGlossary: page.id === 'km_glossary',
			childCount: page.children.filter(child => pageIds.has(child.id)).length
		})
	})
	// Descendants count only when every page in their hierarchy path is present.
	// Query graphs therefore never fold or size nodes based on filtered-out pages.
	const collectDesc = page => {
		const cached = descById.get(page.id)
		if (cached) return cached
		const set = new Set()
		for (const child of page.children) {
			if (!child?.id || !pageIds.has(child.id)) continue
			set.add(child.id)
			for (const id of collectDesc(child)) set.add(id)
		}
		descById.set(page.id, set)
		return set
	}
	pages.forEach(page => collectDesc(page))
	// Hierarchy pair keys are remembered so tag links do not duplicate a parent
	// link between the same two pages.
	const hierPairs = new Set()

	pages.forEach(page => {
		// Root/detached pages without a parent have no hierarchy edge.
		if (!page.parent || !pageIds.has(page.parent.id)) return
		// Secondary root links are artificial attachments added only so detached
		// clusters are reachable in navigation. Hiding that artificial root link
		// keeps the graph from implying authored hierarchy that does not exist.
		if (page.isSecondary && page.parent === root) return
		const a = page.id
		const b = page.parent.id
		const key = pairKey(a, b)
		links.push({
			// Prefix shows this is a hierarchy link and keeps keys unique from tag
			// links for the same ids.
			key: `h:${key}`,
			source: a,
			target: b,
			// D3 may replace source/target with node objects, so sourceId/targetId
			// preserve the original ids for rendering/class logic.
			sourceId: a,
			targetId: b,
			// Hierarchy links do not represent shared tags.
			shared: 0,
			kind: 'hier',
			// Tier is based on the child page's subtree size.
			tier: tierOf(descById.get(page.id)?.size || 0)
		})
		hierPairs.add(key)
		connectAdjacency(adj, a, b)
	})

	// Build tag -> page ids so shared-tag links can be counted by pair.
	const tagToPages = new Map()
	pages.forEach(page => {
		for (const tag of page.tagsSet) {
			if (!tagToPages.has(tag)) tagToPages.set(tag, [])
			tagToPages.get(tag).push(page.id)
		}
	})

	// pair key -> number of tags shared by the pair.
	const shared = new Map()
	// Safety cap for very broad tags. A tag applied to hundreds of pages would
	// create a dense hairball and expensive pair combinations.
	const MAX_PER_TAG = 80
	
	for (const pageIds0 of tagToPages.values()) {
		// Cap the contribution from one tag. This keeps graph density readable and
		// bounded for broad tags like "docs".
		const pageIds =	pageIds0.length > MAX_PER_TAG
				? pageIds0.slice(0, MAX_PER_TAG)
				: pageIds0
		for (let i = 0; i < pageIds.length; i++) {
			for (let j = i + 1; j < pageIds.length; j++) {
				const a = pageIds[i]
				const b = pageIds[j]
				const key = pairKey(a, b)
				// Every tag shared by this pair adds one to its shared count.
				shared.set(key, (shared.get(key) || 0) + 1)
			}
		}
	}
	for (const [key, count] of shared) {
		// Count should always be >= 1, but keep the guard explicit.
		if (count < 1 || hierPairs.has(key)) continue
		const [a, b] = key.split('|')
		links.push({
			// Prefix shows this is a tag link.
			key: `t:${key}`,
			source: a,
			target: b,
			sourceId: a,
			targetId: b,
			// Number of shared tags can drive link strength/style.
			shared: count,
			kind: 'tag'
		})
		connectAdjacency(adj, a, b)
	}
	return { nodes, links, adj, descById }
}
