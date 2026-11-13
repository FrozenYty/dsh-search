# 0003 — The package name, the display title, and the frozen ids

- **Status:** Accepted
- **Date:** 2026-11-13
- **Supersedes:** —

## Context

Three names have to be decided together, because all three are addresses something else reads back.

The package name is `dsh-search`. An unrelated community package on npm already carries that name. A
profile cannot hold two packages under one name, so installing both is impossible; nothing else about
the collision matters, and this bundle is `private` and never published, so the registry itself is not
involved. The alternative was a longer, unique name — `dsh-bing-search`, `dsh-web-search-bing`,
`dsh-search-bing` — and the reference provider in this ecosystem already occupies one of them. The
shorter word is the more accurate one: this plugin is a search provider, not a Bing plugin, and its one
endpoint is an implementation detail that ADR 0001 keeps replaceable in principle.

The display title is a pair: `Search` in `locale/en.json` and `搜索` in `locale/zh.json`. The two
sibling plugins in this workspace carry `Team`/`团队` and `Memory`/`记忆`: the Chinese titles are two
characters, deliberately, as a family convention. A longer title would break the row it sits in and the
convention at the same time.

Two identifiers are override targets rather than labels:

- the provider id this bundle registers, `bing-html`, which a profile writes as
  `web.searchProvider` and which the seam's registry keys on;
- the patch row id, `web-search-bing-html`, which a profile addresses when it overrides this bundle's
  row, in the same way the shipped provider's row is `web-search-deepseek`.

## Decision

1. The package and the directory are `dsh-search`. The npm name collision is known and accepted; the
   name is not padded to make it unique.
2. `locale/en.json` carries `"title": "Search"` and `locale/zh.json` carries `"title": "搜索"`. Both
   locale files carry the same keys, and `scripts/check.mjs` fails if the Chinese title is not exactly
   two characters.
3. The provider id is `bing-html`: it describes the backend (Bing's public HTML result page) rather than
   the package, and it leaves the id a differently-backed Bing provider would want.
4. The patch row id is `web-search-bing-html` and is frozen as long as the package is `dsh-search`.
   Renaming it would silently stop a profile's override from matching, which is the failure mode a
   frozen id exists to prevent.

## Rationale

- A name is read by people, a title by users, and an id by configuration. The first two are chosen for
  meaning; the third is frozen because it is a key, and a key that moves loses whatever pointed at it.
- Two-character Chinese titles are a family convention, and a convention nothing checks is a convention
  that decays; the locale check enforces this one.
- `bing-html` rather than `bing` or `bing-free`: `bing` promises nothing about how it searches, and
  `bing-free` describes the price, which is the property least likely to stay interesting.

## Consequences

- A profile that installs this bundle and the npm package named `dsh-search` cannot hold both. The
  bundle is linked by path and `private`, so the conflict would be visible as a resolution error rather
  than as a wrong package being loaded.
- The title pair is short by design; a future description-style name belongs in
  `meta.description`, which both files also carry.
- The two ids can be cited by a profile, so this ADR is what a rename has to supersede.

## Revisit when

The plugin stops being Bing-backed (ADR 0001 superseded), or a second provider is added to this bundle —
then the provider id is per provider and this ADR's point 3 becomes a table. Or when the registry
collision actually bites, which would mean this bundle gets published, which `private: true` currently
forbids.
