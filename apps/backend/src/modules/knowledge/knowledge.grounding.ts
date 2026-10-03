import type { KnowledgeEvidence } from "./knowledge.types.js";

export function assertSourceLocators(text: string, papers: Array<{ knowledgeEvidence?: KnowledgeEvidence }>): void {
  const allowed = new Set(papers.flatMap((paper) => paper.knowledgeEvidence?.passages.map((passage) => passage.id.toLowerCase()) ?? []));
  const pattern = /\bchunk(?:\s+id)?[\s:`#]*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi;
  for (const match of text.matchAll(pattern)) {
    if (!allowed.has(match[1]!.toLowerCase())) throw new Error("Generated analysis cites a source chunk outside its evidence pack");
  }
}

export function assertGapReferences(gaps: Array<{ rationale: string; description: string; supportingEvidence: number[] }>, papers: Array<{ knowledgeEvidence?: KnowledgeEvidence }>): void {
  for (const gap of gaps) {
    if (!gap || typeof gap.rationale !== "string" || typeof gap.description !== "string" || !Array.isArray(gap.supportingEvidence) || !gap.supportingEvidence.length || gap.supportingEvidence.some((index) => !Number.isInteger(index) || index < 1 || index > papers.length)) throw new Error("Research gap must cite valid papers from its evidence pack");
    assertSourceLocators(`${gap.rationale}\n${gap.description}`, gap.supportingEvidence.map((index) => papers[index - 1]!));
  }
}
