import { describe, expect, it } from "vitest";
import { getRisingKeywordTarget, getTopicActionTargets, getTopicTrendTarget } from "../trends.navigation";

describe("trends navigation", () => {
  it("sends rising keywords to the home search composer", () => {
    expect(getRisingKeywordTarget("retrieval augmented generation")).toBe(
      "/home?q=retrieval%20augmented%20generation",
    );
  });

  it("sends topics to trend detail", () => {
    expect(getTopicTrendTarget("large language model")).toBe("/trends/large%20language%20model");
  });

  it("keeps the OpenAlex topic id and year window on trend detail", () => {
    expect(getTopicTrendTarget("Graph Neural Networks", "T10012", { yearFrom: 2015, yearTo: 2025 })).toBe(
      "/trends/Graph%20Neural%20Networks?topicId=T10012&yearFrom=2015&yearTo=2025",
    );
  });

  it("carries topic and year window into the next research step", () => {
    const targets = getTopicActionTargets("graph learning", { yearFrom: 2018, yearTo: 2024 });
    expect(targets.trends).toBe("/trends?yearFrom=2018&yearTo=2024");
    expect(targets.search).toBe("/home?q=graph+learning&yearFrom=2018&yearTo=2024");
    expect(targets.gaps).toBe("/research-gaps?topic=graph+learning&yearFrom=2018&yearTo=2024");
    expect(targets.compare).toBe("/trends?tab=compare&compare=graph+learning&yearFrom=2018&yearTo=2024");
    expect(targets.report).toBe("/reports?topic=graph+learning&create=true&yearFrom=2018&yearTo=2024");
  });

  it("omits the window when the detail page was opened without one", () => {
    expect(getTopicActionTargets("nlp").trends).toBe("/trends");
  });
});
