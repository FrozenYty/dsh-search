# 0001 — The one endpoint, and the redirect that is never followed

- **Status:** Accepted
- **Date:** 2026-11-13
- **Supersedes:** —

## Context

The plugin exists because the shipped search provider makes an auxiliary model call against an API
account, and an account with no balance answers HTTP 402 — so chat works and every `web_search` fails.
A search backend that depends on no account has to be reachable and parseable from the machine the
Host runs on, and the candidates were measured there on 2026-11-13:

| Backend | Result |
|---|---|
| `cn.bing.com/search?q=…` | HTTP 200, 10 `b_algo` blocks, title, absolute URL and snippet parseable from each |
| DuckDuckGo `html`/`lite` | HTTP 202 with an anti-bot page, zero result blocks |
| Brave | HTTP 429 / 403 |
| public SearXNG instances | `format=json` disabled or rate-limited |
| `www.bing.com/search?q=…` | HTTP 302, `Location: https://cn.bing.com/search?q=…` |

Two consequences decided this ADR. First, only one backend answered. Second, the host that looks like
the obvious endpoint is not the one that serves the results: `www.bing.com` redirects to `cn.bing.com`,
and a client that does not follow the redirect gets an empty body — which is how "the request succeeded
but there were no results" becomes a mystery instead of a bug report.

## Decision

1. The endpoint is the constant `https://cn.bing.com/search`, and it is not configurable. No settings
   field, no `Config` schema, no environment override.
2. The request sets `redirect: "manual"`, so the provider never follows a redirect. Any 3xx becomes a
   `WEB_PROVIDER_ERROR` naming the status and the `Location`.
3. There is no fallback backend. If the request or the parse fails, the search fails, with a message
   that says which of the two happened.

## Rationale

- **A constant is a measured value; a setting is an unmeasured one.** The plugin's whole subject is
  "this machine cannot reach the account, and this endpoint works". A configurable endpoint invites a
  value nobody tested, and the failure it produces looks like a Bing problem.
- **Not following a redirect is a property, not an accident.** With `redirect: "manual"`, a redirect to
  `www.bing.com` cannot produce a request to `www.bing.com`; it produces an error that names the target.
  The request-layer assertion in `scripts/check.mjs` then checks one host list, and the guarantee does
  not depend on today's routing table.
- **A failover nobody can reach is dead code.** With one measured backend, a second engine would add a
  request shape, a parse path and a timeout policy that never run — and its own untested failure modes.

## Consequences

- Search depends on one host being reachable from the Host's network. When it is not, the error names
  the URL, and the recovery is the profile's (a different provider, or the shipped one).
- The parse is tied to a page shape served to a browser-like User-Agent. A shape change fails loudly
  rather than returning an empty list; the two saved fixtures and the parse tests are the alarm.
- Acceptance item 3 is testable in two independent ways: structurally, from the `redirect` policy, and
  measurably, from the recorded request URLs.

## Revisit when

A second backend answers with a parseable page from this machine — then a fallback is worth its cost.
Or when `cn.bing.com` starts requiring a cookie, a session or a challenge that a plain GET cannot pass —
then the endpoint or the request shape changes, and this ADR is superseded rather than edited.
