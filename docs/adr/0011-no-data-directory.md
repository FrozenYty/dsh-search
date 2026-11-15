# 0011 — This bundle stores nothing, and where it will when it does

- **Status:** accepted, 2026-11-16
- **Related:** ADR 0008 (the reuse window, which is memory and not disk), ADR 0003 and ADR 0007 (ids)

## Context

The workspace settled one rule for plugin data: **`~/.agents/<plugin>`**, resolved as
config field → environment (`DSH_<PLUGIN>_DATA_DIR`) → that path, computed at **every use** — and never
derived from a workspace, a profile's default directory, the repository location, `import.meta.url` or
`__dirname`.

The rule exists because of a real incident in a sibling plugin. `dsh-cleaner` resolved its data directory
once, at load, from a chain whose middle leg was a workspace registry that was usually not yet mounted: the
*profile default* answered instead — a directory that follows "the most recently opened folder". When the
repository moved, the trash can moved with it and the old deletions stayed behind in a directory nobody
looked at again. From the outside, those deletions had never happened.

## Decision

**This bundle has no data directory today, and this page is where that stays true or becomes a rule.**

1. **Nothing is persisted.** The search cache (ADR 0008) lives in memory and dies with the process; the fetch
   half reads pages and returns text. Nothing is created, read or written on disk, so there is no location to
   migrate and no path that could move.
2. **It cannot happen by accident.** None of the three runtime modules may import a Node built-in —
   `scripts/check.mjs` §2b fails by name if `index.js`, `bing.js` or `article.js` imports `node:fs`,
   `node:os`, `node:path` or anything else from `node:`. A bundle that cannot open a file cannot grow a data
   directory without a decision passing through that check.
3. **When something does need to persist**, it resolves exactly as the workspace rule says: a config field,
   else `DSH_SEARCH_DATA_DIR`, else `join(homedir(), '.agents', 'dsh-search')` — recomputed at each use, with
   any cwd-like argument accepted and deliberately ignored. That resolution belongs in one function, so a test
   can call it with a decoy workspace and assert the answer is unchanged. Supersede this ADR when it lands.
4. **Nothing to migrate.** There is no old location, because there was never a new one: the honest report for
   this change is "no data directory exists", not a copy step.

## Consequences

- The rule's cost for this bundle is one check rule and this page — no migration, no compatibility window.
- `node scripts/check.mjs` prints the effective answer on every run
  (`data directory: none — this bundle persists nothing`), so a person asking "where is my data?" gets an
  answer from the tool rather than from a document that might have aged.
- A future on-disk cache starts by superseding this ADR. That is the point: the decision is visible before
  the path exists, which is the opposite of the load-time binding that made the sibling plugin's directory
  move.
