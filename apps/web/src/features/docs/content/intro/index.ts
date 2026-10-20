import { DOCS_SECTIONS } from "../../docs-section-ids";
import type { DocsModule } from "../../docs.types";
import { introEn } from "./en";
import { introVi } from "./vi";

export const INTRO_SECTION_IDS = [
  DOCS_SECTIONS.introReading,
  DOCS_SECTIONS.introTransparency,
  DOCS_SECTIONS.introLabels,
] as const;

export type IntroSectionId = (typeof INTRO_SECTION_IDS)[number];

export const introDocsModule: DocsModule<IntroSectionId> = {
  id: "intro",
  sectionIds: INTRO_SECTION_IDS,
  content: { vi: introVi, en: introEn },
};
