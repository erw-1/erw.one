/*
 * Sidebar search: score pages and headings, render results, and apply ?q=
 * startup queries. Kept separate from shell.js so global UI wiring stays small.
 *
 * Search is intentionally simple and local:
 * 1. split the query into meaningful tokens
 * 2. keep pages that contain every token somewhere
 * 3. score title/tag/body/section matches
 * 4. render page results with matching heading links underneath
 *
 * There is no server search index. Everything runs against fields prepared by
 * wiki.js when the markdown bundle is loaded.
 */
import { $ } from '../core/runtime.js'
import {
	comparePagesByTitle,
	isSimpleFolderPage,
	wikiStore
} from '../wiki.js'
import { parseRouteTarget } from './routes.js'
import { findSearchMatches } from './search_core.js'
import {
	getStartupSearchQuery,
	normalizeSearchQuery,
	renderSearchResultState,
	shouldNavigateToSearchResult
} from './search_results.js'

// Delay between typing and rerendering results. This keeps the UI responsive
// while a user is still entering a query.
const SEARCH_DEBOUNCE_MS = 150

// Search only when the normalized query has enough text to matter.
function getSearchState(value) {
	return value
		? findSearchMatches(wikiStore.pages, value, {
			isSimpleFolderPage,
			comparePagesByTitle
		})
		: { tokens: [], matches: [] }
}

// Render results for the current query and return the first navigable result.
//
// Return value:
// - first heading/page href when results exist
// - null when there are no results or no query
//
// applyQueryFromLocation() uses this to jump to the first result for ?q= links.
function renderSearchResults(query) {
	const results = $('#results')
	// Search UI may be absent in small fixtures.
	if (!results) return null

	const value = normalizeSearchQuery(query)
	return renderSearchResultState(results, {
		value,
		...getSearchState(value),
		// Current route is used only to style the matching result as current.
		routeTarget: parseRouteTarget(location.hash)
	})
}

// Wire the sidebar search input, clear button, hash updates, and ?q= startup.
export function initSearchUI() {
	const input = $('#search')
	const clearButton = $('#search-clear')
	// Missing search controls should not break the shell. Return an empty object
	// so callers can still use optional chaining.
	if (!input || !clearButton) return {}

	let debounceTimer = 0

	// Clear the input and rendered results.
	const clearSearch = ({ focus = false } = {}) => {
		input.value = ''
		renderSearchResults('')
		// Keyboard/Escape clears without refocusing; clear-button clicks keep the
		// user in the search workflow.
		if (focus) input.focus()
	}

	input.oninput = event => {
		// Restart the debounce on every keystroke.
		clearTimeout(debounceTimer)
		const value = event.target.value
		debounceTimer = setTimeout(
			// Render using the captured value from this input event.
			() => renderSearchResults(value),
			SEARCH_DEBOUNCE_MS
		)
	}
	// Clear button empties the search and keeps focus in the input.
	clearButton.onclick = () => clearSearch({ focus: true })

	addEventListener(
		'hashchange',
		() => {
			// The route changed, so rerender only when there is an active query.
			// This updates the "current" highlight inside the results list.
			if (input.value.trim()) renderSearchResults(input.value)
		},
		{ passive: true }
	)

	// Apply ?q=... from the current URL after search UI exists.
	//
	// This supports shareable links like index.html?q=drone. If the URL does not
	// already point at a page/heading, the app jumps to the first search result.
	const applyQueryFromLocation = () => {
		const value = getStartupSearchQuery(location.href)
		// No startup query means no search UI changes.
		if (!value) return

		input.value = value
		const firstResultHash = renderSearchResults(value)
		// Only auto-navigate when the URL has no hash target yet. If a link
		// already points to #page#section, preserve that explicit route.
		if (shouldNavigateToSearchResult(location.hash, firstResultHash))
			location.hash = firstResultHash
	}

	// shell.js uses input for focusing, clearSearch for Escape behavior, and
	// applyQueryFromLocation after all UI has initialized.
	return { input, clearSearch, applyQueryFromLocation }
}
