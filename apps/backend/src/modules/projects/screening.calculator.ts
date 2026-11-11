import type { ScreeningChoice, ScreeningConsensusPolicy, ScreeningMetrics, ScreeningState, ScreeningSettings, ScreeningOutcome } from "@trend/shared-types";

/** Current two-reviewer workflows accept a paper in one round. Older protocols retain their frozen stage rules. */
export function automaticFullTextStage(settings: Pick<ScreeningSettings, "workflowVersion" | "reviewMode" | "stages" | "screeningMode">) {
  if (settings.screeningMode) return settings.screeningMode === "TWO_STAGE";
  return (settings.workflowVersion ?? 0) < 5 && settings.reviewMode !== "COLLABORATIVE" && Boolean(settings.stages?.includes("FULL_TEXT"));
}

export type EffectiveBallot = {
  reviewerId: string; roundId: string; decision: string; exclusionReason: string;
  revision?: number; scope?: string | null; fullTextReference?: string | null;
};
/** Protocol v11. Caller supplies only submitted, effective assignment revisions. */
export function evaluateScreeningPair(settings: Pick<ScreeningSettings, "screeningMode" | "workflowVersion" | "exclusionCriteria" | "workflowKind">, phase: string, ballots: readonly EffectiveBallot[], exclusionEvidenceAvailable = true): ScreeningOutcome {
  if (ballots.length === 0) return "WAITING_REVIEWS";
  if (ballots.length === 1) return "WAITING_SECOND_REVIEW";
  if (ballots.length !== 2 || ballots[0]!.reviewerId === ballots[1]!.reviewerId || ballots[0]!.roundId !== ballots[1]!.roundId || ballots.some(b => !["INCLUDE", "EXCLUDE", "UNSURE"].includes(b.decision) || b.scope && b.scope !== phase)) return "NEEDS_CLARIFICATION";
  const decisions = ballots.map(b => b.decision), has = (choice: string) => decisions.includes(choice);
  if (decisions.every(d => d === "EXCLUDE")) {
    if (!exclusionEvidenceAvailable || !settings.exclusionCriteria.length || ballots.some(b => !settings.exclusionCriteria.includes(b.exclusionReason.trim()) || phase === "FULL_TEXT" && !b.fullTextReference?.trim())) return "NEEDS_CLARIFICATION";
    if (phase === "FULL_TEXT" && differingExclusionReasons(ballots)) return "NEEDS_RESOLUTION";
    return "EXCLUDED";
  }
  if (settings.workflowKind === "TEAM_SCREENING") {
    if (has("UNSURE")) return "NEEDS_CLARIFICATION";
    return has("INCLUDE") && has("EXCLUDE") ? "CONFLICT" : "FINAL_INCLUDED";
  }
  if (settings.screeningMode === "TWO_STAGE" && phase === "TITLE_ABSTRACT") return has("EXCLUDE") ? "CONFLICT" : "ADVANCE_TO_FULLTEXT";
  if (has("UNSURE")) return phase !== "FULL_TEXT" && has("EXCLUDE") ? "NEEDS_RESOLUTION" : "NEEDS_CLARIFICATION";
  return has("INCLUDE") && has("EXCLUDE") ? "CONFLICT" : "FINAL_INCLUDED";
}

export function outcomeState(outcome: ScreeningOutcome): ScreeningState {
  return ({ WAITING_REVIEWS: "NOT_REVIEWED", WAITING_SECOND_REVIEW: "IN_REVIEW", FINAL_INCLUDED: "INCLUDED", EXCLUDED: "EXCLUDED", CONFLICT: "NEEDS_RESOLUTION", NEEDS_RESOLUTION: "NEEDS_RESOLUTION", NEEDS_CLARIFICATION: "NEEDS_MORE_INFO", ADVANCE_TO_FULLTEXT: "INCLUDED", WAITING_FULLTEXT: "WAITING_FULLTEXT", CLOSED_UNRESOLVED: "CLOSED_UNRESOLVED" } as const)[outcome];
}

/** Only a complete, distinct pair from one round can carry a disagreement. */
export function classifyScreeningPair(reviews: readonly { reviewerId: string; roundId: string; decision: string; exclusionReason: string }[], phase: string, requirePrimaryReason = true) {
  if (reviews.length !== 2 || reviews[0]!.reviewerId === reviews[1]!.reviewerId || reviews[0]!.roundId !== reviews[1]!.roundId) return null;
  const decisions = reviews.map(r => r.decision);
  if (decisions.some(d => !["INCLUDE", "EXCLUDE", "UNSURE"].includes(d))) return null;
  if (decisions.every(d => d === "UNSURE")) return "NEEDS_MORE_INFORMATION" as const;
  if (decisions.includes("UNSURE")) return "NEEDS_CLARIFICATION" as const;
  if (decisions.every(d => d === "INCLUDE")) return "AGREEMENT_INCLUDE" as const;
  if (decisions.every(d => d === "EXCLUDE")) return phase === "FULL_TEXT" && requirePrimaryReason && differingExclusionReasons(reviews) ? "EXCLUSION_REASON_MISMATCH" as const : "AGREEMENT_EXCLUDE" as const;
  return "CONFLICT" as const;
}

export function screeningConsensus(decisions: ScreeningChoice[], assigned: number, required: number, policy: ScreeningConsensusPolicy): ScreeningState {
  if (assigned < required || decisions.length < assigned) return decisions.length ? "IN_REVIEW" : "NOT_REVIEWED";
  const include = decisions.filter(d => d === "INCLUDE").length, exclude = decisions.filter(d => d === "EXCLUDE").length;
  const threshold = policy === "UNANIMOUS" ? assigned : Math.floor(assigned / 2) + 1;
  return include >= threshold ? "INCLUDED" : exclude >= threshold ? "EXCLUDED" : "NEEDS_RESOLUTION";
}

/** Matching exclusion votes can still disagree on the full-text exclusion reason. */
export function differingExclusionReasons(reviews: readonly { decision: string; exclusionReason: string }[]) {
  return reviews.length >= 2 && reviews.every(r => r.decision === "EXCLUDE") &&
    new Set(reviews.map(r => r.exclusionReason.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en"))).size > 1;
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
export function balancedReviewers(eligible: string[], existing: string[], required: number, loads: Map<string, { pending: number; total: number }>, proposerId?: string | null) {
  const selected = new Set(existing);
  const otherEligible = proposerId ? eligible.filter(id => id !== proposerId) : eligible;
  const candidatePool = (proposerId && otherEligible.length >= required) ? otherEligible : eligible;
  while (selected.size < required) {
    const next = candidatePool.filter(id => !selected.has(id)).sort((a, b) => {
      const x = loads.get(a) ?? { pending: 0, total: 0 }, y = loads.get(b) ?? { pending: 0, total: 0 };
      return Number(a === proposerId) - Number(b === proposerId) || x.pending - y.pending || x.total - y.total || a.localeCompare(b);
    })[0];
    if (!next) break;
    selected.add(next); const load = loads.get(next) ?? { pending: 0, total: 0 }; loads.set(next, { pending: load.pending + 1, total: load.total + 1 });
  }
  return [...selected];
}
export const independentWorkflow = (settings: { reviewMode?: string; workflowVersion?: number; workflowKind?: string }) =>
  settings.workflowKind === "TEAM_SCREENING" ||
  (settings.reviewMode === "INDEPENDENT" && (settings.workflowVersion ?? 1) >= 3) ||
  (settings.reviewMode === "SIMPLE" && (settings.workflowVersion ?? 1) >= 5);
