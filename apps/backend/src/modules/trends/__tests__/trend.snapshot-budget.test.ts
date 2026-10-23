import { describe, expect, it } from "vitest";
import { collectionBudget, CollectionBudgetTracker } from "../trend.snapshot-budget.js";

describe("trend collection budget (P2.1)", () => {
  it("allows the smaller of the 30% collection cap and the 20% key reserve", () => {
    // Free key: 10 000. Cap 3 000, reserve 2 000.
    expect(collectionBudget({ creditsLimit: 10_000, creditsRemaining: 9_000, collectionCreditsToday: 0, collectionFraction: 0.3 })).toMatchObject({ collectionCap: 3000, reserve: 2000, allowed: 3000, limitedBy: null });
    // Other processes sharing the key already spent 7 500: the reserve binds.
    expect(collectionBudget({ creditsLimit: 10_000, creditsRemaining: 2_500, collectionCreditsToday: 0, collectionFraction: 0.3 }).allowed).toBe(500);
    // Trend collection already spent its cap today.
    expect(collectionBudget({ creditsLimit: 10_000, creditsRemaining: 9_000, collectionCreditsToday: 3_000, collectionFraction: 0.3 })).toMatchObject({ allowed: 0, limitedBy: "collection_cap" });
    expect(collectionBudget({ creditsLimit: 10_000, creditsRemaining: 1_999, collectionCreditsToday: 0, collectionFraction: 0.3 })).toMatchObject({ allowed: 0, limitedBy: "key_reserve" });
  });

  it("tracks real credits and Remaining page by page", () => {
    const t = new CollectionBudgetTracker({ creditsLimit: 1000, creditsRemaining: 203, collectionCreditsToday: 0, collectionFraction: 0.3 });
    expect(t.canSpend()).toBe(true);
    t.record(1, 202);
    t.record(1, 201);
    expect(t.canSpend()).toBe(true);
    // Another process spent credits meanwhile: the header shows it.
    t.record(1, 200);
    expect(t.canSpend()).toBe(false);
    expect(t.creditsSpent).toBe(3);
  });

  it("counts a page as 1 credit when the header is missing", () => {
    const t = new CollectionBudgetTracker({ creditsLimit: 10_000, creditsRemaining: 9_000, collectionCreditsToday: 2_998, collectionFraction: 0.3 });
    t.record(null, null);
    expect(t.canSpend()).toBe(true);
    t.record(null, null);
    expect(t.canSpend()).toBe(false);
  });
});
