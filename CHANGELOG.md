# Changelog

What each released version of this bundle contained, newest first, in the shape
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) describes: one dated section per version, ISO
dates, and a later release adds a section above an older one instead of rewriting it.

`PROGRESS.md` remains the append-only engineering narrative — what was measured, what was rejected, the
commands that were run. This file is the release-level summary of that narrative and defers to it.

## [0.4.0] - 2026-11-15

- **The bundle now owns the fetch half.** `web_fetch` runs through `article`, a provider that reads the page
  itself and hands over its prose instead of its markup. The measurement that forced it: on five real pages,
  **61 % of the characters the model received were chrome** by a lower bound and prose inside `<p>` was
  **1.4 %**; on three of the five, the shipped provider's 100 000-character body cap was reached **before the
  article began**, so a delegating provider could not recover the tail whatever it did with what arrived.
  `docs/adr/0010-the-other-half-of-the-result.md` supersedes ADR 0004's fetch clause, borrows that provider's
  policy numbers (User-Agent, same-origin redirects only, a 5 MB read cap, the declared charset) and records
  what it refuses to build: no readability engine, no per-site rules, no model summarising.
- The extraction is one rule: remove the containers that are never prose, drop navigation lists whose words
  are the anchors' words, keep headings, paragraphs, quotations, code and tables in document order, cap at
  24 000 characters **with a marker**, and never paste a half-open tag at a page cut into the text.
- A redirect that changes origin is reported with the target instead of followed; a non-2xx answer is a
  result, not a throw; an unusable URL is named rather than attempted.
- Eleven tests for the fetch half, three new page fixtures with their provenance, and five new mutations —
  the scan grows to 35, all killed.

## [0.3.0] - 2026-11-15

- **A page parsed in the last five minutes answers the same query again**, up to 32 entries, least recently
  used first, and **a failure is never reused** — a challenge page wants a retry, not a memory of being
  blocked. Results are copied in and out, so a caller that truncates or annotates what it received cannot
  edit the cache. `docs/adr/0008-reusing-a-recent-page.md` supersedes ADR 0004's "no cache" clause; the one
  request-per-search property becomes one request per *miss*, which is what acceptance item 3 already runs.
- **The response body is decoded with the charset it declares**, falling back to UTF-8 for an unusable label.
  `Response.text()` decodes UTF-8 whatever the header says, so a mis-declared page used to arrive as
  correct-looking mojibake with an unchanged source count — the one failure mode the fixture-drift job cannot
  see.
- `docs/adr/0009-the-survey-and-its-refusals.md` records the survey of Claude Code, Codex, PI and the mature
  scrapers, corrects ADR 0005's account of how Claude Code's search and fetch are actually wired, and refuses
  eight well-argued upgrades by name with the measurement that refuses each (retry, URL normalisation, snippet
  cap, off-topic guard, body cap, provider timeout, error taxonomy, and what ADR 0004 already refused).
- Six tests for the reuse window and two for decoding; the mutation scan grows to 30, all killed.

## [0.2.0] - 2026-11-15

- **The patch row id is `search`**, the package name without its `dsh-` prefix — matching `dsh-memory`
  (`memory`) and `dsh-cleaner` (`cleaner`) — instead of `web-search-bing-html`, which described the slot the
  bundle fills rather than the bundle. A profile overrides it as `- id: search`. An override still written
  against the old id stops matching, and a patch that targets no row is skipped with a warning rather than
  an error, which is the one cost of this version; nothing in this repository's own profile pays it.
  `docs/adr/0007-row-id-follows-the-package-name.md` supersedes that part of ADR 0003. The provider id
  `bing-html` and the package name `dsh-search` are unchanged, so `searchProvider` and existing installs
  keep working.
- `scripts/check.mjs` derives the expected row id from `package.json`'s name instead of comparing against a
  second literal, so the two cannot drift apart again in either direction.

## [0.1.9] - 2026-11-13

- **The owner chooses who searches.** This bundle's row now carries `provider`, with three values:
  `keyless` (the default, unchanged behaviour), `official` (the shipped DeepSeek provider serves the
  search, on its account), and `auto` (the shipped provider when it can run, keyless otherwise, with a
  failed account remembered for the rest of the process so a zero balance is paid for once). Asking for
  `official` when it cannot run fails with the seam's own code rather than silently searching somewhere
  else. `docs/adr/0006-choosing-the-search-provider.md` records why the field exists and why a settings
  panel, two unpinned providers or a per-call argument would not do.
- Seven routing tests, and four mutations for the new branches — 24 in the scan, all killed.
- The READMEs' "Switching back" section becomes "Choosing who searches": the three modes, the trade, and
  the seam-level override as the blunter alternative.

## [0.1.8] - 2026-11-13

- A stated publication date in front of a snippet is now carried as `publishedAt` (`YYYY-MM-DD`) instead of
  being the snippet's first words, because the seam has a field for it and the tool renders it as metadata.
  An *age* (`7 小时之前`) stays in the snippet — it is a claim about the moment of the search, not a date —
  and a date that names no real day (`2026年2月31日`) stays text rather than rolling over into a fake one.
- A third saved page, `tests/fixtures/bing-dated-snippets.html`, is what tests this: eight of its ten
  results state a date. Three mutations join the scan (the date staying in the snippet, the rollover check,
  and the field itself), all killed.

## [0.1.7] - 2026-11-13

- The list line settles on the owner's pick: 「只搜网页，不花额度。」 — 「额度」 is the thing a search
  actually draws on, where 「余额」 was one step removed. English mirrors it: "Only pages, never the quota."
  A locale file is a bundle file, so the version moves; no tag follows it (CONTRIBUTING §5).

## [0.1.6] - 2026-11-13

- The plugin list line reads like the rest of the family's: 「只搜网页，不问余额。」 — the same two
  four-character halves and the same contrast as 团队's 「只是换人，不是换活。」, instead of contrasting a
  result page against an account balance. English: "Only pages, never the balance."
- No behaviour change; the locale pair is the only bundle file that moved, which is why the version does
  and no tag follows it.

## [0.1.5] - 2026-11-13

- Acceptance item 4 is delivered: the bundle was installed into a desktop profile and `web_search`
  returned eight live sources in a session whose chat runs through a relay while the DeepSeek account
  balance is zero. The READMEs no longer say the plugin is unproven in a profile, and `PROGRESS.md`
  records the install output, the search, and how the serving provider was identified.
- No change to the bundle's behaviour.

## [0.1.4] - 2026-11-13

- `tests/entry.test.mjs` covers the entry by loading the **real** `@deepseek-ai/dsh-web`: that `apply`
  registers one provider under `bing-html`, that it reports itself available and has no `ready()`, that a
  search reaches the request layer, and that a provider failure arrives as the seam's `WebError` carrying
  `WEB_PROVIDER_ERROR` or `WEB_ABORTED`. That translation was the one line no test executed.
- The mutation scan now covers `index.js` as well as `bing.js` — 17 mutations, each killed by the test
  that names its claim — and its working copies moved into `.mutation/` inside the repository so the entry
  tests resolve the seam there too.
- CI and the release workflow install the seam before the tests; `scripts/check.mjs` fails if that step
  disappears, because without it those tests skip instead of failing.

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
