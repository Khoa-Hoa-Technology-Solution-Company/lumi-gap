import { describe, expect, it } from "vitest";
import { assertGapReferences, assertSourceLocators } from "../knowledge.grounding.js";
const id = "00000000-0000-4000-8000-000000000001";
const papers = [{ knowledgeEvidence: { sourceKind: "uploaded_pdf", contentHash: "hash", warnings: [], passages: [{ id, pageNumber: 3, text: "Grounded finding", relations: [] }] } }];
describe("generated source references", () => {
  it("accepts actual chunk locators and rejects fabricated ones", () => {
    expect(() => assertSourceLocators(`PDF page 3, chunk ${id}`, papers)).not.toThrow();
    expect(() => assertSourceLocators(`chunk ${id.replace(/1$/, "2")}`, papers)).toThrow("outside its evidence pack");
  });
  it("requires actual supporting papers and validates locators against those papers", () => {
    const gap = { rationale: `chunk ${id}`, description: "Missing longitudinal work", supportingEvidence: [1] };
    expect(() => assertGapReferences([gap], papers)).not.toThrow();
    expect(() => assertGapReferences([{ ...gap, supportingEvidence: [] }], papers)).toThrow();
    expect(() => assertGapReferences([{ ...gap, supportingEvidence: [2] }], papers)).toThrow();
    expect(() => assertGapReferences([{ ...gap, supportingEvidence: [2] }], [...papers, {}])).toThrow("outside its evidence pack");
  });
});
