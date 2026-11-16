# 0014 — The official mode can only detect presence, not a credential or a balance

- **Status:** Accepted
- **Date:** 2026-11-16
- **Supersedes:** —
- **Related:** ADR 0006 (choosing the search provider), ADR 0002 (the seam peer)

## Context

ADR 0006 promised that `official` fails with `WEB_PROVIDER_CONFIGURED_UNAVAILABLE` when the shipped
`deepseek-official` provider is "registered and unable to run". That sentence reads as though this bundle
could tell whether the account behind the provider has a credential or can pay. It cannot, and the
installed seam explains why.

Selection is synchronous. `ctx.web` resolves a provider by calling `provider.available()`, a synchronous
method, and nothing else before handing over the search. The shipped provider's `available()` is a
self-report about configuration, not about identity or money: it answers true when the row carries a
literal API key or supplies a credential resolver, its base URL parses, and its two integer bounds are
positive (`@deepseek-ai/dsh-web-search-deepseek` `lib/index.js:99-102`). A normal profile always supplies
both resolvers, so that answer is true whatever the credential store or the balance contains. The
provider's `ready()` is the credential check, and the seam asks it for `searchReady()` on a model route —
not in `search()`.

Two consequences follow, and both were observed:

- `provider: official` on an account with no credential or no balance passes the selection gate and fails
  at search time with the provider's own failure — an `HTTP 402` for an empty balance — not with
  `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`.
- `provider: auto` can only learn that the account cannot pay by paying for one failed request. It
  remembers the failure for the rest of the process, so that is one doomed request, not one per search.

## Decision

`official` and `auto` detect exactly two things:

1. **Presence.** Whether `deepseek-official` is registered, read from the seam's public listing
   (`ctx.web.listProviders()` where the seam exposes it) before the registry map it replaces.
2. **A synchronous self-report.** Whatever that provider's `available()` answers at the moment of
   selection.

They do not detect a stored credential, and they cannot see a balance. `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`
therefore means one thing only: the registered provider's own synchronous `available()` answered false. It
is not a claim about credentials or money, and ADR 0006's "unable to run" is read that way from here on.
`index.js`'s message says the same thing, so a user reading it is not sent to top up an account that may
already be fine.

No pre-flight credential or balance check is added. This bundle has no credentials plane, the seam's
selection contract is synchronous, and a check that duplicated the provider's own authentication would be
a second answer to a question the provider already answers — with more ways to disagree.

## Rationale

- A bundle that claims to know why an account cannot search, when it only knows that the provider's
  configuration looks complete, sends its user to the wrong fix. Naming the one fact it actually has is
  the honest interface.
- The alternative — a balance probe before selection — would need a credential, an endpoint and a network
  call this bundle does not own, and would make every search pay for a check the search itself performs.
- `auto` does not need the distinction: a failed search is the observation, and remembering it is what
  makes the fallback cheap.

## Consequences

- `official` on a dead account fails at search time with the provider's own message (measured on this
  machine's account: `HTTP 402` while the balance sat at `-0.09 CNY`). That message is the provider's, so
  it names the account and the balance; this bundle's message does not.
- `auto` pays for the first failure and then serves keyless for the rest of the process. The routing test
  that exercises `WEB_PROVIDER_CONFIGURED_UNAVAILABLE` uses a stand-in whose `available()` answers false;
  it pins the seam-level branch a real profile reaches only if the provider changes, not a credential
  state.
- The two failure codes keep their seam meaning: `WEB_PROVIDER_CONFIGURED_MISSING` is "this seam's
  registry does not contain the id" and `WEB_PROVIDER_CONFIGURED_UNAVAILABLE` is "it is there and its
  synchronous self-report says no". Neither is a diagnosis of the account.

## Revisit when

The seam asks a provider for an asynchronous "can this run now?" before selection, or the shipped provider
makes `available()` read the credential store or the account balance. Either change would give this
bundle a fact it does not have today; until then this ADR records the limit rather than working around it.
