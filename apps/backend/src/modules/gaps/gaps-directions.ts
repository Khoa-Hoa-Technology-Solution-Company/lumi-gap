/**
 * AI "next research directions" for a single gap — PURE prompt + sanitize logic,
 * no I/O (mirrors search.rerank.ts). The service in gaps.service.ts wires these
 * to the LLM client + Mongo. Bump DIRECTIONS_PROMPT_VERSION on any wording change.
 */
import crypto from "node:crypto";
import type { ResearchDirection } from "@trend/shared-types";
import { buildPaperEvidenceText, type PaperStructuredAnalysis } from "../papers/paper-structured-context.js";

export const DIRECTIONS_PROMPT_VERSION = "directions-v2";

export const DIRECTIONS_SYSTEM_PROMPT = [
  "You are a research advisor for an academic publication-trend platform.",
  "Given ONE research gap (with its quantitative evidence) and its supporting papers,",
  "propose 2 to 4 CONCRETE next research directions a student or lecturer could pursue.",
  "Each direction must be grounded in THIS gap and its evidence — do not drift to unrelated topics.",
  "For relatedPaperIds, choose ONLY from the supporting paper ids provided; never invent ids or papers.",
  'Return ONLY JSON: {"directions": [{"title": "...", "rationale": "...", "suggestedApproach": "...", "relatedPaperIds": ["..."]}]}',
  "- title: a short, specific direction (<= 160 chars).",
  "- rationale: 1-2 sentences on why it follows from this gap + evidence.",
  "- suggestedApproach: the method / data / experiment to pursue it.",
  "- relatedPaperIds: ids from the supporting papers most relevant to this direction (or []).",
  "No markdown, no commentary outside the JSON.",
].join("\n");

export interface DirectionsRaw {
  directions?: Array<{
    title?: unknown;
    rationale?: unknown;
    suggestedApproach?: unknown;
    relatedPaperIds?: unknown;
  }>;
}

export interface DirectionGap {
  topic: string;
  title: string;
  description: string;
  rationale: string;
  intersectionCount?: number;
  parentTrend?: { topic: string; growthRatePct: number } | null;
}

export interface DirectionPaper {
  id: string;
  title: string;
  abstractText?: string;
  aiAnalysis?: PaperStructuredAnalysis | null;
}

/** Bound abstracts so a pathological one can't blow the token budget. */
const MAX_ABSTRACT_CHARS = 500;
const MAX_DIRECTIONS = 4;
const MAX_TEXT_CHARS = 1000;
/** Matches the "<= 160 chars" instruction in DIRECTIONS_SYSTEM_PROMPT. */
const MAX_TITLE_CHARS = 160;

function formatPapers(papers: DirectionPaper[]): string {
  if (papers.length === 0) return "(no supporting papers)";
  return papers
    .map(
      (p, i) =>
        `[${i + 1}] id=${p.id} "${p.title}"\n    ${buildPaperEvidenceText({
          abstractText: p.abstractText ?? "(no abstract)",
          aiAnalysis: p.aiAnalysis,
        }).slice(0, MAX_ABSTRACT_CHARS)}`,
    )
    .join("\n\n");
}

export function buildDirectionsPrompt(gap: DirectionGap, papers: DirectionPaper[]): string {
  const evidenceLines: string[] = [];
  if (gap.intersectionCount !== undefined) {
    evidenceLines.push(`intersectionCount: ${gap.intersectionCount}`);
  }
  if (gap.parentTrend) {
    evidenceLines.push(
      `rising parent topic: "${gap.parentTrend.topic}" (+${gap.parentTrend.growthRatePct}%)`,
    );
  }
  return [
    `TOPIC: ${gap.topic}`,
    `RESEARCH GAP:\nTitle: ${gap.title}\nDescription: ${gap.description}\nRationale: ${gap.rationale}`,
    `QUANTITATIVE EVIDENCE:\n${evidenceLines.length ? evidenceLines.join("\n") : "(none)"}`,
    `SUPPORTING PAPERS (${papers.length}):\n${formatPapers(papers)}`,
    "Propose 2-4 concrete next research directions as instructed. Return ONLY the JSON.",
  ].join("\n\n---\n\n");
}

export function buildDirectionsEvidenceHash(papers: DirectionPaper[]): string {
  const canonical = papers.map((p) => ({
    id: p.id,
    title: p.title,
    abstractText: p.abstractText ?? null,
    aiAnalysis: p.aiAnalysis ?? null,
  }));
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 40);
}

/**
 * Validate/normalize the LLM output: clamp to <= 4 directions, drop empty-title
 * items, trim text, and KEEP only relatedPaperIds that actually belong to the
 * gap's supporting papers (strips hallucinated ids). Pure — fully unit-tested.
 */
export function sanitizeDirections(
  raw: DirectionsRaw | null,
  allowedPaperIds: string[],
): ResearchDirection[] {
  if (!raw || !Array.isArray(raw.directions)) return [];
  const allowed = new Set(allowedPaperIds);
  const out: ResearchDirection[] = [];
  for (const d of raw.directions) {
    const title = String(d?.title ?? "").trim().slice(0, MAX_TITLE_CHARS);
    if (!title) continue;
    const ids = Array.isArray(d?.relatedPaperIds) ? d!.relatedPaperIds : [];
    const relatedPaperIds = [
      ...new Set(ids.map((x) => String(x)).filter((id) => allowed.has(id))),
    ];
    out.push({
      title,
      rationale: String(d?.rationale ?? "").trim().slice(0, MAX_TEXT_CHARS),
      suggestedApproach: String(d?.suggestedApproach ?? "").trim().slice(0, MAX_TEXT_CHARS),
      relatedPaperIds,
    });
    if (out.length >= MAX_DIRECTIONS) break;
  }
  return out;
}
