# 0012 — The cap lives in the agent preset

- **Status:** accepted, 2026-11-16
- **Supersedes:** nothing. This page explains a composition this repository had documented wrongly; the
  decision it records is where the correct explanation now lives, and no earlier decision is withdrawn.
- **Related:** ADR 0004 (whose addendum first called the two numbers "on the `tool-web` row, where a profile
  can raise them"), ADR 0008 (the reuse window), ADR 0011 (this bundle's own rows), the profile's own
  `cordis.patch.yml`

## Context

Both READMEs told the reader that a profile can raise `searchMaxResults` by overriding the base bundle's
`tool-web` row, and the 2026-11-13 entry in `PROGRESS.md` already recorded the symptom: with
`searchMaxResults: 24` in the profile's patch, the loader's own `composeEntries` resolved the row to 24 and
the tool still measured 8 — once for a single query and once for four. What was missing was the reason, and
it makes the passage wrong rather than incomplete: the row a profile writes is not the row a session runs.

Measured from the installed 0.2.2-rc.1 build:

- **The layer order.** Bundle patches in `dsh.profile.bundles` order, then the profile's own
  `cordis.patch.yml`, then `$DSH_HOME/cordis.patch.yml`, then `--patch` overlays
  (`app.asar/dsh/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js:1908-1917`).
- **A non-insert patch replaces the keys it names and merges nothing.** `config` is one of those keys, so it
  is replaced wholesale; the row it targets is looked up by id in a map built from **tree rows only** —
  `applyPatches` descends into an entry that carries `group: true` and whose `config` is an array, and
  nowhere else (`…/dsh-app-boot/lib/index.js:505-555`). A wrong `name` makes the patch skip with a warning
  instead of applying.
- **The host row that would carry the tool is disabled by the web app**
  (`…/dsh-web-app/cordis.patch.yml:583-584`; the row itself is inserted by
  `…/dsh-base/cordis.patch.yml:486-490` with `fetch` and `searchTimeoutMs` only).
- **The `web_search` a session runs is a child of that session's agent preset.** `preset-standard` declares
  it as `tool-web` with `config: { fetch: true, searchTimeoutMs: 60000 }` and no cap
  (`…/dsh-web-app/presets/standard.patch.yml:118-122`), so the plugin's schema default applies:
  `searchMaxResults: z.number().default(8)` (`…/dsh-tool-web/lib/index.js:877-885`). The same child is
  declared by `preset-ptc` (`presets/ptc.patch.yml:120-124`) and `preset-cordis`
  (`presets/cordis.patch.yml:117-121`). `preset-minimal` declares no `tool-web` at all, so it has no cap to
  raise. All four presets are listed in `…/dsh-web-app/package.json` under `dsh.bundle.patch`.
- **A preset child is not a loader row.** Those children live in the preset declaration's `config.plugins`,
  which is neither a tree row nor a `group` whose `config` is an array, so the lookup map never contains
  them. A profile entry `- id: tool-web` finds the disabled host row, composes cleanly to 24, and changes
  nothing about the tool a session calls: the patch cannot see the child, and the child cannot see the
  patch.

## Decision

**The addressable row is the agent preset declaration, and raising the cap means overriding it with its
complete `config`.**

- The rows are `preset-standard` (`config.id: standard`, `order: 1`), `preset-ptc` (`ptc`, `order: 2`) and
  `preset-cordis` (`cordis`, `order: 4`). `preset-minimal` (`minimal`, `order: 3`) declares no `tool-web`,
  so there is nothing to raise there.
- The override restates `id`, `order` and the whole `plugins:` list, because `config` is replaced wholesale
  and the preset is registered from that config as a whole — `AgentPreset.Config` requires `id` and
  `plugins`, and a config naming one child drops every child it leaves out. The **`name` key is omitted**:
  it is not part of `config`, and a restated `name` that does not match the row makes the patch skip with a
  warning.
- The list to copy is the shipped one, verbatim, `!!js` expressions included — a copy that drops an entry
  removes that tool from the preset, and a copy that evaluates a platform expression itself decides the
  platform.
- The edit applies to **the next Agent created**, not to a session already running: a preset is expanded
  when an Agent is created, so a live Agent keeps the composition it started with.
- The two numbers are still the tool's own fields (`searchMaxQueries`, default 4, and `searchMaxResults`,
  default 8); this page says where they are set, not whether to change them.

The shape, with the shipped list abbreviated for reading and nothing else abbreviated:

```yaml
# The shipped row's complete config, copied from the app's
# presets/standard.patch.yml, with one child changed. Not a snippet to paste in
# half: plugins: must carry every entry, so the ellipsis below is prose, not YAML.
- id: preset-standard
  config:
    id: standard
    order: 1
    plugins:
      # … every child of the shipped list, then the one change: …
      - id: tool-web
        name: '@deepseek-ai/dsh-tool-web'
        config:
          fetch: true
          searchTimeoutMs: 60000
          searchMaxResults: 24
      # … and the rest of the list …
```

A profile that uses another preset writes the same override against that preset's row, with that row's list.

## Consequences

- The applied cap is the preset child's, so the snippet now in both READMEs is one a reader can trust: the
  row it overrides is the row the session expands.
- **The tell stays the same.** The tool appends `(Showing the first N sources…)` only when the seam
  truncated, so that line disappearing is the change taking effect — on the next Agent, not in the current
  session.
- **A saved patch file still reloads without a restart**: the enabled `hmr` row
  (`…/dsh-base/cordis.patch.yml:27-32`) watches the profile's patch files and recomposes. The stale claim it
  replaces — `dsh.profile.patchReload` — is not read by this build at all: the string occurs nowhere in the
  application. What no reload can reach is an Agent that was already created.
- **Nothing here is the bundle's own footprint.** This ADR adds no row, no field and no code; it records
  where the tool the bundle serves gets its caps, and the price of changing one is that the profile owner
  keeps a copy of a shipped list, which is the seam's rule rather than this bundle's choice.
- **This bundle's own row is unaffected.** `provider` on the `search` row and the `web` row's
  `searchProvider`/`fetchProvider` pins are tree rows and are patched exactly as their READMEs say; the
  distinction is that a session's tool is not a tree row.

## Revisit when

The web app stops declaring a `tool-web` child in its presets, stops disabling the host row, or the Loader
starts addressing a preset's `config.plugins` entries by id — any of which would make the row a profile
writes addressable again.
