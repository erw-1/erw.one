/*
 * Shared article/preview rendering, native section folding, and anchor
 * navigation helpers.
 *
 * This file is used for two related surfaces:
 * - the main article area (#content)
 * - smaller preview surfaces that render page snippets
 *
 * The core flow is:
 * 1. markdown -> HTML
 * 2. generated ids on headings
 * 3. optional page metadata/nav slots/scripts
 * 4. DOM enhancement pipeline
 * 5. optional anchor reveal/scroll
 */
import { DOC, $, ALLOW_JS_FROM_MD, CONTENT_SEL, NAV_SLOT_IDS, el, markOnce, onClosest } from '../core/runtime.js'
import { t } from '../core/i18n.js'
import { ensureKatex } from '../core/loaders.js'
import { annotateGlossaryTerms, wireGlossaryTerms } from './glossary.js'
import { wireMediaLightbox } from './lightbox.js'
import { ensureMarkdown, renderMermaidLazy } from './markdown_runtime.js'
import { expandPageDirectives } from './directives.js'
import { renderRelatedPages, renderSiblingNav, renderToc } from '../shell/nav.js'
import { mountQueryGraphs } from '../graph/graph.js'
import { isSimpleFolderPage, wikiStore } from '../wiki.js'
import {
	assignGeneratedHeadingIds,
	getUpdatedMeta,
	hasMathMarkers,
	headingLevel,
	revealSectionForAnchor,
	setupSectionFolding
} from './render_helpers.js'
import { annotatePreviewableLinks, cleanupRootObservers, decorateExternalLinks, decorateImages, decorateTables, decorateHeadings,
	    decorateCodeBlocks, highlightVisibleCode, normalizeAnchors, renderMathSafe, resolveAssetPaths,
	    runInlineScripts, trackRootObserver } from './decorators.js'

// Convert one wiki page's markdown content into HTML with heading ids.
async function getPageHtml(page) {
	// Markdown parser is lazy-loaded so startup does not pay for it before the
	// first page render.
	const { parse } = await ensureMarkdown()
	const html = parse(expandPageDirectives(
		page,
		wikiStore.pages,
		target => !isSimpleFolderPage(target)
	))
	// Use a temporary container so ids can be assigned before the real article
	// DOM is replaced.
	const container = DOC.createElement('div')
	container.innerHTML = html
	assignGeneratedHeadingIds(container)
	return container.innerHTML
}

// Insert the optional "last updated" row into a rendered page.
//
// It appears just after the first leading heading when the page starts with a
// heading, otherwise it appears at the top of the content.
function renderPageMeta(root, page) {
	const updated = getUpdatedMeta(page)
	// Pages without updated metadata do not get an empty meta row.
	if (!updated) return
	const meta = el(
		'div',
		{ class: 'page-meta', 'aria-label': t('meta.aria') },
		[
			// Static localized label, such as "Last updated".
			el('span', { class: 'page-meta-label', textContent: t('meta.lastUpdated')}),
			// Machine-readable datetime is added only when we have a parseable
			// machine value. Plain text dates omit dateTime.
			el('time', { class: 'page-meta-value', ...(updated.machine ? { dateTime: updated.machine } : {}), textContent: updated.label }),
			...(updated.comment	? [
						// Optional comment, for example "Update 43".
						el('span', { class: 'page-meta-sep', textContent: '-' }),
						el('span', { class: 'page-meta-comment', textContent: updated.comment })
			] : [])
		]
	)
	// Find the first rendered heading among direct children.
	const lead = Array.from(root.children).find(node =>
		headingLevel(node)
	)
	
	// If the first element is a heading, put metadata after it so the title stays
	// visually first. Otherwise prepend metadata at the very top.
	if (lead && lead === root.firstElementChild) lead.after(meta)
	else root.prepend(meta)
}

// Ensure article navigation slots exist at the bottom of the content root.
//
// renderPage() later fills these slots through nav.js. Previews can skip this so
// they do not show full-page navigation chrome.
function ensureContentSlots(root) {
	NAV_SLOT_IDS.forEach(id => {
		// Do not duplicate slots if the markdown already included them or if a
		// render path calls this twice.
		if ($('#' + id, root)) return
		root.append(el('div', { id, class: id }))
	})
}

// Prepare a root before writing new rendered HTML into it.
function prepareSurfaceRoot(root) {
	cleanupRootObservers(root)
	root.dataset.mathRendered = '0'
}

// Apply optional full-page chrome after HTML is written.
function applySurfaceChrome(
	root,
	page,
	{ addMeta = false, addNavSlots = false, allowScripts = false } = {}
) {
	if (addMeta) renderPageMeta(root, page)
	if (addNavSlots) ensureContentSlots(root)
	if (allowScripts) runInlineScripts(root)
}

// Reveal the requested anchor only when the render is still current.
function revealCurrentAnchor(root, anchor, isCurrentToken) {
	if (!isCurrentToken()) return false
	if (anchor) revealSectionForAnchor(anchor, root)
	return true
}

// Lazy-load and render math for a page.
//
// KaTeX is loaded only when the raw markdown contains math-looking markers and
// the content root actually gets near the viewport.
function queueMath(root, page) {
	// Fast skip for pages without math markers.
	if (!hasMathMarkers(page?.content || '')) return
	trackRootObserver(
		new IntersectionObserver(
			(entries, observer) => {
				// Wait until at least one observed entry is near/inside the viewport.
				if (!entries.some(entry => entry.isIntersecting)) return
				// Load KaTeX, then render math in this root.
				ensureKatex().then(() => renderMathSafe(root))
				// One render is enough for this root.
				observer.disconnect()
			},
			// Start a little before the user reaches the content.
			{ rootMargin: '200px 0px', threshold: 0 }
		),
		root
	).observe(root)
}

// Reveal Discord-style ||inline spoilers|| once, then leave their contents interactive.
function wireInlineSpoilers(root) {
	if (!markOnce(root, 'inlineSpoilersWired')) return
	const reveal = (event, spoiler) => {
		if (spoiler.classList.contains('is-revealed')) return
		if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return
		event.preventDefault()
		spoiler.classList.add('is-revealed')
		spoiler.setAttribute('aria-expanded', 'true')
	}
	onClosest(root, 'click', '.md-inline-spoiler', reveal)
	onClosest(root, 'keydown', '.md-inline-spoiler', reveal)
}

// Keep emoji shortcodes readable if a Twemoji or embedded custom image cannot load.
function wireEmojiFallbacks(root) {
	const replaceWithText = image =>
		image.closest('.km-emoji-box')?.replaceWith(DOC.createTextNode(image.alt))

	root.querySelectorAll('img.km-emoji').forEach(image => {
		image.addEventListener('error', () => replaceWithText(image), { once: true })
		if (image.complete && !image.naturalWidth) replaceWithText(image)
	})
}

// Scroll the main document/content area back to the top.
//
// Both document scrolling and #content scrolling are reset because the layout
// can use either depending on viewport/CSS state.
export function resetScrollTop() {
	;(document.scrollingElement || document.documentElement).scrollTop = 0
	document.getElementById('content')?.scrollTo(0, 0)
}

// Reveal and scroll to a heading/anchor inside the current article.
export function scrollToAnchor(anchor, page, containerEl = $(CONTENT_SEL)) {
	// Empty anchor means "page top", handled elsewhere.
	if (!anchor) return
	// Prefer a target inside the current content container. Fall back to document
	// lookup for legacy/edge anchors outside #content.
	const target = revealSectionForAnchor(anchor, containerEl || DOC) || DOC.getElementById(anchor)
	// Smooth scroll is used for same-page anchor navigation.
	if (target) target.scrollIntoView({ behavior: 'smooth' })
}

// Ordered DOM enhancement pipeline.
//
// Each step receives the rendered root and page. Some steps are synchronous and
// some are async/lazy. Keeping them in a list makes renderSurface() easy to read
// and makes the visible order of enhancements explicit.
const ENHANCEMENT_PIPELINE = [
	// Resolve custom image extensions and keep failed emoji readable.
	root => wireEmojiFallbacks(root),
	// External links get target/rel treatment.
	(root, page) => decorateExternalLinks(root),
	// Internal markdown links are normalized to KM hash routes.
	(root, page) => normalizeAnchors(root, page),
	// Preview annotations are optional because preview surfaces should not always
	// create previews inside previews.
	(root, page, options) => {	if (options.previewLinks) annotatePreviewableLinks(root, page) },
	// Content-relative asset paths, before anything starts loading them.
	root => resolveAssetPaths(root),
	// Image wrappers/classes and lightbox-friendly metadata.
	root => decorateImages(root),
	// Responsive table wrappers and table styling hooks.
	root => decorateTables(root),
	// Heading link/fold affordances.
	root => decorateHeadings(root),
	// Code block copy buttons/language labels.
	root => decorateCodeBlocks(root),
	// Lazy code highlighting observer.
	root => highlightVisibleCode(root),
	// Native <details> folding for h2+ sections. This happens after heading
	// decoration so the heading content is already prepared before wrapping.
	root => setupSectionFolding(root),
	// Inline spoilers use one delegated click/keyboard handler per render root.
	root => wireInlineSpoilers(root),
	// Glossary annotations need the final text/link structure.
	(root, page) => annotateGlossaryTerms(page, root),
	// Glossary popover/click behavior for annotated terms.
	root => wireGlossaryTerms(root),
	// Mermaid diagrams render lazily after markdown created their containers.
	root => renderMermaidLazy(root),
	// Query graphs reuse the graph scene with only the matched pages and links.
	async (root, page) => trackRootObserver(await mountQueryGraphs(root, page), root),
	// Media lightbox behavior after images/media are decorated.
	root => wireMediaLightbox(root),
	// Math rendering is queued last because it may lazy-load KaTeX.
	(root, page) => queueMath(root, page)
]

// Run all enhancement steps for one rendered surface.
async function enhanceSurface(root, page, { previewLinks = true } = {}) {
	const options = { previewLinks }
	for (const step of ENHANCEMENT_PIPELINE) {
		// Await each step so later steps see the DOM shape created by earlier
		// steps.
		await step(root, page, options)
	}
}

// Render a page into any root element.
//
// This is the shared renderer for full articles and previews. Options decide
// which full-page features are included.
export async function renderSurface({
	// DOM element to render into. Defaults to the main content area.
	root = $(CONTENT_SEL),
	// Wiki page object to render.
	page,
	// Optional heading id to reveal after rendering.
	anchor = '',
	// Whether to insert the page updated metadata row.
	addMeta = false,
	// Whether to append prev/next/related navigation slots.
	addNavSlots = false,
	// Whether scripts from markdown are allowed to run. This is intentionally
	// controlled by config because this app is for trusted/power-user content.
	allowScripts = false,
	// Whether internal links should get hover/click preview behavior.
	previewLinks = true,
	// Router-provided stale-render guard. It returns false when a newer route has
	// started while this async render was working.
	isCurrentToken = () => true
} = {}) {
	// No target root or article means nothing can be rendered. The route and
	// preview parsers filter simple folders too; this keeps direct callers safe.
	if (!root || isSimpleFolderPage(page)) return false
	// Remove observers attached to the previous content in this root. This avoids
	// old lazy highlighters/math observers running against replaced DOM.
	prepareSurfaceRoot(root)
	const html = await getPageHtml(page)
	// If the route changed while markdown was loading/parsing, stop before
	// replacing the DOM with stale content.
	if (!isCurrentToken()) return false
	root.innerHTML = html
	applySurfaceChrome(root, page, {
		addMeta,
		addNavSlots,
		allowScripts
	})
	await enhanceSurface(root, page, { previewLinks })
	// Enhancement can be async too. Check again before revealing anchors or
	// telling the router this render succeeded.
	return revealCurrentAnchor(root, anchor, isCurrentToken)
}

// Render the main article page and refresh full-page navigation.
export async function renderPage(
	page, anchor,
	{ isCurrentToken = () => true } = {}
) {
	const article = $(CONTENT_SEL)
	// No article host means the route cannot render.
	if (!article) return false
	
	const rendered = await renderSurface({
		root: article,
		page,
		anchor,
		addMeta: true,
		addNavSlots: true,
		allowScripts: ALLOW_JS_FROM_MD === 'true',
		previewLinks: true,
		isCurrentToken
	})
	// renderSurface() returns false when the render was cancelled/stale.
	if (!rendered) return false
	// The main article has now been replaced, so rebuild dependent UI from the
	// new DOM/model.
	renderToc(page)
	renderSiblingNav(page)
	renderRelatedPages(page)

	if (anchor) {
		// Anchor route: scroll to the revealed heading.
		scrollToAnchor(anchor, page, article)
	} else {
		// Page route without anchor: reset to top after layout settles.
		requestAnimationFrame(() => {
			// Do not scroll if a newer route started before this frame.
			if (isCurrentToken()) resetScrollTop()
		})
	}
	return true
}
