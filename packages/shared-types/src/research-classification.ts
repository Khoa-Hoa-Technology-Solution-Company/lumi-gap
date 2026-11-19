import type { TaxonomyLevel } from "./taxonomy.js";

/** References into the existing catalogue, never labels supplied by a client. */
export interface ResearchClassificationInput { nodeIds: string[]; keywordIds: string[]; skillIds: string[] }
export interface ResearchClassification extends ResearchClassificationInput {
  nodes: Array<{ id: string; level: TaxonomyLevel; name: string; parentId: string | null; externalId: string | null; source: "OPENALEX" | "LOCAL"; aliases: string[]; syncedAt: string | null; sourceVersion: string | null; labelVi: string | null }>;
  keywords: Array<{ id: string; name: string; aliases: string[]; source: "LOCAL" | "OPENALEX"; externalId?: string | null; syncedAt?: string | null; sourceVersion?: string | null }>;
  vocabularyVersion: string;
}
export const TECHNICAL_SKILLS = [
  { id: "python", label: "Python", kind: "LANGUAGE", aliases: [] },
  { id: "r", label: "R", kind: "LANGUAGE", aliases: ["r language"] },
  { id: "pytorch", label: "PyTorch", kind: "LIBRARY", aliases: [] },
  { id: "tensorflow", label: "TensorFlow", kind: "LIBRARY", aliases: ["tensor flow"] },
  { id: "computer-vision", label: "Computer Vision", kind: "METHOD", aliases: ["cv"] },
  { id: "nlp", label: "Natural Language Processing", kind: "METHOD", aliases: ["nlp"] },
  { id: "cnn", label: "Convolutional Neural Networks", kind: "METHOD", aliases: ["cnn"] },
  { id: "data-mining", label: "Data Mining", kind: "METHOD", aliases: [] },
  { id: "statistics", label: "Statistical Analysis", kind: "METHOD", aliases: ["statistics"] },
  { id: "qualitative-analysis", label: "Qualitative Analysis", kind: "METHOD", aliases: [] },
  { id: "systematic-review", label: "Systematic Review", kind: "METHOD", aliases: [] },
  { id: "experimental-design", label: "Experimental Design", kind: "METHOD", aliases: [] },
  { id: "spss", label: "SPSS", kind: "TOOL", aliases: [] },
  { id: "stata", label: "Stata", kind: "TOOL", aliases: [] },
  { id: "sql", label: "SQL", kind: "LANGUAGE", aliases: [] },
  { id: "matlab", label: "MATLAB", kind: "TOOL", aliases: [] },
] as const;
export const RESEARCH_VOCABULARY_VERSION = "lumigap-skills-2026-11-11";
export const MENTOR_SUPPORT_AREAS = [
  { id: "RESEARCH_DIRECTION", label: "Research direction" },
  { id: "LITERATURE_REVIEW", label: "Literature review" },
  { id: "RESEARCH_GAP_VALIDATION", label: "Research gap validation" },
  { id: "RESEARCH_METHODOLOGY", label: "Research methodology" },
  { id: "EXPERIMENT_DESIGN", label: "Experiment design" },
  { id: "DATA_ANALYSIS", label: "Data analysis" },
  { id: "ACADEMIC_WRITING", label: "Academic writing" },
  { id: "SOFTWARE_TECHNICAL_GUIDANCE", label: "Software guidance" },
] as const;
export const normalizeResearchTerm = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
/** Exact curated synonyms only: e.g. R never becomes React. Custom terms stay custom. */
export function normalizeTechnicalSkill(value: string): string {
  const normalized = normalizeResearchTerm(value);
  return TECHNICAL_SKILLS.find(skill => [skill.id, skill.label, ...skill.aliases].some(alias => normalizeResearchTerm(alias) === normalized))?.id ?? normalized;
}
export const emptyResearchClassification = (): ResearchClassificationInput => ({ nodeIds: [], keywordIds: [], skillIds: [] });
export interface ResearchTopicSuggestions {
  classification: ResearchClassification;
  source: "OPENALEX" | "LOCAL";
  providerVersion?: string;
  generatedAt: string;
  topicConfidence?: Record<string, number>;
}
export interface ResearchTopicSuggestionJob { jobId: string; status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED"; result?: ResearchTopicSuggestions }
