// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DetectedTag, SearchUnderstanding } from "@trend/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchUnderstandingBar } from "../components/search-understanding-bar";
import { homeSearchRequest, homeTagFilter, withAutoTagsOff, withAutoTagsOn, withoutTagFilter, withTagFilter } from "../utils/home-search";

vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string, values?: Record<string, unknown>) => key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values?.[name] ?? "")) }) }));

const tag = (overrides: Partial<DetectedTag> = {}): DetectedTag => ({
  kind: "topic", id: "uuid-1", openalexId: "T10028", name: "Topic modelling", paperCount: 1234, confidence: 0.9, source: "name", matchedText: "topic modelling",
  filter: { key: "topicIds", value: "T10028" }, ...overrides,
});
const understanding = (overrides: Partial<SearchUnderstanding> = {}): SearchUnderstanding => ({ mode: "none", detectedTags: [], appliedTag: null, fellBack: false, ...overrides });

describe("query understanding URL helpers", () => {
  it("maps tag and autoTags onto the semantic request", () => {
    const { request } = homeSearchRequest(new URLSearchParams("q=lda&tag=topicIds:T10028&tagLabel=Topic%20modelling&autoTags=false&topicIds=T1"));
    expect(request.topicIds).toEqual(["T1", "T10028"]);
    expect(request.autoTags).toBe(false);
    expect(homeSearchRequest(new URLSearchParams("q=lda&tag=keywordIds:abc:def")).request.keywordIds).toEqual(["abc:def"]);
    expect(homeSearchRequest(new URLSearchParams("q=lda&keywordIds=k1,k2")).request.keywordIds).toEqual(["k1", "k2"]);
    expect(homeSearchRequest(new URLSearchParams("q=lda")).request.autoTags).toBeUndefined();
  });
  it("ignores unknown tag keys, empty values and keyword mode", () => {
    for (const tagValue of ["bogus:1", "topicIds:", "topicIds", ":x", "journalIds:1"]) {
      const { request } = homeSearchRequest(new URLSearchParams({ q: "lda", tag: tagValue }));
      expect(request.topicIds).toBeUndefined();
      expect(homeTagFilter(new URLSearchParams({ tag: tagValue }))).toBeNull();
    }
    const keyword = homeSearchRequest(new URLSearchParams("q=lda&mode=keyword&tag=topicIds:T1&autoTags=false"));
    expect(keyword.request.topicIds).toBeUndefined();
    expect(keyword.request.autoTags).toBeUndefined();
  });
  it("sets, clears and toggles the tag state and always resets the page", () => {
    const base = new URLSearchParams("q=lda&page=4");
    const pinned = withTagFilter(base, { key: "subfieldIds", value: "1702", label: "Artificial Intelligence" });
    expect(pinned.get("tag")).toBe("subfieldIds:1702");
    expect(pinned.get("tagLabel")).toBe("Artificial Intelligence");
    expect(pinned.has("page")).toBe(false);
    expect(homeTagFilter(pinned)).toEqual({ key: "subfieldIds", value: "1702", label: "Artificial Intelligence" });
    const cleared = withoutTagFilter(new URLSearchParams("q=lda&page=2&tag=topicIds:T1&tagLabel=X"));
    expect([...cleared.keys()]).toEqual(["q"]);
    const off = withAutoTagsOff(new URLSearchParams("q=lda&page=3"));
    expect(off.get("autoTags")).toBe("false");
    expect(off.has("page")).toBe(false);
    const on = withAutoTagsOn(new URLSearchParams("q=lda&autoTags=false&page=3"));
    expect([...on.keys()]).toEqual(["q"]);
    expect(withTagFilter(new URLSearchParams("q=lda&autoTags=false"), { key: "topicIds", value: "T1", label: "A" }).has("autoTags")).toBe(false);
  });
});

describe("SearchUnderstandingBar", () => {
  let root: Root, container: HTMLDivElement, current: URLSearchParams;
  beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  function Harness({ initial, value }: { initial: string; value: SearchUnderstanding | undefined }) {
    const [params, setParams] = useState(() => new URLSearchParams(initial));
    current = params;
    return <SearchUnderstandingBar understanding={value} searchParams={params} onChange={setParams} />;
  }
  const show = (initial: string, value?: SearchUnderstanding) => act(async () => root.render(<Harness key={initial} initial={initial} value={value} />));
  const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

  it("filter mode shows the applied tag with count and removing it turns auto detection off", async () => {
    await show("q=lda&page=2", understanding({ mode: "filter", detectedTags: [tag()], appliedTag: tag() }));
    expect(container.textContent).toContain("Showing papers in Topic modelling (1,234 papers)");
    expect(container.textContent).toContain("Detected from your query");
    await act(async () => button("Search all papers instead").click());
    expect(current.get("autoTags")).toBe("false");
    expect(current.has("page")).toBe(false);
    expect(container.textContent).not.toContain("Showing papers in");
    expect(container.textContent).toContain("Detect topic again");
    await act(async () => Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Detect topic again")!.click());
    expect(current.has("autoTags")).toBe(false);
  });
  it("boost mode lists at most five chips with kind labels and a click pins the tag", async () => {
    const tags = Array.from({ length: 7 }, (_, index) => tag({ id: `id-${index}`, name: `Tag ${index}`, kind: index === 1 ? "keyword" : "subfield", filter: { key: index === 1 ? "keywordIds" : "subfieldIds", value: `v${index}` } }));
    await show("q=lda", understanding({ mode: "boost", detectedTags: tags }));
    expect(container.textContent).toContain("Related topics:");
    expect(container.querySelectorAll("li button")).toHaveLength(5);
    expect(container.querySelector("li button")!.textContent).toContain("Research subfield");
    expect(container.textContent).not.toContain("Too few papers");
    await act(async () => button("Filter results by Keyword: Tag 1").click());
    expect(current.get("tag")).toBe("keywordIds:v1");
    expect(current.get("tagLabel")).toBe("Tag 1");
    expect(container.textContent).toContain("Filtered by keyword: Tag 1");
    await act(async () => button("Remove filter: Tag 1").click());
    expect(current.has("tag")).toBe(false);
    expect(current.has("tagLabel")).toBe(false);
  });
  it("explains a fallback", async () => {
    await show("q=lda", understanding({ mode: "boost", fellBack: true, detectedTags: [tag()] }));
    expect(container.textContent).toContain("Too few papers in Topic modelling, showing broader results.");
  });
  it("a pinned tag wins over the response and renders from the URL alone", async () => {
    await show("q=lda&tag=topicIds:T1&tagLabel=Graphs", understanding({ mode: "filter", appliedTag: tag(), detectedTags: [tag()] }));
    expect(container.textContent).toContain("Filtered by topic: Graphs");
    expect(container.textContent).not.toContain("Showing papers in");
    await show("q=lda&tag=fieldIds:17&tagLabel=Physics", undefined);
    expect(container.textContent).toContain("Filtered by field: Physics");
    expect(button("Remove filter: Physics").className).toContain("search-understanding-remove");
  });
  it("renders nothing for mode none or while loading", async () => {
    await show("q=lda", understanding());
    expect(container.innerHTML).toBe("");
    await show("q=lda&x=1", undefined);
    expect(container.innerHTML).toBe("");
  });
});
