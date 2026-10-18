/**
 * Stable ids of the documentation sections. Other features link to them with
 * `docsPath(DOCS_SECTIONS.trendVerdict)`, so never rename an id: add a new one
 * instead. This file has no dependencies, so importing it does not pull the
 * documentation content into another page's bundle.
 */
export const DOCS_SECTIONS = {
  // Giới thiệu / Introduction
  introReading: "how-to-read",
  introTransparency: "transparency",
  introLabels: "labels",

  // Xu hướng nghiên cứu / Research trends
  trendDefinition: "trend-definition",
  trendData: "trend-data-scope",
  trendShare: "trend-share",
  trendMannKendall: "trend-mann-kendall",
  trendSenSlope: "trend-sen-slope",
  trendRelativeChange: "trend-relative-change",
  trendMultipleTesting: "trend-benjamini-hochberg",
  trendVerdict: "trend-verdict",
  trendSupplementary: "trend-supplementary",
  trendLimitations: "trend-limitations",
  trendWorkedExample: "trend-worked-example",

  // Thuật ngữ / Glossary
  glossary: "glossary",

  // Tài liệu tham khảo / References
  references: "references",
} as const;

export type DocsSectionKey = keyof typeof DOCS_SECTIONS;
export type DocsSectionId = (typeof DOCS_SECTIONS)[DocsSectionKey];

export const DOCS_BASE_PATH = "/docs";

/** `/docs/<id>` or `/docs/<id>#<anchor>`. */
export function docsPath(sectionId: DocsSectionId, anchor?: string): string {
  return `${DOCS_BASE_PATH}/${sectionId}${anchor ? `#${anchor}` : ""}`;
}

/** Anchor of a bibliography entry on the references section. */
export function docsSourceAnchor(sourceId: string): string {
  return `src-${sourceId}`;
}
