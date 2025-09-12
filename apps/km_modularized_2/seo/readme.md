# SEO Assets Guide

This folder contains helper files that improve discoverability, sharing, and installability of your docs/wiki site.

> **Tip:** To activate these, move the files to your **site root, the same place as `index.html`** so they are served at the exact paths shown below.  

---

## Quick map

| File | What it does | Serve at (URL) | Link from `<head>`? |
|---|---|---|---|
| `robots.txt` | Tells crawlers what to crawl and where the sitemap is. | `/robots.txt` | No |
| `sitemap.xml` | Lists canonical URLs for discovery. | `/sitemap.xml` | No |
| `site.webmanifest` | PWA install metadata (name, icons, colors). | `/site.webmanifest` | **Yes**, `<link rel="manifest" href="/site.webmanifest">` (already in template) |
| `browserconfig.xml` | Windows tiles metadata (Edge/IE). | `/browserconfig.xml` | **Yes**, `<meta name="msapplication-config" content="/browserconfig.xml">` (already in template)|
| `opensearch.xml` | Lets browsers add your site search. | `/opensearch.xml` | **Yes**, `<link rel="search" type="application/opensearchdescription+xml" title="Your Wiki" href="/opensearch.xml">` (already in template)|
| `changelog.xml` | RSS feed for updates/news. | `/changelog.xml` | **Yes**, `<link rel="alternate" type="application/rss+xml" title="Changelog" href="/changelog.xml">`(already in template) |
| `humans.txt` | Human‑readable credits/about. | `/humans.txt` | No |
| `security.txt` | Security contact policy. | **`/.well-known/security.txt`** (also duplicate at `/security.txt`) | No |



## This should look like this:

```
/index.html
/robots.txt
/sitemap.xml
/site.webmanifest
/browserconfig.xml
/opensearch.xml
/changelog.xml
/humans.txt
/.well-known/security.txt   (in a `.well-known` folder at the root)
```
