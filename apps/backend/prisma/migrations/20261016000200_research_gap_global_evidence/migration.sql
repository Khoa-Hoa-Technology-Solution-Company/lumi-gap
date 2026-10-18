-- OpenAlex counts for a gap probe (null = not counted or OpenAlex unavailable).
ALTER TABLE "research_gaps" ADD COLUMN "global_evidence" JSONB;

-- Counter-evidence linked by experts used to be stored as kind 'evidence', mixed with the pipeline's evidence papers.
INSERT INTO "research_gap_papers" ("gap_id", "paper_id", "kind", "position")
SELECT DISTINCT r."gap_id", r."paper_id", 'counter', 0
FROM "gap_evidence_records" r
WHERE r."evidence_kind" = 'COUNTER'
ON CONFLICT DO NOTHING;
