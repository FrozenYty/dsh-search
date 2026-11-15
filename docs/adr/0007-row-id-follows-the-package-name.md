# 0007 — The patch row id follows the package name

- **Status:** accepted, 2026-11-15
- **Supersedes:** the frozen row id in ADR 0003, and only that part of it
- **Related:** ADR 0003 (the package name and the provider id, both unchanged), ADR 0006 (the field that row carries)

## Context

ADR 0003 froze two ids and one name: the provider id `bing-html`, the patch row id
`web-search-bing-html`, and the package name `dsh-search`. It froze the row id for a good reason — a profile
addresses that row when it overrides this bundle's configuration, so a rename silently stops an override
from matching — and said so explicitly: "frozen as long as the package is `dsh-search`".

The row id was also the only thing in the family spelled differently. `dsh-memory` inserts `memory`,
`dsh-cleaner` inserts `cleaner`; this bundle inserted `web-search-bing-html`, which names the *slot it
fills* (`web` + `search`) rather than the bundle. The Settings panel shows the row id beside the package
name, so the difference is visible to the person who owns the profile: one plugin in a list of four reads
like a Harness component instead of like the plugin they installed.

## Decision

**The inserted row is `search`: the package name without its `dsh-` prefix.** A profile overrides it as
`- id: search`.

- The **provider id stays `bing-html`** (ADR 0003 stands): it is what the seam's `searchProvider` names, it
  describes the backend rather than the bundle, and it is unchanged by this ADR.
- The **package name stays `dsh-search`** (ADR 0003 stands).
- `scripts/check.mjs` now derives the expected row id from `package.json`'s name instead of comparing
  against a second literal, so the two cannot drift apart again in either direction.

## What this costs, and who pays

An override that still says `web-search-bing-html` stops matching, and a patch that targets no row is
skipped with a warning rather than an error — the quiet kind of failure this repository tries to avoid. The
payment is one line in a profile:

```yaml
- id: web-search-bing-html   # before 0.2.0
- id: search                 # 0.2.0 and after
```

This profile does not pay it at all: nothing in it overrides the row, which was checked by reading the file
rather than assumed. The version moves to 0.2.0 for that reason — the row id is part of the contract, so a
rename is a breaking change even when nobody here is broken by it.

## Why not keep both

Registering the row twice, or accepting both ids, would make "which row does a profile override" a question
with two answers. One id, one spelling, and a check that derives it from the name it must match.
