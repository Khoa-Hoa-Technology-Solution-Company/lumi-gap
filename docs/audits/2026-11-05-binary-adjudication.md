# Binary adjudication decisions

- The adjudicator form offers only INCLUDED and EXCLUDED, retaining frozen stage labels and the required written rationale (at least 10 characters).
- Source evidence and exclusion criteria remain required where the saved protocol requires them. Empty exclusion criteria no longer suggest choosing an information decision.
- Backend resolution rejects NEEDS_MORE_INFO and BACKGROUND for adjudication cases, independent workflows and ADJUDICATING rounds before writing a decision. Legacy information resolutions remain readable; original ballots and history are preserved.
- Updated old adjudication regression expectations to the binary policy, including deadline expiry, departed reviewers, mentor tasks, uncertain ballots and prevention of accidental full-text advancement.

## Verification

- Web: screening-adjudication and screening-case suites, 45/45 passed.
- Isolated PostgreSQL: 11 selected integration tests passed across screening-case.persistence, screening.persistence and screening-stages.persistence. One test assertion initially placed resolutionType inside finalDecision; corrected to its actual round-level location and reran successfully.
- Backend PostgreSQL runtime boundary audit: 4/4 passed.
- Backend and web production builds passed. Web retained existing chunk size and Browserslist warnings.
- Published the compiled backend service and web assets to local containers with backups. Served index matches the build, all eight entry resources return 200, /health, /ready and localhost:8080 return 200.
- No migration, application database rewrite, commit or push.

## Follow-up: exclusion with an empty saved criteria list

The case resolver previously rejected every exclusion when the saved criteria list was empty, even though the adjudicator form allowed a written rationale. It now accepts the required rationale as the decision basis in this case. It does not create a registered criterion or rewrite the saved protocol. If a criterion is supplied, it must belong to the frozen list. Modern protocols still require source evidence; exclusion still requires sufficient source material in the sealed packet.

The modern form shows the criterion selector only when the packet actually contains criteria. Its submit guard and payload use the same rule, so an empty list cannot leave an impossible mandatory selection.

Verification: 47 web tests and 6 selected PostgreSQL integration tests passed, including successful exclusion for old and modern packets without saved exclusion criteria, rejection of invented criteria, preservation of ballots, case completion and task removal. Backend production build and its 4 runtime boundary tests passed.
