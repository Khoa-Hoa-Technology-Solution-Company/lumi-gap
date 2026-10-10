-- Probe counts always cover the whole corpus; record how many papers that was and, for project gaps,
-- how the same probe scores inside the project's INCLUDED papers.
ALTER TABLE "research_gaps" ADD COLUMN "evidence_scope_size" INTEGER;
ALTER TABLE "research_gaps" ADD COLUMN "project_evidence" JSONB;
