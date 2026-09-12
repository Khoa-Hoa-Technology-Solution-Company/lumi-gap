import { describe, expect, it } from "vitest";
import { getRisingKeywordTarget, getTopicTrendTarget } from "../trends.navigation";

describe("trends navigation", () => {
  it("sends rising keywords to search because topic detail only accepts topics", () => {
    expect(getRisingKeywordTarget("retrieval augmented generation")).toBe(
      "/search?q=retrieval%20augmented%20generation",
    );
  });

  it("sends topics to trend detail", () => {
    expect(getTopicTrendTarget("large language model")).toBe("/trends/large%20language%20model");
  });
});
