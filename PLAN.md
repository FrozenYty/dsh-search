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

- [ ] **Open.** It needs the bundle enabled, and enabling it is the owner's decision: this repository's
      checks never load the Harness. The one-line enable command is in `README.md`.

## Next, once A4 is answered

Candidates, not commitments. Each one costs a request shape or a parsing rule, so each is a decision to
make with a measurement in hand rather than a gap to close.

- **Unwrap Bing's own redirect links** (`cn.bing.com/ck/a?…`) if a result page ever carries them.
  Today's pages carry direct links, so this is a parser rule that would never run.
- **A second backend as a fallback** if one starts answering with a parseable page from this machine.
  Supersedes ADR 0001 rather than editing it.
- **More than ten results** if a `web_search` caller needs them: Bing's first page holds about ten, and
  paging would add a second request shape and its own failure modes.
