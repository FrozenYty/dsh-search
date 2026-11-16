# dsh-search

[English](README.md)

[![ci](https://github.com/FrozenYty/dsh-search/actions/workflows/ci.yml/badge.svg)](https://github.com/FrozenYty/dsh-search/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.1.5--rc.1%20..%20%3C0.3.0-brightgreen)](https://github.com/deepseek-ai/deepseek-harness)

> 真正的结果页，不是账户余额。

一个 DeepSeek Harness 的 profile bundle：给 `web_search` 换上一个不需要 API key、不看账户余额、也不发
模型调用的搜索后端。它把 web 能力缝的**两半**都接管了：`bing-html` 搜 Bing 的公开结果页，`article` 让
`web_fetch` 拿到页面的正文而不是它的标记。于是当随附 provider 背后的账户余额耗尽时，搜索仍然可用——那
正是"聊天能用、搜索全断"的故障——而抓取一个页面花的上下文是它的文章，不是它的导航。

[github.com/FrozenYty/dsh-search](https://github.com/FrozenYty/dsh-search)

## 状态

- 当前版本：v0.5.1。
- **本仓库验证过的**：解析器在真实保存的结果页上的行为，打桩请求层上的请求形状，以及一个变异扫描——
  它逐条打断 `bing.js` 的承重行，要求必须有测试失败——`node --test`、`node scripts/mutation-scan.mjs`
  与 `node scripts/check.mjs`，输出都记在 `PROGRESS.md`。实网搜索是手工跑的，直连 `cn.bing.com` 并返回
  了真实结果；那次运行和输出同样在 `PROGRESS.md` 里。
- **已在真实 profile 里跑过**：2026-11-13 装进 desktop profile，在一个聊天走中转、DeepSeek 账户余额为 0 的
  会话里，`web_search` 返回了八条真实来源——正是本 bundle 存在的那个场景。安装输出，以及为什么可以断定是
  这个 provider 在服务这次调用，都记在 `PROGRESS.md`。
- **不是自动的**：`scripts/check.mjs` 与测试从不加载 Harness，所以上面那次实网检查每次都是手工步骤；本
  仓库里的任何东西都不能证明插件在**你的** profile 里能激活。
- 版本列表：[CHANGELOG.md](CHANGELOG.md)。只追加的历史：[PROGRESS.md](PROGRESS.md)。

## 安装与验证

两条路线，都是把同一个 bundle 装进 profile 并应用它的 patch。都不需要构建步骤，也都不经过 npm registry：
这个规模的项目里，工作树**就是**发布物——clone 下来、装这个路径，之后 `git pull` 就是升级。

**从 Harness 内** —— 让这个目录被安装：

```
plugin_manager  install_bundle  target: <本仓库的绝对路径>
```

**从命令行**，用同一个本地路径——这是插件生态其他项目通行的路线：

```sh
dsh plugin --profile <profile> add <本仓库的绝对路径>
```

不发布任何东西，link 进 profile 的工作树下次加载就会带上 `git pull` 的结果——升级的全部内容就这一条。要交给
朋友，把仓库给他就行：`git clone`，或者用 **Code → Download ZIP**；这里没有构建步骤，所以那个压缩包本身
就是可安装的 bundle。他用上面任意一条路线装这个目录、重启应用，插件列表里就会出现 搜索。

这个包不在 npm 上是有意的：npm 上的 `dsh-search` 属于另一个无关的包，而本包是 `private`——它被 link
或从文件安装，从不发布（`docs/adr/0003-provider-id-and-plugin-name.md`）。

无论走哪条路线，patch 都会把能力缝的 `searchProvider` 挪到 `bing-html`，并重写该行的 fetch 那一半。这
正是让 provider 被选中的部分，它对该 profile 里所有会话生效——见下文。

之后的验证是真实调用，不是检查输出：

- patch 应用时没有关于目标行的警告，插件清单里这个 bundle 的标题是 **搜索**（英文界面为 **Search**）；
- 在一个聊天走中转、且 DeepSeek 账户余额仍为 0 的会话里问一个需要联网的问题。`web_search` 应当返回带
  绝对 URL 的来源，而它此前会以 `api.deepseek.com` 的 HTTP 402 失败；
- 证明"是它而不是随附 provider"的标志：搜索不再提到 `api.deepseek.com`；而用 `web_fetch` 打开返回的
  链接，拿到的是页面正文（本 bundle 的 `article` provider 抽取出来的），不是它的导航。

想停用它，在 profile 自己的 `cordis.patch.yml` 里覆盖同一行即可——那一层在本 bundle 之后应用，优先级
更高：

```yaml
- id: web
  config:
    searchProvider: deepseek-official
    fetchProvider: http
```

## 它是怎么工作的

一次搜索就是一次到 `https://cn.bing.com/search?q=…` 的 HTTPS `GET`，然后解析响应体里的自然结果块。每个
块贡献标题、绝对 URL 和摘要；页面写明了发布日期时再带一个日期——它被从摘要里取出来并归一化，因为能力缝
把它当作独立字段、工具把它当元数据展示。能力缝按调用方的 `maxResults` 截断列表。没有任何东西发给账户，
没有计费，也不涉及模型调用。

Bing 自己在页面上标了"没有相关结果"时，本 provider 返回空列表——这是能力缝合法的答案。这么做是有意的：
`web_search` 会在第一个 provider 失败时丢掉同一次调用里的全部查询，所以在"这个查询本来就没结果"上抛出，
会把其他查询已经找到的来源一起丢掉。反过来，页面**没有**这个标记却一条都解析不出来，那仍然是漂移，仍然
要响亮地失败。

这次请求不会碰任何其他主机。`www.bing.com` 会重定向到 `cn.bing.com`，而本 provider 设置
`redirect: "manual"`，因此永不跟随重定向——它变成一条点名目标地址的错误。`scripts/check.mjs` 在请求层
断言：一次搜索只发一次请求、只发给 `cn.bing.com`，绝不发给 `www.bing.com` 或 `api.deepseek.com`。

## 由你决定谁来搜

装了本 bundle 的 profile 里有两种搜索可用：它注册的免 key 那种，以及随附的 `deepseek-official`（profile 里
可能还留着它的凭据）。**选哪个由你决定**，它在本 bundle 这一行的一个字段上：

```yaml
- id: search   # 0.2.0 之前是 `web-search-bing-html`（ADR 0007）
  config:
    provider: keyless   # keyless（默认）| official | auto
```

- `keyless` —— Bing 的结果页：不需要账户、不需要 key、不需要余额。默认值，也是此前所有版本的行为。
- `official` —— 由随附 provider 服务这次搜索，和聊天记在同一份账户上。能力缝的注册表里没有它时，搜索以
  `WEB_PROVIDER_CONFIGURED_MISSING` 失败；它自己的同步 `available()` 说跑不起来时，以
  `WEB_PROVIDER_CONFIGURED_UNAVAILABLE` 失败。**这两个错误码都不去看凭据，也看不到余额——本 bundle 看不到。**
  所以一个已经死掉的账户会通过这道闸，然后在真正搜索时以该 provider 自己的 `HTTP 402` 失败；消息里会点名
  你要的是哪个 provider：刻意做出的选择，不该悄悄变成另一种
  （`docs/adr/0014-the-official-mode-can-only-detect-presence.md`）。
- `auto` —— 随附 provider 能跑就用它，否则走免 key。失败的账户会在本进程内被记住，所以余额为 0 只欠一次
  注定失败的请求，而不是每次搜索都欠一次。

在这台机器上实测：账户余额 `-0.09 CNY`、`is_available: false`，所以今天能出答案的是 `keyless` 和 `auto`；
余额一充上，`official` 就能用。

profile 也可以用更直接的方式把本 bundle 整条移出这条路径——在它自己的 `cordis.patch.yml` 里覆盖能力缝那一行
（那一层在 bundle 之后应用，所以它会赢）：

```yaml
- id: web
  config:
    searchProvider: deepseek-official
    fetchProvider: http
```

这是更钝的工具：没有 `auto`，本 bundle 的错误消息也一并消失。两个开关都只有一行，区别只在于你要不要那个兜底。

## 另一半：`web_fetch`

能力缝有两半，而本 bundle 两半都拥有：`bing-html` 负责搜索，`article` 负责抓取。patch 在覆盖 `web` 那一行时
把 `fetchProvider: article` 一并钉住——能力缝会整段替换一行的 config，少了这一行，抓取那一半就会退回自动选择。

为什么自己写一个：随附的 `http` provider 把页面的**标记**直接交出来，杂质一并带上。在五个真实页面上实测，
**61% 的字符是杂质**（`script`、`style`、`nav`、`header`、`footer`、`aside`、注释——这还只是下界），而 `<p>` 里
的正文只占到达字符的 **1.4%**；五个页面里有三个在**正文开始之前**就撞上了随附 provider 那条 10 万字符的正文上限，
尾巴根本没被读到——所以对"到达的内容"做任何变换都救不回来。`article` 因此自己读页面，沿用随附 provider 的
数字（同一个 User-Agent、只跟随同源重定向、5 MB 读取上限、按响应声明的字符集解码），抽出正文，以 `text` 交出
——工具对 `text` 直接透传，不再跑它自己的 markdown 转换
（`docs/adr/0010-the-other-half-of-the-result.md`）。

它是**一条规则，不是可读性引擎**：先保留页面自己指认的正文容器——`<article>`、`<main>`，或 id/class 里写着
content 的那个段落文本最多的元素——移除页面标为隐藏的元素，再移除永远不是正文的容器，丢掉"字词就是锚文本"的导航
列表**与表格**——除非该块里带着段落，那不管链接密度多高都属于正文——按文档顺序保留标题、段落、引用、代码与表格，
丢掉整行都只是页面家具的那种行，并在**截到 24000 字符时明确说出来**——一个"看起来完整"的截断页比一个说自己被
截断的页更糟。改变 origin 的重定向会被点名报告而不是跟随；非 2xx 是结果，不是抛出。

User-Agent 是整 bundle 的一个决定，而且是诚实的那一个。在六个真实页面上实测，桌面 Chrome 伪装并非改进：

| 主机 | 产物 UA（默认） | 桌面 Chrome UA |
|---|---|---|
| `zhuanlan.zhihu.com` | 403——知乎自己的拦截 | 403，没有变化 |
| `blog.csdn.net` | 200，317 kB | **521，2 kB——更差** |
| `juejin.cn`、`developer.aliyun.com`、`github.com`、`deepseekharness.online` | 200 | 200 |

因此默认值保持不动：伪装在这里换不到任何东西，还会丢掉 CSDN 的整页；而随附 provider 抓不到的站点，是那些
无论你自称什么都会拒绝无会话客户端的站点。`web_fetch` 会把实际拿到的状态如实报告，这对模型来说就是诚实的答案。

## 唯一的那处组合改动

只注册 provider 并不足以被选中。随附的 base bundle 把能力缝的 `searchProvider` 钉在
`deepseek-official`、`fetchProvider` 钉在 `http` 上，所以本 bundle 的 patch 把两个钉子都挪走，并把这一行的每个
字段都原样重写——能力缝对行的 `config` 是整体替换、从不合并，两条都必须再写一遍，否则那一半会失去它的后端。

这就是全部足迹：一次行覆盖，一次行插入。它改的是安装它的那个 profile，且对该 profile 里所有会话生效，
所以写在这里，而不是埋在 patch 里。

### 装上去是打一个补丁，卸下来是这个补丁不存在

它**不往 profile 自己的文件里写任何东西**。足迹就是本 bundle 的 `cordis.patch.yml` 里的那两条，而 patch
文件只在 bundle 被安装时才被读：

| 安装会加上 | 卸载会拿走 |
| --- | --- |
| 一条行覆盖——`web`，重述 `searchProvider` 与 `fetchProvider` | base bundle 自己的两个 pin 回来（`deepseek-official`、`http`） |
| 一条行插入——`search`，本 bundle 的配置 | 那一行消失 |
| profile 列表里的 bundle 条目，以及它链接过来的路径 | 两者都由卸载动作一并移除 |

除此之外什么都不碰：没有数据目录（ADR 0011）、没有设置项、没有需要你手改的 profile 文件，而且 patch 里
**没有一处 `disabled:`**——本 bundle 从不关掉不属于它的插件，所以卸载它也不会悄悄改变别的插件的行为。这是
**门禁能证明的规则**，不是一句承诺：`cordis.patch.yml` 一旦出现 `disabled`，`scripts/check.mjs` 会点名到
文件与行号（`docs/adr/0013-installing-is-a-patch.md`）。

## 局限与刻意不做的事

- **一个引擎、一个端点，这是实测结论而不是图省事。** 在这台机器上，只有 Bing 的 HTML 结果页会返回可解析、
  可直接打开的链接：Google、DuckDuckGo、Brave 与某个 SearXNG 实例在这里根本连不通，Mojeek 回 `403`，搜狗
  302 回自己，360 把每条结果都包进 `web_fetch` 不会跟随的跳转，百度在约八次请求之后开始回验证码。
  表格在 `docs/adr/0004-one-backend-measured.md`；网络可能变了的时候，用
  `node scripts/probe-backends.mjs` 再问一次。
- **标记变化是真实风险。** 解析器读的是网页而不是 API。页面不再匹配时会以 `no parseable result block`
  失败，而不是悄悄返回空；`tests/fixtures/` 下保存的页面，就是让这件事表现为一个失败的测试而不是一桩
  悬案。Bing 自己的"没有相关结果"页面是本 provider 唯一会返回的空答案，它读的是页面自己的标记，所以不会
  和"标记结构不再匹配"混为一谈。
- **只有一页，大约十条，这就是这个端点的上限。** 不翻页、不重试——不是没试过，而是三种方式都量过：任何
  offset 与 count 都返回第一页那十条（`count=20/30/50`、`first=11/21/31`、页面自己给出的"下一页"链接及其
  `FPIG` 哈希、以及把第一次响应的 `set-cookie` 原样带回并附上 `Referer` 的同一请求）；Bing 的 RSS 形式
  （`&format=rss`）同样只有十条，`count` 与 `first` 一概无视；而这些请求用的都是宽查询（`python tutorial`、
  `中国 历史`），所以不可能是"结果本来就少"。**抓取那一半同样不重试**，而且这条也是量出来的：在出现两次无法
  解释的传输失败之后，五个主机共 50 次请求返回了 **0 次传输失败**——重试一个没人能复现的失败，就是没人保护
  的代码。同一次测量还发现：以 40 ms 间隔循环请求 `blog.csdn.net` 时，它十次里有九次回非 2xx——那是反爬在
  正常工作，也正是"非 2xx 当结果返回、而不是抛出"的理由。
- **上限是工具自己的默认值——你不需要改它，本 bundle 不依赖你改 profile 就能工作。** 一次 `web_search` 会把最多 `searchMaxQueries` 个查询（默认 4）
  合并成至多 `searchMaxResults` 条来源（默认 8）——这两个都是 `@deepseek-ai/dsh-tool-web` 的 schema 默认值。
  宿主里那条 `tool-web` 行**被 web 应用禁用了**，而会话真正跑的 `web_search` 是会话所属 agent preset 的一个
  子项，声明里只有 `fetch` 与 `searchTimeoutMs`、没有上限——所以在 profile 里写一行 `- id: tool-web`，合成出来
  是 24，工具实测仍是 8：preset 的子项不是加载器的树行，patch 根本到不了它。能被寻址的行是 preset 声明本身，
  覆盖它就必须把它的 `config` **整段**重写（`id`、`order` 以及完整的 `plugins:` 列表），因为 patch 对 `config`
  是整体替换，而 preset 是整份注册的——只点名一个子项的 config，会把它没写到的子项全部丢掉：

  ```yaml
  # 照抄应用里 presets/standard.patch.yml 那一行的完整 config，只改一个子项。
  # 不是可以只粘贴一半的片段：`plugins:` 必须逐条列全，`!!js` 表达式也要
  # 保留，否则那个工具会从这个 preset 里消失。
  - id: preset-standard
    config:
      id: standard
      order: 1
      plugins:
        # …… 照抄发布列表里的每一个子项，然后只改这一处：……
        - id: tool-web
          name: '@deepseek-ai/dsh-tool-web'
          config:
            fetch: true
            searchTimeoutMs: 60000
            searchMaxResults: 24
        # …… 以及列表里其余的部分 ……
  ```

  应用自带的四个 preset 里有三个声明了这个子项——`preset-standard`（`standard`）、`preset-ptc`（`ptc`）与
  `preset-cordis`（`cordis`）；`preset-minimal` 根本没有 `tool-web`——所以会话若用的是另一个 preset，就要对
  那一行做同样的覆盖。改动只对**下一个创建的 Agent** 生效，对已经跑着的会话无效。一次调用里问两三个子问题
  依然是撒开网的办法，想看更多就再调一次 `web_search`。想确认它生效了：工具**只在能力缝截断时**才追加
  `(Showing the first N sources…)`，所以那行消失就是改动生效了。层序、出处，以及为什么 profile 里那一行够不着
  这个子项，都写在 `docs/adr/0012-the-cap-lives-in-the-agent-preset.md`。
- **五分钟内解析过的页面会再次作答。** 五分钟、最多 32 个页面、最先淘汰最久没被问到的那个，失败则从不记住——
  验证码页要的是重试，不是"被封过"的记忆（`docs/adr/0008-reusing-a-recent-page.md`）。这是唯一一种不花请求
  的搜索；这一节其余每一条依然成立。

  改 profile 的 patch 文件不需要重启：已启用的 `hmr` 行在监听这些文件，文件一变就重新合成该 profile。（这个
  构建根本不读 `dsh.profile.patchReload`。）但重新合成到不了 agent preset：它是在**创建 Agent 时**展开的，
  所以已经在跑的会话保持它启动时的组合，新组合属于下一个 Agent。
- **如果某条结果的链接被 Bing 包进自己的跳转**（`cn.bing.com/ck/a?…`），返回的会是那个跳转 URL 而不是
  拆开后的目标。实测的 80 条结果里一次都没出现，所以解析器不做拆解；测量记在 `PLAN.md`。
- **查询操作符是提示，不是过滤器。** 在这个端点上实测：单独用 `site:github.com` 十条结果全部被遵守；
  `site:github.com dsh` 只守住一条，`site:github.com dsh plugin` 两条；`intitle:` 与引号没有可测量的影响。
  把你想搜的话写清楚，把操作符当成轻推，而不是保证。
- **没有域名过滤。** 能力缝的搜索请求只带查询词和结果上限，别的一概没有，所以 provider 收不到
  `allowed_domains`/`blocked_domains` 这类过滤——这是"它坐在哪一层"的限制，不是引擎的限制。把 `site:` 写进
  查询只在"整条查询就是这个操作符"时有效（实测，见上文）。
- **抓取那一半是一条规则，不是可读性引擎。** 它先保留页面自己指认的正文容器，再移除永远不是正文的容器与导航列表，
  其余按文档顺序保留，并在 24000 字符处截断且明确标注。它读得不好的页面是一个带 fixture 的 bug 报告，而不是一次
  调参会话；`docs/adr/0010-the-other-half-of-the-result.md` 写明了刻意没有做什么。
- **没有数据目录。** 本 bundle 什么都不写：没有磁盘缓存、没有索引、没有会随仓库或 profile 搬家的状态。
  `node scripts/check.mjs` 每次运行都会打印这个答案，`docs/adr/0011-no-data-directory.md` 写明了将来若确实需要
  落盘，路径只能是 `~/.agents/search`，且每次使用现算、绝不在加载时绑定。
- **没有设置项、没有定时器、没有后台工作。** 没有可配置的东西，没有搜索在飞时就什么都不跑。

## 它坏掉的时候

Bing 的结果页迟早会变。页面不再匹配时，provider 会**大声失败**而不是回一个空结果，报错里会写明是哪一种，
所以第一步是读它：

- `no parseable result block … shape may have changed` —— 标记结构变了。跑 `node scripts/fixture-refresh.mjs`：
  它会用**这个 provider 自己的请求**重新抓 fixtures 记录的那些页面，报告每个页面现在解析出多少条，并在某页比保存的
  fixture 少时以非零码退出。读过页面、确认解析器没错之后，用 `--write` 把它存下来并更新来源表的抓取日期。每周的
  `drift.yml` 跑的是带 `--via www.bing.com` 的那一次，因为 GitHub runner 收到的方向是
  `cn.bing.com → www.bing.com`；这台机器收到的方向相反（`www.bing.com → cn.bing.com`），同一个开关在这里只会
  换来一次重定向拒绝，所以本机该跑不带开关的那一次（[ADR 0001](docs/adr/0001-cn-bing-html-endpoint.md)）。
- `challenge page instead of results` —— Bing 认为这个客户端像自动化程序。过一会儿再试，或者用浏览器打开
  同一个查询一次；这个 provider 不保持任何会话和 cookie。
- `No results found.` —— 这不是失败。Bing 的页面带着它自己的"没有相关结果"标记，所以这个查询以空列表作答，
  而同一次调用里的其他查询各自保住了自己的来源。
- `HTTP 302 … redirects to https://www.bing.com/…` —— 路由变了。这是一个决策点而不是 bug：ADR 0001 说
  永远不跟随重定向，所以要写一份取代它的 ADR，而不是把那个开关翻过来。
- `Bing search request failed:` —— 请求根本没完成。这一种是网络问题，不是解析器。

`npm run acceptance` 会发一次真实请求并打印回来的东西，是在会话之外看到那条报错的最快方式。它只需要网络。

## 开发

```sh
npm install                       # 入口测试要加载的能力缝；bundle 本身不装任何东西
node --check index.js bing.js article.js
node --test --test-isolation=none tests/*.test.mjs
node scripts/mutation-scan.mjs
node scripts/check.mjs
```

另外有两条需要网络的命令，CI 都不跑：

- `npm run acceptance` 发一次真实搜索并打印返回内容；
- `npm run seam-range` 向 registry 问出 `peerDependencies` 范围**允许的每一个**能力缝版本，逐个读取它发布的
  类型声明，只要其中任何一个在 `query` 与 `maxResults` 之外还声明了搜索请求字段就失败——本 provider 就是照着
  这个假设写的，所以这条按**整个范围**核对，而不是只核对恰好装着的那一版。

`npm install` 只为入口测试而装：`index.js` import 能力缝，而 link 进 profile 的 bundle 是从运行时按 peer
拿到它的；那几个测试加载真实类而不是替身。不装它们会 skip——skip 就意味着入口没被验证，所以一旦 CI 不再
安装它，`scripts/check.mjs` 会失败。套件里其余测试完全不需要安装任何东西。

`--test-isolation=none` 不是可选项：Node 22 把它拼作 `--experimental-test-isolation`，所以这个拼法本身
就把大版本固定在 Node 24；而默认 runner 会为每个测试文件 spawn 一个进程，这台机器的沙箱拒绝这种
spawn。CI 固定 Node 24 并跑同样的命令，所以本地通过和 CI 全绿是同一句话。

变异扫描是让测试保持诚实的那一环：它逐条修改 `bing.js`、`article.js` 与 `index.js` 的承重行，要求至少
有一个测试失败。活下来的变异就是一条没有任何测试护着的代码行，构建会带着它的名字失败。

不发布任何东西，所以也没有"发布步骤"：上面这套闸门就是全部交付。版本号只在 bundle 自己的文件（`files`
列出的那些）变化时才动，具体是哪些写在 `CONTRIBUTING.md` 第 5 节。

手工验收是这道闸门替你做不了的那一件事：它需要网络，而会话那一项还需要插件已被启用。

## 仓库结构

| 路径 | 是什么 |
|---|---|
| `README.md`、`README-zh.md` | 本文件对：bundle 是什么，怎么安装、怎么验证 |
| `index.js` | bundle 入口：构造 provider 并注册进 `ctx.web` |
| `bing.js` | 查询、请求、解析、结果映射；不 import 任何东西 |
| `article.js` | 抓取那一半：自己读页面并抽出正文；只 import `bing.js` |
| `cordis.patch.yml` | 能力缝的指向，以及本 bundle 的行 |
| `tests/` | 真实保存页面上的解析测试，以及打桩 `fetch` 上的请求层测试 |
| `scripts/check.mjs` | 仓库闸门，含那两条请求层回归 |
| `docs/` | 设计文档（双语）与 ADR |
| `PLAN.md`、`PROGRESS.md`、`CHANGELOG.md` | 验收状态、只追加的记录、版本摘要 |
| `locale/`、`icon.svg`、`package.json` | bundle 的清单部分 |
| `.github/workflows/` | `ci.yml`：改动必须过的闸门；`drift.yml`：每周复核保存的页面 |

## 其他问题在哪份文档里

| 问题 | 文档 |
|---|---|
| bundle 怎么分层、承诺了什么 | `docs/architecture-en.md` |
| 为什么端点是 `cn.bing.com`，为什么永不跟随重定向 | `docs/adr/0001-cn-bing-html-endpoint.md` |
| 为什么入口 import 了一个 Harness 包，而兄弟插件不 import | `docs/adr/0002-peer-dependency-on-the-web-seam.md` |
| 为什么叫 `dsh-search`，哪些 id 已冻结 | `docs/adr/0003-provider-id-and-plugin-name.md` |
| 为什么只有一个后端——不能加 Google、百度或 360 吗 | `docs/adr/0004-one-backend-measured.md`；当前的答案用 `node scripts/probe-backends.mjs` 问 |
| Claude Code 的 `web_search` 是怎么做的，为什么我们不一样 | `docs/adr/0005-local-search-vs-server-side.md` |
| 由谁决定跑免 key 搜索还是随附的 DeepSeek 搜索，怎么切 | `docs/adr/0006-choosing-the-search-provider.md`、`cordis.patch.yml` |
| 为什么 patch 行 id 是 `search`，改名要付出什么 | `docs/adr/0007-row-id-follows-the-package-name.md` |
| 为什么页面会复用五分钟，为什么失败从不复用 | `docs/adr/0008-reusing-a-recent-page.md` |
| 对 Claude Code、Codex、PI 与各家抓取器的调研得出了什么，又拒绝了哪些改进 | `docs/adr/0009-the-survey-and-its-refusals.md` |
| 为什么本 bundle 自己拥有 `web_fetch` 而不再复用随附 provider | `docs/adr/0010-the-other-half-of-the-result.md` |
| 这个插件把我的数据放在哪里？ | `docs/adr/0011-no-data-directory.md`——它不存任何数据，`node scripts/check.mjs` 会把这句话打出来 |
| 为什么抬高搜索上限要改 agent preset，而不是 `tool-web` 行？ | `docs/adr/0012-the-cap-lives-in-the-agent-preset.md` |
| 装上去加上了什么，卸下来又拿走了什么？ | `docs/adr/0013-installing-is-a-patch.md` |
| `official` 与 `auto` 到底能探知账户的什么？ | `docs/adr/0014-the-official-mode-can-only-detect-presence.md` |
| 验证了什么，输出是什么 | `PROGRESS.md` |
| 还有什么没被证明 | `PLAN.md` |

[AGENTS.md](AGENTS.md) 是给 AI 助手的；[CONTRIBUTING.md](CONTRIBUTING.md) 写分支、提交与 CI。
