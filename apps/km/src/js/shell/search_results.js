/*
 * Sidebar search result rendering.
 *
 * search_core.js decides which pages match. This module turns those matches
 * into the small nested list used by the sidebar while keeping all UI chrome
 * text-only. The search input wiring stays in search.js.
 */
import { DOC, el, setBoolAttr } from '../core/runtime.js'
import { t } from '../core/i18n.js'
import { getPageHash } from '../wiki.js'

// Search internally uses lowercase trimmed text.
export const normalizeSearchQuery = query => (query || '').trim().toLowerCase()

// Start a fresh render pass and tell assistive tech the list is updating.
export function beginSearchResultsRender(results) {
	results.setAttribute('aria-live', 'polite')
	setBoolAttr(results, 'aria-busy', true)
	results.replaceChildren()
}

// Finish a render pass and mark the list idle again.
export const finishSearchResultsRender = results =>
	setBoolAttr(results, 'aria-busy', false)

// Convert a parsed route target into the tiny shape rendering needs.
export const getCurrentSearchRoute = routeTarget => ({
	currentPage: routeTarget?.page || null,
	currentAnchor: routeTarget?.anchor || ''
})

// Safely read ?q=... from a URL.
export function getStartupSearchQuery(href) {
	try {
		return new URL(href).searchParams.get('q')?.trim() || ''
	} catch (_) {
		return ''
	}
}

// Auto-navigation is only for bare startup URLs such as index.html?q=drone.
export const shouldNavigateToSearchResult = (hash, firstResultHash) =>
	!!firstResultHash && (!hash || hash === '#')

// A heading link points at either "#page#heading" or, for the root page,
// directly at "#heading".
export function getSectionResultHref(page, section) {
	const base = getPageHash(page)
	return `#${base ? base + '#' : ''}${section.id}`
}

// Render one heading result under a page result.
export function createSectionResult(page, section, currentPage, currentAnchor) {
	return el('li', { class: 'heading-result' }, [
		el('a', {
			href: getSectionResultHref(page, section),
			class:
				page === currentPage && section.id === currentAnchor
					? 'search-current'
					: '',
			textContent: section.txt
		})
	])
}

// Render the nested heading matches for one page, if any exist.
function createSectionResults(page, matchedSecs, currentPage, currentAnchor) {
	if (!matchedSecs.length) return null
	const sub = el('ul', { class: 'sub-results' })
	matchedSecs.forEach(({ sec }) =>
		sub.append(createSectionResult(page, sec, currentPage, currentAnchor))
	)
	return sub
}

// Render one page result, optionally with matching headings below it.
export function createPageResult(
	{ p: page, matchedSecs },
	currentPage,
	currentAnchor
) {
	const item = el('li', { class: 'page-result' }, [
		el('a', {
			href: '#' + getPageHash(page),
			class: page === currentPage ? 'search-current' : '',
			textContent: page.title
		})
	])
	const sectionResults = createSectionResults(
		page,
		matchedSecs,
		currentPage,
		currentAnchor
	)
	if (sectionResults) item.append(sectionResults)
	return item
}

// Render all page matches in one fragment so the DOM changes once.
export function renderSearchMatches(
	results,
	matches,
	{ currentPage = null, currentAnchor = '' } = {}
) {
	const fragment = DOC.createDocumentFragment()
	matches.forEach(match =>
		fragment.append(createPageResult(match, currentPage, currentAnchor))
	)
	results.append(fragment)
}

// Show the localized "no result" row.
export function renderNoSearchResults(results) {
	// This message is UI chrome, not Markdown content, so keep it as textContent.
	results.append(el('li', { id: 'no_result', textContent: t('search.noResult') }))
}

// Render one complete search state and return the first result href, if any.
export function renderSearchResultState(
	results,
	{ value, tokens = [], matches = [], routeTarget = null }
) {
	beginSearchResultsRender(results)
	if (!value) {
		finishSearchResultsRender(results)
		return null
	}
	if (!tokens.length || !matches.length) {
		renderNoSearchResults(results)
		finishSearchResultsRender(results)
		return null
	}
	renderSearchMatches(results, matches, getCurrentSearchRoute(routeTarget))
	finishSearchResultsRender(results)
	return getFirstSearchResultHref(results)
}

// Return the first navigable result, preferring a matched heading over page top.
export const getFirstSearchResultHref = results =>
	results.querySelector('.heading-result a')?.getAttribute('href') ||
	results.querySelector('.page-result > a')?.getAttribute('href') ||
	null
