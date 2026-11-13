# 文档索引

> Owner: @FrozenYty · Revisit when: 有文档被新增、改名或删除

[English](INDEX-en.md)

这个仓库里有什么、哪个文档回答什么问题，以及一处改动还要连带改哪些地方。增删或移动文档之前先读这里。

## 1. 阅读顺序

```
README.md  ->  PLAN.md  ->  PROGRESS.md  ->  docs/architecture-en.md  ->  与你的改动相关的那篇 ADR
```

1. `README.md` —— 这个插件是什么、怎么启用、它不做什么。
2. `PLAN.md` —— 唯一的任务来源：验收条目和它们的状态。
3. `PROGRESS.md` —— 当前状态为什么长这样；只追加，记录真正跑过的验收。
4. `docs/architecture-en.md` —— bundle 的两半、能力缝契约、请求、解析、风险。
5. `docs/adr/` —— 难以反悔的那些决定。

## 2. 文档地图

| 问题 | 文档 | 语言 |
|---|---|---|
| 这是什么，怎么启用？ | `README.md` | 双语对 |
| 还有什么没被证明，完成的标准是什么？ | `PLAN.md` | 英文 |
| 验证了什么，输出是什么？ | `PROGRESS.md` | 英文 |
| 每个版本发布了什么（版本层面）？ | `CHANGELOG.md` | 英文 |
| bundle 怎么分层、承诺了什么、最先会坏在哪里？ | `docs/architecture-en.md` | 双语对 |
| 为什么端点是 `cn.bing.com`，为什么永不跟随重定向？ | `docs/adr/0001-cn-bing-html-endpoint.md` | 英文 |
| 为什么入口 import 了一个 `@deepseek-ai` 包，而兄弟插件不 import？ | `docs/adr/0002-peer-dependency-on-the-web-seam.md` | 英文 |
| 为什么叫 `dsh-search`，哪些 id 已冻结？ | `docs/adr/0003-provider-id-and-plugin-name.md` | 英文 |
| 分支、提交、合并怎么做？ | `CONTRIBUTING.md` | 英文 |
| 助手在这里要守什么规矩？ | `AGENTS.md` | 英文 |

## 3. 效力顺序

两份文档冲突时，按下面的顺序，后者胜：

1. 已接受的 ADR；
2. `docs/architecture-en.md`；
3. `PLAN.md`；
4. `README.md`；
5. `PROGRESS.md`（历史记录——它说的是当时为真的事，永远不改写）。

在 harness 行为上，装着的 Harness 胜过以上全部；在结果页内容上，Bing 胜过以上全部。本仓库与运行中的
系统不一致时，错的是本仓库。

## 4. 一处改动要连带改什么

| 如果你改了 | 同时要改 |
|---|---|
| 端点、请求头或重定向策略 | `bing.js`、`docs/architecture-en.md`、`README.md` + `README-zh.md`、`scripts/check.mjs`（请求层断言），端点若变动还要新写 ADR |
| 解析器的块、标题或摘要规则 | `bing.js`、`tests/parse.test.mjs`、页面形状变了就更新 fixture、`docs/architecture-en.md` |
| provider id 或 patch 行 id | `bing.js`、`index.js`、`cordis.patch.yml`、`docs/architecture-en.md`、`README.md` + `README-zh.md`、ADR 0003 |
| peer 声明，或入口的 import | `package.json`、`scripts/check.mjs`、ADR 0002 |
| 包名或显示标题 | `package.json`、`locale/en.json`、`locale/zh.json`、`scripts/check.mjs`、`README.md` + `README-zh.md`、ADR 0003 |
| 失败码或失败信息 | `bing.js`、`index.js`、`docs/architecture-en.md`、`tests/request.test.mjs` |
| 某个验收条目的状态 | `PLAN.md`（只在交付它的那个 PR 里打勾）以及一条带日期的 `PROGRESS.md` 记录 |
| 新增、改名或删除文档 | 本文件与 `INDEX-zh.md` |

## 5. 不在本仓库里的东西

- Harness 本身，以及它提供的能力缝。这些接口从装着的应用里读，绝不在此处留副本。
- profile。启用本 bundle 会改动 owner 的 profile，而 profile 不被本仓库跟踪。
- 被实测后放弃的其他搜索引擎。它们在 ADR 0001 里连同响应一起被点名，没有任何东西依赖它们。
