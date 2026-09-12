import {
  assertCitationsInRange,
  formatEvidence,
  parseCitedIds,
  sanitizeForPrompt,
  UNTRUSTED_DATA_PREAMBLE,
} from "../llm/grounding.js";

export const CHAT_SYSTEM_PROMPT = [
  "You are a research assistant for an academic project.",
  UNTRUSTED_DATA_PREAMBLE,
  "Answer only from the provided project papers.",
  "When you use evidence, cite it with bracket numbers like [1].",
  "If the provided papers do not contain enough evidence, say that clearly.",
  "Answer in Vietnamese unless the user asks for another language.",
].join("\n");

export const MAX_CHAT_ABSTRACT_CHARS = 800;

export interface ChatEvidencePaper {
  id: string;
  title: string;
  abstractText?: string;
  publicationYear?: number;
  authorNames?: string[];
  embedding?: number[];
  score?: number;
}

export interface ChatHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatPromptInput {
  question: string;
  evidence: ChatEvidencePaper[];
  history?: ChatHistoryTurn[];
  abstractMaxChars?: number;
}

export function pickEvidence(
  papers: ChatEvidencePaper[],
  cap: number,
  questionVector?: number[],
): ChatEvidencePaper[] {
  if (papers.length <= cap) return papers;
  if (!questionVector || questionVector.length === 0) return papers.slice(0, cap);

  return [...papers]
    .map((paper, index) => ({
      paper,
      index,
      score: paper.embedding ? cosineSimilarity(questionVector, paper.embedding) : Number.NEGATIVE_INFINITY,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, cap)
    .map((x) => ({ ...x.paper, score: x.score }));
}

export function buildChatPrompt(input: ChatPromptInput): { system: string; prompt: string } {
  const abstractMaxChars = input.abstractMaxChars ?? MAX_CHAT_ABSTRACT_CHARS;
  const evidenceBlock =
    input.evidence.length === 0
      ? "(No project papers were provided.)"
      : formatEvidence(
          input.evidence.map((paper) => {
            const authors = paper.authorNames?.length
              ? paper.authorNames.slice(0, 4).join(", ")
              : "Unknown authors";
            const year = paper.publicationYear ?? "n.d.";
            return {
              id: paper.id,
              title: paper.title,
              abstractText: paper.abstractText,
              meta: `Year: ${year}; Authors: ${authors}`,
            };
          }),
          { maxAbstractChars: abstractMaxChars },
        ).text;

  const historyBlock =
    input.history && input.history.length > 0
      ? input.history
          .map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${sanitizeForPrompt(turn.content)}`)
          .join("\n")
      : "(No previous messages.)";

  return {
    system: CHAT_SYSTEM_PROMPT,
    prompt: [
      "PROJECT PAPER EVIDENCE:",
      evidenceBlock,
      "",
      "RECENT CHAT HISTORY:",
      historyBlock,
      "",
      "USER QUESTION:",
      sanitizeForPrompt(input.question),
      "",
      "INSTRUCTIONS:",
      "- Use only PROJECT PAPER EVIDENCE above.",
      "- Cite paper evidence with [n] where n is the evidence number.",
      "- Do not invent titles, authors, DOI, URLs, methods, or citations.",
    ].join("\n"),
  };
}

export function parseCitations(answer: string, evidence: ChatEvidencePaper[]): string[] {
  assertCitationsInRange(answer, evidence.length);
  return parseCitedIds(answer, evidence.map((paper) => paper.id));
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!;
    aMag += a[i]! * a[i]!;
    bMag += b[i]! * b[i]!;
  }
  if (aMag === 0 || bMag === 0) return Number.NEGATIVE_INFINITY;
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max).trimEnd()}...`;
}
