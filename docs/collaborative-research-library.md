# Collaborative research library

The library is the default Papers view. Existing imports, DOI deduplication,
provenance, private attachments and organization remain available.

New projects without a configured protocol use COLLABORATIVE review. A member may
submit and revise their own assessment until selection is finalized. Every edit
appends a review revision; other members' work is never replaced. Disagreement
requires discussion and an explicit decision, never a vote-count decision.

Existing SIMPLE/INDEPENDENT rounds retain their immutable protocol. Changing
configuration affects future rounds only. Blindness is enforced by the backend.

The owner or assigned active member finalizes selection with a reason and an
expected round version. Collaborative selection may be deferred/reopened by its
finalizer, retaining the previous final decision and reviews in history.

An analysis set is an immutable ANALYSIS_SET workspace revision. DRAFT permits
any active project sources. OFFICIAL requires current explicit INCLUDED finals
and owner confirmation. It captures source fingerprints, metadata, settings,
decision/review IDs and evidence revisions. Creating a set does not change any
selection. Existing gap discovery consumes the exact set and records its mode,
snapshot and configuration. Source changes during a run fail rather than silently
substituting evidence. Existing historical runs stay intact.

Relationships reuse stored references and source-supplied related works. Similarity
is labeled separately from citations. Missing corpus metadata is shown as missing,
never generated. Extraction and literature matrix reuse the existing evidence UI.

External advisors without project membership do not receive finalization rights.
An explicit scoped advisor-finalizer capability is outside this release.

## Integration and boundaries

- `POST research/screening-v2/papers/:paperId/assessment`: own revision and current
  round required; exclusion reason mandatory. Member identity comes from auth.
- `POST rounds/:roundId/defer`: collaborative finalizer only, reason and optimistic
  version; official decision remains in immutable history.
- `POST/GET analysis-sets`, `GET analysis-sets/:setId`: immutable sets; official
  confirmation requires owner. Delegated members still finalize individual papers.
- `POST /gaps/analyze` accepts `analysisSetId` only in project discovery mode. Exact
  source IDs and topic must match; no year filter can silently shrink the set.
- The existing worker records the set ID/hash/mode, source index content hashes,
  evidence quotations, model and prompt version. New discovery without a confirmed
  set is labeled DRAFT. Existing historical records are unchanged.
- Relationship discovery supports stored References and source-supplied Related
  Works with independent failure states. Cited By, topic/method/dataset relations,
  external expansion and graph visualization are not implemented here.
- The existing evidence matrix supports manual extraction of selected sources.
  Draft AI extraction stays AI_SUGGESTED and must be checked by humans. Private PDF
  content is not indexed by the global gap worker; unavailable sources fail clearly.
- Decisions are scoped to a project review round. Analysis sets are explicit subsets
  of selected sources, with independent source/configuration snapshots.
