/*
 * Shell layout state for side panels, breadcrumbs, and graph fullscreen.
 *
 * shell.js owns feature wiring and commands. This module owns the state machine
 * that turns those commands into body classes, overlay-panel state, and ARIA
 * attributes. Keeping layout state here makes the shell easier to scan without
 * spreading one-click behavior across many tiny files.
 */
import { DOC, $, setBoolAttr } from '../core/runtime.js'
import { getGraphFullscreenTransition } from './graph_fullscreen_state.js'

// Central configuration for the three shell regions the app can hide/show.
//
// selector: DOM element controlled by this region.
// hideClass: body class that hides the region in non-overlay layouts.
// overlayFlag: CSS custom property that says "this region should behave like an
// overlay at this viewport size".
const REGIONS = {
	sidebar: {
		// Left navigation panel.
		selector: '#sidebar',
		hideClass: 'hide-sidebar',
		overlayFlag: '--km-sidebar-overlay'
	},
	util: {
		// Right utility panel that contains the mini graph and TOC.
		selector: '#util',
		hideClass: 'hide-util',
		overlayFlag: '--km-util-overlay'
	},
	// Top breadcrumb bar. It can be hidden, but it is not an overlay panel.
	crumb: { selector: '#crumb', hideClass: 'hide-crumb' }
}

// Desktop breakpoint used by JS. It should match the CSS breakpoint where the
// layout stops behaving like mobile overlay panels.
const createDefaultDesktopMedia = () => matchMedia('(min-width:1001px)')

// Build the shell layout controller.
export function createShellLayout({
	desktopMedia = createDefaultDesktopMedia()
} = {}) {
	let state = null

	// Look up the DOM node for a named region.
	const getRegionEl = name => $(REGIONS[name]?.selector || '')

	// Ask CSS whether a region should become an overlay automatically.
	//
	// CSS owns responsive layout. JS reads the CSS variable so the breakpoint and
	// overlay behavior stay in one place visually.
	const isAutoOverlayRegion = name =>
		getComputedStyle(DOC.documentElement)
			.getPropertyValue(REGIONS[name]?.overlayFlag || '')
			.trim() === '1'

	// Decide whether a region is currently controlled as an overlay.
	//
	// A region is overlay-style when:
	// - the region has an overlay CSS flag, and
	// - the viewport is not desktop, or CSS says this region is auto-overlay
	const isOverlayRegion = name =>
		!!(
			state &&
			REGIONS[name]?.overlayFlag &&
			(!state.desktop || isAutoOverlayRegion(name))
		)

	// Apply the current state to the DOM.
	//
	// This is the only function that directly toggles the global body classes and
	// panel ARIA state. Event handlers change data; this function paints it.
	function apply() {
		// Before init() runs there is no state to apply.
		if (!state) return
		const body = DOC.body
		Object.entries(REGIONS).forEach(([name, region]) => {
			// Non-overlay hide/show is driven by body classes so CSS can resize the
			// main grid around hidden side panels.
			if (region.hideClass)
				body.classList.toggle(region.hideClass, !!state.hidden[name])
			const panel = getRegionEl(name)
			// Some test fixtures or custom shells may omit a region entirely.
			if (!panel) return
			const open = state.overlayOpen === name
			const overlay = isOverlayRegion(name)
			// Only overlay-capable panels use the "open" class. Breadcrumbs do not.
			if (region.overlayFlag) panel.classList.toggle('open', overlay && open)
			// Overlay panels are hidden unless opened. Non-overlay panels are hidden
			// only when their hidden flag is true.
			const hidden = overlay ? !open : !!state.hidden[name]
			setBoolAttr(panel, 'aria-hidden', hidden)
		})
		// Graph fullscreen state is reflected both visually and in button ARIA.
		$('#mini')?.classList.toggle('fullscreen', !!state.graphFullscreen)
		setBoolAttr($('#expand'), 'aria-pressed', state.graphFullscreen)
		setBoolAttr($('#expand'), 'aria-expanded', state.graphFullscreen)
		// Burger buttons announce whether their overlay panel is open.
		setBoolAttr(
			$('#burger-sidebar'),
			'aria-expanded',
			state.overlayOpen === 'sidebar'
		)
		setBoolAttr(
			$('#burger-util'),
			'aria-expanded',
			state.overlayOpen === 'util'
		)
	}

	// Create the initial state object and immediately apply it to the page.
	function init() {
		state = {
			// Snapshot of whether JS considers this desktop layout right now.
			desktop: desktopMedia.matches,
			// Hidden flags for non-overlay regions.
			hidden: { sidebar: false, util: false, crumb: false },
			// Name of the currently open overlay panel, or empty string for none.
			overlayOpen: '',
			// Whether the mini graph is expanded to fullscreen styling.
			graphFullscreen: false,
			// Temporary memory used by keybind fullscreen so Escape can restore the
			// util panel to the state it had before fullscreen opened.
			restoreUtilState: ''
		}
		apply()
	}

	// Close whichever overlay panel is currently open.
	//
	// Returns true when it actually changed the UI. Keyboard handling uses that to
	// decide whether a shortcut was consumed.
	function closeOverlayPanels() {
		if (!state) {
			// Fallback for very early calls before init() exists: remove open
			// classes directly from overlay-capable panels.
			;['#sidebar', '#util'].forEach(selector =>
				$(selector)?.classList.remove('open')
			)
			return false
		}
		// Nothing to close.
		if (!state.overlayOpen) return false
		state.overlayOpen = ''
		apply()
		return true
	}

	// Open one overlay panel by name.
	//
	// This is used when a command needs a specific panel visible, such as focusing
	// search inside the sidebar on mobile.
	function openPanel(name) {
		if (!state) return false
		// Empty name is allowed and means "no overlay panel".
		state.overlayOpen = name || ''
		apply()
		return true
	}

	// Toggle one shell region.
	//
	// On overlay layouts this opens/closes the floating panel. On desktop layouts
	// it toggles the body hide class so the grid changes size.
	function toggleRegion(name) {
		if (!state) return false
		if (isOverlayRegion(name)) {
			// Overlay mode: clicking the active panel button closes it; clicking a
			// different panel switches directly to that panel.
			state.overlayOpen = state.overlayOpen === name ? '' : name
		} else {
			// Non-overlay mode: hide/show this fixed region.
			state.hidden[name] = !state.hidden[name]
		}
		apply()
		return true
	}

	// Explicitly set a fixed region's hidden flag.
	//
	// Used by focusSearch() to make sure the sidebar is visible before moving
	// focus into the search input.
	function setRegionHidden(name, hidden) {
		if (!state) return false
		state.hidden[name] = !!hidden
		apply()
		return true
	}

	// Enter or exit graph fullscreen mode.
	//
	// `source` describes why the state changed. Button/double-click fullscreen
	// should not restore util panel state, but keyboard fullscreen should: when
	// the user presses G, the graph may need to open the util panel temporarily,
	// and Escape should put that panel back where it was.
	function setGraphFullscreen(value, source = 'button') {
		if (!state) return false
		const transition = getGraphFullscreenTransition(state, value, {
			source,
			isUtilOverlay: isOverlayRegion('util')
		})
		// No visual change needed.
		if (!transition.changed) return false
		Object.assign(state, transition.patch)
		apply()
		return true
	}

	// Sync shell state with the current responsive layout.
	//
	// Called on breakpoint changes and window resize. On mobile/overlay layouts,
	// we reset hidden flags because fixed desktop hiding should not trap panels off
	// screen after the layout changes.
	function syncLayout() {
		if (!state) return
		const wasDesktop = state.desktop
		const desktop = desktopMedia.matches
		if (!desktop) {
			// Mobile/overlay: fixed desktop hide flags should not trap panels off
			// screen after crossing into the compact layout.
			state.desktop = false
			state.hidden = { sidebar: false, util: false, crumb: false }
			// Preserve an open overlay across same-mode mobile resizes. Some
			// phones resize the window when the virtual keyboard opens, including
			// when the sidebar search field receives focus.
			if (wasDesktop) state.overlayOpen = ''
		} else {
			// Desktop: keep existing hidden flags, only update the mode.
			state.desktop = true
		}
		apply()
	}

	// Build the panel-control API used by keyboard shortcuts and app router hooks.
	function createPanels(searchInput) {
		// Browser fires this when the desktop media query crosses its breakpoint.
		desktopMedia.addEventListener?.('change', syncLayout)
		return {
			focusSearch() {
				const input = searchInput || $('#search')
				// No input or uninitialized state means there is nothing useful to do.
				if (!input || !state) return false
				if (isOverlayRegion('sidebar'))
					// On mobile, the search input lives inside the sidebar overlay, so
					// open that overlay before focusing.
					openPanel('sidebar')
				else setRegionHidden('sidebar', false)
				// Wait a frame so a newly opened/sidebar-visible input can receive
				// focus reliably.
				requestAnimationFrame(() => input.focus())
				return true
			},
			// Close overlay panels; used before route navigation and by Escape.
			closePanels: () => closeOverlayPanels(),
			syncLayout,
			// Simple command wrappers for region toggles.
			toggleSidebar: () => toggleRegion('sidebar'),
			toggleUtil: () => toggleRegion('util'),
			toggleCrumb: () => toggleRegion('crumb')
		}
	}

	return {
		init,
		createPanels,
		closeOverlayPanels,
		isDesktop: () => !!desktopMedia.matches,
		isGraphFullscreen: () => !!state?.graphFullscreen,
		setGraphFullscreen,
		syncLayout
	}
}
