# Tracked editing and project history

Implement independently using LumiGap's existing source proposals, permissions,
Yjs anchors and project transaction lock. No proprietary Overleaf code is used.

- A tracked editing session edits a selected range (or a small whole file) in a
  separate CodeMirror buffer. The shared source stays unchanged until acceptance.
- Save proposals automatically after idle and on explicit Save. Serialize saves;
  preserve failed drafts and use compare-and-swap revisions for author updates.
- Only the original author can update a pending proposal. Recheck membership,
  archival state and anchored source on every save. Accept/reject must use the
  exact proposal revision reviewed; retries are idempotent.
- Existing proposals start at revision 1. Add the column with a handwritten,
  additive migration. Do not alter existing source, snapshots or comments.
- Limit one editing scope to 8,000 characters, matching existing proposals. Large
  files require a selection. State that bound explicitly; do not truncate input.
- Preserve the ordinary source editor/Yjs provider and protect unfinished tracked
  drafts during file/route changes. Pending proposals survive reload on the server.
- Extend history to compare entire immutable manifests: added/deleted files,
  renames by stable file ID, binary checksums and bounded text diff per file.
- Use current UI components and semantic colors. Verify persistence, concurrent
  saves/resolution, revoked access, autosave failure/retry and real browser flows.
