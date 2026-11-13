# Fixture sources

Both files under this directory are full responses captured from the endpoint the provider requests
(`https://cn.bing.com/search?q=…`), saved unedited: the parser is tested against the page it will
actually meet, and a page that is trimmed until it passes proves nothing.

| File | Query | Captured | Response |
|---|---|---|---|
| `bing-deepseek-harness.html` | `deepseek harness` | 2026-11-13 | HTTP 200, 10 `b_algo` blocks |
| `bing-node-fetch-redirect.html` | `node fetch redirect manual` | 2026-11-13 | HTTP 200, 10 `b_algo` blocks |

Both were requested with a desktop Chrome `User-Agent`, `accept-language: zh-CN,zh;q=0.9,en;q=0.8` and
`redirect: "manual"` — the same request the provider builds, which is why the parser is tested against
this markup.

Refreshing a fixture is a deliberate act, and it is how a markup change is meant to be discovered:

```sh
node -e "const u='https://cn.bing.com/search?q='+encodeURIComponent('deepseek harness');fetch(u,{redirect:'manual',headers:{'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36','accept-language':'zh-CN,zh;q=0.9,en;q=0.8'}}).then(async(r)=>console.log(r.status,(await r.text()).length))"
```

Write the body over the file, update the row above, and run the tests: a fixture that no longer parses is
the alarm, and editing the parser to suit a fresh page without saying so in the commit message is how the
alarm gets silenced.
