# Manuscript review and visual writing

Extend the existing Manuscripts/Yjs/BullMQ workspace. Do not run an Overleaf
service alongside it or change the PostgreSQL authorization model.

- Suggested edits are durable records, distinct from source updates and comments.
  Capture exact server sequence and original range, derive Yjs anchors on the
  server, and apply only after explicit acceptance. Retain author and resolver.
- Project writers may propose, accept and reject. Snapshot reviewers and mentors
  retain their existing scoped feedback permissions; proposals grant no access.
- Acceptance rechecks membership and the current anchor inside the existing
  project transaction lock. A stale or removed source is a conflict; concurrent
  acceptance applies at most once. Rejection never alters the source.
- Visual mode edits only recognized headings and prose blocks. Source offsets
  and relative anchors preserve all other source bytes. Unsupported commands,
  environments, citations and equations remain protected source/tokens. The
  editor must not pretend to render arbitrary TeX like the compiler.
- Visual changes use the existing editor/Yjs update and undo path. Keep the
  source editor mounted. Preserve a local visual draft until save/cancel and
  protect file/route navigation with the existing unsaved-work confirmation.
- The template gallery previews built-in, tested templates. Selecting a template
  creates a new manuscript through the existing backend, never replacing a draft.
- Do not present external Git or reference-manager integrations as working until
  their authenticated end-to-end operations exist and are verified.
