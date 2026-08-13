# Editing and adding interface languages

Locale files are UTF-8 JavaScript objects with one message key per line. English is the reference list; every other locale keeps the same keys in the same order.

To add a language:

1. Copy `en.js`, then set `code`, `label`, and the browser `intl` locale.
2. Translate the values in `messages`. Keep keys unchanged and use normal native spelling, punctuation, and accents.
3. Import the file in `index.js` and add it to `AVAILABLE_LOCALES`.
4. Add the new code to the `LANG` note in `km/index.html`, then run `build.bat`.

Most values are strings. Use a function only when grammar depends on supplied data, as with page titles in `nav.previous`. Missing translations fall back to English at runtime; the locale test rejects missing, extra, reordered, or invalid values before release.
