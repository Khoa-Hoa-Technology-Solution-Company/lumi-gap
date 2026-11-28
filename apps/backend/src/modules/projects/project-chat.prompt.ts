import type { ProjectChatCitationSourceKind, ProjectChatIntent, ProjectChatRetrievalMode } from "@trend/shared-types";
import {
  assertCitationsInRange,
  formatEvidence,
  parseCitationNumbers,
  sanitizeForPrompt,
  UNTRUSTED_DATA_PREAMBLE,
} from "../llm/grounding.js";

export const CHAT_SYSTEM_PROMPT = [
  "You are a research assistant for an academic project on LumiGap.",
  UNTRUSTED_DATA_PREAMBLE,
  "Answer from the provided project papers and cite evidence with bracket numbers like [1] or [1, 3].",
  "Clearly distinguish between findings reported in the papers, author-stated limitations, and your own synthesis or research suggestions.",
  "Do not treat an individual paper's limitation, small corpus size, or missing abstract as a confirmed research gap; frame such observations as candidate directions requiring further verification.",
  "Respect each source's actual coverage (metadata only, abstract, or full-text excerpt). Never claim to have read full text if only an abstract or metadata was provided.",
  "If the provided papers do not contain enough evidence, say that clearly and state what is missing.",
  "Answer in Vietnamese unless the user asks for another language.",
].join("\n");

export const METHODOLOGY_SYSTEM_PROMPT = [
  "You are an academic research methodology advisor on LumiGap.",
  UNTRUSTED_DATA_PREAMBLE,
  "Provide clear, rigorous general research methodology guidance.",
  "Explicitly state that this response is general methodological guidance and is NOT derived from specific papers in the project library.",
  "Do not invent citations, paper titles, DOIs, or project statistics.",
  "Answer in Vietnamese unless the user asks for another language.",
].join("\n");

export const MAX_CHAT_ABSTRACT_CHARS = 800;

export interface ChatEvidencePaper {
  id: string;
  internalId?: string;
  title: string;
  abstractText?: string;
  publicationYear?: number | null;
  journalName?: string | null;
  doi?: string | null;
  authorNames?: string[];
  screeningStatus?: string;
  embedding?: number[];
  score?: number;
  sourceKind?: ProjectChatCitationSourceKind;
  excerpt?: string | null;
  pageNumber?: number | null;
  chunkId?: string | null;
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

export interface PickEvidenceResult {
  papers: ChatEvidencePaper[];
  retrievalMode: ProjectChatRetrievalMode;
}

export interface ParsedCitationEntry {
  citationNumber: number;
  paper: ChatEvidencePaper;
}

const CAPABILITY_PATTERNS: RegExp[] = [
  /^(xin\s+chào|chào(\s+bạn|\s+ai)?|hello|hi|hey)(?=$|[!.?\s])/i,
  /(?:^|[\s,(])(bạn\s+là\s+(ai|gì|một\s+ai)|ai\s+thực\s+thụ|chỉ\s+là\s+rag|are\s+you\s+(a\s+)?rag|who\s+are\s+you|what\s+are\s+you)(?=$|[\s?!.,)])/i,
  /(?:^|[\s,(])(bạn\s+(có\s+thể\s+)?làm\s+được\s+gì|bạn\s+hỗ\s+trợ\s+(được\s+)?gì|what\s+can\s+you\s+do|your\s+capabilities)(?=$|[\s?!.,)])/i,
  /(?:^|[\s,(])(bạn\s+có\s+đọc\s+được\s+(pdf|toàn\s+văn|full\s*text)|do\s+you\s+read\s+(pdf|full\s*text)|how\s+do\s+you\s+work)(?=$|[\s?!.,)])/i,
];

const PROJECT_CONTEXT_PATTERNS: RegExp[] = [
  /(?:^|[\s,(])(nhóm|dự\s+án)\s+(hiện\s+)?(có|đang\s+có)\s+(những\s+|bao\s+nhiêu\s+)?(tài\s+liệu|bài\s+báo)(?=$|[\s?!.,)])/i,
  /(?:^|[\s,(])(danh\s+sách\s+(tài\s+liệu|bài\s+báo)|bài\s+(nào|báo\s+nào)\s+(đã\s+được\s+chọn|đã\s+chọn|included))(?=$|[\s?!.,)])/i,
  /(?:^|[\s,(])(what\s+papers\s+are\s+in\s+this\s+project|list\s+(the\s+)?project\s+papers|which\s+papers\s+are\s+included)(?=$|[\s?!.,)])/i,
];

const METHODOLOGY_PATTERNS: RegExp[] = [
  /^\s*(research\s+gap|khoảng\s+trống\s+nghiên\s+cứu|literature\s+review|systematic\s+review|prisma|pico|scoping\s+review)\s+(là\s+gì|khác\s+.+\s+như\s+thế\s+nào|nghĩa\s+là\s+gì|what\s+is)(?=$|[\s?!.,)])/i,
  /(?:^|[\s,(])(làm\s+thế\s+nào\s+để\s+(xây\s+dựng|viết|xác\s+định)\s+(câu\s+hỏi\s+nghiên\s+cứu|giả\s+thuyết|phương\s+pháp\s+nghiên\s+cứu|tổng\s+quan\s+tài\s+liệu))(?=$|[\s?!.,)])/i,
  /(?:^|[\s,(])(how\s+to\s+(write|formulate|design)\s+(a\s+)?(research\s+question|literature\s+review|systematic\s+review|hypothesis|methodology))(?=$|[\s?!.,)])/i,
  /(?:^|[\s,(])(difference\s+between\s+literature\s+review\s+and\s+systematic\s+review|literature\s+review\s+khác\s+systematic\s+review)(?=$|[\s?!.,)])/i,
];

const PROJECT_EVIDENCE_CUE = /(?:^|[\s,(])(dự\s+án\s+này|các\s+bài\s+(báo\s+)?này|tài\s+liệu\s+(này|trong\s+dự\s+án|hiện\s+có)|in\s+this\s+project|these\s+papers|our\s+papers)(?=$|[\s?!.,)])/i;

export function classifyChatIntent(question: string): ProjectChatIntent {
  const normalized = question.trim();
  if (!normalized) return "grounded";
  if (CAPABILITY_PATTERNS.some((pattern) => pattern.test(normalized))) return "capability";
  if (PROJECT_CONTEXT_PATTERNS.some((pattern) => pattern.test(normalized))) return "project_context";
  if (!PROJECT_EVIDENCE_CUE.test(normalized) && METHODOLOGY_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "methodology";
  }
  return "grounded";
}

function tokenizeText(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);
  return new Set(tokens);
}

export function lexicalRelevanceScore(question: string, paper: ChatEvidencePaper): number {
  const qTokens = tokenizeText(question);
  if (qTokens.size === 0) return 0;
  const titleTokens = tokenizeText(paper.title);
  const bodyTokens = tokenizeText(`${paper.abstractText ?? ""} ${paper.excerpt ?? ""}`);
  let score = 0;
  for (const token of qTokens) {
    if (titleTokens.has(token)) score += 2.0;
    else if (bodyTokens.has(token)) score += 1.0;
  }
  return score / (qTokens.size * 2);
}

export function pickEvidenceWithMetadata(
  papers: ChatEvidencePaper[],
  cap: number,
  questionVector?: number[],
  questionText = "",
): PickEvidenceResult {
  if (papers.length === 0) return { papers: [], retrievalMode: "none" };
  const validQueryVector = Boolean(questionVector && questionVector.length > 0 && questionVector.every(Number.isFinite));
  const queryDim = validQueryVector ? questionVector!.length : 0;
  const compatibleCount = validQueryVector
    ? papers.filter((p) => Array.isArray(p.embedding) && p.embedding.length === queryDim && p.embedding.every(Number.isFinite)).length
    : 0;

  if (papers.length <= cap && compatibleCount === 0 && !questionText.trim()) {
    return { papers, retrievalMode: "direct" };
  }

  if (compatibleCount > 0) {
    const scored = papers.map((paper, index) => {
      const hasCompatVec = Array.isArray(paper.embedding) && paper.embedding.length === queryDim && paper.embedding.every(Number.isFinite);
      const semantic = hasCompatVec ? cosineSimilarity(questionVector!, paper.embedding!) : null;
      const lexical = questionText.trim() ? lexicalRelevanceScore(questionText, paper) : 0;
      const combined = semantic !== null && Number.isFinite(semantic)
        ? (questionText.trim() ? 0.8 * semantic + 0.2 * lexical : semantic)
        : (lexical > 0 ? -0.5 + lexical * 0.4 : Number.NEGATIVE_INFINITY);
      return { paper, index, score: combined };
    });

    const ranked = scored
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, cap)
      .map((entry) => ({ ...entry.paper, score: entry.score }));

    return {
      papers: ranked,
      retrievalMode: compatibleCount === papers.length && !questionText.trim() ? "semantic" : "hybrid",
    };
  }

  if (questionText.trim()) {
    const scored = papers.map((paper, index) => ({
      paper,
      index,
      score: lexicalRelevanceScore(questionText, paper),
    }));
    const ranked = scored
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, cap)
      .map((entry) => ({ ...entry.paper, score: entry.score }));
    return { papers: ranked, retrievalMode: "lexical_fallback" };
  }

  return { papers: papers.slice(0, cap), retrievalMode: "direct" };
}

export function pickEvidence(
  papers: ChatEvidencePaper[],
  cap: number,
  questionVector?: number[],
  questionText = "",
): ChatEvidencePaper[] {
  if (papers.length <= cap) return papers;
  return pickEvidenceWithMetadata(papers, cap, questionVector, questionText).papers;
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
            const coverageLabel = paper.sourceKind === "FULLTEXT"
              ? `Full-text excerpt${paper.pageNumber ? ` (p. ${paper.pageNumber})` : ""}`
              : paper.sourceKind === "ABSTRACT" || paper.abstractText
              ? "Abstract"
              : "Metadata only";
            const body = paper.sourceKind === "FULLTEXT" && paper.excerpt
              ? [paper.abstractText ? `Abstract: ${paper.abstractText}` : "", `Full-text excerpt: ${paper.excerpt}`].filter(Boolean).join("\n")
              : paper.abstractText;
            return {
              id: paper.id,
              title: paper.title,
              abstractText: body,
              meta: `Year: ${year}; Authors: ${authors}; Coverage: ${coverageLabel}`,
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
      "- Use only PROJECT PAPER EVIDENCE above for document-specific claims.",
      "- Cite paper evidence with [n] where n is the exact evidence number above.",
      "- Clearly separate reported paper findings from AI interpretations or candidate research directions.",
      "- Do not invent titles, authors, DOI, URLs, page numbers, methods, or citations.",
    ].join("\n"),
  };
}

export function buildMethodologyPrompt(question: string, history?: ChatHistoryTurn[]): { system: string; prompt: string } {
  const historyBlock =
    history && history.length > 0
      ? history
          .map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${sanitizeForPrompt(turn.content)}`)
          .join("\n")
      : "(No previous messages.)";

  return {
    system: METHODOLOGY_SYSTEM_PROMPT,
    prompt: [
      "RECENT CHAT HISTORY:",
      historyBlock,
      "",
      "USER METHODOLOGY QUESTION:",
      sanitizeForPrompt(question),
      "",
      "INSTRUCTIONS:",
      "- Answer clearly as general academic research methodology guidance.",
      "- Begin with a brief note clarifying that this is general methodology guidance (not extracted from specific papers in the project library).",
      "- Do not use bracket citation numbers like [1].",
    ].join("\n"),
  };
}

/**
 * Validates all citation numbers against evidence length and preserves exact `[n] -> paper` mapping
 * in order of first appearance (never renumbered by DB scan order).
 */
export function parseCitationEntries(answer: string, evidence: ChatEvidencePaper[]): ParsedCitationEntry[] {
  assertCitationsInRange(answer, evidence.length);
  const seenNumbers = new Set<number>();
  const entries: ParsedCitationEntry[] = [];
  for (const n of parseCitationNumbers(answer)) {
    if (n < 1 || n > evidence.length || seenNumbers.has(n)) continue;
    seenNumbers.add(n);
    const paper = evidence[n - 1];
    if (paper) entries.push({ citationNumber: n, paper });
  }
  return entries;
}

export function parseCitations(answer: string, evidence: ChatEvidencePaper[]): string[] {
  const seenIds = new Set<string>();
  const ids: string[] = [];
  for (const entry of parseCitationEntries(answer, evidence)) {
    if (!seenIds.has(entry.paper.id)) {
      seenIds.add(entry.paper.id);
      ids.push(entry.paper.id);
    }
  }
  return ids;
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
