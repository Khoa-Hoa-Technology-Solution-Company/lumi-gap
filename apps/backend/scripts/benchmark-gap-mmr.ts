/** Local CPU benchmark; no database, network or LLM calls. Run: pnpm --filter backend exec tsx scripts/benchmark-gap-mmr.ts */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { selectByMmr, type MmrCandidate } from "../src/modules/gaps/gap-mmr.js";

// Snapshot of the pre-optimization algorithm, retained to make measurements reproducible.
function baseline(candidates: MmrCandidate[], vectors: Map<string, number[]>, k: number, pinned: string[]): MmrCandidate[] {
  const cosine = (a: number[], b: number[]) => {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; na += a[i]! * a[i]!; nb += b[i]! * b[i]!; }
    return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
  };
  const similarity = (a: string, b: string) => (1 + cosine(vectors.get(a)!, vectors.get(b)!)) / 2;
  const pool = candidates.filter((row) => !pinned.includes(row.id));
  const picked = [...pinned];
  const result: MmrCandidate[] = [];
  while (result.length < k && pool.length) {
    let best = 0, bestScore = -Infinity;
    pool.forEach((row, i) => {
      const redundancy = picked.length ? Math.max(...picked.map((id) => similarity(row.id, id))) : 0;
      const score = 0.7 * row.relevance - 0.3 * redundancy;
      if (score > bestScore) { best = i; bestScore = score; }
    });
    const [chosen] = pool.splice(best, 1);
    result.push(chosen!); picked.push(chosen!.id);
  }
  return result;
}

let seed = 1729;
const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 2 ** 32);
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const round = (value: number) => Math.round(value * 100) / 100;
const results = [];
for (const [n, k] of [[100, 10], [500, 10], [500, 24]] as const) {
  const pinned = ["pinned-0", "pinned-1"];
  const pool = Array.from({ length: n }, (_, i) => ({ id: String(i), relevance: random() }));
  const vectors = new Map([...pool.map((row) => row.id), ...pinned].map((id) => [id, Array.from({ length: 768 }, () => random() * 2 - 1)]));
  const before = () => baseline(pool, vectors, k, pinned);
  const after = () => selectByMmr(pool, vectors, k, 0.7, pinned);
  assert.deepEqual(after(), before(), "Selected IDs and their order must match the original algorithm");
  const oldTimes: number[] = [], newTimes: number[] = [];
  for (let run = 0; run < 5; run++) {
    // Alternate order to reduce systematic warm-up/order effects.
    for (const [fn, times] of run % 2 ? [[after, newTimes], [before, oldTimes]] as const : [[before, oldTimes], [after, newTimes]] as const) {
      const start = performance.now(); fn(); times.push(performance.now() - start);
    }
  }
  const oldMs = median(oldTimes), newMs = median(newTimes);
  const oldPairs = Array.from({ length: k }, (_, i) => (n - i) * (pinned.length + i)).reduce((a, b) => a + b, 0);
  const newPairs = n * pinned.length + (k - 1) * n - k * (k - 1) / 2;
  results.push({ candidates: n, picks: k, dimensions: 768, pinned: pinned.length, repetitions: 5,
    baselineMedianMs: round(oldMs), optimizedMedianMs: round(newMs), speedup: round(oldMs / newMs),
    baselinePairComparisons: oldPairs, optimizedPairComparisons: newPairs, sameSelection: true });
}
console.log(JSON.stringify({ node: process.version, seed: 1729, lambda: 0.7, results }, null, 2));
