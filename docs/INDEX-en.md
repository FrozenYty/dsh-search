# Document index

> Owner: @FrozenYty · Revisit when: a document is added, renamed or removed

[中文](INDEX-zh.md)

What is in this repository, which document answers what, and what else has to change alongside a given
change. Read this before adding or moving a document.

## 1. Reading order

```
README.md  ->  PLAN.md  ->  PROGRESS.md  ->  docs/architecture-en.md  ->  the ADR that touches your change
```

1. `README.md` — what the plugin is, how it is enabled, and what it does not do.
2. `PLAN.md` — the only task source: the acceptance items and their state.
3. `PROGRESS.md` — why the current state looks like this, append-only, with the runs that were made.
4. `docs/architecture-en.md` — the bundle's two halves, the seam contract, the request, the parse, the risks.
5. `docs/adr/` — the decisions that are expensive to reverse.

## 2. Document map

| Question | Document | Language |
|---|---|---|
| What is this, and how do I enable it? | `README.md` | pair |
| What is left to prove, and what does done mean? | `PLAN.md` | English |
| What was verified, and with what output? | `PROGRESS.md` | English |
| What did each release contain, at release level? | `CHANGELOG.md` | English |
| How is the bundle laid out, what does it promise, and what would break first? | `docs/architecture-en.md` | pair |
| Why is the endpoint `cn.bing.com`, and why is a redirect never followed? | `docs/adr/0001-cn-bing-html-endpoint.md` | English |
| Why does the entry import a `@deepseek-ai` package when the sibling plugins do not? | `docs/adr/0002-peer-dependency-on-the-web-seam.md` | English |
| Why is it called `dsh-search`, and which ids are frozen? | `docs/adr/0003-provider-id-and-plugin-name.md` | English |
| How do we branch, commit and merge? | `CONTRIBUTING.md` | English |
| What are an assistant's rules here? | `AGENTS.md` | English |

## 3. Authority

When two documents disagree, the later one wins in this order:

1. an accepted ADR,
2. `docs/architecture-en.md`,
3. `PLAN.md`,
4. `README.md`,
5. `PROGRESS.md` (a historical record — it describes what was true then, and is never corrected).

The installed Harness beats all of them on Harness behaviour, and Bing beats all of them on what its
result page contains. If this repository and the running system disagree, the repository is wrong.

## 4. What else changes alongside a change

| If you change | Also update |
|---|---|
| the endpoint, the request headers or the redirect policy | `bing.js`, `docs/architecture-en.md`, `README.md` + `README-zh.md`, `scripts/check.mjs` (the request-layer assertions), a new ADR if the endpoint moves |
| the parser's block, title or snippet rules | `bing.js`, `tests/parse.test.mjs`, the fixtures if the page shape changed, `docs/architecture-en.md` |
| the provider id or the patch row id | `bing.js`, `index.js`, `cordis.patch.yml`, `docs/architecture-en.md`, `README.md` + `README-zh.md`, ADR 0003 |
| the peer declaration, or the entry's imports | `package.json`, `scripts/check.mjs`, ADR 0002 |
| the package name or the display title | `package.json`, `locale/en.json`, `locale/zh.json`, `scripts/check.mjs`, `README.md` + `README-zh.md`, ADR 0003 |
| a failure code or message | `bing.js`, `index.js`, `docs/architecture-en.md`, `tests/request.test.mjs` |
| the acceptance state of an item | `PLAN.md` (tick it only in the pull request that delivers it) and a dated `PROGRESS.md` entry |
| a document added, renamed or removed | this file and `INDEX-zh.md` |

## 5. Not in this repository

- The Harness itself, and the web seam it provides. Its interfaces are read from the installed
  application, never vendored here.
- The profile. Enabling this bundle changes the owner's profile, which is not tracked here.
- The other search backends that were measured and rejected. They are named, with their responses, in
  ADR 0001; nothing depends on them.
