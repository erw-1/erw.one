/*
 * Markdown bundle loading and cache policy.
 *
 * app.js owns boot order. This module owns the fetch/localStorage details so
 * the startup file can stay chronological and these branches can be tested
 * without loading the whole browser app.
 */

// localStorage key prefix for fetched markdown bundles.
const CACHE_KEY_PREFIX = 'km:'

// Cache durations are configured in minutes, but timestamps are milliseconds.
const CACHE_MS_PER_MINUTE = 60_000

// Abort fetches that hang too long. Without this, a bad network request could
// leave the user staring at the loading message forever.
export const MARKDOWN_FETCH_TIMEOUT_MS = 20_000

// The URL is part of the key so changing CONFIG.MD automatically creates a
// different cache entry. That prevents one wiki's markdown from being reused
// for another markdown URL.
export const markdownCacheKey = url => `${CACHE_KEY_PREFIX}${url}`

// Read one raw cache value from storage, treating storage failures as misses.
function getCachedRaw(storage, url) {
	try {
		return storage?.getItem(markdownCacheKey(url)) || null
	} catch (_) {
		return null
	}
}

// Parse and validate cached markdown data.
//
// Returns null for missing, malformed, or unexpected values.
export function parseMarkdownCache(raw) {
	try {
		if (!raw) return null
		const data = JSON.parse(raw)
		return data &&
			typeof data.ts === 'number' &&
			typeof data.txt === 'string'
			? data
			: null
	} catch (_) {
		return null
	}
}

// Try to read a cached markdown bundle.
export const readMarkdownCache = (url, storage = globalThis.localStorage) =>
	parseMarkdownCache(getCachedRaw(storage, url))

// Store the latest fetched markdown bundle.
//
// Cache failures are intentionally non-fatal. The app can still run from the
// fresh network response even if localStorage is unavailable or full.
export function writeMarkdownCache(
	url,
	txt,
	storage = globalThis.localStorage,
	now = () => Date.now()
) {
	try {
		storage?.setItem(
			markdownCacheKey(url),
			JSON.stringify({ ts: now(), txt })
		)
	} catch (_) {}
}

// Decide whether a cached bundle is inside the configured freshness window.
export const isFreshMarkdownCache = (
	cached,
	cacheMin,
	now = () => Date.now()
) =>
	!!cached &&
	cacheMin > 0 &&
	now() - cached.ts <= cacheMin * CACHE_MS_PER_MINUTE

// Build the fetch options used by the markdown request.
function createMarkdownFetchRequest(controller) {
	return {
		cache: 'no-cache',
		signal: controller.signal
	}
}

// Fetch the markdown bundle with a timeout and turn HTTP errors into failures.
export async function fetchMarkdownWithTimeout(
	url,
	{
		fetchFn = globalThis.fetch,
		AbortControllerImpl = globalThis.AbortController,
		setTimeoutFn = globalThis.setTimeout,
		clearTimeoutFn = globalThis.clearTimeout,
		timeoutMs = MARKDOWN_FETCH_TIMEOUT_MS
	} = {}
) {
	const ctrl = new AbortControllerImpl()
	const timeout = setTimeoutFn(() => ctrl.abort('fetch-timeout'), timeoutMs)
	try {
		// no-cache asks the browser to revalidate rather than blindly using its
		// HTTP cache. The app's own CACHE_MIN handles intentional reuse.
		const res = await fetchFn(url, createMarkdownFetchRequest(ctrl))
		// HTTP errors like 404/500 still resolve the fetch Promise, so turn them
		// into thrown errors for the normal failure path.
		if (!res.ok) throw new Error(`Failed to fetch MD (${res.status})`)
		return await res.text()
	} finally {
		// Always clear the timeout, whether fetch succeeded, failed, or aborted.
		clearTimeoutFn(timeout)
	}
}

// Fetch the markdown bundle, optionally using a short localStorage cache.
//
// The cache is a convenience for local/offline-ish workflows. Fresh network
// content wins when available. Stale cached content is only used as a fallback
// when the fetch fails.
export async function loadMarkdownText({
	url,
	cacheMin = 0,
	storage = globalThis.localStorage,
	now = () => Date.now(),
	fetchFn,
	AbortControllerImpl,
	setTimeoutFn,
	clearTimeoutFn,
	timeoutMs
} = {}) {
	// CONFIG.MD is required because this static app has no content without the
	// external markdown bundle.
	if (!url) throw new Error('CONFIG.MD is empty.')

	// CACHE_MIN <= 0 disables caching. When enabled, read the cache before fetch
	// so it can be returned immediately if still fresh.
	const cached = cacheMin > 0 ? readMarkdownCache(url, storage) : null
	if (isFreshMarkdownCache(cached, cacheMin, now)) return cached.txt

	try {
		const txt = await fetchMarkdownWithTimeout(url, {
			fetchFn,
			AbortControllerImpl,
			setTimeoutFn,
			clearTimeoutFn,
			timeoutMs
		})
		// Store successful fresh content for later, but only if caching is enabled.
		if (cacheMin > 0) writeMarkdownCache(url, txt, storage, now)
		return txt
	} catch (err) {
		// If the network fails but we have any cached text, prefer a stale wiki
		// over a completely broken page. This is especially helpful for local
		// files, flaky hosting, or temporary offline use.
		if (cached?.txt) {
			console.warn('Network failed; using stale cached Markdown')
			return cached.txt
		}
		throw err
	}
}
