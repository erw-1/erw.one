/*
 * Annotates glossary terms inside rendered content and drives the shared floating
 * glossary surface used for hover, focus, and keyboard navigation.
 *
 * The glossary model itself is built in wiki.js from the special km_glossary
 * page. This file works after markdown rendering:
 * 1. find plain text nodes that are safe to modify
 * 2. replace glossary words with focusable <span> triggers
 * 3. show one shared floating definition panel for hover/focus
 * 4. navigate to the full glossary entry on click/Enter/Space
 */
import {
	DOC,
	el,
	closestMatch,
	markOnce,
	onClosest,
	positionFloatingStacked,
	releaseFloatingAnchor
} from '../core/runtime.js'
import { t } from '../core/i18n.js'
import { getGlossaryModel } from '../wiki.js'
import { decorateExternalLinks } from './decorators.js'
import { ensureMarkdown } from './markdown_runtime.js'

// Selector for areas where glossary annotation must not rewrite text.
//
// Examples:
// - links/buttons: replacing text inside them would create nested interactive UI
// - code/pre/kbd/script/style: code examples should stay literal
// - headings/page-meta/tools: avoid noisy UI chrome annotations
// - mermaid/katex/svg/math: rendered diagrams/math should not be text-walked
// - existing glossary nodes/panels: avoid annotating annotations again
const SKIP_SEL ='a,button,code,pre,script,style,h1,h2,h3,h4,h5,h6,textarea,input,select,kbd,svg,math,.heading-tools,.code-tools,.page-meta,.mermaid,.katex,.katex-display,.km-glossary-term,.km-glossary-pop'

// Focusable term trigger selector.
const GLOSSARY_TERM_SEL    = '.km-glossary-term'

// Floating glossary definition panel selector.
const GLOSSARY_TOOLTIP_SEL = '.km-glossary-pop'

// Hover delay before opening. This prevents popups from flashing while the mouse
// merely passes over an annotated word.
const GLOSSARY_OPEN_DELAY_MS = 220

// Small close delay so moving from a term into the popup does not immediately
// hide it.
const GLOSSARY_CLOSE_DELAY_MS = 140

// Cache rendered glossary definition HTML by entry key and body text.
//
// Glossary bodies are markdown, so rendering them can lazy-load/use Marked. The
// cache avoids reparsing the same definition for repeated hover/focus events.
const glossaryHTMLCache = new Map()

// Shared floating surface and the term that currently owns it.
let glossarySurface, glossaryActiveTrigger = null

// Monotonic token for async popup rendering. If the user moves to another term
// while markdown is parsing, old popup HTML is ignored.
let glossaryToken = 0

// Timers for delayed open/close behavior.
let glossaryOpenTimer = 0
let glossaryCloseTimer = 0

// Global listeners are bound once even if many article/preview roots call
// wireGlossaryTerms().
let glossaryGlobalsBound = false

// Look up the glossary entry represented by a term trigger element.
const getGlossaryEntryFromTerm = term => getGlossaryModel().byKey.get(term?.dataset?.glossaryKey || '') || null

// Create the inline/focusable term trigger that replaces matched text.
//
// It is a span rather than an anchor because hover/focus shows the definition,
// while click/keyboard navigation is handled explicitly below.
const createTermNode = (label, entry) =>
	el('span', {
		class: 'km-glossary-term',
		// Make the term keyboard-focusable.
		tabIndex: 0,
		// Expose it as button-like because activation navigates to the entry.
		role: 'button',
		// Store the stable entry key so event handlers can find the definition.
		dataset: { glossaryKey: entry.key },
		// Signal that focus/hover opens a small definition surface.
		'aria-haspopup': 'dialog',
		// Screen-reader label names the visible term.
		'aria-label': t('glossary.definitionAria', { label }),
		textContent: label
	})

// Split one text string into plain text and glossary term parts.
function getGlossaryTextParts(text, glossary) {
	const matcher = new RegExp(glossary.matcher.source, glossary.matcher.flags)
	const parts = []
	let lastIndex = 0
	let match
	while ((match = matcher.exec(text))) {
		const label = match[1]
		const info = glossary.bySurface.get(label.toLocaleLowerCase())
		// Defensive guard: matcher and surface map should agree, but skip if not.
		if (!info?.entry) continue
		if (match.index > lastIndex)
			parts.push({ type: 'text', value: text.slice(lastIndex, match.index) })
		parts.push({ type: 'term', label, entry: info.entry })
		lastIndex = match.index + label.length
	}
	if (!parts.length) return []
	if (lastIndex < text.length)
		parts.push({ type: 'text', value: text.slice(lastIndex) })
	return parts
}

// Collect text nodes that can safely be annotated.
//
// TreeWalker lets us inspect text nodes directly without manually recursing
// through every element.
function collectGlossaryTextNodes(container) {
	const nodes = []
	const walker = DOC.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
		acceptNode(node) {
			const parent = node.parentElement
			return parent && node.nodeValue?.trim() && !parent.closest(SKIP_SEL)
				// Non-empty text outside skipped UI/code areas can be annotated.
				? NodeFilter.FILTER_ACCEPT
				// Empty text or unsafe areas are ignored.
				: NodeFilter.FILTER_REJECT
		}
	})
	// Store nodes first. Replacing text nodes while walking can confuse traversal.
	while (walker.nextNode()) nodes.push(walker.currentNode)
	return nodes
}

// Replace glossary matches inside one text node with term trigger spans.
function annotateGlossaryTextNode(node, glossary) {
	const parts = getGlossaryTextParts(node.nodeValue || '', glossary)
	// No glossary term matched this text node, so leave it untouched.
	if (!parts.length) return
	const fragment = DOC.createDocumentFragment()
	parts.forEach(part =>
		fragment.append(
			part.type === 'term'
				? createTermNode(part.label, part.entry)
				: part.value
		)
	)
	// Replace the original text node with text + term spans.
	node.replaceWith(fragment)
}

// Show or hide the shared glossary panel.
function setGlossaryVisible(visible) {
	if (!glossarySurface) return
	glossarySurface.el.hidden = !visible
	glossarySurface.el.setAttribute('aria-hidden', String(!visible))
}

// Cancel any pending delayed open.
function clearGlossaryOpenTimer() {
	clearTimeout(glossaryOpenTimer)
	glossaryOpenTimer = 0
}

// Cancel any pending delayed close.
function clearGlossaryCloseTimer() {
	clearTimeout(glossaryCloseTimer)
	glossaryCloseTimer = 0
}

// Fully hide the glossary surface and clear active state.
function hideGlossarySurface() {
	clearGlossaryOpenTimer()
	clearGlossaryCloseTimer()
	// Invalidate any async showGlossaryFor() work still in progress.
	glossaryToken++
	// Release positioning state owned by the floating helper.
	releaseFloatingAnchor(glossarySurface?.el)
	// Remove visual active styling from the old term.
	glossaryActiveTrigger?.classList.remove('km-glossary-active')
	glossaryActiveTrigger = null
	setGlossaryVisible(false)
}

// Create the shared floating glossary panel if it does not exist yet.
//
// The app uses one panel for all glossary terms instead of creating one popup
// per term. That keeps DOM size small and avoids many overlapping surfaces.
function ensureGlossarySurface() {
	if (glossarySurface) return glossarySurface
	const title = el('div', { class: 'km-glossary-pop-title' })
	const body = el('div', { class: 'km-glossary-pop-body' })
	const panel = el(
		'div',
		{
			class: 'km-glossary-pop km-floating-surface',
			role: 'tooltip',
			hidden: true,
			'aria-hidden': 'true'
		},
		[title, body]
	)
	// Moving the mouse into the popup should keep it open.
	panel.addEventListener('mouseenter', clearGlossaryCloseTimer, { passive: true })
	// Leaving the popup starts the delayed close, matching term mouseout.
	panel.addEventListener('mouseleave', scheduleGlossaryClose, {
		passive: true
	})

	// The floating panel lives at body level so it is not clipped by article
	// containers or folded sections.
	DOC.body.append(panel)
	glossarySurface = { el: panel, title, body, trigger: null }
	return glossarySurface
}

// Render one glossary entry body from markdown to HTML.
//
// The glossary page stores definitions as markdown sections. The popup shows the
// rendered definition body, with external links decorated like normal content.
async function getGlossaryEntryHTML(entry) {

	// Missing entry fallback. This should be rare, but keeps the UI graceful.
	if (!entry) return `<p>${t('glossary.noDefinition')}</p>`
	// Include body text in the cache key so editing/reloading content with the
	// same entry key but different definition body does not reuse stale HTML.
	const key = `${entry.key}\u0000${entry.body || ''}`

	// Cached rendered definition.
	if (glossaryHTMLCache.has(key)) return glossaryHTMLCache.get(key)
	const { parse } = await ensureMarkdown()
	const wrap = DOC.createElement('div')

	// Empty definitions get a localized placeholder, rendered as emphasis.
	wrap.innerHTML = parse(
		entry.body || `_${t('glossary.noDefinitionProvided')}_`
	)
	// Definitions can contain external links too.
	decorateExternalLinks(wrap)
	const html = wrap.innerHTML
	glossaryHTMLCache.set(key, html)
	return html
}

// Start the delayed close timer.
function scheduleGlossaryClose() {
	clearGlossaryCloseTimer()
	glossaryCloseTimer = setTimeout(
		hideGlossarySurface,
		GLOSSARY_CLOSE_DELAY_MS
	)
}

// Show the shared glossary panel for one term trigger.
async function showGlossaryFor(trigger) {
	const entry = getGlossaryEntryFromTerm(trigger)
	// Trigger is stale or points at an unknown entry.
	if (!entry) return
	clearGlossaryOpenTimer()
	clearGlossaryCloseTimer()
	// Capture a token before async markdown rendering. If another term opens
	// later, token will no longer match.
	const token = ++glossaryToken
	const surface = ensureGlossarySurface()
	// Move active styling from the previous term to this term.
	glossaryActiveTrigger?.classList.remove('km-glossary-active')
	glossaryActiveTrigger = trigger
	surface.trigger = trigger
	trigger.classList.add('km-glossary-active')
	// Title can update synchronously.
	surface.title.textContent = entry.term
	// Body may require lazy markdown parser loading.
	surface.body.innerHTML = await getGlossaryEntryHTML(entry)
	// If another hover/focus happened while body HTML was loading, ignore this
	// stale result.
	if (token !== glossaryToken || glossaryActiveTrigger !== trigger) return
	setGlossaryVisible(true)
	// Position near the active term, stacking around other floating surfaces.
	positionFloatingStacked(surface.el, trigger)
}

// Schedule a glossary popup to open after the hover delay.
function scheduleGlossaryOpen(trigger) {
	clearGlossaryOpenTimer()
	clearGlossaryCloseTimer()
	if (trigger === glossaryActiveTrigger && !glossarySurface?.el.hidden) {
		// Same visible trigger: just refresh position in case layout shifted.
		positionFloatingStacked(glossarySurface.el, trigger)
		return
	}
	glossaryOpenTimer = setTimeout(
		() => showGlossaryFor(trigger),
		GLOSSARY_OPEN_DELAY_MS
	)
}

// True when a pointer/focus target is inside the glossary popup.
function isGlossarySurfaceTarget(target) {
	return !!closestMatch(target, GLOSSARY_TOOLTIP_SEL)
}

// Bind global events that close the shared glossary popup.
//
// This is called from each rendered root but only binds once for the whole page.
function bindGlossaryGlobals() {
	if (glossaryGlobalsBound) return
	glossaryGlobalsBound = true
	// Route changes replace or move content, so hide the old popup.
	addEventListener('hashchange', hideGlossarySurface, { passive: true })
	// Scrolling/resizing can invalidate popup position. Hiding is simpler and
	// avoids a detached-looking surface.
	addEventListener('scroll', hideGlossarySurface, { passive: true })
	addEventListener('resize', hideGlossarySurface, { passive: true })
	addEventListener(
		'keydown',
		event => {
			// Escape closes the glossary popup.
			if (event.key === 'Escape') hideGlossarySurface()
		},
		{ capture: true }
	)
	addEventListener(
		'pointerdown',
		event => {
			// Nothing visible, nothing to close.
			if (!glossarySurface || glossarySurface.el.hidden) return
			if (
				// Clicks inside the popup or on the active term should not close it.
				glossarySurface.el.contains(event.target) ||
				glossaryActiveTrigger?.contains?.(event.target)
			)
				return
			// Outside click closes the popup.
			hideGlossarySurface()
		},
		{ capture: true }
	)
}

// Navigate to the full glossary page entry for a popup/term.
function navigateToGlossaryEntry(entry) {
	// Entries without anchors cannot be routed to.
	if (!entry?.anchorId) return
	// Route to glossary page hash plus the section anchor for this term.
	location.hash = '#' + (entry.page?.hash ? `${entry.page.hash}#` : '') + entry.anchorId
	hideGlossarySurface()
}

// Annotate glossary terms in one rendered page/container.
//
// render.js calls this after markdown is rendered and after the basic decorators
// have run. The glossary page itself is skipped so definitions do not annotate
// their own headings/bodies into distracting nested glossary UI.
export function annotateGlossaryTerms(page, container = DOC) {
	const glossary = getGlossaryModel()
	// Skip when:
	// - no container exists
	// - this is the glossary page
	// - there is no matcher because no glossary terms were loaded
	if (!container || page?.id === 'km_glossary' || !glossary.matcher) return
	collectGlossaryTextNodes(container).forEach(node =>
		annotateGlossaryTextNode(node, glossary)
	)
}

// Wire glossary interactions for a rendered root.
//
// This uses event delegation so it works for every term span created by
// annotateGlossaryTerms(), and so preview/article roots do not need per-term
// listeners.
export function wireGlossaryTerms(root) {
	// Bind each root once. Re-rendered roots are new DOM nodes, so they can be
	// bound independently.
	if (!root || !markOnce(root, 'kmGlossaryBound')) return
	bindGlossaryGlobals()
	// Find the nearest glossary term for any event target.
	const getTerm = target => closestMatch(target, GLOSSARY_TERM_SEL)
	// When pointer/focus moves from the term into the popup, keep the popup open.
	const shouldKeepOpen = (term, nextTarget) =>
		!!(
			nextTarget &&
			(term.contains(nextTarget) ||
				isGlossarySurfaceTarget(nextTarget))
		)

	root.addEventListener('mouseover', event => {
		const term = getTerm(event.target)
		// Hovering a term schedules a delayed open.
		if (term && root.contains(term)) scheduleGlossaryOpen(term)
	}, true)
	root.addEventListener('focusin', event => {
		const term = getTerm(event.target)
		// Keyboard focus opens immediately so tab navigation gives prompt
		// feedback.
		if (term && root.contains(term)) showGlossaryFor(term)
	}, true)
	root.addEventListener('mouseout', event => {
		const term = getTerm(event.target)
		// Ignore mouseout that is not from a term, or that moves into the popup.
		if (!term || shouldKeepOpen(term, event.relatedTarget)) return
		clearGlossaryOpenTimer()
		scheduleGlossaryClose()
	}, true)
	root.addEventListener('focusout', event => {
		const term = getTerm(event.target)
		// Same idea as mouseout: moving focus into the popup keeps it open.
		if (!term || shouldKeepOpen(term, event.relatedTarget)) return
		clearGlossaryOpenTimer()
		scheduleGlossaryClose()
	}, true)
	// Click/tap on a term navigates to the complete glossary entry.
	onClosest(root, 'click', GLOSSARY_TERM_SEL, (event, term) => {
			const entry = getGlossaryEntryFromTerm(term)
			if (!entry) return
			event.preventDefault()
			navigateToGlossaryEntry(entry)
		},
		true
	)
	
	// Keyboard activation mirrors button behavior for focusable term spans.
	onClosest( root, 'keydown', GLOSSARY_TERM_SEL, (event, term) => {
			// Enter and Space activate; all other keys are left alone.
			if (event.key !== 'Enter' && event.key !== ' ') return
			const entry = getGlossaryEntryFromTerm(term)
			if (!entry) return
			event.preventDefault()
			navigateToGlossaryEntry(entry)
		},
		true
	)
}
