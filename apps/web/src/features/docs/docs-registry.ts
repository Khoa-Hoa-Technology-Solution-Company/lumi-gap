import type { UiLanguageCode } from "@/i18n";
import { glossaryDocsModule } from "./content/glossary";
import { introDocsModule } from "./content/intro";
import { referencesDocsModule } from "./content/references";
import { trendDocsModule } from "./content/trends";
import { docsUiEn } from "./content/ui/en";
import { docsUiVi } from "./content/ui/vi";
import type { DocsSectionId } from "./docs-section-ids";
import type {
  DocsLanguage,
  DocsModule,
  DocsModuleContent,
  DocsUiStrings,
  ResolvedDocsGroup,
  ResolvedDocsSection,
} from "./docs.types";

/**
 * Every documented feature, in sidebar order. To document a new feature:
 *   1. add its section ids to docs-section-ids.ts,
 *   2. add content/<feature>/{index,vi,en}.ts (copy content/references as a template),
 *   3. register the module here (before "glossary" and "references").
 */
export const DOCS_MODULES: readonly DocsModule[] = [
  introDocsModule,
  trendDocsModule,
  glossaryDocsModule,
  referencesDocsModule,
] as unknown as readonly DocsModule[];

const UI_STRINGS: Record<DocsLanguage, DocsUiStrings> = { vi: docsUiVi, en: docsUiEn };

/** Vietnamese is the primary language; every other UI language reads English. */
export function resolveDocsLanguage(language: UiLanguageCode | string): DocsLanguage {
  return language === "vi" ? "vi" : "en";
}

export function getDocsUi(language: UiLanguageCode | string): DocsUiStrings {
  return UI_STRINGS[resolveDocsLanguage(language)];
}

function moduleContent(module: DocsModule, language: UiLanguageCode | string): DocsModuleContent {
  const own = (module.content as Partial<Record<string, DocsModuleContent>>)[language];
  return own ?? module.content[resolveDocsLanguage(language)];
}

/** Groups and sections in reading order for one UI language. */
export function getDocsGroups(language: UiLanguageCode | string): ResolvedDocsGroup[] {
  return DOCS_MODULES.map((module) => {
    const content = moduleContent(module, language);
    return {
      moduleId: module.id,
      groupHeading: content.groupHeading,
      sections: module.sectionIds.map((id): ResolvedDocsSection => ({
        id,
        moduleId: module.id,
        groupHeading: content.groupHeading,
        ...content.sections[id],
      })),
    };
  });
}

export function getDocsSections(language: UiLanguageCode | string): ResolvedDocsSection[] {
  return getDocsGroups(language).flatMap((group) => group.sections);
}

export function isDocsSectionId(value: string | undefined): value is DocsSectionId {
  return value !== undefined && DOCS_MODULES.some((module) => module.sectionIds.includes(value as DocsSectionId));
}

export const DEFAULT_DOCS_SECTION: DocsSectionId = DOCS_MODULES[0]!.sectionIds[0]!;
