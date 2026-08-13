/*
 * Owns the interactive SVG graph scene: visible-graph filtering, scene updates,
 * pointer gestures, node folding, labels, fullscreen legend, and route syncing.
 *
 * Most graph data preparation and camera math live in graph_data.js and
 * graph_math.js. This file owns the stateful scene:
 * - D3 force simulation
 * - SVG layers and joins
 * - hover/current-page dimming
 * - folded branch visibility
 * - node dragging and canvas rotate/zoom/pan
 * - syncing graph focus with the current hash route
 */
import { DOC, $, clamp, hashSegments, markOnce, clearSelection } from '../core/runtime.js'
import { ensureD3 } from '../core/loaders.js'
import { t } from '../core/i18n.js'
import { findPageByPath, navigateToPage, wikiStore } from '../wiki.js'
import { ensureGraphLegend, syncGraphLegend } from './legend.js'
import { buildGraphData, connectAdjacency } from './graph_data.js'
import {
	cameraDeltaToWorld,
	createGraphCamera,
	edgeAnchoredCurvePath,
	fitZoomToNodes,
	getDepthScale,
	panCamera,
	projectNode3D,
	rotateCamera,
	zoomCameraAt
} from './graph_math.js'
import { getGraphLinkView } from './graph_link_view.js'
import {
	LABEL_STYLE,
	getLabelFontSize,
	isProminentLabel,
	updateLabelVisibility
} from './graph_labels.js'

const NODE_BASE_RADIUS = LABEL_STYLE.nodeBaseRadius
// Opacity for nodes/links that are not connected to the hovered/focused node.
const NEIGHBOR_DIM_OPACITY = 0.15

// Simulation alpha values used when user actions disturb the graph.
const DRAG_RESTART_ALPHA = 0.25
const FOLD_RESTART_ALPHA = 0.22
const CURRENT_PAGE_RESTART_ALPHA = 0.15

// Small velocity pull toward the center when the current page changes.
const CURRENT_PAGE_PULL = 0.1

// After a node release, keep the simulation warm until that node's links have
// contracted back under this world length. A single decaying alpha pulse
// cannot recover an arbitrarily large stretch (dragging at min zoom moves
// nodes 4x farther in world space than on screen).
const RELAX_LINK_LENGTH = 480
const RELAX_POLL_MS = 250
const RELAX_TIMEOUT_MS = 1000
// Residual alpha allowed once relaxing finishes. Cutting the leftover energy
// here stops the post-recovery whole-graph wobble within a few ticks instead
// of letting alpha decay audibly for seconds.
const RELAX_COOL_ALPHA = 0.05

// Mouse button -> canvas interaction mode.
// 0 left button rotates, 1 middle button zooms, 2 right button pans.
const MODE_BY_BUTTON = { 0: 'rotate', 1: 'zoom', 2: 'pan' }

const ROTATE_SPEED = 0.005
const ZOOM_DRAG_SPEED = 0.003
const MOMENTUM_DECAY = 0.92
const MOMENTUM_EPSILON = 0.00008
const FRAME_MS = 1000 / 60

// Paint order within the shared depth layer. Depth sort comes first, then this
// breaks ties so links sit behind fold petals, which sit behind nodes.
const DEPTH_PAINT_ORDER = { link: 0, fold: 1, node: 2 }

// Singleton scene for the mini graph SVG.
let miniGraph = null

// Sort by camera depth. Lower/farther depths are painted first.
const compareCameraDepth = (left, right) => (left?.graphCameraDepth ?? -Infinity) - (right?.graphCameraDepth ?? -Infinity)

// Read the paint-order tie breaker from an SVG element.
const getDepthPaintOrder = element => Number(element?.dataset?.paintOrder || 0)

// Apply SVG size attributes and viewBox together.
function setSvgSize(svg, width, height) {
	svg.attr('viewBox', `0 0 ${width} ${height}`)
		.attr('width', width)
		.attr('height', height)
		.attr('preserveAspectRatio', 'xMidYMid meet')
}

// Give every node an initial z position.
//
// D3 mostly works in x/y here, so a random z seed creates immediate pseudo-3D
// depth variation for projection and paint sorting.
function seedNodeDepth(nodes) {
	nodes.forEach(node => {
		node.z = (Math.random() - 0.5) * 200
	})
}

// Create the D3 force simulation.
//
// D3 owns node/link physics. The rest of this file reads the resulting x/y/z
// positions and projects them into SVG.
function createSimulation(D3, nodes, links) {
	return D3.forceSimulation(nodes, 3)
		.force(
			'link',
			D3.forceLink(links)
				// Links refer to nodes by id until D3 resolves them to objects.
				.id(datum => datum.id)
				.distance(80)
		)
		// Repel nodes so the graph spreads out.
		.force('charge', D3.forceManyBody().strength(-240))
		// Keep the simulation centered around world origin.
		.force('center', D3.forceCenter(0, 0))
		// Pull z values gently toward 0 so depth stays lively but bounded.
		.force('z', D3.forceZ(0).strength(0.05))
		.force(
			'collide',
			// Slightly larger collision radius for long labels.
			D3.forceCollide(
				datum => 10 + (datum.label?.length || 0) * 0.25
			).strength(0.7)
		)
}

// D3 mutates link.source from id string to node object. This helper reads the id
// correctly before or after that mutation.
function getLinkSourceId(link) {
	return typeof link.source === 'object' ? link.source.id : link.sourceId
}

// Same as getLinkSourceId(), but for link.target.
function getLinkTargetId(link) {
	return typeof link.target === 'object' ? link.target.id : link.targetId
}

// Build adjacency from currently visible links.
//
// When branches are folded, hidden links should not count as visible neighbors
// for hover dimming.
function buildVisibleAdjacency(links) {
	const adjacency = new Map()
	links.forEach(link =>
		connectAdjacency(
			adjacency,
			getLinkSourceId(link),
			getLinkTargetId(link)
		)
	)
	return adjacency
}

// Compute ids hidden by folded branches.
//
// Folding a node hides all of its descendants, not the folded node itself. The
// folded node remains visible as the branch handle.
function collectHiddenNodeIds(foldedIds, descendants) {
	const hidden = new Set()
	for (const id of foldedIds) {
		const branch = descendants.get(id)
		// Node has no known descendants.
		if (!branch?.size) continue
		// Hide every descendant id in that branch.
		for (const childId of branch) hidden.add(childId)
	}
	return hidden
}

// CSS classes for one node label.
function getLabelClass(node, scene) {
	const classes = ['graph_text']
	const currentId = scene.selection.currentPageId
	const focusId = scene.selection.focusId
	// Folder-only pages get distinct label styling.
	if (node.ref.isSimpleFolder) classes.push('simple-folder')
	// Current route page.
	if (node.id === currentId) classes.push('current')
	// Current/focused labels float above normal labels visually.
	if (node.id === currentId || node.id === focusId) classes.push('graph_text_float')
	// Hover/focus label.
	if (node.id === focusId) classes.push('graph_text_focus')
	return classes.join(' ')
}

// Build the small petal markers around a folded node.
//
// The number of petals equals the number of hidden direct children. It gives the
// user a visible hint that this node has folded content below it.
function buildFoldPetals(count, baseRadius = NODE_BASE_RADIUS) {
	// No folded children, no marker petals.
	if (!count) return []
	// Petals get smaller as count grows so dense folders stay compact.
	const rx = clamp(1.6 - Math.min(count, 18) * 0.03, 0.78, 1.6)
	const ry = clamp(3.2 - Math.min(count, 18) * 0.08, 1.35, 3.2) * 0.5
	const orbit = baseRadius + ry - 0.2
	const petals = []
	for (let i = 0; i < count; i++) {
		// Distribute petals evenly around the node.
		const angle = -Math.PI / 2 + (Math.PI * 2 * i) / count
		petals.push({
			i,
			cx: Math.cos(angle) * orbit,
			cy: Math.sin(angle) * orbit,
			rx,
			ry,
			rotate: (angle * 180) / Math.PI + 90
		})
	}
	return petals
}

// House silhouette for the root/home page, drawn in NODE_BASE_RADIUS units
// around the node origin: roof peak, walls, and a door notch.
const HOME_GLYPH_PATH =
	'M0 -6 L6 -1 L4.4 -1 L4.4 5.5 L1.6 5.5 L1.6 1.8 L-1.6 1.8 L-1.6 5.5 L-4.4 5.5 L-4.4 -1 L-6 -1 Z'

// Glyph nodes draw on a slightly larger kind-colored disc with the glyph
// knocked out in the panel background color. A bare silhouette gets illegible
// where many links converge; the disc gives links a clean boundary to inset
// against and keeps the node's color language.
const GLYPH_DISC_RADIUS = 8
const GLYPH_INNER_SCALE = 0.62

// Append the visual mark for one node into its group.
//
// Most pages draw as circles. The home page draws as a house and the glossary
// page as a dotted-underlined "a" (matching the sidebar/editor glyph).
function appendNodeShape(group, node) {
	if (!node.isRoot && !node.isGlossary) {
		group.append('circle').attr('r', node.graphBaseRadius)
		return
	}
	// The disc is the node body: hit target, link inset radius, kind color.
	node.graphBaseRadius = GLYPH_DISC_RADIUS
	group.append('circle').attr('r', GLYPH_DISC_RADIUS)
	const glyph = group
		.append('g')
		.attr('class', 'node-glyph')
		.attr('pointer-events', 'none')
		.attr(
			'transform',
			`scale(${GLYPH_INNER_SCALE}) translate(0 ${node.isGlossary ? -1 : 0})`
		)
	if (node.isRoot) {
		glyph.append('path').attr('d', HOME_GLYPH_PATH)
		return
	}
	glyph
		.append('text')
		.attr('class', 'node-glyph-text')
		.attr('text-anchor', 'middle')
		.attr('y', 4.6)
		.text('a')
	glyph
		.append('line')
		.attr('x1', -4.2)
		.attr('x2', 4.2)
		.attr('y1', 6.4)
		.attr('y2', 6.4)
}

// Categorize one node for CSS styling.
function getNodeKind(node, currentPageId) {
	if (node.id === currentPageId) return 'current'
	if (node.ref.isSimpleFolder) return 'simple-folder'
	return node.childCount ? 'parent' : 'leaf'
}

// Number of direct children represented by the folded petal marker.
function getFoldedChildCount(scene, node) {
	return scene.interaction.folded.has(node.id) ? node.childCount : 0
}

// Hover/focus dimming is disabled while a node drag is active.
function getActiveFocusId(scene) {
	return scene.selection.nodeDragActive
		? null
		: scene.selection.focusId
}

// Common opacity helper for focus-neighbor dimming.
//
// `isFocusedOrNeighbor` is a caller-provided test for whether the thing being
// drawn should stay bright for the active focus id.
function getFocusOpacity(scene, isFocusedOrNeighbor) {
	const focusId = getActiveFocusId(scene)
	// No focus means everything is fully visible.
	if (focusId == null) return 1
	return isFocusedOrNeighbor(focusId)
		? 1
		: NEIGHBOR_DIM_OPACITY
}

// True when a node is the focus node or directly connected to it.
function isNodeNearFocus(node, scene, focusId) {
	const neighbors = scene.visible.adjacency.get(focusId)
	return node.id === focusId || neighbors?.has(node.id)
}

// Opacity for one node/fold marker under current focus state.
function getNodeOpacity(node, scene) {
	return getFocusOpacity(scene, focusId =>
		isNodeNearFocus(node, scene, focusId)
	)
}

// Derive hover focus from a pointer event over the SVG.
//
// Hover is handled centrally from the svg's pointermove instead of per-circle
// enter/leave handlers: the depth sort reorders circles in the DOM every frame,
// which can swallow boundary events and leave a stale highlight stuck on.
function updateHoverFromEvent(scene, event) {
	scene.interaction.hoverPoint = getSvgPoint(scene, event)
	// The node datum lives on the g.graph-node group wrapping the mark.
	const group = event.target?.closest?.('.graph-node')
	setFocus(scene, group?.__data__ ? group.__data__.id : null)
}

// Self-heal hover state every rendered frame.
//
// If the focused node moved (or animated) away from the last known pointer
// position, drop the focus even though no leave event ever fired.
function validateHoverFocus(scene) {
	const focusId = scene.selection.focusId
	const pointer = scene.interaction.hoverPoint
	if (focusId == null || !pointer) return
	const node = scene.data.nodeById.get(focusId)
	if (!node) {
		scene.selection.focusId = null
		return
	}
	const slop = 6
	const distance = Math.hypot(
		pointer.x - (node.graphScreenX ?? 0),
		pointer.y - (node.graphScreenY ?? 0)
	)
	if (distance > (node.graphRadius ?? NODE_BASE_RADIUS) + slop)
		scene.selection.focusId = null
}

// Opacity for one text label.
function getLabelOpacity(node, scene) {
	// Hidden labels are fully transparent but still participate in the selection.
	if (!node.graphLabelVisible) return 0
	return getNodeOpacity(node, scene)
}

// Opacity for one link under current focus state.
function getLinkOpacity(link, scene) {
	return getFocusOpacity(
		scene,
		focusId =>
			// A link stays bright when either endpoint is focused.
			getLinkSourceId(link) === focusId ||
			getLinkTargetId(link) === focusId
	)
}

// Derive all screen/drawing fields for one node for the current frame.
//
// D3 owns world x/y/z. This function projects those coordinates and stores the
// resulting SVG-ready values on the node object.
function deriveNodeView(node, scene) {
	const { sx, sy, cameraZ } = projectNode3D(
		node,
		scene.size.width,
		scene.size.height,
		scene.camera
	)
	// Screen coordinates for circles, labels, links, and fold markers.
	node.graphScreenX = sx
	node.graphScreenY = sy
	// Depth used for paint sorting and depth scaling.
	node.graphCameraDepth = cameraZ
	// Depth scale times user zoom: one visual scale shared by node radius,
	// labels, and link visuals so the whole graph zooms coherently.
	node.graphVisualScale =
		getDepthScale(cameraZ, scene.camera.distance) * (scene.camera.zoom || 1)
	// Small floor keeps far/unzoomed nodes visible and clickable.
	node.graphRadius = Math.max(
		1.25,
		(node.graphBaseRadius || NODE_BASE_RADIUS) * node.graphVisualScale
	)
	// Current/parent/leaf/simple-folder styling category.
	node.graphKind = getNodeKind(node, scene.selection.currentPageId)
	return node
}

// Derive all screen/drawing fields for one link for the current frame.
function deriveLinkView(link) {
	Object.assign(link, getGraphLinkView(link, edgeAnchoredCurvePath))
	return link
}

// Recompute which graph nodes/links are currently visible and sync D3/SVG joins.
//
// Folding changes only the visible graph, not the canonical scene.data graph.
function syncVisibleGraph(scene, { restart = false, alpha = 0.2 } = {}) {
	// Folding only changes the visible projection of the graph, not the canonical data.
	const hiddenIds = collectHiddenNodeIds(
		scene.interaction.folded,
		scene.data.descendants
	)

	// Hide descendants of folded nodes.
	scene.visible.nodes = scene.data.nodes.filter(
		node => !hiddenIds.has(node.id)
	)
	// Hide links whose source or target is hidden.
	scene.visible.links = scene.data.links.filter(
		link =>
			!hiddenIds.has(getLinkSourceId(link)) &&
			!hiddenIds.has(getLinkTargetId(link))
	)
	// Rebuild adjacency from visible links only, so hover dimming matches what
	// the user can see.
	scene.visible.adjacency = buildVisibleAdjacency(scene.visible.links)

	if (
		scene.selection.focusId != null &&
		!scene.visible.nodes.some(node => node.id === scene.selection.focusId)
	) {
		// If the focused node was hidden by folding, clear focus.
		scene.selection.focusId = null
	}

	// Give D3 the new visible node/link sets.
	scene.simulation.nodes(scene.visible.nodes)
	scene.simulation.force('link').links(scene.visible.links)

	// Link paths. D3 join keeps existing DOM elements when keys match.
	scene.selections.links = scene.layers.links
		.selectAll('path')
		.data(scene.visible.links, link => link.key)
		.join(
			enter => enter.append('path'),
			update => update,
			exit => exit.remove()
		)

	// Fold markers: one group per folded visible node.
	scene.selections.folds = scene.layers.folds
		.selectAll('g')
		.data(
			scene.visible.nodes.filter(
				node => getFoldedChildCount(scene, node) > 0
			),
			node => node.id
		)
		.join(
			enter =>
				enter
					.append('g')
					.attr('class', 'node-fold-marker')
					.attr('pointer-events', 'none'),
			update => update,
			exit => exit.remove()
		)
		.each(function (node) {
			// Inside each folded-node group, draw one ellipse petal per direct
			// child. The group itself is positioned/scaled in renderScene().
			scene.D3.select(this)
				.selectAll('ellipse')
				.data(
					buildFoldPetals(
						getFoldedChildCount(scene, node),
						NODE_BASE_RADIUS
					),
					petal => petal.i
				)
				.join(
					enter =>
						enter
							.append('ellipse')
							.attr('class', 'node-fold-petal'),
					update => update,
					exit => exit.remove()
				)
				.attr('cx', petal => petal.cx)
				.attr('cy', petal => petal.cy)
				.attr('rx', petal => petal.rx)
				.attr('ry', petal => petal.ry)
				.attr(
					'transform',
					petal => `rotate(${petal.rotate} ${petal.cx} ${petal.cy})`
				)
		})

	// Node marks (circle or glyph) and interaction handlers.
	scene.selections.nodes = scene.layers.nodes
		.selectAll('g.graph-node')
		.data(scene.visible.nodes, node => node.id)
		.join(
			enter => {
				const group = enter.append('g').attr('class', 'graph-node')
				group.each(function (node) {
					node.graphBaseRadius ||= NODE_BASE_RADIUS
					appendNodeShape(scene.D3.select(this), node)
				})
				return group
			},
			update => update,
			exit => exit.remove()
		)
		.on('pointerdown', (event, node) => {
			// Prevent node pointerdown from starting canvas rotate/zoom/pan.
			event.stopPropagation()
			// Left button starts a node drag; a stationary drag ends as a click.
			if (event.button !== 0 || scene.interaction.nodeDrag) return
			event.preventDefault()
			beginNodeDrag(scene, event, node)
		})
		.on('contextmenu', (event, node) => {
			event.preventDefault()
			event.stopPropagation()
			// Only pages with children can fold/unfold.
			if (!node.childCount) return
			setFocus(scene, null)
			// Toggle folded state for this node.
			if (scene.interaction.folded.has(node.id))
				scene.interaction.folded.delete(node.id)
			else scene.interaction.folded.add(node.id)
			// Rebuild visible nodes/links and gently restart simulation.
			syncVisibleGraph(scene, {
				restart: true,
				alpha: FOLD_RESTART_ALPHA
			})
		})

	// Text labels for visible nodes.
	scene.selections.labels = scene.layers.labels
		.selectAll('text')
		.data(scene.visible.nodes, node => node.id)
		.join(
			enter => enter.append('text'),
			update => update,
			exit => exit.remove()
		)
		.attr('pointer-events', 'none')
		.text(node => node.label)

	// Draw once immediately after data joins.
	requestSceneRender(scene)
	// Optional simulation restart for fold/resize/current-page changes.
	if (restart) scene.simulation.alpha(alpha).restart()
}

// Schedule a scene render.
//
// D3 ticks can fire rapidly, and user pointer movement can also request renders.
// This function coalesces them into one requestAnimationFrame when possible.
function requestSceneRender(scene) {
	if (!scene?.render) {
		// Defensive fallback for partially constructed scenes.
		renderScene(scene)
		return
	}
	// A frame is already queued.
	if (scene.render.frame != null) return
	const schedule =
		typeof requestAnimationFrame === 'function'
			? requestAnimationFrame
			: callback => setTimeout(callback, 16)
	scene.render.frame = schedule(() => {
		scene.render.frame = null
		renderScene(scene)
	})
}

// Sort the shared depth layer by projected camera depth and paint order.
//
// Nodes, links, and fold markers share one SVG layer so foreground/background
// ordering can be approximated across element types.
function sortDepthLayer(scene) {
	const layer = scene.layers.depth?.node?.()
	if (!layer) return
	const current = [...layer.children]
	const sorted = [...current].sort(
		(left, right) =>
			compareCameraDepth(left.__data__, right.__data__) ||
			getDepthPaintOrder(left) - getDepthPaintOrder(right)
	)
	// Re-append only when the paint order actually changed. Reordering the DOM
	// every frame is wasted work and disturbs pointer hit-testing mid-hover.
	if (sorted.every((element, index) => element === current[index])) return
	sorted.forEach(element => layer.appendChild(element))
}

// Render the current graph frame into SVG attributes/styles.
function renderScene(scene) {
	// Derive view state first, then push it into the role-based SVG layers.
	scene.visible.nodes.forEach(node => deriveNodeView(node, scene))
	scene.visible.links.forEach(link => deriveLinkView(link, scene))
	// Drop hover focus if the focused node animated away from the pointer.
	validateHoverFocus(scene)
	// Label visibility depends on projected node positions, so run it after node
	// view fields are updated.
	updateLabelVisibility(scene)

	// Draw links.
	scene.selections.links
		.attr('data-role', link => link.graphRole)
		.attr('data-paint-order', DEPTH_PAINT_ORDER.link)
		.style('--link-width', link => link.graphWidth)
		.style('--link-stroke', link => link.graphStroke)
		.attr('d', link => link.graphPath)
		.style('opacity', link => getLinkOpacity(link, scene))

	// Draw folded-child petal markers.
	scene.selections.folds
		.attr('data-kind', node => node.graphKind)
		.attr('data-paint-order', DEPTH_PAINT_ORDER.fold)
		.attr('transform', node => {
			// Petals are built around NODE_BASE_RADIUS coordinates, then scaled to
			// match the node's current depth-scaled radius.
			const scale =
				(node.graphRadius ?? NODE_BASE_RADIUS) / NODE_BASE_RADIUS
			return `translate(${node.graphScreenX ?? 0} ${node.graphScreenY ?? 0}) scale(${scale})`
		})
		.style('opacity', node => getNodeOpacity(node, scene))

	// Draw nodes. Marks are authored in NODE_BASE_RADIUS units and scaled to
	// the node's depth/zoom radius, so circles and glyphs size identically.
	scene.selections.nodes
		.attr('data-kind', node => node.graphKind)
		.attr('data-paint-order', DEPTH_PAINT_ORDER.node)
		.attr('transform', node => {
			const scale =
				(node.graphRadius ?? NODE_BASE_RADIUS) /
				(node.graphBaseRadius || NODE_BASE_RADIUS)
			return `translate(${node.graphScreenX ?? 0} ${node.graphScreenY ?? 0}) scale(${scale})`
		})
		.style('opacity', node => getNodeOpacity(node, scene))

	// Reorder shared depth layer after node/link depths were updated.
	sortDepthLayer(scene)

	// Draw labels in their separate layer. Labels stay above the depth-sorted
	// node/link layer.
	scene.selections.labels
		.attr('class', node => getLabelClass(node, scene))
		.attr(
			'x',
			node =>
				(node.graphScreenX ?? 0) +
				LABEL_STYLE.xOffset * (node.graphVisualScale ?? 1)
		)
		.attr(
			'y',
			node =>
				(node.graphScreenY ?? 0) +
				LABEL_STYLE.yOffset * (node.graphVisualScale ?? 1)
		)
		.attr('font-size', node => getLabelFontSize(node.graphVisualScale))
		.style('opacity', node => getLabelOpacity(node, scene))
		.sort(
			(left, right) =>
				// Far labels first, prominent labels last/on top.
				compareCameraDepth(left, right) ||
				(isProminentLabel(left, scene) ? 1 : 0) - (isProminentLabel(right, scene) ? 1 : 0)
		)
}

function releaseCapturedPointer(scene, pointerId) {
	const captureEl = scene.interaction.pointerCaptures.get(pointerId)
	scene.interaction.pointerCaptures.delete(pointerId)
	if (!captureEl || !captureEl.hasPointerCapture?.(pointerId)) return
	try {
		// Browser can throw if capture was already lost.
		captureEl.releasePointerCapture(pointerId)
	} catch (_) {}
}

function releaseCapturedPointers(scene) {
	for (const pointerId of scene.interaction.pointerCaptures.keys())
		releaseCapturedPointer(scene, pointerId)
}

// Toggle the global "graph is being dragged" class.
//
// CSS can use this to change cursor/user-select while graph gestures are active.
function setGraphDragActive(active) {
	DOC.documentElement.classList.toggle('km-graph-dragging', active)
	// Clear accidental text selection at the end of a drag gesture.
	if (!active) clearSelection()
}

function cancelFrameHandle(frame) {
	if (frame == null) return
	if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
	else clearTimeout(frame)
}

function stopCameraMomentum(scene) {
	cancelFrameHandle(scene.interaction.momentumFrame)
	scene.interaction.momentumFrame = null
	scene.camera.yawVelocity = 0
	scene.camera.pitchVelocity = 0
}

function cancelPanTween(scene) {
	cancelFrameHandle(scene.interaction.panTweenFrame)
	scene.interaction.panTweenFrame = null
}

// Glide the camera pan to a target instead of jumping.
//
// Used when navigation recenters the graph on a new current page. Interrupted
// by any new pointer gesture or wheel zoom via stopCameraMotion().
function startPanTween(scene, targetX, targetY, duration = 350) {
	cancelPanTween(scene)
	const camera = scene.camera
	const fromX = camera.panX
	const fromY = camera.panY
	const start = getFrameTime()
	const schedule = getFrameScheduler()

	const step = now => {
		scene.interaction.panTweenFrame = null
		const t = Math.min(1, (now - start) / duration)
		// Cubic ease-out.
		const eased = 1 - Math.pow(1 - t, 3)
		camera.panX = fromX + (targetX - fromX) * eased
		camera.panY = fromY + (targetY - fromY) * eased
		requestSceneRender(scene)
		if (t < 1) scene.interaction.panTweenFrame = schedule(step)
	}

	scene.interaction.panTweenFrame = schedule(step)
}

// Stop every camera auto-motion (rotation momentum and pan tween) at once.
// Called whenever the user takes manual control of the camera.
function stopCameraMotion(scene) {
	stopCameraMomentum(scene)
	cancelPanTween(scene)
}

function hasCameraMomentum(camera) {
	return (
		Math.abs(camera.yawVelocity) >= MOMENTUM_EPSILON ||
		Math.abs(camera.pitchVelocity) >= MOMENTUM_EPSILON
	)
}

function getFrameTime() {
	return typeof performance !== 'undefined' && performance.now
		? performance.now()
		: Date.now()
}

function getFrameScheduler() {
	return typeof requestAnimationFrame === 'function'
		? requestAnimationFrame
		: callback => setTimeout(() => callback(Date.now()), FRAME_MS)
}

function advanceCameraMomentum(scene, elapsed) {
	const camera = scene.camera
	const frames = elapsed / FRAME_MS
	rotateCamera(
		camera,
		camera.yawVelocity * frames,
		camera.pitchVelocity * frames
	)
	const decay = Math.pow(MOMENTUM_DECAY, frames)
	camera.yawVelocity *= decay
	camera.pitchVelocity *= decay
	if (hasCameraMomentum(camera)) return true
	camera.yawVelocity = 0
	camera.pitchVelocity = 0
	return false
}

function startCameraMomentum(scene) {
	if (scene.interaction.momentumFrame != null || !hasCameraMomentum(scene.camera))
		return

	const schedule = getFrameScheduler()
	let lastTime = getFrameTime()

	const step = now => {
		scene.interaction.momentumFrame = null
		const elapsed = Math.min(48, Math.max(1, now - lastTime || FRAME_MS))
		lastTime = now
		const keepGoing = advanceCameraMomentum(scene, elapsed)
		requestSceneRender(scene)
		if (keepGoing) scene.interaction.momentumFrame = schedule(step)
	}

	scene.interaction.momentumFrame = schedule(step)
}

// Finish a background/canvas interaction.
function endBackgroundInteraction(
	scene,
	{ releaseCapture = true, keepMomentum = false } = {}
) {
	if (releaseCapture) releaseCapturedPointers(scene)
	else scene.interaction.pointerCaptures.clear()
	scene.interaction.pointers.clear()
	scene.interaction.mode = null
	scene.interaction.pinch = null
	setFocus(scene, null)
	setGraphDragActive(false)
	if (keepMomentum) startCameraMomentum(scene)
	else stopCameraMomentum(scene)
}

// Set hover/focus node id and request a visual update.
function setFocus(scene, nodeId) {
	// Avoid unnecessary renders when focus did not change.
	if (scene.selection.focusId === nodeId) return
	scene.selection.focusId = nodeId
	requestSceneRender(scene)
}

function clearRelaxTimer(scene) {
	if (scene.interaction.relaxTimer != null)
		clearTimeout(scene.interaction.relaxTimer)
	scene.interaction.relaxTimer = null
}

// Longest link attached to a node, in world units.
function nodeLinkStretch(scene, node) {
	let worst = 0
	for (const link of scene.visible.links) {
		if (link.source !== node && link.target !== node) continue
		const length = Math.hypot(
			(link.source.x ?? 0) - (link.target.x ?? 0),
			(link.source.y ?? 0) - (link.target.y ?? 0),
			(link.source.z ?? 0) - (link.target.z ?? 0)
		)
		if (length > worst) worst = length
	}
	return worst
}

// Keep the simulation warm after a node release until the released node's
// links relax, then cool. Bounded by a timeout so a legitimately long
// equilibrium cannot keep the graph simmering forever.
function relaxReleasedNode(scene, node) {
	clearRelaxTimer(scene)
	scene.simulation.alphaTarget(DRAG_RESTART_ALPHA).restart()
	let deadline = getFrameTime() + RELAX_TIMEOUT_MS
	let lastWorst = Infinity

	const poll = () => {
		scene.interaction.relaxTimer = null
		// A new drag owns simulation warmth now.
		if (scene.interaction.nodeDrag) return
		const worst = nodeLinkStretch(scene, node)
		// Progress resets the clock: keep simmering while links keep shrinking.
		// The timeout only fires when stuck at a (possibly long) equilibrium.
		if (worst < lastWorst * 0.98) deadline = getFrameTime() + RELAX_TIMEOUT_MS
		lastWorst = worst
		if (worst > RELAX_LINK_LENGTH && getFrameTime() < deadline) {
			scene.interaction.relaxTimer = setTimeout(poll, RELAX_POLL_MS)
			return
		}
		// Done: drop the leftover hold energy so the graph comes to rest
		// promptly instead of wobbling while alpha decays.
		scene.simulation.alphaTarget(0)
		scene.simulation.alpha(
			Math.min(scene.simulation.alpha(), RELAX_COOL_ALPHA)
		)
	}

	scene.interaction.relaxTimer = setTimeout(poll, RELAX_POLL_MS)
}

// Start dragging one node.
//
// The pointer is captured by the SVG element (which never gets reordered by the
// depth sort), so the matching up/cancel is guaranteed to arrive and a node can
// never stay pinned/stretched after an off-window release.
function beginNodeDrag(scene, event, node) {
	stopCameraMotion(scene)
	clearRelaxTimer(scene)
	scene.selection.nodeDragActive = true
	setFocus(scene, null)
	try {
		scene.svg.node()?.setPointerCapture?.(event.pointerId)
	} catch (_) {}
	const point = getSvgPoint(scene, event)
	scene.interaction.nodeDrag = {
		pointerId: event.pointerId,
		node,
		last: point,
		start: point,
		moved: false
	}
	// Fix the node at its current simulation position while dragging.
	node.fx = node.x
	node.fy = node.y
	node.fz = node.z
	setGraphDragActive(true)
}

// Apply pointer movement to the dragged node.
function updateNodeDrag(scene, event) {
	const drag = scene.interaction.nodeDrag
	if (!drag || event.pointerId !== drag.pointerId) return
	event.preventDefault()
	const point = getSvgPoint(scene, event)
	const dx = point.x - drag.last.x
	const dy = point.y - drag.last.y
	drag.last = point
	// A few pixels of jitter still counts as a click, not a drag.
	if (!drag.moved && Math.hypot(point.x - drag.start.x, point.y - drag.start.y) > 3)
		drag.moved = true
	const zoom = scene.camera.zoom || 1
	// Convert screen drag delta into world-space delta so dragging feels
	// aligned with the rotated camera view.
	const [worldX, worldY, worldZ] = cameraDeltaToWorld(
		dx / zoom,
		dy / zoom,
		0,
		scene.camera
	)
	drag.node.fx += worldX
	drag.node.fy += worldY
	drag.node.fz += worldZ
	// Warm the simulation while dragging so neighboring links/nodes adjust.
	scene.simulation.alphaTarget(DRAG_RESTART_ALPHA).restart()
}

// Open the page behind a node after an in-place click.
function openNodePage(scene, node) {
	// Simple folders have no article to open.
	if (node.ref.isSimpleFolder) return
	setFocus(scene, null)
	// Let embedded hosts take over navigation. The KM shell only observes this
	// event to close fullscreen and leaves normal routing unprevented.
	const event = new CustomEvent('km:graph-node-open', {
		cancelable: true,
		detail: { page: node.ref }
	})
	DOC.dispatchEvent(event)
	if (event.defaultPrevented) return
	// Navigate on the next frame so the graph click state can settle first.
	requestAnimationFrame(() => navigateToPage(node.ref))
}

// Finish a node drag. Returns true when the event belonged to the drag.
function endNodeDrag(scene, event, { click = true } = {}) {
	const drag = scene.interaction.nodeDrag
	if (!drag || (event && event.pointerId !== drag.pointerId)) return false
	scene.interaction.nodeDrag = null
	scene.selection.nodeDragActive = false
	try {
		scene.svg.node()?.releasePointerCapture?.(drag.pointerId)
	} catch (_) {}
	// Release fixed position so the force layout takes over again, and keep the
	// simulation warm until the stretch this drag created has relaxed. A plain
	// click moved nothing, so it should not wake the layout at all.
	drag.node.fx = drag.node.fy = drag.node.fz = null
	if (drag.moved) relaxReleasedNode(scene, drag.node)
	setGraphDragActive(false)
	if (click && !drag.moved && event?.button === 0) openNodePage(scene, drag.node)
	return true
}

function rememberPointer(scene, event) {
	scene.interaction.pointers.set(event.pointerId, {
		x: event.clientX,
		y: event.clientY,
		type: event.pointerType || 'mouse'
	})
}

function capturePointer(scene, event) {
	const captureEl = event.currentTarget || null
	if (!captureEl) return
	scene.interaction.pointerCaptures.set(event.pointerId, captureEl)
	captureEl.setPointerCapture?.(event.pointerId)
}

function getTouchPoints(scene) {
	return [...scene.interaction.pointers.values()].filter(
		pointer => pointer.type === 'touch'
	)
}

function clientToSvgPoint(scene, x, y) {
	const rect = scene.svg.node()?.getBoundingClientRect?.()
	if (!rect) return { x: scene.size.width / 2, y: scene.size.height / 2 }
	return {
		x: ((x - rect.left) * scene.size.width) / (rect.width || scene.size.width),
		y: ((y - rect.top) * scene.size.height) / (rect.height || scene.size.height)
	}
}

function getTouchPairMetrics(scene) {
	const [a, b] = getTouchPoints(scene)
	if (!a || !b) return null
	const first = clientToSvgPoint(scene, a.x, a.y)
	const second = clientToSvgPoint(scene, b.x, b.y)
	const dx = second.x - first.x
	const dy = second.y - first.y
	return {
		centerX: (first.x + second.x) / 2,
		centerY: (first.y + second.y) / 2,
		distance: Math.max(1, Math.hypot(dx, dy))
	}
}

function getSvgPoint(scene, event) {
	return clientToSvgPoint(scene, event.clientX, event.clientY)
}

function setRotateVelocity(scene, dx, dy) {
	scene.camera.yawVelocity = dx * ROTATE_SPEED
	scene.camera.pitchVelocity = -dy * ROTATE_SPEED
}

function rotateCameraFromScreenDelta(scene, dx, dy) {
	rotateCamera(scene.camera, dx * ROTATE_SPEED, -dy * ROTATE_SPEED)
	setRotateVelocity(scene, dx, dy)
}

function startTouchRotate(scene) {
	const [touch] = getTouchPoints(scene)
	if (!touch) return false
	scene.interaction.mode = 'rotate'
	scene.interaction.last.x = touch.x
	scene.interaction.last.y = touch.y
	scene.interaction.pinch = null
	return true
}

function startPinch(scene) {
	const metrics = getTouchPairMetrics(scene)
	if (!metrics) return false
	scene.interaction.mode = 'pinch'
	scene.interaction.pinch = metrics
	scene.camera.yawVelocity = 0
	scene.camera.pitchVelocity = 0
	return true
}

function updatePinch(scene) {
	const next = getTouchPairMetrics(scene)
	const previous = scene.interaction.pinch
	if (!next || !previous) return false
	panCamera(scene.camera, next.centerX - previous.centerX, next.centerY - previous.centerY)
	zoomCameraAt(
		scene.camera,
		next.distance / previous.distance,
		next.centerX,
		next.centerY,
		scene.size.width,
		scene.size.height
	)
	scene.interaction.pinch = next
	return true
}

function isKnownGesturePointer(scene, pointerId) {
	return (
		scene.interaction.pointers.has(pointerId) ||
		scene.interaction.pointerCaptures.has(pointerId)
	)
}

function releaseEndedPointer(scene, event, releaseCapture) {
	if (releaseCapture) releaseCapturedPointer(scene, event.pointerId)
	else scene.interaction.pointerCaptures.delete(event.pointerId)
	scene.interaction.pointers.delete(event.pointerId)
}

function resumeRemainingTouchGesture(scene, event) {
	if (event.pointerType !== 'touch') return false
	const touchCount = getTouchPoints(scene).length
	if (touchCount >= 2) return startPinch(scene)
	return touchCount === 1 && startTouchRotate(scene)
}

function handlePointerEnd(scene, event, { releaseCapture = true } = {}) {
	if (!isKnownGesturePointer(scene, event.pointerId)) return
	const wasRotating = scene.interaction.mode === 'rotate'
	releaseEndedPointer(scene, event, releaseCapture)
	if (resumeRemainingTouchGesture(scene, event)) return

	const keepMomentum = wasRotating && hasCameraMomentum(scene.camera)
	endBackgroundInteraction(scene, { releaseCapture: false, keepMomentum })
}

function getPointerDelta(scene, event) {
	const dx = event.clientX - scene.interaction.last.x
	const dy = event.clientY - scene.interaction.last.y
	scene.interaction.last.x = event.clientX
	scene.interaction.last.y = event.clientY
	return { dx, dy }
}

function updateCanvasGesture(scene, event) {
	const mode = scene.interaction.mode
	setFocus(scene, null)
	if (mode === 'pinch') return updatePinch(scene)

	const { dx, dy } = getPointerDelta(scene, event)
	if (mode === 'rotate') rotateCameraFromScreenDelta(scene, dx, dy)
	else if (mode === 'zoom') {
		const focus = getSvgPoint(scene, event)
		zoomCameraAt(
			scene.camera,
			Math.exp(-dy * ZOOM_DRAG_SPEED),
			focus.x,
			focus.y,
			scene.size.width,
			scene.size.height
		)
	} else if (mode === 'pan') panCamera(scene.camera, dx, dy)
	else return false
	return true
}

// Bind background SVG interactions:
// - left drag or one-finger drag: rotate camera, with momentum
// - middle drag or wheel: zoom
// - right drag: pan
// - two-finger touch: pan and pinch-zoom
function bindCanvasInteraction(scene) {
	const svg = scene.svg

	function onPointerDown(event) {
		// Node dragging owns pointer movement while active.
		if (scene.interaction.nodeDrag) return
		event.preventDefault()
		clearSelection()
		setFocus(scene, null)
		stopCameraMotion(scene)
		rememberPointer(scene, event)
		capturePointer(scene, event)

		if (event.pointerType === 'touch') {
			if (!startPinch(scene)) startTouchRotate(scene)
			setGraphDragActive(true)
			return
		}

		const mode = MODE_BY_BUTTON[event.button] ?? null
		// Ignore buttons that are not mapped to a graph gesture.
		if (!mode) {
			handlePointerEnd(scene, event)
			return
		}
		scene.interaction.mode = mode
		scene.interaction.last.x = event.clientX
		scene.interaction.last.y = event.clientY
		setGraphDragActive(true)
	}

	function onPointerMove(event) {
		// Pointer capture retargets drag moves to the svg while a node drag is
		// active.
		if (scene.interaction.nodeDrag) {
			updateNodeDrag(scene, event)
			return
		}
		if (scene.interaction.mode) {
			event.preventDefault()
			if (scene.interaction.pointers.has(event.pointerId))
				rememberPointer(scene, event)
			if (updateCanvasGesture(scene, event)) requestSceneRender(scene)
			return
		}
		// Idle movement drives hover focus.
		updateHoverFromEvent(scene, event)
	}

	function onWheel(event) {
		// Keep wheel zoom inside the graph; do not scroll the page.
		event.preventDefault()
		setFocus(scene, null)
		stopCameraMotion(scene)
		const focus = getSvgPoint(scene, event)
		zoomCameraAt(
			scene.camera,
			Math.exp(-event.deltaY * 0.0015),
			focus.x,
			focus.y,
			scene.size.width,
			scene.size.height
		)
		requestSceneRender(scene)
	}

	function clearHover() {
		scene.interaction.hoverPoint = null
		setFocus(scene, null)
	}

	// Bind D3 event handlers on the SVG selection.
	svg.on('pointerdown', onPointerDown)
		.on('pointermove', onPointerMove)
		.on('pointerup', event => {
			if (endNodeDrag(scene, event)) return
			handlePointerEnd(scene, event)
		})
		.on('pointercancel', event => {
			if (endNodeDrag(scene, event, { click: false })) return
			handlePointerEnd(scene, event)
		})
		.on('lostpointercapture', event => {
			// Fires even if the tab loses focus mid-drag; guarantees cleanup.
			if (endNodeDrag(scene, event, { click: false })) return
			handlePointerEnd(scene, event, { releaseCapture: false })
		})
		.on('wheel', onWheel)
		.on('pointerleave', clearHover)
		// Disable browser context menu so right-drag and right-click folding work.
		.on('contextmenu', event => event.preventDefault())
}

// Unfold every folded ancestor of a node.
//
// When routing to a page hidden inside a folded branch, the graph should reveal
// that path so the current page node can become visible.
function revealPathToNode(scene, nodeId) {
	const node = scene.data.nodeById.get(nodeId)
	let changed = false
	for (let page = node?.ref?.parent; page; page = page.parent) {
		// delete() returns true when this ancestor was folded.
		if (scene.interaction.folded.delete(page.id)) changed = true
	}
	// Recompute visible graph only when something actually unfolded.
	if (changed) syncVisibleGraph(scene)
	return changed
}

// Pan the viewport so a node appears at the center.
//
// Snaps by default; animate glides there for in-session navigation.
function recenterSceneOnNode(node, scene, { animate = false } = {}) {
	if (!node) return
	const centerX = scene.size.width / 2
	const centerY = scene.size.height / 2
	// Project with zero pan to find where the node would be without viewport pan.
	const { sx, sy } = projectNode3D(
		node,
		scene.size.width,
		scene.size.height,
		{ ...scene.camera, panX: 0, panY: 0 }
	)
	// Pan just enough to place that projected point at the viewport center.
	const targetX = centerX - sx
	const targetY = centerY - sy
	if (animate) {
		startPanTween(scene, targetX, targetY)
		return
	}
	cancelPanTween(scene)
	scene.camera.panX = targetX
	scene.camera.panY = targetY
	requestSceneRender(scene)
}

// Run the force layout to completion synchronously.
//
// Manual ticks fire no events and paint nothing, so the first frame the user
// sees is the already-settled layout: no visible bloom, no post-load jump.
function settleSimulation(simulation, maxTicks = 400) {
	simulation.stop()
	for (
		let tick = 0;
		tick < maxTicks && simulation.alpha() > simulation.alphaMin();
		tick++
	)
		simulation.tick()
}

// Create a complete graph scene around one SVG selection.
function createScene({ D3, svg, width, height, legend = null, graph = buildGraphData() }) {
	// Copy nodes/links so D3 can mutate them without mutating canonical graph data
	// returned by buildGraphData().
	const nodes = graph.nodes.map(node => ({ ...node }))
	const links = graph.links.map(link => ({ ...link }))
	// Fast id -> node lookup for route sync and recentering.
	const nodeById = new Map(nodes.map(node => [node.id, node]))
	seedNodeDepth(nodes)
	const simulation = createSimulation(D3, nodes, links)
	// Settle the layout before anything is painted so the graph appears
	// fully formed instead of blooming and shifting after load.
	settleSimulation(simulation)

	setSvgSize(svg, width, height)

	// The scene object is the single state bag for graph rendering and
	// interaction.
	const scene = {
		D3,
		svg,
		simulation,
		// Open zoomed out far enough to show the whole settled layout. Large
		// bundles lay out wider than the viewport, and starting mid-graph with no
		// visible edge makes the graph feel lost rather than large.
		camera: createGraphCamera({
			zoom: fitZoomToNodes(nodes, width || 1, height || 1)
		}),
		// requestSceneRender() stores its pending frame id here.
		render: { frame: null },
		size: { width: width || 1, height: height || 1 },
		// User-controlled viewport and pointer gesture state.
		interaction: {
			mode: null,
			last: { x: 0, y: 0 },
			pointers: new Map(),
			pinch: null,
			// Folded node ids. Descendants of these nodes are hidden.
			folded: new Set(),
			// Active pointer capture state for background gestures.
			pointerCaptures: new Map(),
			momentumFrame: null,
			panTweenFrame: null,
			// Pending post-release relax watchdog.
			relaxTimer: null,
			// Active node drag state; also blocks canvas gestures.
			nodeDrag: null,
			// Last pointer position in SVG coordinates, for hover validation.
			hoverPoint: null
		},
		// Current route/hover/drag state.
		selection: {
			currentPageId: null,
			focusId: null,
			nodeDragActive: false
		},
		// Canonical data and helper maps.
		data: { nodes, links, nodeById, descendants: graph.descById },
		// Currently visible filtered graph after folding.
		visible: { nodes, links, adjacency: graph.adj },
		// SVG layer selections filled below.
		layers: {},
		selections: { links: null, folds: null, nodes: null, labels: null },
		// Optional legend sync hook.
		syncLegend: legend ? () => syncGraphLegend(legend) : null,
		// Resize the SVG viewport. Forces live in world space, so resizing only
		// changes projection: the simulation is deliberately left asleep.
		resize(nextWidth, nextHeight) {
			scene.size.width = nextWidth || 1
			scene.size.height = nextHeight || 1
			setSvgSize(svg, scene.size.width, scene.size.height)
			requestSceneRender(scene)
		},
		// Sync graph current node with the route.
		syncCurrentPage(
			nextPageId = scene.selection.currentPageId,
			{ force = false } = {}
		) {
			const previousPageId = scene.selection.currentPageId
			const pageChanged = nextPageId !== previousPageId
			// Skip when nothing changed unless caller explicitly forces refresh,
			// such as after resize/fullscreen.
			if (!pageChanged && !force) return
			setFocus(scene, null)
			// Reveal folded ancestors before selecting/recentering the page.
			if (pageChanged) revealPathToNode(scene, nextPageId)
			scene.selection.currentPageId = nextPageId
			const node = scene.data.nodeById.get(nextPageId)
			// In-session navigation glides to the new page. The initial sync and
			// forced same-page refreshes (resize/fullscreen) snap instead. Callers
			// pass force to mean "refresh even if unchanged", so it must not veto
			// the glide when the page really did change.
			const navigated = pageChanged && previousPageId != null
			recenterSceneOnNode(node, scene, { animate: navigated })
			if (navigated && node) {
				// Nudge the new current node toward the world origin and warm the
				// simulation briefly so the emphasized area settles.
				node.vx += -node.x * CURRENT_PAGE_PULL
				node.vy += -node.y * CURRENT_PAGE_PULL
				scene.simulation.alphaTarget(CURRENT_PAGE_RESTART_ALPHA).restart()
				// Then let it cool shortly after.
				setTimeout(() => scene.simulation.alphaTarget(0), 250)
			}
			requestSceneRender(scene)
		}
	}

	// SVG structure:
	// graph-scene
	//   depth layer: links, fold petals, nodes, depth-sorted together
	//   labels layer: text labels always above the depth layer
	const sceneRoot = svg.append('g').attr('class', 'graph-scene')
	const depthLayer = sceneRoot.append('g').attr('data-layer', 'depth')
	scene.layers = {
		depth: depthLayer,
		links: depthLayer,
		folds: depthLayer,
		nodes: depthLayer,
		labels: sceneRoot.append('g').attr('data-layer', 'labels')
	}

	bindCanvasInteraction(scene)
	// D3 ticks request SVG renders. Rendering is throttled by requestSceneRender.
	simulation.on('tick', () => requestSceneRender(scene))
	// Initial SVG joins.
	syncVisibleGraph(scene)

	return scene
}

// Stop an inline scene before its rendered root is replaced.
function destroyScene(scene) {
	scene.simulation.stop()
	scene.simulation.on('tick', null)
	stopCameraMotion(scene)
	clearRelaxTimer(scene)
	releaseCapturedPointers(scene)
	cancelFrameHandle(scene.render.frame)
	scene.render.frame = null
	if (scene.interaction.mode || scene.interaction.nodeDrag)
		setGraphDragActive(false)
}

const queryGraphSize = host => {
	const rect = host.getBoundingClientRect()
	return {
		width: Math.max(1, rect.width | 0 || 640),
		height: Math.max(1, rect.height | 0 || 360)
	}
}

// Mount independent graph scenes for rendered page-query placeholders.
export async function mountQueryGraphs(root = DOC, currentPage = null) {
	const hosts = [...root.querySelectorAll('.km-query-graph:not([data-graph-ready])')]
	if (!hosts.length) return null
	let D3
	try { D3 = await ensureD3() } catch (error) {
		console.warn('Query graph failed to load:', error)
		hosts.filter(host => host.isConnected && root.contains(host)).forEach(host => {
			host.classList.add('is-unavailable')
			host.textContent = t('graph.unavailable')
		})
		return null
	}
	const byId = new Map(wikiStore.pages.map(page => [page.id, page]))
	const mounted = []
	for (const host of hosts) {
		// A newer render may have replaced this root while D3 was loading.
		if (!host.isConnected || !root.contains(host)) continue
		let ids = []
		try { ids = JSON.parse(host.dataset.pages || '[]') } catch (_) {}
		const pages = ids.map(id => byId.get(id)).filter(Boolean)
		if (!pages.length) continue
		const svgNode = DOC.createElementNS('http://www.w3.org/2000/svg', 'svg')
		svgNode.classList.add('km-graph-svg')
		svgNode.setAttribute('role', 'img')
		svgNode.setAttribute('aria-label', t('shell.documentGraph'))
		host.replaceChildren(svgNode)
		host.dataset.graphReady = 'true'
		const size = queryGraphSize(host)
		const scene = createScene({
			D3,
			svg: D3.select(svgNode),
			width: size.width,
			height: size.height,
			graph: buildGraphData(pages)
		})
		scene.syncCurrentPage(currentPage?.id ?? null, { force: true })
		const observer = typeof ResizeObserver === 'function'
			? new ResizeObserver(() => {
				const next = queryGraphSize(host)
				scene.resize(next.width, next.height)
			})
			: null
		observer?.observe(host)
		mounted.push({ scene, observer })
	}
	if (!mounted.length) return null
	return {
		disconnect() {
			mounted.forEach(({ scene, observer }) => {
				observer?.disconnect()
				destroyScene(scene)
			})
		}
	}
}

// Measure the mini graph viewport.
function getMiniSize() {
	const mini = $('#mini')
	// Fallback size for tests or missing DOM.
	if (!mini) return { w: 400, h: 300 }
	// Fullscreen graph should use the window size.
	if (mini.classList.contains('fullscreen'))
		return { w: window.innerWidth, h: window.innerHeight }
	const rect = mini.getBoundingClientRect()
	// Bitwise OR floors the number. Math.max prevents zero-sized SVG.
	return { w: Math.max(1, rect.width | 0), h: Math.max(1, rect.height | 0) }
}

// Watch #mini for size changes.
function observeMiniResize() {
	const mini = $('#mini')
	// Bind once per #mini element.
	if (!mini || !markOnce(mini, 'kmGraphResizeBound')) return
	new ResizeObserver(() => {
		// ResizeObserver can fire before the graph has lazy-initialized.
		if (!miniGraph) return
		resizeGraphViewport()
	}).observe(mini)
}

// Public resize hook used by shell.js when panels/fullscreen change.
export function resizeGraphViewport() {
	if (!miniGraph) return
	// Legend wording can depend on current input mode/viewport.
	miniGraph.syncLegend?.()
	const { w, h } = getMiniSize()
	miniGraph.resize(w, h)
	// Force recenter/current-node sync because projection changed after resize.
	miniGraph.syncCurrentPage(undefined, { force: true })
}

// Lazy-create the graph scene.
async function ensureGraphView(D3) {
	// Graph already exists.
	if (miniGraph) return
	const legend = ensureGraphLegend()
	const svg = D3.select('#mini')
	svg.classed('km-graph-svg', true)
	const { w, h } = getMiniSize()
	miniGraph = createScene({ D3, svg, width: w, height: h, legend })
	observeMiniResize()
	// Align current graph node with the current URL immediately after creation.
	syncCurrentGraphPage(true)
}

// Ensure D3 is loaded and the graph scene exists.
export async function ensureGraphReady() {
	await ensureGraphView(await ensureD3())
}

// Sync graph current-page selection from the current browser hash.
//
// route/shell code calls this after route changes and after graph resize.
export function syncCurrentGraphPage(force = false) {
	// Graph is lazy; no-op until it exists.
	if (!miniGraph) return
	const path = hashSegments(window.location.hash)
	const page = findPageByPath(path)
	miniGraph.syncCurrentPage(page?.id ?? null, { force })
}
