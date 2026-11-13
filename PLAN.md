# Plan

The acceptance items for v0.1.0, each with the check that decides it and the state that check is in.
Ticking a box means the check was run and its output is in `PROGRESS.md`; nothing here is ticked on the
strength of the code looking right.

## A1 — a saved result page parses into at least five complete sources

Done when: `node --test --test-isolation=none tests/*.test.mjs` passes, and every source parsed from
`tests/fixtures/bing-deepseek-harness.html` carries a non-empty title, an absolute `https://` URL and a
snippet.

- [x] Delivered and recorded in `PROGRESS.md`.

## A2 — a live search against the provider's own entry point returns at least three results, all with absolute URLs

Done when: a manual run calls `BingSearchProvider.search()` over the network for a fixed query and
prints at least three sources whose URLs are absolute.

- [x] Delivered and recorded in `PROGRESS.md`.

## A3 — no request goes to `www.bing.com`, and none goes to `api.deepseek.com`

Done when: both are asserted **at the request layer** — the function the provider calls to send a
request — by `node scripts/check.mjs` offline over the fixture, and again by the manual run over the live
network, with the recorded host list printed in both cases.

- [x] Delivered and recorded in `PROGRESS.md`.

## A4 — in a real session, with chat going through the relay and the DeepSeek balance still at zero, `web_search` returns real results

Done when: the bundle is enabled in a profile, the patch applies with no warning about the rows it
targets, and a `web_search` in a live session returns sources rather than an HTTP 402 from
`api.deepseek.com`.

- [x] Delivered on 2026-11-13 and recorded in `PROGRESS.md`: installed into the desktop profile
      (`application: applied`, no warnings), and a `web_search` in that session — chat through the relay,
      account balance zero — returned eight live sources.

## A5 — every load-bearing line of `bing.js` is covered by a test that fails without it

Done when: `node scripts/mutation-scan.mjs` reports 0 survivors. It applies one mutation per claim —
the endpoint, the redirect policy, the block token, the heading anchor, the snippet shape, deduplication,
the scheme filter, entity decoding, tag stripping, the non-2xx branch, the empty-page failure and
cancellation — and names the test that caught each. A survivor means no test stands behind that line.

- [x] Delivered and recorded in `PROGRESS.md`.

## A6 — the entry is covered by tests that load the real seam

Done when: `node --test --test-isolation=none tests/*.test.mjs` runs `tests/entry.test.mjs` without
skipping (the seam is resolvable, which CI arranges), and `node scripts/mutation-scan.mjs` kills every
mutation that breaks a line of `index.js` — the registration, the id, the availability and the failure
translation.

- [x] Delivered and recorded in `PROGRESS.md`.

## How this ships

Owner and a few friends, not a release channel. `main` is the distribution: a profile links this working
tree, and `git pull` is the update, so nothing is published per change and no tag is owed to one. A
tarball is a deliberate act for a friend who would rather be handed one file (`node scripts/pack.mjs`,
or a `v*` tag for the workflow) — see `CONTRIBUTING.md` §5. The four tags that exist (v0.1.2–v0.1.5) are
history from before this was decided; they stay, and no fifth is planned.

## Next, once A4 is answered

Candidates, not commitments. Each one costs a request shape or a parsing rule, so each is a decision to
make with a measurement in hand rather than a gap to close.

- **Submit to `awesome-dsh-plugin`** — the community list most discovery runs through, which is also the
  index `dsh-market` reads. Its submission is one data file, `data/plugins/frozenyty__dsh-search.yml`,
  category `browser`; the draft with the exact description is in the session's scratch folder. Two
  automated requirements are unmet today and are not defects in the plugin: the repository must be at
  least **one day old**, and it must carry the **`dsh-plugin` topic**, which the owner declined. A third
  point has to be argued rather than passed: the list already carries a Bing-backed provider
  (`godchen520/dsh-web-search-bing`, the upstream of the fork this plugin was compared against in ADR
  0001), so the pull request has to name what this one adds — a fixed endpoint and a redirect that is
  never followed, with nothing to configure — under the list's "is it already covered" rule instead of
  presenting a duplicate. A maintainer reads the repository before merging, and a resubmission is not
  held against anyone.
- **Run `dsh plugin add` once** — the READMEs document it as the ecosystem's route, and it is the one
  route this repository has not executed. The CLI is not on this shell's PATH, and installing pnpm ad hoc
  is not enough: `pnpm add` dies at its store operation lock (`os error 5`), a Windows kernel object this
  machine's sandbox refuses to open — the same boundary as the named-pipe denials seen elsewhere, and it
  is independent of `--store-dir`, `--state-dir` and `PNPM_HOME`. Finishing it needs an unsandboxed
  shell, which is the owner's call; the local-path form and the release tarball are what have been
  exercised.
- **Unwrap Bing's own redirect links** (`cn.bing.com/ck/a?…`) if a result page ever carries them.
  Today's pages carry direct links, so this is a parser rule that would never run.
- **A second backend as a fallback** if one starts answering with a parseable page from this machine.
  Supersedes ADR 0001 rather than editing it.
- **More than ten results** if a `web_search` caller needs them: Bing's first page holds about ten, and
  paging would add a second request shape and its own failure modes.
