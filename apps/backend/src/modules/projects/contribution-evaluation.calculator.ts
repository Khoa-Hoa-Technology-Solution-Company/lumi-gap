import type { EvaluationCalculation, EvaluationParticipation } from "@trend/shared-types";

export interface ScoredOutcome { outcomeKey: string; weight: number; participation: EvaluationParticipation[] }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Pure integer arithmetic. Callers establish evidence, source versions and authenticated consent. */
export function calculateContributionShares(roster: string[], outcomes: ScoredOutcome[]): EvaluationCalculation {
  roster = roster.map(id => id.toLowerCase());
  outcomes = outcomes.map(outcome => ({ ...outcome, participation: outcome.participation.map(person => ({ ...person, userId: person.userId.toLowerCase() })) }));
  if (roster.some(id => !uuid.test(id)) || new Set(roster).size !== roster.length) throw new Error("Invalid evaluation roster");
  if (new Set(outcomes.map(o => o.outcomeKey)).size !== outcomes.length) throw new Error("Duplicate outcome");
  const scores = [...roster].sort().map(userId => ({ userId, raw: 0n, basisPoints: 0, remainder: 0n, components: [] as EvaluationCalculation["scores"][number]["components"] }));
  const byId = new Map(scores.map(s => [s.userId, s]));
  for (const outcome of [...outcomes].sort((a, b) => a.outcomeKey < b.outcomeKey ? -1 : a.outcomeKey > b.outcomeKey ? 1 : 0)) {
    if (!outcome.outcomeKey || !Number.isInteger(outcome.weight) || outcome.weight < 1 || outcome.weight > 100) throw new Error("Invalid outcome weight");
    if (!outcome.participation.length || new Set(outcome.participation.map(p => p.userId)).size !== outcome.participation.length || outcome.participation.some(p => !byId.has(p.userId) || !Number.isInteger(p.basisPoints) || p.basisPoints < 0 || p.basisPoints > 10000) || outcome.participation.reduce((n, p) => n + p.basisPoints, 0) !== 10000) throw new Error("Invalid outcome participation");
    for (const person of outcome.participation) {
      const score = byId.get(person.userId)!;
      const raw = BigInt(outcome.weight) * BigInt(person.basisPoints);
      score.raw += raw;
      score.components.push({ outcomeKey: outcome.outcomeKey, weight: outcome.weight, participationBasisPoints: person.basisPoints, rawScore: String(raw) });
    }
  }
  const total = scores.reduce((n, s) => n + s.raw, 0n);
  if (total > 0n) {
    for (const score of scores) { const numerator = 10000n * score.raw; score.basisPoints = Number(numerator / total); score.remainder = numerator % total; }
    const remaining = 10000 - scores.reduce((n, s) => n + s.basisPoints, 0);
    const order = [...scores].filter(s => s.raw > 0n).sort((a, b) => a.remainder === b.remainder ? a.userId < b.userId ? -1 : 1 : a.remainder > b.remainder ? -1 : 1);
    for (let i = 0; i < remaining; i++) order[i]!.basisPoints++;
  }
  return { algorithmVersion: "WEIGHTED_CONFIRMED_V1", status: total ? "PROVISIONAL" : "INSUFFICIENT_DATA", totalRawScore: String(total), scores: scores.map(s => ({ userId: s.userId, rawScore: String(s.raw), basisPoints: total ? s.basisPoints : null, components: s.components })) };
}
