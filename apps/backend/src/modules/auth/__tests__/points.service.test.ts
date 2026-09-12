import { describe, expect, it } from "vitest";
import {
  computeRankingPoints,
  resolveDownloadCost,
  RATING_POINTS,
  REQUEST_PAPER_COST,
  REDOWNLOAD_COST,
} from "../points.service.js";
import { UserModel } from "../models/user.model.js";
import { env } from "../../../config/env.js";

/**
 * Pure money-logic tests. The DB-bound functions (charge/refund/clawback and the
 * aggregation in syncUserPoints) rely on Mongo's atomic operators and are not
 * unit-tested here — the repo has no in-memory Mongo, and those guarantees
 * (e.g. `credits: { $gte }` check-and-charge, the `uploadRewardedAt` clawback
 * flag) live at the DB layer. What IS unit-testable is the points formula and
 * the download-cost rule, extracted here as pure functions.
 */

describe("computeRankingPoints", () => {
  it("sums uploadCreditReward + ratingsGiven*RATING_POINTS - penaltyPoints", () => {
    expect(
      computeRankingPoints({ uploadCreditReward: 100, ratingsGiven: 3, penaltyPoints: 10 }),
    ).toBe(100 + 3 * RATING_POINTS - 10);
  });

  it("floors at 0 — a penalty can never push points negative", () => {
    expect(
      computeRankingPoints({ uploadCreditReward: 0, ratingsGiven: 0, penaltyPoints: 50 }),
    ).toBe(0);
  });

  it("is 0 for a brand-new user (no uploads, ratings, penalties)", () => {
    expect(
      computeRankingPoints({ uploadCreditReward: 0, ratingsGiven: 0, penaltyPoints: 0 }),
    ).toBe(0);
  });

  it("credits exactly RATING_POINTS per rating given", () => {
    expect(
      computeRankingPoints({ uploadCreditReward: 0, ratingsGiven: 4, penaltyPoints: 0 }),
    ).toBe(4 * RATING_POINTS);
  });
});

describe("resolveDownloadCost", () => {
  it("charges the paper's tier cost on the first download", () => {
    expect(resolveDownloadCost({ downloadCost: 30 }, false)).toBe(30);
  });

  it("charges the flat REDOWNLOAD_COST on a repeat download (ignores tier cost)", () => {
    expect(resolveDownloadCost({ downloadCost: 30 }, true)).toBe(REDOWNLOAD_COST);
  });

  it("charges 0 on a first download when the paper has no tier cost", () => {
    expect(resolveDownloadCost({ downloadCost: null }, false)).toBe(0);
    expect(resolveDownloadCost({}, false)).toBe(0);
  });
});

describe("economy constants (guard against accidental change)", () => {
  it("matches the agreed economy", () => {
    expect(REQUEST_PAPER_COST).toBe(100);
    expect(REDOWNLOAD_COST).toBe(5);
    expect(RATING_POINTS).toBe(5);
  });
});

describe("UserModel schema defaults", () => {
  it("defaults credits using env.INITIAL_USER_CREDITS", () => {
    const defaultFn = (UserModel.schema.path("credits") as any).defaultValue;
    expect(typeof defaultFn).toBe("function");
    expect(defaultFn()).toBe(env.INITIAL_USER_CREDITS);
  });
});

