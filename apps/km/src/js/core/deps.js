/*
 * Third-party dependency versions used by the client-side app.
 *
 * KM has no npm install/build requirement for normal use. The browser loads
 * libraries from jsDelivr only when a feature needs them. Keeping every version
 * in this small table makes upgrades obvious and avoids hidden CDN strings
 * scattered across loaders, graph code, or markdown rendering.
 */
const DEPS = {
	// Graph rendering stack. `graph.js` imports these together through
	// loaders.js so D3 is downloaded only when the graph is initialized.
	'd3-selection':    '3.0.0',
	'd3-force-3d':     '3.0.6',
	'd3-drag':         '3.0.0',

	// Code block syntax highlighting and math rendering. These stay lazy so a
	// plain text page does not pay for Highlight.js or KaTeX.
	'highlight.js':    '11.11.1',
	'katex':           '0.16.22',

	// Markdown parser plus the exact Marked extensions KM enables:
	// alerts, footnotes, emoji shortcodes, and Mermaid blocks.
	'marked':          '16.1.2',
	'marked-alert':    '2.1.2',
	'marked-footnote': '1.4.0',
	'marked-emoji':    '2.0.1',
	// Twemoji artwork (Twitter/Discord style), CC-BY 4.0:
	// https://github.com/jdecked/twemoji
	'emoji-datasource-twitter': '16.0.0',
	// 11.16 adds the newer diagram types the editor's builder offers: venn,
	// ishikawa, wardley, and cynefin. ZenUML lives outside Mermaid core and is
	// registered only for diagrams that start with `zenuml`.
	'mermaid':         '11.16.0',
	'@mermaid-js/mermaid-zenuml': '0.2.3',

	// Local developer tooling version. The static app does not load esbuild in
	// the browser, but documenting it here keeps the included tool version easy
	// to find next to the browser dependency versions.
	'esbuild':         '0.28.0'
}

// Base URL for npm package files served by jsDelivr.
const CDN_ROOT = 'https://cdn.jsdelivr.net/npm'

// Build a pinned CDN URL.
//
// name: package key from DEPS, for example "marked" or "katex".
// suffix: optional path inside that package, for example "/dist/katex.min.css".
//
// Concrete result:
// pkgURL('katex', '/dist/katex.min.css')
// -> https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css
//
// If `name` is not in DEPS, the URL will contain "undefined". That is
// intentional enough for this small app: missing dependency keys should fail
// loudly during development instead of silently choosing a floating latest
// version.
export const pkgURL = (name, suffix = '') => `${CDN_ROOT}/${name}@${DEPS[name]}${suffix}`

// Point one Unicode emoji at the pinned Twitter-style PNG used by the editor picker.
export const twitterEmojiURL = emoji => pkgURL(
	'emoji-datasource-twitter',
	`/img/twitter/64/${[...emoji].map(char => char.codePointAt(0).toString(16)).join('-')}.png`
)

// Normalize the pinned emoji-data package into Discord-style shortcodes.
export function emojiDataEntries(module) {
	const data = module.default ?? module
	return data.flatMap(row => {
		const aliases = Array.isArray(row.short_names) ? row.short_names.filter(Boolean) : []
		if (!row.unified || !aliases.length) return []
		return [{
			emoji: String.fromCodePoint(...row.unified.split('-').map(hex => parseInt(hex, 16))),
			shortcode: row.short_name || aliases[0],
			aliases,
			name: row.name || '',
			group: row.category === 'Component' ? 'People & Body' : row.category
		}]
	})
}
