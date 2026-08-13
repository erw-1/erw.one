/*
 * Which file extensions are playable media.
 *
 * Markdown has no audio/video syntax, so KM reads image syntax pointing at a
 * media file as playback. The KM renderer uses this to emit <video>/<audio>,
 * and the editor uses it to check the same references, so both agree on what
 * counts as media.
 */
const MEDIA_TAGS = [
	['video', /\.(?:mp4|webm|ogv|mov|m4v)(?:[?#]|$)/i],
	['audio', /\.(?:mp3|m4a|aac|oga|ogg|opus|wav|flac)(?:[?#]|$)/i]
]

const IMAGE_FILE = /\.(?:png|jpe?g|gif|webp|avif|svg|bmp|ico)(?:[?#]|$)/i

// 'video', 'audio', or '' when the URL is not a media file.
export const mediaTag = url =>
	MEDIA_TAGS.find(([, pattern]) => pattern.test(String(url ?? '')))?.[0] ?? ''

// 'video', 'audio', 'image', or '' — what markdown image syntax will produce for
// this file. The editor uses it to decide which dropped files it can embed.
export const assetKind = url =>
	mediaTag(url) || (IMAGE_FILE.test(String(url ?? '')) ? 'image' : '')

// Resolve a content-relative asset path against the site root.
//
// Published KM serves markdown assets relative to index.html, so base is empty
// and paths are left alone. Editor previews render from a different folder and
// set ASSET_BASE to the KM root so `assets/clip.webm` still resolves.
export function resolveAssetURL(url, base = '') {
	const value = String(url ?? '')
	// Absolute URLs, protocol-relative URLs, root paths, anchors, and data URIs
	// are already final.
	if (!base || !value || /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(value)) return value
	return `${base.replace(/\/?$/, '/')}${value}`
}
