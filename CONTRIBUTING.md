# Contributing

How we work in this repository. Code style beyond what CI enforces is between the author and the
reviewer.

## 1. Branching

`main` is protected. Work happens on short-lived branches:

```
feat/parser-snippet    fix/redirect-error    docs/adr-endpoint
```

Lowercase, hyphen-separated, prefixed by type. No Chinese, no pinyin. Merge through a pull request, then
delete the branch.

## 2. Commits

Conventional Commits, with the module as scope:

```
feat(provider): register the Bing HTML search provider
fix(parse): read a class list with more than one token
docs(adr): record why the endpoint is fixed
chore(ci): run the repository checks on pull requests
```

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`. Modules: `provider`,
`parse`, `bundle`, `docs`, `ci`.

One commit does one thing. If the message needs "and", split the commit.

**Never add a footer that credits a tool.** No `Co-authored-by:` naming an AI assistant or a code
generator: a squash merge copies the message onto `main` verbatim, and the trailer counts as another
contributor.

## 3. Pull requests

- Keep a PR under **400 changed lines**. A fixture is exempt from the count; say so when adding one.
- Fill in the template: what changed, how it was verified, what else is affected.
- **CI is the only gate.** When every job is green the PR may merge.
- Merge with **squash** — one change, one commit on `main`.

## 4. What CI checks

| Job | Command | Fix |
|---|---|---|
| Modules parse | `node --check index.js bing.js` | repair the syntax error |
| Unit tests | `node --test --test-isolation=none tests/*.test.mjs` | fix the behaviour, not the assertion |
| Mutation scan | `node scripts/mutation-scan.mjs` | strengthen the test that should have failed; never delete the mutation |
| Repository checks | `node scripts/check.mjs` | read the reported file and key |

The mutation scan is the other half of the test suite. For each load-bearing line of `bing.js` it applies
one mutation in a throwaway copy and requires at least one test to fail; the run prints which test caught
each one. A mutation the suite still passes is a survivor — the line is unprotected, and coverage would
not have told you that, because coverage counts executed lines rather than checked ones. The fix is
always a test; a mutation is removed only when the line it breaks is gone.

`scripts/check.mjs` verifies, without loading the Harness and without the network:

- `package.json` parses, `dsh.bundle.patch` points at the patch, every path in `files` exists, and no
  install lifecycle script is declared;
- the peer declaration for `@deepseek-ai/dsh-web` is present and no `engines.dsh` range suppresses it;
- `bing.js` imports nothing, and `index.js`'s only bare import is the seam;
- `locale/en.json` and `locale/zh.json` carry the same keys, the titles `Search` and `搜索`, and a
  two-character Chinese title;
- `cordis.patch.yml` pins `searchProvider: bing-html` and restates `fetchProvider: http`;
- the bilingual document pairs exist, every document reference resolves, and no shared document carries
  an absolute machine path;
- **one search sends exactly one request, to `cn.bing.com`, and never to `www.bing.com` or
  `api.deepseek.com`** — asserted at the request layer with a stubbed `fetch`, which is acceptance item 3
  in its offline form.

It cannot prove that the plugin activates in a profile, or that the live endpoint answers. Those are
manual steps: the first needs an install, the second the network.

The entry tests are the one part of the suite that needs something installed: `tests/entry.test.mjs`
loads the real `@deepseek-ai/dsh-web` and exercises what the Host does with this bundle — the
registration, the provider it registers, and the translation of a provider failure into the seam's error
type. CI installs the seam as a step of its own (`npm install --no-save`), because the bundle itself
installs nothing at runtime. Without it those four tests skip rather than fail, so `scripts/check.mjs`
fails when the install step disappears: a silently skipped entry is the one file nothing else executes.

## 5. Versions

**Nothing is published.** Not to npm — the name there belongs to another package (ADR 0003) — and not as a
release either: this bundle is for its owner and a few friends, so `main` is the distribution, a profile
links the working tree, and `git pull` is the update.

Two things stay worth keeping straight:

- **`package.json`'s version** moves when the *bundle* changes — the files `files` lists, which are the ones
  a profile loads. A change to the tests, the scripts, the documents or the workflows does not need a new
  number, because no profile behaves differently.
- **`CHANGELOG.md`** is a log of what changed and when, grouped by the version the manifest carried at the
  time. It is a record, not a release contract, and its section belongs in the pull request that makes the
  change: a six-month-old "why" is otherwise gone. A change that moves no version writes no section there —
  `PROGRESS.md` is where its evidence goes.

A friend who would rather be handed a folder than a git remote can use GitHub's **Code → Download ZIP**.
There is no build step, so that archive is the whole installable bundle as it stands.

## 6. Files

- **Filenames are English**, lowercase, hyphen-separated.
- Never commit: `node_modules/`, logs, editor scratch, any `.env`.
- The bundle is installed by a link, so what is in the working tree is exactly what runs. A broken
  `index.js` on `main` breaks the author's next install.
- A fixture under `tests/fixtures/` is a captured response, not a document: it is never translated,
  reformatted or trimmed, and `tests/fixtures/sources.md` records where it came from and when.

## 7. Documents

`docs/INDEX-en.md` is the map. Naming and placement:

| What | Where | Name |
|---|---|---|
| entry points and live state | repository root, uppercase | `README.md`, `README-zh.md`, `AGENTS.md`, `CONTRIBUTING.md`, `PLAN.md`, `PROGRESS.md`, `CHANGELOG.md`, `LICENSE` |
| a design document | `docs/`, lowercase | `name-en.md` + `name-zh.md`, English as the source of truth |
| a decision | `docs/adr/` | `NNNN-short-title.md`, four digits, zero-padded, never renamed |

**The pair rule is enforced by a scan, not by a list.** `scripts/check.mjs` reads the top level of
`docs/` and classifies every `*.md` there, so a new document cannot escape the rule by not being added
to a list. Four shapes exist, and a file the rule cannot classify fails by name: a `-en.md` + `-zh.md`
pair; a single `-en-zh.md` carrying both languages by content, not by name; a deliberately
single-language `name.md` listed in `SINGLE_LANGUAGE_DOCS` in `scripts/check.mjs` with its reason; and
`docs/adr/`, which is English-only and numbered, so it never pairs.

**Nothing machine-specific goes into a shared document.** No absolute paths, no user names, no local
folder names. Write commands relative to the repository root.

- **Every design document carries an owner line** under its title:
  `> Owner: @handle · Revisit when: <trigger>`. A trigger, not a date. An ADR carries a
  `## Revisit when` section at the end instead.
- **A decision that is expensive to reverse becomes an ADR**, not a paragraph in `PROGRESS.md`.
- **Every citation resolves.** `scripts/check.mjs` follows each `docs/<name>.md` reference and each
  relative markdown link in these documents and in `index.js` and `bing.js`, and names the file when the
  target is not there. `PROGRESS.md` and `CHANGELOG.md` are exempt from nothing except history: an entry
  describes what was true when it was written.

## 8. Definition of done

- [ ] Every CI job is green on the PR
- [ ] The PR template is filled in
- [ ] Bilingual pairs updated in the same commit
- [ ] The acceptance box in `PLAN.md` is ticked in the same PR that delivers it — nobody ticks it for
      someone else
- [ ] `docs/INDEX-en.md` and `INDEX-zh.md` updated if a document was added, renamed or removed
- [ ] A dated `PROGRESS.md` entry records the commands that were run and their real output
- [ ] `CHANGELOG.md`'s section and the `PROGRESS.md` entry are in the same pull request as the change, and
      `package.json`'s version moves only if the bundle itself changed
