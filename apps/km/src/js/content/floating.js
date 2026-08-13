/*
 * Shared floating-surface runtime for link previews and similar overlays.
 * It handles delayed open/close, stacks, and global dismissal wiring.
 *
 * A "floating surface" is a popup-like element positioned near a trigger:
 * - link preview panels
 * - any future hover/focus panels that need similar delayed open/close behavior
 *
 * This module does not create any specific UI. Callers provide functions for
 * creating, rendering, positioning, and destroying surfaces. The runtime only
 * coordinates timers, stack state, and event delegation.
 */

// Default callback used when the caller does not need a hook.
const noop = () => {}

// Find the surface that should be considered existing for this trigger.
const findExistingSurface = (state, trigger, nested) =>
	nested
		? state.stack.find(surface => surface.trigger === trigger)
		: state.stack[0]

// Same-trigger surfaces are reused instead of duplicated.
const shouldReuseSurface = (surface, trigger) =>
	!!surface && surface.trigger === trigger

// Add the newly opened surface, replacing the old one in non-nested mode.
function pushOpenedSurface(state, surface, trigger, nested) {
	surface.trigger = trigger
	if (!nested) state.stack.length = 0
	state.stack.push(surface)
	return surface
}

// Detect whether a pointer target is inside any open surface or trigger.
function isInsideFloatingStack(state, target) {
	return state.stack.some(
		surface =>
			surface.el?.contains(target) ||
			surface.trigger?.contains?.(target)
	)
}

// Create one floating-surface runtime.
//
// The returned runtime owns:
// - a stack of currently-open surfaces
// - a pending delayed-open timer
// - a delayed stack-trim timer
// - helper methods for opening/closing surfaces
export function createFloatingSurface({
	// When nested is true, multiple surfaces can stay open as a stack. Link
	// previews use this so a preview can contain another previewable link.
	nested = false,
	// Delay before opening after pointer hover. Focus can still open immediately
	// depending on bindFloatingTriggers() options.
	openDelay  = 0,
	// Delay before closing a surface after pointer/focus leaves.
	closeDelay = 0,
	// Delay before trimming the stack when all triggers/surfaces are inactive.
	trimDelay  = 0,
	// Called when a trigger enters/leaves pending state. Previews use this to set
	// a data attribute for CSS feedback.
	setPending = noop,
	// Caller-provided "is anything still active?" check. It can include focus,
	// hover, or app-specific state.
	anyTriggerActive = () => false,
	// Caller must create the DOM object for one trigger.
	createSurface,
	// Optional async content render step for a new surface and trigger.
	renderSurface = noop,
	// Caller positions the created surface near its trigger.
	positionSurface = noop,
	// Caller destroys/removes one surface. Default removes surface.el.
	destroySurface = surface => surface?.el?.remove?.()
} = {}) {
	
	// Runtime state. Kept in one object so callers can inspect it and so helper
	// closures share the same stack/timers.
	const state = {
		// Open floating surfaces, ordered from oldest/root to newest/top.
		stack: [],
		// Pending delayed-open timer id.
		pendingTimer: 0,
		// Trigger waiting for delayed open.
		pendingTrigger: null,
		// Delayed "close all if inactive" timer id.
		trimTimer: 0
	}
	
	// Clear a timer property on an object and reset it to 0.
	//
	// `target` is state by default, but close timers live directly on surface
	// objects, so this helper also accepts a surface target.
	const clearTimer = (key, target = state) => {
		clearTimeout(target[key])
		target[key] = 0
	}

	// Cancel the pending delayed-open trigger, if any.
	function clearPending() {
		clearTimer('pendingTimer')
		// Remove caller-visible pending styling/state from the old trigger.
		if (state.pendingTrigger) setPending(state.pendingTrigger, false)
		state.pendingTrigger = null
	}

	// Cancel the delayed trim timer.
	function clearTrim() {
		clearTimer('trimTimer')
	}

	// Cancel one surface's delayed close timer.
	function clearClose(surface) {
		if (surface) clearTimer('closeTimer', surface)
	}

	// Cancel delayed close timers for every open surface.
	function cancelAllCloseTimers() {
		state.stack.forEach(clearClose)
	}

	// Close every surface from `index` upward.
	//
	// Example with nested previews:
	// stack [A, B, C], closeFrom(1) closes B and C but keeps A.
	function closeFrom(index = 0) {
		clearTrim()
		// Walk backward so popping from the stack is safe.
		for (let i = state.stack.length - 1; i >= index; i--) {
			const surface = state.stack[i]
			clearClose(surface)
			// Let the caller remove DOM and cleanup surface-specific resources.
			destroySurface(surface, state)
			state.stack.pop()
		}
	}

	// Close all surfaces and cancel any pending open.
	function closeAll() {
		clearPending()
		closeFrom(0)
	}

	// Close a specific surface and anything above it in the stack.
	function closeSurface(surface) {
		const index = state.stack.indexOf(surface)
		// Unknown/already-destroyed surface: nothing to do.
		if (index >= 0) closeFrom(index)
	}

	// Close only the topmost surface, or cancel a pending open.
	//
	// Returns true when there was something to close/cancel. Escape handlers use
	// this to decide whether they consumed the key.
	function closeTop() {
		const hadPending = !!state.pendingTimer || !!state.pendingTrigger
		clearPending()
		// No open surfaces. Returning hadPending tells callers whether a pending
		// hover preview was cancelled.
		if (!state.stack.length) return hadPending
		closeFrom(state.stack.length - 1)
		return true
	}

	// Check whether the popup system is still active.
	//
	// Activity can be caller-defined active triggers, or the pointer hovering an
	// already-open surface.
	function hasActivity() {
		return (
			!!state.pendingTrigger ||
			anyTriggerActive(state) ||
			state.stack.some(surface => surface.el?.matches?.(':hover'))
		)
	}

	// Schedule a future "close everything if inactive" check.
	function scheduleTrim(delay = trimDelay) {
		// A zero delay means this behavior is disabled.
		if (!delay) return
		clearTrim()
		state.trimTimer = setTimeout(() => {
			// Only close when neither triggers nor open surfaces are active.
			if (!hasActivity()) closeAll()
		}, delay)
	}

	// Schedule one surface to close later.
	function scheduleClose(surface, delay = closeDelay) {
		// Missing surface or zero delay means no delayed close behavior.
		if (!surface || !delay) return
		clearClose(surface)
		surface.closeTimer = setTimeout(() => {
			const index = state.stack.indexOf(surface)
			// If the surface is still open, close it and anything nested above it.
			if (index >= 0) closeFrom(index)
		}, delay)
	}

	// Open a surface for one trigger.
	async function open(trigger) {
		clearPending()
		clearTrim()
		const existing = findExistingSurface(state, trigger, nested)

		if (shouldReuseSurface(existing, trigger)) {
			// Same trigger already has a surface. Keep it open, reposition it, and
			// return the existing surface rather than creating a duplicate.
			clearClose(existing)
			positionSurface(existing, trigger, state)
			return existing
		}

		// Non-nested mode replaces the current surface with the new one.
		if (!nested) closeFrom(0)
		// Opening something new should keep existing stack entries alive.
		cancelAllCloseTimers()
		const surface = createSurface?.(trigger, state)

		// Caller may refuse to create a surface.
		if (!surface) return null
		pushOpenedSurface(state, surface, trigger, nested)
		// Caller can populate the surface asynchronously.
		await renderSurface(surface, trigger, state)
		// Position after rendering because size/content may affect placement.
		positionSurface(surface, trigger, state)
		return surface
	}

	// Queue an open after the configured hover delay.
	function queue(trigger, delay = openDelay) {
		// Hovering a trigger is activity. Cancel any stale inactive-stack trim so
		// it cannot clear this pending open before the hover delay completes.
		clearTrim()
		// Re-entering the same trigger should not restart the hover delay. This
		// can happen with delegated mouseover events while the pointer is still on
		// the same link text/chrome.
		if (state.pendingTrigger === trigger) return
		// If the surface is already open, just refresh its position instead of
		// showing another pending/loading cycle.
		if (state.stack.some(surface => surface.trigger === trigger))
			return open(trigger)
		clearPending()
		// No delay means open immediately.
		if (!delay) return open(trigger)
		state.pendingTrigger = trigger
		setPending(trigger, true)
		state.pendingTimer = setTimeout(() => {
			// Pending period is done. Remove pending state before opening.
			setPending(trigger, false)
			state.pendingTrigger = null
			state.pendingTimer = 0
			open(trigger)
		}, delay)
	}

	// Bind optional global events for this floating runtime.
	//
	// Callers choose which globals matter by passing callbacks. The callback gets
	// the DOM event and the runtime API.
	function bindGlobals({
		onHashChange, onScroll,	onResize, onEscape,	onPointerDownOutside
	} = {}) {
		// `runtime` is declared below, but this function runs only after
		// createFloatingSurface() returns, so the closure has the final object.
		const api = runtime
		// Route changes often make floating surfaces stale.
		if (onHashChange) { addEventListener('hashchange', event => onHashChange(event, api), {	passive: true })}
		// Scroll/resize can make positions stale.
		if (onScroll)     {	addEventListener('scroll',     event => onScroll(event, api),     { passive: true })}
		if (onResize)     {	addEventListener('resize',     event => onResize(event, api),     { passive: true })}

		// Escape is often used to close the top popup/stack.
		if (onEscape)     {	addEventListener('keydown',    event => { if (event.key === 'Escape') onEscape(event, api)	}, { capture: true })}
		
		if (onPointerDownOutside) {	addEventListener('pointerdown',	event => {
					// No open surfaces means outside click is irrelevant.
					if (!state.stack.length) return
					// Clicks inside any surface or its trigger are not outside clicks.
					if (!isInsideFloatingStack(state, event.target))
						onPointerDownOutside(event, api)
				},
				{ capture: true }
			)
		}
	}

	// Public API returned to the caller.
	const runtime = {
		state, bindGlobals, clearClose, clearPending,
		clearTrim, cancelAllCloseTimers, closeAll,
		closeFrom, closeSurface, closeTop, open,
		queue, scheduleClose, scheduleTrim
	}
	return runtime
}

// Bind delegated hover/focus leave/open behavior for triggers inside a root.
//
// This is separate from createFloatingSurface() so callers can bind the same
// runtime to multiple roots, such as the main article and nested preview panels.
export function bindFloatingTriggers({
	root, selector, runtime,
	// Finds the trigger from an event target. Default is closest(selector).
	matchTrigger = target => target?.closest?.(selector) || null,
	// Caller can reject a matched trigger. Previews use this to accept only valid
	// internal KM links.
	acceptTrigger = () => true,
	// Action for pointer hover. Can be a runtime method name like "queue" or a
	// custom function.
	pointerAction = 'queue',
	// Action for keyboard focus. Default opens immediately.
	focusAction = 'open',
	// Called when pointer leaves a trigger.
	onPointerLeave = noop,
	// Called when focus leaves a trigger.
	onFocusLeave = onPointerLeave
} = {}) {
	// Missing required pieces means no binding. Return a no-op cleanup function.
	if (!root || !selector || !runtime) return noop
	const listeners = []

	// Run either a custom action function or a named runtime method.
	const runAction = (action, trigger) => {
		if (!action || !trigger) return
		if (typeof action === 'function') return action(trigger, runtime)
		return runtime[action]?.(trigger)
	}

	// Add one listener and remember how to remove it.
	const bind = (type, listener, options = true) => {
		root.addEventListener(type, listener, options)
		listeners.push(() => root.removeEventListener(type, listener, options))
	}

	// Resolve and validate a trigger for an event target.
	const getTrigger = target => {
		const trigger = matchTrigger(target, selector)
		return trigger && root.contains(trigger) && acceptTrigger(trigger)
			? trigger
			: null
	}

	// Pointer enter/hover starts the pointer action, usually delayed queue().
	bind('mouseover', event => { const trigger = getTrigger(event.target)
		// Moving between descendants of the same trigger is not a real enter.
		if (trigger?.contains?.(event.relatedTarget)) return
		if (trigger) runAction(pointerAction, trigger)
	})

	// Keyboard focus starts the focus action, usually immediate open().
	bind('focusin', event => { const trigger = getTrigger(event.target)
		if (trigger) runAction(focusAction, trigger)
	})

	// Pointer leaving a trigger lets the caller decide whether to close, trim, or
	// keep the stack open based on relatedTarget.
	bind('mouseout', event => {	const trigger = getTrigger(event.target)
		// Moving between descendants of the same trigger is not a real leave.
		if (trigger?.contains?.(event.relatedTarget)) return
		if (trigger) onPointerLeave({ event, trigger, nextTarget: event.relatedTarget, runtime })
	})

	// Focus leaving a trigger mirrors pointer leave for keyboard users.
	bind('focusout', event => { const trigger = getTrigger(event.target)
		if (trigger) onFocusLeave({ event, trigger, nextTarget: event.relatedTarget, runtime })
	})

	// Return cleanup in case a caller ever needs to unbind this root manually.
	return () => listeners.forEach(remove => remove())
}
