/*
 * Binds global shell behavior: command handling, panels, theme, help dialog,
 * copy-link chrome, and graph shell integration points.
 *
 * The "shell" is everything around the article content:
 * - left sidebar
 * - top breadcrumbs
 * - right utility panel with graph/TOC
 * - keyboard shortcuts
 * - help dialog
 * - copy-link buttons
 *
 * Page rendering lives elsewhere. This file mostly answers: "when the user
 * presses a key or clicks a chrome button, what visible shell state changes?"
 */
import {
	DOC,
	$,
	CONTENT_SEL,
	baseURLNoHash,
	el,
	onClosest
} from '../core/runtime.js'
import { t } from '../core/i18n.js'
import { wireCopyButtons } from '../content/decorators.js'
import { closeTopPreview } from '../content/previews.js'
import {
	ensureGraphReady,
	resizeGraphViewport,
	syncCurrentGraphPage
} from '../graph/graph.js'
import { buildPageDeepLink, parseRouteTarget } from './routes.js'
import { createShellLayout } from './shell_layout.js'
import { initSearchUI } from './search.js'
import { initTheme } from './theme.js'

// Keyboard help content.
//
// Each item has a translation key for the description and one or more visible
// key labels. createHelpController() turns this into <li> rows.
const HELP_GROUPS = [
	{ helpKey: 'help.focusSearch', labels: ['Ctrl/Cmd + K', '/', 'S'] },
	{ helpKey: 'help.toggleCrumb', labels: ['W / Z'] },
	{ helpKey: 'help.toggleSidebar', labels: ['A / Q'] },
	{ helpKey: 'help.toggleUtil', labels: ['D'] },
	{ helpKey: 'help.cycleTheme', labels: ['T'] },
	{ helpKey: 'help.fullscreenGraph', labels: ['G'] },
	{ helpKey: 'help.show', labels: ['?'] },
	{ helpKey: 'help.closePanels', labels: ['Esc'] }
]

// Create a tiny controller for the keyboard-shortcuts help dialog.
//
// The dialog element lives in index.html. This controller renders translated
// help rows when opened and hides the browser differences between <dialog>
// support and the fallback open attribute.
function createHelpController() {
	const dialog = DOC.getElementById('kb-help')
	const list = DOC.getElementById('kb-help-list')
	const render = () => {
		// Missing dialog/list should not break the whole shell.
		if (!dialog || !list) return
		list.innerHTML = ''
		HELP_GROUPS.forEach(group => {
			list.append(
				el('li', {}, [
					el('span', {
						class: 'desc',
						// Translate the human-readable action label now so language
						// selection is reflected in the help dialog.
						textContent: t(group.helpKey)
					}),
					el('span', {
						// Labels are controlled constants, so using innerHTML here is
						// only for convenient <kbd> markup.
						innerHTML: group.labels
							.map(label => `<kbd>${label}</kbd>`)
							.join(', ')
					})
				])
			)
		})
	}
	// Focus the close button or whichever element index.html marked autofocus.
	const focusInitial = () => dialog?.querySelector('[autofocus]')?.focus()
	return {
		open() {
			// No dialog in the page means the command cannot do anything.
			if (!dialog) return false
			render()
			if (!dialog.open) {
				// Prefer native modal behavior when available.
				if (typeof dialog.showModal === 'function') dialog.showModal()
				// Fallback for browsers/environments without showModal().
				else dialog.setAttribute('open', '')
			}
			focusInitial()
			return true
		},
		close() {
			// Closing an already-closed/missing dialog should not consume Escape.
			if (!dialog || !dialog.open) return false
			if (typeof dialog.close === 'function') dialog.close()
			else dialog.removeAttribute('open')
			return true
		}
	}
}

// Refresh the mini graph after shell layout changes.
//
// Resizing changes the SVG viewport. Even without resizing, route changes may
// require syncing the highlighted/current graph node.
function refreshMiniGraph({ resize = false } = {}) {
	if (resize) resizeGraphViewport()
	// Wait one frame so CSS classes and layout dimensions have settled.
	requestAnimationFrame(() => syncCurrentGraphPage(true))
}

// Wire the right-panel mini graph to lazy loading and fullscreen controls.
function initMiniGraph(layout) {
	const mini = $('#mini')
	if (mini) {
		// Lazy-create the graph only when the mini graph panel first becomes
		// visible. This saves startup work on pages where the graph is hidden.
		new IntersectionObserver((entries, observer) => {
			// Ignore observer calls before the graph enters the viewport.
			if (!entries[0]?.isIntersecting) return
			ensureGraphReady()
			// The graph only needs this one-time lazy init.
			observer.disconnect()
		}).observe(mini)
	}
	// Shared fullscreen toggle used by button commands, double-click, keyboard,
	// Escape, and graph-node navigation.
	const toggleFullscreen = ({ force = null, source = 'button' } = {}) => {
		// Without state, graph host, or expand button, fullscreen cannot be
		// represented correctly.
		if (!layout || !mini || !$('#expand')) return false
		// force=null means "toggle"; otherwise use the explicit boolean.
		const next = force == null ? !layout.isGraphFullscreen() : !!force
		// setGraphFullscreen() returns false when nothing changed.
		if (!layout.setGraphFullscreen(next, source)) return false
		// Fullscreen changes the available graph size, so resize and resync.
		refreshMiniGraph({ resize: true })
		return true
	}
	mini?.addEventListener('dblclick', event => {
		// Double-clicking a graph node is for node interaction, not fullscreen.
		if (event.target.closest?.('circle')) return
		event.preventDefault()
		toggleFullscreen({
			force: !layout.isGraphFullscreen(),
			source: 'double-click'
		})
	})
	// When clicking a graph node opens a page, leave fullscreen so the article is
	// easy to read and any graph hover/dim state is not visually dominant.
	DOC.addEventListener('km:graph-node-open', () =>
		toggleFullscreen({ force: false, source: 'node' })
	)
	return {
		// Keyboard shortcut entry. source="keybind" enables util-panel restore
		// behavior in setGraphFullscreen().
		fullscreenGraph: () => toggleFullscreen({ source: 'keybind' }),
		exitFullscreen: () =>
			// Escape should consume only when fullscreen was actually active.
			layout.isGraphFullscreen()
				? toggleFullscreen({ force: false, source: 'escape' })
				: false,
		// Used by resize handling.
		isFullscreen: () => layout.isGraphFullscreen(),
		refresh: refreshMiniGraph
	}
}

// Case-insensitive single-key comparison.
const matchesKey = (event, value) =>
	event.key === value || event.key.toLowerCase() === value.toLowerCase()

// True when the event key matches any value in a small list.
const matchesAnyKey = (event, values) =>
	values.some(value => matchesKey(event, value))

// Ctrl on Windows/Linux or Cmd on macOS.
const hasCommandModifier = event => event.ctrlKey || event.metaKey

// Plain letter shortcuts should not fire when modifier keys are held.
const hasNoModifiers = event =>
	!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey

// Detect inputs/editable fields.
//
// Most shortcuts should not fire while the user is typing in search or another
// form control. Bindings can opt in with `inEditable: true`.
const isEditableTarget = node =>
	!!(
		node &&
		(node.isContentEditable ||
			/^(INPUT|TEXTAREA|SELECT)$/i.test(node.tagName))
	)

// Escape is used by several close/cancel actions.
const isEscape = event => matchesKey(event, 'Escape')

// Command implementations.
//
// Each action returns true/false-ish:
// - true means it handled the event and keyboard code should preventDefault()
// - false means nothing changed, so another lower-priority Escape action may run
const ACTIONS = {
	// Open/focus search.
	focusSearch: ctx => ctx.panels.focusSearch(),
	// Toggle individual shell regions.
	toggleCrumb: ctx => ctx.panels.toggleCrumb(),
	toggleSidebar: ctx => ctx.panels.toggleSidebar(),
	toggleUtil: ctx => ctx.panels.toggleUtil(),
	// Cycle light/dark/system theme.
	toggleTheme: ctx => ctx.theme.toggleTheme(),
	// Expand/collapse the graph.
	fullscreenGraph: ctx => ctx.graph.fullscreenGraph(),
	// Open/close the keyboard shortcut dialog.
	openHelp: ctx => ctx.help.open(),
	closeHelp: ctx => ctx.help.close(),
	// Special Escape behavior while search is focused:
	// - if text exists, clear it
	// - otherwise blur the search input
	escapeSearch: ctx => {
		const input = ctx.search.input
		// Only handle Escape when the actual search field is focused.
		if (DOC.activeElement !== input) return false
		if (input.value) ctx.search.clearSearch?.()
		else input.blur()
		return true
	},
	// Close the topmost link preview popup.
	closeTopPreview: () => closeTopPreview(),
	// Close sidebar/util overlays.
	closePanels: ctx => ctx.panels.closePanels(),
	// Exit graph fullscreen.
	exitFullscreenGraph: ctx => ctx.graph.exitFullscreen()
}

// Keyboard shortcut table.
//
// Keeping bindings as data makes it easier to add/change shortcuts without
// growing a long imperative keydown function.
const KEY_BINDINGS = [
	{
		action: 'focusSearch',
		// Ctrl/Cmd+K should work even while typing.
		when: event => hasCommandModifier(event) && matchesKey(event, 'k'),
		inEditable: true
	},
	{
		action: 'focusSearch',
		// Slash opens search like many docs apps.
		when: event => matchesKey(event, '/') && hasNoModifiers(event)
	},
	{
		action: 'focusSearch',
		// Plain S is an easy local shortcut for search.
		when: event => matchesKey(event, 's') && hasNoModifiers(event)
	},
	{
		action: 'toggleCrumb',
		// W/Z covers different keyboard layouts.
		when: event => matchesAnyKey(event, ['w', 'z']) && hasNoModifiers(event)
	},
	{
		action: 'toggleSidebar',
		// A/Q covers different keyboard layouts.
		when: event => matchesAnyKey(event, ['a', 'q']) && hasNoModifiers(event)
	},
	{
		action: 'toggleUtil',
		when: event => matchesKey(event, 'd') && hasNoModifiers(event)
	},
	{
		action: 'toggleTheme',
		when: event => matchesKey(event, 't') && hasNoModifiers(event)
	},
	{
		action: 'fullscreenGraph',
		when: event => matchesKey(event, 'g') && hasNoModifiers(event)
	},
	{
		action: 'openHelp',
		// event.key can be "?" directly, or Shift+"/" depending on browser/layout.
		when: event =>
			matchesKey(event, '?') ||
			(event.shiftKey && matchesKey(event, '/'))
	},
	// Escape actions are priority-ordered. Lower number runs first.
	{ action: 'closeHelp', when: isEscape, priority: 10, inEditable: true },
	{ action: 'escapeSearch', when: isEscape, priority: 20, inEditable: true },
	{ action: 'closeTopPreview', when: isEscape, priority: 30, inEditable: true },
	{ action: 'closePanels', when: isEscape, priority: 40, inEditable: true },
	{
		action: 'exitFullscreenGraph',
		when: isEscape,
		priority: 50,
		inEditable: true
	}
]

// Run one named command.
function runAction(actionId, ctx, event) {
	const action = ACTIONS[actionId]
	// Unknown command ids do nothing. Returning false lets callers ignore them.
	return action ? action(ctx, event) !== false : false
}

// Find and run the first keyboard binding that applies to this event.
function runMatchingCommands(event, ctx) {
	const editable = isEditableTarget(event.target)
	const bindings = KEY_BINDINGS.filter(
		// Binding must match the key event, and editable fields only allow
		// bindings that explicitly opted in.
		binding => binding.when(event) && (!editable || binding.inEditable)
	).sort((left, right) => (left.priority || 50) - (right.priority || 50))
	for (const binding of bindings) {
		// If a binding matched but its action had nothing to do, try the next
		// binding. This is important for Escape: close help, else clear search,
		// else close preview, else close panels, else exit graph fullscreen.
		if (!runAction(binding.action, ctx, event)) continue
		// A real action consumed the shortcut. Prevent browser defaults such as
		// typing "/" into the page or scrolling.
		event.preventDefault()
		return true
	}
	return false
}

// Delegate clicks from any [data-command] button to the action table.
//
// index.html can add buttons like data-command="toggleSidebar" without wiring a
// separate listener for each one.
function bindCommandButtons(ctx) {
	onClosest(DOC.body, 'click', '[data-command]', (event, button) => {
		const commandId = button.dataset.command || ''
		// Unknown command ids are ignored. This makes stray markup harmless.
		if (!ACTIONS[commandId]) return
		event.preventDefault()
		runAction(commandId, ctx, event)
	})
}

// Bind global keyboard shortcuts.
function bindKeyboard(ctx) {
	addEventListener(
		'keydown',
		event => {
			// runMatchingCommands() decides whether this key should be consumed.
			runMatchingCommands(event, ctx)
		},
		// Capture phase lets shell shortcuts close overlays/previews before inner
		// widgets react to the same Escape key.
		{ capture: true }
	)
}

// Keep shell layout and graph sizing correct when the window changes size.
function bindResize(panels, graph, layout) {
	const onResize = () => {
		// Re-evaluate desktop/mobile state and apply classes/ARIA.
		panels.syncLayout()
		if (layout.isDesktop()) {
			// On desktop, overlays should not remain open from a previous mobile
			// width. The fixed panels are visible/hidden through body classes.
			panels.closePanels()
			// Desktop panel widths may have changed, so resync graph position.
			graph.refresh()
		}
		// Fullscreen graph needs a real SVG resize, not just current-node sync.
		if (graph.isFullscreen()) graph.refresh({ resize: true })
	}
	// Apply the current layout immediately before listening for future resizes.
	panels.syncLayout()
	addEventListener('resize', onResize, { passive: true })
}

// Close overlay panels after navigation from the sidebar/search results.
//
// On mobile, this gets the panel out of the way after the user picks a page.
function bindTreeClicks(panels) {
	$('#tree')?.addEventListener(
		'click',
		event => {
			// Only close after real page links, not when toggling folder summaries.
			if (event.target.closest('a')) panels.closePanels()
		},
		// Capture sees the click before navigation changes the hash.
		{ capture: true, passive: true }
	)
	// Search result clicks should also close overlays.
	onClosest($('#results'), 'click', 'a', () => panels.closePanels(), {
		passive: true
	})
}

// Enable "copy link" buttons inside rendered content.
function bindCopyButtons() {
	wireCopyButtons($(CONTENT_SEL), () => {
		// Parse the current hash and build a clean deep link to the current page.
		const target = parseRouteTarget(location.hash)
		// If route parsing fails, fall back to the base URL plus "#".
		return buildPageDeepLink(target?.page, '') || baseURLNoHash() + '#'
	})
}

// Initialize global shell behavior.
//
// app.js calls this once after the markdown bundle has been parsed and the DOM
// shell is ready. It returns the two methods app/router need later.
export function initShell() {
	try {
		// The router handles scroll positions manually. Browser scroll restoration
		// can fight hash navigation after reload/back-forward, so turn it off when
		// the browser allows it.
		if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
	} catch (_) {}
	// Create shell layout state before any controls try to read it.
	const layout = createShellLayout()
	layout.init()
	// Initialize feature controllers. Each returns a small API used by commands.
	const theme = initTheme()
	const search = initSearchUI()
	const panels = layout.createPanels(search.input)
	const graph = initMiniGraph(layout)
	const help = createHelpController()
	// Shared context object passed to command actions.
	const ctx = { graph, help, panels, search, theme }
	// Wire passive/global behaviors.
	bindCopyButtons()
	bindResize(panels, graph, layout)
	bindTreeClicks(panels)
	bindCommandButtons(ctx)
	bindKeyboard(ctx)
	return {
		// app.js calls this after search UI exists so ?q=... can populate search.
		applyQueryFromLocation: search.applyQueryFromLocation,
		// router calls this before route changes to close mobile overlays.
		closePanels: panels.closePanels
	}
}
