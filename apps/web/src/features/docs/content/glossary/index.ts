import { DOCS_SECTIONS } from "../../docs-section-ids";
import type { DocsModule } from "../../docs.types";
import { glossaryEn } from "./en";
import { glossaryVi } from "./vi";

export const GLOSSARY_SECTION_IDS = [DOCS_SECTIONS.glossary] as const;

export type GlossarySectionId = (typeof GLOSSARY_SECTION_IDS)[number];

export const glossaryDocsModule: DocsModule<GlossarySectionId> = {
  id: "glossary",
  sectionIds: GLOSSARY_SECTION_IDS,
  content: { vi: glossaryVi, en: glossaryEn },
};
