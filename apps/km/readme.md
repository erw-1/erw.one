# km

`km` is a fully static wiki/docs/notes site designed to be copied, edited, and published on any static host with no required build step. `index.html` is the source entry point.

## Quick Start

1. Copy the files or fork the repository.
2. Edit the `#km-config` JSON block in [`index.html`](index.html).
3. Keep the default remote Markdown URL, point `MD` at your own raw Markdown URL, or add a local `content.md` file and set `"MD": "content.md"`.
4. Publish the folder with `index.html` at the site root, for example with GitHub Pages branch publishing.

`.nojekyll` is included so branch-based GitHub Pages publishing works without a Jekyll build.

## Main Config

The template config lives in the `#km-config` JSON block inside [`index.html`](index.html).

- `TITLE`: Site title and browser tab title.
- `MD`: Markdown source. Use a full `https://...` URL or a relative file such as `content.md`.
- `LANG`: UI language. Built-in locales are `en` and `fr`.
- `DEFAULT_THEME`: `dark` or `light`.
- `ACCENT`: Any valid CSS color value.
- `LANGS`: Highlight.js languages to load for fenced code blocks.
- `ALLOW_JS_FROM_MD`: Whether inline `<script>` tags from Markdown are executed. Keep this `false` unless you trust the Markdown source.
- `CACHE_MD`: Markdown cache TTL in minutes. Use `0` to fetch on every reload.

If you rename `assets/logo.webp`, update both the favicon link and the logo image in `index.html`.

## Content Model

Pages are defined with `<!--km ... -->` blocks inside the configured Markdown source.

```md
<!--km
    id:"home"
    title:"Home"
-->

Welcome to your wiki.

<!--km
    id:"getting_started"
    title:"Getting Started"
    parent:"home"
    tags:"intro,setup"
    updated:"2026-04-16", "Initial version"
-->

# Getting Started

Write your page content here.
```

- `id` is the stable page identifier used in links and hierarchy.
- `id` must be unique and cannot contain `#`, which is reserved for hash routes.
- `title` is shown in the tree, breadcrumb, graph, and tab title.
- `parent` builds the page tree.
- `tags` power search, graph tag links, and related links.
- `updated` renders the page meta chip near the top of the page.
- `kind:"simple"` marks a non-root, empty page as a navigation-only simple folder, even before it has children.

Simple folders may organize descendants, but they are not article, link-preview,
transclusion, or reading-trail targets. Older bundles that omit `kind` remain
compatible: an empty non-root node with children is still inferred as simple.
The main `home` page (or first page when there is no `home`) always remains an
article route.

Example bundles are archived in `_content_examples/` at the repository root. The live Conclave guide source lives at [github.com/gwanox/conclave-guide](https://github.com/gwanox/conclave-guide).

## Emoji

Emoji shortcodes such as `:smile:` render with Twemoji. To add a custom
shortcode, open the editor's **Insert > Emoji > Custom** tab and drop or select one or
several images. The manager stays open while importing and can rename or remove
them. Typing a partial `:name` in either Markdown source view opens autocomplete.

Supported custom formats are WebP, PNG, GIF, AVIF, SVG, JPG, and JPEG. KM fits
every custom image into the same centered emoji box as Twemoji without changing
its native aspect ratio. Images are embedded in the KM config and standalone
HTML downloads, so no asset-index script is required. A custom alias overrides
a built-in shortcode with the same name. Picker hover labels show the exact
shortcode that KM inserts.

## SEO And Generated Variants

Optional SEO helper files live in [`seo/`](seo). Read [`seo/readme.md`](seo/readme.md) before enabling them, especially on project sites served from `https://<user>.github.io/<repo>/`.

The publishing source remains no-build. The scripts are optional generated variants:

- `python scripts/build_online-noSEO.py` copies the source tree and adds `noindex,nofollow`.
- `python scripts/build-offline-onefile.py` embeds Markdown, CSS, JS, logo, and runtime dependencies into one HTML file.
- `python scripts/build-online-onefile.py` bundles CSS, JS, logo, and runtime dependencies into one HTML file, while still fetching Markdown from `CONFIG.MD` or `--content`.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) for source-editing rules and local checks. Read [`docs/architecture.md`](docs/architecture.md) for the boot flow and module map.

## Search And OpenSearch

The built-in sidebar search is client-side. The app also accepts `?q=...` on load, so the optional OpenSearch descriptor can send queries into the site.

## Localization

UI strings live in [`src/js/locales`](src/js/locales).

- `en.js` is the reference locale and fallback.
- `fr.js` is the current second locale.
- Missing translations fall back to English and log a console warning once per missing key.
