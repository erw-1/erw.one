/*
 * Pure graph-link view derivation.
 *
 * graph.js owns D3 joins and mutation-heavy scene state. This helper derives
 * the visual fields for one link after node screen/depth fields are known.
 */

import { getLinkVisualScale } from './graph_math.js'

const TAG_LINK_STROKES = [
	'var(--color-accent-quarter)',
	'var(--color-accent-mid)',
	'var(--color-accent-3quarter)',
	'var(--color-accent-3quarter)',
	'var(--color-accent)'
]

// Hierarchy links use tier; tag links use number of shared tags.
export const getGraphLinkLevel = link =>
	Math.min(link.kind === 'hier' ? link.tier : link.shared, 5)

// Hierarchy links are neutral; tag links become more accent-colored as count rises.
export const getGraphLinkStroke = (link, level = getGraphLinkLevel(link)) =>
	link.kind === 'hier'
		? 'var(--color-mid-contrast)'
		: TAG_LINK_STROKES[level - 1]

// Return the SVG-ready view fields for one link.
export function getGraphLinkView(link, edgePath) {
	const sourceDepth = link.source?.graphCameraDepth ?? -Infinity
	const targetDepth = link.target?.graphCameraDepth ?? -Infinity
	const level = getGraphLinkLevel(link)
	return {
		// Midpoint depth: sorting a link by its nearest endpoint paints it over
		// mid-depth nodes it should sit behind.
		graphCameraDepth: (sourceDepth + targetDepth) / 2,
		graphRole: link.kind,
		// Width tracks endpoint depth and zoom so links thin out with the layout.
		graphWidth: `${level * getLinkVisualScale(link)}px`,
		graphStroke: getGraphLinkStroke(link, level),
		graphPath: edgePath(link)
	}
}
