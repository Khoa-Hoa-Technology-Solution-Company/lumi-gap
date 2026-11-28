-- Add authoritative user-declared research keywords to projects so keywords remain independent from ResearchPlan.searchStrategy and researchAreas.
ALTER TABLE "projects"
ADD COLUMN IF NOT EXISTS "research_keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
