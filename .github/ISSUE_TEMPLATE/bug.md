---
name: Bug
about: Something behaves differently from docs/architecture-en.md or the README
labels: bug
---

## What happens

<!-- The query, the provider error, and what the request layer did. -->

## What should happen

<!-- Point at the clause: an ADR, docs/architecture-en.md, or the README install section. -->

## How to reproduce

1.
2.
3.

## Evidence

<!-- The web_search result or the thrown error message, and the output of
     `node scripts/acceptance.mjs "<query>"` if the endpoint was involved. -->

## Environment

- Harness version:
- Profile:
- Whether the bundle was installed from this repository (link) or a copy:
- Which of the three failures it was: a challenge page, a page with no parseable result block, or a
  request that never reached `cn.bing.com`:

<!-- The three are different faults with different fixes, and the error message names which one. -->
