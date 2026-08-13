/*
 * Pure text helpers with no DOM dependency.
 *
 * These live outside runtime.js so model code (wiki_model.js) stays importable
 * in Node. runtime.js reads `document` at module load, so anything importing it
 * can only run in a browser. runtime.js re-exports everything here, so browser
 * call sites keep importing from the one place they always did.
 */

// A fence line starts or ends a fenced code block, so headings inside fences
// must not become searchable sections.
export const RE_FENCE = /^(?:```|~~~)/

// A markdown heading line looks like "## Title". The first capture is the
// heading depth, and the second capture is the visible title text.
export const RE_HEADING_FULL = /^(#{1,6})\s+(.+)/

// Escape user/content text before inserting it into a RegExp. Without this,
// glossary terms like "C++" or "(test)" would change the regex meaning.
export const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
