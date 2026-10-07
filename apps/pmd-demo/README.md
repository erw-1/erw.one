# Your portable.md site

Generated with [portable.md Editor](https://editor.portable.md/). More information: [portable.md](https://portable.md/).

This folder is a ready-to-publish static website: no build step and no server software.

## What is in this folder

- `index.html`, `pmd-reader-dist/` and any `pmd-custom-*.css`: the generated site and the reader that displays it. Do not edit them; every export rebuilds them.
- `content/`: your project (Markdown, `pmd.json`, images and other files). Open the project's ZIP or this `content/` folder in the editor to keep working, then export again.
- `.pmd-publish.json` and `.nojekyll`: bookkeeping for the editor and for GitHub Pages. Keep them.

## Check it first

Open the folder through a local web server. Opening `index.html` straight from disk does not work, because the reader loads its files over HTTP.

## Publish with GitHub Pages

1. Create a repository on GitHub and upload the contents of this folder to it (drag and drop works in the web interface).
2. In the repository, open **Settings > Pages**. Under **Build and deployment**, choose **Deploy from a branch**, pick your branch and `/ (root)`, then save.
3. After a minute or two the site is live at `https://<your-name>.github.io/<repository>/`.
4. In the editor, open **Project config**, set **Site URL (canonical)** to that address and export again, so links, the sitemap and sharing previews use it.

To keep the site in a `docs` folder instead, upload the contents of this folder into `docs/` and choose `/docs` in step 2. The editor can also publish straight to a GitHub repository, so you do not have to upload by hand.

## Publish anywhere else

Any static host works (Netlify, Cloudflare Pages, a web server of your own, and so on). Upload the folder so that `index.html` is at the root of the web address, with no build command, and serve it over HTTPS. The reader loads its math, diagram and PDF libraries from `cdn.jsdelivr.net`, so a Content-Security-Policy must allow that host. Optionally, give the hashed files in `pmd-reader-dist/` and `content/` a long cache lifetime and let the host compress text.

You can delete this file: nothing depends on it.
