/*
 * Wires nested link previews for internal page links and renders preview content
 * through the same surface pipeline as the main article.
 *
 * A preview is a floating mini-render of another wiki page. Internal links in a
 * preview can open their own nested previews, so this file uses floating.js in
 * nested-stack mode.
 *
 * The main flow:
 * 1. mark valid internal hash links as preview triggers elsewhere
 * 2. reveal a preview button on hover/focus
 * 3. click the button to create a floating panel
 * 4. render the target page into that panel
 * 5. position the panel beside the trigger
 * 6. close/trim panels when focus, hover, route, or scroll changes
 */
import {
	DOC,
	$,
	el,
	CONTENT_SEL,
	HASH_LINK_SEL,
	baseURLNoHash,
	clamp,
	isWithinFloating,
	markOnce,
	positionFloatingBeside,
	queryById,
	releaseFloatingAnchor
} from '../core/runtime.js'
import { t } from '../core/i18n.js'
import { cleanupRootObservers, wireCopyButtons } from './decorators.js'
import { renderSurface as renderContentSurface } from './render.js'
import { getCurrentPage } from '../shell/router.js'
import { buildPageDeepLink, parseRouteTarget } from '../shell/routes.js'
import { bindFloatingTriggers, createFloatingSurface } from './floating.js'

// Selector for preview panels created by this module.
const PREVIEW_PANEL_SEL = '.km-link-preview'

// Delay before trimming the preview stack after pointer/focus leaves preview
// territory.
const STACK_TRIM_DELAY_MS = 220

// Delay before closing one panel after the pointer leaves it.
const PANEL_CLOSE_DELAY_MS = 240

// Escape handling in shell.js calls closeTopPreview(). This variable points at
// the current runtime's closeTop() once previews are initialized.
let closeTopPreviewHandler = () => false

// requestAnimationFrame id used to coalesce focusin/focusout cleanup checks.
let previewFocusSyncFrame = 0

// Enable copy buttons inside one preview panel.
//
// Previews render content through the same surface pipeline as the main article,
// so headings/code/math copy buttons can appear inside previews too. Heading
// copy buttons should copy a link to the previewed real page, not to the preview
// popup DOM.
function bindPreviewCopyButtons(panel) {
	// Bind delegated copy handling once per panel.
	if (!markOnce(panel.el, 'kmPreviewCopyBound')) return
	wireCopyButtons(panel.el, () => {
		// The panel already stores the real page it rendered. Copy buttons inside
		// preview DOM should copy a link to that real page, not to the temporary
		// floating panel.
		//
		// If the page is missing for any reason, fall back to the base
		// URL with a hash so heading copy still produces a valid-ish link.
		return buildPageDeepLink(panel.page, '') || baseURLNoHash() + '#'
	})
}

// Create the DOM object for one preview panel.
//
// Content is rendered later into `body`; floating.js owns stacking/lifecycle.
function createPreviewPanel(link) {
	const accessLink = el('a', {
		class: 'km-preview-access',
		textContent: t('preview.accessPage')
	})
	const pinButton = el('button', {
		type: 'button',
		class: 'km-preview-pin',
		title: t('preview.pin'),
		'aria-label': t('preview.pin'),
		'aria-pressed': 'false',
		innerHTML: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 9V4l1-1V2H7v1l1 1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H18v-2c-1.66 0-3-1.34-3-3z"></path></svg>'
	})
	const closeButton = el('button', {
		type: 'button',
		class: 'km-preview-close',
		// Tooltip and accessible label for the close button.
		title: t('preview.close'),
		'aria-label': t('preview.close'),
		innerHTML: '&times;'
	})
	const header = el('header', {}, [accessLink, pinButton, closeButton])
	// Body receives rendered page HTML.
	const body = el('div')
	const panel = {
		el: el(
			'div',
			{
				class: 'km-link-preview km-floating-surface',
				// Preview is interactive and can contain links/buttons, so use dialog
				// rather than tooltip.
				role: 'dialog',
				'aria-label': t('preview.dialog')
			},
			[header, body]
		),
		body,
		header,
		accessLink,
		pinButton,
		closeButton,
		trigger: link,
		closeTimer: 0,
		pinned: false
	}
	// The panel is appended before it is positioned so render code can measure
	// real dimensions. Keep it invisible and non-interactive until
	// positionSurface() has put it beside the trigger; this prevents the visible
	// top-left flash and avoids the unplaced panel stealing hover.
	panel.el.style.visibility = 'hidden'
	panel.el.style.pointerEvents = 'none'
	// Panels live at body level so they are not clipped by article containers.
	DOC.body.append(panel.el)
	return panel
}

// Drag pinned previews by their toolbar. Resizing stays native CSS behavior.
function bindPreviewDragging(panel) {
	let drag = null
	const finish = event => {
		if (!drag || (event.pointerId != null && event.pointerId !== drag.pointerId)) return
		try { panel.header.releasePointerCapture?.(drag.pointerId) } catch (_) {}
		drag = null
		panel.el.classList.remove('is-dragging')
	}

	panel.header.addEventListener('pointerdown', event => {
		if (!panel.pinned || event.button !== 0 || event.target.closest('button, a')) return
		const rect = panel.el.getBoundingClientRect()
		drag = {
			pointerId: event.pointerId,
			offsetX: event.clientX - rect.left,
			offsetY: event.clientY - rect.top
		}
		panel.header.setPointerCapture?.(event.pointerId)
		panel.el.classList.add('is-dragging')
		event.preventDefault()
	})
	panel.header.addEventListener('pointermove', event => {
		if (!drag || event.pointerId !== drag.pointerId) return
		const gap = 8
		const left = clamp(event.clientX - drag.offsetX, gap, Math.max(gap, innerWidth - panel.el.offsetWidth - gap))
		const top = clamp(event.clientY - drag.offsetY, gap, Math.max(gap, innerHeight - panel.el.offsetHeight - gap))
		Object.assign(panel.el.style, { left: `${left}px`, top: `${top}px` })
	})
	for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
		panel.header.addEventListener(type, finish)
}

// Automatic cleanup keeps a pinned panel and the stack leading to it.
function closeUnpinnedFrom(runtime, index = 0) {
	for (let i = runtime.state.stack.length - 1; i >= index; i--) {
		if (!runtime.state.stack[i].pinned) continue
		index = i + 1
		break
	}
	runtime.closeFrom(index)
}

// Close all previews when focus leaves both triggers and preview panels.
function closePreviewsIfFocusLeft(runtime, target, isPreviewAreaTarget) {
	// Focus is still on a preview link or inside a preview panel.
	if (isPreviewAreaTarget(target)) return
	closeUnpinnedFrom(runtime)
}

// Keep the stack consistent with the link/button that received focus or click.
function syncPreviewStack(trigger, runtime) {
	const { stack } = runtime.state
	// Check whether this trigger already owns an open panel.
	const existingIndex = stack.findIndex(panel => panel.trigger === trigger)

	if (existingIndex >= 0) {
		// Focus returned to an already-open preview trigger. Keep that panel,
		// and close any nested previews above it.
		runtime.clearClose(stack[existingIndex])
		closeUnpinnedFrom(runtime, existingIndex + 1)
		return
	}
	// If the focused link is inside an existing preview, keep previews up to that
	// parent and close anything nested beyond it.
	const parentPanel = trigger.closest(PREVIEW_PANEL_SEL)
	const parentIndex = parentPanel ? stack.findIndex(panel => panel.el === parentPanel) : -1
	closeUnpinnedFrom(runtime, parentIndex + 1)
}

// Clicking the explicit preview button is the only action that opens a panel.
const openPreview = (trigger, runtime) => {
	syncPreviewStack(trigger, runtime)
	return runtime.open(trigger)
}

// Schedule a focus cleanup after the browser has applied the new activeElement.
//
// focusin/focusout events can arrive in quick pairs. Waiting one animation frame
// lets us inspect the final DOC.activeElement instead of reacting to an
// intermediate state.
function schedulePreviewFocusSync(runtime, isPreviewAreaTarget) {
	cancelAnimationFrame(previewFocusSyncFrame)
	previewFocusSyncFrame = requestAnimationFrame(() => {
		previewFocusSyncFrame = 0
		closePreviewsIfFocusLeft(runtime, DOC.activeElement, isPreviewAreaTarget)
	})
}

// Scroll a newly rendered preview to its target heading.
//
// If a link points to #page#heading, the preview should show that section rather
// than always starting at the top.
async function scrollPreviewToAnchor(panel, anchor) {
	// Page-only preview: no internal scroll needed.
	if (!anchor) return
	// Wait two frames so renderSurface() enhancements, layout, and native section
	// reveal work have settled before measuring positions.
	await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))

	const target = queryById(panel.body, anchor)
	// Anchor was not found in the rendered preview body.
	if (!target) return
	// Convert target position from viewport coordinates into panel scrollTop
	// coordinates, subtracting the sticky/visible preview header height.
	const top = Math.max(
		0,
		target.getBoundingClientRect().top - panel.el.getBoundingClientRect().top + panel.el.scrollTop - (panel.header?.offsetHeight || 0) - 6
	)
	panel.el.scrollTo({ top, behavior: 'auto' })
	// Add a temporary/visible focus class so users can see why the preview opened
	// at this section.
	target.classList.add('km-preview-focus')
}

// Close the topmost preview panel.
//
// shell.js uses this for Escape. Before attachLinkPreviews() runs, the default
// handler simply returns false.
export function closeTopPreview() {
	return closeTopPreviewHandler()
}

// Attach preview behavior to the main article content root.
//
// This runs once during shell startup. Later article renders keep using the same
// delegated handlers because #content itself remains the same DOM node.
export function attachLinkPreviews() {
	const root = $(CONTENT_SEL)
	// No content root, or already bound.
	if (!root || !markOnce(root, 'kmPreviewsBound')) return
	let runtime

	// Find the open preview panel that contains a node, if any.
	//
	// Nested previews need this so a "#footnote-1" link inside a preview resolves
	// against the previewed page, not against the main article page.
	const panelForTarget = target => {
		const panelEl = target?.closest?.(PREVIEW_PANEL_SEL)
		return panelEl
			? runtime?.state.stack.find(panel => panel.el === panelEl) || null
			: null
	}

	// Build the route-parsing context for one link/target.
	//
	// routes.js can validate generated heading ids from parsed markdown by
	// itself. DOM-only anchors, such as footnotes, need the current page and the
	// content container that currently holds those ids.
	const routeContextForTarget = target => {
		const panel = panelForTarget(target)
		if (panel?.page)
			return { currentPage: panel.page, containerEl: panel.body }
		return { currentPage: getCurrentPage(), containerEl: root }
	}

	// Parse a preview link with the correct same-page context.
	//
	// Returning null means this link should behave like a normal link and should
	// not open a preview panel.
	const routeForPreviewLink = link =>
		link
			? parseRouteTarget(
					link.getAttribute('href') || '',
					routeContextForTarget(link)
				)
			: null

	// Resolve the link owned by either the anchor itself or its adjacent button.
	const previewTriggerForTarget = target => {
		const host = target?.closest?.('.km-preview-trigger')
		return host?.querySelector?.(`:scope > ${HASH_LINK_SEL}`) ||
			target?.closest?.(HASH_LINK_SEL) || null
	}

	// Resolve a valid preview route from any event target inside a link/button.
	const routeForPreviewTarget = target =>
		routeForPreviewLink(previewTriggerForTarget(target))

	// True when an event target is, or is inside, a valid internal preview link.
	const isPreviewLinkTarget = target => !!routeForPreviewTarget(target)

	// True when focus/pointer target is still inside preview territory.
	//
	// Preview territory means either:
	// - another valid internal link trigger
	// - an already-open preview panel
	const isPreviewAreaTarget = target =>
		isPreviewLinkTarget(target) || isWithinFloating(target, PREVIEW_PANEL_SEL)

	// Pointer left a trigger/root. Trim the stack after a short delay unless the
	// pointer moved to another preview control or panel.
	const onLeaveRoot = ({ nextTarget, runtime }) => {
		if (!isPreviewAreaTarget(nextTarget))
			runtime.scheduleTrim()
	}
	// Focus left a trigger. Close previews if focus is no longer in preview
	// territory.
	const onFocusLeave = ({ nextTarget, runtime }) =>
		closePreviewsIfFocusLeft(runtime, nextTarget, isPreviewAreaTarget)

	runtime = createFloatingSurface({
		// Link previews can open previews from inside previews.
		nested: true,
		closeDelay: PANEL_CLOSE_DELAY_MS,
		trimDelay: STACK_TRIM_DELAY_MS,
		
		anyTriggerActive: state => {
			// Keyboard focus on any internal link or its preview button keeps the
			// stack alive.
			const active = previewTriggerForTarget(DOC.activeElement)
			if (active && routeForPreviewLink(active)) return true
			return state.stack.some(panel =>
				panel.pinned || panel.trigger?.parentElement?.matches?.(':hover')
			)
		},
		createSurface(link) {
			const panel = createPreviewPanel(link)
			bindPreviewDragging(panel)

			// Entering a panel should keep it and the stack open.
			panel.el.addEventListener('mouseenter', () => {
				runtime.clearClose(panel)
				runtime.clearTrim()
			}, { passive: true })

			// Leaving a panel schedules it to close unless the pointer moved back to
			// a preview control or into another preview panel.
			panel.el.addEventListener('mouseleave', event => {
				if (!panel.pinned && !isPreviewAreaTarget(event.relatedTarget))
					runtime.scheduleClose(panel)
			}, { passive: true })

			panel.pinButton.addEventListener('click', () => {
				panel.pinned = !panel.pinned
				panel.el.classList.toggle('is-pinned', panel.pinned)
				panel.pinButton.setAttribute('aria-pressed', String(panel.pinned))
				const label = t(panel.pinned ? 'preview.unpin' : 'preview.pin')
				panel.pinButton.title = label
				panel.pinButton.setAttribute('aria-label', label)
				if (panel.pinned) {
					runtime.clearClose(panel)
					runtime.clearTrim()
				}
			})
			
			// Close button closes this panel and any nested panels above it.
			panel.closeButton.addEventListener('click', () =>
				runtime.closeSurface(panel)
			)

			// Links inside previews can open nested previews using the same runtime.
			bindPreviewRoot(panel.el)
			return panel
		},

		async renderSurface(panel, link) {
			// Parse the link that opened this preview into target page/anchor.
			const target = routeForPreviewLink(link)
			// Not an internal route after all.
			if (!target) return
			// Store the resolved page on the panel so nested same-page links and
			// copy buttons know which real article this floating DOM represents.
			panel.page = target.page
			panel.anchor = target.anchor
			panel.accessLink.href = buildPageDeepLink(target.page, target.anchor)
			// Copy buttons inside the preview should copy links to the previewed
			// real page.
			bindPreviewCopyButtons(panel)
			// Render the target page into the preview body. previewLinks:true keeps
			// links inside the preview capable of opening nested previews.
			await renderContentSurface({
				root: panel.body,
				page: target.page,
				anchor: target.anchor,
				previewLinks: true
			})
			// If the link targeted a heading, scroll the preview body to it.
			await scrollPreviewToAnchor(panel, target.anchor)
		},

		// Position panel beside its trigger link.
		positionSurface(panel) {
			if (!panel.pinned) positionFloatingBeside(panel.el, panel.trigger)
			// Reveal only after left/top has been written.
			panel.el.style.visibility = ''
			panel.el.style.pointerEvents = ''
		},
		destroySurface(panel) {
			// Release floating positioning state before removing the panel.
			releaseFloatingAnchor(panel.el)
			// Disconnect observers created while rendering preview content, such as
			// lazy code highlighting or math observers.
			cleanupRootObservers(panel.body)
			panel.el.remove()
		}
	})

	// Bind hover/focus cleanup plus the explicit button click for one rendered
	// root. The same wiring is reused by the article and nested preview panels.
	function bindPreviewRoot(previewRoot) {
		bindFloatingTriggers({
			root: previewRoot,
			selector: HASH_LINK_SEL,
			runtime,
			matchTrigger: previewTriggerForTarget,
			acceptTrigger: isPreviewLinkTarget,
			pointerAction: false,
			focusAction: syncPreviewStack,
			onPointerLeave: onLeaveRoot,
			onFocusLeave
		})
		previewRoot.addEventListener('click', event => {
			const button = event.target?.closest?.('.km-preview-button')
			if (!button || !previewRoot.contains(button)) return
			const trigger = previewTriggerForTarget(button)
			if (!routeForPreviewLink(trigger)) return
			event.preventDefault()
			event.stopPropagation()
			openPreview(trigger, runtime)
		})
	}

	// Expose the runtime's close-top behavior to shell Escape handling.
	closeTopPreviewHandler = () => runtime.closeTop()
	// Bind preview triggers in the main article root.
	bindPreviewRoot(root)
	
	// Focus can move between trigger and panel without pointer events. Coalesce
	// focus changes and close previews only after focus truly leaves.
	DOC.addEventListener(
		'focusin',
		() => schedulePreviewFocusSync(runtime, isPreviewAreaTarget),
		true
	)
	DOC.addEventListener(
		'focusout',
		() => schedulePreviewFocusSync(runtime, isPreviewAreaTarget),
		true
	)

	runtime.bindGlobals({
		onHashChange: (_, api) => {
			// Route changes close transient previews; pinned references stay useful.
			closeUnpinnedFrom(api)
		},
		onScroll: (_, api) => {
			// Scrolling usually means the user moved away from the trigger. Trim
			// visible previews if inactive.
			api.scheduleTrim()
		}
	})
}
