import type { ScreeningChoice, ScreeningConsensusPolicy, ScreeningMetrics, ScreeningState } from "@trend/shared-types";

export function screeningConsensus(decisions: ScreeningChoice[], assigned: number, required: number, policy: ScreeningConsensusPolicy): ScreeningState {
  if (assigned < required || decisions.length < assigned) return decisions.length ? "IN_REVIEW" : "NOT_REVIEWED";
  const include = decisions.filter(d => d === "INCLUDE").length, exclude = decisions.filter(d => d === "EXCLUDE").length;
  const threshold = policy === "UNANIMOUS" ? assigned : Math.floor(assigned / 2) + 1;
  return include >= threshold ? "INCLUDED" : exclude >= threshold ? "EXCLUDED" : "NEEDS_RESOLUTION";
}

export function cohenKappa(pairs: { reviewers: string[]; decisions: ScreeningChoice[] }[]): ScreeningMetrics["kappa"] {
  const empty = (reason: ScreeningMetrics["kappa"]["reason"]): ScreeningMetrics["kappa"] => ({ value: null, reason, papers: pairs.length, reviewerIds: [] });
  if (!pairs.length) return empty("NO_PAIRS");
  if (pairs.some(p => p.reviewers.length !== 2 || p.decisions.length !== 2)) return empty("MULTI_RATER");
  const normalized = pairs.map(p => p.reviewers.map((id, i) => ({ id, decision: p.decisions[i]! })).sort((a, b) => a.id.localeCompare(b.id)));
  const ids = normalized[0]!.map(p => p.id);
  if (ids[0] === ids[1] || normalized.some(p => p.some((r, i) => r.id !== ids[i]))) return empty("INCONSISTENT_PAIRS");
  const categories: ScreeningChoice[] = ["INCLUDE", "EXCLUDE", "UNSURE"];
  const observed = normalized.filter(p => p[0]!.decision === p[1]!.decision).length / pairs.length;
  const expected = categories.reduce((sum, category) => sum + normalized.filter(p => p[0]!.decision === category).length * normalized.filter(p => p[1]!.decision === category).length / (pairs.length * pairs.length), 0);
  if (Math.abs(1 - expected) < 1e-12) return { ...empty("DEGENERATE"), reviewerIds: ids };
  return { value: (observed - expected) / (1 - expected), reason: "OK", papers: pairs.length, reviewerIds: ids };
}

/** Stable greedy assignment minimizes pending work, then total assigned work. */
export function balancedReviewers(eligible: string[], existing: string[], required: number, loads: Map<string, { pending: number; total: number }>) {
  const selected = new Set(existing);
  while (selected.size < required) {
    const next = eligible.filter(id => !selected.has(id)).sort((a, b) => {
      const x = loads.get(a) ?? { pending: 0, total: 0 }, y = loads.get(b) ?? { pending: 0, total: 0 };
      return x.pending - y.pending || x.total - y.total || a.localeCompare(b);
    })[0];
    if (!next) break;
    selected.add(next); const load = loads.get(next) ?? { pending: 0, total: 0 }; loads.set(next, { pending: load.pending + 1, total: load.total + 1 });
  }
  return [...selected];
}
