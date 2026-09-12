import { describe, expect, it } from "vitest";
import { presentPaperDetail } from "../paper.presenter.js";

describe("presentPaperDetail", () => {
  it("normalizes encoded title markup at the public API boundary", () => {
    const paper = presentPaperDetail(
      {
        _id: "paper-1",
        title: "&lt;p&gt;AI &amp; Precision Medicine&lt;/p&gt;",
        dataStatus: "active",
      },
      { includeWorkflow: false },
    );

    expect(paper.title).toBe("AI & Precision Medicine");
  });
});
