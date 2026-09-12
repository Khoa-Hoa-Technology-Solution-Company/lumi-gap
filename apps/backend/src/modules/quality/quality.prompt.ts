import {
  formatEvidence,
  UNTRUSTED_DATA_PREAMBLE,
} from "../llm/grounding.js";

/**
 * Prompt construction for the LLM-as-a-judge — PURE functions, no I/O.
 * Bump QUALITY_PROMPT_VERSION on any wording change.
 */
export const QUALITY_PROMPT_VERSION = "quality-v1";

export const QUALITY_JUDGE_SYSTEM_PROMPT = [
  "You are a STRICT research-quality evaluator for an academic platform.",
  UNTRUSTED_DATA_PREAMBLE,
  "Score the given AI output on three criteria, each an INTEGER 1-5:",
  "- relevance: does it actually address the question/topic?",
  "- groundedness: are its claims supported by the PROVIDED evidence papers? Penalize unsupported or hallucinated claims.",
  "- completeness: does it make good use of the available evidence, without major omissions?",
  "Be critical and calibrated: 5 = excellent, 3 = acceptable, 1 = poor. Judge groundedness ONLY against the evidence shown.",
  'Return ONLY JSON: {"relevance": n, "groundedness": n, "completeness": n, "rationale": "..."}',
  "rationale: 1-3 sentences justifying the scores. No markdown, no commentary outside the JSON.",
].join("\n");

export interface JudgeEvidence {
  title: string;
  abstractText?: string;
}

/** Abstracts are truncated so groundedness can be judged without blowing tokens. */
const MAX_ABSTRACT_CHARS = 600;
const MAX_MARKDOWN_CHARS = 8000;
/** A paper's own abstract is the main content here, so allow more than the 600-char
 * evidence snippet — but still bound it so a pathological abstract can't blow tokens. */
const MAX_PAPER_ABSTRACT_CHARS = 4000;

function formatJudgeEvidence(evidence: JudgeEvidence[]): string {
  if (evidence.length === 0) return "(no evidence papers available)";
  return formatEvidence(evidence, { maxAbstractChars: MAX_ABSTRACT_CHARS }).text;
}

export function buildReportJudgePrompt(
  query: string,
  markdown: string,
  evidence: JudgeEvidence[],
): string {
  return [
    `QUESTION:\n${query}`,
    `EVIDENCE PAPERS (${evidence.length}):\n${formatJudgeEvidence(evidence)}`,
    `AI REPORT TO EVALUATE:\n${markdown.slice(0, MAX_MARKDOWN_CHARS)}`,
    "Score the report on relevance / groundedness / completeness as instructed. Return ONLY the JSON.",
  ].join("\n\n---\n\n");
}

export function buildGapJudgePrompt(
  gap: { topic: string; title: string; description: string; rationale: string },
  evidence: JudgeEvidence[],
): string {
  return [
    `TOPIC: ${gap.topic}`,
    `EVIDENCE PAPERS (${evidence.length}):\n${formatJudgeEvidence(evidence)}`,
    `AI RESEARCH GAP TO EVALUATE:\nTitle: ${gap.title}\nDescription: ${gap.description}\nRationale: ${gap.rationale}`,
    "Score: relevance (is it a real, well-scoped gap?), groundedness (supported by the evidence?), completeness (clearly articulated?). Return ONLY the JSON.",
  ].join("\n\n---\n\n");
}

/**
 * Judge a user-uploaded paper from its OWN abstract (the paper is the source, so
 * there is no separate evidence list). Reuses the 3-dimension JSON contract,
 * reinterpreted for a standalone paper.
 */
export function buildPaperJudgePrompt(paper: { title: string; abstractText?: string }): string {
  const abstract = (paper.abstractText ?? "(no abstract)").slice(0, MAX_PAPER_ABSTRACT_CHARS);
  const evidence = formatEvidence([{ title: paper.title, abstractText: abstract }], {
    maxAbstractChars: MAX_PAPER_ABSTRACT_CHARS,
  }).text;
  return [
    `PAPER DATA:\n${evidence}`,
    [
      "Score this PAPER itself (it is source content, not an AI output) on:",
      "- relevance: is it a clear, well-scoped research topic (vs vague / off-scope)?",
      "- groundedness: are the abstract's claims backed by a stated method / data / results (vs hand-wavy)?",
      "- completeness: does the abstract cover problem + method + result?",
      "Return ONLY the JSON.",
    ].join("\n"),
  ].join("\n\n---\n\n");
}
