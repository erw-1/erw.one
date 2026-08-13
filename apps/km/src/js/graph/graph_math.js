/*
 * Small, focused projection helpers for the graph scene. Keeping the camera math
 * separate makes the scene code easier to read and reason about.
 *
 * The graph simulation stores nodes in a simple 3D-ish world: x, y, z. These
 * helpers convert that world into 2D SVG screen coordinates and sizes.
 *
 * The camera stores its orientation as a 3x3 rotation matrix instead of Euler
 * pitch/yaw angles. Drag rotations apply around the *screen* axes (trackball
 * style), so horizontal dragging never reverses, even when the user has flipped
 * the graph upside down.
 */

// Clamp the perspective effect before a node gets too close to the camera.
//
// This bounds the position multiplier to 1 / (1 - ratio), so 0.5 means a node
// can never be flung more than 2x its unprojected distance from the center.
// The bound matters because the layout radius grows with page count and can
// approach `distance`: rotating a large graph then swings camera-space z across
// most of that range, and at 0.92 the multiplier swung between 1.5x and 6x on a
// 74-page bundle purely from camera rotation, which reads as a wildly changing
// field of view. getDepthScale() clamps its own result to DEPTH_SCALE_MAX, so
// lowering this changes node *positions* only, never node sizes.
const DEPTH_NEAR_RATIO = 0.5

// Minimum/maximum visual node scale from depth alone. User zoom multiplies on
// top of this in graph.js.
const DEPTH_SCALE_MIN = 0.66
const DEPTH_SCALE_MAX = 1.22

// Small upward lift for quadratic link curves. This keeps links from looking
// perfectly straight/flat when two nodes overlap visually. Scaled by the link's
// visual scale so curves flatten as the graph zooms away.
const LINK_CURVE_LIFT = 8

// 3x3 rotation matrices, row-major. Rows are the camera basis vectors expressed
// in world coordinates.

function mat3RotationX(angle) {
	const c = Math.cos(angle)
	const s = Math.sin(angle)
	return [1, 0, 0, 0, c, -s, 0, s, c]
}

function mat3RotationY(angle) {
	const c = Math.cos(angle)
	const s = Math.sin(angle)
	return [c, 0, s, 0, 1, 0, -s, 0, c]
}

function mat3Multiply(a, b) {
	const out = new Array(9)
	for (let row = 0; row < 3; row++)
		for (let col = 0; col < 3; col++)
			out[row * 3 + col] =
				a[row * 3] * b[col] +
				a[row * 3 + 1] * b[3 + col] +
				a[row * 3 + 2] * b[6 + col]
	return out
}

// Re-orthonormalize a rotation matrix (Gram-Schmidt on the rows).
//
// Composing thousands of tiny drag rotations accumulates floating-point drift;
// this keeps the matrix a pure rotation so projection never skews.
function mat3Orthonormalize(m) {
	let [ax, ay, az] = m
	const aLen = Math.hypot(ax, ay, az) || 1
	ax /= aLen
	ay /= aLen
	az /= aLen
	let bx = m[3]
	let by = m[4]
	let bz = m[5]
	const abDot = ax * bx + ay * by + az * bz
	bx -= ax * abDot
	by -= ay * abDot
	bz -= az * abDot
	const bLen = Math.hypot(bx, by, bz) || 1
	bx /= bLen
	by /= bLen
	bz /= bLen
	// Third row is the cross product of the first two, keeping the basis
	// right-handed.
	return [
		ax, ay, az,
		bx, by, bz,
		ay * bz - az * by,
		az * bx - ax * bz,
		ax * by - ay * bx
	]
}

export const CAMERA_DEFAULTS = Object.freeze({
	// Default orientation: slightly tilted and turned (the old pitch -0.45 /
	// yaw 0.65 view) so the pseudo-3D layout reads as 3D immediately.
	rotation: Object.freeze(
		mat3Multiply(mat3RotationX(-0.45), mat3RotationY(0.65))
	),
	// Virtual camera distance used by the perspective formula.
	distance: 900,
	zoom: 1,
	panX: 0,
	panY: 0,
	yawVelocity: 0,
	pitchVelocity: 0
})

export const CAMERA_LIMITS = Object.freeze({
	// minZoom has to clear whatever fitZoomToNodes() asks for, or a large bundle
	// cannot be framed at all. A 74-page bundle already needs ~0.18 in the small
	// graph panel, so the old 0.25 floor silently clipped the fit there.
	minZoom: 0.1,
	maxZoom: 8
})

const clampValue = (value, min, max) => Math.max(min, Math.min(max, value))

export function createGraphCamera(overrides = {}) {
	const camera = { ...CAMERA_DEFAULTS, ...overrides }
	// Each camera owns a mutable copy of the (frozen) default orientation.
	camera.rotation = camera.rotation.slice()
	return camera
}

// Convert world coordinates into camera-space coordinates.
export function worldToCamera(x, y, z, camera = CAMERA_DEFAULTS) {
	const m = camera.rotation
	return [
		m[0] * x + m[1] * y + m[2] * z,
		m[3] * x + m[4] * y + m[5] * z,
		m[6] * x + m[7] * y + m[8] * z
	]
}

// Convert a movement measured in camera/screen coordinates back into world
// coordinates.
//
// graph.js uses this when dragging nodes: pointer movement should feel aligned
// with what the user sees, even though the node lives in rotated world space.
// A rotation matrix is orthonormal, so its transpose is its inverse.
export function cameraDeltaToWorld(x, y, z = 0, camera = CAMERA_DEFAULTS) {
	const m = camera.rotation
	return [
		m[0] * x + m[3] * y + m[6] * z,
		m[1] * x + m[4] * y + m[7] * z,
		m[2] * x + m[5] * y + m[8] * z
	]
}

// Rotate the camera around the screen axes: deltaYaw around the screen's
// vertical axis, deltaPitch around the screen's horizontal axis.
//
// The new rotation composes on the camera side of the existing orientation, so
// dragging right always moves the near side of the graph right no matter how
// the graph is currently flipped. Rotation stays unbounded: users can spin
// forever without hitting a gimbal pole.
export function rotateCamera(camera, deltaYaw, deltaPitch) {
	camera.rotation = mat3Orthonormalize(
		mat3Multiply(
			mat3RotationX(deltaPitch),
			mat3Multiply(mat3RotationY(deltaYaw), camera.rotation)
		)
	)
	return camera
}

export function panCamera(camera, dx, dy) {
	camera.panX += dx
	camera.panY += dy
	return camera
}

export function zoomCameraAt(camera, factor, focusX, focusY, width, height) {
	const previousZoom = camera.zoom || 1
	const nextZoom = clampValue(
		previousZoom * factor,
		CAMERA_LIMITS.minZoom,
		CAMERA_LIMITS.maxZoom
	)
	if (nextZoom === previousZoom) return camera

	const ratio = nextZoom / previousZoom
	const centerX = width / 2
	const centerY = height / 2
	camera.panX = focusX - centerX - (focusX - centerX - camera.panX) * ratio
	camera.panY = focusY - centerY - (focusY - centerY - camera.panY) * ratio
	camera.zoom = nextZoom
	return camera
}

// Project one graph node from 3D world coordinates into 2D SVG coordinates.
//
// Returns:
// - sx/sy: screen x/y for drawing
// - cameraZ: depth after camera rotation, used later for sorting and scaling
export function projectNode3D(node, w, h, camera = CAMERA_DEFAULTS) {
	// Default missing simulation coordinates to 0 so early ticks do not produce
	// NaN positions.
	const [x1, y1, z2] = worldToCamera(
		node.x ?? 0,
		node.y ?? 0,
		node.z ?? 0,
		camera
	)
	const dist = camera.distance ?? CAMERA_DEFAULTS.distance
	const nearLimit = dist * DEPTH_NEAR_RATIO
	// Clamp only the z used by perspective so nodes near the camera do not blow
	// up. Return the real cameraZ for depth sorting.
	const perspectiveZ = Math.min(z2, nearLimit)
	// Basic perspective: closer nodes get a larger multiplier.
	const persp = dist / Math.max(1, dist - perspectiveZ)
	const zoom = camera.zoom ?? 1
	return {
		// Apply perspective, user zoom, viewport center, and user pan.
		sx: x1 * persp * zoom + w / 2 + (camera.panX ?? 0),
		sy: y1 * persp * zoom + h / 2 + (camera.panY ?? 0),
		cameraZ: z2
	}
}

// Zoom level that brings every node inside the viewport.
//
// The layout radius grows with page count while `distance` and the starting
// zoom are fixed, so a large bundle would otherwise open with much of itself
// already outside the viewport and nothing on screen to explain where it went.
//
// A node's offset from the viewport center scales linearly with zoom (see
// projectNode3D), so the fitting zoom is just the ratio that pulls the furthest
// offset inside the half-viewport. Capped at 1: this only ever zooms out, so a
// graph that already fits is left exactly as it was.
export function fitZoomToNodes(nodes, width, height) {
	// A zero-size viewport would otherwise fit to zero and clamp to minZoom.
	if (!(width > 0) || !(height > 0)) return 1
	let maxX = 0
	let maxY = 0
	for (const node of nodes ?? []) {
		// Measure at zoom 1 with no pan; both are reapplied by the caller.
		const { sx, sy } = projectNode3D(node, width, height, {
			...CAMERA_DEFAULTS,
			zoom: 1,
			panX: 0,
			panY: 0
		})
		maxX = Math.max(maxX, Math.abs(sx - width / 2))
		maxY = Math.max(maxY, Math.abs(sy - height / 2))
	}
	// No nodes, or every node at the center: both leave the ratios at Infinity
	// and fall through to 1.
	const fit = Math.min(
		maxX ? ((width / 2) * 0.88) / maxX : Infinity,
		maxY ? ((height / 2) * 0.88) / maxY : Infinity
	)
	return Math.max(CAMERA_LIMITS.minZoom, Math.min(1, fit))
}

// Convert camera depth into a visual node/link scale.
//
// Nearer nodes draw larger; farther nodes draw smaller. The result is clamped so
// depth is readable without making the graph chaotic. graph.js multiplies user
// zoom on top of this so node sizes track the zoomed layout.
export function getDepthScale(cameraZ, dist = CAMERA_DEFAULTS.distance) {
	// Unknown depth means neutral scale.
	if (cameraZ == null) return 1
	const nearLimit = dist * DEPTH_NEAR_RATIO
	const perspectiveZ = Math.min(cameraZ, nearLimit)
	return Math.max(
		DEPTH_SCALE_MIN,
		Math.min(DEPTH_SCALE_MAX, dist / Math.max(1, dist - perspectiveZ))
	)
}

// Average endpoint visual scale for one link. Link widths and curve lift
// inherit depth and zoom scaling from their endpoint nodes.
export const getLinkVisualScale = link =>
	((link.source?.graphVisualScale ?? 1) +
		(link.target?.graphVisualScale ?? 1)) /
	2

// Build an SVG path for a curved link that starts/ends at node edges.
//
// Links should not run through the center of nodes. This function shortens the
// line by each node's drawn radius, then returns a small quadratic curve.
export function fitLinkInsetsToLength(sourceRadius, targetRadius, length) {
	// If nodes are very close, scale down the insets so the path does not invert
	// or cross backward.
	const maxInset = Math.max(0, length - 2)
	const totalInset = sourceRadius + targetRadius
	if (totalInset <= maxInset || totalInset <= 0)
		return { sourceRadius, targetRadius }
	const ratio = maxInset / totalInset
	return {
		sourceRadius: sourceRadius * ratio,
		targetRadius: targetRadius * ratio
	}
}

// Derive edge points for an already projected link.
export function getEdgeAnchoredCurvePoints(link) {
	// Screen-space node centers are computed by graph.js before link rendering.
	const sx0 = link.source.graphScreenX ?? 0
	const sy0 = link.source.graphScreenY ?? 0
	const tx0 = link.target.graphScreenX ?? 0
	const ty0 = link.target.graphScreenY ?? 0
	const dx = tx0 - sx0
	const dy = ty0 - sy0
	// Avoid divide-by-zero when two nodes overlap exactly.
	const len = Math.hypot(dx, dy) || 1
	const ux = dx / len
	const uy = dy / len
	const radii = fitLinkInsetsToLength(
		(link.source.graphRadius ?? 6) + 0.5,
		(link.target.graphRadius ?? 6) + 0.5,
		len
	)

	// Start/end points on the edges of the source/target circles.
	const x1 = sx0 + ux * radii.sourceRadius
	const y1 = sy0 + uy * radii.sourceRadius
	const x2 = tx0 - ux * radii.targetRadius
	const y2 = ty0 - uy * radii.targetRadius
	return {
		x1,
		y1,
		x2,
		y2,
		cx: (x1 + x2) / 2,
		cy: (y1 + y2) / 2 - LINK_CURVE_LIFT * getLinkVisualScale(link)
	}
}

// Build an SVG path from precomputed edge points.
export const edgeCurvePathFromPoints = ({ x1, y1, x2, y2, cx, cy }) =>
	`M${x1},${y1} Q${cx},${cy} ${x2},${y2}`

// Build an SVG path for a curved link that starts/ends at node edges.
export function edgeAnchoredCurvePath(link) {
	// Quadratic curve with a midpoint lifted upward a bit.
	return edgeCurvePathFromPoints(getEdgeAnchoredCurvePoints(link))
}
