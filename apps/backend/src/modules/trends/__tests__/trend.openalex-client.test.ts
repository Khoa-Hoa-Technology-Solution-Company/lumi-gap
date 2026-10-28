import { beforeEach, describe, expect, it } from "vitest";
import { isOpenAlexBudgetAvailable, resetOpenAlexBudget, trackBudget } from "../trend.openalex-client.js";

beforeEach(() => {
  resetOpenAlexBudget();
});

describe("trackBudget", () => {
  it("ignores responses without rate-limit headers (e.g. a 401)", () => {
    trackBudget(new Headers());
    expect(isOpenAlexBudgetAvailable()).toBe(true);
  });

  it("reserves 1000 credits under a large daily limit", () => {
    trackBudget(new Headers({ "x-ratelimit-limit": "100000", "x-ratelimit-remaining": "999", "x-ratelimit-reset": "60" }));
    expect(isOpenAlexBudgetAvailable()).toBe(false);
  });

  it("reserves a fifth of a small (keyless) daily limit", () => {
    trackBudget(new Headers({ "x-ratelimit-limit": "1000", "x-ratelimit-remaining": "999", "x-ratelimit-reset": "60" }));
    expect(isOpenAlexBudgetAvailable()).toBe(true);
    trackBudget(new Headers({ "x-ratelimit-limit": "1000", "x-ratelimit-remaining": "199", "x-ratelimit-reset": "60" }));
    expect(isOpenAlexBudgetAvailable()).toBe(false);
  });
});
