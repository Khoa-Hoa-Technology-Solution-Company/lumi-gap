import {
  formatEvidence,
  sanitizeForPrompt,
  UNTRUSTED_DATA_PREAMBLE,
} from "../llm/grounding.js";

export const PAPER_AI_ANALYSIS_PROMPT_VERSION = "paper-ai-analysis-v1";

export interface PaperAnalysisInput {
  title: string;
  abstractText: string;
}

export interface PaperAnalysisContent {
  summary: string | null;
  methods: string | null;
  dataset: string | null;
  findings: string[];
  limitations: string[];
  contributions: string[];
  futureWork: string[];
  keyTerms: string[];
}

export interface PaperAiAnalysis extends PaperAnalysisContent {
  extractedBy: "llm";
  analysisPromptVersion: string;
  extractedAt: Date;
}

const MAX_ABSTRACT_CHARS = 5000;
const MAX_TEXT_CHARS = 240;
const MAX_LIST_ITEMS = 8;

export const PAPER_ANALYSIS_SYSTEM_PROMPT = [
  "You extract structured knowledge from academic paper abstracts.",
  UNTRUSTED_DATA_PREAMBLE,
  "Use ONLY the provided title and abstract. Do not infer missing details.",
  "If the abstract does not state a field, use null for scalar fields and [] for list fields.",
  "Return ONLY valid JSON. No markdown fences, no commentary.",
].join("\n");

export function buildPaperAnalysisPrompt(input: PaperAnalysisInput): string {
  const evidence = formatEvidence(
    [
      {
        title: input.title,
        abstractText: input.abstractText,
      },
    ],
    { maxAbstractChars: MAX_ABSTRACT_CHARS },
  );

  return [
    `PROMPT_VERSION: ${PAPER_AI_ANALYSIS_PROMPT_VERSION}`,
    "Extract the fields below ONLY from the abstract. If not stated, use null or [].",
    "",
    "DATA:",
    evidence.text,
    "",
    "Return JSON exactly shaped as:",
    JSON.stringify({
      summary: "string|null",
      methods: "string|null",
      dataset: "string|null",
      findings: ["string"],
      limitations: ["string"],
      contributions: ["string"],
      futureWork: ["string"],
      keyTerms: ["string"],
    }),
  ].join("\n");
}

export function sanitizePaperAnalysis(raw: unknown): PaperAnalysisContent {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    summary: cleanScalar(obj.summary),
    methods: cleanScalar(obj.methods),
    dataset: cleanScalar(obj.dataset),
    findings: cleanList(obj.findings),
    limitations: cleanList(obj.limitations),
    contributions: cleanList(obj.contributions),
    futureWork: cleanList(obj.futureWork),
    keyTerms: cleanTerms(obj.keyTerms),
  };
}

export function withAnalysisMetadata(content: PaperAnalysisContent, extractedAt = new Date()): PaperAiAnalysis {
  return {
    ...content,
    extractedBy: "llm",
    analysisPromptVersion: PAPER_AI_ANALYSIS_PROMPT_VERSION,
    extractedAt,
  };
}

function cleanScalar(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = truncate(sanitizeForPrompt(value), MAX_TEXT_CHARS);
  return cleaned.length > 0 ? cleaned : null;
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(cleanScalar)
    .filter((x): x is string => Boolean(x))
    .slice(0, MAX_LIST_ITEMS);
}

function cleanTerms(value: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of cleanList(value)) {
    const term = item.toLowerCase();
    if (!seen.has(term)) {
      seen.add(term);
      out.push(term);
    }
  }
  return out;
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  if (maxChars <= 3) return value.slice(0, maxChars);
  return `${value.slice(0, maxChars - 3).trimEnd()}...`;
}
