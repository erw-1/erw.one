/*
 * Pure label visibility policy for the graph scene.
 *
 * graph.js projects nodes into screen space and owns the SVG. This module only
 * decides which labels deserve to be visible and which lower-priority labels
 * should hide because they collide.
 */
import { clamp } from '../core/runtime.js'

// Tunable label layout constants.
//
// These numbers are shared by graph.js and the pure visibility policy so label
// measurement and actual SVG placement stay in sync.
export const LABEL_STYLE = {
	// Font-scale clamp. The floor keeps focus/current labels readable when the
	// graph is zoomed far out; the cap keeps near/zoomed-in labels from getting
	// huge.
	scaleMin: 0.72,
	scaleMax: 2.6,
	xOffset: 10,
	yOffset: 3,
	parentZoom: 1.35,
	allZoom: 2.1,
	collisionPadX: 4,
	collisionPadY: 2,
	nodeBaseRadius: 6
}

// Depth-scaled font size.
//
// Projection can make nodes very near/far; clamping keeps labels readable
// without letting near nodes produce huge text.
export function getLabelFontSize(scale) {
	return 10 * clamp(scale ?? 1, LABEL_STYLE.scaleMin, LABEL_STYLE.scaleMax)
}

// Approximate one label's screen-space rectangle.
//
// SVG text measurement is expensive and awkward during every frame, so this
// estimates width from character count and font size. It is good enough for
// collision hiding and deterministic enough for tests.
export function getLabelBox(node) {
	// Must mirror the scale and offsets renderScene() uses to place labels.
	const scale = node.graphVisualScale ?? 1
	const fontSize = getLabelFontSize(scale)
	const x = (node.graphScreenX ?? 0) + LABEL_STYLE.xOffset * scale
	const y = (node.graphScreenY ?? 0) + LABEL_STYLE.yOffset * scale
	const width = Math.max(
		fontSize * 2.2,
		(node.label?.length || 0) * fontSize * 0.56
	)
	const height = Math.max(fontSize, fontSize * 1.12)
	return {
		left: x - LABEL_STYLE.collisionPadX,
		top: y - fontSize * 0.82 - LABEL_STYLE.collisionPadY,
		right: x + width + LABEL_STYLE.collisionPadX,
		bottom: y + height * 0.2 + LABEL_STYLE.collisionPadY
	}
}

// Axis-aligned rectangle overlap test.
export function boxesOverlap(left, right) {
	return !(
		left.right <= right.left ||
		left.left >= right.right ||
		left.bottom <= right.top ||
		left.top >= right.bottom
	)
}

// Prominent labels are allowed to bypass collision hiding.
//
// The current route page and hovered/focused node should stay labeled even when
// the graph is crowded, because those are the labels the user is actively using.
export function isProminentLabel(node, scene) {
	return (
		node.id === scene.selection.currentPageId ||
		node.id === scene.selection.focusId
	)
}

// Assign visibility priority for one node label.
//
// Higher numbers win. Negative priority means the label should not be considered
// at the current zoom/focus state.
export function getLabelPriority(node, scene) {
	const currentId = scene.selection.currentPageId
	const focusId = scene.selection.focusId
	const currentNeighbors = currentId != null ? scene.visible.adjacency.get(currentId) : null
	const focusNeighbors = focusId != null ? scene.visible.adjacency.get(focusId) : null

	// Direct focus/current labels are strongest.
	if (node.id === focusId) return 1000
	if (node.id === currentId) return 950
	// Neighbors of focus/current help the user understand local context.
	if (focusNeighbors?.has(node.id)) return 860
	if (currentNeighbors?.has(node.id)) return 780
	// Folded nodes need labels so users can understand hidden branches.
	if (scene.interaction.folded.has(node.id)) return 700
	// At medium zoom, show parent labels. At high zoom, show everything.
	const zoom = scene.camera?.zoom ?? scene.interaction.zoom ?? 1
	if (zoom >= LABEL_STYLE.parentZoom && node.ref.children.length) return 360
	if (zoom >= LABEL_STYLE.allZoom) return node.ref.children.length ? 240 : 220
	return -1
}

// Mark visible nodes with graphLabelVisible.
//
// Candidate labels are sorted by priority, then placed greedily. Once a label is
// placed, lower-priority non-prominent labels that overlap it are hidden.
export function updateLabelVisibility(scene) {
	const placed = []
	const candidates = []

	for (const node of scene.visible.nodes) {
		// Reset every frame so labels removed by zoom/fold changes do not stay
		// visible from a previous pass.
		node.graphLabelVisible = false
		if (!node.label) continue
		const priority = getLabelPriority(node, scene)
		if (priority < 0) continue
		candidates.push({
			node,
			priority,
			prominent: isProminentLabel(node, scene),
			cameraZ: node.graphCameraDepth ?? -Infinity,
			box: getLabelBox(node)
		})
	}

	candidates.sort(
		(left, right) =>
			// Priority decides first. Prominence and camera depth break ties so
			// active/foreground labels tend to paint last and remain visible.
			right.priority - left.priority ||
			(right.prominent ? 1 : 0) - (left.prominent ? 1 : 0) ||
			right.cameraZ - left.cameraZ
	)

	for (const candidate of candidates) {
		if (
			// Prominent labels bypass collision hiding; everything else must fit
			// around labels already accepted.
			!candidate.prominent &&
			placed.some(other => boxesOverlap(candidate.box, other.box))
		)
			continue
		candidate.node.graphLabelVisible = true
		placed.push(candidate)
	}
}
