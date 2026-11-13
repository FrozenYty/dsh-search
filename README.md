# dsh-search

[中文](README-zh.md)

[![ci](https://github.com/FrozenYty/dsh-search/actions/workflows/ci.yml/badge.svg)](https://github.com/FrozenYty/dsh-search/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.1.5--rc.1%20..%20%3C0.3.0-brightgreen)](https://github.com/deepseek-ai/deepseek-harness)

> A real result page, not an account balance.

A DeepSeek Harness profile bundle that gives the `web_search` tool a search backend which needs no API
key, no account balance and no model call. It registers one provider with the web seam and points the
seam's search half at it, so search keeps working when the account behind the shipped provider has run
out — the failure that makes chat work and every search fail.

[github.com/FrozenYty/dsh-search](https://github.com/FrozenYty/dsh-search)

## Status

- Current version: v0.1.9.
- **Verified here**: the parser over two saved result pages, the request shape over a stubbed request
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
above, restart the app, and the plugin list shows 搜索.

That this package is not on npm is deliberate: the name `dsh-search` there belongs to an unrelated
package, and this one is `private` — it is linked or installed from a file, never published
(`docs/adr/0003-provider-id-and-plugin-name.md`).

Whichever route you use, the patch moves the web seam's `searchProvider` to `bing-html` and restates the
row's fetch half. That is the part that makes the provider selected, and it changes the profile for every
session in it — see below.

Verification afterwards is live calls, not check output:

- the patch applies with no warning about the rows it targets, and the plugin inventory lists this
  bundle with the title **搜索** (or **Search** in an English UI);
- ask a question that needs the web in a session whose chat goes through a relay while the DeepSeek
  account balance is still zero. `web_search` should return sources with absolute URLs, where it used to
  fail with an HTTP 402 from `api.deepseek.com`;
- the failure that proves it was this provider, not the shipped one: a search no longer mentions
  `api.deepseek.com`, and fetching one of the returned URLs with `web_fetch` still works, because this
  bundle leaves the fetch half of the seam alone.

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

The request never touches any other host. `www.bing.com` redirects to `cn.bing.com`, and this provider
sets `redirect: "manual"`, so a redirect is never followed — it becomes an error naming its target
instead. `scripts/check.mjs` asserts at the request layer that one search sends exactly one request, to
`cn.bing.com`, and never to `www.bing.com` or `api.deepseek.com`.

## Choosing who searches

A profile with this bundle has two searches available: the keyless one it registers, and the shipped
`deepseek-official` provider, whose credential the profile may still carry. **The choice is yours**, and it is
one field on this bundle's row:

```yaml
- id: web-search-bing-html
  config:
    provider: keyless   # keyless (default) | official | auto
```

- `keyless` — Bing's result page: no account, no key, no balance. The default, and what every earlier
  version did.
- `official` — the shipped provider serves the search, billed to the same account as the chat. If it is not
  registered, or registered and unable to run, the search fails with the seam's own code
  (`WEB_PROVIDER_CONFIGURED_MISSING` / `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`) and a message naming the
  provider you asked for: a deliberate choice should not quietly become a different one.
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

The seam has two halves, search and fetch, and this bundle owns only the first. `web_fetch` keeps the
shipped anonymous HTTP provider — and the patch **restates `fetchProvider: http`** while overriding the
`web` row, because the seam replaces a row's config wholesale: without that line, installing this bundle
would silently take `web_fetch` away. `scripts/check.mjs` fails if the line disappears.

That is the whole "support" for fetching: reuse the official provider rather than growing a second one. It
pins the resolved address, follows same-origin redirects up to a hop cap, enforces byte and time limits,
and reports a non-2xx response as a result instead of a throw.

Its one knob is `userAgent`, and it defaults to an honest product agent (`deepseek-harness/0.0.1`) rather
than a browser disguise. Measured across six real result pages, the disguise is not an improvement:

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
`searchProvider` to `deepseek-official`, so this bundle's patch moves that pin to `bing-html` and
restates the row's other field — the seam replaces a row's `config` wholesale, never merges it, so
`fetchProvider: http` has to be written out again or `web_fetch` would lose its backend.

That is the whole footprint: one row override and one inserted row. It changes the profile the bundle is
installed into, for every session in it, which is why it is stated here rather than buried in the patch.

## Limits and deliberate omissions

- **One engine, one endpoint, and that is a measurement rather than a shortcut.** Bing's HTML result page is
  the only backend that answers this machine with parseable, directly-linkable results: Google,
  DuckDuckGo, Brave and a SearXNG instance are unreachable here, Mojeek answers `403`, Sogou redirects to
  itself, 360 wraps every result in a redirect `web_fetch` will not follow, and Baidu starts answering with
  a captcha after about eight requests. `docs/adr/0004-one-backend-measured.md` has the table;
  `node scripts/probe-backends.mjs` re-asks the network whenever it may have changed.
- **A markup change is a real risk.** The parser reads a page, not an API. A page that stops matching it
  fails with `no parseable result block` instead of quietly returning nothing, and the saved fixtures
  under `tests/fixtures/` are how that shows up as a failing test rather than as a mystery.
- **One page, about ten results, and that is this endpoint's ceiling.** No paging, no retries, no caching —
  and not for lack of trying. Measured three ways: every offset and count returns page one's ten results
  (`count=20/30/50`, `first=11/21/31`, the page's own "next" link with its `FPIG` hash, the same with the
  `set-cookie` values from the first response sent back **and** a `Referer`), Bing's RSS form
  (`&format=rss`) carries ten items and ignores `count` and `first` alike, and the runs used broad queries
  (`python tutorial`, `中国 历史`) so a small result set could not be mistaken for a paging failure.
- **What widens a call is the tool's own caps, not paging.** One `web_search` merges up to
  `searchMaxQueries` queries (default 4) into at most `searchMaxResults` sources (default 8), so two or
  three sub-questions in one call already cast a wider net than one. A profile that wants more raises those
  numbers on the `tool-web` row — and must restate the row's other fields, because a patch replaces a row's
  `config` wholesale:

  ```yaml
  - id: tool-web
    config:
      fetch: true
      searchTimeoutMs: 60000
      searchMaxResults: 24
  ```

  A profile reads its patch when it loads, so a running Host keeps the old number until it restarts —
  unless its `package.json` sets `dsh.profile.patchReload: live`, in which case the file is watched. How to
  tell which cap is live: the tool appends `(Showing the first N sources…)` **only when the seam truncated**,
  so that line disappearing is the change taking effect.
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
- **No `web_fetch` half of its own.** Fetching one URL is a different operation with a different trust
  problem, and the shipped anonymous provider owns it; the section above says why reusing it is the
  right call rather than a shortcut.
- **No settings, no timers, no background work.** There is nothing to configure and nothing running when
  a search is not in flight.

## When it stops working

Bing will change its result page eventually. The provider fails loudly rather than answering with nothing,
and its message names the failure, so the first step is to read it:

- `no parseable result block … shape may have changed` — the markup moved. Run
  `node scripts/fixture-refresh.mjs`: it re-fetches the three pages the fixtures came from **through this
  provider's own request**, reports what each one parses to now, and exits non-zero when a page yields
  fewer sources than its stored fixture. Once you have read the page and know the parser is right,
  `--write` saves it and re-dates the provenance table.
- `challenge page instead of results` — Bing decided this client looked automated. Retry later, or open the
  same query in a browser once; the provider keeps no session and no cookie.
- `HTTP 302 … redirects to https://www.bing.com/…` — the routing changed. That is a decision point, not a
  bug: ADR 0001 says a redirect is never followed, so supersede that ADR rather than flipping the flag.
- `Bing search request failed:` — the request never completed. That one is the network, not the parser.

`npm run acceptance` sends one real request and prints what came back, which is the quickest way to see
that message outside a session. It needs the network and nothing else.

## Development

```sh
npm install                       # the seam the entry tests load; the bundle installs nothing itself
node --check index.js bing.js
node --test --test-isolation=none tests/*.test.mjs
node scripts/mutation-scan.mjs
node scripts/check.mjs
```

`npm install` is for the entry tests alone: `index.js` imports the seam, which a linked bundle receives
from the runtime as a declared peer, and those tests load the real class rather than a stand-in. Without
it they skip — and a skip means the entry is unverified, which is why `scripts/check.mjs` fails when CI
stops installing it. Everything else in the suite runs with no install at all.

`--test-isolation=none` is not optional: Node 22 spells it `--experimental-test-isolation`, so the flag
itself fixes the major version at Node 24, and the default runner spawns one process per test file,
which this machine's sandbox refuses. CI pins Node 24 and runs the same commands, so a local pass is the
same statement as a green run.

The mutation scan is what keeps the suite honest: for each load-bearing line of `bing.js` it applies one
mutation and requires at least one test to fail. A survivor is a line nothing protects, and it fails the
build with the mutation's name.

Nothing is published, so there is no release step either: the gate above is the whole delivery. A version
number moves only when the bundle's own files change — the ones `files` lists — and `CONTRIBUTING.md` §5
says which those are.

The manual acceptance run is the one thing the gate cannot do for you: it needs the network, and the
session check needs the plugin enabled.

## Repository layout

| Path | What |
|---|---|
| `index.js` | Bundle entry: builds the provider and registers it with `ctx.web` |
| `bing.js` | The query, the request, the parse and the result mapping; imports nothing |
| `cordis.patch.yml` | The seam pin and this bundle's row |
| `tests/` | Parsing tests over two saved result pages, and request-layer tests over a stubbed `fetch` |
| `scripts/check.mjs` | The repository gate, including the two request-layer regressions |
| `docs/` | The design document (bilingual) and the ADRs |
| `PLAN.md`, `PROGRESS.md`, `CHANGELOG.md` | Acceptance state, the append-only record, release summaries |
| `locale/`, `icon.svg`, `package.json` | The bundle's inventory half |

## Where everything else lives

| Question | Document |
|---|---|
| How the bundle is laid out, and what it promises | `docs/architecture-en.md` |
| Why the endpoint is `cn.bing.com`, and why a redirect is never followed | `docs/adr/0001-cn-bing-html-endpoint.md` |
| Why the entry imports a Harness package when the sibling plugins do not | `docs/adr/0002-peer-dependency-on-the-web-seam.md` |
| Why it is called `dsh-search`, and which ids are frozen | `docs/adr/0003-provider-id-and-plugin-name.md` |
| What was verified, with what output | `PROGRESS.md` |
| What is still unproven | `PLAN.md` |

[AGENTS.md](AGENTS.md) is for AI assistants; [CONTRIBUTING.md](CONTRIBUTING.md) covers branches, commits
and CI.
