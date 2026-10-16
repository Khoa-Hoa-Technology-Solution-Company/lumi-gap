import { DOCS_SECTIONS } from "../../docs-section-ids";
import type { DocsModule } from "../../docs.types";
import { referencesEn } from "./en";
import { referencesVi } from "./vi";

export const REFERENCES_SECTION_IDS = [DOCS_SECTIONS.references] as const;

export type ReferencesSectionId = (typeof REFERENCES_SECTION_IDS)[number];

export const referencesDocsModule: DocsModule<ReferencesSectionId> = {
  id: "references",
  sectionIds: REFERENCES_SECTION_IDS,
  content: { vi: referencesVi, en: referencesEn },
};
