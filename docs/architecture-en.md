# Architecture

> Owner: @FrozenYty · Revisit when: the web seam's provider interface changes, or Bing's result page
> stops matching the parser

[中文](architecture-zh.md)

dsh-search is one search provider for the `ctx.web` seam. It needs no key, makes no model call, and
reaches exactly one host. This document is the design: the two halves of the bundle, the seam contract
they implement, how the provider gets selected, the request and the parse, what is deliberately absent,
and what would go wrong first.

The decisions that are expensive to reverse are in `docs/adr/`; this document describes the shape they
produced.

## 1. The bundle, in two halves

| File | What it is | What it may import |
|---|---|---|
| `index.js` | the bundle entry: builds the provider object and registers it with `ctx.web` | the seam, and nothing else |
| `bing.js` | the query, the request, the parse and the result mapping | nothing at all |
| `cordis.patch.yml` | the seam pin and this bundle's own row | — |
| `locale/en.json`, `locale/zh.json` | the plugin inventory's title and description | — |
| `icon.svg` | the inventory icon | — |

The split exists for one reason: the search path must be exercisable without the Host. `bing.js` has no
import, so plain `node` loads it, `scripts/check.mjs` drives its real `search()` against a stubbed
request layer, and the manual acceptance run calls the same method over the network. The one harness
import — the seam's `WebError` — lives in `index.js`, where registration happens and where a failure is
translated into the seam's vocabulary. `docs/adr/0002-peer-dependency-on-the-web-seam.md` records why
that import resolves at all for a profile-linked bundle, and what would break it.

No file has a build step and none is generated: what is in this working tree is what a profile runs.

## 2. The provider contract

The seam's registry keys a provider by its `id` and calls four things at most:

| Member | This provider | Why |
|---|---|---|
| `id` | `bing-html` | the stable key a profile pins; frozen (`docs/adr/0003-provider-id-and-plugin-name.md`) |
| `available()` | `true` | there is no key, endpoint choice or credential to check, so availability is a constant |
| `search(request, signal)` | one GET, then parse | the whole operation; returns `{ sources, truncated }` |
| `ready(llmProvider)` | absent | an absent `ready()` counts as ready, which keeps `web_search` offered on a route whose credential-backed provider cannot authenticate |

`sources[]` entries carry `url` and `title`, plus `snippet` when the block has one, plus `publishedAt`
when the page stated a publication date in front of that snippet. The seam's vocabulary makes those two
optional and the tool renders `publishedAt` as metadata after the excerpt rather than as its first words,
so a stated date is lifted out of the text and normalised to `YYYY-MM-DD`; an *age* (`7 小时之前 · `) stays
in the snippet, because it is a claim about the moment of the search rather than a date, and turning it
into one would invent precision. A date whose parts name no real day (`2026年2月31日`) stays text too —
the page's mistake does not become the seam's metadata. This provider always fills `title` (a block
without a heading is not a result) and omits a field rather than sending an empty string.

A failure is thrown, never returned: `bing.js` raises `BingSearchError` with a seam code —
`WEB_PROVIDER_ERROR` for anything about the request or the page, `WEB_ABORTED` when the caller
cancelled — and the entry translates it into `WebError` with the same code and the original failure as
its `cause`. A programming error is not translated: it surfaces as itself, which is what a bug should
look like.

`request.maxResults` is deliberately ignored by the provider. The seam caps `sources[]` after the
provider returns and sets `truncated` when it did, so a second trim here would be a second rule for the
same bound and could disagree with the seam's. The provider reports `truncated: false` because it
truncated nothing.

That is also why nothing pages: one request is one page, and the page is all this endpoint will give a
sessionless client. Measured — `count=20`, `count=30`, `first=11`, `first=21`, and the page's own "next"
link with its `FPIG` impression hash all return the same ten results, and the RSS form of the same query
carries ten items too. The seam's own bound is 8 (`searchMaxResults`), so a page is more than a call uses
and a second request would add a failure mode to buy nothing.

## 3. Selection: which provider runs

The seam resolves a provider per call, once, and never by registration order:

- a configured provider id wins when it is registered and `available()`;
- with no id, exactly one usable provider is used, and two are an error (`WEB_PROVIDER_AMBIGUOUS`);
- a configured id that is missing or unavailable is an error naming it.

That is why `cordis.patch.yml` overrides the `web` row's `searchProvider` instead of relying on
registration. The shipped base bundle pins `deepseek-official`, which is registered and reports itself
available, so registering a second provider without moving the pin changes nothing. The other half of
the same trap is that the seam's `config` is replaced wholesale, never merged: the override restates
`fetchProvider: http`, or `web_fetch` would lose its pinned backend.

A profile that wants a different search provider overrides row `web` again in its own
`cordis.patch.yml`. `cordis.patch.yml` in this repository is the bundle's layer, not the profile's
decision — the profile's own layer comes later and wins.

## 4. The request

One HTTPS `GET`, exactly one host:

```
https://cn.bing.com/search?q=<query>
```

- **The endpoint is a constant.** `www.bing.com` answers 302 with a `Location` pointing at
  `cn.bing.com`, and the measured alternatives do not serve a parseable result page; the evidence is
  `docs/adr/0001-cn-bing-html-endpoint.md`. Configuration would invite a value nobody measured.
- **`redirect: "manual"`.** A redirect is never followed. The provider turns any 3xx into an error that
  names the status and the `Location`, so a redirect to `www.bing.com` is a visible failure rather than
  a request to a host this provider did not choose. This is the structural half of acceptance item 3;
  the request-layer assertion in `scripts/check.mjs` is the measured half.
- **A browser-like `User-Agent` and `accept-language`.** The page's markup is chosen by the agent
  string; the saved fixtures were captured with these headers, so the parser is tested against the same
  page shape.
- **The query is `q`, URL-encoded** by `URLSearchParams`, and an empty query fails before any request.
- **One page.** No paging, no retry, no cache, no timer. Bing's first page carries about ten organic
  results, which is more than the tool's default `maxResults`; asking for a second page would add a
  request shape nobody asked for.

## 5. The parse

Parsing is a scan of the response body, not a DOM: the bundle has no dependency, and the result page is
a regular enough document for a handful of anchored patterns.

| Step | Rule |
|---|---|
| block boundary | every `<li>` whose class list carries the `b_algo` token; each block is sliced to the next boundary, so a block never reads into its neighbour |
| title and URL | the first `<h2>` anchor inside the block — the result's own link, not the site-icon anchor above it |
| URL normalization | resolved against the endpoint with `new URL`; a non-web scheme is dropped; a relative or protocol-relative link becomes absolute |
| snippet | `<p class="b_lineclamp…">` first, then the older `<div class="b_caption"><p>`; the longest match wins |
| date | an exact date followed by Bing's `· ` separator becomes `publishedAt` (ISO, and only when the parts name a real day); an age stays in the snippet |
| text | numeric entities, the named entities Bing emits, then tags stripped, then whitespace collapsed |
| order and duplicates | page order, deduplicated by URL |

A block without a heading anchor, a usable URL or heading text is skipped. A page that yields **no**
source at all is a failure, not an empty result: the page's shape changing is the likeliest reason this
plugin would silently stop working, and an empty list would report it as "no results". The failure says
which of the two it suspects — a challenge page, or markup that no longer parses.

## 6. What it deliberately does not do

- **No API key, account or model call.** That is the point: search does not depend on a balance.
- **No `web_fetch` provider.** Fetching is a different operation with a different trust problem; the
  shipped anonymous HTTP provider owns it, and this bundle leaves that half of the seam alone.
- **No settings section and no `Config` schema.** Nothing is tunable. A settings row needs schemastery,
  and a field nobody measured is a way to break the parser without touching the repository.
- **No timers, retries, caches or background work.** One call, one request, one answer.
- **No paging and no result cap of its own.** See §2 and §4.
- **No second engine as a fallback.** Every alternative was measured and none answered; a fallback that
  is never reachable is dead code (`docs/adr/0001-cn-bing-html-endpoint.md`).

## 7. Risks, and what they look like

| Risk | Symptom | Where it is handled |
|---|---|---|
| Bing changes its result markup | `WEB_PROVIDER_ERROR: … no parseable result block` | the parser's zero-result failure; the fixtures and the parse tests are the alarm |
| Bing serves a bot gate | `WEB_PROVIDER_ERROR: … a challenge page instead of results` | `looksBlocked`, consulted only when nothing parsed |
| `cn.bing.com` unreachable | `WEB_PROVIDER_ERROR: … request failed` naming the URL | the fetch failure branch |
| a redirect appears | `WEB_PROVIDER_ERROR: … redirects to <target>, and this provider follows no redirect` | `redirect: "manual"` |
| a result link is Bing's own redirect wrapper | a `cn.bing.com/ck/a` URL among otherwise direct ones | not handled; named in the README's limits |
| a truncated or corrupted response carries an out-of-range numeric entity | the entity stays literal text and the rest of the page parses | `decodedCodePoint` |
| the seam moves its provider interface | the plugin does not activate | the peer range in `package.json`; the failure is loud, not silent |
| a profile resolves no peer for a linked bundle | the plugin does not activate (`ERR_MODULE_NOT_FOUND`) | `docs/adr/0002-peer-dependency-on-the-web-seam.md`, and a check that the peer stays declared |

## 8. What the repository can and cannot prove

`node --test --test-isolation=none tests/*.test.mjs` proves the parser over two saved responses and the
request shape over a stubbed request layer; its entry tests load the **real** seam and prove what the Host
does with this bundle — that `apply` registers one provider under `bing-html`, that the provider reports
itself available and has no `ready()`, and that a provider failure arrives as the seam's `WebError`
carrying its code. `node scripts/mutation-scan.mjs` proves those tests can fail: it breaks each
load-bearing line of `bing.js` and `index.js` in turn and requires the suite to notice, so a line nothing
protects is reported by name instead of passing quietly. `node scripts/check.mjs` proves the manifest, the
import rules, the locale pair, the patch rows, the documents, and the two request-layer regressions of
acceptance item 3. The live search and a real session are manual: the first needs the network, the
second needs the plugin enabled, and enabling it is the owner's decision every time. `PROGRESS.md`
records the runs that were actually made, with their output.
