# dsh-search

[Chinese](README-zh.md)

[![ci](https://github.com/FrozenYty/dsh-search/actions/workflows/ci.yml/badge.svg)](https://github.com/FrozenYty/dsh-search/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.1.5--rc.1%20..%20%3C0.3.0-brightgreen)](https://github.com/deepseek-ai/deepseek-harness)

> A real result page, not an account balance.

A DeepSeek Harness profile bundle that gives the `web_search` tool a search backend which needs no API
key, no account balance and no model call. It registers both halves of the web seam: `bing-html` searches
Bing's public result page, and `article` hands `web_fetch` a page's prose instead of its markup. Search
keeps working when the account behind the shipped provider has run out — the failure that makes chat work
and every search fail — and a fetched page costs the context its article rather than its navigation.

[github.com/FrozenYty/dsh-search](https://github.com/FrozenYty/dsh-search)

## Status

- Current version: v0.5.1.
- **Verified here**: the parser over the saved result pages, the request shape over a stubbed request
  layer, and a mutation scan that breaks each load-bearing line of `bing.js` and requires a test to
  notice — `node --test`, `node scripts/mutation-scan.mjs` and `node scripts/check.mjs`, all recorded
  with their output in `PROGRESS.md`. The live search was run by hand against `cn.bing.com` and answered
  with real sources; that run and its output are in `PROGRESS.md` too.
- **Exercised in a real profile**: installed into a desktop profile on 2026-11-13, and `web_search`
  returned eight live sources in a session whose chat runs through a relay while the DeepSeek account
  balance is zero — the case this bundle exists for. The install output, and why it is that provider
  serving the call, are recorded in `PROGRESS.md`.
- **Not automatic**: `scripts/check.mjs` and the tests never load the Harness, so the live check above is
  a manual step each time. Nothing in this repository can show that the plugin activates in *your*
  profile.
- Release list: [CHANGELOG.md](CHANGELOG.md). Append-only history: [PROGRESS.md](PROGRESS.md).

## Install and verify

Two routes, and both put the same bundle into a profile and apply its patch. Neither needs a build step and
neither touches the npm registry: for a project this size the working tree **is** the distribution — clone
it, install that path, and `git pull` is the update.

**From the Harness** — ask for this directory to be installed:

```
plugin_manager  install_bundle  target: <absolute path to this repository>
```

**From the CLI**, with the same local path — the route the rest of the plugin ecosystem documents:

```sh
dsh plugin --profile <profile> add <absolute path to this repository>
```

Nothing is published, and a linked working tree picks up a `git pull` on the next load — that is the whole
update story. To hand it to a friend, send them the repository: `git clone`, or **Code → Download ZIP**,
which is already installable because nothing here needs a build. They install that folder with either route
above, restart the app, and the plugin list shows the bundle under the title **Search** in an English UI (its
own two-character Chinese title in a Chinese one).

That this package is not on npm is deliberate: the name `dsh-search` there belongs to an unrelated
package, and this one is `private` — it is linked or installed from a file, never published
(`docs/adr/0003-provider-id-and-plugin-name.md`).

Whichever route you use, the patch moves the web seam's `searchProvider` to `bing-html` and restates the
row's fetch half. That is the part that makes the provider selected, and it changes the profile for every
session in it — see below.

Verification afterwards is live calls, not check output:

- the patch applies with no warning about the rows it targets, and the plugin inventory lists this
  bundle under the title **Search** in an English UI (a Chinese UI shows its Chinese title);
- ask a question that needs the web in a session whose chat goes through a relay while the DeepSeek
  account balance is still zero. `web_search` should return sources with absolute URLs, where it used to
  fail with an HTTP 402 from `api.deepseek.com`;
- the failure that proves it was this provider, not the shipped one: a search no longer mentions
  `api.deepseek.com`, and fetching one of the returned URLs with `web_fetch` returns the page's prose —
  what this bundle's `article` provider extracts — instead of its navigation.

To stop using it, override the same row in the profile's own `cordis.patch.yml` — that layer is applied
after this bundle's, so it wins:

```yaml
- id: web
  config:
    searchProvider: deepseek-official
    fetchProvider: http
```

## How it works

One search is one HTTPS `GET` to `https://cn.bing.com/search?q=…`, and the response body is parsed for
its organic result blocks. Each block contributes a title, an absolute URL and a snippet, plus the
publication date when the page states one — lifted out of the snippet and normalised, because the seam
carries it as its own field and the tool shows it as metadata. The seam caps the list at the caller's
`maxResults`. Nothing is sent to an account, nothing is billed, and no model call is involved.

A page Bing itself marks as holding no results returns an empty list, which the seam allows. That is
deliberate: `web_search` aborts every query in one call on the first provider failure, so throwing on an
unproductive query would lose the sources the other queries found. A page that yields nothing **without**
that marker is still drift, and still fails loudly.

The request never touches any other host. `www.bing.com` redirects to `cn.bing.com`, and this provider
sets `redirect: "manual"`, so a redirect is never followed — it becomes an error naming its target
instead. `scripts/check.mjs` asserts at the request layer that one search sends exactly one request, to
`cn.bing.com`, and never to `www.bing.com` or `api.deepseek.com`.

## Choosing who searches

A profile with this bundle has two searches available: the keyless one it registers, and the shipped
`deepseek-official` provider, whose credential the profile may still carry. **The choice is yours**, and it is
one field on this bundle's row:

```yaml
- id: search   # `web-search-bing-html` before 0.2.0 (ADR 0007)
  config:
    provider: keyless   # keyless (default) | official | auto
```

- `keyless` — Bing's result page: no account, no key, no balance. The default, and what every earlier
  version did.
- `official` — the shipped provider serves the search, billed to the same account as the chat. If the
  seam's registry does not contain it the search fails with `WEB_PROVIDER_CONFIGURED_MISSING`; if its own
  synchronous `available()` says it cannot run, with `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`. **Neither code
  inspects a credential or a balance — this bundle cannot see either.** A dead account therefore passes the
  gate and fails at search time with the provider's own `HTTP 402`, and the message names the provider you
  asked for: a deliberate choice should not quietly become a different one
  (`docs/adr/0014-the-official-mode-can-only-detect-presence.md`).
- `auto` — the shipped provider when it can run, keyless otherwise. A failing account is remembered for the
  rest of the process, so a zero balance costs one doomed request rather than one per search.

Measured on this machine the account sits at `-0.09 CNY` with `is_available: false`, so `keyless` and `auto`
are the modes that answer today and `official` becomes useful the moment the balance is topped up.

A profile can also take this bundle out of the path entirely by overriding the seam's own row in its
`cordis.patch.yml` — that layer is applied after a bundle's, so it wins:

```yaml
- id: web
  config:
    searchProvider: deepseek-official
    fetchProvider: http
```

That is the blunter instrument: no `auto`, and this bundle's error messages go with it. Both switches are one
line; the difference is whether you want the fallback.

## The other half: `web_fetch`

The seam has two halves, and this bundle owns both: `bing-html` searches, `article` fetches. The patch pins
`fetchProvider: article` while it overrides the `web` row — the seam replaces a row's config wholesale, so
without that line the fetch half would fall back to auto-selection.

Why a provider of its own: the shipped `http` provider hands over a page's markup, chrome and all. Measured
on five real pages, **61 % of the characters were chrome by a lower bound** (`script`, `style`, `nav`,
`header`, `footer`, `aside`, comments) and prose inside `<p>` was **1.4 %** of what arrived; on three of the
five the shipped provider's 100 000-character body cap was reached **before the article began**, so the tail
was never read and no transformation of what arrived could recover it. The `article` provider therefore
reads the page itself, with the shipped provider's own numbers (its User-Agent, same-origin redirects only,
a 5 MB read cap, the charset the response declares), extracts the prose, and hands over `text` — which the
tool passes through instead of running its own markdown pass
(`docs/adr/0010-the-other-half-of-the-result.md`).

It is a rule, not a readability engine: keep the container the page itself names — its `<article>`, its
`<main>`, or the `<p>`-richest element whose id or class says content — drop the elements the page marks as
hidden, remove the containers that are never prose, drop navigation lists **and tables** whose words are
the anchors' words — unless the block carries a paragraph, which is content whatever its link density —
keep headings, paragraphs, quotations, code and tables in document order, drop the lines that are only a
page's own furniture, and **say so when it caps at 24 000 characters** — a truncated page that looks
complete is worse than one that says it was cut. A redirect that changes origin is reported instead of
followed, naming the target; a non-2xx answer is a result, not a throw.

The User-Agent is one decision for the whole bundle, and it is the honest one. Measured across six real
pages, a desktop Chrome disguise was not an improvement:

| Host | Product UA (shipped) | Desktop Chrome UA |
|---|---|---|
| `zhuanlan.zhihu.com` | 403 — Zhihu's own block | 403, unchanged |
| `blog.csdn.net` | 200, 317 kB | **521, 2 kB — worse** |
| `juejin.cn`, `developer.aliyun.com`, `github.com`, `deepseekharness.online` | 200 | 200 |

So the default stays: a browser disguise wins nothing here and loses CSDN's whole page, and the sites the
shipped provider cannot fetch are ones whose anti-bot rejects a sessionless client whatever it claims to
be. `web_fetch` reports the status it actually got, which is the honest answer to give a model.

## The one composition change

Registering a provider is not enough to be selected. The shipped base bundle pins the seam's
`searchProvider` to `deepseek-official` and its `fetchProvider` to `http`, so this bundle's patch moves both
pins and restates the row's every field — the seam replaces a row's `config` wholesale, never merges it, so
both lines have to be written out again or that half would lose its backend.

That is the whole footprint: one row override and one inserted row. It changes the profile the bundle is
installed into, for every session in it, which is why it is stated here rather than buried in the patch.

### Installing is a patch; uninstalling is its absence

Nothing is written into the profile's own files. The footprint is those two entries in this bundle's
`cordis.patch.yml`, and a patch file is read only while the bundle is installed:

| Installing adds | Removing takes back |
| --- | --- |
| one row override — `web`, restating `searchProvider` and `fetchProvider` | the base bundle's own pins return (`deepseek-official`, `http`) |
| one inserted row — `search`, this bundle's config | that row is gone |
| the bundle entry in the profile's list, and the path it links | both, by the uninstall that removes them |

Nothing else is touched: no data directory (ADR 0011), no settings, no hand-edited profile file, and **no
`disabled:` toggle anywhere in the patch** — this bundle never switches off a plugin it does not own, so
uninstalling it cannot silently change what something else does. That is a gate rule, not a promise:
`scripts/check.mjs` fails by file and line if a `disabled` key ever appears
(`docs/adr/0013-installing-is-a-patch.md`).

## Limits and deliberate omissions

- **One engine, one endpoint, and that is a measurement rather than a shortcut.** Bing's HTML result page is
  the only backend that answers this machine with parseable, directly-linkable results: Google,
  DuckDuckGo, Brave and a SearXNG instance are unreachable here, Mojeek answers `403`, Sogou redirects to
  itself, 360 wraps every result in a redirect `web_fetch` will not follow, and Baidu starts answering with
  a captcha after about eight requests. `docs/adr/0004-one-backend-measured.md` has the table;
  `node scripts/probe-backends.mjs` re-asks the network whenever it may have changed.
- **A markup change is a real risk.** The parser reads a page, not an API. A page that stops matching it
  fails with `no parseable result block` instead of quietly returning nothing, and the saved fixtures
  under `tests/fixtures/` are how that shows up as a failing test rather than as a mystery. Bing's own
  no-results page is the one empty answer the provider returns, and it is read from the page's own marker,
  so it cannot be confused with markup that stopped parsing.
- **One page, about ten results, and that is this endpoint's ceiling.** No paging, no retries — and not for
  lack of trying. Measured three ways: every offset and count returns page one's ten results
  (`count=20/30/50`, `first=11/21/31`, the page's own "next" link with its `FPIG` hash, the same with the
  `set-cookie` values from the first response sent back **and** a `Referer`), Bing's RSS form
  (`&format=rss`) carries ten items and ignores `count` and `first` alike, and the runs used broad queries
  (`python tutorial` and a Chinese query) so a small result set could not be mistaken for a paging failure.
  **The fetch half does not retry either**, and that was measured the day after two unexplained transport
  failures: 50 requests across five hosts returned **0 transport failures**, and retrying a failure nobody
  can reproduce would be code nothing protects. The same run did find that `blog.csdn.net` answers non-2xx
  9 times out of 10 when requested in a loop — an anti-bot behaving normally, and the reason a non-2xx
  answer comes back as a result instead of a throw.
- **One failing query fails the whole `web_search` call, and that is the tool's behaviour, not this
  bundle's.** `dsh-tool-web` aborts every query in a call on the first provider rejection, so a batch where
  one query is challenged or loses its connection returns that error and no sources from the queries that
  succeeded. The one case this half can turn into a legal answer is a page that *says* the query has no
  results: that is an answer, not a failure, so it is returned as an empty source list and the other queries
  survive. Making a *failure* survive the same way would need the tool to collect per-query outcomes, which
  is upstream of this bundle.
- **The cap is the tool's own default — you do not need to change it, and this bundle works with no edit to
  your profile.** One `web_search` merges up to
  `searchMaxQueries` queries (default 4) into at most `searchMaxResults` sources (default 8) — the schema
  defaults of `@deepseek-ai/dsh-tool-web`. The host `tool-web` row is **disabled by the web app**, and the
  `web_search` a session runs is a child of that session's agent preset, declared with `fetch` and
  `searchTimeoutMs` and no cap — so a profile row `- id: tool-web` composes to 24 and the tool still
  measures 8: preset children are not loader rows, and the patch never reaches them. The addressable row is
  the preset declaration, and overriding it means restating its **complete** `config` (`id`, `order` and the
  whole `plugins:` list), because a patch replaces `config` wholesale and the preset is registered as a
  whole — a config that names one child drops every child it leaves out:

  ```yaml
  # The shipped row's complete config, copied from the app's
  # presets/standard.patch.yml, with one child changed. Not a snippet to paste in
  # half: `plugins:` must carry every entry, `!!js` expressions included, or that
  # tool disappears from the preset.
  - id: preset-standard
    config:
      id: standard
      order: 1
      plugins:
        # … every child of the shipped list, then the one change: …
        - id: tool-web
          name: '@deepseek-ai/dsh-tool-web'
          config:
            fetch: true
            searchTimeoutMs: 60000
            searchMaxResults: 24
        # … and the rest of the list …
  ```

  Three of the four shipped presets declare that child — `preset-standard` (`standard`), `preset-ptc`
  (`ptc`) and `preset-cordis` (`cordis`); `preset-minimal` declares no `tool-web` at all — so a session on
  another preset needs the same override written against that row. The change applies to the **next Agent
  created**, not to a session already running. Asking two or three sub-queries in one call is still what
  widens the net within one call, and a second `web_search` is how to see more. How to tell it is live: the
  tool appends `(Showing the first N sources…)` **only when the seam truncated**, so that line disappearing
  is the change taking effect. `docs/adr/0012-the-cap-lives-in-the-agent-preset.md` has the layer order, the
  citations and the reason a profile row cannot reach the child.
- **A page parsed in the last five minutes answers again.** Five minutes, at most 32 pages, the
  least-recently-used one evicted first, and a failure never kept — a challenge page wants a retry, not a
  memory of being blocked (`docs/adr/0008-reusing-a-recent-page.md`). It is the one case where a search costs
  no request; every other clause in this list still holds.

  A saved edit to the profile's patch file needs no restart: the enabled `hmr` row watches those files, and
  the profile is recomposed when one changes. (`dsh.profile.patchReload` is not read by this build at all.)
  What no reload can reach is an agent preset: it is expanded when an Agent is created, so an existing
  session keeps the composition it started with and the new composition is the next Agent's.
- **A result link that Bing wraps in its own redirect** (`cn.bing.com/ck/a?…`) would be returned as that
  wrapper URL rather than unwrapped. It has not happened once in 80 measured results, so the parser does
  not unwrap; `PLAN.md` records the measurement.
- **Query operators are hints, not filters.** Measured on this endpoint: `site:github.com` alone was
  honoured on all ten results, `site:github.com dsh` on one and `site:github.com dsh plugin` on two;
  `intitle:` and quotation marks changed nothing measurable. Write the query you mean and treat an operator
  as a nudge, not a guarantee.
- **No domain filter.** The seam's search request carries a query and a result bound, nothing else, so a
  provider cannot receive `allowed_domains`/`blocked_domains`-style filters — that is a limit of where this
  sits, not of the engine. Writing `site:` into the query works only when the query is nothing but the
  operator (measured; see above).
- **The fetch half is a rule, not a readability engine.** It keeps the container the page itself names,
  removes containers that are never prose and navigation lists, keeps the rest in document order, and caps
  at 24 000 characters with a marker. A page it reads badly is a bug report with a fixture, not a tuning
  session; `docs/adr/0010-the-other-half-of-the-result.md` says what was deliberately not built.
- **No data directory.** This bundle writes nothing: no cache on disk, no index, no state that could move
  when the repository or the profile does. `node scripts/check.mjs` prints that answer on every run, and
  `docs/adr/0011-no-data-directory.md` says where a future one would have to go —
  `~/.agents/search`, resolved per use, never at load.
- **No settings, no timers, no background work.** There is nothing to configure and nothing running when
  a search is not in flight.

## When it stops working

Bing will change its result page eventually. When the page stops matching, the provider fails loudly rather
than answering with nothing, and its message names the failure, so the first step is to read it:

- `no parseable result block … shape may have changed` — the markup moved. Run
  `node scripts/fixture-refresh.mjs`: it re-fetches the pages the fixtures came from **through this
  provider's own request**, reports what each one parses to now, and exits non-zero when a page yields
  fewer sources than its stored fixture. Once you have read the page and know the parser is right,
  `--write` saves it and re-dates the provenance table. The weekly `drift.yml` job runs it with
  `--via www.bing.com`, because a GitHub runner is answered `cn.bing.com → www.bing.com`; this machine is
  answered `www.bing.com → cn.bing.com`, so the flag turns the check into a redirect refusal here and the
  plain run is the correct one ([ADR 0001](docs/adr/0001-cn-bing-html-endpoint.md)).
- `challenge page instead of results` — Bing decided this client looked automated. Retry later, or open the
  same query in a browser once; the provider keeps no session and no cookie.
- `No results found.` — this is not a failure. Bing's page carried its own no-results marker, so the query
  answered with an empty list, and every other query in the same call kept its sources.
- `HTTP 302 … redirects to https://www.bing.com/…` — the routing changed. That is a decision point, not a
  bug: ADR 0001 says a redirect is never followed, so supersede that ADR rather than flipping the flag.
- `Bing search request failed:` — the request never completed. That one is the network, not the parser.

`npm run acceptance` sends one real request and prints what came back, which is the quickest way to see
that message outside a session. It needs the network and nothing else.

## Development

```sh
npm install                       # the seam the entry tests load; the bundle installs nothing itself
node --check index.js bing.js article.js
node --test --test-isolation=none tests/*.test.mjs
node scripts/mutation-scan.mjs
node scripts/check.mjs
```

Two more commands need the network, and neither runs in CI:

- `npm run acceptance` sends one real search and prints what came back.
- `npm run seam-range` asks the registry for every seam version the declared `peerDependencies` range
  admits and reads each published typing, then fails if any of them declares a search-request field besides
  `query` and `maxResults` — the claim this provider is written against, checked against the whole range
  rather than the version that happens to be installed.

And one more that needs no network at all: `npm run seam-modes` builds the seam's own runtime, registers this
bundle through it, and checks what the seam then does — that a pinned id is the provider it selects, that
`provider: official` serves through the shipped provider without a keyless request, that `auto` falls back
and remembers a failed account, and that `official` with nothing registered refuses by the seam's code. The
unit tests cover the entry's logic against a hand-made context; this covers the selection path the Host
actually runs. It is not part of the gate because it stands in for three Cordis context members
(`effect`, `provide`, `reflect.provide`), and a test written against those stubs would fail for the wrong
reason the day the seam needs another one.

`npm install` is for the entry tests alone: `index.js` imports the seam, which a linked bundle receives
from the runtime as a declared peer, and those tests load the real class rather than a stand-in. Without
it they skip — and a skip means the entry is unverified, which is why `scripts/check.mjs` fails when CI
stops installing it. Everything else in the suite runs with no install at all.

`--test-isolation=none` is not optional: Node 22 spells it `--experimental-test-isolation`, so the flag
itself fixes the major version at Node 24, and the default runner spawns one process per test file,
which this machine's sandbox refuses. CI pins Node 24 and runs the same commands, so a local pass is the
same statement as a green run.

The mutation scan is what keeps the suite honest: for each load-bearing line of `bing.js`, `article.js` and
`index.js` it applies one mutation and requires at least one test to fail. A survivor is a line nothing
protects, and it fails the build with the mutation's name.

Nothing is published, so there is no release step either: the gate above is the whole delivery. A version
number moves only when the bundle's own files change — the ones `files` lists — and `CONTRIBUTING.md` §5
says which those are.

The manual acceptance run is the one thing the gate cannot do for you: it needs the network, and the
session check needs the plugin enabled.

## Repository layout

| Path | What |
|---|---|
| `README.md`, `README-zh.md` | This pair: what the bundle is, and how to install and verify it |
| `index.js` | Bundle entry: builds the provider and registers it with `ctx.web` |
| `bing.js` | The query, the request, the parse and the result mapping; imports nothing |
| `article.js` | The fetch half: reads a page itself and extracts its prose; imports only `bing.js` |
| `cordis.patch.yml` | The seam pin and this bundle's row |
| `tests/` | Parsing tests over the saved result pages, and request-layer tests over a stubbed `fetch` |
| `scripts/check.mjs` | The repository gate, including the two request-layer regressions |
| `docs/` | The design document (bilingual) and the ADRs |
| `PLAN.md`, `PROGRESS.md`, `CHANGELOG.md` | Acceptance state, the append-only record, release summaries |
| `locale/`, `icon.svg`, `package.json` | The bundle's inventory half |
| `.github/workflows/` | `ci.yml`, the gate a change must pass; `drift.yml`, the weekly re-check of the saved pages |

## Where everything else lives

| Question | Document |
|---|---|
| How the bundle is laid out, and what it promises | `docs/architecture-en.md` |
| Why the endpoint is `cn.bing.com`, and why a redirect is never followed | `docs/adr/0001-cn-bing-html-endpoint.md` |
| Why the entry imports a Harness package when the sibling plugins do not | `docs/adr/0002-peer-dependency-on-the-web-seam.md` |
| Why it is called `dsh-search`, and which ids are frozen | `docs/adr/0003-provider-id-and-plugin-name.md` |
| Why there is only one backend — couldn't we add Google, Baidu or 360? | `docs/adr/0004-one-backend-measured.md`, and `node scripts/probe-backends.mjs` for the current answer |
| How does Claude Code implement `web_search`, and why is ours different? | `docs/adr/0005-local-search-vs-server-side.md` |
| Who decides whether the keyless search or the shipped DeepSeek one runs, and how is that switched? | `docs/adr/0006-choosing-the-search-provider.md`, `cordis.patch.yml` |
| Why is the patch row id `search`, and what does a rename cost? | `docs/adr/0007-row-id-follows-the-package-name.md` |
| Why is a page reused for five minutes, and why is a failure never reused? | `docs/adr/0008-reusing-a-recent-page.md` |
| What did the survey of Claude Code, Codex, PI and the scrapers find — and what did it refuse to build? | `docs/adr/0009-the-survey-and-its-refusals.md` |
| Why does the bundle own `web_fetch` instead of reusing the shipped provider? | `docs/adr/0010-the-other-half-of-the-result.md` |
| Where does this plugin keep my data? | `docs/adr/0011-no-data-directory.md` — it keeps none, and `node scripts/check.mjs` prints that |
| Why does raising the search cap need the agent preset instead of the `tool-web` row? | `docs/adr/0012-the-cap-lives-in-the-agent-preset.md` |
| What does installing add, and what does removing take back? | `docs/adr/0013-installing-is-a-patch.md` |
| What can `official` and `auto` actually detect about the account? | `docs/adr/0014-the-official-mode-can-only-detect-presence.md` |
| What was verified, with what output | `PROGRESS.md` |
| What is still unproven | `PLAN.md` |

[AGENTS.md](AGENTS.md) is for AI assistants; [CONTRIBUTING.md](CONTRIBUTING.md) covers branches, commits
and CI.
