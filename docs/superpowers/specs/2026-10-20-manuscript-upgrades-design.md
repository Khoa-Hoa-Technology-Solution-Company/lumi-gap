# Manuscript workspace upgrades

Extend the existing authorized Yjs workspace and compiler registry.

- Persist engine/release preferences per manuscript with revision checks. Existing
  manuscripts inherit their latest compilation settings. Do not change source on
  a settings save or claim an unavailable compiler is installed.
- Snapshots retain private collaboration state separately from the source manifest.
  Restore into a new draft, preserving authors, comments/replies and suggestions,
  with a new file identity map and retained CRDT anchors. Never expose internal
  team comments to snapshot-only mentors or reviewers. Older snapshots remain
  source-only and must say so. Existing source and audit records remain intact.
- Visual blocks may open the existing structured table/equation editor. Unsupported
  TeX remains protected. Larger tracked scopes retain explicit acceptance and
  server-side revision/source validation with bounded payloads and rendering.
- External synchronization must preview a three-way comparison against a saved
  baseline, detect local/remote conflicts, and require explicit pull/push. Tokens
  stay in volatile browser memory and go only to fixed HTTPS provider origins.
  No user scripts, hooks, shell URLs or background publication.
- Reference-manager and file-provider connectors must fetch real data, preserve
  source provenance and require explicit import. Test transport with fixtures;
  report unverified live credentials and unsupported protocols accurately.
- Expand tested source templates and conservative data-file support without
  enabling arbitrary project build scripts or shell escape.

Use disposable PostgreSQL/compiler/browser fixtures. Preserve user manuscripts.
