/*
 * Pure local search helpers.
 *
 * DOM rendering and input wiring live in search.js. This module scores and
 * ranks pages/sections prepared by wiki_model.js.
 */
import { escapeRegex } from '../core/runtime.js'

// Ignore tiny tokens so a query like "a drone" does not make every page with
// the letter "a" compete as a match.
export const MIN_TOKEN_LENGTH = 2

// Local search scoring weights.
//
// Titles should dominate, tags should beat body text, and exact multi-token
// phrases should rank above pages that merely contain the words separately.
export const SEARCH_WEIGHTS = {
	title: 5,
	tag: 3,
	body: 1,
	secTitle: 3,
	secBody: 1,
	phraseTitle: 5,
	phraseBody: 2,
	secCountCap: 4
}

// Normalize a free-form query into meaningful lowercase tokens.
export const getTokens = query =>
	(query || '')
		.trim()
		.toLowerCase()
		.split(/\s+/)
		.filter(token => token.length >= MIN_TOKEN_LENGTH)

// Build whole-word regexes for scoring.
//
// Filtering uses simple includes() for speed, but scoring uses word boundaries
// so "api" in "capitol" does not receive a title/body score.
export const tokenRegexesFor = tokens =>
	tokens.map(token => new RegExp('\\b' + escapeRegex(token) + '\\b'))

// Score page-level fields.
//
// The page has lowercase cached fields from wiki_model.js, so this function can
// stay allocation-light while the user is typing.
export function scorePage(page, tokenRegexes, phrase) {
	let score = 0
	for (const regex of tokenRegexes) {
		if (regex.test(page.titleL)) score += SEARCH_WEIGHTS.title
		if (regex.test(page.tagsL)) score += SEARCH_WEIGHTS.tag
		if (regex.test(page.bodyL)) score += SEARCH_WEIGHTS.body
	}
	if (phrase) {
		if (page.titleL.includes(phrase)) score += SEARCH_WEIGHTS.phraseTitle
		else if (page.bodyL.includes(phrase)) score += SEARCH_WEIGHTS.phraseBody
	}
	return score
}

// Score one parsed heading section.
//
// Section scores are used only for ordering section links under the page result;
// the page result still owns the primary ranking.
export function scoreSection(section, tokenRegexes, phrase) {
	const secTitle = section.txt.toLowerCase()
	const secBody = section.body.toLowerCase()
	let score = 0
	for (const regex of tokenRegexes) {
		if (regex.test(secTitle)) score += SEARCH_WEIGHTS.secTitle
		if (regex.test(secBody)) score += SEARCH_WEIGHTS.secBody
	}
	if (phrase && (secTitle.includes(phrase) || secBody.includes(phrase)))
		score += 1
	return score
}

// Find the sections in one page that contain every query token.
//
// A section can match by heading text or by body text because section.search was
// prepared as "heading + body" during bundle parsing.
export function matchSections(page, tokens, tokenRegexes, phrase) {
	return page.sections
		.filter(section =>
			tokens.every(token => section.search.includes(token))
		)
		.map(section => ({
			sec: section,
			s: scoreSection(section, tokenRegexes, phrase)
		}))
		.sort((left, right) => right.s - left.s)
}

// Search all pages and return sorted page matches.
//
// This pure function does not know about DOM, routes, or localization. The
// caller supplies folder detection and title sorting so the same scoring policy
// can be reused from tests and the sidebar UI.
export function findSearchMatches(
	pages,
	query,
	{
		isSimpleFolderPage = page => !!page?.isSimpleFolder,
		comparePagesByTitle = (left, right) =>
			String(left.title || '').localeCompare(String(right.title || ''))
	} = {}
) {
	const tokens = getTokens(query)
	// Too-short or empty queries produce no results instead of a "match all".
	if (!tokens.length) return { tokens, matches: [] }
	const phrase = tokens.length > 1 ? (query || '').trim().toLowerCase() : null
	const tokenRegexes = tokenRegexesFor(tokens)
	const matches = []

	for (const page of pages) {
		// Folder-only pages are navigation labels, not searchable article hits.
		if (isSimpleFolderPage(page)) continue
		// Fast all-token filter before doing section/regex scoring.
		if (!tokens.every(token => page.searchStr.includes(token))) continue
		const matchedSecs = matchSections(page, tokens, tokenRegexes, phrase)
		matches.push({
			p: page,
			matchedSecs,
			score:
				scorePage(page, tokenRegexes, phrase) +
				Math.min(SEARCH_WEIGHTS.secCountCap, matchedSecs.length)
		})
	}

	matches.sort(
		(left, right) =>
			// Score first; title sort gives deterministic ordering for ties.
			right.score - left.score || comparePagesByTitle(left.p, right.p)
	)
	return { tokens, matches }
}
