/*
 * Lazily loads markdown-adjacent runtimes that should stay out of the core boot path,
 * mainly Mermaid plus the custom Marked extensions used by KM.
 *
 * This file has two jobs:
 * 1. build the Marked parser with KM's markdown extensions
 * 2. load/render Mermaid diagrams only when rendered content needs them
 *
 * Keeping these imports lazy makes the first app boot lighter. The parser,
 * emoji data, and Mermaid bundle are downloaded only when content rendering
 * actually asks for them.
 */
import { CUSTOM_EMOJI, DOC, THEME_DARK, escapeRegex, isDarkTheme } from '../core/runtime.js'
import { emojiDataEntries, pkgURL, twitterEmojiURL } from '../core/deps.js'
import { mediaTag } from './media.js'
import { ensureDiagramSupport, loadMermaid } from './mermaid_loader.js'

// Escape text before placing it in HTML.
//
// Mermaid source starts as code-fence text. We put it inside a <div> first, then
// Mermaid later reads and turns it into SVG. Escaping here prevents the source
// text from being interpreted as real HTML before Mermaid sees it.
const escapeHTML = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeAttribute = text => escapeHTML(String(text)).replace(/"/g, '&quot;')

const emojiHTML = (src, alt, alias, className) =>
	`<span class="km-emoji-box" title=":${escapeAttribute(alias)}:"><img class="km-emoji ${className}" src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" loading="lazy" decoding="async" draggable="false"></span>`

const CUSTOM_EMOJI_DATA = /^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml);base64,[a-z0-9+/]+={0,2}$/i

function loadCustomEmojiMap() {
	if (!Array.isArray(CUSTOM_EMOJI)) return new Map()
	return new Map(CUSTOM_EMOJI.flatMap(item =>
		/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(item?.alias) &&
		CUSTOM_EMOJI_DATA.test(item?.data)
			? [[item.alias, item.data]]
			: []
	))
}

function createCustomEmojiExtension(customEmojiMap) {
	return {
		name: 'customEmoji',
		level: 'inline',
		start(src) { return src.indexOf(':') },
		tokenizer(src) {
			const match = /^:([A-Za-z0-9][A-Za-z0-9_-]{0,63}):/.exec(src)
			if (!match) return
			const custom = customEmojiMap.get(match[1])
			if (!custom) return
			return { type: 'customEmoji', raw: match[0], alias: match[1], custom }
		},
		renderer(token) {
			return emojiHTML(
				token.custom,
				token.raw,
				token.alias,
				'km-custom-emoji'
			)
		}
	}
}

// Marked does not understand KaTeX by itself. KM intentionally leaves math as
// plain text so KaTeX auto-render can process it later in decorators.js. These
// small pass-through extensions protect math text from KM's other inline
// extensions, especially ^sup^ and ~sub~, which would otherwise see TeX like
// x^2 + y^2 and corrupt it before KaTeX gets a chance to render it.
const DISPLAY_MATH_EXTENSION = {
	name: 'displayMath', level: 'block',
	// Fast hint: display math starts with $$ at the current block position.
	start(src) { return src.indexOf('$$') },
	tokenizer(src) {
		const match = /^\$\$[ \t]*\n([\s\S]*?)\n\$\$[ \t]*(?=\n|$)/.exec(src)
		// Not a standalone $$...$$ block.
		if (!match) return
		return { type: 'displayMath', raw: match[0], text: match[1] }
	},
	renderer(token) {
		// Keep the delimiters in the DOM. KaTeX auto-render looks for them later.
		return `<div class="km-math-source">$$\n${escapeHTML(token.text)}\n$$</div>\n`
	}
}

const INLINE_MATH_EXTENSION = {
	name: 'inlineMath', level: 'inline',
	// Fast hint: inline math starts with $.
	start(src) { return src.indexOf('$') },
	tokenizer(src) {
		const match = /^\$(?!\$|\s|\d)((?:\\.|[^\n$\\])*\S)\$(?!\$)/.exec(src)
		// Not an inline $...$ math span.
		if (!match) return
		return { type: 'inlineMath', raw: match[0], text: match[1] }
	},
	renderer(token) {
		// Keep the delimiters, but mark the span. KaTeX auto-render is pointed at
		// these markers only: it has no equivalent of this tokenizer's "no digit
		// after $" rule, so scanning the whole article would turn prose like
		// "$5 to $10" into garbled math.
		return `<span class="km-math-source">$${escapeHTML(token.text)}$</span>`
	}
}

// Marked renderer override for images: image syntax pointing at a media file
// becomes a real player. Browsers ship the player, so this costs no dependency
// and no JavaScript at render time. Returning false keeps Marked's own <img>
// output for everything that is not media.
function renderMediaImage({ href, title, text }) {
	const tag = mediaTag(href)
	if (!tag) return false
	const label = title || text || ''
	// The inner text is the fallback for browsers that cannot play the file.
	return `<${tag} class="km-media km-${tag}" src="${escapeAttribute(href)}" controls preload="metadata"` +
		`${label ? ` title="${escapeAttribute(label)}"` : ''}>${escapeHTML(label)}</${tag}>`
}

// Create a small inline Marked extension for paired delimiters.
//
// Used for KM inline syntax such as:
// ==mark==
// ^superscript^
// ~subscript~
// ++underline++
//
// The returned extension tells Marked how to recognize, tokenize, and render one
// inline syntax shape.
function createInlineExtension({
	name, delimiter, tag, hint = delimiter[0],
	notAfterOpen, notBeforeClose, htmlAttributes = ''
}) {
	// Delimiter may contain regex characters, so escape it before building the
	// matcher.
	const escaped = escapeRegex(delimiter)
	// Optional guard just after the opening delimiter. Example: superscript uses
	// this so ^[ does not steal normal markdown footnote/link syntax.
	const after  = notAfterOpen ? `(?!${notAfterOpen})` : ''
	// Optional guard just before the closing delimiter. Example: underline avoids
	// consuming +++ as a confusing nested delimiter.
	const before = notBeforeClose ? `(?!${notBeforeClose})` : ''
	// Match only at the current tokenizer position:
	// - opening delimiter
	// - non-space first content character
	// - any content ending with a non-space character
	// - closing delimiter
	const re = new RegExp(`^${escaped}${after}(?=\\S)([\\s\\S]*?\\S)${escaped}${before}`)

	return { name, level: 'inline',
		// Fast hint for Marked: "do not try tokenizer until this character
		// appears". This avoids running the regex at every source position.
		start(src) { return src.indexOf(hint)},
		// Convert matched source text into a token Marked can render later.
		tokenizer(src) { const match = re.exec(src)
			
			// No match means this extension does not handle the current source.
			if (!match) return
			return {
				type: name,
				raw: match[0],
				text: match[1],
				// Parse nested inline markdown inside the custom delimiter. Example:
				// ==**important**== can still render bold text inside <mark>.
				tokens: this.lexer.inlineTokens(match[1])
			}
		},
		// Render the token as the configured HTML tag.
		renderer(token) {
			return `<${tag}${htmlAttributes ? ` ${htmlAttributes}` : ''}>${this.parser.parseInline(token.tokens)}</${tag}>`
		}
	}
}

// Create the block extension for admonition/callout blocks.
//
// Syntax:
// :::info Optional title
// Markdown body
// :::
//
// Supported kinds map to CSS classes inspired by common docs systems.
function createCalloutExtension() {
	return { name: 'callout', level: 'block',
		// Fast hint: callouts begin with :::.
		start(src) { return src.indexOf(':::') },
		tokenizer(src) { const match = /^:::(success|info|warning|danger)(?:[ \t]+([^\n]*))?[ \t]*\n([\s\S]*?)\n:::[ \t]*(?=\n|$)/.exec(src)

			// Not a recognized callout block at this position.
			if (!match) return
			const [, kind, title = '', body] = match
			return {
				type: 'callout',
				raw: match[0],
				kind,
				// Title is parsed but currently not rendered. Keeping it in the
				// token leaves room for future title display without changing the
				// tokenizer.
				title,
				// Body is block-tokenized so markdown lists, links, code, etc. work
				// inside the callout.
				tokens: this.lexer.blockTokens(body)
			}
		},
		renderer(token) {
			// Map author-facing kind names to the CSS class names used by styles.
			const cls = {
					info: 'note',
					success: 'tip',
					warning: 'warning',
					danger: 'caution'
				}[token.kind] || 'note'
			// Parse the body tokens back into HTML inside the callout wrapper.
			return `<div class="md-callout md-${cls}">\n${this.parser.parse(token.tokens)}\n</div>\n`
		}
	}
}

// Create the block extension for spoiler sections.
//
// Syntax:
// :::spoiler Optional summary
// Hidden markdown body
// :::
//
// This renders to native <details>, so the browser provides the open/closed
// behavior.
function createSpoilerExtension() {
	return { name: 'spoiler', level: 'block',
		// Fast hint for Marked.
		start(src) { return src.indexOf(':::spoiler')},
		tokenizer(src) { const match = /^:::spoiler(?:[ \t]+([^\n]*))?[ \t]*\n([\s\S]*?)\n:::[ \t]*(?=\n|$)/.exec(src)

			// Not a spoiler block at this source position.
			if (!match) return
			const [, title = 'spoiler', body] = match
			return {
				type: 'spoiler',
				raw: match[0],
				title,
				// Summary text can contain inline markdown.
				titleTokens: this.lexer.inlineTokens(title),
				// Spoiler body can contain block markdown.
				tokens: this.lexer.blockTokens(body)
			}
		},
		renderer(token) {
			// Render the summary first, then the hidden body content.
			const summary = this.parser.parseInline(token.titleTokens)
			return `<details class="md-spoiler"><summary>${summary}</summary>\n${this.parser.parse(token.tokens)}\n</details>\n`
		}
	}
}

// Marked block extension for Mermaid code fences.
//
// Instead of rendering a normal <pre><code>, it produces a <div class="mermaid">
// that Mermaid can later turn into SVG.
const MERMAID_EXTENSION = {
	name: 'mermaid', level: 'block',
	// Fast hint: only try this extension near mermaid fences.
	start(src) { return src.indexOf('```mermaid')},
	tokenizer(src) { const match = /^```(?:mermaid|Mermaid)[ \t]*\n([\s\S]*?)\n```[ \t]*(?=\n|$)/.exec(src)
		// Not a Mermaid code fence.
		if (!match) return
		return { type: 'mermaid', raw: match[0], text: match[1] }
	},
	renderer(token) {
		// Store escaped source in the div. renderMermaidLazy() will later ask
		// Mermaid to convert it to SVG.
		return `<div class="mermaid">${escapeHTML(token.text)}</div>\n`
	}
}

// All custom Marked extensions registered by KM.
const MARKDOWN_EXTENSIONS = [
	MERMAID_EXTENSION,
	DISPLAY_MATH_EXTENSION,
	INLINE_MATH_EXTENSION,
	createInlineExtension({ name: 'mark', delimiter: '==', tag: 'mark', hint: '=' }),
	createInlineExtension({	name: 'sup',  delimiter: '^',  tag: 'sup', notAfterOpen: '\\[|\\^' }),
	createInlineExtension({	name: 'sub',  delimiter: '~',  tag: 'sub', notAfterOpen: '~', notBeforeClose: '~' }),
	createInlineExtension({ name: 'underline', delimiter: '++', tag: 'u', hint: '+', notAfterOpen: '\\+', notBeforeClose: '\\+' }),
	createInlineExtension({
		name: 'inlineSpoiler',
		delimiter: '||',
		tag: 'span',
		hint: '|',
		htmlAttributes: 'class="md-inline-spoiler" role="button" tabindex="0" aria-expanded="false"'
	}),
	createCalloutExtension(),
	createSpoilerExtension()
]

// Mermaid's light theme name. For dark mode, KM uses "dark" to match the app
// theme constant.
const MERMAID_DEFAULT_THEME = 'default'

// Convert Discord-style shortcodes into marked-emoji's shortcode -> emoji map.
function buildEmojiMap(emojiData) {
	return Object.fromEntries(emojiDataEntries(emojiData).flatMap(
		entry => entry.aliases.map(alias => [alias, entry.emoji])
	))
}

// Build the configured Marked parser used by the app.
//
// The dependencies are passed in as modules because ensureMarkdown() imports
// them lazily. This function adapts default/named export differences and
// registers all plugins in one place.
function createMarkdownParser(
	marked, footnoteMod, alertMod,
	emojiPluginMod, emojiDataMod, customEmojiMap = new Map()
) {
	// Some ESM CDN modules export as default, some expose named exports. These
	// fallbacks make the loader resilient to those packaging differences.
	const markedEmoji = emojiPluginMod.markedEmoji ?? emojiPluginMod.default
	const emojiMap = buildEmojiMap(emojiDataMod)
	const markdown = new marked.Marked()
		// Footnote support for markdown footnote syntax.
		.use((footnoteMod.default ?? footnoteMod)())
		// GitHub-style alert/admonition support from marked-alert.
		.use((alertMod.default ?? alertMod)())
		// Emoji shortcode support such as :smile:.
		.use(markedEmoji({
				emojis: emojiMap,
				renderer: token => emojiHTML(
					twitterEmojiURL(token.emoji),
					token.emoji,
					token.name,
					'km-twemoji'
				)
			})
		)
		// KM-specific inline/block extensions defined above.
		.use({ extensions: [createCustomEmojiExtension(customEmojiMap), ...MARKDOWN_EXTENSIONS] })
		// Audio and video playback from image syntax.
		.use({ renderer: { image: renderMediaImage } })
	return {
		// Keep one small parse API for render.js. mangle:false prevents Marked
		// from obfuscating email-like text in ways that would surprise local docs.
		parse: (src, opt) => markdown.parse(src, { ...opt, mangle: false })
	}
}

// Cached Promise for the markdown parser. Once loading starts, every caller gets
// the same Promise instead of importing/building the parser repeatedly.
let mdReady = null

// Cached Promise for Mermaid. Same idea as mdReady, but for diagrams.
let mermaidReady = null

// Last Mermaid theme applied through mermaid.initialize().
let mermaidTheme = getPageMermaidTheme()

// Node -> in-flight Mermaid render Promise. This prevents duplicate concurrent
// renders for the same diagram without storing "rendering" state in the DOM.
const mermaidRenderJobs = new WeakMap()

// Convert current page theme to Mermaid theme name.
function getPageMermaidTheme() {
	return isDarkTheme() ? THEME_DARK : MERMAID_DEFAULT_THEME
}

// Apply Mermaid configuration for the active theme.
//
// Mermaid keeps global configuration, so this must be called after loading
// Mermaid and whenever the app theme changes.
function applyMermaidTheme(mermaid, mode = mermaidTheme) {
	mermaidTheme = mode
	mermaid.initialize({ startOnLoad: false, theme: mermaidTheme })
}

// Load and create the markdown parser on demand.
//
// render.js awaits this before parsing page content. The returned object has a
// single parse() method.
export function ensureMarkdown() {
	// Reuse the already-started/already-finished parser load.
	if (mdReady) return mdReady
	mdReady = Promise.all([
		// Marked core parser.
		import(pkgURL('marked', '/+esm')),
		// GitHub-style alert blocks.
		import(pkgURL('marked-alert', '/+esm')),
		// Footnote syntax.
		import(pkgURL('marked-footnote', '/+esm')),
		// Emoji shortcode plugin.
		import(pkgURL('marked-emoji', '/+esm')),
		// Discord-style emoji shortcode data.
		import(pkgURL('emoji-datasource-twitter', '/emoji.json/+esm')),
		// Embedded custom aliases make managed emoji win built-in collisions.
		loadCustomEmojiMap()
	]).then(args => createMarkdownParser(...args))
	return mdReady
}

// Load Mermaid on demand and initialize it for the current page theme.
function ensureMermaid() {
	// Refresh the desired theme before checking the cached Mermaid Promise. If
	// Mermaid is already loaded, syncMermaidThemeWithPage() can reinitialize it.
	mermaidTheme = getPageMermaidTheme()
	// Reuse the existing load Promise when available.
	if (mermaidReady) return mermaidReady
	mermaidReady = loadMermaid().then(mermaid => {
		applyMermaidTheme(mermaid)
		return mermaid
	})
	return mermaidReady
}

// Remember the original Mermaid source text on a node.
//
// Mermaid replaces the node contents with SVG. Storing source in data-mmd-src
// lets KM rerender the diagram later, for example after a theme change.
function ensureMermaidSource(node) {
	if (!node.dataset.mmdSrc) node.dataset.mmdSrc = node.textContent
	return node.dataset.mmdSrc
}

// Put one Mermaid node back into "source text waiting to be rendered" state.
function resetMermaidNode(node) {
	// Restore the original diagram text as the node contents.
	node.innerHTML = ensureMermaidSource(node)
	// Mermaid adds data-processed after rendering. Remove it so Mermaid will run
	// on this node again.
	node.removeAttribute('data-processed')
	// KM's own "already rendered" guard must also be cleared.
	delete node.dataset.mmdDone
	delete node.dataset.mmdTheme
}

// Reset every Mermaid diagram below a root.
function resetMermaidRoot(root) {
	// Some roots may be missing after closing previews/lightboxes.
	if (!root) return
	root.querySelectorAll('.mermaid').forEach(resetMermaidNode)
}

// Wait until Mermaid appears to have finished rendering one node.
//
// Mermaid's run() Promise does not always line up perfectly with DOM mutation
// timing in every browser/version, so this watches for either data-processed or
// an SVG child. It also has a timeout so a broken diagram cannot hang forever.
function waitForMermaidRender(node) {
	let resolveDone
	// Promise resolves when observer sees completion or when timeout fires.
	const done = new Promise(resolve => { resolveDone = resolve })
	const observer = new MutationObserver(() => {
		if (
			// Mermaid commonly marks processed nodes with this attribute.
			node.getAttribute('data-processed') === 'true' || node.querySelector('svg')
		) {
			observer.disconnect()
			resolveDone()
		}
	})
	// Watch both attributes and children because Mermaid may signal completion in
	// either way.
	observer.observe(node, { attributes: true, childList: true })
	const timeout = setTimeout(() => {
		// Timeout path: stop watching and let the caller continue.
		observer.disconnect()
		resolveDone()
	}, 4000)
	// Always clear timeout when the Promise resolves early.
	done.finally(() => clearTimeout(timeout))
	return done
}

// Render one Mermaid node to SVG.
async function renderMermaidNode(mermaid, node) {
	// Capture source before Mermaid mutates the node.
	ensureMermaidSource(node)
	// Skip nodes this module already rendered successfully for the current theme.
	if (
		node.dataset.mmdDone === '1' &&
		node.dataset.mmdTheme === mermaidTheme &&
		node.querySelector('svg')
	)
		return
	const existingJob = mermaidRenderJobs.get(node)
	if (existingJob) return existingJob

	const job = (async () => {
		// Diagram types that live outside Mermaid core load here, per source.
		await ensureDiagramSupport(mermaid, node.dataset.mmdSrc)
		// If this node already contains SVG from a previous render, restore source
		// so Mermaid can render from text again.
		if (node.querySelector('svg')) node.innerHTML = node.dataset.mmdSrc
		// Remove old success markers before rerunning.
		node.removeAttribute('data-processed')
		delete node.dataset.mmdDone
		delete node.dataset.mmdTheme

		try {
			// Start waiting before calling Mermaid so fast mutations are not missed.
			const done = waitForMermaidRender(node)
			await mermaid.run({ nodes: [node] })
			await done
			// Mark as done only when Mermaid produced visible output/processed state.
			if (
				node.getAttribute('data-processed') === 'true' ||
				node.querySelector('svg')
			) {
				node.dataset.mmdDone = '1'
				node.dataset.mmdTheme = mermaidTheme
			}
		} catch (err) {
			// Allow a future attempt if rendering failed.
			delete node.dataset.mmdDone
			delete node.dataset.mmdTheme
			throw err
		} finally {
			mermaidRenderJobs.delete(node)
		}
	})()
	mermaidRenderJobs.set(node, job)
	return job
}

// Render every Mermaid node under a root.
async function renderMermaidNodes(mermaid, root = DOC) {
	const nodes = [...root.querySelectorAll('.mermaid')]
	for (const node of nodes) {
		try {
			// Render diagrams one by one. This is simpler and avoids several
			// Mermaid edge cases around duplicate ids/concurrent rendering.
			await renderMermaidNode(mermaid, node)
		} catch (_) {}
	}
}

// Public render hook used by the article enhancement pipeline.
//
// The name says "Lazy" because Mermaid itself is imported only when this is
// called for rendered content.
export async function renderMermaidLazy(root = DOC) {
	await renderMermaidNodes(await ensureMermaid(), root)
}

// Find currently mounted DOM roots that may contain Mermaid diagrams.
//
// Theme changes need to rerender diagrams not only in the main article, but also
// in open lightboxes/previews that show copied rendered content.
function getMermaidRoots() {
	return [
		// Main article.
		DOC.getElementById('content'),
		// Lightbox viewport, if open.
		DOC.querySelector('.km-lightbox-viewport'),
		// Link preview surfaces, if open.
		...[...DOC.querySelectorAll('.km-link-preview')].map(preview =>
			preview.querySelector(':scope > div')
		)
	// Keep only roots that actually contain Mermaid diagrams.
	].filter(root => root?.querySelector('.mermaid'))
}

// Reconfigure Mermaid for the current page theme and rerender visible diagrams.
//
// theme.js calls this whenever the app switches light/dark mode.
export async function syncMermaidThemeWithPage() {
	const mode = getPageMermaidTheme()
	mermaidTheme = mode
	const roots = getMermaidRoots()

	// If there are no diagrams mounted and Mermaid has never loaded, there is no
	// work to do. This avoids importing Mermaid just because the theme changed.
	if (!roots.length && !mermaidReady) return
	const mermaid = await ensureMermaid()
	applyMermaidTheme(mermaid, mode)
	
	for (const root of roots) {
		// Rerender from original source so diagrams pick up the new Mermaid theme.
		resetMermaidRoot(root)
		await renderMermaidNodes(mermaid, root)
	}
}
