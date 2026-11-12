# Screening status color convention

Date: 2026-11-04

## Semantic rules

| Meaning | Tone | Examples |
| --- | --- | --- |
| Waiting or reference information | Neutral gray | Not reviewed, waiting for peer/full text/finalization, background material, invalidated round |
| Active review | Blue | In review, holding a review slot |
| Needs clarification or information | Amber | Unsure, clarification, additional information, conflict-of-interest review, expired/urgent claim |
| Disagreement requiring resolution | Orange | Conflicting ballots, incompatible exclusion criteria, consensus response |
| Adjudication workflow | Violet | Collecting statements, waiting for assignment, assigned, in progress |
| Positive assessment or outcome | Green | Personal Include, passed stage, accepted for analysis |
| Negative assessment or outcome | Rose red | Personal Exclude, excluded paper |

Keep personal assessments separate from group outcomes. A green personal ballot does not imply group acceptance. Completed adjudication alone does not imply acceptance: the recorded decision determines green/red. Earlier-stage acceptance retains its existing stage-specific label. Expiration is amber, never paper rejection.

Use labels and existing icons alongside color. Do not color a state differently because the viewer can act, because it appears in another view, or because its translated label changes.

## Implementation

- `apps/web/src/features/projects/screening-status.ts` maps persisted state codes, classifications and case states to semantic tones. No substring matching against Vietnamese labels.
- `screening-status.css` is the only badge palette, with opaque OKLCH foreground/background/border tokens for light and dark themes.
- `components/screening-status-badge.tsx` is the shared badge. Used by My Work, round details, proposals, library assessments and adjudication panels.
- `my-work-model.ts` enriches UI projections with existing discussion classification and case status. The fallback for uncertainty uses only already-public ballots. No new API, database migration or permission change.
- Removed competing badge palettes from `screening.css`, `screening-paper-card.css` and `collaborative-library.css`. Card callouts, action reminders and final-outcome panels use the same variables.
- Removed colored card side stripes. Review progress segments remain blue to represent submitted votes, independently of disagreement or final outcome.
- A read-only viewer sees the same status colors. Invalidated rounds remain neutral; unconfirmed legacy data gets an amber warning.

For future states, update the mapping and semantic palette here, not a local component color rule. Distinguish domain state from task lifecycle: a completed review task does not mean that the paper is accepted.

## Verification

- 143/143 tests passed in 8 suites: semantic mappings (26), paper cards (20), My Work model (7), case UI (18), adjudication (26), library (9), team tasks (10), conflict resolution (27).
- Regression coverage includes clarification versus binary disagreement, identical actionable/history colors, read-only rendering, undisclosed ballots, completed adjudication outcome precedence and invalidated/legacy outcomes.
- `pnpm exec tsc -b`: exit 0.
- `pnpm build`: exit 0, including bundle budget checks.
- Browser fixture used actual production components: 9 state scenarios, 4 badge positions per scenario. Computed foreground, background and border colors matched in every scenario in both themes.
- Calculated text/background contrast across all 14 light/dark tone pairs: minimum 7.01:1.
- 390 px viewport: no document overflow and no clipped badges.
- Screenshots: `2026-11-04-screening-status-light.png`, `2026-11-04-screening-status-dark.png`, `2026-11-04-screening-status-mobile.png`, `2026-11-04-screening-status-comparison.png`.
- Updated the running web container, retaining old hashed assets and backing up the previous index. Served index matched the final build; all 8 referenced entry assets returned 200. Publication receipt: `apps/web/scratch/status-colors-deployment-1793761716092/verification.json`.
- Live project navigation was checked, but the browser session was signed out and could not display private project content. Visual comparison used fixtures; no application data was created or changed.
- Unused Docker workers were temporarily stopped under the user's existing authorization, retaining PostgreSQL, Redis, backend, web and notification maintenance. No commit or push.
