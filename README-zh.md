# dsh-search

[English](README.md)

> 真正的结果页，不是账户余额。

一个 DeepSeek Harness 的 profile bundle：给 `web_search` 换上一个不需要 API key、不看账户余额、也不发
模型调用的搜索后端。它向 web 能力缝注册一个 provider，并把能力缝的搜索那一半指向它——于是当随附
provider 背后的账户余额耗尽时，搜索仍然可用；而那正是"聊天能用、搜索全断"的故障。

[github.com/FrozenYty/dsh-search](https://github.com/FrozenYty/dsh-search)

## 状态

- 当前版本：v0.1.2。
- **本仓库验证过的**：解析器在两个真实保存的结果页上的行为，打桩请求层上的请求形状，以及一个变异扫描——
  它逐条打断 `bing.js` 的承重行，要求必须有测试失败——`node --test`、`node scripts/mutation-scan.mjs`
  与 `node scripts/check.mjs`，输出都记在 `PROGRESS.md`。实网搜索是手工跑的，直连 `cn.bing.com` 并返回
  了真实结果；那次运行和输出同样在 `PROGRESS.md` 里。
- **本仓库证明不了的**：插件在 profile 里能否激活，以及真实会话里的 `web_search` 是否真的经由它返回结果。
  两者都需要启用这个 bundle，而启用是 owner 的决定；本仓库的检查从不加载 Harness。
- 版本列表：[CHANGELOG.md](CHANGELOG.md)。只追加的历史：[PROGRESS.md](PROGRESS.md)。

## 启用与验证

```
plugin_manager  install_bundle  target: <本仓库的绝对路径>
```

安装是把本目录 link 进 profile，而不是复制，所以跑的就是这棵工作树，没有构建步骤。它同时会应用本
bundle 的 patch——让这个 provider 被选中的，正是 patch 那部分，见下文。

之后的验证是真实调用，不是检查输出：

- patch 应用时没有关于目标行的警告，插件清单里这个 bundle 的标题是 **搜索**（英文界面为 **Search**）；
- 在一个聊天走中转、且 DeepSeek 账户余额仍为 0 的会话里问一个需要联网的问题。`web_search` 应当返回带
  绝对 URL 的来源，而它此前会以 `api.deepseek.com` 的 HTTP 402 失败；
- 证明"是它而不是随附 provider"的标志：搜索不再提到 `api.deepseek.com`；而用 `web_fetch` 打开返回的
  链接仍然可用，因为本 bundle 没有碰能力缝的抓取那一半。

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
块贡献标题、绝对 URL 和摘要；能力缝按调用方的 `maxResults` 截断列表。没有任何东西发给账户，没有计费，
也不涉及模型调用。

这次请求不会碰任何其他主机。`www.bing.com` 会重定向到 `cn.bing.com`，而本 provider 设置
`redirect: "manual"`，因此永不跟随重定向——它变成一条点名目标地址的错误。`scripts/check.mjs` 在请求层
断言：一次搜索只发一次请求、只发给 `cn.bing.com`，绝不发给 `www.bing.com` 或 `api.deepseek.com`。

## 唯一的那处组合改动

只注册 provider 并不足以被选中。随附的 base bundle 把能力缝的 `searchProvider` 钉在
`deepseek-official` 上，所以本 bundle 的 patch 把这个钉子挪到 `bing-html`，并把该行另一个字段原样重写
——能力缝对行的 `config` 是整体替换、从不合并，所以 `fetchProvider: http` 必须再写一遍，否则
`web_fetch` 会失去它的后端。

这就是全部足迹：一次行覆盖，一次行插入。它改的是安装它的那个 profile，且对该 profile 里所有会话生效，
所以写在这里，而不是埋在 patch 里。

## 局限与刻意不做的事

- **一个引擎，一个端点。** 在这台机器上，Bing 的 HTML 结果页是唯一能返回可解析页面的后端；其他候选及
  其响应在 `docs/adr/0001-cn-bing-html-endpoint.md`。没有备用引擎，端点也不可配置。
- **标记变化是真实风险。** 解析器读的是网页而不是 API。页面不再匹配时会以 `no parseable result block`
  失败，而不是悄悄返回空；`tests/fixtures/` 下保存的页面，就是让这件事表现为一个失败的测试而不是一桩
  悬案。
- **只有一页，大约十条。** 不翻页、不重试、不缓存。`web_search` 要得比一页更多时，拿到一页有的那些。
- **如果某条结果的链接被 Bing 包进自己的跳转**（`cn.bing.com/ck/a?…`），返回的会是那个跳转 URL 而不是
  拆开后的目标。今天的页面给的是直链，所以解析器不做拆解。
- **没有 `web_fetch` 那一半。** 抓取单个 URL 是另一种操作，有另一套信任问题；由随附的匿名 HTTP provider
  负责。
- **没有设置项、没有定时器、没有后台工作。** 没有可配置的东西，没有搜索在飞时就什么都不跑。

## 开发

```sh
node --check index.js bing.js
node --test --test-isolation=none tests/*.test.mjs
node scripts/mutation-scan.mjs
node scripts/check.mjs
```

`--test-isolation=none` 不是可选项：Node 22 把它拼作 `--experimental-test-isolation`，所以这个拼法本身
就把大版本固定在 Node 24；而默认 runner 会为每个测试文件 spawn 一个进程，这台机器的沙箱拒绝这种
spawn。CI 固定 Node 24 并跑同样的命令，所以本地通过和 CI 全绿是同一句话。

变异扫描是让测试保持诚实的那一环：它逐条修改 `bing.js` 的承重行，要求至少有一个测试失败。活下来的
变异就是一条没有任何测试护着的代码行，构建会带着它的名字失败。

发布是一次打标签，而不是一次编辑：`release` workflow 会重跑这道闸门，拒绝与本清单版本不一致的标签，
并发布 `dsh-search-<version>.tgz` 及其 `SHA256SUMS.txt`。`node scripts/pack.mjs` 能在本地构建同一个
tarball 到 `dist/`，所以不推标签也能复现一次发布。

手工验收是这道闸门替你做不了的那一件事：它需要网络，而会话那一项还需要插件已被启用。

## 仓库结构

| 路径 | 是什么 |
|---|---|
| `index.js` | bundle 入口：构造 provider 并注册进 `ctx.web` |
| `bing.js` | 查询、请求、解析、结果映射；不 import 任何东西 |
| `cordis.patch.yml` | 能力缝的指向，以及本 bundle 的行 |
| `tests/` | 两个真实保存页面上的解析测试，以及打桩 `fetch` 上的请求层测试 |
| `scripts/check.mjs` | 仓库闸门，含那两条请求层回归 |
| `docs/` | 设计文档（双语）与 ADR |
| `PLAN.md`、`PROGRESS.md`、`CHANGELOG.md` | 验收状态、只追加的记录、版本摘要 |
| `locale/`、`icon.svg`、`package.json` | bundle 的清单部分 |

## 其他问题在哪份文档里

| 问题 | 文档 |
|---|---|
| bundle 怎么分层、承诺了什么 | `docs/architecture-en.md` |
| 为什么端点是 `cn.bing.com`，为什么永不跟随重定向 | `docs/adr/0001-cn-bing-html-endpoint.md` |
| 为什么入口 import 了一个 Harness 包，而兄弟插件不 import | `docs/adr/0002-peer-dependency-on-the-web-seam.md` |
| 为什么叫 `dsh-search`，哪些 id 已冻结 | `docs/adr/0003-provider-id-and-plugin-name.md` |
| 验证了什么，输出是什么 | `PROGRESS.md` |
| 还有什么没被证明 | `PLAN.md` |

[AGENTS.md](AGENTS.md) 是给 AI 助手的；[CONTRIBUTING.md](CONTRIBUTING.md) 写分支、提交与 CI。
