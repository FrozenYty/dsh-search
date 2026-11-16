# 0013 — Installing is a patch; uninstalling is its absence

- **Status:** accepted, 2026-11-16
- **Related:** ADR 0007 (the row id), ADR 0011 (no data directory), ADR 0012 (the cap belongs to a preset this
  bundle deliberately does not touch)

## Context

The owner stated the property a plugin should have, as a design rule rather than a preference: **installing
it provides function; uninstalling it leaves no trace** — and it must not need its user to hand-edit the
profile to work.

That rule is easy to claim and easy to break. The usual residues are a data directory that outlives the
bundle, a settings key a person must remove by hand, a patch that flips someone else's `disabled` field (so
removal silently turns a different plugin back on), and a documented "installation step" that is really a
hand-written copy of an application-owned configuration that drifts at the next application update.

## Decision

1. **The whole footprint is this bundle's `cordis.patch.yml`**, and a patch file is read only while the
   bundle is installed. It carries exactly two entries: a `web` row override restating the seam's two pins,
   and an insert of this bundle's own `search` row. Removing the bundle stops the file being read, so the
   base bundle's pins return and the inserted row disappears — there is no restore step because there is
   nothing to restore.
2. **The bundle never writes into the profile's own files** and never needs to. A profile *may* override this
   bundle's row to choose `provider`, and that is the profile's business; the bundle works without it.
3. **The patch may not carry a `disabled:` key.** Not as a style rule but because of what it would mean: it
   would switch off a plugin this bundle does not own, and uninstalling would silently switch it back on. A
   config override and an insert of one's own row are additive; a `disabled` toggle is not reversible by
   absence. `scripts/check.mjs` fails by file and line if one appears.
4. **Nothing is written anywhere else.** No data directory (ADR 0011), no cache on disk, no settings file.
   `node scripts/check.mjs` prints that answer on every run.
5. **A preference is not a function.** Raising the tool's source cap needs an override of an application's
   agent-preset row, restating a configuration this repository does not own (ADR 0012). It is documented
   because a user may want it, and it is **not** part of installing this bundle: the bundle does not copy the
   preset, because a copied child list drifts at the next application update and can drop a `!!js` child,
   turning a preference into a broken session.

## Consequences

- "No trace on uninstall" is checkable rather than asserted: the patch's shape is the whole footprint, the
  `disabled` ban is a gate rule, and the data-directory line is printed by the gate on every run.
- A future feature that wants to persist something must supersede ADR 0011, and one that wants to change
  another plugin's state must supersede this page — the two decisions a plugin is most likely to break by
  accident now have to break a document first.
- The cost is visible: two entries in one file. Anyone can read the footprint in less than a minute.
