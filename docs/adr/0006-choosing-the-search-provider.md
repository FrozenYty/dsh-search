# 0006 — The owner chooses who searches

- **Status:** accepted, 2026-11-13
- **Supersedes:** the "no configuration" stance of ADR 0001 and ADR 0003, for one field only
- **Related:** ADR 0003 (frozen ids), ADR 0004 (one backend, measured), ADR 0005 (this bundle against Claude Code's server-side tool)

## Context

ADR 0001 chose an endpoint, ADR 0003 froze the ids and both said the same thing about settings: there are
none, because a value nobody measured is a value nobody can trust. That held while the bundle was the only
way to search. It stopped holding once the shipped DeepSeek provider became usable again — its credential
is still in the profile and its balance can be topped up — because then there are two ways to search and
**the person paying for the account should decide which one runs**, not the bundle.

What the seam allows was measured before designing anything:

- `ctx.web.search(request, signal)` takes no provider argument, and the `web_search` tool passes none. The
  seam resolves `config.searchProvider` at call time, falling back to `DSH_WEB_SEARCH_PROVIDER` and then to
  the only usable provider. So "choose per search" is not available through the seam's API at all.
- A profile can already pin the shipped provider in its own `cordis.patch.yml`, and that layer is applied
  after a bundle's, so it wins. That is a real choice — but it is a line of YAML in a hidden file, which is
  not the same thing as the plugin offering one.
- Cordis passes a row's config through unchanged when the plugin declares no `Config` schema
  (`if (!runtime.Config) return config`), so a field costs this bundle no dependency and cannot make a
  profile's config fail to load — which matters, because `index.js` is allowed exactly one bare import.

## Decision

**This bundle's row carries one field, `provider`, and its three values are the owner's choice:**

```yaml
- id: web-search-bing-html
  config:
    provider: keyless   # keyless (default) | official | auto
```

- `keyless` — Bing's result page, no account involved. The default, and the behaviour every earlier version
  had.
- `official` — the shipped `deepseek-official` provider serves the search, on the account and its balance. If
  it is not registered, or registered and unable to run, the search fails with the seam's own code
  (`WEB_PROVIDER_CONFIGURED_MISSING` / `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`) and a message that says which
  provider the profile asked for. Chosen deliberately, it must not quietly become something else.
- `auto` — the shipped provider when it can run, otherwise keyless. A failed account is remembered for the
  rest of the process, so a zero balance costs one doomed request, not one per search.

The provider id stays `bing-html` (ADR 0003): it names *this bundle's* provider, and which backend serves a
search is that provider's config. Renaming it would break the pin a profile already carries for no gain.

An unrecognised value falls back to `keyless` rather than refusing to search: a typo in a profile should not
turn `web_search` into an error, and the default is the mode that needs nothing.

## Why this shape, and not the alternatives

- **A settings panel (a client half).** The best experience, and a different order of work: this bundle has
  no browser half, no build step and no client entry, and its whole surface today is one host-side provider.
  The field above is what such a panel would write, so the panel can come later without redoing this.
- **Two registered providers, unpinned.** The seam answers `WEB_PROVIDER_AMBIGUOUS` when more than one is
  usable and none is configured, so a bundle that registers a second provider must still pin one. Pinning is
  therefore not optional, and the choice has to live in config either way.
- **A per-search argument.** Not available: neither the seam's `search()` nor the tool takes a provider. If
  that ever changes, this field becomes a default rather than the only way to choose.

## Consequences

- The choice is the owner's, it is documented where the row is, and it is testable without a profile: seven
  routing tests cover the three modes, the fallback for an unknown value, both failure codes, and the
  once-per-process memory in `auto`.
- `auto` is the one mode whose behaviour is not obvious from its name, so it says what it does in the
  config comment, the READMEs and here.
- The seam's own pin remains the blunter instrument: `searchProvider: deepseek-official` takes this bundle
  out of the path entirely, including its error messages and its `auto`. Both are documented together so the
  difference is a choice rather than a discovery.
