// Public API of the documentation feature. Other features link to sections with
// `docsPath(DOCS_SECTIONS.trendVerdict)`; docs-section-ids.ts has no
// dependencies, so importing these constants does not pull in the content.
export { DOCS_BASE_PATH, DOCS_SECTIONS, docsPath, docsSourceAnchor } from "./docs-section-ids";
export type { DocsSectionId, DocsSectionKey } from "./docs-section-ids";
export { DOCS_SOURCES, formatDocsCitation } from "./docs-sources";
export type { DocsSource, DocsSourceId } from "./docs-sources";
export { DOCS_MODULES, getDocsGroups, getDocsSections, resolveDocsLanguage } from "./docs-registry";
export { TREND_DOC_CONSTANTS } from "./content/trends/trend-doc-constants";
export { DocsPage } from "./components/docs-page";
