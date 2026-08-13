/*
 * Theme setup and persistence. The shell only needs the returned toggle command.
 *
 * Theme state affects more than the page background:
 * - <html data-theme="dark|light"> drives normal app CSS
 * - Highlight.js needs the matching code-block stylesheet
 * - Mermaid diagrams need to be rerendered/synced with the current theme
 *
 * Preference order at startup:
 * 1. localStorage value saved by the user
 * 2. CONFIG.DEFAULT_THEME when it is explicitly "dark" or "light"
 * 3. browser/system prefers-color-scheme
 */
import {
	ACCENT,
	DEFAULT_THEME,
	PREVIEW_THEME,
	DOC,
	$,
	THEME_DARK,
	THEME_LIGHT,
	setBoolAttr
} from '../core/runtime.js'
import { ensureHLJSTheme } from '../core/loaders.js'
import { syncMermaidThemeWithPage } from '../content/markdown_runtime.js'

// localStorage key for the user's explicit light/dark choice.
const THEME_STORAGE_KEY = 'km-theme'

// CONFIG.DEFAULT_THEME only counts when it is exactly "dark" or "light".
const getConfigTheme = (value, darkTheme, lightTheme) =>
	value === darkTheme || value === lightTheme ? value : ''

// Choose the initial dark/light state from saved value, config, then system.
const getInitialDarkMode = (
	{ stored = '', configTheme = '', systemMatches = false } = {},
	darkTheme
) =>
	stored
		? stored === darkTheme
		: configTheme
			? configTheme === darkTheme
			: !!systemMatches

// System theme changes apply only when neither storage nor config is explicit.
const shouldFollowSystemTheme = (stored, configTheme) =>
	!stored && !configTheme

// Stored values are always the canonical light/dark constants.
const getStoredThemeValue = (isDark, darkTheme, lightTheme) =>
	isDark ? darkTheme : lightTheme

// Read the saved theme preference, if localStorage is available.
//
// Browsers can throw here in private/restricted contexts or when local files are
// opened under unusual settings. Returning null means "no saved preference".
function readThemePreference() {
	try {
		return localStorage.getItem(THEME_STORAGE_KEY)
	} catch (_) {
		return null
	}
}

// Save the user's explicit theme preference.
//
// This is intentionally best-effort. If localStorage is blocked/full, the theme
// still changes for the current page load; it just will not persist.
function writeThemePreference(value) {
	try {
		localStorage.setItem(THEME_STORAGE_KEY, value)
	} catch (_) {}
}

// Apply one theme decision to the visible page.
//
// `isDark` is the only state this function needs. Everything else is a side
// effect that must stay synchronized with that decision.
function applyTheme(root, button, isDark) {
	// Mark the toggle button as pressed when dark mode is active. setBoolAttr()
	// also handles a missing button safely.
	setBoolAttr(button, 'aria-pressed', isDark)
	// CSS tokens read this attribute to switch colors.
	root.setAttribute('data-theme', isDark ? THEME_DARK : THEME_LIGHT)
	// Code highlighting uses separate CSS files for light/dark themes.
	ensureHLJSTheme()
	// Mermaid diagrams have their own internal theme state, so keep them aligned
	// with the page after every theme change.
	syncMermaidThemeWithPage()
}

// Initialize theme behavior and return the shell command API.
export function initTheme() {
	// Button is optional in small fixtures, but when present it gets ARIA state.
	const button = $('#theme-toggle')
	// The root <html> element owns data-theme and the optional accent CSS var.
	const root = DOC.documentElement
	// Browser/system dark-mode preference. Used only when the user and config did
	// not choose an explicit theme.
	const media = matchMedia('(prefers-color-scheme: dark)')
	// CONFIG.DEFAULT_THEME only counts when it is exactly "dark" or "light".
	// Any other value falls through to system preference.
	const previewTheme = getConfigTheme(PREVIEW_THEME, THEME_DARK, THEME_LIGHT)
	const configTheme = previewTheme || getConfigTheme(DEFAULT_THEME, THEME_DARK, THEME_LIGHT)
	const stored = previewTheme ? '' : readThemePreference()
	// Choose initial dark/light state:
	// - saved user choice wins
	// - then explicit config
	// - then current system preference
	let isDark = getInitialDarkMode({
		stored,
		configTheme,
		systemMatches: media.matches
	}, THEME_DARK)

	// Optional configured accent color. This lets a local wiki brand itself
	// without changing the compiled CSS.
	if (ACCENT) root.style.setProperty('--color-accent', ACCENT)

	// Shell command used by the toolbar button and keyboard shortcut.
	const toggleTheme = () => {
		// Flip the in-memory state first.
		isDark = !isDark
		// Paint the new state onto the app immediately.
		applyTheme(root, button, isDark)
		// Persist the explicit user choice for future page loads.
		if (!previewTheme)
			writeThemePreference(getStoredThemeValue(isDark, THEME_DARK, THEME_LIGHT))
		return true
	}

	// Apply the initial theme before the user interacts with anything.
	applyTheme(root, button, isDark)
	media.addEventListener?.('change', event => {
		// If the user saved a preference, system changes should not override it.
		// If CONFIG.DEFAULT_THEME was explicit, the local config also wins over
		// system preference changes.
		if (!shouldFollowSystemTheme(readThemePreference(), configTheme)) return
		// No explicit preference: follow the updated system dark/light setting.
		isDark = event.matches
		applyTheme(root, button, isDark)
	})
	addEventListener('storage', event => {
		if (previewTheme) return
		// Only respond to theme changes from another tab/window of this app.
		if (event.key !== THEME_STORAGE_KEY) return
		// localStorage events carry the new value as a string or null. Null and
		// any non-dark value behave as light here.
		isDark = event.newValue === THEME_DARK
		applyTheme(root, button, isDark)
	})

	// The shell command table only needs the toggle command.
	return { toggleTheme }
}
