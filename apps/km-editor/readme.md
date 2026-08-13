# KM Editor

KM Editor is a static browser editor for the Markdown bundle consumed by KM. It edits page content and metadata, renders with the real KM runtime, validates the bundle, keeps local history, and exports Markdown or standalone HTML.

## Start

From the workspace root on Windows:

```bat
start editor.bat
```

The launcher serves the workspace at `http://127.0.0.1:8765/` before opening
Brave. This also gives embedded YouTube players the HTTP referrer they require.

Open **KM Editor manual** from the Open menu for the complete interactive user guide. Its source is [`../_content_examples/km-docs.md`](../_content_examples/km-docs.md).

## Build and test

After changing editor JavaScript, HTML, CSS, previews, shared query directives, or the manual:

```bat
build.bat
```

The editor entry page loads `src/js/editor.bundle.js`, not the source modules directly. The build command tests behavior and regenerates that bundle.

## Source map

- `index.html`: editor shell and controls
- `src/css/styles.css`: editor styles
- `src/js/app.js`: state and UI wiring
- `src/js/km.js`: KM bundle model and operations
- `src/js/tree.js`: Explorer
- `src/js/toolbar.js`: formatting commands, favorites, and shortcuts
- `src/js/docks.js`: movable and resizable panels
- `src/js/dialogs.js`: modal surfaces
- `src/js/storage.js`: local files, downloads, and GitHub
- `src/js/emoji.js`: lazy emoji picker
- `src/preview/content.html`: in-editor KM rendering
- `src/preview/full.html`: full KM preview
- `test-toolbar.mjs`, `test-features.mjs`: dependency-free Node checks

`src/js/editor.bundle.js` is generated. Do not edit it by hand.

## Runtime dependency

The editor does not fork KM rendering. Preview HTML, query grammar, emoji dependency URLs, runtime CSS, runtime JavaScript, and assets come from the sibling `../km/` project.

The standalone-HTML buttons also need:

```text
../km/build/online-onefile/km-online-onefile.html
```

See the root [`../AGENTS.md`](../AGENTS.md) for the exact path contract and the future `runtime/` migration checklist.

## State and recovery

- Undo and redo cover every change to KM state, not only source text.
- The in-memory undo stack keeps 100 full states.
- History keeps 8 recent full checkpoints in localStorage.
- Restoring a checkpoint is undoable.
- Browser layout, theme, favorites, save mode, and GitHub settings are also local.

The shared `markDirty()` path is the synchronization point. New actions that change content, page order, metadata, assets, or KM config must call it.

## Simple folders

The editor persists navigation-only nodes with `kind:"simple"`. Their Markdown
body is locked until **Turn into page** is used; renaming and other metadata
changes do not change their kind. They may be childless, but the main Home page
cannot be simple. Direct links, transclusion, reading-trail membership, rendered
page previews, and current-page-only export exclude them. **Preview in KM** still
previews the complete bundle at the first renderable descendant or fallback
page. Legacy empty parent nodes are marked explicitly the next time the editor
serializes the bundle.

## Security

KM Markdown is trusted author input and may render raw HTML. Scripts remain off unless `ALLOW_JS_FROM_MD` is explicitly enabled.

GitHub uses a fine-grained token stored in localStorage. Use the smallest repository scope possible and only on a personal machine.
