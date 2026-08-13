/*
 * Small shared lightbox for click-to-expand media blocks. It currently supports
 * images and Mermaid diagrams and keeps zoom/drag state in one place.
 *
 * The lightbox does not clone media. It temporarily moves the clicked image or
 * Mermaid node into a body-level overlay, then puts it back at the original
 * location when closed. This preserves rendered Mermaid SVG state and avoids
 * duplicating large media nodes.
 */
import { DOC, clamp, clearSelection, el, markOnce } from '../core/runtime.js'
import { t } from '../core/i18n.js'
import {
	getItemKind,
	getLightboxTarget,
	getMermaidBaseWidth,
	getPointerDownGesturePlan,
	releasePointerCaptureSafely,
	startDragGesture,
	startPinchGesture,
	updatePointerEndGesture,
	updatePointerMoveGesture
} from './lightbox_gestures.js'

// Zoom limits for the lightbox.
const LIGHTBOX_MIN_SCALE = 0.4
const LIGHTBOX_MAX_SCALE = 10

// Button zoom multiplier. Zoom-in multiplies by this; zoom-out divides by it.
const LIGHTBOX_ZOOM_STEP = 1.2

// Wheel zoom sensitivity. The exponential formula below makes trackpad and
// mouse-wheel zoom feel smooth instead of jumping one fixed step at a time.
const LIGHTBOX_WHEEL_ZOOM_RATE = 0.0015

// Media elements that can open in the lightbox.
const LIGHTBOXABLE_SELECTOR = 'img:not(.km-emoji), .mermaid'

// Click/drag should not start lightbox gestures from interactive controls inside
// the media surface.
const BLOCKED_TARGET_SELECTOR = 'a[href], button, .heading-tools, .code-tools'

// Shared lightbox DOM. Created only on first use.
let lightbox = null

// Current media item and its zoom/drag state.
let activeItem = null

// Do not open media lightbox while the graph panel is already fullscreen. The
// graph owns that fullscreen interaction.
const isGraphFullscreen = () =>	DOC.getElementById('mini')?.classList.contains('fullscreen')

// Choose a useful accessible label for the lightbox dialog.
function getDialogLabel(node) {
	return (
		// Images commonly have alt text.
		node?.getAttribute('alt')?.trim() ||
		// Mermaid or custom media may provide aria-label/title instead.
		node?.getAttribute('aria-label')?.trim() ||
		node?.getAttribute('title')?.trim() ||
		// Generic fallback.
		t('preview.dialog')
	)
}

// Enable/disable zoom buttons based on current scale.
function syncZoomButtons() {
	if (!lightbox) return
	const scale = activeItem?.scale ?? 1
	// Small epsilon avoids floating point values like 0.4000000001 keeping the
	// button enabled at the limit.
	lightbox.zoomOutButton.disabled = scale <= LIGHTBOX_MIN_SCALE + 0.001
	lightbox.zoomInButton.disabled  = scale >= LIGHTBOX_MAX_SCALE - 0.001
}

// Create a plain text action button for the lightbox toolbar.
function createActionButton(className, label, textContent) {
	return el('button', {
		type: 'button',
		class: className,
		// title gives mouse users a tooltip; aria-label gives assistive tech a
		// meaningful name even when the text is just "+" or "x".
		title: label,
		'aria-label': label,
		textContent
	})
}

// Create the active state object for one opened media node.
function createActiveItem(node, viewport) {
	const kind = getItemKind(node)
	return {
		node,
		kind,
		// Placeholder comment marks where the node should be restored on close.
		placeholder: null,
		// Zoom level.
		scale: 1,
		// Mermaid uses width scaling plus translate. Images use CSS scale.
		baseWidth: kind === 'mermaid' ? getMermaidBaseWidth(node, viewport) : 0,
		// Current pan offset.
		offsetX: 0,
		offsetY: 0,
		// Pointer/drag state.
		dragging: false,
		dragMoved: false,
		pointerId: null,
		// Active touch points for pinch zoom.
		touchPoints: new Map(),
		pinchStartDistance: 0,
		pinchStartScale: 1,
		// Drag start coordinates and offsets.
		dragStartX: 0,
		dragStartY: 0,
		dragOriginX: 0,
		dragOriginY: 0
	}
}

// Apply current zoom/pan state to the active media node.
function applyTransform() {
	const item = activeItem
	if (!item?.node) return

	if (item.kind === 'mermaid') {
		// Mermaid diagrams are easier to scale by changing their width because
		// SVG text/layout can get awkward with CSS scale alone.
		const width = `${Math.round(item.baseWidth * item.scale)}px`
		item.node.style.transform = `translate(${item.offsetX}px, ${item.offsetY}px)`
		item.node.style.width = width
		item.node.style.minWidth = width
	} else {
		// Images can use a normal translate + scale transform.
		item.node.style.transform = `translate(${item.offsetX}px, ${item.offsetY}px) scale(${item.scale})`
	}
	syncZoomButtons()
}

// Finish an active drag and release pointer capture.
function endDrag() {
	// Nothing to end when there is no active drag/viewport.
	if (!activeItem?.dragging || !lightbox?.viewport) return
	activeItem.dragging = false
	// Remove dragging cursor/style class.
	lightbox.overlay.classList.remove('km-lightbox-dragging')
	// Release capture so future pointer events behave normally.
	releasePointerCaptureSafely(lightbox.viewport, activeItem.pointerId)
	activeItem.pointerId = null
}

// Stop all active gestures while keeping the current zoom.
function stopGestures() {
	if (!activeItem) return
	endDrag()
	// Reset pinch baseline to the current scale.
	activeItem.pinchStartDistance = 0
	activeItem.pinchStartScale = activeItem.scale || 1
}

// Return the active media to its initial centered/unzoomed view.
function resetActiveView() {
	if (!activeItem) return
	activeItem.scale = 1
	activeItem.offsetX = 0
	activeItem.offsetY = 0
	activeItem.dragging = false
	activeItem.dragMoved = false
	activeItem.pointerId = null
	activeItem.touchPoints.clear()
	activeItem.pinchStartDistance = 0
	activeItem.pinchStartScale = 1
	applyTransform()
}

// Set absolute zoom scale, clamped to the lightbox limits.
function setScale(nextScale) {
	if (!activeItem) return
	activeItem.scale = clamp(nextScale, LIGHTBOX_MIN_SCALE, LIGHTBOX_MAX_SCALE)
	applyTransform()
}

// Multiply current zoom by a button/wheel/pinch factor.
function changeScale(multiplier) {
	setScale((activeItem?.scale || 1) * multiplier)
}

// Remove lightbox-only styling from a media node before returning it to content.
function cleanupNode(node) {
	if (!node) return
	node.classList.remove('km-lightbox-media')
	node.style.removeProperty('transform')
	// Width/min-width are only set for Mermaid nodes, but removing them for any
	// node is harmless.
	node.style.removeProperty('width')
	node.style.removeProperty('min-width')
}

// Close the overlay and restore the active media node to its original place.
//
// Returns true when an item was actually closed.
function closeMediaLightbox() {
	if (!lightbox) return false
	endDrag()
	const item = activeItem
	activeItem = null
	lightbox.overlay.hidden = true
	if (!item) {
		// Overlay existed but no item was active. Clear viewport just in case.
		lightbox.viewport.textContent = ''
		syncZoomButtons()
		return false
	}
	cleanupNode(item.node)
	// Normal case: replace the placeholder comment with the original media node.
	if (item.placeholder?.parentNode) item.placeholder.replaceWith(item.node)
	// Fallback: if the placeholder disappeared, remove the moved node from the
	// lightbox rather than leaving duplicate UI around.
	else item.node.remove()
	lightbox.viewport.textContent = ''
	syncZoomButtons()
	return true
}

// Create the shared lightbox DOM and bind its controls.
function ensureLightbox() {
	if (lightbox) return lightbox

	// Toolbar buttons use text symbols to stay tiny and dependency-free.
	const zoomOutButton = createActionButton( 'km-lightbox-action', t('common.zoomOut'), '-')
	const zoomInButton  = createActionButton( 'km-lightbox-action',	t('common.zoomIn'),  '+')
	const closeButton   = createActionButton( 'km-lightbox-close',  t('common.close'),   'x')

	// Overlay structure:
	// .km-lightbox
	//   toolbar
	//   viewport containing the moved media node
	const zoomGroup = el('div', { class: 'km-lightbox-zoom' },    [zoomOutButton, zoomInButton])
	const toolbar =   el('div', { class: 'km-lightbox-toolbar' }, [zoomGroup, closeButton])
	const viewport =  el('div', { class: 'km-lightbox-viewport' })
	const overlay =   el('div', { class: 'km-lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('preview.dialog'), hidden: true }, [toolbar, viewport])

	// Button zoom controls.
	zoomOutButton.addEventListener('click', () => changeScale(1 / LIGHTBOX_ZOOM_STEP))
	zoomInButton.addEventListener('click', () => changeScale(LIGHTBOX_ZOOM_STEP))
	closeButton.addEventListener('click', () => closeMediaLightbox())
	// Clicking the backdrop/empty viewport closes the lightbox. A drag ending in
	// a click should not close it accidentally.
	overlay.addEventListener('click', event => {
		if (activeItem?.dragMoved) {
			activeItem.dragMoved = false
			return
		}
		if (event.target === overlay || event.target === viewport)
			closeMediaLightbox()
	})

	// Start drag or pinch gesture.
	viewport.addEventListener('pointerdown', event => {
		const plan = getPointerDownGesturePlan(activeItem, event, {
			targetIsViewport: event.target === viewport,
			targetBlocked: !!event.target.closest(BLOCKED_TARGET_SELECTOR)
		})
		if (plan.kind === 'ignore') return

		event.preventDefault()
		// Avoid text selection while dragging diagrams/images.
		clearSelection()

		if (plan.shouldStartPinch) {
			// Two touches start a pinch gesture. Stop any one-finger drag and
			// store the starting distance/scale.
			stopGestures()
			startPinchGesture(activeItem)
		}
		if (plan.kind === 'pinch') {
			// During pinch, capture this pointer but do not start drag state.
			viewport.setPointerCapture?.(event.pointerId)
			return
		}

		// Start one-pointer drag/pan.
		startDragGesture(activeItem, event)
		overlay.classList.add('km-lightbox-dragging')
		// Pointer capture keeps move/up events coming to the viewport even if the
		// pointer leaves the media area while dragging.
		viewport.setPointerCapture?.(event.pointerId)
	})

	// Update drag/pinch gesture.
	viewport.addEventListener('pointermove', event => {
		if (!activeItem) return
		const move = updatePointerMoveGesture(activeItem, event)
		if (move.kind === 'none') return
		event.preventDefault()
		if (move.kind === 'pinch') {
			// Pinch zoom: scale changes by current distance / starting distance.
			setScale(move.scale)
			return
		}
		// More than a tiny movement means the following click event should not
		// close the overlay.
		if (move.dragMoved) activeItem.dragMoved = true
		// Pan by pointer delta from the drag origin.
		activeItem.offsetX = move.offsetX
		activeItem.offsetY = move.offsetY
		applyTransform()
	})

	// Wheel/trackpad zoom inside the lightbox viewport.
	viewport.addEventListener(
		'wheel',
		event => {
			if (!activeItem) return
			// Prevent the page behind the lightbox from scrolling.
			event.preventDefault()
			// Exponential zoom keeps high-resolution trackpads smooth.
			setScale((activeItem.scale || 1) * Math.exp(-event.deltaY * LIGHTBOX_WHEEL_ZOOM_RATE))
		},
		{ passive: false }
	)

	// End drag/pinch when pointers leave, cancel, or capture is lost.
	;['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type =>
		viewport.addEventListener(type, event => {
			if (!activeItem) return
			// End drag when the dragging pointer ended, or when pinch collapsed
			// below two fingers.
			if (updatePointerEndGesture(activeItem, event)) endDrag()
		})
	)

	// Escape closes the lightbox.
	addEventListener( 'keydown', event => { if (event.key === 'Escape' && !overlay.hidden) closeMediaLightbox() }, { capture: true })
	// Route changes replace/scroll content, so close the moved media first.
	addEventListener('hashchange', () => closeMediaLightbox(), { passive: true })

	const graph = DOC.getElementById('mini')
	if (graph) {
		// If the graph enters fullscreen, close the media lightbox. Both are
		// fullscreen-style overlays and should not compete.
		new MutationObserver(() => {
			if (graph.classList.contains('fullscreen')) closeMediaLightbox()
		}).observe(graph, { attributes: true, attributeFilter: ['class'] })
	}

	// Add overlay once at body level so it is not clipped by content panels.
	DOC.body.append(overlay)
	lightbox = { overlay, viewport, zoomOutButton, zoomInButton, closeButton }
	syncZoomButtons()
	return lightbox
}

// Open the lightbox for one media node.
function openLightbox(node) {
	// No media node, or graph fullscreen is already active.
	if (!node || isGraphFullscreen()) return

	const box = ensureLightbox()
	// Close any currently-open item before opening the next one.
	closeMediaLightbox()
	// Placeholder remembers the exact original DOM position.
	const placeholder = DOC.createComment('km-lightbox-anchor')
	node.before(placeholder)
	// Lightbox class gives the moved media overlay-specific sizing/cursor styles.
	node.classList.add('km-lightbox-media')

	// Move the original node into the viewport.
	box.viewport.append(node)
	activeItem = createActiveItem(node, box.viewport)
	activeItem.placeholder = placeholder
	box.overlay.hidden = false
	// Dialog label uses image alt/title/etc. when available.
	box.overlay.setAttribute('aria-label', getDialogLabel(node))
	resetActiveView()
	// Move keyboard focus into the dialog controls.
	box.closeButton.focus()
}

// Mark media as lightboxable and bind delegated click-to-open behavior.
export function wireMediaLightbox(root = DOC) {

	if (!root) return
	// Visual cursor hint for every supported media node in this root.
	root.querySelectorAll(LIGHTBOXABLE_SELECTOR).forEach(node =>
		node.classList.add('km-lightboxable')
	)

	// Bind one click handler per root. markOnce prevents duplicate handlers if
	// enhancement runs more than once on the same root.
	if (!markOnce(root, 'kmLightboxBound')) return
	root.addEventListener('click', event => {
		const target = getLightboxTarget(root, event.target, {
			blockedSelector: BLOCKED_TARGET_SELECTOR,
			lightboxSelector: LIGHTBOXABLE_SELECTOR
		})
		// Not a supported media click.
		if (!target) return
		event.preventDefault()
		openLightbox(target)
	})
}
