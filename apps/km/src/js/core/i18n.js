/*
 * Locale lookup plus shell-chrome localization.
 *
 * The rest of the app should not need to know the shape of locale files. Most
 * modules simply call:
 * - t('common.close') for translated text
 * - formatDate(date, options) for locale-aware dates
 *
 * This file also patches labels that already exist in index.html before the
 * dynamic content renders, such as the search placeholder and panel buttons.
 */
import { DEFAULT_LANG, LOCALES } from '../locales/index.js'
import { applyNodeProps, CFG, DOC } from './runtime.js'

// Convert a config/html language value into one of the supported locale keys.
function resolveLangValue(value, locales, defaultLang = DEFAULT_LANG) {
	const raw = String(value || '').trim().toLowerCase().replace(/_/g, '-')
	if (!raw) return defaultLang
	if (locales[raw]) return raw
	const base = raw.split('-')[0]
	return locales[base] ? base : defaultLang
}

// Decide whether a missing current-locale value should warn.
const shouldWarnMissingTranslation = (
	{ lang, defaultLang, current, fallback, warnedKeys, key } = {}
) =>
	lang !== defaultLang &&
	current == null &&
	fallback != null &&
	!warnedKeys.has(key)

// Format the resolved message or fall back to the visible key path.
function formatTranslationMessage(message, key, vars) {
	if (typeof message === 'function') return message(vars || {})
	return message || key
}

// Convert a config/html language value into one of our supported locale keys.
//
// Examples:
// - "fr-FR" becomes "fr"
// - "fr_FR" becomes "fr"
// - "en" stays "en"
// - missing or unsupported values fall back to "en"
function resolveLang(value) {
	return resolveLangValue(value, LOCALES, DEFAULT_LANG)
}

// Missing translation warnings are useful, but warning the same key repeatedly
// would flood the console. This set remembers which keys already warned.
const warnedKeys = new Set()

// Pick the active language from config first, then legacy/lowercase config,
// then the <html lang=""> attribute from index.html.
const currentLang = resolveLang(CFG.LANG ?? CFG.lang ?? DOC.documentElement.lang)

// Active locale object. The fallback after || is mostly defensive because
// resolveLang() already returns a supported key.
const currentLocale = LOCALES[currentLang] || LOCALES[DEFAULT_LANG]

// English fallback locale used whenever the current locale misses a key.
const fallbackLocale = LOCALES[DEFAULT_LANG]

// Exported internally as constants so all helpers use the same resolved values.
const LANG = currentLang
const LOCALE = currentLocale.intl || fallbackLocale.intl

// Many icon buttons need both a browser tooltip and a screen-reader label.
// This helper keeps those two labels identical for one translation key.
const labelProps = key => ({ title: t(key), 'aria-label': t(key) })

// Warn once when the selected non-English locale is missing a key that English
// can provide. We skip warnings in English because English is the source/fallback
// language, so there is nowhere else to fall back from.
function warnMissingKey(key) {
	if (LANG === DEFAULT_LANG || warnedKeys.has(key)) return
	warnedKeys.add(key)
	console.warn(`[km:i18n] Missing translation for "${key}" in "${LANG}", falling back to "${DEFAULT_LANG}".`)
}

// Look up one key in one locale. Returns null when the locale or key path is
// missing, which lets t() decide whether to use fallback text.
function lookup(locale, key) {
	return locale?.messages?.[key] ?? null
}

// Translate a key.
//
// key: dot path like "common.close" or "graph.legend.title".
// vars: optional data passed to dynamic translation functions.
//
// Return order:
// 1. current language value, if it exists
// 2. English fallback value, if it exists
// 3. the key itself, so missing strings remain visible while developing
export function t(key, vars) {
	
	const current = lookup(currentLocale, key)
	const fallback = lookup(fallbackLocale, key)
	const msg = current ?? fallback
	
	// If the selected locale missed the key but English has it, show English
	// and warn once so translators know what to add.
	if (shouldWarnMissingTranslation({
		lang: LANG,
		defaultLang: DEFAULT_LANG,
		current,
		fallback,
		warnedKeys,
		key
	})) warnMissingKey(key)

	return formatTranslationMessage(msg, key, vars)
}

// Locale-aware date formatting. Content rendering uses this for page metadata.
export const formatDate = (value, options) => new Intl.DateTimeFormat(LOCALE, options).format(value)

// Patch the first element matching selector under root.
// Missing elements are okay because applyNodeProps(null, ...) is a no-op.
const patchNode = (root, selector, props) => applyNodeProps(root.querySelector(selector), props)

// Patch every element matching selector under root. Used for repeated controls
// like panel close buttons.
const patchAll = (root, selector, props) =>	root.querySelectorAll(selector).forEach(node => applyNodeProps(node, props))

// Apply translated labels to static shell HTML.
//
// This runs during app boot before the router renders any markdown page. Dynamic
// content created later usually receives labels directly from its module via t().
export function localizeShell(root = DOC) {
	// Keep the browser/document language in sync with the resolved app language.
	// This helps screen readers and browser features choose the right language.
	DOC.documentElement.lang = LANG

	// Each pair is [CSS selector, props to apply].
	// The props object is passed through applyNodeProps(), so entries can set
	// textContent, placeholder, title, aria-label, and normal attributes.
	;[
		// Home logo/link in the sidebar.
		['#sidebar > a', labelProps('common.home')],

		// Button that clears the search input.
		['#search-clear', labelProps('common.clearSearch')],

		// Home icon in the breadcrumb/header.
		['#home-link', labelProps('common.home')],

		// Fullscreen graph button.
		['#expand', labelProps('shell.expandGraph')],

		// Search input visible placeholder and accessible name.
		['#search',	{ placeholder: t('common.searchPlaceholder'), 'aria-label': t('common.search') }],

		// Initial loading text shown before markdown is rendered.
		['#loading', { textContent: t('shell.loading') }],

		// noscript fallback inside the content area.
		['article#content > noscript', { textContent: t('shell.noscript') }],

		// Breadcrumb nav region.
		['#crumb', { 'aria-label': t('shell.breadcrumb') }],

		// Left/right panel toggle buttons.
		['#burger-sidebar', { 'aria-label': t('shell.openSidebar') }],
		['#burger-util', { 'aria-label': t('shell.openUtilityPanel') }],

		// Theme toggle button.
		['#theme-toggle', { 'aria-label': t('common.toggleTheme') }],

		// Keyboard help button and dialog title/close button.
		['#kb-icon', { 'aria-label': t('shell.keyboardShortcuts') }],
		['#kb-help-title', { textContent: t('help.title') }],
		['#kb-help .close', labelProps('common.closeHelp')],

		// Graph, table of contents, and sidebar landmark labels.
		['#mini', { 'aria-label': t('shell.documentGraph') }],
		['#toc', { 'aria-label': t('shell.tableOfContents') }],
		['#sidebar', { 'aria-label': t('shell.siteNavigation') }]

	].forEach(([selector, props]) => patchNode(root, selector, props))

	// Several panel close buttons share the same class, so patch them together.
	patchAll(root, '.panel-close', labelProps('common.closePanel'))
}
