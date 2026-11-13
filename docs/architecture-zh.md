# 架构

> Owner: @FrozenYty · Revisit when: 能力缝的 provider 接口变化，或 Bing 的结果页不再匹配解析器

[English](architecture-en.md)

dsh-search 是给 `ctx.web` 能力缝用的一个搜索 provider：不需要 key，不发起模型调用，只访问一个主机。
本文写的是设计本身——bundle 的两半、它们实现的能力缝契约、provider 如何被选中、请求与解析、刻意
不做的部分，以及最先会出问题的地方。

难以反悔的决定记在 `docs/adr/` 里；本文描述的是那些决定产生的形状。

## 1. Bundle 的两半

| 文件 | 它是什么 | 允许 import 什么 |
|---|---|---|
| `index.js` | bundle 入口：构造 provider 对象并把它注册进 `ctx.web` | 只有能力缝 |
| `bing.js` | 查询、请求、解析、结果映射 | 什么都不 import |
| `cordis.patch.yml` | 能力缝的指向，以及本 bundle 自己的行 | — |
| `locale/en.json`、`locale/zh.json` | 插件清单里的标题与描述 | — |
| `icon.svg` | 插件清单图标 | — |

这样切分只为一个原因：搜索路径必须能在没有 Host 的情况下被真正跑一遍。`bing.js` 没有任何 import，
所以裸 `node` 能加载它，`scripts/check.mjs` 能在打桩的请求层上驱动它真实的 `search()`，手工验收跑的
也是同一个方法，只是换成真网络。唯一的 harness import——能力缝的 `WebError`——留在 `index.js`，
也就是注册发生、失败被翻译成能力缝词汇的地方。这个 import 为什么在 profile link 的 bundle 里能解析、
什么情况下会失效，记在 `docs/adr/0002-peer-dependency-on-the-web-seam.md`。

没有构建步骤，也没有生成的文件：工作树里是什么，profile 跑的就是什么。

## 2. Provider 契约

能力缝的注册表以 `id` 为键，最多调用四样东西：

| 成员 | 本 provider | 原因 |
|---|---|---|
| `id` | `bing-html` | profile 用来指定的稳定键；已冻结（`docs/adr/0003-provider-id-and-plugin-name.md`） |
| `available()` | `true` | 没有 key、没有端点选择、没有凭据要检查，可用性就是常量 |
| `search(request, signal)` | 一次 GET，然后解析 | 全部操作；返回 `{ sources, truncated }` |
| `ready(llmProvider)` | 不提供 | 不提供 `ready()` 就等于"永远就绪"，这让凭据型 provider 无法鉴权的路由上，`web_search` 仍然可用 |

`sources[]` 的每一项带 `url` 和 `title`，块里有摘要时再带 `snippet`。能力缝的词汇把后两者定义为可选；
本 provider 总是填 `title`（没有标题的块不算结果），摘要为空时省略字段而不是送一个空字符串。

失败一律抛出，从不作为返回值：`bing.js` 抛 `BingSearchError`，带能力缝的错误码——请求或页面有关的
是 `WEB_PROVIDER_ERROR`，调用方取消的是 `WEB_ABORTED`——入口把它翻译成同码的 `WebError`，原始失败
挂在 `cause` 上。程序性错误不翻译：它按原样冒出来，bug 就该长这样。

`request.maxResults` 被 provider 刻意忽略。能力缝在 provider 返回之后再截断 `sources[]`，并在截断时
置 `truncated`；在这里再截一次，等于给同一个边界写第二条规则，两条还可能打架。provider 报
`truncated: false`，因为它没有截断任何东西。

## 3. 选中：跑的是哪一个 provider

能力缝每次调用时解析一次 provider，而且从不由注册顺序决定：

- 配置了 id 时，该 id 已注册且 `available()` 为真，就用它；
- 没有配置 id 时，只有一个可用 provider 才用它，有两个则报错（`WEB_PROVIDER_AMBIGUOUS`）；
- 配置的 id 不存在或不可用，报错并点名它。

这就是 `cordis.patch.yml` 要去覆盖 `web` 行 `searchProvider`、而不是指望注册本身的原因。随附的 base
bundle 把 `searchProvider` 钉在 `deepseek-official` 上，它是注册着的、也自报可用，所以只注册第二个
provider、不挪这个钉子，什么都不会变。同一个陷阱的另一半是：能力缝的 `config` 是整体替换、从不深合并，
所以覆盖时必须把 `fetchProvider: http` 原样重写，否则 `web_fetch` 会失去它钉住的后端。

想换搜索 provider 的 profile，在自己的 `cordis.patch.yml` 里再覆盖一次 `web` 行即可。本仓库里的
`cordis.patch.yml` 是 bundle 的那一层，不是 profile 的决定——profile 自己那一层在后面，优先级更高。

## 4. 请求

一次 HTTPS `GET`，只访问一个主机：

```
https://cn.bing.com/search?q=<query>
```

- **端点是常量。** `www.bing.com` 会回 302，`Location` 指向 `cn.bing.com`，而实测过的其他候选都拿不到
  可解析的结果页；证据在 `docs/adr/0001-cn-bing-html-endpoint.md`。做成可配置，只会引入一个没人测过的值。
- **`redirect: "manual"`。** 永不跟随重定向。任何 3xx 都变成一条点名状态码和 `Location` 的错误，所以
  "跳到 www.bing.com" 是一个可见的失败，而不是一次发向本 provider 没选过的主机的请求。这是验收第 3 条
  的结构性一半；`scripts/check.mjs` 里的请求层断言是实测的那一半。
- **浏览器形态的 `User-Agent` 与 `accept-language`。** 页面给哪种标记由 agent 字符串决定；保存下来的
  fixture 就是用这组头抓的，所以解析器测的是同一种页面。
- **查询参数是 `q`**，由 `URLSearchParams` 做 URL 编码；空查询在发请求前就失败。
- **只有一页。** 不翻页、不重试、不缓存、不加定时器。Bing 第一页大约十条自然结果，已经多于工具默认的
  `maxResults`；翻第二页只会多出一种没人要求过的请求形态。

## 5. 解析

解析是对响应体的扫描，不是 DOM：bundle 没有任何依赖，而结果页对几个带锚点的模式来说足够规整。

| 步骤 | 规则 |
|---|---|
| 块边界 | class 列表里带 `b_algo` 这个词的每个 `<li>`；每块切到下一个边界，块永远不会读到邻居里去 |
| 标题与 URL | 块内第一个 `<h2>` 锚点——结果自己的链接，不是它上面那个站点图标链接 |
| URL 归一 | 用 `new URL` 相对端点解析；非 web 协议丢弃；相对和协议相对链接都会变成绝对地址 |
| 摘要 | 先 `<p class="b_lineclamp…">`，再旧的 `<div class="b_caption"><p>`；取最长的匹配 |
| 文本 | 先解数字实体和 Bing 实际发出的命名实体，再剥标签，再压空白 |
| 顺序与去重 | 按页面顺序，按 URL 去重 |

没有标题锚点、没有可用 URL、或标题为空的块直接跳过。整页**一条都解析不出来**是失败，不是空结果：
这个插件最可能的静默失效方式就是页面形状变了，而空列表会把它报告成"没有结果"。失败信息会说它怀疑
哪一种——反爬页，还是不再匹配的标记。

## 6. 刻意不做的事

- **不要 API key、不要账户、不发模型调用。** 这就是全部意义：搜索不依赖余额。
- **不提供 `web_fetch` provider。** 抓取是另一种操作，有另一套信任问题；随附的匿名 HTTP provider 负责
  那一半，本 bundle 不碰。
- **没有设置项，也没有 `Config` schema。** 没有任何可调的东西。设置行需要 schemastery，而一个没人测过
  的字段，是一种不碰仓库就能弄坏解析器的办法。
- **没有定时器、重试、缓存或后台任务。** 一次调用，一次请求，一个答案。
- **不翻页，也不自己限制结果数。** 见第 2 节和第 4 节。
- **没有备用搜索引擎。** 每个候选都实测过，没有一个能返回可用页面；一个永远走不到的回退分支就是死代码
  （`docs/adr/0001-cn-bing-html-endpoint.md`）。

## 7. 风险，以及它们长什么样

| 风险 | 症状 | 在哪里被处理 |
|---|---|---|
| Bing 改了结果页标记 | `WEB_PROVIDER_ERROR: … no parseable result block` | 解析器的零结果失败；fixture 与解析测试就是警报 |
| Bing 返回反爬页 | `WEB_PROVIDER_ERROR: … a challenge page instead of results` | `looksBlocked`，只在什么都没解析出来时才会被问到 |
| `cn.bing.com` 不可达 | `WEB_PROVIDER_ERROR: … request failed`，并点名 URL | fetch 失败分支 |
| 出现重定向 | `WEB_PROVIDER_ERROR: … redirects to <target>, and this provider follows no redirect` | `redirect: "manual"` |
| 结果链接是 Bing 自己的跳转壳 | 一批直链里混进 `cn.bing.com/ck/a` 的 URL | 不处理；写进 README 的局限清单 |
| 被截断或损坏的响应里带着越界的数字实体 | 该实体保留为字面文本，页面其余部分照常解析 | `decodedCodePoint` |
| 能力缝改了 provider 接口 | 插件不激活 | `package.json` 里的 peer 范围；失败是响的，不是静的 |
| profile 没能为链接目录解析出 peer | 插件不激活（`ERR_MODULE_NOT_FOUND`） | `docs/adr/0002-peer-dependency-on-the-web-seam.md`，以及一条"peer 必须留在声明里"的检查 |

## 8. 本仓库能证明什么、不能证明什么

`node --test --test-isolation=none tests/*.test.mjs` 证明解析器在两个真实保存的响应上的行为，以及打桩
请求层上的请求形状；其中的入口测试加载**真实**的能力缝，证明 Host 拿这个 bundle 做了什么——`apply` 在
`bing-html` 下只注册一个 provider、该 provider 自报可用且没有 `ready()`、provider 的失败以能力缝的
`WebError` 带着自己的错误码抵达。`node scripts/mutation-scan.mjs` 证明这些测试能失败：它逐条打断
`bing.js` 与 `index.js` 的承重行，要求测试注意到——于是没人护着的代码行会被点名，而不是悄悄通过。
`node scripts/check.mjs` 证明清单、import 规则、locale 对、patch 行、文档，以及验收第 3 条那两条请求层
回归。实网搜索和真实会话是手工步骤：前者要网络，后者要插件被启用，而启用始终是 owner 的决定。真正跑过的
验收，连同输出，记在 `PROGRESS.md`。
