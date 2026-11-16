# Fixture sources

Two kinds of evidence live here, and they are captured by different halves of the bundle.

**Search pages** are full responses captured from the endpoint the provider requests
(`https://cn.bing.com/search?q=…`), saved unedited: the parser is tested against the page it will
actually meet, and a page that is trimmed until it passes proves nothing.

| File | Query | Captured | Response |
|---|---|---|---|
| `bing-deepseek-harness.html` | `deepseek harness` | 2026-11-13 | HTTP 200, 10 `b_algo` blocks |
| `bing-node-fetch-redirect.html` | `node fetch redirect manual` | 2026-11-13 | HTTP 200, 10 `b_algo` blocks |
| `bing-dated-snippets.html` | `DeepSeek Harness 插件` | 2026-11-13 | HTTP 200, 10 `b_algo` blocks, 8 of them stating a publication date |
| `bing-no-results.html` | `asdkjhqweoiuzxcvbnm` (`&first=2000`) | 2026-11-16 | HTTP 200, 0 `b_algo` blocks: Bing's own `<li class="b_no">` no-results page |

The first three were requested with a desktop Chrome `User-Agent`,
`accept-language: zh-CN,zh;q=0.9,en;q=0.8` and `redirect: "manual"` — the same request the provider
builds, which is why the parser is tested against this markup. The third exists for one shape the other two
happen not to carry enough of: a stated publication date in front of the snippet, which the parser lifts
into `publishedAt`.

The fourth is the shape a page with no result blocks can take. It keeps the same headers and redirect
policy, and how it was reached is part of its provenance: this endpoint answers an ordinary nonsense query
with ten loosely related `b_algo` blocks, so the page was captured by asking past the end of the result set
(`&first=2000`). The provider itself sends no `first`; what the fixture records is Bing's no-results markup
(`b_no`), which the parser has to tell apart from a result page whose blocks stopped matching. It is not in
`scripts/fixture-refresh.mjs`'s capture list for the same reason: re-asking that query without `first`
returns results.

**Pages** are the fetch half's evidence: real pages whose chrome-to-prose ratio the extractor is tested
against. They were captured with the bundle's own `User-Agent`
(`deepseek-harness/0.0.1 (+https://github.com/deepseek-ai)`) and `redirect: "manual"`. Three are cut at
200 000 characters so a fixture stays a fixture — a page that big is already past the point where a reader
would find the article, which is itself the finding the extractor exists to answer. The fourth is whole
(332 612 characters), because the container rule's measurement needs the page's own `<article>` together
with the header and the sidebar above it.

| File | URL | Captured | Page |
|---|---|---|---|
| `article-github-repo.html` | `https://github.com/FrozenYty/dsh-search` | 2026-11-15 | HTTP 200, 200 000 characters of a repository landing page: navigation, file list, README beyond the cut |
| `article-github-repo-live.html` | `https://github.com/FrozenYty/dsh-search` | 2026-11-16 | HTTP 200, 332 612 characters, the same page uncut: header, sidebar and the whole README — the evidence for the container rule |
| `article-mdn-fetch.html` | `https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API` | 2026-11-15 | HTTP 200, 153 234 characters of a documentation page: sidebar, breadcrumb, article body |
| `article-csdn-post.html` | `https://blog.csdn.net/m0_71142057/article/details/163744699` | 2026-11-15 | HTTP 200, 200 000 characters of a blog post: banner, columns, article body |

Those four are not refreshed by `scripts/fixture-refresh.mjs`, which speaks the search provider's request;
they are documentation pages whose markup changes on someone else's schedule, and the extractor's tests
assert *structure* (chrome gone, prose kept, cap marked), not exact text.

Refreshing a search fixture is a deliberate act, and it is how a markup change is meant to be discovered:

```sh
node scripts/fixture-refresh.mjs           # compare: re-fetch each query and report what it parses to
node scripts/fixture-refresh.mjs --write   # accept: save the new pages and re-date this table
```

The tool sends the provider's own request — it wraps `fetch` and calls `BingSearchProvider.search` — so the
headers cannot drift from the ones the bundle uses. Compare mode exits non-zero when a live page parses to
fewer sources than its stored fixture; a page that parses to more is reported, not failed. `--write` is the
step after you have read the page: a fixture that no longer parses is the alarm, and editing the parser to
suit a fresh page without saying so in the commit message is how the alarm gets silenced.

`--via` is the runner's flag, not a local one. A GitHub runner is answered `cn.bing.com → www.bing.com` and
needs `--via www.bing.com`; a network answered the other way (`www.bing.com → cn.bing.com`) turns every
fixture into a redirect the provider refuses by design (`docs/adr/0001-cn-bing-html-endpoint.md`), so the
plain run is the one that checks them.
