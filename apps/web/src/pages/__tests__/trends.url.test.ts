import { describe, expect, it } from "vitest";
import { DEFAULT_TREND_SORT, DEFAULT_TREND_YEAR_FROM, DEFAULT_TREND_YEAR_TO } from "../trends.insights";
import { parseSizeBands } from "../../features/trends/cross-topic";
import { buildTrendsPageParams, DEFAULT_TREND_MIN_PAPERS, parseTrendTab, TREND_TAB_IDS, type TrendsPageUrlState } from "../trends.url";

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
  paperKinds: [], openAccessStatuses: [], providers: [], sources: [], languages: [], citationBands: [], sizeBands: [],
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

  it("keeps the focus topic's OpenAlex id only while that topic is focused", () => {
    expect(build({ activeTab: "ai", focusTopic: "Topic Modeling", focusTopicId: "T10028" })).toBe("tab=ai&focus=Topic+Modeling&focusTopicId=T10028");
    expect(build({ activeTab: "ai", focusTopic: "", focusTopicId: "T10028" })).toBe("tab=ai");
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

  it("keeps the size groups in the URL and reads them back", () => {
    expect(build({ sizeBands: ["small", "large"] })).toBe("sizeBands=small%2Clarge");
    expect(parseSizeBands(new URLSearchParams(build({ sizeBands: ["small", "large"] })).get("sizeBands"))).toEqual(["small", "large"]);
  });
});

describe("trends page tabs", () => {
  it("round-trips the emerging tab through the URL", () => {
    const params = buildTrendsPageParams({ ...DEFAULTS, activeTab: "emerging" });
    expect(params.toString()).toBe("tab=emerging");
    expect(parseTrendTab(params.get("tab"))).toBe("emerging");
  });

  it("round-trips every tab, leaving the overview out of the URL", () => {
    for (const tab of TREND_TAB_IDS) {
      const params = buildTrendsPageParams({ ...DEFAULTS, activeTab: tab });
      expect(params.get("tab")).toBe(tab === "overview" ? null : tab);
      expect(parseTrendTab(params.get("tab"))).toBe(tab);
    }
  });

  it("opens the overview for a missing or unknown tab and maps the old scope name", () => {
    expect(parseTrendTab(null)).toBe("overview");
    expect(parseTrendTab("nonsense")).toBe("overview");
    expect(parseTrendTab("scope")).toBe("dataset");
  });
});
