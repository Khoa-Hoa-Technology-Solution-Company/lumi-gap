/**
 * Maximal Marginal Relevance (Carbonell & Goldstein 1998) for the gap evidence pack. PURE — no I/O.
 *
 * A gap analysis reads only a handful of papers. Taking the top hits of one query tends to return near-duplicates
 * of one narrow branch, and the gaps then describe that branch. MMR picks each next paper by
 *   lambda * relevance(d) - (1 - lambda) * max similarity(d, already picked)
 * so the pack stays on topic but spreads across the topic.
 *
 * relevance is the retrieval score (0..1, (1 + cosine) / 2 for embedded papers); similarity between papers is
 * (1 + cosine) / 2 too, so both terms share one scale. A paper without an embedding has similarity 0 to the others.
 */

export interface MmrCandidate {
  id: string;
  /** Retrieval score, 0..1. */
  relevance: number;
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; na += a[i]! * a[i]!; nb += b[i]! * b[i]!; }
  const denominator = Math.sqrt(na) * Math.sqrt(nb);
  return denominator > 0 && Number.isFinite(denominator) && Number.isFinite(dot)
    ? Math.max(-1, Math.min(1, dot / denominator)) : 0;
}

/**
 * Picks `k` candidates by MMR, starting from `pinned` (papers the user chose, already in the pack: they count as
 * picked but are not returned). Ties keep the input (retrieval) order. Returns the picked candidates in pick order.
 * Each ID is returned once. Invalid embeddings act like missing embeddings; invalid relevance is zero.
 * Maintains each candidate's maximum redundancy, comparing only against the newest pick: O(n*k*d),
 * plus O(n*p*d) for p pinned papers, instead of recomputing all previous comparisons at every step.
 */
export function selectByMmr<T extends MmrCandidate>(candidates: T[], vectors: ReadonlyMap<string, readonly number[]>, k: number, lambda: number, pinned: readonly string[] = []): T[] {
  if (!Number.isInteger(k) || k < 0) throw new RangeError("MMR k must be a non-negative integer");
  if (!Number.isFinite(lambda) || lambda < 0 || lambda > 1) throw new RangeError("MMR lambda must be in [0, 1]");
  if (k === 0 || !candidates.length) return [];
  const seen = new Set(pinned);
  const pool = candidates.filter((candidate) => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  }).map((candidate) => ({ candidate, redundancy: 0 }));
  const usableVectors = new Map<string, readonly number[]>();
  for (const id of seen) {
    const vector = vectors.get(id);
    if (vector?.length && vector.every(Number.isFinite) && vector.some((value) => value !== 0)) {
      usableVectors.set(id, vector);
    }
  }
  const similarity = (a: string, b: string) => {
    const va = usableVectors.get(a), vb = usableVectors.get(b);
    return va && vb && va.length === vb.length ? (1 + cosine(va, vb)) / 2 : 0;
  };
  const updateRedundancy = (id: string) => {
    for (const entry of pool) entry.redundancy = Math.max(entry.redundancy, similarity(entry.candidate.id, id));
  };
  if (lambda < 1) for (const id of new Set(pinned)) updateRedundancy(id);
  const result: T[] = [];
  while (result.length < k && pool.length) {
    let best = 0, bestScore = -Infinity;
    pool.forEach(({ candidate, redundancy }, index) => {
      const relevance = Number.isFinite(candidate.relevance) ? Math.max(0, Math.min(1, candidate.relevance)) : 0;
      const score = lambda * relevance - (1 - lambda) * redundancy;
      if (score > bestScore) { bestScore = score; best = index; }
    });
    const [chosen] = pool.splice(best, 1);
    result.push(chosen!.candidate);
    if (lambda < 1 && result.length < k) updateRedundancy(chosen!.candidate.id);
  }
  return result;
}
