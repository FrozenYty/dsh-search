# Changelog

What each released version of this bundle contained, newest first, in the shape
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) describes: one dated section per version, ISO
dates, and a later release adds a section above an older one instead of rewriting it.

`PROGRESS.md` remains the append-only engineering narrative — what was measured, what was rejected, the
commands that were run. This file is the release-level summary of that narrative and defers to it.

## [0.1.0] - 2026-11-13

- The bundle: `index.js` registers the `bing-html` provider with the `ctx.web` seam, `bing.js` performs
  the one request and parses the result page, and `cordis.patch.yml` moves the seam's `searchProvider`
  pin to it while restating the row's fetch half.
- The entry declares `@deepseek-ai/dsh-web` as a peer, which is what makes its one harness import resolve
  for a profile-linked bundle.
- Repository checks cover the manifest, the import rules, the locale pair, the patch rows, the documents,
  and the two request-layer regressions (acceptance item 3) offline.
- Parsing tests over two saved Bing result pages, and request-layer tests over a stubbed `fetch`.
