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
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; na += a[i]! * a[i]!; nb += b[i]! * b[i]!; }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * Picks `k` candidates by MMR, starting from `pinned` (papers the user chose, already in the pack: they count as
 * picked but are not returned). Ties keep the input (retrieval) order. Returns the picked candidates in pick order.
 */
export function selectByMmr<T extends MmrCandidate>(candidates: T[], vectors: ReadonlyMap<string, readonly number[]>, k: number, lambda: number, pinned: readonly string[] = []): T[] {
  const similarity = (a: string, b: string) => { const va = vectors.get(a), vb = vectors.get(b); return va && vb ? (1 + cosine(va, vb)) / 2 : 0; };
  const picked: string[] = [...pinned];
  const pool = candidates.filter((candidate) => !pinned.includes(candidate.id));
  const result: T[] = [];
  while (result.length < k && pool.length) {
    let best = 0, bestScore = -Infinity;
    pool.forEach((candidate, index) => {
      const redundancy = picked.length ? Math.max(...picked.map((id) => similarity(candidate.id, id))) : 0;
      const score = lambda * candidate.relevance - (1 - lambda) * redundancy;
      if (score > bestScore) { bestScore = score; best = index; }
    });
    const [chosen] = pool.splice(best, 1);
    result.push(chosen!);
    picked.push(chosen!.id);
  }
  return result;
}
