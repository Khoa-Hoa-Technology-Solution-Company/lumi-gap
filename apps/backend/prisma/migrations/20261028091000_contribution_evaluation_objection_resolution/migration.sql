-- Preserve objections across evaluation revisions. Published decisions remain append-only.
ALTER TABLE contribution_evaluation_decisions
  DROP CONSTRAINT contribution_evaluation_decisions_kind_check,
  ADD CONSTRAINT contribution_evaluation_decisions_kind_check
    CHECK (kind IN ('PARTICIPANT','WEIGHT','CHALLENGE','RESOLUTION')),
  ADD CONSTRAINT contribution_evaluation_resolution_check
    CHECK (kind <> 'RESOLUTION' OR (decision = 'APPROVE' AND length(trim(note)) >= 10));
