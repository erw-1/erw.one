/*
 * Testable rendering helpers for article surfaces.
 *
 * render.js owns markdown parsing and the enhancement pipeline. This file keeps
 * the small DOM transformations that are easy to test in isolation:
 * - generated heading ids
 * - updated metadata parsing
 * - native section folding
 * - reveal/open behavior for anchored headings
 */
import {
	DOC,
	$$,
	HEADINGS_SEL,
	NAV_SLOT_IDS,
	el,
	queryById
} from '../core/runtime.js'
import { formatDate } from '../core/i18n.js'

const BLOCK_MATH_RE = /(\$\$|\\\(|\\\[)/
const INLINE_MATH_RE = /(^|[^\w\\])\$(?![\s\d])(?=\S)(?:\\.|[^$\\\n])*\S\$/m

// Quick raw-markdown check before lazy-loading KaTeX.
//
// This intentionally over-detects a little: loading KaTeX unnecessarily is
// better than missing obvious math syntax on a page.
export function hasMathMarkers(content = '') {
	return BLOCK_MATH_RE.test(content) || INLINE_MATH_RE.test(content)
}

const HEADING_TAG_RE = /^H[1-6]$/
const SECTION_BODY_CLASS = 'km-section-body'
const SECTION_SUMMARY_CLASS = 'km-section-summary'

// Add deterministic ids to headings that do not already have one.
//
// The ids are position-based, not text-based, so duplicate heading titles still
// get unique anchors and route targets.
export function assignGeneratedHeadingIds(root) {
	const counters = [0, 0, 0, 0, 0, 0, 0]
	$$(HEADINGS_SEL, root).forEach(heading => {
		// Author-provided ids win. This preserves explicit anchors from raw HTML
		// or markdown extensions.
		if (heading.id) return
		const level = +heading.tagName[1] - 1
		counters[level]++
		for (let i = level + 1; i < 7; i++) counters[i] = 0
		heading.id = counters
			.slice(0, level + 1)
			.filter(Boolean)
			.join('_')
	})
}

// Normalize supported "last updated" metadata into render-ready data.
//
// Accepted page fields:
// - updated
// - last_updated
// - lastUpdated
//
// Values may be a string date or [date, comment].
export const getUpdatedMeta = (page, formatDateFn = formatDate) => {
	const raw = page?.updated ?? page?.last_updated ?? page?.lastUpdated ?? ''
	const [dateRaw = '', commentRaw = ''] = Array.isArray(raw) ? raw : [raw]
	const value = String(dateRaw || '').trim()
	const comment = String(commentRaw || '').trim()
	if (!value) return null
	const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
	if (day) {
		// YYYY-MM-DD is treated as a UTC calendar day so local time zones do not
		// shift the displayed date backward or forward.
		const [, year, month, date] = day
		return {
			machine: value,
			label: formatDateFn(new Date(Date.UTC(+year, +month - 1, +date)), {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
				timeZone: 'UTC'
			}),
			comment
		}
	}
	const parsed = new Date(value)
	if (!Number.isNaN(parsed.getTime())) {
		// Datetime-ish strings include time in the label; plain parseable dates
		// stay date-only.
		return {
			machine: value,
			label: formatDateFn(parsed, {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
				...(/[T\s]\d{2}:\d{2}/.test(value)
					? { hour: '2-digit', minute: '2-digit' }
					: {})
			}),
			comment
		}
	}
	// Unknown date formats are still displayed as author-provided text, but omit
	// machine-readable datetime.
	return { machine: '', label: value, comment }
}

// Return numeric heading level for H1-H6 elements, or 0 for non-headings.
export const headingLevel = node =>
	node?.nodeType === 1 && HEADING_TAG_RE.test(node.tagName)
		? parseInt(node.tagName.slice(1), 10) || 0
		: 0

// H2+ headings become foldable. H1 stays the page title/lead structure.
export const isFoldableHeading = node => headingLevel(node) >= 2

// Section folding should stop before page navigation slots.
//
// Otherwise prev/next and related links would be tucked into the last article
// details block.
export const isSectionSentinel = node =>
	node?.nodeType === 1 && NAV_SLOT_IDS.includes(node.id)

// Open every closed <details> ancestor around an anchor target.
//
// Hash navigation should reveal the requested heading even if its section was
// collapsed manually before the route changed.
export const expandAncestorDetails = target => {
	const details = []
	for (
		let node = target?.nodeType === 1 ? target : target?.parentElement;
		node;
		node = node.parentElement
	) {
		if (node.tagName === 'DETAILS' && !node.open) details.push(node)
	}
	details.reverse().forEach(node => {
		node.open = true
	})
}

// Check whether a would-be section body contains any visible/significant nodes.
//
// Empty sections are restored so a lonely heading does not turn into an empty
// disclosure widget.
export function hasSectionContent(body) {
	return [...body.childNodes].some(
		node => node.nodeType === 1 || (node.nodeType === 3 && /\S/.test(node.textContent || ''))
	)
}

// Create the native details/summary/body wrapper around one heading.
//
// The heading itself moves into <summary>, preserving its id so existing anchor
// links keep targeting the visible summary heading.
export function createNativeSection(heading) {
	const details = el('details', { class: 'km-section', open: true })
	const summary = el('summary', { class: SECTION_SUMMARY_CLASS })
	const body = el('div', {
		class: SECTION_BODY_CLASS,
		dataset: { heading: heading.id || '' }
	})
	heading.before(details)
	summary.append(heading)
	details.append(summary, body)
	return { details, body }
}

// Move sibling nodes after a heading into the section body.
//
// Movement stops at:
// - the next heading of the same or higher level
// - a nav sentinel slot
export function moveSectionNodesIntoBody(details, body, level) {
	let node = details.nextSibling
	while (node) {
		if (node.nodeType === 1) {
			const nextLevel = headingLevel(node)
			if (isSectionSentinel(node) || (nextLevel && nextLevel <= level)) break
		}
		const next = node.nextSibling
		body.append(node)
		node = next
	}
}

// Undo wrapper creation when a foldable heading has no body content.
export function restoreEmptySection(details, heading) {
	details.before(heading)
	details.remove()
}

// Recursively wrap foldable headings in native sections.
//
// The recursion handles nested H3/H4 sections inside an H2 body while keeping
// each heading's subtree inside the nearest appropriate details element.
export function wrapFoldableSections(container) {
	let node = container.firstChild
	while (node) {
		if (node.nodeType !== 1 || node.parentNode !== container) {
			node = node.nextSibling
			continue
		}
		if (!isFoldableHeading(node)) {
			node = node.nextSibling
			continue
		}
		const heading = node
		const level = headingLevel(heading)
		const { details, body } = createNativeSection(heading)
		moveSectionNodesIntoBody(details, body, level)
		if (!hasSectionContent(body)) {
			restoreEmptySection(details, heading)
			// The heading is back in the container, so continue after it.
			node = heading.nextSibling
			continue
		}
		wrapFoldableSections(body)
		node = details.nextSibling
	}
}

// Public entry point used by render.js after heading decoration.
export function setupSectionFolding(container = DOC) {
	if (!container) return
	wrapFoldableSections(container)
}

// Accept either an id string or an already-found DOM target.
//
// scrollToAnchor() passes ids; some tests and future callers can pass elements.
export function findAnchorTarget(anchorOrTarget, container) {
	if (typeof anchorOrTarget !== 'string') return anchorOrTarget
	return queryById(container, anchorOrTarget)
}

// Find an anchor target and open collapsed ancestor sections around it.
export function revealSectionForAnchor(anchorOrTarget, container = DOC) {
	const target = findAnchorTarget(anchorOrTarget, container)
	if (!target) return null
	expandAncestorDetails(target)
	return target
}
