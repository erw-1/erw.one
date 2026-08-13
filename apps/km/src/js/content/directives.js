const FENCE_RE = /^\s*(```|~~~)/
const TRANSCLUSION_RE = /!\[\[([^\]\n]+)\]\]/g
const QUERY_RE = /^\s*\{\{pages\b([^}]*)\}\}\s*$/

const clean = value => String(value ?? '').trim()
const routeFor = page => '#' + (page?.hash || '')
const markdownCell = value => clean(value).replace(/\|/g, '\\|')
const tagsOf = page => clean(page?.tags).split(',').map(clean).filter(Boolean)
const isSimpleFolder = page => !!(
	page?.isSimpleFolder || (page?.kind === 'simple' && !clean(page.content))
)
const escapeHtml = value => clean(value)
	.replace(/&/g, '&amp;')
	.replace(/</g, '&lt;')
	.replace(/>/g, '&gt;')
	.replace(/"/g, '&quot;')

export function parseQueryOptions(source = '') {
	const options = {}
	for (const match of source.matchAll(/(\w+)\s*=\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+))/g)) {
		const quoted = match[2] ?? match[3]
		const value = quoted == null
			? match[4] ?? ''
			: quoted.replace(/\\(["'\\])/g, '$1')
		options[match[1].toLowerCase()] = value
	}
	return options
}

const QUERY_OPTION_ORDER = ['tag', 'parent', 'trail', 'text', 'current', 'sort', 'limit', 'empty', 'view']
const QUERY_OPTION_SET = new Set(QUERY_OPTION_ORDER)
const QUERY_TOKEN_RE = /(\w+)\s*=\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+))/g

export function serializePageQuery(options = {}) {
	const values = QUERY_OPTION_ORDER.flatMap(key => {
		const value = clean(options[key])
		return value ? [`${key}=${JSON.stringify(value)}`] : []
	})
	return `{{pages${values.length ? ` ${values.join(' ')}` : ''}}}`
}

export function pageQueryAtCursor(source, cursor = 0) {
	const text = String(source ?? '')
	const safeCursor = Math.max(0, Math.min(text.length, Number(cursor) || 0))
	const start = text.lastIndexOf('\n', Math.max(0, safeCursor - 1)) + 1
	const nextBreak = text.indexOf('\n', safeCursor)
	const end = nextBreak < 0 ? text.length : nextBreak
	const match = QUERY_RE.exec(text.slice(start, end))
	return match ? { start, end, options: parseQueryOptions(match[1]) } : null
}

function queryOptionProblems(source) {
	const problems = []
	const seen = new Set()
	let cursor = 0
	for (const match of source.matchAll(QUERY_TOKEN_RE)) {
		if (source.slice(cursor, match.index).trim()) problems.push('malformed syntax')
		cursor = match.index + match[0].length
		const key = match[1].toLowerCase()
		if (!QUERY_OPTION_SET.has(key)) problems.push(`unknown option "${key}"`)
		if (seen.has(key)) problems.push(`duplicate option "${key}"`)
		seen.add(key)
		if (match[4]?.startsWith('"') || match[4]?.startsWith("'")) problems.push(`unclosed quote for "${key}"`)
	}
	if (source.slice(cursor).trim()) problems.push('malformed syntax')
	const options = parseQueryOptions(source)
	if (options.view && !['list', 'cards', 'table', 'timeline', 'graph'].includes(options.view))
		problems.push(`invalid view "${options.view}"`)
	if (options.sort && !['title', 'updated'].includes(options.sort))
		problems.push(`invalid sort "${options.sort}"`)
	if (options.current && options.current !== 'false')
		problems.push(`invalid current value "${options.current}"`)
	if (options.limit && !/^[1-9]\d*$/.test(options.limit))
		problems.push(`invalid limit "${options.limit}"`)
	return { options, problems: [...new Set(problems)] }
}

function headingKey(value) {
	return clean(value)
		.toLocaleLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()
}

export function extractSectionMarkdown(content, selector) {
	const wanted = headingKey(selector)
	const lines = String(content ?? '').split(/\r?\n/)
	const counters = [0, 0, 0, 0, 0, 0]
	let inFence = false
	let start = -1
	let level = 0
	let anchor = ''

	for (let index = 0; index < lines.length; index++) {
		if (FENCE_RE.test(lines[index])) inFence = !inFence
		if (inFence) continue
		const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(lines[index])
		if (!match) continue
		const nextLevel = match[1].length
		counters[nextLevel - 1]++
		for (let i = nextLevel; i < counters.length; i++) counters[i] = 0
		const nextAnchor = counters.slice(0, nextLevel).filter(Boolean).join('_')
		if (start >= 0 && nextLevel <= level)
			return { body: lines.slice(start + 1, index).join('\n').trim(), anchor, line: start }
		if (nextAnchor === selector || headingKey(match[2]) === wanted) {
			start = index
			level = nextLevel
			anchor = nextAnchor
		}
	}
	return start >= 0
		? { body: lines.slice(start + 1).join('\n').trim(), anchor, line: start }
		: null
}

function queryPages(options, pages, currentPage) {
	let matches = pages.filter(page => page.content?.trim())
	if (options.tag) {
		const tag = options.tag.toLocaleLowerCase()
		matches = matches.filter(page =>
			tagsOf(page).some(value => value.toLocaleLowerCase() === tag)
		)
	}
	if (options.parent) matches = matches.filter(page => page.parentId === options.parent)
	if (options.trail) matches = matches.filter(page =>
		clean(page.trail).split(',').map(clean).includes(options.trail)
	)
	if (options.text) {
		const text = options.text.toLocaleLowerCase()
		matches = matches.filter(page => page.searchStr?.includes(text))
	}
	if (options.current === 'false') matches = matches.filter(page => page !== currentPage)

	if (options.sort === 'title')
		matches.sort((a, b) => clean(a.title).localeCompare(clean(b.title)))
	else if (options.sort === 'updated')
		matches.sort((a, b) => clean(b.updated).localeCompare(clean(a.updated)))

	const limit = Math.max(0, Number.parseInt(options.limit, 10) || matches.length)
	return matches.slice(0, limit)
}

function renderQuery(options, pages, currentPage) {
	const matches = queryPages(options, pages, currentPage)
	if (!matches.length) return options.empty || '_No matching pages._'
	const view = options.view || 'list'
	if (view === 'table') {
		return [
			'| Page | Updated | Tags |',
			'| --- | --- | --- |',
			...matches.map(page =>
				`| [${markdownCell(page.title)}](${routeFor(page)}) | ${markdownCell(page.updated)} | ${markdownCell(page.tags)} |`
			)
		].join('\n')
	}
	if (view === 'timeline')
		return matches.map(page => `- ${clean(page.updated) || 'Undated'} - [${page.title}](${routeFor(page)})`).join('\n')
	if (view === 'cards')
		return `<div class="km-query-cards">\n${matches.map(page =>
			`<div class="km-query-card"><a class="km-query-card-link" href="${routeFor(page)}"><strong>${escapeHtml(page.title)}</strong><span>${escapeHtml(tagsOf(page).join(' · ') || page.updated)}</span></a></div>`
		).join('\n')}\n</div>`
	if (view === 'graph')
		return `<div class="km-query-graph" data-pages="${escapeHtml(JSON.stringify(matches.map(page => page.id)))}"></div>`
	return matches.map(page => `- [${page.title}](${routeFor(page)})`).join('\n')
}

function quoteTransclusion(body, target, anchor, line) {
	const href = routeFor(target) + (anchor ? `#${anchor}` : '')
	const quoted = String(body || '').split('\n').map(line => `> ${line}`).join('\n')
	return `<div hidden data-km-source-page="${encodeURIComponent(target.id)}" data-km-source-line="${line}"></div>\n\n> **From [${target.title}](${href})**\n>\n${quoted}`
}

// Is `index` inside an inline code span on this line?
//
// A transclusion written between backticks is being *shown* as syntax, not
// used. Both scanners below have to agree about that: the renderer expanding
// one the validator skipped produces a page that renders a broken-pull notice
// while the Issues panel stays silent.
function isInsideInlineCode(source, index) {
	let delimiters = 0
	for (const ticks of source.slice(0, index).matchAll(/`+/g))
		if (source[ticks.index - 1] !== '\\') delimiters++
	return delimiters % 2 === 1
}

function expandContent(content, currentPage, pages, byId, stack, canTranscludePage) {
	let inFence = false
	// Named sourceLine, not line: the callback below declares its own `line` for
	// the transcluded section's line number, which would shadow this one.
	return String(content ?? '').split(/\r?\n/).map(sourceLine => {
		if (FENCE_RE.test(sourceLine)) {
			inFence = !inFence
			return sourceLine
		}
		if (inFence) return sourceLine
		const query = QUERY_RE.exec(sourceLine)
		if (query) return renderQuery(parseQueryOptions(query[1]), pages, currentPage)
		return sourceLine.replace(TRANSCLUSION_RE, (raw, rawTarget, offset) => {
			// Shown as syntax rather than used: leave it exactly as written.
			if (isInsideInlineCode(sourceLine, offset)) return raw
			const [pageId, ...sectionParts] = rawTarget.split('#')
			const target = byId.get(clean(pageId))
			if (!target) return `> **Missing transclusion:** \`${clean(pageId)}\``
			// Folder-only nodes have no article body. Preserve the authored directive
			// instead of replacing it with an empty attribution block.
			if (!canTranscludePage(target)) return raw
			if (stack.has(target.id)) return `> **Circular transclusion:** \`${target.id}\``
			const sectionName = clean(sectionParts.join('#'))
			const section = sectionName ? extractSectionMarkdown(target.content, sectionName) : null
			if (sectionName && !section)
				return `> **Missing section:** \`${target.id}#${sectionName}\``
			const source = String(target.content || '')
			const lead = /^#\s+.+\r?\n+/.exec(source)
			const body = section?.body ?? (lead ? source.slice(lead[0].length) : source)
			const line = section?.line ?? (lead ? lead[0].split(/\r?\n/).length - 1 : 0)
			const nextStack = new Set(stack).add(target.id)
			return quoteTransclusion(
				expandContent(body, target, pages, byId, nextStack, canTranscludePage),
				target,
				section?.anchor || '',
				line
			)
		})
	}).join('\n')
}

export function expandPageDirectives(page, pages = [], canTranscludePage = () => true) {
	const byId = new Map(pages.map(candidate => [candidate.id, candidate]))
	return expandContent(
		page?.content || '',
		page,
		pages,
		byId,
		new Set([page?.id]),
		canTranscludePage
	)
}

function transclusionsIn(content) {
	const matches = []
	let inFence = false
	let offset = 0
	const lines = String(content ?? '').split('\n')
	for (let line = 0; line < lines.length; line++) {
		const source = lines[line].replace(/\r$/, '')
		if (FENCE_RE.test(source)) {
			inFence = !inFence
		} else if (!inFence) {
			for (const match of source.matchAll(TRANSCLUSION_RE)) {
				if (isInsideInlineCode(source, match.index)) continue
				const [pageId, ...sectionParts] = match[1].split('#')
				matches.push({
					raw: match[0],
					pageId: clean(pageId),
					section: clean(sectionParts.join('#')),
					line,
					start: offset + match.index,
					end: offset + match.index + match[0].length
				})
			}
		}
		offset += lines[line].length + 1
	}
	return matches
}

function transclusionReaches(page, section, wantedId, byId, seen = new Set()) {
	const key = `${page.id}#${section}`
	if (seen.has(key)) return false
	seen.add(key)
	const content = section ? extractSectionMarkdown(page.content, section)?.body : page.content
	if (content == null) return false
	for (const occurrence of transclusionsIn(content)) {
		if (occurrence.pageId === wantedId) return true
		const target = byId.get(occurrence.pageId)
		if (target && transclusionReaches(target, occurrence.section, wantedId, byId, seen)) return true
	}
	return false
}

export function findDirectiveProblems(pages = []) {
	const problems = []
	const byId = new Map(pages.map(page => [page.id, page]))
	for (const page of pages) {
		let inFence = false
		let offset = 0
		const lines = String(page.content ?? '').split('\n')
		for (let line = 0; line < lines.length; line++) {
			const source = lines[line].replace(/\r$/, '')
			if (FENCE_RE.test(source)) {
				inFence = !inFence
			} else if (!inFence && /^\s*\{\{pages\b/.test(source)) {
				const exact = QUERY_RE.exec(source)
				const queryBody = exact
					? exact[1]
					: source.replace(/^\s*\{\{pages\b/, '').replace(/\}\}\s*$/, '')
				const detail = queryOptionProblems(queryBody)
				if (!exact) detail.problems = [...new Set(['malformed syntax', ...detail.problems])]
				if (detail.problems.length) problems.push({
					level: 'error',
					code: 'invalid-query',
					pageUid: page.uid,
					pageId: page.id,
					line,
					start: offset,
					end: offset + source.length,
					malformed: !exact,
					options: detail.options,
					text: `${page.title || page.id} has an invalid page query: ${detail.problems.join(', ')}.`
				})
				if (detail.options.parent && !byId.has(detail.options.parent)) problems.push({
					level: 'warning',
					code: 'query-missing-parent',
					pageUid: page.uid,
					pageId: page.id,
					line,
					start: offset,
					end: offset + source.length,
					options: detail.options,
					text: `${page.title || page.id} query references missing parent "${detail.options.parent}".`
				})
			}
			offset += lines[line].length + 1
		}

		for (const occurrence of transclusionsIn(page.content)) {
			const target = byId.get(occurrence.pageId)
			const common = {
				pageUid: page.uid,
				pageId: page.id,
				line: occurrence.line,
				start: occurrence.start,
				end: occurrence.end,
				targetId: occurrence.pageId,
				section: occurrence.section
			}
			if (!target) {
				problems.push({
					...common,
					level: 'error',
					code: 'missing-transclusion',
					text: `${page.title || page.id} transcludes missing page "${occurrence.pageId}".`
				})
				continue
			}
			if (isSimpleFolder(target)) {
				problems.push({
					...common,
					level: 'error',
					code: 'missing-transclusion',
					text: `${page.title || page.id} transcludes navigation-only folder "${target.id}".`
				})
				continue
			}
			if (occurrence.section && !extractSectionMarkdown(target.content, occurrence.section)) {
				problems.push({
					...common,
					level: 'error',
					code: 'missing-transclusion-section',
					text: `${page.title || page.id} transcludes missing section "${target.id}#${occurrence.section}".`
				})
				continue
			}
			if (target.id === page.id ||
				transclusionReaches(target, occurrence.section, page.id, byId)) problems.push({
				...common,
				level: 'error',
				code: 'circular-transclusion',
				text: `${page.title || page.id} has a circular transclusion through "${target.id}".`
			})
		}
	}
	return problems
}
