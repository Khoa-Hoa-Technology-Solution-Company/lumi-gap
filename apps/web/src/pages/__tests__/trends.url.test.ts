import { describe, expect, it } from "vitest";
import { DEFAULT_TREND_SORT, DEFAULT_TREND_YEAR_FROM, DEFAULT_TREND_YEAR_TO } from "../trends.insights";
import { buildTrendsPageParams, DEFAULT_TREND_MIN_PAPERS, type TrendsPageUrlState } from "../trends.url";

const DEFAULTS: TrendsPageUrlState = {
  yearFrom: DEFAULT_TREND_YEAR_FROM,
  yearTo: DEFAULT_TREND_YEAR_TO,
  sortBy: DEFAULT_TREND_SORT,
  minPapers: DEFAULT_TREND_MIN_PAPERS,
  activeTab: "overview",
  verdictFilter: "all",
  focusTopic: "",
  domains: [], fields: [], subfields: [], topicsFilter: [],
  domainIds: [], fieldIds: [], subfieldIds: [], topicIds: [],
  paperKinds: [], openAccessStatuses: [], providers: [], sources: [], languages: [], citationBands: [],
  selectedTopics: [],
};

const build = (state: Partial<TrendsPageUrlState>) => buildTrendsPageParams({ ...DEFAULTS, ...state }).toString();

describe("trends page URL", () => {
  it("is empty when every control is at its default", () => {
    expect(build({})).toBe("");
  });

  it("keeps the AI focus topic, so a reload or a shared link reopens the same explanation", () => {
    const params = buildTrendsPageParams({ ...DEFAULTS, activeTab: "ai", yearFrom: 2018, focusTopic: " Topic Modeling " });
    expect(params.get("tab")).toBe("ai");
    expect(params.get("focus")).toBe("Topic Modeling");
    expect(params.get("yearFrom")).toBe("2018");
  });

  it("leaves out an empty focus topic", () => {
    expect(build({ activeTab: "ai", focusTopic: "  " })).toBe("tab=ai");
  });

  it("writes the verdict only on the topics tab", () => {
    expect(build({ activeTab: "topics", verdictFilter: "rising" })).toBe("tab=topics&verdict=rising");
    expect(build({ activeTab: "compare", verdictFilter: "rising" })).toBe("tab=compare");
  });

  it("joins list filters and compared topics with commas", () => {
    expect(build({ fieldIds: ["17", "22"], topicsFilter: ["NLP"], citationBands: ["100-499"], selectedTopics: ["A", "B"], minPapers: 5 })).toBe(
      "minPapers=5&topicsFilter=NLP&fieldIds=17%2C22&citationBands=100-499&compare=A%2CB",
    );
  });
});
