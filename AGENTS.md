# AGENTS.md

Instructions for AI assistants working in this repository. Read this before your first task.

> This file holds only what is not written elsewhere. If a rule already lives in `CONTRIBUTING.md` or
> `docs/`, delete the copy here instead of maintaining two versions.

## 1. Before you start

Read, in this order:

```
README.md  ->  docs/architecture-en.md  ->  docs/adr/  ->  PLAN.md
```

- The files beat your memory. The plugin runs against a Harness and a search page that both change under
  you; anything you remember about either may already be wrong.
- For any question about behaviour, `bing.js` and `index.js` are the authority, then
  `docs/architecture-en.md`, then `README.md`.
- When something is unclear, say what is unclear and what would make it clear. Do not guess.

## 2. The project

A DeepSeek Harness bundle that registers one keyless search provider with the `ctx.web` seam and points
the seam's search half at it. Two constraints carry everything else, and both are decisions, not
oversights:

- **The endpoint is `cn.bing.com`, and a redirect is never followed.** `redirect: "manual"` is what makes
  "no request goes to `www.bing.com`" a property of the code rather than of today's routing
  (`docs/adr/0001-cn-bing-html-endpoint.md`). Do not "fix" a redirect by following it.
- **`bing.js` imports nothing, and `index.js` imports only the seam.** The import-free module is what
  lets plain `node` drive the real search path in the tests and in the request-layer checks; the entry's
  single import is a peer dependency whose declaration is what makes it resolve for a profile-linked
  bundle (`docs/adr/0002-peer-dependency-on-the-web-seam.md`). Adding a dependency to either file is a
  decision, not a convenience.

`PLAN.md` owns acceptance state; `PROGRESS.md` owns the record of what was verified. Do not restate
either here.

## 3. Working principles

1. **Look before you move.** Read the file, run the tests, check the installed seam. Never edit from
   memory.
2. **Smallest change that works.** If you write 200 lines and it could be 50, rewrite it.
3. **Simple beats clever.** No abstraction for single-use code, no configurability nobody asked for, no
   error handling for situations that cannot happen.
4. **Define done before coding.** The acceptance is a command that can fail, not a feeling.
5. **Change one thing, search the whole repository.** `docs/INDEX-en.md` lists what changes alongside
   what; a renamed id or a changed failure message appears in several files.
6. **Read the error.** A non-zero exit is information. Do not retry the identical command and hope.
7. **A blocked operation is a request for permission.** Say what was refused and ask, with the exact
   command. Do not route around a sandbox.
8. **Never claim a check you did not run.** A passing `scripts/check.mjs` never loads the Harness; only an
   enabled profile can show that the plugin activates.

## 4. Repository rules

- Branch names, commit format and PR rules live in `CONTRIBUTING.md`. Follow them; they are not repeated
  here.
- **An accepted ADR is closed.** To change a decision, write a new ADR that supersedes it.
- **Never force-push `main`.** CI is the only gate.
- **A fixture is evidence.** `tests/fixtures/` holds real captured responses; do not hand-edit one to
  make a test pass, and record where a new one came from in `tests/fixtures/sources.md`.
- **A version is a label, not a release.** Nothing is published: the number moves only when the bundle's
  own files change, and `main` is what a profile links (`CONTRIBUTING.md` §5). Never edit a version's
  contents after the fact — the log in `CHANGELOG.md` and the entry in `PROGRESS.md` are what say what it
  contained.

## 5. Verify before reporting

```sh
node --check index.js bing.js
node --test --test-isolation=none tests/*.test.mjs
node scripts/mutation-scan.mjs
node scripts/check.mjs
```

The mutation scan is not decoration: it breaks each load-bearing line of `bing.js` and `index.js` in turn
and requires the suite to fail. A survivor is a line no test stands behind; fix it with a test, never by
deleting the mutation.

`tests/entry.test.mjs` needs `@deepseek-ai/dsh-web` resolvable (`npm install` in the working tree, which
is what CI does before the tests). Without it those tests skip — not fail — so never leave a working tree
that skips them and call the entry verified.

`--test-isolation=none` is required here: the default runner spawns one process per test file and this
machine's sandbox refuses that spawn. It also requires Node 24 — Node 22 spells the flag
`--experimental-test-isolation` — which is why CI pins the same major. Do not simplify the flag away in
CI either: both sides run the same command so a local pass means the same thing as a green run.

Report in three parts:

1. **What changed** — files and behaviour, not intentions.
2. **How it was verified** — the commands and their real output.
3. **What is left undone** — be explicit; "it works" is not a report.

## 6. Language

Talk to your user in Chinese. Write everything to disk in English: code, comments, commit messages,
documents, PR descriptions. Chinese prose uses full-width punctuation — “”、，。；：（） — never ASCII
quotes or commas wedged into a Chinese sentence. The two README files are an intentional exception: they
are a bilingual pair, and the Chinese one is written as Chinese prose, not translated word for word.
