/*
 * Stateless DOM decorators used after markdown is rendered: links, copy buttons,
 * syntax highlighting, table wrappers, and math/code action chrome.
 *
 * A decorator takes already-rendered HTML and adds small behavior/styling hooks
 * without owning page routing or markdown parsing. Most functions are safe to
 * call more than once because rendered content can appear in the article,
 * previews, or lightboxes.
 */
import { ASSET_BASE, DOC, $, $$, el, CONTENT_SEL, HASH_LINK_SEL, HEADINGS_SEL, baseURLNoHash, markOnce, onClosest, queryById } from '../core/runtime.js'
import { resolveAssetURL } from './media.js'
import { t } from '../core/i18n.js'
import { ensureHighlight, ensureHLJSTheme } from '../core/loaders.js'
import { isInternalPageLink } from '../shell/routes.js'

// Observers are tracked per rendered root so article and preview cleanup stay isolated.
const OBS_BY_ROOT = new WeakMap()

// Minimal inline SVG paths used for action buttons.
//
// Keeping only path data here avoids requiring an icon runtime for tiny copy/link
// buttons inside content.
const ICONS = {
	link: 'M3.9 12c0-1.7 1.4-3.1 3.1-3.1h5.4v-2H7c-2.8 0-5 2.2-5 5s2.2 5 5 5h5.4v-2H7c-1.7 0-3.1-1.4-3.1-3.1zm5.4 1h6.4v-2H9.3v2zm9.7-8h-5.4v2H19c1.7 0 3.1 1.4 3.1 3.1s-1.4 3.1-3.1 3.1h-5.4v2H19c2.8 0 5-2.2 5-5s-2.2-5-5-5z',
	copy: 'M19,21H5c-1.1,0-2-0.9-2-2V7h2v12h14V21zM21,3H9C7.9,3,7,3.9,7,5v12c0,1.1,0.9,2,2,2h12c2.2,0,2-2,2-2V5C23,3.9,22.1,3,21,3zM21,17H9V5h12V17z'
}

// Read the declared language from Marked/Highlight.js classes.
//
// Markdown fences such as ```javascript render as code.language-javascript.
// Keeping this in one helper lets the label UI and the highlighter agree.
const getCodeLanguage = code =>
	code?.className?.match(/\blanguage-([\w-]+)/)?.[1] || ''

// Register an observer so it can be disconnected when a render root is replaced.
//
// render.js calls cleanupRootObservers(root) before writing new HTML. That
// prevents old lazy highlighter/math observers from watching nodes that no
// longer exist.
export function trackRootObserver(observer, root = DOC) {
	// If a caller passes null or a non-observer, return it unchanged. This keeps
	// calling code simple and avoids throwing during optional feature setup.
	if (!observer || typeof observer.disconnect !== 'function') return observer
	const set = OBS_BY_ROOT.get(root) || new Set()
	set.add(observer)
	OBS_BY_ROOT.set(root, set)
	return observer
}

// Disconnect every observer associated with one render root.
export function cleanupRootObservers(root = DOC) {
	const set = OBS_BY_ROOT.get(root)
	// Nothing was registered for this root.
	if (!set) return
	for (const observer of set) {
		// Observer cleanup should never break page rendering.
		try { observer.disconnect?.() } catch (_) {}
	}
	// Keep the Set object but empty it so repeated cleanup is harmless.
	set.clear()
}

// Decorate external http(s) links so they open safely in a new tab.
export function decorateExternalLinks(containerEl = DOC) {
	$$('a[href^="http"]', containerEl).forEach(anchor => {
		try {
			// Resolve relative/absolute URL against the current page.
			const url = new URL(anchor.href, location.href)

			// Same-origin links are treated as normal local navigation.
			if (url.origin === location.origin) return

			// External links open in a new tab/window.
			anchor.target = '_blank'
			const rel = (anchor.getAttribute('rel') || '').split(/\s+/)

			// Security/privacy flags for target=_blank.
			if (!rel.includes('noopener'))   rel.push('noopener')
			if (!rel.includes('noreferrer')) rel.push('noreferrer')

			anchor.setAttribute('rel', rel.join(' ').trim())
		} catch (_) {}
	})
}

// Add loading hints to images inside rendered markdown.
// Point content-relative asset paths at the site root.
//
// A no-op on a published site, where ASSET_BASE is empty. Editor previews render
// from their own folder and set it to the KM root so `assets/clip.webm` in
// markdown resolves the same way it will once published.
export function resolveAssetPaths(container = DOC) {
	if (!ASSET_BASE) return
	$$('img:not(.km-emoji), video, audio, source', container).forEach(node => {
		const src = node.getAttribute('src')
		const resolved = resolveAssetURL(src, ASSET_BASE)
		// Only touch paths the base actually changes.
		if (resolved !== src) node.setAttribute('src', resolved)
	})
}

export function decorateImages(container = DOC) {
	$$('img:not(.km-emoji)', container).forEach((img, index) => {
		// Lazy-load images so long wiki pages do not load every image at once.
		img.loading  = 'lazy'
		// Let the browser decode images off the main rendering path when possible.
		img.decoding = 'async'
		// The first couple of images are likely to be near the top of the page, so
		// give them higher priority unless the author already chose a priority.
		if (!img.hasAttribute('fetchpriority') && index < 2)
			 img.setAttribute('fetchpriority', 'high')
	})
}

// Convert local heading-only links into full KM hash links.
//
// Markdown authors can write [go](#1_2). After rendering page "drones#intro",
// this becomes #drones#intro#1_2 so the router can preserve the page context.
export function normalizeAnchors(container = $(CONTENT_SEL), page) {
	// Small fixtures/previews may not have a container.
	if (!container) return
	
	const base = page?.hash || ''
	$$(HASH_LINK_SEL, container).forEach(anchor => {
		const anchorId = (anchor.getAttribute('href') || '').slice(1)
		// Empty hashes or hashes that already contain route separators are left
		// alone.
		if  (!anchorId || anchorId.includes('#')) return
		// Only normalize anchors that exist in this rendered container. External
		// fragment links or author-defined unusual hashes stay untouched.
		if (!queryById(container, anchorId)) return
		anchor.setAttribute('href', `#${base ? `${base}#` : ''}${anchorId}`)
	})
}

// Mark internal KM links as previewable.
//
// previews.js listens for the buttons added beside valid internal links and
// opens a preview only when one is clicked.
export function annotatePreviewableLinks(container = $(CONTENT_SEL), page = null) {
	if (!container) return

	container.querySelectorAll(HASH_LINK_SEL).forEach(anchor => {
		// Only valid internal KM routes get previews.
		if (!isInternalPageLink(anchor, { currentPage: page, containerEl: container })) return
		if (anchor.parentElement?.classList.contains('km-preview-trigger')) return

		anchor.classList.add('km-has-preview')
		const label = t('preview.open')
		const button = el('button', {
			type: 'button',
			class: 'km-preview-button',
			title: label,
			'aria-label': label,
			'aria-haspopup': 'dialog',
			innerHTML: '<span aria-hidden="true">&#x1F441;</span>'
		})
		const card = anchor.matches('.km-query-card-link') ? anchor.parentElement : null
		const host = card || el('span')
		host.classList.add('km-preview-trigger')
		if (card) {
			anchor.append(el('span', {
				class: 'km-query-card-arrow',
				title: t('preview.openPage'),
				'aria-hidden': 'true'
			}))
			host.append(button)
		}
		else {
			anchor.before(host)
			host.append(anchor, button)
		}
	})
}

// Lazily syntax-highlight code blocks when they approach the viewport.
export async function highlightVisibleCode(root = DOC) {
	const blocks = [...root.querySelectorAll('pre code')]
	// No code blocks means no need to load Highlight.js.
	if  (!blocks.length) return
	const [hljs] = await Promise.all([ensureHighlight(), ensureHLJSTheme()])

	// The language label should immediately tell authors when a fence asks for a
	// grammar that is not loaded. The code still renders as plain text, but the
	// small warning points to the missing LANGS/config entry.
	const markMissingLanguage = code => {
		const language = getCodeLanguage(code)
		const pre = code.closest('pre')
		const missing = !!(language && !hljs.getLanguage(language))
		pre?.classList.toggle('km-code-missing-lang', missing)

		const label = pre?.querySelector('.lang')
		if (!label) return missing
		let note = label.querySelector('.lang-missing')
		if (!missing) {
			note?.remove()
			return false
		}
		if (!note) {
			note = el('span', {
				class: 'lang-missing',
				title: 'Add this language to LANGS to enable syntax highlighting.',
				textContent: ' (Lang not loaded, add it in the html config)'
			})
			label.append(note)
		}
		return true
	}

	blocks.forEach(markMissingLanguage)

	// Highlight.js work is deferred until blocks approach the viewport.
	const observer = trackRootObserver(
		new IntersectionObserver(
			(entries, currentObserver) => {
				for (const entry of entries) {
					// Ignore blocks that are still far away.
					if (!entry.isIntersecting) continue
					const node = entry.target

					if  (!node.dataset.hlDone) {
						// Unknown/unloaded languages stay as plain text. Calling
						// Highlight.js with an unknown class can produce noisy console
						// warnings, so the missing-language path exits early.
						if (markMissingLanguage(node)) {
							node.dataset.hlDone = '1'
							currentObserver.unobserve(node)
							continue
						}
						// Highlight once per code node.
						hljs.highlightElement(node)
						node.dataset.hlDone = '1'
					}
					// This block is finished, so stop observing it.
					currentObserver.unobserve(node)
				}
			},
			// Start highlighting shortly before the user reaches the block.
			{ rootMargin: '200px 0px', threshold: 0 }
		),
		root
	)

	blocks.forEach(node => {
		// Already-highlighted nodes do not need observation.
		if (!node.dataset.hlDone) observer.observe(node)
	})
}

// Re-execute inline scripts that were inserted through innerHTML.
//
// Browsers do not run <script> tags added by setting innerHTML. Replacing each
// script element with a newly-created script element triggers execution. This is
// intentionally gated by render.js using ALLOW_JS_FROM_MD.
export function runInlineScripts(root) {
	root.querySelectorAll('script').forEach(oldScript => {
		const script = document.createElement('script')

		// Preserve attributes such as type, src, async, defer, etc.
		for (const { name, value } of [...oldScript.attributes])
			script.setAttribute(name, value)
		// Preserve inline script source.
		script.textContent = oldScript.textContent || ''

		oldScript.replaceWith(script)
	})
}

// Wrap tables in a scroll/styling container.
//
// The wrapper lets CSS handle wide tables without forcing the whole layout to
// grow or making the right-side tree jump around.
export function decorateTables(container = DOC) {
	container.querySelectorAll('table').forEach(table => {
		// Guard against duplicate wrappers when a root is enhanced more than once.
		if (table.dataset.kmTableDone === '1') return
		const parent = table.parentElement
		if (parent?.classList?.contains('km-table-wrap')) {
			// Already wrapped by previous markup/decorator work.
			table.dataset.kmTableDone = '1'
			return
		}

		const wrap = el('div', { class: 'km-table-wrap' })
		// Insert wrapper where the table currently lives, then move the table
		// inside it.
		table.before(wrap)
		wrap.append(table)
		table.dataset.kmTableDone = '1'
	})
}

// Build the class string for a small content action button.
//
// Copy-like buttons get a shared km-copy-btn class so CSS can flash/position all
// copy controls consistently.
const buttonClasses = (className = '') => {
	const classes = ['km-action-btn', className]
	if (/\b(?:heading-copy|code-copy|math-copy)\b/.test(className))
		classes.push('km-copy-btn')
	return classes.join(' ').trim()
}

// Create one icon-only action button.
//
// Used for heading deep-link copy, code copy, and math source copy. The title is
// both tooltip text and aria-label.
function createIconButton(title, path, className, onClick) {
	return el('button', {
		type: 'button',
		class: buttonClasses(className),
		title,
		'aria-label': title,
		// Some buttons use delegated click handling instead of direct onclick.
		...(onClick && { onclick: onClick }),
		// Path data is controlled by this module, not markdown content.
		innerHTML: `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${path}"></path></svg>`
	})
}

// Copy text to the clipboard and briefly flash the button.
//
// Uses navigator.clipboard when available, then falls back to the old hidden
// textarea + execCommand path for local-file or older-browser contexts.
async function copyText(text, button) {
	try {
		await navigator.clipboard.writeText(text)
	} catch {
		// Fallback: create an offscreen textarea containing the text to copy.
		const textarea = DOC.createElement('textarea')
		textarea.value = text
		textarea.style.position = 'fixed'
		textarea.style.left = '-9999px'
		DOC.body.appendChild(textarea)
		textarea.select()
		// Ignore fallback failure; the UI still should not crash.
		try { document.execCommand('copy') } catch (_) {}
		textarea.remove()
	} finally {
		// Flash only when there is a visible button to animate.
		if (!button) return
		button.classList.add('flash')
		setTimeout(() => button.classList.remove('flash'), 300)
	}
}

// Build the copied deep link for a heading copy button.
function getHeadingCopyText(button, getBaseUrl, getFallbackBaseUrl) {
	const heading = button.closest('h1, h2, h3, h4, h5, h6')
	if (!heading) return ''
	return (getBaseUrl() || getFallbackBaseUrl()) + heading.id
}

// Build the copied source for a code copy button.
function getCodeCopyText(button) {
	const pre = button.closest('pre')
	const code = pre?.querySelector('code')
	return code
		? code.innerText ?? code.textContent ?? ''
		: pre?.innerText ?? pre?.textContent ?? ''
}

// Return the text requested by a content copy button.
function getCopyButtonText(
	button,
	{
		getBaseUrl,
		getFallbackBaseUrl,
		getMathSource
	} = {}
) {
	if (!button) return ''
	if (button.classList.contains('heading-copy'))
		return getHeadingCopyText(button, getBaseUrl, getFallbackBaseUrl)
	if (button.classList.contains('math-copy'))
		return getMathSource?.(button.closest('.katex-display')) || ''
	return getCodeCopyText(button)
}

// Add a copy-deep-link button to each rendered heading.
export function decorateHeadings(container = DOC) {
	container.querySelectorAll(HEADINGS_SEL).forEach(heading => {
		// Only decorate each heading once.
		if (!markOnce(heading, 'kmHeadDone')) return
		// Host class lets CSS reserve/position the heading tools.
		heading.classList.add('km-heading-host')
		const copyButton = createIconButton(
			t('copy.link'), ICONS.link, 'heading-copy'
		)
		// The actual click behavior is delegated by wireCopyButtons().
		heading.append(
			el('span', { class: 'heading-tools km-copy-host' }, copyButton)
		)
	})
}

// Add language label and copy button chrome to each code block.
export function decorateCodeBlocks(container = DOC) {
	container.querySelectorAll('pre').forEach(pre => {
		// Only decorate each pre once.
		if (!markOnce(pre, 'kmCodeDone')) return
		pre.classList.add('km-code-host')

		const code = pre.querySelector('code')
		// Header sits inside the pre and contains the language label plus copy
		// button.
		const header = el( 'div', { class: 'code-tools km-copy-host' },
			createIconButton(t('copy.code'), ICONS.copy, 'code-copy')
		)

		// Marked/Highlight.js commonly uses classes like language-js.
		const language = getCodeLanguage(code)
		// Show language label only when one exists.
		if (language) header.prepend(el('span', { class: 'lang', textContent: language }))
		pre.prepend(header)
	})
}

// Read original TeX source for a rendered display math block.
//
// KaTeX stores original TeX in an annotation element. The copy button should use
// that source, not the visible HTML/SVG-ish rendered output.
function getDisplayMathSource(display) {
	if (!display) return ''
	const cached = display.dataset.kmMathSource || ''
	
	// Cache after the first lookup so repeated copy clicks are cheap.
	if (cached) return cached
	const annotation = display.querySelector(
		'annotation[encoding="application/x-tex"]'
	)
	const source = annotation?.textContent?.trim() || ''
	// Store only non-empty source.
	if (source) display.dataset.kmMathSource = source
	return source
}

// Add copy buttons to display math blocks after KaTeX renders them.
function decorateMathBlocks(container = DOC) {
	container.querySelectorAll('.katex-display').forEach(display => {
		// Only decorate each display block once.
		if (display.dataset.kmMathDone === '1') return
		// Without recoverable TeX source, a copy button would be misleading.
		if (!getDisplayMathSource(display)) return
		
		display.dataset.kmMathDone = '1'
		display.classList.add('km-copy-host')
		display.append(createIconButton(t('copy.math'), ICONS.copy, 'math-copy'))
	})
}

// Render math inside a container with KaTeX auto-render, then add math copy UI.
export function renderMathSafe(container = DOC) {
	try {
		// Missing container or already-rendered container: nothing to do.
		if (!container || container.dataset.mathRendered === '1') return
		// KaTeX auto-render has not loaded yet.
		if (typeof window.renderMathInElement !== 'function') return
		// Render only inside the markers KM's own tokenizer emitted. Auto-render
		// looks for bare $ pairs in text and does not share that tokenizer's "no
		// digit after $" guard, so turning it loose on the whole article rewrites
		// ordinary prose: a line mentioning $5 and $10 becomes one math span.
		for (const host of container.querySelectorAll('.km-math-source'))
			window.renderMathInElement(host, {
				delimiters: [
					// Display math.
					{ left: '$$', right: '$$', display: true },
					{ left: '\\[', right: '\\]', display: true },
					// Inline math.
					{ left: '$', right: '$', display: false },
					{ left: '\\(', right: '\\)', display: false }
				]
			})
		decorateMathBlocks(container)
		// Prevent duplicate KaTeX rendering for this root.
		container.dataset.mathRendered = '1'
	} catch (_) {}
}

// Delegate copy-button clicks inside one rendered root.
//
// `getBaseUrl` returns the page deep-link prefix used for heading links. The
// main article and previews pass different functions because copied links should
// point to the real page, not necessarily the preview DOM.
export function wireCopyButtons(root, getBaseUrl) {
	if (!root) return
	onClosest(root, 'click', 'button.heading-copy, button.code-copy, button.math-copy',
		(event, button) => {
			// Copy buttons are chrome, not article navigation/folding clicks.
			event.preventDefault()
			event.stopPropagation()
			const text = getCopyButtonText(button, {
				getBaseUrl,
				getFallbackBaseUrl: () => baseURLNoHash() + '#',
				getMathSource: getDisplayMathSource
			})
			if (text) copyText(text, button)
		}
	)
}
