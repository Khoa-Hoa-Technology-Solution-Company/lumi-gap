import { DOCS_SECTIONS } from "../../docs-section-ids";
import type { DocsModule } from "../../docs.types";
import { trendsEn } from "./en";
import { trendsVi } from "./vi";

export const TREND_SECTION_IDS = [
  DOCS_SECTIONS.trendDefinition,
  DOCS_SECTIONS.trendData,
  DOCS_SECTIONS.trendShare,
  DOCS_SECTIONS.trendMannKendall,
  DOCS_SECTIONS.trendSenSlope,
  DOCS_SECTIONS.trendRelativeChange,
  DOCS_SECTIONS.trendMultipleTesting,
  DOCS_SECTIONS.trendVerdict,
  DOCS_SECTIONS.trendSupplementary,
  DOCS_SECTIONS.trendLimitations,
  DOCS_SECTIONS.trendWorkedExample,
] as const;

export type TrendSectionId = (typeof TREND_SECTION_IDS)[number];

export const trendDocsModule: DocsModule<TrendSectionId> = {
  id: "trends",
  sectionIds: TREND_SECTION_IDS,
  content: { vi: trendsVi, en: trendsEn },
};
