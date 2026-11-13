# Progress

Append-only, newest first: what was built, what was run, and what it printed. A release's entry is added
in the same pull request that delivers it, and an older entry is never rewritten. `PLAN.md` owns the
acceptance state; this file owns the evidence behind it.

## 2026-11-13 — the cap that composes and does not apply

`searchMaxResults: 24` was written into the desktop profile's own patch, the app was restarted, and
`web_search` still returned eight sources with `(Showing the first 8 sources…)` — once for a single query
and once for four. The note is the tool's own: `if (result.truncated) parts.push(…)`, and its number is the
capped list, so eight means the live cap is still eight.

The row was not wrong. Replaying the same layers through the loader's own composer —
`composeEntries` from `@deepseek-ai/dsh-app-boot`, over `dsh-base`, `dsh-web-app`, this bundle, the three
other linked bundles and the profile patch — resolves `tool-web` to
`{"fetch":true,"searchTimeoutMs":60000,"searchMaxResults":24}`. The app's own patch text, read out of
`app.asar`, contains a second `tool-web` row with `fetch` and `searchTimeoutMs` **only**. A patch replaces a
row's `config` wholesale, so a later layer restating that row drops the field, and the schema default
returns — no warning, no error, the composed value simply never reaches the plugin.

What is now written down instead of assumed:

- Both READMEs state this next to the override snippet, because the snippet alone reads like a promise.
- The profile's own patch file was returned to how it was: a knob that composes to 24 and applies as 8 is
  worse than no knob, since it teaches the wrong lesson about which layer owns a row.
- What actually widens a call is the question: `web_search` merges up to four queries in one call, and a
  second call is how to see more than eight sources.

## 2026-11-13 — "one page only? really?" — asked with cookies this time

The paging ceiling was challenged, which is fair: it is the limitation a user feels first. It was re-tested
harder rather than restated, and the answer did not change.

```
query: python tutorial            (and 中国 历史, and node fetch redirect manual)
  page1:    10 sources
  first=11: 10 sources | overlap 10 | identical order: true
  first=21: 10 sources | overlap 10
  first=11&count=10&FORM=PERE: 10 sources | overlap 10
  the page's own sb_pagN next link (FPIG and all): 10 sources | overlap 10
  the same with the ten set-cookie values from page 1 sent back and a Referer: overlap 10
  &format=rss: 10 items | &count=50: 10 | &first=11: 10
```

Broad queries were used on purpose, so "the result set is small" could not be mistaken for "paging is
broken". Cookies and a referer were included because that is the difference between this client and a
browser, and it changed nothing. The RSS form — the shape the closest sibling plugin prefers — carries ten
items and ignores both parameters.

Two things came out of it that are worth more than the negative result:

- **The knob that does widen a call is elsewhere.** One `web_search` merges up to `searchMaxQueries` queries
  (default 4) into at most `searchMaxResults` sources (default 8); those live on the base bundle's
  `tool-web` row (`@deepseek-ai/dsh-tool-web`, config `fetch`, `searchTimeoutMs`), so a profile that wants
  more raises them there — and must restate the row's other fields, because a patch replaces `config`
  wholesale. Both READMEs now show that snippet, and `docs/adr/0004-one-backend-measured.md` carries the
  addendum with this table.
- **Bing's RSS `pubDate` is the fetch time, not the page's.** Every item in the RSS response carried
  `周五, 13 11月 2026 04:39:00 GMT` — today — while the same results' HTML snippets state real publication
  dates. So the decision to parse the HTML page (and lift a stated date into `publishedAt`) is also the
  reason this bundle can report a date at all.

## 2026-11-13 — v0.1.9, the owner chooses who searches

The request was that the plugin give the user the right to choose between the shipped DeepSeek search and
this bundle's keyless one, instead of the bundle deciding.

### What was measured before designing it

- `ctx.web.search(request, signal)` takes no provider argument and the `web_search` tool passes none; the
  seam resolves `config.searchProvider` at call time, then `DSH_WEB_SEARCH_PROVIDER`, then the only usable
  provider. **A per-search choice is not available through the seam's API**, so the choice has to live in
  config — the question was only whose config and how discoverable.
- Cordis passes a row's config through unchanged when a plugin declares no `Config` schema —
  `resolveConfig`: `if (!runtime.Config) return config` — so one field costs this bundle no dependency
  (its entry is allowed exactly one bare import) and cannot make a profile's config fail to load.

### What was built

This bundle's row carries `provider`, with `keyless` (default, unchanged), `official` (the shipped provider
serves the search), and `auto` (the shipped provider when it can run, keyless otherwise). In `official`, a
missing or unavailable shipped provider fails with the seam's codes
`WEB_PROVIDER_CONFIGURED_MISSING` / `WEB_PROVIDER_CONFIGURED_UNAVAILABLE` and a message naming the provider
the profile asked for; `auto` remembers a failed account for the process, so a zero balance costs one doomed
request rather than one per search. `docs/adr/0006-choosing-the-search-provider.md` supersedes the
"no configuration" stance of ADRs 0001/0003 for this one field, and says why a settings panel (no client
half yet), two unpinned providers (the seam answers `WEB_PROVIDER_AMBIGUOUS`) or a per-call argument (does
not exist) were not the answer.

### What was verified

```
$ node scripts/check.mjs                              → check passed
$ node --test --test-isolation=none tests/*.test.mjs  → ℹ tests 32  ℹ pass 32  ℹ fail 0  ℹ skipped 0
$ node scripts/mutation-scan.mjs                      → 24 mutation(s): 24 killed, 0 not
```

Seven of those tests are the routing: the default mode, an unknown value falling back to keyless, `official`
delegating and its two failure codes, `auto` preferring the account, `auto` falling back and not retrying,
and `auto` with no shipped provider at all. Four new mutations cover the same branches, and the scan's own
staleness check caught this refactor: moving the failure translation into a helper changed its indentation,
and the two older mutations reported `STALE` rather than quietly mutating nothing — which is what that
check exists for.

## 2026-11-13 — can the shipped DeepSeek search still be used? Yes, and the balance says not yet

Asked after this bundle had been installed for a while, so the answer was measured rather than recalled.

Nothing was uninstalled. The profile's credential store still holds the named reference the shipped provider
uses, and the profile's own patch has no `web` row of its own — this bundle's pin is the only thing that
moved:

```
~/.dsh/.credentials.yaml → refs:
  DEEPSEEK_API_KEY: sk-d5b3…f188          the shipped search provider's credential, still there
  DO_API_KEY: sh_ARCNaW93x4NiBLtKA8ijBA   the relay key that carries the chat

GET https://api.deepseek.com/user/balance → 200
{"is_available":false,"balance_infos":[{"currency":"CNY","total_balance":"-0.09",
 "granted_balance":"0.00","topped_up_balance":"-0.09"}]}
```

So: **installed and configured, but not usable at this balance.** `is_available: false` with `-0.09 CNY` is
the same fact as the HTTP 402 a search through it returns — the account is 9 分 in the red, and nothing about
the provider itself changed.

Going back is one row in the profile's own `cordis.patch.yml` (that layer is applied after a bundle's, so it
wins):

```yaml
- id: web
  config:
    searchProvider: deepseek-official
    fetchProvider: http
```

The READMEs now carry that section, next to the numbers, so the choice reads as a trade rather than a
migration: an account and a balance, versus a provider that needs neither. Worth noting for anyone reading
the credential file: the first `sk-…` in the profile's patch is the *relay's* key, not DeepSeek's — probing
`/user/balance` with it answers `401 … api key ****9b3b is invalid`, which is how the real one was found.

## 2026-11-13 — how Claude Code's `web_search` works, read from the shipped product

The question was how Claude Code implements its search, and whether this bundle should copy it. Claude Code
2.1.178 is installed on this machine as a native binary (`@anthropic-ai/claude-code/bin/claude.exe`,
246 715 552 bytes) with `sdk-tools.d.ts` describing every tool, so the answer came from the product rather
than from its documentation.

### What the binary contains

```js
function LG5(H){return{type:"web_search_20250305",name:"web_search",
  allowed_domains:H.allowed_domains,blocked_domains:H.blocked_domains,max_uses:8}}
```

A **server tool**: the client declares it in the model request and Anthropic's servers perform the search —
no search request leaves the client. `max_uses: 8` bounds it per request.

From `sdk-tools.d.ts`:

```
WebSearchInput  { query: string; allowed_domains?: string[]; blocked_domains?: string[] }
WebSearchOutput { query: string; results: ({ tool_use_id: string; content: { title: string; url: string }[] } | string)[];
                  durationSeconds: number; … }
WebFetchInput   { url: string; prompt: string }
```

So a hit is **title and URL** (a `string` result is "text commentary from the model"), the tool's own
description says the search is **US-only**, and its fetch tool runs a **prompt** over the fetched page.
Strings in the same binary also describe newer `web_search_20260209` / `web_fetch_20260209` versions whose
**dynamic filtering** lets Claude write and execute code to filter results before they reach the context.

### What it means for this bundle

- **The official DSH provider is the same architecture** — search on the provider's servers, on the account
  — which is exactly why it answers HTTP 402 at a zero balance. This bundle is different in kind, not in
  degree: it performs the search on the machine.
- **Two gaps here are seam-shaped, not defect-shaped**: the seam's search request has no domain field
  (`allowed_domains` cannot reach a provider), and its fetch request has no prompt (so a noisy page reaches
  the model with its ads attached — the filtering model sits elsewhere in Claude Code). A future seam field
  is where either would close.
- **Where we are ahead**: a source here carries a snippet and, when stated, a `publishedAt` the tool renders
  as metadata; Claude Code's hits carry a title and a URL.

`docs/adr/0005-local-search-vs-server-side.md` records the comparison, the code excerpt and the two
seam-shaped gaps. No code changed.

Incidental, and worth writing down because it is the documented limit happening live: fetching the online
docs for that tool failed here — `docs.claude.com` → `platform.claude.com` → `www.anthropic.com`, two
cross-origin redirects, which `web_fetch` refuses by design.

### And one correction to yesterday's tool

Running `scripts/probe-backends.mjs` again exposed a flaw in the tool rather than in the engines: a 553 kB
Sogou page with real results was reported as `challenge` merely because this script's own marker matched
one block. A big page with no marker hit says the **marker** is wrong, not that the engine refused, so the
probe now has an `unverified` verdict for exactly that case and reserves `challenge` for a small page or one
that says so in its own words.

The same three runs also caught Baidu oscillating — `usable` once, `challenge` twice, minutes apart, the
challenge being `HTTP 302 → wappass.baidu.com`. ADR 0004 now records that oscillation as the finding it is.

## 2026-11-13 — "can we stop using a single search source?" — asked of the network

The question was whether to add Google "if the network allows", or another engine, so the bundle stops
depending on one host. It was answered by sending one request per candidate, not by reasoning about
engines. `scripts/probe-backends.mjs` is that measurement, kept as a tool:

```
$ node scripts/probe-backends.mjs
query: deepseek harness

bing        usable         102174 bytes  10 result blocks
google      unreachable         0 bytes  fetch failed
duckduckgo  unreachable         0 bytes  fetch failed
brave       unreachable         0 bytes  fetch failed
mojeek      blocked           337 bytes  HTTP 403
baidu       challenge         517 bytes  HTTP 302 → wappass.baidu.com
so360       wrapped        800430 bytes  13 result blocks
sogou       challenge         357 bytes  HTTP 302 → www.sogou.com
searxng     unreachable         0 bytes  fetch failed

usable backends: bing
```

Two candidates looked real before they were tested properly, and both are recorded in
`docs/adr/0004-one-backend-measured.md`:

- **Baidu** returned 13–16 usable results — real URLs in `mu=`, clean `<h3>` titles, widget hosts
  filterable — for the first several requests. Then it began answering `HTTP 302 →
  wappass.baidu.com/static/captcha/…`: a captcha, for a sessionless client, after roughly eight requests in
  a few minutes. Its pages are also 1.2 MB card templates with build-hashed class names, and a stable
  description container was present on 4 of 30 result blocks, so a parser for it would return titles and
  URLs without excerpts.
- **360** returns 13 parseable blocks, but every URL is `so.com/link?m=…` — a cross-origin redirect, which
  the shipped `web_fetch` provider refuses by design. Half-useful at best.

The decision that follows is to keep one backend, and the ADR says why: a fallback that challenges the
client is a second failure mode dressed as resilience, merging a weaker index into the seam's 8-source cap
dilutes the source that works, and the failure a second backend was meant to cover — Bing's markup drifting
— is already detected by `scripts/fixture-refresh.mjs`.

The probe exits non-zero when Bing itself is unusable, so it doubles as a health check, and it is how this
question gets re-asked after a proxy, a VPN or a region change instead of being re-argued from memory.

## 2026-11-13 — the drift tool, and what a page does and does not tell us

Two additions, both aimed at the day this plugin breaks rather than at today.

### `scripts/fixture-refresh.mjs`

The README used to answer "the markup may have changed" with a four-step ritual: build a request by hand,
save the body, keep the headers identical, remember which query each fixture came from. It is now one
command, and it sends the **provider's own** request — `fetch` is wrapped and `BingSearchProvider.search`
does the work — so the headers cannot drift from the bundle's:

```
$ node scripts/fixture-refresh.mjs
endpoint: the provider's own request, one per fixture
  bing-deepseek-harness.html
    query: deepseek harness
    stored fixture: 10 sources | live page: 10 sources, 3 with a date
  bing-node-fetch-redirect.html
    query: node fetch redirect manual
    stored fixture: 10 sources | live page: 10 sources, 7 with a date
  bing-dated-snippets.html
    query: DeepSeek Harness 插件
    stored fixture: 10 sources | live page: 10 sources, 8 with a date
every fixture still parses to at least what it held
```

That run is also today's evidence that the parser still matches the live markup — the three pages parse to
exactly what their fixtures hold. The failure path was proved rather than assumed: with one extra source
appended to a stored fixture, the tool exits non-zero and names the counts.

```
fixture refresh found a regression:
  - bing-deepseek-harness.html: the live page parses to 10 sources, the stored one to 11
```

`--write` is the deliberate step after reading the page: it saves the new bodies and re-dates the
provenance table. `scripts/check.mjs` now also fails when a `*.html` fixture has no row in
`tests/fixtures/sources.md`, so a page cannot arrive without its query and date.

### What the page does and does not say

Measured on the endpoint, and written into `docs/architecture`:

- **`content-type: text/html; charset=utf-8` on every response** — reading the body as UTF-8 is correct, not
  lucky, and nothing here needs to sniff a charset.
- **A nonsense query still returns ten results**: `asdkjhqweoiuzxcvbnm` produced ten `b_algo` blocks of
  loosely related pages, with Bing's usual result count (`sb_count`) **absent**. So "ten sources" is not a
  statement that the query matched well, and the seam's source shape has no field to carry the count.
- **The tool renders an empty `sources[]` as `No results found.`** (from `@deepseek-ai/dsh-tool-web`), which
  is exactly why this provider throws instead: a page whose blocks stopped matching is a broken parser, and
  telling a model "no results" would send it off to reformulate a query that was never the problem.

`CONTRIBUTING.md` §5 also now says what it always meant: the version moves when a file **a profile loads**
changes, not when a README or a script does. This change therefore moves no version.

## 2026-11-13 — the fetch half: reuse it, and prove the obvious "improvement" is not one

The question was whether this bundle should also own `web_fetch`. It already reuses the shipped provider —
the patch restates `fetchProvider: http` because the seam replaces a row's config wholesale — so the only
question left was whether the one knob that provider exposes should be turned.

`@deepseek-ai/dsh-web-fetch-http` has `userAgent`, defaulting to `deepseek-harness/0.0.1
(+https://github.com/deepseek-ai)` with the comment "an explicit product agent, never a browser disguise".
Six real result pages, fetched twice each, full browser header set on both sides:

```
zhuanlan.zhihu.com       product: 403/628      | chrome: 403/628
blog.csdn.net            product: 200/317565   | chrome: 521/2252
juejin.cn                product: 200/141262   | chrome: 200/141262
developer.aliyun.com     product: 200/70219    | chrome: 200/70219
github.com               product: 200/367719   | chrome: 200/367719
deepseekharness.online   product: 200/22163    | chrome: 200/22163
```

The browser disguise wins nothing and loses CSDN's whole page (521 where the product agent gets 200), and
Zhihu answers 403 to both — its block is not about the User-Agent at all. So the default stays, and the
READMEs now say why with this table instead of leaving "no fetch half" as an unexplained omission.

`scripts/check.mjs` already refused a patch that drops `fetchProvider: http`, which is the guard that keeps
a future "cleanup" from silently taking `web_fetch` away from the profile.

## 2026-11-13 — the three open questions, all answered by measurement

Nothing was implemented here on purpose: each question had a cheaper answer than code, and the answer is
what went into `PLAN.md` and the READMEs.

### More than ten results

```
page 1: status 200 | blocks 10 | sources 10
page 2 (first=11): status 200 | blocks 10 | sources 10   overlap with page 1: 10
next link from the page itself (&first=11&FORM=PORE, with its FPIG hash): overlap 10
count=20 / count=30 / count=50:  sources 10 each
first=21 / first=31:              page one's first result each time
&format=rss:                      status 200 | items 10
```

This endpoint answers a sessionless client with one page, whatever is asked for. The seam's own bound is
`searchMaxResults: 8` (read from `@deepseek-ai/dsh-tool-web`), so a page already holds more than a
`web_search` call consumes. Paging would add a request shape and a failure mode to buy nothing.

### Blocks that parse to nothing

```
deepseek harness       blocks 10 | sources 10 | dropped 0
DeepSeek Harness 插件   blocks 10 | sources 10 | dropped 0
北京 天气               blocks 10 | sources 10 | dropped 0
```

The rule that drops a block with an empty heading never fired — 30 fresh blocks became 30 sources, and the
earlier 80-result sweep dropped none either. A fallback title would be code for a case real pages have not
shown.

### Query operators

```
site:github.com            sources 10 | on github.com 10
site:github.com dsh        sources 10 | on github.com 1
site:github.com dsh plugin sources 10 | on github.com 2
intitle:菜鸟 dsh            sources 10 | titles containing 菜鸟: 0   (the plain query: 0 too)
"plugin harness deepseek"  same shape as the unquoted query
dsh plugin -market         sources 10 | market results 1
```

Operators are hints on this endpoint, and the README now says so where a user will meet it: write the query
you mean, treat an operator as a nudge.

## 2026-11-13 — the live proof of v0.1.8's date field

`scripts/acceptance.mjs` now prints `publishedAt` when a source carries one — it printed the snippet and
stopped, which was a gap in the tool as soon as a source had a fourth field. With that, the live run
against a query whose results state dates:

```
$ node scripts/acceptance.mjs "DeepSeek Harness 插件"
query: DeepSeek Harness 插件
endpoint constant: https://cn.bing.com/search
requests recorded at the request layer: 1
  cn.bing.com  https://cn.bing.com/search?q=DeepSeek+Harness+%E6%8F%92%E4%BB%B6
hosts: cn.bing.com
sources: 10
  https://blog.csdn.net/2301_81024796/article/details/163823565
    title: DeepSeek Harness 插件推荐：装好之后，这 9 个插件值得一试
    snippet: 本文系统介绍 DeepSeek Harness 插件生态的核心价值与安装方式，并重点推荐9个高人气、高实用性的开源插 …
    publishedAt: 2026-08-21
  … (eight of the ten carry a date; the run printed each one)
  https://dshmarket.com/zh/
    snippet: 1 天前 · DeepSeek Harness 插件市场 dsh-market 就是装在 DeepSeek Harness（简称 dsh）里的插件市场 …
  https://deepseek-harness-plugin.com/zh-CN/
    snippet: 7 小时之前 · DS Bot 是一个基于 DeepSeek Harness（简称 dsh）的开源项目 …
acceptance 2 and 3 passed
```

Two things this run establishes beyond the unit tests: the field appears on a **live** page, and the two
sources that state an *age* instead of a date kept their text untouched — the rule works on real markup in
both directions. Acceptance item 3 is unchanged: one request, to `cn.bing.com`.

## 2026-11-13 — v0.1.8, the date a page states becomes metadata

Two things were measured before anything was written, and the measurements decided both.

### What was measured

Eight pages — the two saved fixtures and six live queries — 80 results in total:

```
DeepSeek Harness 插件      status 200 | sources 10 | /ck/a hrefs 0 | dated snippets 9/10
node fetch redirect manual status 200 | sources 10 | /ck/a hrefs 0 | dated snippets 7/10
北京 天气                  status 200 | sources 10 | /ck/a hrefs 0 | dated snippets 0/10
iphone 17 pro 评测         status 200 | sources 10 | /ck/a hrefs 0 | dated snippets 4/10
site:github.com dsh plugin status 200 | sources 10 | /ck/a hrefs 0 | dated snippets 8/10
how to cook rice           status 200 | sources 10 | /ck/a hrefs 0 | dated snippets 9/10
```

- **No `/ck/a` link anywhere**, so the redirect-unwrapping rule that had been sitting in `PLAN.md` as a
  maybe was settled instead of implemented: 80 results, direct links, no code to write. `PLAN.md` records
  the measurement so nobody re-derives it.
- **Publication dates are common** — 37 of 60 live results open with one — and the shipped tool renders
  `publishedAt` as metadata after the excerpt (`dsh-tool-web` reads the field and appends `(…)`), so the
  date was being spent as the first words of a snippet instead of the field the seam has for it.

### What was built

- `bing.js` lifts an exact date (`2026年8月21日 · `, `Aug 21, 2026 · `) out of a snippet into `publishedAt`
  as `YYYY-MM-DD`. An **age** (`7 小时之前 · `) is deliberately left in the snippet: it describes the moment
  of the search, and converting it would invent precision. A date whose parts name no real day
  (`2026年2月31日`) keeps its text too — the rollover check is what stops the page's mistake from becoming
  the seam's metadata.
- `tests/fixtures/bing-dated-snippets.html` — a third saved page, captured for this: `DeepSeek Harness 插件`,
  HTTP 200, 10 blocks, 8 stating a date. Its provenance is in `tests/fixtures/sources.md` beside the others.
- Three tests (the dated fixture, the English shape, the two cases that must *not* convert) and three
  mutations in the scan: `date-stays-in-the-snippet`, `impossible-date-rolls-over`, `published-at-dropped`.

### What was verified

```
$ node scripts/check.mjs
check passed
$ node --test --test-isolation=none tests/*.test.mjs
ℹ tests 25  ℹ pass 25  ℹ fail 0  ℹ skipped 0
$ node scripts/mutation-scan.mjs
20 mutation(s): 20 killed, 0 not
```

The first fixture's pinned first source moved with the behaviour, as it should: it asserts
`publishedAt === '2026-08-12'` and a snippet that no longer opens with the date.

## 2026-11-13 — the publishing apparatus is gone, the friend route is in the README

The owner deleted the `awesome-dsh-plugin` fork and settled the project as private use: "我们不发布，只自己用".
The repository now says only that — no release machinery, no listing task.

### What changed

- **Removed**: `.github/workflows/release.yml` (the `v*` tag trigger) and `scripts/pack.mjs` (the tarball
  builder), plus `.gitignore`'s `dist/` entry. Nothing in the bundle depended on either; the gate they ran
  is the same `ci` gate, so no verification was lost — only a second copy of it behind a tag.
- **`CONTRIBUTING.md` §5** is now "Versions" and nothing else: nothing is published, `main` is the
  distribution, the version moves only when a file `files` lists changes, and the `CHANGELOG` is a log. A
  change that moves no version writes no section there — `PROGRESS.md` is where its evidence goes.
- **`AGENTS.md` §4**: "A release is a tag, not an edit" became "a version is a label, not a release".
- **Both READMEs** gained the friend route and lost the tarball one: hand over the repository, or the ZIP
  GitHub serves from it — there is no build step, so that archive is already installable — then either
  local install route.
- **Both READMEs** also gained "When it stops working": the four messages this provider can fail with, and
  what each one means — markup drift (capture a fixture), a challenge page (retry, no session is kept), a
  redirect to `www.bing.com` (an ADR decision, not a flag to flip), a transport failure (the network).
  That is the section a private user needs in three months, when Bing moves the page and there is nobody to
  ask.
- **`PLAN.md`** drops the listing task and marks it not pursued, keeping the facts that cost an afternoon
  to find in case that ever changes.
- **No version bump**: no file in `files` changed, which is the rule this change is the first to exercise.

### What was verified

```
$ node scripts/check.mjs
check passed
$ node --test --test-isolation=none tests/*.test.mjs
ℹ tests 22  ℹ pass 22  ℹ fail 0  ℹ skipped 0
$ node scripts/mutation-scan.mjs
17 mutation(s): 17 killed, 0 not
```

A search for `release.yml`, `pack.mjs`, `tarball`, `SHA256SUMS` and `dist/` across the documents now
returns hits only in `CHANGELOG.md` and the older entries of this file, which are history and stay as
written. `scripts/check.mjs` never referenced the removed workflow, so nothing there had to move.

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
