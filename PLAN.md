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
the scheme filter, entity decoding, tag stripping, the not-ok branch, the empty-page failure, the no-results
marker and its empty answer, the seam's provider listing, the malformed redirect target, the capped read and
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
tree, and `git pull` is the update. Nothing is published — no npm package, no release, and no tag at all —
so the `release` workflow and the packing script that used to serve that have been removed, and the four
tags that once existed were deleted (`CONTRIBUTING.md` §5). A friend is handed the repository, or the ZIP
GitHub serves from it, and installs the folder with either local route.

## Next

Candidates, not commitments. Each one costs a request shape or a parsing rule, so each is a decision to
make with a measurement in hand rather than a gap to close. Everything that was open has now been
measured, and almost none of it turned into code — the measurements are the answer. The 2026-11-15 survey of
comparable implementations (ADR 0009) is the one exception: it produced a reuse window and a charset fix,
and refused eight other upgrades by name with the number that refuses each.

- **Settled by the survey: no retry.** Twenty-five sequential live searches: 0 failures, p50 151 ms, p90
  213 ms, max 220 ms. The one implementation that retries by default does so because "on each retry, SearXNG
  uses a different proxy and source ip" — a client with one egress gets the same answer from the same
  server, which is the documented anti-pattern rather than the cure. **Re-measured on the fetch half on
  2026-11-15**, after two unexplained `Fetching … failed: TypeError: fetch failed` answers from the Host in
  one minute: 50 requests across five hosts returned **0 transport failures** (`github.com` 10/10, with
  p50 227 ms), so the retry that had been proposed for the fetch path was refused by the number that would
  have justified it. The same run found the one non-2xx cluster worth knowing about: `blog.csdn.net`
  answered non-2xx **9 times out of 10** when hammered in a loop at 40 ms intervals, which is what an
  anti-bot looks like from the outside and is why the provider returns a status as a result rather than
  throwing.
- **Settled by the survey: no URL normalisation before dedupe.** Ninety parsed results across nine pages
  held 0 exact duplicates and 0 duplicates modulo a tracking parameter, a trailing slash or `www.`; and no
  implementation in the corpus actually normalises — the practice is asserted far more often than it is
  evidenced.
- **Settled by the survey: no snippet cap.** Seventy snippets: min 35, p50 78, p90 126, max 132 characters.
  The 5 000-character cap in the survey belongs to a fetch tool reading whole pages, not to a SERP.
- **Settled by the survey: no off-topic guard.** The one implementation that rejects navigational results has
  a second engine to hand off to; this bundle does not (ADR 0004), so the guard could only turn a plausible
  but wrong answer into an error.
- **Settled by the survey: no body cap, no provider-side timeout, no error taxonomy.** Bodies measured
  101 757–104 021 bytes over nine pages — a 2 % spread — against a caller's 60 s deadline and a 220 ms worst
  case; and the seam carries exactly two codes to the model, so a richer taxonomy would have nowhere to be
  published.

- **Not pursued: listing this in `awesome-dsh-plugin`.** The owner deleted the fork and settled the
  project as private use, so the community index is out of scope. The facts that would matter if that ever
  changed are recorded, because re-deriving them cost an afternoon: the submission is one data file
  (`data/plugins/frozenyty__dsh-search.yml`, category `browser`), the repository has to be a day old and
  carry the `dsh-plugin` topic the owner declined, and the list already carries a Bing-backed provider
  (`godchen520/dsh-web-search-bing`) whose entry means a new one has to argue what it adds.
- **Settled: more than ten results.** Not available from this endpoint for a sessionless client.
  `count=20`, `count=30`, `first=11`, `first=21` and the page's own next link (with its `FPIG` impression
  hash) all returned page one's ten results, and `&format=rss` carried ten items as well. The seam asks for
  8 (`searchMaxResults`), so a page already exceeds a call's bound: paging would add a request shape and a
  failure mode to buy nothing.
- **Settled: unwrapping Bing's own redirect links** (`cn.bing.com/ck/a?…`). Eight saved and live pages —
  80 results — carried direct links and no `/ck/a` href at all, so a rule for them would be code nothing
  runs. If a page ever does carry one, the source URL shows up as a `cn.bing.com` link and this note is
  the place to start.
- **Settled: a block whose heading is empty.** The rule that drops such a block never fired — 30 fresh
  blocks over three queries parsed to 30 sources, and eleven pages dropped none. A fallback title would be
  code for a case real pages have not exhibited.
- **Measured, and stated in the README because a user meets it: query operators are hints.**
  `site:github.com` alone was honoured on all ten results; `site:github.com dsh` on one,
  `site:github.com dsh plugin` on two; `intitle:` and quotation marks changed nothing measurable.
- **Superseded: the fetch half is this bundle's own provider now.** ADR 0004 kept the shipped `http` provider
  on the argument that a second one would re-earn address pinning and redirect policy — an argument about
  policy that never measured content. It was measured in the 2026-11-15 survey: 61 % of what the model
  received was chrome by a lower bound, prose inside `<p>` was 1.4 % of it, and on three of five pages the
  100 000-character body cap was reached before the article began, so delegating could not recover the tail
  whatever it did with what arrived. ADR 0010 records the decision, the shipped numbers it borrows (its
  User-Agent, same-origin redirects only, a 5 MB read cap, the declared charset) and what it refuses to build.
- **Settled: no second backend, measured twice.** ADR 0001 measured the engines available when the endpoint
  was chosen; ADR 0004 measured them again when "add Google" was asked and found the same answer with more
  detail: Google, DuckDuckGo, Brave and a SearXNG instance are unreachable on this path, Mojeek answers
  `403`, Sogou redirects to itself, 360 wraps every result beyond what `web_fetch` follows, and Baidu
  answered 13–16 usable results for a few requests and then a captcha. `node scripts/probe-backends.mjs`
  re-asks the network in one command and exits non-zero when Bing itself is unusable, so the question stays
  answerable without re-reading an ADR from another month.
- **Run `dsh plugin add` once** — the READMEs document it as the ecosystem's route, and it is the one
  route this repository has not executed. The CLI is not on this shell's PATH, and installing pnpm ad hoc
  is not enough: `pnpm add` dies at its store operation lock (`os error 5`), a Windows kernel object this
  machine's sandbox refuses to open — the same boundary as the named-pipe denials seen elsewhere, and it
  is independent of `--store-dir`, `--state-dir` and `PNPM_HOME`. Finishing it needs an unsandboxed
  shell, which is the owner's call; the local-path form through the plugin manager is what has been
  exercised.
