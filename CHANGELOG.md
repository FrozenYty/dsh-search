# Changelog

What each released version of this bundle contained, newest first, in the shape
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) describes: one dated section per version, ISO
dates, and a later release adds a section above an older one instead of rewriting it.

`PROGRESS.md` remains the append-only engineering narrative — what was measured, what was rejected, the
commands that were run. This file is the release-level summary of that narrative and defers to it.

## [0.1.3] - 2026-11-13

- The READMEs document all three install routes — `plugin_manager install_bundle`, `dsh plugin add` with
  a local path, and `dsh plugin add` with a release tarball — and carry the CI, licence and DSH-range
  badges the rest of the ecosystem uses. Why the package is not on npm is now said where a reader looks
  for the install command.
- No change to the bundle's behaviour.

## [0.1.2] - 2026-11-13

- An out-of-range numeric entity (`&#x110000;`, a decimal run too large, `&#0;`) stays literal text
  instead of making the parser throw away the whole search. A truncated response now degrades in one
  snippet; the mutation scan covers the guard.
- `main` is protected as the sibling repositories protect theirs: a pull request, a green `check`, no
  force-push, no deletion. This release is the first change to arrive through that path.
- A version is published by a tag: the `release` workflow re-runs the gate, refuses a tag that does not
  name the manifest's version, and attaches `dsh-search-<version>.tgz` with `SHA256SUMS.txt` — the
  install route that needs neither the npm registry nor GitHub at install time. `scripts/pack.mjs`
  builds the same tarball locally.

## [0.1.1] - 2026-11-13

- A mutation scan (`scripts/mutation-scan.mjs`) breaks one load-bearing line of `bing.js` at a time and
  requires the test suite to fail; it runs in CI, and a survivor blocks a merge.
- The parse tests pin the first result of the saved page field by field, and cover a page carrying the
  same URL twice — the gap the first scan run found.
- Bug and feature issue templates; `homepage` and the `mutation`/`acceptance` script entries in the
  manifest. No change to the bundle's behaviour.

## [0.1.0] - 2026-11-13

- The bundle: `index.js` registers the `bing-html` provider with the `ctx.web` seam, `bing.js` performs
  the one request and parses the result page, and `cordis.patch.yml` moves the seam's `searchProvider`
  pin to it while restating the row's fetch half.
- The entry declares `@deepseek-ai/dsh-web` as a peer, which is what makes its one harness import resolve
  for a profile-linked bundle.
- Repository checks cover the manifest, the import rules, the locale pair, the patch rows, the documents,
  and the two request-layer regressions (acceptance item 3) offline.
- Parsing tests over two saved Bing result pages, and request-layer tests over a stubbed `fetch`.
