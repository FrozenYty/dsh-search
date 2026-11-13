# 0002 — The entry imports the seam, and declares it as a peer

- **Status:** Accepted
- **Date:** 2026-11-13
- **Supersedes:** —

## Context

Both sibling plugins in this workspace begin from the same rule: a profile-linked bundle imports no
`@deepseek-ai/*` package, because the link is a real path outside the profile, Node resolves bare
specifiers by walking up from that path, and the walk never reaches the profile's `node_modules`. Their
ADRs record the failure this produced:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@deepseek-ai/schemastery'
```

This bundle is a seam provider, and every provider in the ecosystem — the shipped
`@deepseek-ai/dsh-web-search-deepseek` and the third-party `dsh-bing-search` — imports `WebError` from
`@deepseek-ai/dsh-web`, because a provider failure is supposed to arrive as the seam's error type
carrying the seam's code. Reporting a failure as a plain `Error` with a `code` property would work
against today's consumers and quietly stop working against a consumer that routes on the class.

The installed Host resolves it, under one documented rule. The profile-resolution bootstrap admits a
linked root's importers to peer-aware ancestor lookup: at each `D/node_modules` position, a name the
current `D/package.json` declares in `peerDependencies` and that the runtime table carries resolves to
the runtime's copy; other names use the physical candidate. The runtime table's entries exist on disk
(`$DSH_HOME/profiles/node_modules/@deepseek-ai/*`, junctions into the installation), so a linked root
that declares the seam as a peer gets the runtime's seam. Nothing installs anything for this: the
declaration is what the resolver reads.

One more installed mechanism constrains the declaration. Before a profile imports a plugin, the Host
evaluates the plugin's DSH requirement: an `engines.dsh` range decides alone and `peerDependencies` are
then ignored, while without it **every** `@deepseek-ai/dsh` or `@deepseek-ai/dsh-*` peer range must
satisfy the runtime version — and that version is the app-boot package's own release, not the version of
the package the peer names. The two are separate numbers; a range written against one of them is not
automatically a range against the other.

## Decision

1. `index.js` imports `WebError` from `@deepseek-ai/dsh-web`. It is the bundle's only harness import;
   `bing.js` imports nothing, which is what keeps the search path runnable under plain `node`.
2. `package.json` declares `"@deepseek-ai/dsh-web": ">=0.1.5-rc.1 <0.3.0-0"` as a peer: a range that
   covers the runtime version this was built and tested against, and the same shape the third-party
   provider in this ecosystem uses.
3. `engines.dsh` is not declared, because declaring it would discard the peer field that the linked-root
   resolver reads.
4. `scripts/check.mjs` fails when the peer declaration is missing or when an `engines.dsh` range appears,
   so the two fields cannot drift apart silently.
5. A failure that is not the provider's own stays untranslated: `index.js` converts only
   `BingSearchError`, so a programming error surfaces as itself.

## Rationale

- The seam's error vocabulary is part of the interface this plugin implements; the class is how the
  interface is spelled.
- The alternative — a local error class with the same `code` strings — trades a loud, one-line load
  failure for a silent, unbounded behaviour difference. The failure mode of a wrong declaration is
  `ERR_MODULE_NOT_FOUND` at activation, which names the package and the fix.
- A permissive range with a hard upper bound keeps the plugin loadable across patch releases of the
  runtime while refusing a line where the seam's provider interface may have changed.

## Consequences

- The declared range was evaluated against the runtime of the installation this was built on, with the
  installed `semver` and the same call shape the Host uses, before the bundle was installed anywhere;
  `PROGRESS.md` records the command and its output.
- The bundle depends on a Host mechanism. A Harness whose linked-root resolution changed would refuse to
  activate this plugin rather than run it partially — the failure is loud and its message is the package
  name.
- The peer range is checked against the runtime version, so a runtime release outside the range refuses
  the plugin until the range is updated. That is deliberate: the range is a claim about which runtimes
  this bundle was verified against, not a formality.
- `bing.js` must stay import-free for the request-layer checks to keep working; the repository check
  enforces it.

## Revisit when

The Host gives linked bundles a resolution map of their own, or resolves peers without a declaration —
then the peer's only remaining job is compatibility, and this ADR is superseded. Also on the next
runtime version outside the declared range: widen the bound only after running the request-layer check
against that runtime.
