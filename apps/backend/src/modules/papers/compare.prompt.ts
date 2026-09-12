import crypto from "node:crypto";
import {
  formatEvidence,
  UNTRUSTED_DATA_PREAMBLE,
  type GroundingEvidence,
} from "../llm/grounding.js";
import { buildPaperEvidenceText, type PaperStructuredAnalysis } from "./paper-structured-context.js";

/**
 * Prompt construction for paper comparison — PURE functions, no I/O. The cache
 * key includes promptVersion so a wording change invalidates stale entries
 * (CLAUDE.md §6). It is ORDER-INSENSITIVE on paper ids: a comparison SET is
 * unordered, so {a,b} and {b,a} reuse the same cached comparison.
 */

export interface CompareCandidate {
  id: string;
  title: string;
  abstractText?: string;
  aiAnalysis?: PaperStructuredAnalysis | null;
}

export interface CompareLlmOutput {
  dimensions: Array<{ name: string; perPaper: string[] }>;
}

/** Fixed comparison axes — keeps output structured and the prompt deterministic. */
export const COMPARE_DIMENSIONS = ["method", "dataScope", "keyFinding", "limitation"] as const;

/** Abstracts are truncated so a long one can't blow the token budget. */
const MAX_ABSTRACT_CHARS = 1200;

export const COMPARE_SYSTEM_PROMPT = [
  "You compare academic papers ONLY from the title, abstract, and structured analysis provided.",
  UNTRUSTED_DATA_PREAMBLE,
  'Do not invent facts not present in the provided evidence. If the evidence lacks info for a dimension, write "not stated".',
  `Compare across exactly these dimensions: ${COMPARE_DIMENSIONS.join(", ")}.`,
  "Return ONLY valid JSON, no fences:",
  '{ "dimensions": [ { "name": "method", "perPaper": ["<paper1>", "<paper2>", ...] }, ... ] }',
  "Each dimension's perPaper array MUST have exactly one entry per paper, in the given order.",
].join("\n");

export function buildComparePrompt(papers: CompareCandidate[]): string {
  const evidence = formatEvidence(
    papers.map((p): GroundingEvidence => ({
      id: p.id,
      title: p.title,
      abstractText: buildPaperEvidenceText({
        abstractText: p.abstractText,
        aiAnalysis: p.aiAnalysis,
      }),
    })),
    { maxAbstractChars: MAX_ABSTRACT_CHARS },
  );
  return `Compare these ${papers.length} papers using ONLY the DATA blocks below:\n\n${evidence.text}`;
}

export function buildCompareCacheKey(args: {
  paperIds: string[];
  model: string;
  promptVersion: string;
}): string {
  // Order-insensitive: a comparison SET is unordered → sort ids before hashing.
  const ids = [...args.paperIds].map(String).sort().join(",");
  const raw = `${args.promptVersion}|${args.model}|${ids}`;
  return `cmp:${crypto.createHash("sha256").update(raw).digest("hex")}`;
}

export function parseComparison(raw: unknown, paperCount: number): CompareLlmOutput {
  const dims =
    raw && typeof raw === "object" && Array.isArray((raw as { dimensions?: unknown }).dimensions)
      ? ((raw as { dimensions: unknown[] }).dimensions as unknown[])
      : [];
  const dimensions = dims
    .map((d) => d as { name?: unknown; perPaper?: unknown })
    .filter(
      (d): d is { name: string; perPaper: string[] } =>
        typeof d.name === "string" &&
        Array.isArray(d.perPaper) &&
        d.perPaper.length === paperCount &&
        d.perPaper.every((x) => typeof x === "string"),
    )
    .map((d) => ({ name: d.name, perPaper: d.perPaper }));
  return { dimensions };
}
