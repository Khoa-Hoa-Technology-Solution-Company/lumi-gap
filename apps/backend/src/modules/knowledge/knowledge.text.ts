import { createHash } from "node:crypto";
import { sanitizeForPrompt } from "../llm/grounding.js";
import type { GroundedRelation, KnowledgeEvidence, SourceChunk, SourcePage } from "./knowledge.types.js";

export const RAG_INDEX_VERSION = "full-text-rag-v1";
export const RELATION_KINDS = ["USES_METHOD", "USES_DATASET", "REPORTS_FINDING", "HAS_LIMITATION", "PROPOSES_FUTURE_WORK", "STUDIES_CONCEPT"] as const;
export const digest = (text: string) => createHash("sha256").update(text).digest("hex");
export const normalizeText = (text: string) => text.replace(/\s+/g, " ").trim();

export function sourceFingerprint(paper: { title: string; abstractText: string | null; pdfPath: string | null; openAccessUrl: string | null; uploadedAt?: Date | null }): string {
  return digest(JSON.stringify([paper.title, paper.abstractText, paper.pdfPath, paper.openAccessUrl, paper.uploadedAt?.toISOString()]));
}

export function chunkPages(pages: SourcePage[], size = 2400, maxChunks = 300): SourceChunk[] {
  const chunks: SourceChunk[] = [];
  for (const page of pages) {
    const text = normalizeText(page.text.replace(/\u0000/g, " "));
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + size, text.length);
      if (end < text.length) {
        const boundary = text.lastIndexOf(" ", end);
        if (boundary > start + Math.floor(size / 2)) end = boundary;
      }
      const part = text.slice(start, end).trim();
      if (part) chunks.push({ position: chunks.length, pageNumber: page.pageNumber, text: part, contentHash: digest(part) });
      if (chunks.length > maxChunks) throw new Error(`Document exceeds the ${maxChunks} chunk indexing limit`);
      if (end >= text.length) break;
      // Small overlap keeps claims split by a boundary retrievable.
      start = Math.max(start + 1, end - Math.min(200, Math.floor(size / 8)));
    }
  }
  if (!chunks.length) throw new Error("Document contains no indexable text");
  return chunks;
}

export function validateRelations(raw: unknown, chunks: SourceChunk[]): GroundedRelation[] {
  if (!Array.isArray(raw)) return [];
  const result: GroundedRelation[] = [];
  const seen = new Set<string>();
  for (const row of raw.slice(0, 100)) {
    if (!row || typeof row !== "object") continue;
    const value = row as Record<string, unknown>;
    const chunk = chunks.find((item) => item.position === value.chunkPosition);
    const name = typeof value.name === "string" ? normalizeText(value.name).slice(0, 400) : "";
    const quote = typeof value.quote === "string" ? normalizeText(value.quote) : "";
    const kind = String(value.kind ?? "");
    if (!chunk || !name || quote.length < 12 || quote.length > 1000 || !RELATION_KINDS.includes(kind as typeof RELATION_KINDS[number])) continue;
    // Keep the original source quote. LLM paraphrases are not provenance.
    if (!normalizeText(chunk.text).includes(quote)) continue;
    if (["USES_METHOD", "USES_DATASET", "STUDIES_CONCEPT"].includes(kind) && !quote.toLowerCase().includes(name.toLowerCase())) continue;
    const key = `${chunk.position}:${kind}:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ kind, name, quote, chunkPosition: chunk.position });
  }
  return result;
}

export function formatKnowledgeEvidence(evidence?: KnowledgeEvidence): string {
  if (!evidence) return "Source coverage: metadata/abstract only; no current full-text index is available.";
  return [
    `Source coverage: ${evidence.sourceKind === "abstract" ? "abstract only" : "PDF text (not images)"}.`,
    ...evidence.warnings.map((warning) => `Coverage limitation: ${sanitizeForPrompt(warning)}`),
    ...evidence.passages.map((passage) => [
      `Source chunk ${passage.id}${passage.pageNumber ? `, PDF page ${passage.pageNumber}` : ", abstract"}:`,
      sanitizeForPrompt(passage.text),
      ...passage.relations.map((relation) => `Grounded relation: ${sanitizeForPrompt(relation)}`),
    ].join("\n")),
  ].join("\n");
}
