-- Soft grounding checks of a finished report: citation coverage and percentages not found in the evidence.
ALTER TABLE "reports" ADD COLUMN "grounding_checks" JSONB;
