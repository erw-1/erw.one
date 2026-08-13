/*
 * Application entry point.
 *
 * This is the first project module loaded by index.html. Its job is deliberately
 * chronological and high level:
 * 1. translate the static shell
 * 2. fetch the markdown bundle from CONFIG.MD
 * 3. parse that bundle into the wiki data model
 * 4. wait until the HTML shell exists in the DOM
 * 5. render navigation and start the router
 *
 * Most real feature code lives elsewhere. app.js should stay as the readable
 * "what happens at startup?" file.
 */
import {
	loadMarkdownBundle,
	attachSecondaryRoots,
	computePageHashes
} from './wiki.js'
import { TITLE, MD, CACHE_MIN, DOC, $, CONTENT_SEL, el } from './core/runtime.js'
import { localizeShell, t } from './core/i18n.js'
import { loadMarkdownText } from './core/markdown_loader.js'
import { renderSidebarTree } from './shell/nav.js'
import { initShell } from './shell/shell.js'
import { attachLinkPreviews } from './content/previews.js'
import { startRouter } from './shell/router.js'

// Initialize all UI that depends on parsed wiki data and existing DOM nodes.
//
// This runs after loadMarkdownBundle(), attachSecondaryRoots(), and
// computePageHashes(), so nav/search/router code can safely ask wiki.js for
// pages, hashes, parents, and children.
function initUI() {
	try {
		// Preview behavior is global event wiring for internal links. It is safe
		// to fail silently because the wiki is still usable without previews.
		attachLinkPreviews()
	} catch (_) {}

	// Patch the visible title in the fixed shell and the browser tab title.
	$('#wiki-title-text').textContent = TITLE
	DOC.title = TITLE

	// The sidebar tree is static for a loaded bundle, so render it once at boot.
	renderSidebarTree()

	// The shell owns panels, keyboard shortcuts, theme, search input, and graph
	// panel controls. It returns a small API used by the router/startup code.
	const shell = initShell()

	// The router owns the current page. Before each route render, close panels so
	// navigation feels clean and stale overlays do not cover new content.
	startRouter({ beforeNavigate: shell.closePanels })

	// If the URL has ?q=..., apply it after the search UI exists.
	shell.applyQueryFromLocation?.()
}

// Fetch markdown and build the in-memory wiki model.
async function loadWikiModel() {
	const txt = await loadMarkdownText({ url: MD, cacheMin: CACHE_MIN })
	loadMarkdownBundle(txt)
	// Attach detached page clusters under the main root so every parsed page
	// can still appear in navigation.
	attachSecondaryRoots()
	// Compute stable hash routes after the parent/child tree is final.
	computePageHashes()
}

// ES modules can run before DOMContentLoaded. If the shell DOM is not ready
// yet, wait before querying nodes like #content or #wiki-title-text.
function waitForDomReady() {
	if (DOC.readyState !== 'loading') return Promise.resolve()
	return new Promise(res =>
		DOC.addEventListener('DOMContentLoaded', res, { once: true })
	)
}

// Render a boot failure into the content area without treating the error text
// as markup.
function renderBootError(err) {
	// A boot failure usually means markdown could not be fetched or parsed.
	// Keep the console detail for developers and show a readable page error.
	console.warn('Markdown load failed:', err)
	const content = $(CONTENT_SEL)
	// If #content is missing too, there is nowhere safe to render the error.
	if (!content) return
	// This is app-generated UI, not trusted Markdown. Build DOM nodes and use
	// textContent so error text cannot become markup.
	content.replaceChildren(
		el('h1', { textContent: t('error.contentLoadTitle') }),
		el('p', { textContent: t('error.contentLoadBody') }),
		el('pre', { textContent: String(err?.message || err) })
	)
}

// Full startup sequence.
//
// Everything is wrapped in one try/catch so a setup failure can produce a useful
// in-page error instead of leaving the loading screen stuck.
async function boot() {
	try {
		// Translate the static shell as early as possible. Even if content loading
		// later fails, the error UI can use the selected language.
		localizeShell()

		await loadWikiModel()
		await waitForDomReady()

		// Hand off to the visible app.
		initUI()
	} catch (err) {
		renderBootError(err)
	}
}

// Start immediately when this module is loaded by index.html.
boot()
