# 0004 — One backend, because the alternatives were measured again and none of them answers

- **Status:** accepted, 2026-11-13
- **Supersedes:** the *endpoint alternatives* table in ADR 0001 (the decision itself stands)
- **Related:** ADR 0001 (endpoint), ADR 0003 (frozen ids)

## Context

ADR 0001 chose Bing's HTML result page after measuring the engines available at the time. Since then the
question came back in a sharper form: *can this bundle stop depending on a single search source — Google,
if the network allows?*

That is a question about **this** network path, not about the engines in the abstract, so it was answered by
asking the network rather than by reasoning. `scripts/probe-backends.mjs` sends one request per candidate and
judges the answer by what a parser needs: result blocks a rule could read, and **direct** URLs rather than
the engine's own redirect — because `web_fetch` follows same-origin redirects only, so a result URL on the
engine's own host is a URL the model cannot open.

```
$ node scripts/probe-backends.mjs
query: deepseek harness

bing        usable         102174 bytes  10 result blocks
google      unreachable         0 bytes  fetch failed
duckduckgo  unreachable         0 bytes  fetch failed
brave       unreachable         0 bytes  fetch failed
mojeek      blocked           337 bytes  HTTP 403
baidu       challenge         517 bytes  HTTP 302 → wappass.baidu.com
so360       wrapped        800430 bytes  13 result blocks
sogou       challenge         357 bytes  HTTP 302 → www.sogou.com
searxng     unreachable         0 bytes  fetch failed

usable backends: bing
```

Two of these deserve their own note, because both looked promising for a while:

- **Baidu answered with 13–16 usable results for the first few requests**, with real URLs in its `mu=`
  attributes and clean `<h3>` titles. Then, after roughly eight requests in a few minutes, it began
  answering `HTTP 302 → wappass.baidu.com/static/captcha/…`: a captcha gate, for a sessionless client, in
  under ten requests. It is also a 1.2 MB card-template page whose description container is a build-hashed
  class name (a stable description was present on 4 of 30 result blocks), so a parser for it would return
  titles and URLs only. **The three probe runs made while writing this ADR, minutes apart, read `usable`
  once and `challenge` twice** — and that oscillation is itself the finding: a source that answers only
  sometimes is not one a fallback can lean on.
- **360 (`so.com`) returns 13 parseable blocks**, but every result URL is `so.com/link?m=…` — a
  cross-origin redirect away from `so.com`, which the shipped `web_fetch` provider refuses by design. Its
  results are therefore unfetchable, which makes them half-useful at best.

Everything else never got a body at all: Google, DuckDuckGo, Brave and a SearXNG instance fail at the
connection level on this path, Mojeek answers a captcha and then `403 … your network appears to be sending
automated queries`, and Sogou redirects to its own host.

## Decision

**Keep one backend: Bing's HTML result page, one request per search, no fan-out and no fallback.**

The reasons are the measurements above plus three structural ones:

1. **A second backend would not be dependable here.** The only candidates that returned results either
   challenged this client after a handful of requests (Baidu) or wrapped every URL beyond what `web_fetch`
   will follow (360). A fallback that answers with a captcha is a second failure mode wearing the costume of
   resilience — it would be exercised only when Bing fails, and would be stale or blocked exactly then.
2. **Merging would dilute the one source that works.** The seam caps a `web_search` call at 8 sources
   (`searchMaxResults`). Interleaving a weaker index into those 8 would trade good results for worse ones on
   every call, in exchange for coverage that is only useful when Bing is down.
3. **The risk it was meant to cover is already covered better.** Bing's markup drifting is the real failure
   mode, and it is detected — not guessed at — by `scripts/fixture-refresh.mjs`, which re-fetches the three
   pages through the provider's own request and exits non-zero when one parses to fewer sources than its
   saved copy. A second parser would not make that detection any faster; it would add a code path to keep
   alive.

The bundle stays a *single* provider under the frozen id `bing-html` (ADR 0003), which is what a profile
pins. A second *provider* would also be legal — the seam resolves the pin and never guesses — but it would
add a second id with no merge logic, i.e. the same weakness with more surface.

## Consequences

- A Bing failure is a search failure. The error message says which failure it is, and the README's "When it
  stops working" section turns each into a next action.
- The question "should we add engine X" now has a one-command answer, and it is asked of the network rather
  than of prose: `node scripts/probe-backends.mjs [query]`. It exits non-zero when Bing itself is unusable,
  so it doubles as a health check.
- The moment a candidate reads `usable` **and stays usable across a session**, the evidence to build that
  backend is in hand: a fixture captured through that engine's own request, a parser built on its stable
  hooks (Bing's are `b_algo`, the heading anchor and `b_lineclamp`), a rule for its dates if it states any,
  and the fan-out or fallback decided in a new ADR that supersedes this one.
- Nothing in this ADR constrains a *proxy*: if the user's path to Google changes, the probe will say so and
  the decision above can be revisited with data instead of opinion.
