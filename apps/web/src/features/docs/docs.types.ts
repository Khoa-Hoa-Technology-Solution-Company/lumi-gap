import type { UiLanguageCode } from "@/i18n";
import type { DocsSectionId } from "./docs-section-ids";
import type { DocsSourceId, DocsSourceKind, DocsSourceRole } from "./docs-sources";

/**
 * Data model of the documentation page. Content is plain data so a new feature
 * documents itself by adding content files and one registry entry
 * (see docs-registry.ts). Field names avoid `title` / `label` / `description`
 * because the i18n source scanner treats those literals as UI dictionary keys.
 */

/** Languages that ship their own content. Every other UI language reads English. */
export type DocsLanguage = "vi" | "en";

/**
 * Inline text with a small markup subset (parsed by utils/docs-rich-text.ts):
 * `**bold**`, `*italic*`, `` `code` ``, `[text](/docs/id#anchor)` links and
 * `[@source-id]` citations that link to the bibliography.
 */
export type RichText = string;

/**
 * Status of a statement:
 * - standard: a published standard or method used as published.
 * - convention: a choice made by this project (thresholds, presentation).
 * - derived: follows mathematically from the method.
 * - limitation: what the method cannot tell.
 * - note: neutral remark.
 */
export type DocsCalloutTone = "standard" | "convention" | "derived" | "limitation" | "note";

export interface DocsSymbol {
  symbol: string;
  meaning: RichText;
}

export interface DocsGlossaryEntry {
  /** Anchor id, unique inside the glossary. */
  id: string;
  term: string;
  /** Other names, e.g. the English term on the Vietnamese page. */
  aka?: string;
  definition: RichText;
  example?: RichText;
  /** Sections that use the term. */
  see?: DocsSectionId[];
}

export interface DocsBibliographyGroup {
  role: DocsSourceRole;
  heading: string;
  intro?: RichText;
}

export type DocsBlock =
  | { kind: "paragraph"; text: RichText }
  | { kind: "heading"; id: string; text: string }
  | { kind: "formula"; lines: string[]; caption?: string; legendHeading?: string; legend?: DocsSymbol[] }
  | { kind: "table"; caption?: string; columns: string[]; rows: RichText[][] }
  | { kind: "callout"; tone: DocsCalloutTone; heading?: string; text?: RichText; items?: RichText[] }
  | { kind: "list"; ordered?: boolean; items: RichText[] }
  | { kind: "example"; heading: string; blocks: DocsBlock[] }
  | { kind: "sources"; ids: DocsSourceId[]; text?: RichText }
  | { kind: "glossary"; entries: DocsGlossaryEntry[] }
  | { kind: "bibliography"; groups: DocsBibliographyGroup[] };

export interface DocsSectionContent {
  heading: string;
  summary?: RichText;
  body: DocsBlock[];
}

/** One language of a module: its group name in the sidebar and every section. */
export interface DocsModuleContent<Id extends DocsSectionId = DocsSectionId> {
  groupHeading: string;
  sections: Record<Id, DocsSectionContent>;
}

/**
 * A documented feature. `sectionIds` fixes the order; each language must
 * provide every section (enforced by the type and by the registry test).
 */
export interface DocsModule<Id extends DocsSectionId = DocsSectionId> {
  id: string;
  sectionIds: readonly Id[];
  content: { vi: DocsModuleContent<Id>; en: DocsModuleContent<Id> } & Partial<Record<UiLanguageCode, DocsModuleContent<Id>>>;
}

/** A section after language resolution, flattened in reading order. */
export interface ResolvedDocsSection extends DocsSectionContent {
  id: DocsSectionId;
  moduleId: string;
  groupHeading: string;
}

export interface ResolvedDocsGroup {
  moduleId: string;
  groupHeading: string;
  sections: ResolvedDocsSection[];
}

/** Interface strings of the docs page itself, one object per language. */
export interface DocsUiStrings {
  pageHeading: string;
  pageIntro: string;
  tocHeading: string;
  tocSelect: string;
  inThisSection: string;
  previous: string;
  next: string;
  copyLink: string;
  linkCopied: string;
  copyFailed: string;
  sourcesHeading: string;
  whereHeading: string;
  exampleBadge: string;
  glossarySearch: string;
  glossaryCount: string;
  glossaryEmpty: string;
  glossaryExample: string;
  glossarySee: string;
  sectionNotFound: string;
  backToStart: string;
  reliability: string;
  roleInMethod: string;
  verifiedVia: string;
  unverified: string;
  tones: Record<DocsCalloutTone, string>;
  sourceKinds: Record<DocsSourceKind, string>;
}
