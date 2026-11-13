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

## 5. Releases

A version is published by a tag; the `release` workflow does the rest.

1. `CHANGELOG.md` gains the version's section, `package.json` carries that version, and `PROGRESS.md`
   gains the dated entry with the commands that were run — in the pull request that delivers the
   change, not in a later one.
2. Tag the merge commit on `main`: `git tag v0.1.3 && git push origin v0.1.3`.
3. The `release` workflow re-runs the gate, refuses a tag that does not name the manifest's version,
   builds the tarball with `node scripts/pack.mjs`, and publishes it with `SHA256SUMS.txt` on the
   release.

The tarball is the bundle and nothing else: `npm pack` reads `files` from the manifest, so the tests,
scripts, fixtures and documents stay out of it. It exists because a release download is the one install
route that needs neither the npm registry nor GitHub at install time — this package is `private`, and
the name `dsh-search` on npm belongs to another package (ADR 0003):

```sh
dsh plugin --profile <profile> add <path to dsh-search-<version>.tgz>
```

`node scripts/pack.mjs` rebuilds it locally into `dist/` (ignored) with the same checksum the workflow
publishes, so a release can be reproduced without pushing a tag.

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
- [ ] The version, its `CHANGELOG.md` section and its `PROGRESS.md` entry are in the same pull request,
      so the tag that publishes them has something true to name
