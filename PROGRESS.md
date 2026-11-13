# Progress

Append-only: what was built, what was run, and what it printed. A release's entry is added in the same
pull request that delivers it, and an older entry is never rewritten. `PLAN.md` owns the acceptance state;
this file owns the evidence behind it.

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
