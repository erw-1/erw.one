/*
 * Shared runtime state from index.html plus tiny DOM helpers.
 *
 * This file is imported almost everywhere, so it should stay boring and
 * dependency-free. Think of it as the app's small standard library:
 * - read the JSON config embedded in index.html
 * - expose common selectors and constants
 * - create/patch DOM nodes consistently
 * - position floating UI like previews and glossary popups
 */
import { queryElementById } from './id_lookup.js'

// Alias `document` once so modules can import the same short name everywhere.
export const DOC = document

// index.html owns the runtime config in a <script type="application/json"> tag.
// If the tag is missing, the app falls back to an empty config object below.
const CFG_EL = DOC.getElementById('km-config')

// Parse config immediately during module load. A broken JSON config should fail
// early because the app cannot know which markdown file, title, or theme to use.
export const CFG = CFG_EL ? JSON.parse(CFG_EL.textContent || '{}') || {} : {}

// Pull the app-level config values into named exports.
//
// TITLE: browser title and visible wiki title.
// MD: markdown bundle URL/path fetched by app.js.
// LANGS: preferred language order for UI text and Highlight.js languages.
// DEFAULT_THEME: requested startup theme when no saved preference exists.
// ACCENT: optional accent color from config/CSS integration.
// ASSET_BASE: site root for content-relative asset paths. Empty on a published
// site, where markdown paths already resolve against index.html. Editor
// previews render from another folder and point it back at the KM root.
// CUSTOM_EMOJI: editor-managed alias/data URL pairs embedded in the KM config.
// ALLOW_JS_FROM_MD: whether rendered markdown scripts are intentionally executed.
// CACHE_MD: markdown cache duration in minutes.
export const {
	TITLE = 'Wiki',
	MD = '',
	LANGS = [],
	DEFAULT_THEME,
	PREVIEW_THEME,
	ACCENT,
	ASSET_BASE = '',
	CUSTOM_EMOJI = [],
	ALLOW_JS_FROM_MD
} = CFG

const { CACHE_MD } = CFG

// The cache config arrives as JSON/string data, so normalize it once.
// `0` means "do not use the markdown cache".
export const CACHE_MIN = Number(CACHE_MD) || 0

// Small query helpers keep call sites readable:
// $('x') returns the first match, while $$('x') always returns a real Array.
// The optional root lets code query inside a rendered page, preview, or panel.
export const $ = (sel, root = DOC) => root.querySelector(sel)
export const $$ = (sel, root = DOC) => [...root.querySelectorAll(sel)]

// Markdown parser helpers shared with wiki.js, and the RegExp escaper. They
// live in core/text.js so Node-run model code can import them without pulling
// in this file's `document` access, and are re-exported here so browser modules
// keep importing them from the one place they always did.
export { RE_FENCE, RE_HEADING_FULL, escapeRegex } from './text.js'

// Common selectors and ids used by multiple modules. Keeping them here avoids
// tiny mismatches like one file querying h1-h5 while another queries h1-h6.
// When using HEADINGS_SEL with a container, prefer $$(HEADINGS_SEL, root);
// writing "#content h1, h2" would accidentally make h2 global.
export const HEADINGS_SEL = 'h1, h2, h3, h4, h5, h6'
export const CONTENT_SEL = '#content'
export const HASH_LINK_SEL = 'a[href^="#"]'

// These ids are injected at the bottom of rendered content. Section folding
// stops before these sentinels so prev/next and related links do not get folded
// into the last article section.
export const NAV_SLOT_IDS = Object.freeze(['prevnext', 'seealso'])

// A shared triangle/caret glyph. It appears in breadcrumbs and folded sections.
export const SIDEWAYS_CARET = '\u25B8'

// Theme values stored on <html data-theme="...">.
export const THEME_DARK = 'dark'
export const THEME_LIGHT = 'light'

// Read the current theme from the root element. Anything other than "dark"
// behaves as light, which makes missing/invalid theme state harmless.
export const getThemeMode = () => DOC.documentElement.getAttribute('data-theme') === THEME_DARK	? THEME_DARK : THEME_LIGHT

// Convenience boolean for callers that only need a yes/no theme decision.
export const isDarkTheme = () => getThemeMode() === THEME_DARK

// Strip query/hash from the current URL. Copy-link buttons use this as the
// stable page base before appending the current wiki hash.
export const baseURLNoHash = () => location.href.replace(/[?#].*$/, '')

// Convert a hash route like "#parent#page#anchor" into clean segments.
// Empty pieces are removed, so "#" and "" both produce an empty array.
export const hashSegments = hash =>	String(hash || '').replace(/^#/, '').split('#').filter(Boolean)

// Safely find an element by id inside a specific root.
//
// CSS.escape is needed because generated heading ids can contain characters
// that are legal HTML ids but awkward CSS selectors. If root/id is missing, or
// the browser rejects the selector for any reason, the caller simply gets null.
export const queryById = queryElementById

// Safely ask "does this event target live inside something matching selector?"
// Optional chaining keeps calls safe for non-Element targets.
export const closestMatch = (target, selector) => target?.closest?.(selector) || null

// Special property setters that do not map cleanly to normal DOM assignment.
const NODE_PROP_SETTERS = {
	class: (node, value) => { node.className = value },
	className: (node, value) => { node.className = value },
	dataset: (node, value) => { Object.assign(node.dataset, value) }
}

// Try normal DOM property assignment before falling back to attributes.
function setDomProperty(node, key, value) {
	if (!(key in node)) return false
	node[key] = value
	return true
}

// Apply one property/attribute to a DOM node.
//
// The conditions intentionally mirror how callers usually create nodes:
// class/className, dataset, real DOM properties, then generic attributes such
// as aria-label, role, type, and data-* names.
function setNodeProp(node, key, value) {
	if (!node) return
	const specialSetter = NODE_PROP_SETTERS[key]
	if (specialSetter) {
		specialSetter(node, value)
		return
	}
	if (setDomProperty(node, key, value)) return
	node.setAttribute(key, value)
}

// Apply a bag of properties/attributes to a DOM node and return the node.
// Returning the node lets call sites create-and-use elements inline.
export function applyNodeProps(node, props) {
	if (!node || !props) return node
	for (const key in props) {
		setNodeProp(node, key, props[key])
	}
	return node
}

// Set boolean-ish ARIA/data state as the literal strings "true" or "false".
// This is for attributes like aria-expanded, not native boolean attributes such
// as disabled or checked.
export function setBoolAttr(node, name, value) {
	if (!node) return node
	node.setAttribute(name, String(!!value))
	return node
}

// Create an element, patch its properties, append optional children, and return
// it. Children may be a single Node/string or an array of Nodes/strings.
//
// Example: el('button', { type: 'button', textContent: 'Close' })
export function el(tag, props = {}, children = []) {
	const node = DOC.createElement(tag)
	applyNodeProps(node, props)
	if (children != null) {
		const list = Array.isArray(children) ? children : [children]
		if (list.length) node.append(...list)
	}
	return node
}

// Clear accidental text selection after drag interactions. This is used by
// graph/lightbox dragging so the page does not leave highlighted text behind.
export function clearSelection() {
	const sel = window.getSelection?.()
	if (sel && !sel.isCollapsed) sel.removeAllRanges()
}

// Snapshot the viewport dimensions at the moment a floating panel is placed.
const getViewport = () => ({
	width:  window.innerWidth,
	height: window.innerHeight
})

// Mark an element as already processed by a decorator/wiring step.
//
// Returns true the first time and false after that. For example, heading copy
// buttons should only be appended once, even if a preview/content surface is
// enhanced again.
export function markOnce(node, key) {
	if (!node?.dataset) return false
	if (node.dataset[key] === '1') return false
	node.dataset[key] = '1'
	return true
}

// Event delegation helper.
//
// Instead of adding one listener to every matching child, this adds one listener
// to `root`. When an event bubbles up, it finds the closest matching ancestor
// and passes that match to the handler. The returned function removes the
// listener, which is useful for temporary surfaces.
export function onClosest(root, type, selector, handler, options) {
	if (!root) return () => {}
	const listener = event => {
		const match = closestMatch(event.target, selector)
		if (!match || !root.contains(match)) return
		handler(event, match)
	}
	root.addEventListener(type, listener, options)
	return () => root.removeEventListener(type, listener, options)
}

// Read the rendered size of a floating element. The minimum of 1 avoids divide
// by zero / clamp weirdness before layout has a real size.
function getFloatingBox(floatingEl) {
	return {
		width:  Math.max(1, floatingEl.offsetWidth),
		height: Math.max(1, floatingEl.offsetHeight)
	}
}

// True when a click/focus target is inside a floating surface. Preview and
// glossary code use this to decide whether an outside-click should close UI.
export function isWithinFloating(target, selector) {
	return !!closestMatch(target, selector)
}

// Keep a number between min and max. Used by zoom, graph math, and positioning.
export const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

// Clear old floating-placement state from a popup.
//
// The current implementation uses explicit left/top pixels because it is easy
// to reason about and avoids browser-specific CSS anchor timing glitches. This
// helper still removes old CSS-anchor fields so a page refreshed from an older
// build cannot leave stale inline placement state on reused floating elements.
export function releaseFloatingAnchor(floatingEl) {
	if (!floatingEl) return
	// Remove old native-anchor placement fields, if any.
	floatingEl.style.removeProperty('position-anchor')
	delete floatingEl.dataset.cssAnchor
	delete floatingEl.dataset.floatPlacement
	delete floatingEl._kmFloatingAnchor
}

// Position a floating panel beside an anchor, usually to the right.
//
// Concrete UI example: hovering an internal wiki link opens a preview next to
// that link. If there is not enough space on the right, the panel opens on the
// left. The vertical position is clamped so the panel stays inside the viewport.
export function positionFloatingBeside(floatingEl, anchorEl, { gap = 8 } = {}) {
	// Nothing to position if either side of the relationship is missing.
	if (!floatingEl || !anchorEl) return
	// Clear stale native-anchor state, then compute left/top in pixels.
	releaseFloatingAnchor(floatingEl)
	const rect = anchorEl.getBoundingClientRect()
	const { width: vw, height: vh } = getViewport()
	const { width, height } = getFloatingBox(floatingEl)

	// If the popup fits to the right of the trigger, use the right side.
	// Otherwise, place it on the left side with at least `gap` pixels of margin.
	const preferRight = rect.right + gap + width <= vw
	const left = preferRight ? Math.min(rect.right + gap, vw - width - gap) : Math.max(gap, rect.left - gap - width)

	// Keep the popup vertically aligned with the trigger, but do not let it
	// escape above or below the viewport.
	const top = clamp(rect.top, gap, Math.max(gap, vh - height - gap))
	Object.assign(floatingEl.style, { left: `${left}px`, top: `${top}px` })
}

// Position a floating panel above or below an anchor while keeping the same
// approximate horizontal alignment.
//
// Concrete UI example: nested previews can stack near their parent trigger.
// Prefer below the anchor because it feels natural while reading; if below
// would leave the panel off-screen, place it above instead.
export function positionFloatingStacked(
	floatingEl, anchorEl,
	{ gap = 10 } = {}
) {
	// Nothing to position if either side of the relationship is missing.
	if (!floatingEl || !anchorEl) return
	// Clear stale native-anchor state, then compute left/top in pixels.
	releaseFloatingAnchor(floatingEl)
	const rect = anchorEl.getBoundingClientRect()
	const { width: vw, height: vh } = getViewport()
	const { width, height } = getFloatingBox(floatingEl)

	// Horizontal position starts at the trigger's left edge, then clamps so the
	// whole popup stays inside the viewport.
	const left = clamp(rect.left, gap, vw - width - gap)
	const belowTop = rect.bottom + gap
	const aboveTop = rect.top - height - gap

	// Prefer below if there is room for the full popup. Otherwise use above,
	// clamped to keep it visible even near the top edge.
	const top = belowTop + height <= vh - gap ? belowTop : clamp(aboveTop, gap, vh - height - gap)
	Object.assign(floatingEl.style, { left: `${left}px`, top: `${top}px` })
}
