import { describe, expect, it, vi } from "vitest";

vi.mock("../../../infrastructure/queue.js", () => ({ gapsQueue: { add: vi.fn() } }));

import { buildCoverageItems, prepareDois } from "../coverage.service.js";
import { questionOutcome } from "../calibration.service.js";
import { clopperPearsonUpper } from "../closure.rules.js";

describe("prepareDois", () => {
  it("normalizes URLs and prefixes, lowercases and dedupes keeping the first position", () => {
    const { dois, invalid } = prepareDois(["https://doi.org/10.1000/ABC", "doi:10.1000/abc", "10.2000/xyz", " 10.1000/ABC "]);
    expect(dois).toEqual(["10.1000/abc", "10.2000/xyz"]);
    expect(invalid).toEqual([]);
  });

  it("lists invalid values, including DOIs OpenAlex cannot filter on", () => {
    const { dois, invalid } = prepareDois(["10.1000/ok", "not a doi", "10.1000/a,b", "10.1000/a|b", "10.12/short"]);
    expect(dois).toEqual(["10.1000/ok"]);
    expect(invalid).toEqual(["not a doi", "10.1000/a,b", "10.1000/a|b", "10.12/short"]);
  });
});

describe("buildCoverageItems", () => {
  it("counts x as the DOIs found in neither source", () => {
    const dois = ["10.1/a", "10.1/b", "10.1/c", "10.1/d"];
    const { items, m, x } = buildCoverageItems(dois, {
      local: new Map([["10.1/a", { paperId: "p1", openalexId: "W1", title: "A" }]]),
      openalex: new Map([
        ["10.1/b", { openalexId: "W2", title: "B" }],
        ["10.1/a", { openalexId: "W9", title: "A remote" }],
      ]),
    });
    expect(m).toBe(4);
    expect(x).toBe(2);
    expect(items.map((item) => [item.doi, item.foundLocal, item.foundOpenAlex])).toEqual([
      ["10.1/a", true, true],
      ["10.1/b", false, true],
      ["10.1/c", false, false],
      ["10.1/d", false, false],
    ]);
    expect(items[0]).toMatchObject({ paperId: "p1", title: "A", openalexId: "W9" });
    expect(items[2]).toMatchObject({ paperId: null, openalexId: null, title: null });
  });

  it("feeds the Clopper-Pearson bound the protocol documents (x = 0, m = 50, delta = 0.05)", () => {
    expect(clopperPearsonUpper(0, 50, 0.05)).toBeCloseTo(0.0582, 3);
  });
});

describe("questionOutcome", () => {
  const unrelated = { id: "d1", aiLabel: "UNRELATED", aiQuoteVerified: false, humanLabel: null };
  const answers = { id: "d2", aiLabel: "ANSWERS", aiQuoteVerified: true, humanLabel: null };

  it("never counts an unsettled or failed check as a miss", () => {
    for (const checkStatus of [undefined, null, "QUEUED", "SEARCHING", "FAILED"]) {
      expect(questionOutcome({ checkStatus, documents: [], searchErrors: 0, judgeKind: "AI" })).toBe("PENDING");
    }
  });

  it("FOUND when a document answers, MISSED when everything is screened and nothing answers", () => {
    expect(questionOutcome({ checkStatus: "SCREENING", documents: [unrelated, answers], searchErrors: 0, judgeKind: "AI" })).toBe("FOUND");
    expect(questionOutcome({ checkStatus: "SCREENING", documents: [unrelated], searchErrors: 0, judgeKind: "AI" })).toBe("MISSED");
  });

  it("a failed query or an unlabelled document keeps the question pending", () => {
    expect(questionOutcome({ checkStatus: "SCREENING", documents: [unrelated], searchErrors: 1, judgeKind: "AI" })).toBe("PENDING");
    expect(questionOutcome({ checkStatus: "SCREENING", documents: [{ id: "d3", aiLabel: null }], searchErrors: 0, judgeKind: "AI" })).toBe("PENDING");
  });

  it("a HUMAN calibration waits until a person labelled every document", () => {
    expect(questionOutcome({ checkStatus: "SCREENING", documents: [unrelated], searchErrors: 0, judgeKind: "HUMAN" })).toBe("PENDING");
    expect(questionOutcome({ checkStatus: "DECIDED", documents: [{ ...unrelated, humanLabel: "UNRELATED" }], searchErrors: 0, judgeKind: "HUMAN" })).toBe("MISSED");
  });
});
