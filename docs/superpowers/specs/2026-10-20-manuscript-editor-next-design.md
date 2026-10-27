# Compiler profiles, inline review and structured writing

Build on existing ManuscriptCompilation, source proposals, Yjs anchors, visual
blocks and project authorization. No new framework or upstream source copying.

- Add optional TeX Live 2025 compiler endpoint alongside 2022. Selection uses a
  fixed server registry, never a user URL. Persist the selected release on each
  compilation; deduplicate per snapshot/engine/release. Old records remain 2022.
  Retain isolation, sandbox, time and output bounds. Report installed toolchain.
- Pending proposals expose only authorized Yjs anchors and render as CodeMirror
  source decorations with an inline before/after review widget. Exact revision
  checks and original-source validation remain authoritative on the server.
- Add bounded structured table and equation editors. Conservatively recognize
  simple supported structures; complex TeX stays source. Escape plain table cells,
  validate math with the existing KaTeX library and preserve surrounding source.
  Preview then explicitly apply through existing collaborative source operations.
- Test multiple independent clients over actual collaboration sockets, stale
  source/review races and a larger multi-file paper in the actual compiler.
  Report local measured bounds, not production-scale guarantees.
- Keep existing user work and settings. Use disposable fixtures for browser tests.
