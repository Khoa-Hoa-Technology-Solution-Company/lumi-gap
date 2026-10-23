import { BUDGET_RESERVE_FRACTION } from "./trend.openalex-client.js";

/**
 * Credit budget of a trend collection run (P2.1). Pure, no I/O.
 *
 * Two limits, both checked before every page:
 * 1. Collection cap: trend collection may spend at most `collectionFraction`
 *    (30%, approved plan §P2.0) of the key's daily limit per UTC day, counting
 *    every collection run of that day (credits recorded in trend_snapshot_pages).
 * 2. Key reserve: never take the key below BUDGET_RESERVE_FRACTION (20%) of its
 *    limit, the same reserve the interactive trends client keeps for sync and
 *    ingest. Uses the real `Remaining` of the key, so credits other processes
 *    sharing the key spent are respected.
 */
export interface CollectionBudgetInput {
  /** Key's daily limit in credits (X-RateLimit-Limit / credits_limit). */
  creditsLimit: number;
  /** Credits left on the key now (all processes). */
  creditsRemaining: number;
  /** Credits trend collection already spent today (all runs). */
  collectionCreditsToday: number;
  collectionFraction: number;
}

export interface CollectionBudget {
  collectionCap: number;
  reserve: number;
  /** Credits this run may still spend. */
  allowed: number;
  /** Which limit binds when allowed is 0. */
  limitedBy: "collection_cap" | "key_reserve" | null;
}

export function collectionBudget(input: CollectionBudgetInput): CollectionBudget {
  const collectionCap = Math.floor(input.collectionFraction * input.creditsLimit);
  const reserve = Math.ceil(BUDGET_RESERVE_FRACTION * input.creditsLimit);
  const byCap = collectionCap - input.collectionCreditsToday;
  const byReserve = input.creditsRemaining - reserve;
  const allowed = Math.max(0, Math.min(byCap, byReserve));
  return { collectionCap, reserve, allowed, limitedBy: allowed > 0 ? null : byCap <= byReserve ? "collection_cap" : "key_reserve" };
}

/** Tracks a run's budget page by page with the real headers of each answer. */
export class CollectionBudgetTracker {
  private spent = 0;
  private remaining: number;

  constructor(private readonly input: CollectionBudgetInput) {
    this.remaining = input.creditsRemaining;
  }

  /** Whether one more page (1 credit for a list/group_by call) fits. */
  canSpend(credits = 1): boolean {
    return this.current().allowed >= credits;
  }

  /** Record one answer: credits it cost and the key's Remaining after it. */
  record(creditsUsed: number | null, remaining: number | null): void {
    const cost = creditsUsed ?? 1;
    this.spent += cost;
    this.remaining = remaining ?? this.remaining - cost;
  }

  current(): CollectionBudget {
    return collectionBudget({ ...this.input, creditsRemaining: this.remaining, collectionCreditsToday: this.input.collectionCreditsToday + this.spent });
  }

  get creditsSpent(): number {
    return this.spent;
  }
}
