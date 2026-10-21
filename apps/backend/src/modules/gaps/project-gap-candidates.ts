import { z } from "zod";
import type { DiscoveryPaperResult } from "@trend/shared-types";

const text = (max: number, min = 10) => z.string().trim().min(min).max(max);
const candidate = z.object({
  title: text(200, 5), description: text(5000), rationale: text(5000),
  suggestedResearchQuestion: text(2000), observedLimitation: text(5000),
  missingEvidence: text(5000), scope: text(2000, 3), assumptions: text(5000),
  supportingEvidence: z.array(z.number().int().positive()).min(1).max(10),
  sourceAnchors: z.array(z.object({ paperNumber: z.number().int().positive(), chunkId: text(100, 1), quote: text(1600, 12) }).strict()).min(1).max(20),
  confidence: z.number().optional(),
  probe: z.object({ topicA: text(200, 1), topicB: text(200, 1), yearFrom: z.number().int().optional(), yearTo: z.number().int().optional() }).optional(),
});
export type DiscoveryCandidate = Omit<z.infer<typeof candidate>, "confidence"> & { confidence: number };
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

/** Structural/source checks, not scientific validation. Never manufacture a replacement citation. */
export function groundedDiscoveryCandidates(raw: unknown, papers: Array<Pick<DiscoveryPaperResult, "passages">>): DiscoveryCandidate[] {
  const output = z.object({ gaps: z.array(z.unknown()).max(20) }).parse(raw);
  const seen = new Set<string>();
  let structured = 0;
  const grounded = output.gaps.flatMap(value => {
    const parsed = candidate.safeParse(value);
    if (!parsed.success) return [];
    structured++;
    const gap = parsed.data, support = new Set(gap.supportingEvidence);
    if (support.size !== gap.supportingEvidence.length || [...support].some(n => n > papers.length)) return [];
    if (gap.sourceAnchors.some(anchor => !support.has(anchor.paperNumber) || !papers[anchor.paperNumber - 1]?.passages.some(passage => passage.id === anchor.chunkId && normalize(passage.text).includes(normalize(anchor.quote))))) return [];
    if ([...support].some(n => !gap.sourceAnchors.some(anchor => anchor.paperNumber === n) || !gap.rationale.includes(`[${n}]`))) return [];
    const title = normalize(gap.title).toLocaleLowerCase();
    if (seen.has(title)) return [];
    seen.add(title);
    return [{ ...gap, confidence: 0 }];
  }).slice(0, 5);
  if (output.gaps.length && !structured) throw new Error("AI returned no structured research directions");
  return grounded;
}
