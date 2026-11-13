# dsh-search

[中文](README-zh.md)

> A real result page, not an account balance.

A DeepSeek Harness profile bundle that gives the `web_search` tool a search backend which needs no API
key, no account balance and no model call. It registers one provider with the web seam and points the
seam's search half at it, so search keeps working when the account behind the shipped provider has run
out — the failure that makes chat work and every search fail.

[github.com/FrozenYty/dsh-search](https://github.com/FrozenYty/dsh-search)

## Status

- Current version: v0.1.2.
- **Verified here**: the parser over two saved result pages, the request shape over a stubbed request
  layer, and a mutation scan that breaks each load-bearing line of `bing.js` and requires a test to
  notice — `node --test`, `node scripts/mutation-scan.mjs` and `node scripts/check.mjs`, all recorded
  with their output in `PROGRESS.md`. The live search was run by hand against `cn.bing.com` and answered
  with real sources; that run and its output are in `PROGRESS.md` too.
- **Not proven here**: that the plugin activates in a profile, and that a real session's `web_search`
  returns results through it. Both need the bundle enabled, which is the owner's decision; the checks in
  this repository never load the Harness.
- Release list: [CHANGELOG.md](CHANGELOG.md). Append-only history: [PROGRESS.md](PROGRESS.md).

## Enable and verify

```
plugin_manager  install_bundle  target: <absolute path to this repository>
```

The install links this directory into the profile rather than copying it, so what runs is this working
tree and there is no build step. It also applies this bundle's patch, which is the part that makes the
provider selected — see below.

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
its organic result blocks. Each block contributes a title, an absolute URL and a snippet; the seam caps
the list at the caller's `maxResults`. Nothing is sent to an account, nothing is billed, and no model
call is involved.

The request never touches any other host. `www.bing.com` redirects to `cn.bing.com`, and this provider
sets `redirect: "manual"`, so a redirect is never followed — it becomes an error naming its target
instead. `scripts/check.mjs` asserts at the request layer that one search sends exactly one request, to
`cn.bing.com`, and never to `www.bing.com` or `api.deepseek.com`.

## The one composition change

Registering a provider is not enough to be selected. The shipped base bundle pins the seam's
`searchProvider` to `deepseek-official`, so this bundle's patch moves that pin to `bing-html` and
restates the row's other field — the seam replaces a row's `config` wholesale, never merges it, so
`fetchProvider: http` has to be written out again or `web_fetch` would lose its backend.

That is the whole footprint: one row override and one inserted row. It changes the profile the bundle is
installed into, for every session in it, which is why it is stated here rather than buried in the patch.

## Limits and deliberate omissions

- **One engine, one endpoint.** Bing's HTML result page is the only backend that answered with a
  parseable page from this machine; the alternatives and their responses are in
  `docs/adr/0001-cn-bing-html-endpoint.md`. There is no fallback engine and the endpoint is not
  configurable.
- **A markup change is a real risk.** The parser reads a page, not an API. A page that stops matching it
  fails with `no parseable result block` instead of quietly returning nothing, and the saved fixtures
  under `tests/fixtures/` are how that shows up as a failing test rather than as a mystery.
- **One page, about ten results.** No paging, no retries, no caching. `web_search` asking for more than
  the page holds gets what the page holds.
- **A result link that Bing wraps in its own redirect** (`cn.bing.com/ck/a?…`) would be returned as that
  wrapper URL rather than unwrapped. Today's pages carry direct links, so the parser does not unwrap.
- **No `web_fetch` half.** Fetching one URL is a different operation with a different trust problem; the
  shipped anonymous HTTP provider owns it.
- **No settings, no timers, no background work.** There is nothing to configure and nothing running when
  a search is not in flight.

## Development

```sh
node --check index.js bing.js
node --test --test-isolation=none tests/*.test.mjs
node scripts/mutation-scan.mjs
node scripts/check.mjs
```

`--test-isolation=none` is not optional: Node 22 spells it `--experimental-test-isolation`, so the flag
itself fixes the major version at Node 24, and the default runner spawns one process per test file,
which this machine's sandbox refuses. CI pins Node 24 and runs the same commands, so a local pass is the
same statement as a green run.

The mutation scan is what keeps the suite honest: for each load-bearing line of `bing.js` it applies one
mutation and requires at least one test to fail. A survivor is a line nothing protects, and it fails the
build with the mutation's name.

A release is a tag, not an edit: the `release` workflow re-runs this gate, refuses a tag that does not
name the manifest's version, and publishes `dsh-search-<version>.tgz` with its `SHA256SUMS.txt`.
`node scripts/pack.mjs` builds the same tarball locally into `dist/`, so a release can be reproduced
without pushing a tag.

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
