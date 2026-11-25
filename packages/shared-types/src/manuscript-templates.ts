/** Stable persisted identifiers. TECHNICAL_REPORT is retained for older drafts. */
export const MANUSCRIPT_TYPES = ["RESEARCH_PAPER", "RESEARCH_PROPOSAL", "TECHNICAL_REPORT", "THESIS", "PRESENTATION", "OTHER"] as const;
export type ManuscriptType = typeof MANUSCRIPT_TYPES[number];
export const MANUSCRIPT_TEMPLATES = ["ARTICLE", "PROPOSAL", "REPORT", "IEEE_CONFERENCE", "PRESENTATION", "THESIS", "ELSEVIER", "SPRINGER", "APS", "BLANK"] as const;
export type ManuscriptTemplate = typeof MANUSCRIPT_TEMPLATES[number];

export interface ManuscriptTemplateDefinition {
  id: ManuscriptTemplate;
  name: string;
  description: string;
  documentType: ManuscriptType;
  compatibleTypes: readonly ManuscriptType[];
  category: "GENERAL" | "PUBLISHER";
  recommended: boolean;
  sourceType: "LUMIGAP_STARTER";
  /** Documentation of the installed class, not an assertion of publisher approval. */
  sourceUrl: string;
  templateVersion: string;
  dependencyLicense: string;
  documentClass: string;
  mainTexFile: "main.tex";
  requiredPackages: readonly string[];
  preferredCompiler: "pdflatex" | "xelatex" | "lualatex";
  previewAsset: string;
  compatibilityStatus: "SUPPORTED" | "UNAVAILABLE";
  keywords: readonly string[];
}
const common = { sourceType: "LUMIGAP_STARTER", templateVersion: "2.0.0", mainTexFile: "main.tex", preferredCompiler: "pdflatex", compatibilityStatus: "SUPPORTED" } as const;
const definition = (input: Omit<ManuscriptTemplateDefinition, keyof typeof common | "previewAsset"> & Partial<Pick<ManuscriptTemplateDefinition, "preferredCompiler">>): ManuscriptTemplateDefinition => ({ ...common, ...input, previewAsset: `/manuscript-templates/v2/${input.id.toLowerCase()}.webp` });
export const MANUSCRIPT_TEMPLATE_REGISTRY: Readonly<Record<ManuscriptTemplate, ManuscriptTemplateDefinition>> = {
  ARTICLE: definition({ id: "ARTICLE", name: "Basic research paper", description: "An academic article with abstract, introduction, related work, methods, results and conclusion.", documentType: "RESEARCH_PAPER", compatibleTypes: ["RESEARCH_PAPER"], category: "GENERAL", recommended: true, sourceUrl: "https://www.latex-project.org/help/documentation/", dependencyLicense: "LPPL-1.3c (LaTeX base)", documentClass: "article", requiredPackages: ["iftex", "lmodern", "fontenc", "graphicx", "hyperref"], keywords: ["article", "basic", "research"] }),
  PROPOSAL: definition({ id: "PROPOSAL", name: "Research proposal template", description: "Research problem, questions, methodology and research plan.", documentType: "RESEARCH_PROPOSAL", compatibleTypes: ["RESEARCH_PROPOSAL"], category: "GENERAL", recommended: true, sourceUrl: "https://www.latex-project.org/help/documentation/", dependencyLicense: "LPPL-1.3c (LaTeX base)", documentClass: "article", requiredPackages: ["iftex", "lmodern", "fontenc", "graphicx", "hyperref"], keywords: ["proposal", "plan", "questions"] }),
  REPORT: definition({ id: "REPORT", name: "Research report template", description: "A chapter-based research report with methods, results and conclusion.", documentType: "TECHNICAL_REPORT", compatibleTypes: ["TECHNICAL_REPORT"], category: "GENERAL", recommended: true, sourceUrl: "https://www.latex-project.org/help/documentation/", dependencyLicense: "LPPL-1.3c (LaTeX base)", documentClass: "report", requiredPackages: ["iftex", "lmodern", "fontenc", "graphicx", "hyperref"], keywords: ["report", "technical", "chapters"] }),
  IEEE_CONFERENCE: definition({ id: "IEEE_CONFERENCE", name: "IEEE Conference", description: "A two-column conference starter using IEEEtran and BibTeX references.", documentType: "RESEARCH_PAPER", compatibleTypes: ["RESEARCH_PAPER"], category: "PUBLISHER", recommended: false, sourceUrl: "https://ctan.org/pkg/ieeetran", dependencyLicense: "LPPL-1.3", documentClass: "IEEEtran", requiredPackages: ["iftex", "lmodern", "fontenc", "cite", "amsmath", "amssymb", "graphicx", "booktabs", "IEEEtran.bst"], keywords: ["IEEE", "conference", "two columns"] }),
  PRESENTATION: definition({ id: "PRESENTATION", preferredCompiler: "xelatex", name: "Beamer presentation", description: "Research slides with a title page, questions and methods.", documentType: "PRESENTATION", compatibleTypes: ["PRESENTATION"], category: "GENERAL", recommended: true, sourceUrl: "https://ctan.org/pkg/beamer", dependencyLicense: "GPL-2.0-or-later / LPPL-1.3c / GFDL (Beamer distribution)", documentClass: "beamer", requiredPackages: ["iftex", "lmodern", "fontenc", "graphicx", "pgf"], keywords: ["slides", "presentation", "beamer"] }),
  THESIS: definition({ id: "THESIS", preferredCompiler: "xelatex", name: "Thesis template", description: "Memoir thesis with chapters, contents and a separate bibliography.", documentType: "THESIS", compatibleTypes: ["THESIS"], category: "GENERAL", recommended: true, sourceUrl: "https://ctan.org/pkg/memoir", dependencyLicense: "LPPL-1.3c", documentClass: "memoir", requiredPackages: ["iftex", "lmodern", "fontenc", "graphicx", "amsmath", "booktabs"], keywords: ["thesis", "dissertation", "memoir"] }),
  ELSEVIER: definition({ id: "ELSEVIER", name: "Elsevier Article", description: "An elsarticle preprint with front matter, abstract, keywords and references.", documentType: "RESEARCH_PAPER", compatibleTypes: ["RESEARCH_PAPER"], category: "PUBLISHER", recommended: false, sourceUrl: "https://ctan.org/pkg/elsarticle", dependencyLicense: "LPPL-1.3-or-later", documentClass: "elsarticle", requiredPackages: ["iftex", "lmodern", "fontenc", "graphicx", "amsmath", "booktabs", "elsarticle-num.bst"], keywords: ["Elsevier", "journal", "preprint"] }),
  SPRINGER: definition({ id: "SPRINGER", name: "Springer LNCS", description: "A proceedings starter using the Lecture Notes in Computer Science class.", documentType: "RESEARCH_PAPER", compatibleTypes: ["RESEARCH_PAPER"], category: "PUBLISHER", recommended: false, sourceUrl: "https://ctan.org/pkg/llncs", dependencyLicense: "CC-BY-4.0 (current llncs distribution; older installed releases retain their own terms)", documentClass: "llncs", requiredPackages: ["iftex", "lmodern", "fontenc", "graphicx", "amsmath", "booktabs", "splncs04.bst"], keywords: ["Springer", "LNCS", "proceedings"] }),
  APS: definition({ id: "APS", name: "REVTeX", description: "A two-column physics research paper using REVTeX.", documentType: "RESEARCH_PAPER", compatibleTypes: ["RESEARCH_PAPER"], category: "PUBLISHER", recommended: false, sourceUrl: "https://ctan.org/pkg/revtex", dependencyLicense: "LPPL-1.3c", documentClass: "revtex4-2", requiredPackages: ["iftex", "lmodern", "fontenc", "graphicx", "amsmath", "booktabs", "apsrev4-2.bst"], keywords: ["APS", "physics", "REVTeX", "journal"] }),
  BLANK: definition({ id: "BLANK", name: "Blank LaTeX document", description: "A minimal working document for your own structure.", documentType: "OTHER", compatibleTypes: MANUSCRIPT_TYPES, category: "GENERAL", recommended: true, sourceUrl: "https://www.latex-project.org/help/documentation/", dependencyLicense: "LPPL-1.3c (LaTeX base)", documentClass: "article", requiredPackages: ["iftex", "lmodern", "fontenc"], keywords: ["blank", "custom", "other"] }),
};
export const MANUSCRIPT_DOCUMENT_TYPES: Readonly<Record<ManuscriptType, { label: string; defaultTemplate: ManuscriptTemplate }>> = {
  RESEARCH_PAPER: { label: "Research paper", defaultTemplate: "ARTICLE" },
  RESEARCH_PROPOSAL: { label: "Research proposal", defaultTemplate: "PROPOSAL" },
  TECHNICAL_REPORT: { label: "Research report", defaultTemplate: "REPORT" },
  THESIS: { label: "Thesis / Dissertation", defaultTemplate: "THESIS" },
  PRESENTATION: { label: "Presentation", defaultTemplate: "PRESENTATION" },
  OTHER: { label: "Other", defaultTemplate: "BLANK" },
};
export function compatibleManuscriptTemplates(type: ManuscriptType) {
  const recommended = MANUSCRIPT_DOCUMENT_TYPES[type].defaultTemplate;
  return MANUSCRIPT_TEMPLATES.map(id => MANUSCRIPT_TEMPLATE_REGISTRY[id])
    .filter(item => item.compatibilityStatus === "SUPPORTED" && item.compatibleTypes.includes(type))
    .sort((a, b) => Number(b.id === recommended) - Number(a.id === recommended));
}
export function isManuscriptTemplateCompatible(type: ManuscriptType, template: ManuscriptTemplate) {
  const item = MANUSCRIPT_TEMPLATE_REGISTRY[template];
  return item?.compatibilityStatus === "SUPPORTED" && item.compatibleTypes.includes(type);
}
export interface ManuscriptTemplateMetadata {
  id: ManuscriptTemplate; templateVersion: string; sourceType: "LUMIGAP_STARTER";
  documentClass: string; mainTexFile: string; sourceChecksum: string;
}
