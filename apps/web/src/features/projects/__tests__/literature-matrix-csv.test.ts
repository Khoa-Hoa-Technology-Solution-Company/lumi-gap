import { describe, expect, it } from "vitest";
import type { LiteratureMatrix } from "@trend/shared-types";
import { csvCell, matrixToCsv } from "../literature-matrix-csv";

describe("literature matrix CSV", () => {
  it("quotes cells and doubles inner quotes", () => {
    expect(csvCell('He said "hi", then left')).toBe('"He said ""hi"", then left"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(2024)).toBe('"2024"');
  });
  it("neutralises values a spreadsheet would run as formulas", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+1")).toBe('"\'+1"');
    expect(csvCell("-1.2% accuracy")).toBe('"\'-1.2% accuracy"');
    expect(csvCell("@cmd")).toBe('"\'@cmd"');
  });
  it("writes built-in and custom columns with a BOM and CRLF lines", () => {
    const matrix: Pick<LiteratureMatrix, "criteria" | "rows"> = {
      criteria: [{ id: "c1", label: "Bộ dữ liệu", description: "", position: 0, version: 1, createdById: "u", createdAt: "", updatedAt: "" }],
      rows: [{
        evidenceId: "e1", evidenceVersion: 2, paperId: "p1", paperTitle: "Nén mô hình OCR", doi: "10.1/x", publicationYear: 2024,
        methodology: "CNN", population: "UIT-HWDB", claim: "Giữ độ chính xác", results: "97%", limitations: "Chỉ chữ in",
        themes: ["ocr", "mobile"], criteriaValues: { c1: "UIT-HWDB" }, reviewState: "ACCEPTED", verificationStatus: "VERIFIED",
        sourceScope: "ABSTRACT", origin: "HUMAN", limitationIds: [],
      }],
    };
    const csv = matrixToCsv(matrix);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [header, row] = csv.slice(1).trimEnd().split("\r\n");
    expect(header).toContain('"Bộ dữ liệu"');
    expect(header?.split(",")).toHaveLength(11);
    expect(row).toBe('"Nén mô hình OCR","2024","10.1/x","CNN","UIT-HWDB","Giữ độ chính xác","97%","Chỉ chữ in","UIT-HWDB","ocr; mobile","VERIFIED"');
  });
});
