# 0008 — A recent page answers the same question again

- **Status:** accepted, 2026-11-15
- **Supersedes:** the "no caching" clause of ADR 0004 and of the READMEs' limits section
- **Related:** ADR 0004 (one backend), ADR 0009 (the survey that produced this, and what it refused)

## Context

ADR 0004 chose one backend and stated what that buys: one request per search, no retries, no cache. The
last part was inherited from a sentence rather than argued, and a survey of what comparable implementations
do (ADR 0009) found the opposite practice in every one of them: four independent scrapers keep a small
time-bounded cache, Claude Code keeps a 15-minute page cache in its own fetch path, and Codex's hosted
`web_search` runs in a mode whose name is `cached` and is its default.

The cost of not having one here is not latency. The request count is the one resource that can get this
client challenged, and a session asks the same question more than once — a follow-up, a re-check after a
tool result was truncated, a second call for the same fact. Each of those was a fresh request against a
page that had not changed.

## Decision

**A parsed page is reused for five minutes, up to 32 entries, and a failure is never reused.**

- The key is the **trimmed query**, exactly as it would have been sent. Not a normalised form: two queries
  that differ are two questions, and answering one with the other's results would be a wrong answer that
  looks right.
- The window is **5 minutes** and the bound **32 entries**; the entry order is least-recently-used first, so
  the bound evicts the page nobody has asked for since. Neither number is configurable: a knob nobody asked
  for is a value nobody measures, and both are commented where they are declared.
- **A failure is never kept.** A challenge page, an unreadable body, a 5xx, a parse that found nothing and a
  cancellation all leave the cache untouched — a bot gate wants a retry, not a memory of being blocked.
- **Results are copied on the way in and on the way out.** The seam truncates what it receives and a caller
  may annotate it; without a copy, either would edit the cache and the next caller would read the edit.
- **No in-flight de-duplication.** Two *concurrent* identical searches still make two requests. The shipped
  `web_search` tool already collapses exact duplicate queries inside one call, so the only remaining case is
  two callers racing, and a pending-request map would be a second bookkeeping of the same fact.

## What changes in the documents

"One search is one GET" becomes **one fetch is one GET**: acceptance item 3 still holds (it runs a single
search, which is a miss), and the READMEs' limits say the window instead of denying a cache. `truncated`
stays `false` for the same reason as before — the seam owns the result bound, and a reused page was parsed
under exactly that rule.

## What this does not buy

Nothing about correctness. A cached list is truncated by the seam like any other, and a page that changed
within five minutes is served as it was. A user who wants a fresh look at a query that has already been asked
in the last five minutes is asking for a second question, and this cannot tell the difference — which is why
the window is minutes rather than hours.

## Verification

`tests/cache.test.mjs` covers each clause with an injected clock: a second search inside the window makes one
request; one millisecond past it makes two; a different query is its own entry; a challenge page is asked for
again; the 33rd query evicts the 1st and not the 32nd; and a caller that empties its own result cannot empty
the cache through it. The mutation scan breaks each of those lines in turn and requires the suite to fail —
`reuse-window-never-closes`, `reuse-unbounded`, `reuse-hands-out-its-entry`, `reuse-keeps-the-callers-object`,
all killed.
