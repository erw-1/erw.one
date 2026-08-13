/*
 * Lazy CDN loaders for third-party libraries.
 *
 * The app is a static page, but not every page needs every library. A page with
 * no code blocks does not need Highlight.js; a page with no math does not need
 * KaTeX; the graph does not need D3 until the graph panel wakes up.
 *
 * Each exported loader returns a Promise and memoizes its first request. That
 * lets call sites say `await ensureKatex()` without caring whether KaTeX is
 * already loaded, currently loading, or not requested yet.
 */
import { LANGS, DOC, THEME_DARK, THEME_LIGHT, getThemeMode } from './runtime.js'
import { pkgURL } from './deps.js'

// Root URLs for package files. The actual versions come from deps.js.
const HIGHLIGHT_ROOT = pkgURL('highlight.js')
const KATEX_ROOT = pkgURL('katex', '/dist/')

// Highlight.js ships separate CSS files for light/dark themes.
// theme.js calls ensureHLJSTheme() whenever the app theme changes.
const HIGHLIGHT_THEMES = {
	[THEME_LIGHT]: `${HIGHLIGHT_ROOT}/styles/github.min.css`,
	[THEME_DARK]:  `${HIGHLIGHT_ROOT}/styles/github-dark.min.css`
}

// Wrap an async loader so it only runs once.
//
// `p` starts undefined. On the first call, `fn()` runs and `p` stores its
// Promise. Later calls return the same Promise. This is useful because several
// features may ask for the same library in quick succession; only one network
// request/import sequence should happen.
const ensureOnce = fn => {
	let p
	return () => (p ||= fn())
}

// Load the small D3 modules the graph actually uses.
//
// D3 is split into many packages. Pulling only selection, force-3d, and drag
// keeps graph loading lighter than importing the entire D3 bundle. The returned
// object deliberately exposes only the functions graph.js needs, so graph.js has
// a stable tiny "D3 facade" instead of reaching through package module shapes.
export const ensureD3 = ensureOnce(async () => {
	// These three imports are independent, so load them in parallel.
	const [sel, force, drag] = await Promise.all([
		import(pkgURL('d3-selection', '/+esm')),
		import(pkgURL('d3-force-3d', '/+esm')),
		import(pkgURL('d3-drag', '/+esm'))
	])
	// Return the concrete functions used by graph.js. This makes the graph code
	// easier to read: `D3.forceLink` means exactly this imported function.
	return {
		select: sel.select,
		forceSimulation: force.forceSimulation,
		forceLink: force.forceLink,
		forceManyBody: force.forceManyBody,
		forceCenter: force.forceCenter,
		forceCollide: force.forceCollide,
		forceZ: force.forceZ,
		drag: drag.drag
	}
})

// Load Highlight.js core and register configured languages.
//
// The core build starts without languages. LANGS comes from config, so the
// wiki owner controls which language grammars are downloaded. If no languages
// are configured, code blocks can still render as plain code without failing.
export const ensureHighlight = ensureOnce(async () => {
	const { default: hljs } = await import(`${HIGHLIGHT_ROOT}/es/core/+esm`)
	// Only try language imports when config gives an array with at least one
	// language name, such as ["js", "css", "python"].
	if (Array.isArray(LANGS) && LANGS.length) {
		// Each language is optional. Promise.allSettled plus the inner try/catch
		// means a typo like "pythno" will not break the whole page; that one
		// grammar simply will not be registered.
		await Promise.allSettled(
			LANGS.map(async lang => {
				try {
					const mod = await import(`${HIGHLIGHT_ROOT}/es/languages/${lang}/+esm`)
					hljs.registerLanguage(lang, mod.default)
				} catch (_) {}
			})
		)
	}
	// Expose hljs globally because Highlight.js plugins/styles and debugging in
	// the browser console commonly expect window.hljs.
	window.hljs = hljs
	return hljs
})

// Ensure the Highlight.js stylesheet matches the current app theme.
//
// This is not wrapped with ensureOnce because the user can toggle light/dark
// themes at runtime. The function reuses one <link> element and swaps its href.
export const ensureHLJSTheme = async () => {
	const mode = getThemeMode()

	// Reuse the same theme <link> if it already exists. Creating many theme
	// links would leave old CSS active and make theme behavior unpredictable.
	let link = DOC.querySelector('link[data-hljs-theme]')
	if (!link) {
		link = DOC.createElement('link')
		link.rel = 'stylesheet'
		link.setAttribute('data-hljs-theme', '')
		DOC.head.appendChild(link)
	}
	// If the link already points at the right theme file, there is no work.
	if (link.getAttribute('href') === HIGHLIGHT_THEMES[mode]) return
	// Wait for either load or error so callers can continue even if the CDN CSS
	// fails. Code blocks remain readable; they just may not get themed colors.
	await new Promise(resolve => {
		link.onload = link.onerror = resolve
		link.href = HIGHLIGHT_THEMES[mode]
	})
}

// Load KaTeX and its auto-render helper for pages that contain math.
//
// render.js only calls this when the raw markdown looks like it contains math,
// so ordinary pages skip both the CSS and the JS imports.
export const ensureKatex = ensureOnce(async () => {
	// The CSS is inserted once by id. Without the CSS, KaTeX HTML renders but
	// looks broken because the math layout classes have no styling.
	if (!DOC.getElementById('katex-css')) {
		const link = Object.assign(DOC.createElement('link'), {
			id: 'katex-css', rel: 'stylesheet',	href: `${KATEX_ROOT}katex.min.css`
		})
		DOC.head.appendChild(link)
	}
	// KaTeX core renders expressions; auto-render scans a DOM element and finds
	// math delimiters like $...$, \( ... \), and \[ ... \].
	const [katex, auto] = await Promise.all([
		import(`${KATEX_ROOT}katex.min.js/+esm`),
		import(`${KATEX_ROOT}contrib/auto-render.min.js/+esm`)
	])
	// Expose globals because the existing render helpers and power-user content
	// may expect the traditional KaTeX global names.
	window.katex = katex
	window.renderMathInElement = auto.default
	return katex
})
