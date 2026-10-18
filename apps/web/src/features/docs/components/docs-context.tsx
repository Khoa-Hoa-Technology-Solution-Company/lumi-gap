import { createContext, useContext } from "react";
import type { DocsSectionId } from "../docs-section-ids";
import type { DocsLanguage, DocsUiStrings } from "../docs.types";

export interface DocsRenderContext {
  language: DocsLanguage;
  ui: DocsUiStrings;
  /** Section headings in the current language, for cross-links. */
  sectionHeadings: Partial<Record<DocsSectionId, string>>;
}

export const DocsContext = createContext<DocsRenderContext | null>(null);

export function useDocsContext(): DocsRenderContext {
  const context = useContext(DocsContext);
  if (!context) throw new Error("useDocsContext must be used inside DocsContext.Provider");
  return context;
}

export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(values[key] ?? ""));
}
