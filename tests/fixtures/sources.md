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

All three were requested with a desktop Chrome `User-Agent`, `accept-language: zh-CN,zh;q=0.9,en;q=0.8` and
`redirect: "manual"` — the same request the provider builds, which is why the parser is tested against
this markup. The third exists for one shape the other two happen not to carry enough of: a stated
publication date in front of the snippet, which the parser lifts into `publishedAt`.

**Pages** are the fetch half's evidence: three real pages whose chrome-to-prose ratio the extractor is
tested against. They were captured with the bundle's own `User-Agent`
(`deepseek-harness/0.0.1 (+https://github.com/deepseek-ai)`), `redirect: "manual"`, and cut at 200 000
characters so a fixture stays a fixture — a page that big is already past the point where a reader would
find the article, which is itself the finding the extractor exists to answer.

| File | URL | Captured | Page |
|---|---|---|---|
| `article-github-repo.html` | `https://github.com/FrozenYty/dsh-search` | 2026-11-15 | HTTP 200, 200 000 characters of a repository landing page: navigation, file list, README beyond the cut |
| `article-mdn-fetch.html` | `https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API` | 2026-11-15 | HTTP 200, 153 234 characters of a documentation page: sidebar, breadcrumb, article body |
| `article-csdn-post.html` | `https://blog.csdn.net/m0_71142057/article/details/163744699` | 2026-11-15 | HTTP 200, 200 000 characters of a blog post: banner, columns, article body |

Those three are not refreshed by `scripts/fixture-refresh.mjs`, which speaks the search provider's request;
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
