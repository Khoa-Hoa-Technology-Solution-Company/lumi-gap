import { randomInt } from "node:crypto";

/** Unbiased selection from the server-filtered eligibility tier, never from client-provided IDs. */
export function selectCaseCandidate<T>(candidates: readonly T[]): T | null {
  return candidates.length ? candidates[randomInt(candidates.length)]! : null;
}
