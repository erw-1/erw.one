import en from './en.js'
import fr from './fr.js'

export const DEFAULT_LANG = 'en'
export const AVAILABLE_LOCALES = [en, fr]
export const LOCALES = Object.fromEntries(
	AVAILABLE_LOCALES.map(locale => [locale.code, locale])
)
