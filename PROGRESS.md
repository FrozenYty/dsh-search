# Progress

Append-only, newest first: what was built, what was run, and what it printed. A release's entry is added
in the same pull request that delivers it, and an older entry is never rewritten. `PLAN.md` owns the
acceptance state; this file owns the evidence behind it.

## 2026-11-13 — v0.1.7, the list line settles

The owner chose among the 4+4 alternates offered in the previous entry:

```
locale/zh.json   「只搜网页，不花额度。」
locale/en.json   "Only pages, never the quota."
```

「额度」 is what a search draws on; 「余额」 was one step removed from it, so the line now names the thing
that goes missing rather than the thing that holds it. Same shape as 团队's 「只是换人，不是换活。」: two
four-character halves, one contrast. No behaviour change.

```
$ node scripts/check.mjs
check passed
```

Version 0.1.7, no tag — a locale file is a bundle file, so the number moves and the tag stays deliberate.

## 2026-11-13 — v0.1.6, the plugin list line joins the family

The owner's review of the plugin list: the description read as a complaint about the shipped provider
rather than as a claim about this one, and it did not have the shape the family's lines have.

### What changed

```
locale/zh.json   「只搜网页，不问余额。」
locale/en.json   "Only pages, never the balance."
```

That is two four-character halves with the same contrast 团队 uses (「只是换人，不是换活。」), and the two
things a reader can act on: what it fetches, and what it never consults. The previous line
(「真正的结果页，不是账户余额。」) set a result page against an account balance — two different categories,
which is why it read as a jab. No behaviour change, and the locale pair is the only bundle file that moved.

Version 0.1.6, with no tag: under `CONTRIBUTING.md` §5 a locale file *is* the bundle, so the number moves,
while a tag stays the deliberate act it is.

### What was verified

```
$ node scripts/check.mjs
check passed
```

The check covers the pair's parity, the titles and the two-character title rule; the description itself is
prose, and its test is the owner looking at the plugin list.

## 2026-11-13 — no more publishing: `main` is the distribution

The owner's call, in their words: this is for them and a few friends, so nothing is published and no tag
is needed. The repository stops treating a version bump and a release run as something every change owes.

### What changed

- `CONTRIBUTING.md` §5 is rewritten from "Releases" to "Versions, tags and tarballs": `CHANGELOG.md` is a
  log rather than a release contract, `package.json`'s version moves **only when the bundle changes**
  (tests, scripts, documents and workflows do not), and a tarball or a tag is a deliberate act — "hand me
  that state as one file" — not a step in the loop.
- Both READMEs lose the release-download route as a first-class install: the two local routes are the
  install, `git pull` on the linked tree is the update, and the tarball is mentioned as the one-file
  option for a friend.
- `PLAN.md` gains "How this ships", so the policy is not only in a chat message.

### What was not done, and why

- No version bump and no tag for this change, deliberately: under the new rule a documentation change
  does not move the version, and this is the first change that demonstrates it.
- The four existing tags and their releases (v0.1.2–v0.1.5) were left alone. They are history, they cost
  nothing, and one of them is a tarball somebody may still install. Deleting them is a separate decision
  the owner can make in one sentence; nothing in the workflow or the documents requires them.

## 2026-11-13 — v0.1.5, acceptance item 4 in a real profile

### What was run

The bundle was installed into the desktop profile at the owner's decision, and then used from the live
session that installed it — chat through a relay, the DeepSeek account balance at zero, which is exactly
the case this plugin exists for.

```
plugin_manager  install_bundle  target: <this repository>
{"stage":"enable","target":"dsh-search","enabled":true,"changed":true,"application":"applied",
 "bundle":"dsh-search","version":"0.1.4","warnings":[]}
```

pnpm's install output carried its standard warning for a linked package that declares peers —
"the linked in dependency will not resolve the peer dependencies from the target node_modules" — which is
expected here and is what ADR 0002 exists for: the Host resolves `@deepseek-ai/dsh-web` from its own
runtime table at import time. The install reported no warnings of its own.

Then, in the same session:

```
web_search { queries: ["DeepSeek Harness plugin market"] }
→ 8 sources, every URL absolute: dshmarket.com/zh, github.com/dsh-market/dsh-market,
  deepseekharness.online/plugins/dshmarket, dsh.market, deepseek-plugin.org, dsh-plugin.org,
  dshplugin.market, dsh-plugin.org/zh/tutorials/dsh-plugin-guide
```

### Why that is this provider serving the call, and not the shipped one

- The shipped `deepseek-official` provider answers `api.deepseek.com` with HTTP 402 while the balance is
  zero, so a search that returns sources cannot have been served by it.
- The only thing this install changed is what the seam selects: this bundle's patch moves
  `web.searchProvider` to `bing-html`, verified by composing the three layers with the loader's own
  `composeEntries` before anything was installed (`{"searchProvider":"bing-html","fetchProvider":"http"}`).
- The returned snippets carry the Bing result shape this parser produces — a relative age, a middle dot
  and the page's own text ("1 天前 · DeepSeek Harness 插件市场 …"), the same shape as the saved fixture's
  ("2026年8月12日 · DeepSeek Harness is in preview …") — rather than a model-written summary.

### What it means

Acceptance items 1–4 are all delivered. Items 1–3 were already covered by the offline gate and the live
acceptance run; item 4 is the one that needed the profile, and it is now recorded with the install output
and the search it served. The READMEs no longer say the plugin is unproven in a profile; what remains
outside this repository's reach is only that a *different* profile's activation is still its owner's
decision.

## 2026-11-13 — the CLI install route, and a duplicate that has to be argued

### What was investigated

- **`dsh plugin add` cannot complete on this machine.** The CLI exists only inside the npx cache
  (`0.1.5-rc.1`), and pnpm is not installed anywhere. Installing pnpm into a scratch prefix worked
  (`--ignore-scripts`, because its postinstall is spawned with a piped stdio the sandbox refuses), and a
  one-line `.cmd` was enough to make it callable — but `pnpm add` itself then failed:

  ```
  Error: ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK
    × adding a new package
    ╰─▶ Failed to open the store operation lock at "pnpm-store-operation-locks":
        拒绝访问。 (os error 5)
  ```

  It failed identically with `--store-dir`, `--state-dir` and `PNPM_HOME` pointed into the workspace, and
  with the lock directory pre-created: the lock is a Windows kernel object, and the sandbox denies opening
  it — the same boundary as the named-pipe denials seen elsewhere in this session. The profile the CLI
  created in a scratch `DSH_HOME` was removed afterwards; the real `~/.dsh` was never touched.
- **The community list already carries a Bing-backed provider**: `godchen520/dsh-web-search-bing`
  (category `browser`, the upstream of the `whiteS18/dsh-bing-search` fork that ADR 0001 measured). Under
  the list's "is it already covered" rule this plugin is not a blank slot, so its submission has to name
  what it adds — the fixed endpoint and the redirect that is never followed, with nothing to configure —
  in the pull request, not in the entry's one-line description.

### What it means

Both facts are recorded in `PLAN.md` with the exact next step: the CLI route needs an unsandboxed shell
(the owner's call), and the listing submission needs a day-old repository, the `dsh-plugin` topic the
owner declined, and an argument rather than a duplicate.

## 2026-11-13 — v0.1.4, the entry is covered

The entry was the one file nothing executed: `index.js` imports the seam, so the old unit tests could not
load it, and its registration and its translation of a provider failure into `WebError` were asserted
only structurally. That is now closed by loading the **real** seam.

### What was built

- `tests/entry.test.mjs` (four tests): `apply` registers exactly one provider under `bing-html`, that
  provider reports itself available and has no `ready()`, a search reaches the request layer and returns
  the page's sources, an empty query rejects with a **real `WebError`** carrying `WEB_PROVIDER_ERROR` and
  the provider failure as its `cause`, and an aborted search carries `WEB_ABORTED` through the same
  translation. When the seam is not resolvable the tests skip with that reason instead of failing.
- `scripts/mutation-scan.mjs` now mutates `index.js` too — four mutations, each killed by the entry test
  that names its claim — and its working copies moved from the system temp directory to `.mutation/`
  inside the repository, because the entry tests resolve the seam by walking up to `node_modules` and a
  copy elsewhere would skip and make an `index.js` mutation look killed for the wrong reason.
- CI and the release workflow install the seam before the tests (`npm install --no-save`), because the
  bundle itself installs nothing at runtime; `scripts/check.mjs` now fails when that step disappears, so a
  skipped entry test cannot become the permanent state.
- `CONTRIBUTING.md`, `AGENTS.md`, both READMEs and `docs/architecture` say what the entry tests prove and
  what they need; `PLAN.md` gains item A6.

### What was verified

```
$ npm install --no-save --no-package-lock @deepseek-ai/dsh-web
added 12 packages in 8s

$ node --test --test-isolation=none tests/*.test.mjs
ℹ tests 22
ℹ pass 22
ℹ fail 0
ℹ skipped 0

$ node scripts/mutation-scan.mjs
17 mutation(s): 17 killed, 0 not
mutation scan passed

$ node scripts/check.mjs
check passed
```

The four `index.js` mutations and the tests that killed them:

```
killed    registration-reports-unavailable      the entry registers exactly one usable provider under the frozen id
killed    registration-id-renamed               the entry registers exactly one usable provider under the frozen id
killed    provider-failure-untranslated         a provider failure reaches the seam as a real WebError carrying its code
killed    failure-code-flattened                a cancelled search carries WEB_ABORTED through the same translation
```

The skip path was exercised too, by renaming `node_modules` away and running the entry tests alone: all
four reported `# @deepseek-ai/dsh-web is not resolvable (ERR_MODULE_NOT_FOUND); run npm install to
exercise the entry tests`, and `node_modules` was restored afterwards. A skip is honest only because CI
never lets it happen, which is what the new check enforces.

## 2026-11-13 — post-v0.1.3: the published release, and the listing gate

### What was verified

The v0.1.3 release run, from the workflow's own job steps:

```
release  push  completed success
  release: success; The tag names this version=success, Repository checks=success, Unit tests=success,
  Mutation scan=success, Build the package tarball=success, Publish the release=success
```

The published assets, and the checksum checked against the tarball built here:

```
asset dsh-search-0.1.3.tgz  16362 bytes
asset SHA256SUMS.txt           87 bytes
published 64df118c94bf4b28a683ce8d4f5806dd12c3f71bed676206ada741d8f8e92057  dsh-search-0.1.3.tgz
local     64df118c94bf4b28a683ce8d4f5806dd12c3f71bed676206ada741d8f8e92057  dsh-search-0.1.3.tgz
match: true
```

So the artifact a user downloads is the artifact this repository builds, not a CI-only variant.

### What was investigated, and what it changed

- **The community list is data-driven.** `awesome-dsh-plugin` generates its READMEs from one YAML file per
  plugin (`data/plugins/<owner>__<repo>.yml`); editing the README by hand is the documented way a
  submission goes wrong. The draft for this plugin — category `browser`, the two descriptions — is in the
  session's scratch folder, and `PLAN.md` records where it goes.
- **Two of that list's automated requirements are unmet**, and neither is a defect in the plugin: the
  repository must be at least one day old (it was hours old when checked), and it must carry the
  `dsh-plugin` topic, which the owner declined. `PLAN.md` carries both so the next session does not
  rediscover them; a resubmission is explicitly not held against anyone.
- **`dsh plugin add` is the one documented route this repository has not executed** — the CLI is not on
  the PATH of the shell these checks run in. The local-path form and the release tarball are the routes
  the siblings and the release artifacts exercise; `PLAN.md` keeps the third as a task.

## 2026-11-13 — v0.1.3, the install routes

### What was built

- Both READMEs now document three install routes that all end in the same bundle: `plugin_manager
  install_bundle` from inside the Harness, `dsh plugin --profile <profile> add <local path>` from the CLI
  (the form a high-star peer documents), and `dsh plugin --profile <profile> add <release>.tgz` — the one
  that needs neither the registry nor GitHub at install time. The npm name belonging to another package
  is stated next to the install command rather than only in an ADR.
- Both READMEs carry the badges the ecosystem uses: the `ci` workflow's live status, the licence, and the
  DSH range the peer declaration admits.
- v0.1.2 was tagged and published: the `release` workflow re-ran the gate on the tag, built the tarball
  and attached it with `SHA256SUMS.txt`.

### What was verified

The v0.1.2 release run, from the workflow's own job steps:

```
release  push  completed success
  release: success; The tag names this version=success, Repository checks=success, Unit tests=success,
  Mutation scan=success, Build the package tarball=success, Publish the release=success
```

The release it published is tagged `v0.1.2` and carries the tarball; the release notes name the install
command and point at `CHANGELOG.md`.

For this version:

```
$ node scripts/check.mjs
check passed

$ node scripts/pack.mjs
dsh-search-0.1.3.tgz  16.0 kB  sha256 64df118c94bf4b28a683ce8d4f5806dd12c3f71bed676206ada741d8f8e92057
total files: 10
```

The digest the release run publishes with that tag is the one a download is checked against; the local
run and the workflow both build the tarball from the manifest's `files`, so the two agree on what is in
it.

## 2026-11-13 — v0.1.2, the release pipeline

Topics were removed from the repository at the owner's decision: the citation in the v0.1.1 entry below
records what was done then, and the repository now carries none, like its two siblings.

### What was built

- `scripts/pack.mjs`: builds the installable tarball with `npm pack` (which reads `files`, so the tarball
  is the bundle and nothing else), writes `SHA256SUMS.txt` beside it, and prints the checksum. npm runs
  through the shell with its output written to files, because a sandboxed child cannot open a pipe; the
  npm cache lives in a temp directory so nothing outside the workspace is written.
- `.github/workflows/release.yml`: a `v*` tag re-runs the gate, refuses a tag that does not name
  `package.json`'s version, builds the tarball, and publishes it with the checksum. A release download is
  the one install route that needs neither the npm registry (the package is `private`, and the npm name
  belongs to another package) nor GitHub at install time.
- `CONTRIBUTING.md` gains the release procedure as its §5 and the later sections are renumbered;
  `AGENTS.md` gains the rule that a release is a tag rather than an edit; both READMEs and
  `CHANGELOG.md` say what a release is.

### What was verified

```
$ node scripts/pack.mjs
dsh-search-0.1.2.tgz  15.0 kB  sha256 0d9d8890ee41c3171cf4bdb055e04b4a26a06eb5606abaf3cf41c0873811d7d3
total files: 10

$ tar -tzf dist/dsh-search-0.1.2.tgz
package/LICENSE  package/README.md  package/README-zh.md  package/bing.js  package/cordis.patch.yml
package/icon.svg  package/index.js  package/locale/en.json  package/locale/zh.json  package/package.json
```

The manifest inside the tarball is the same one on disk, including `dsh.bundle.patch:
./cordis.patch.yml`, so an install from the tarball mounts the bundle the repository documents.

## 2026-11-13 — v0.1.2, a malformed entity degrades instead of throwing

### What was built

- `decodedCodePoint` in `bing.js`: a numeric entity outside the Unicode range — `&#x110000;`, a decimal
  run too large to be a code point, or `&#0;` — stays as its literal text. `String.fromCodePoint` throws
  on the first two, and a parser that throws loses the whole search over one entity in one snippet; this
  degrades in the text instead, which is visible and harmless.
- A test for both directions: the invalid forms stay literal, and a valid entity in the same string is
  still decoded. A mutation drops the guard, and that test kills it.
- The risk table in `docs/architecture-en.md` and `docs/architecture-zh.md` gains the row for a truncated
  or corrupted response.

### What was verified

```
$ node --test --test-isolation=none tests/*.test.mjs
ℹ tests 18
ℹ pass 18
ℹ fail 0

$ node scripts/mutation-scan.mjs
killed    invalid-entity-throws                 a numeric entity outside the Unicode range stays text instead of failing the parse
…
13 mutation(s): 13 killed, 0 not
mutation scan passed

$ node scripts/check.mjs
check passed
```

### The repository

- `main` is protected the way the sibling repositories protect theirs: a pull request is required, the
  `check` job must be green, administrators are included, and force-pushes and deletions are refused.
  This release is the first change that arrived through that path rather than by pushing to `main`.
- The merged `chore/quality-gate` branch was deleted on merge, which is the repository setting rather
  than a habit.

## 2026-11-13 — v0.1.1, the quality gate

### What was built

- `scripts/mutation-scan.mjs`: twelve mutations, one per load-bearing line of `bing.js` — the endpoint,
  the redirect policy, the block token, the heading anchor, the snippet shape, URL deduplication, the
  scheme filter, entity decoding, tag stripping, the non-2xx branch, the empty-page failure and
  cancellation. Each is applied to a copy of the module in a throwaway directory, and the whole test
  suite is run against it.
- CI runs it, so a line no test stands behind blocks a merge.
- Test assertions strengthened where the scan found a gap, and one added: the same URL twice on a page is
  one source, and the first result of the saved page is pinned field by field.
- `.github/ISSUE_TEMPLATE/`: bug and feature templates, in the shape the sibling repositories use.
- `package.json`: `homepage`, and the `mutation` and `acceptance` script entries.

### What was verified

```
$ node --test --test-isolation=none tests/*.test.mjs
ℹ tests 17
ℹ pass 17
ℹ fail 0

$ node scripts/mutation-scan.mjs
killed    endpoint-moves-to-www                 a relative or non-web link is resolved against the endpoint or dropped
killed    redirect-is-followed                  one search is one GET against the endpoint, with the query encoded and no redirect followed
killed    result-block-token-changes            a saved result page yields at least five complete sources
killed    title-reads-any-anchor                a saved result page yields at least five complete sources
killed    snippet-shape-changes                 the same URL twice on a page is one source
killed    duplicate-urls-are-kept               the same URL twice on a page is one source
killed    non-web-scheme-is-kept                a relative or non-web link is resolved against the endpoint or dropped
killed    html-tags-are-kept                    a saved result page yields at least five complete sources
killed    entities-are-kept                     a saved result page yields at least five complete sources
killed    http-status-is-ignored                a redirect is reported, not followed
killed    empty-page-is-a-success               a 200 page with no result block fails loudly instead of answering with nothing
killed    cancellation-is-a-transport-failure   a cancellation during the request is WEB_ABORTED, not a transport failure

12 mutation(s): 12 killed, 0 not
mutation scan passed
```

The first run of the scan was not clean, and that is the point of it: `duplicate-urls-are-kept` survived,
because neither saved page happens to carry the same URL twice. The fix was a test, not an assertion
weakened to fit — a synthetic page with one URL in two blocks — and the scan then killed it. The
`title-reads-any-anchor` mutation was added at the same time, because the first result of the saved page
is the one place where the heading anchor and the site-icon anchor point at the same destination.

### The repository

- Published at `https://github.com/FrozenYty/dsh-search`, with the About description written in the
  sibling repositories' shape, and topics (`deepseek-harness`, `dsh-plugin`, `web-search`,
  `search-provider`, `bing`) — the siblings carry none, and the ecosystem search finds plugins by them.
- Settings: squash-only merges, delete-branch-on-merge, wiki off — the wiki carries nothing this
  repository does not, which is the same choice the sibling plugin made.
- The `ci` workflow ran on the pushed commit and completed successfully: modules parse, unit tests,
  mutation scan, repository checks.

## 2026-11-13 — v0.1.0, the first bundle

### What was built

- `bing.js`: the query, the request, the parse and the result mapping, with no import at all. The
  endpoint is the constant `https://cn.bing.com/search`, the request sets `redirect: "manual"`, and a
  page that yields no source is a failure rather than an empty result.
- `index.js`: the bundle entry. It builds the provider, registers it with `ctx.web`, and translates the
  provider's own failure into the seam's `WebError`; it imports `@deepseek-ai/dsh-web` and nothing else.
- `cordis.patch.yml`: moves the seam's `searchProvider` pin from `deepseek-official` to `bing-html` and
  restates `fetchProvider: http`, because the seam replaces a row's `config` wholesale.
- `package.json`: `dsh-search`, `private`, with `@deepseek-ai/dsh-web` declared as a peer — the field
  that makes the entry's import resolve for a profile-linked bundle.
- `locale/en.json` / `locale/zh.json`: `Search` / `搜索`, with the same keys.
- `tests/`: parsing tests over two saved result pages, request-layer tests over a stubbed `fetch`, and
  `tests/fixtures/` with the two captured pages and their provenance.
- `scripts/check.mjs`: the repository gate, including acceptance item 3 asserted at the request layer.
- `scripts/acceptance.mjs`: the manual half — acceptance items 2 and 3 against the live endpoint.
- Documents: the README pair, `docs/architecture-en.md` + `docs/architecture-zh.md`, the index pair, and
  ADRs 0001–0003.

### What was verified

#### The modules parse as ESM

```
$ node --check index.js && node --check bing.js
(no output; exit 0)
```

#### Unit tests, over the saved pages and a stubbed request layer

```
$ node --test --test-isolation=none tests/*.test.mjs
✔ a saved result page yields at least five complete sources
✔ a second saved page parses too, so the parser is not tuned to one query
✔ a class list that carries more than the b_algo token still starts a block
✔ a block without a heading link is not a result
✔ a relative or non-web link is resolved against the endpoint or dropped
✔ a page with no result block parses to no sources
✔ decodeHtml reads the entity forms Bing emits
✔ one search is one GET against the endpoint, with the query encoded and no redirect followed
✔ the query is trimmed, and an empty one never reaches the network
✔ a redirect is reported, not followed
✔ a non-2xx answer is a provider error naming the status
✔ a 200 page with no result block fails loudly instead of answering with nothing
✔ a challenge page is named as a challenge, not as an empty result set
✔ a transport failure is a provider error carrying its cause
✔ an already-cancelled search is WEB_ABORTED and never dispatches
✔ a cancellation during the request is WEB_ABORTED, not a transport failure
ℹ tests 16
ℹ pass 16
ℹ fail 0
```

#### Repository checks

```
$ node scripts/check.mjs
check passed
```

`check.mjs` is offline: the request-layer assertion drives the provider's real `search()` with
`globalThis.fetch` replaced by a stub that answers with the saved fixture and records the URL.

#### The Host accepts the peer declaration

The compatibility rule compares every `@deepseek-ai/dsh-*` peer range against the runtime version, which
is the app-boot package's own release. The declared range was evaluated with the installed `semver`, using
the same call shape the Host's check uses:

```
$ node -e "…semver.satisfies(v, '>=0.1.5-rc.1 <0.3.0-0', {includePrerelease: true})…"
0.1.5-rc.2 -> true
0.2.2-rc.1 -> true
```

The first number is the runtime of the older command-line installation still materialised in the profile's
module table; the second is the runtime of the desktop application this was built against. Both are inside
the declared range, so neither runtime refuses the manifest. What that does **not** prove is that a profile
resolves the peer at import time — only an enabled profile can show that.

#### The composed patch moves the pin

The patch was fed to the installed loader's own composition function, together with the two shipped
bundles it layers over (a scratch script: read the installed base and web-app patches, append this
bundle's, call `composeEntries`). Nothing was installed into a profile for this — the profile's own
`package.json` was not touched.

```
warnings: none
row web: {"name":"@deepseek-ai/dsh-web","config":{"searchProvider":"bing-html","fetchProvider":"http"}}
row web-search-bing-html: {"name":"dsh-search"}
```

No warning means both of this bundle's entries found their target and applied: a patch whose `id`
matched no row, or whose `insert` was malformed, is warned about and skipped rather than failing. The
composed `web` row carries the moved pin and the restated fetch half, and this bundle's row is present.

#### Live acceptance, items 2 and 3, at the request layer

```
$ node scripts/acceptance.mjs "deepseek harness"
query: deepseek harness
endpoint constant: https://cn.bing.com/search
requests recorded at the request layer: 1
  cn.bing.com  https://cn.bing.com/search?q=deepseek+harness
hosts: cn.bing.com
sources: 10
  https://www.deepseek.com/harness/
    title: DeepSeek Harness | Explore the limits of intelligence
    snippet: 2026年8月12日 · DeepSeek Harness is in preview, with evolving core plugins and APIs. We invite users and developers worldwide to …
  … (the remaining nine sources are omitted here; the run printed each of them with an absolute https URL, a title and a snippet)
acceptance 2 and 3 passed
```

The request layer is the wrapped `fetch`: one request, to one host, and the host list printed above is
what left the process. Nothing was sent to `www.bing.com` or to `api.deepseek.com`.

#### The regression check can fail

A green check is only evidence if the check can go red. The endpoint constant was changed to
`https://www.bing.com/search` — the host the plugin promises never to request — and the repository gate
was run again:

```
$ node scripts/check.mjs
check failed: 2 problem(s)
  - request layer: a request went to www.bing.com; the only host this provider may request is cn.bing.com
  - request layer: a request went to www.bing.com, and www.bing.com is forbidden (acceptance item 3)
```

The constant was then restored, `bing.js` re-read to confirm the restored line, and the gate re-run:
`check passed`. The assertion is at the request layer, not in the source — it fired because the recorded
request URL changed, with the code still parsing.

### What is not verified

Acceptance item 4 — a real session, chat through the relay, the DeepSeek balance still at zero, and
`web_search` returning real results — is open. It needs the bundle enabled in a profile, and enabling it
is the owner's decision; nothing in this repository loads the Harness. The enable command and what to
look for are in `README.md`, and the item stays unticked in `PLAN.md` until it has been run.
