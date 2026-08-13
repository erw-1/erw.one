/*
 * Lightbox gesture helpers.
 *
 * lightbox.js owns DOM wiring and overlay restoration. This module owns the
 * small pointer/touch calculations for drag, pinch, wheel zoom, and safe
 * pointer-capture release so the event handlers stay readable.
 */
import { clamp } from '../core/runtime.js'

// Movement threshold before the follow-up click is treated as part of a drag.
export const LIGHTBOX_DRAG_CLICK_THRESHOLD = 3

// Mermaid diagrams need slightly different sizing behavior from normal images.
export const getItemKind = node =>
	node?.classList?.contains('mermaid') ? 'mermaid' : 'image'

// Distance between two active touch pointers.
//
// Used for pinch zoom. When there are not exactly two usable points, return 0 so
// pinch math can safely skip.
export const getTouchDistance = points => {
	const [left, right] = [...points.values()]
	return left && right ? Math.hypot(right.x - left.x, right.y - left.y) : 0
}

// Pick a base width for a Mermaid diagram inside the lightbox.
//
// Mermaid SVGs often render too small if treated like normal images, so the
// lightbox starts from the diagram's intrinsic width or viewport width and keeps
// it in a reasonable range.
export function getMermaidBaseWidth(node, viewport, viewportWidth = window.innerWidth) {
	const svg = node?.querySelector?.('svg')
	const intrinsicWidth =
		svg?.viewBox?.baseVal?.width ||
		svg?.getBoundingClientRect?.().width ||
		0
	const width = viewport?.clientWidth || viewportWidth
	return clamp(Math.max(intrinsicWidth * 1.5, width), 720, 2600)
}

// Decide whether a pointerdown should begin a lightbox gesture.
export function canStartLightboxGesture({
	item,
	button = 0,
	targetIsViewport = false,
	targetBlocked = false
} = {}) {
	return !!item && button <= 0 && !targetIsViewport && !targetBlocked
}

// Store or update one active touch point.
export function trackTouchPoint(touchPoints, event) {
	touchPoints.set(event.pointerId, {
		x: event.clientX,
		y: event.clientY
	})
	return touchPoints.size
}

// Two active touch pointers means the gesture should be captured for pinch.
export const isPinchCaptureOnly = (pointerType, touchPointCount) =>
	pointerType === 'touch' && touchPointCount > 1

// Convert pointerdown input into the action lightbox.js should take.
export function getPointerDownGesturePlan(
	item,
	event,
	{ targetIsViewport = false, targetBlocked = false } = {}
) {
	if (!canStartLightboxGesture({
		item,
		button: event.button,
		targetIsViewport,
		targetBlocked
	}))
		return { kind: 'ignore', shouldStartPinch: false }
	if (event.pointerType !== 'touch')
		return { kind: 'drag', shouldStartPinch: false }

	const touchPointCount = trackTouchPoint(item.touchPoints, event)
	return {
		kind: isPinchCaptureOnly(event.pointerType, touchPointCount)
			? 'pinch'
			: 'drag',
		shouldStartPinch: touchPointCount === 2
	}
}

// Store the pinch baseline from the current touch map and scale.
export function startPinchGesture(item) {
	item.pinchStartDistance = getTouchDistance(item.touchPoints)
	item.pinchStartScale = item.scale
}

// Store one-pointer drag state.
export function startDragGesture(item, event) {
	Object.assign(item, {
		dragging: true,
		dragMoved: false,
		pointerId: event.pointerId,
		dragStartX: event.clientX,
		dragStartY: event.clientY,
		dragOriginX: item.offsetX,
		dragOriginY: item.offsetY
	})
}

// Calculate the effect of one pointermove event.
export function updatePointerMoveGesture(item, event) {
	if (event.pointerType === 'touch' && item.touchPoints.has(event.pointerId)) {
		trackTouchPoint(item.touchPoints, event)
		if (item.touchPoints.size === 2 && item.pinchStartDistance > 0) {
			return {
				kind: 'pinch',
				scale:
					(item.pinchStartScale * getTouchDistance(item.touchPoints)) /
					item.pinchStartDistance
			}
		}
	}

	if (!item.dragging) return { kind: 'none' }

	const dx = event.clientX - item.dragStartX
	const dy = event.clientY - item.dragStartY
	return {
		kind: 'drag',
		dragMoved:
			Math.abs(dx) > LIGHTBOX_DRAG_CLICK_THRESHOLD ||
			Math.abs(dy) > LIGHTBOX_DRAG_CLICK_THRESHOLD,
		offsetX: item.dragOriginX + dx,
		offsetY: item.dragOriginY + dy
	}
}

// Update gesture bookkeeping when a pointer ends/cancels.
export function updatePointerEndGesture(item, event) {
	if (item.touchPoints.has(event.pointerId))
		item.touchPoints.delete(event.pointerId)
	if (item.touchPoints.size < 2) {
		// Fewer than two touches means pinch is no longer active.
		item.pinchStartDistance = 0
		item.pinchStartScale = item.scale || 1
	}
	return item.pointerId === event.pointerId || item.touchPoints.size < 2
}

// Safely release pointer capture, ignoring browser races.
export function releasePointerCaptureSafely(viewport, pointerId) {
	if (
		pointerId == null ||
		!viewport?.hasPointerCapture?.(pointerId)
	)
		return false
	try {
		viewport.releasePointerCapture(pointerId)
		return true
	} catch (_) {
		return false
	}
}

// Find the media node that should open from a click target.
export function getLightboxTarget(
	root,
	target,
	{ blockedSelector, lightboxSelector } = {}
) {
	if (!root?.contains?.(target)) return null
	if (target?.closest?.(blockedSelector)) return null
	return target?.closest?.(lightboxSelector) || null
}
