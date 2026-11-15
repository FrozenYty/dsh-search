# 0010 — The other half of the result

- **Status:** accepted, 2026-11-15
- **Supersedes:** ADR 0004's clause "the fetch half stays the shipped provider"
- **Related:** ADR 0009 (the survey that produced this and refused eight other upgrades), ADR 0008 (the reuse window), ADR 0001 (a redirect is never followed silently)

## Context

Since ADR 0004 this bundle has registered only a search provider and reused the shipped `http` fetch provider,
on the argument that a second fetch provider "would add an address-pinning and redirect policy of its own to
re-earn what the shipped one already does". That argument is about **policy**, and it was never a measurement
of **content**. The survey in ADR 0009 measured the content on five real pages:

```
github.com/<repo>      returned 100000 | after a chrome strip 24327 | prose in <p>    0 | chrome 75.7%
nodejs.org/api/url     returned 100000 | after a chrome strip 83686 | prose in <p>    0 | chrome 16.3%
blog.csdn.net/<post>   returned 100000 | after a chrome strip 31623 | prose in <p> 3111 | chrome 68.4%
developer.mozilla.org  returned 100000 | after a chrome strip 15279 | prose in <p> 2408 | chrome 84.7%
                       totals: 61.3% chrome by that lower bound; prose inside <p> is 1.4% of what arrives
```

Two facts come out of it, and the second is decisive:

1. **The model pays for chrome.** The lower bound strips only `<script>`, `<style>`, `<nav>`, `<header>`,
   `<footer>`, `<aside>` and comments — not cookie banners, sidebars or link farms — and it is still 61 %.
2. **A big page is cut before its article.** The shipped provider's own `maxBodyChars` is 100 000, applied to
   the **raw body**: three of the five pages reached it, and on the repository page the README had not begun.
   No transformation of what arrives can recover a tail that was never read — so a provider that *delegates*
   to the shipped one inherits that cut, while a provider that reads the page itself can extract first and
   bound what it hands over afterwards.

## Decision

**This bundle registers a second provider for the fetch half, and the patch pins it: `fetchProvider:
article`.** It reads the page itself and hands over its prose.

- **The policy is the shipped provider's, by its numbers**: the same `User-Agent`
  (`deepseek-harness/0.0.1 (+https://github.com/deepseek-ai)` — a browser disguise was measured earlier and
  made things worse), `redirect: "manual"` with **same-origin hops only** up to 5, a 5 MB byte cap on what is
  read, and the charset the response declares. Re-earning these is the cost of the decision and is accepted
  deliberately: the numbers are borrowed, not invented, and each has a test.
- **A redirect that changes origin is reported, not followed**, naming the target — the rule the search half
  already follows (ADR 0001), applied to the one case where a fetch could silently take the caller somewhere
  else.
- **A non-2xx answer is a result, not a throw**, as the seam documents: the caller reads the status.
- **The extraction is a rule, not a readability engine**: remove the containers that are never prose, drop
  navigation lists whose words are the anchors' words, keep headings, paragraphs, quotations, code and tables
  in document order, collapse whitespace, and **say so when the cap is reached**. That last clause is the
  survey's own finding, taken from both products: a truncated page that looks complete is worse than one that
  says it was cut.
- **`kind: 'text'`**, because the tool converts an `html` body with its own markdown pass and passes a `text`
  body through — so what this provider extracts is what the model reads, without a second pass over markup
  that no longer exists.
- **24 000 characters**, not the shipped provider's 100 000: that cap bounds what is *read*, this one bounds
  what is *paid for* on every later turn of a session.

An unterminated tag is dropped rather than pasted into the text, which the truncated repository fixture found:
a page cut mid-attribute would otherwise deliver `<a data-component="Button" …` to the model as prose.

## What was deliberately not built

A readability engine (scoring candidates, per-site rules, hidden-element heuristics) would be a model of the
web that nobody in this repository can maintain or test. The rule above is one sentence long, which is why it
can be tested on three saved pages, and why a page it reads badly is a bug report with a fixture rather than a
tuning session. Also not built: rewriting links into markdown (the page's own URL is what the model cites),
summarising with a model (this bundle has none — ADR 0009), and any per-site special case.

## Verification

`tests/article.test.mjs` holds eleven tests: three extraction tests on the saved pages in
`tests/fixtures/sources.md`, a navigation-list-versus-prose-list pair, the cap marker, the declared charset,
the byte bound on a read, a same-origin redirect that is followed, a cross-origin redirect that is reported,
a non-2xx answer that resolves, and three unusable URLs. The mutation scan breaks five of those lines in turn
and requires the suite to fail: `fetch-follows-another-origin`, `fetch-cap-unmarked`,
`extract-keeps-a-half-tag`, `extract-drops-every-list`, `extract-keeps-chrome`.
