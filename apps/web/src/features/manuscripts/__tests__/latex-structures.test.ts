import { describe, expect, it } from "vitest";
import { equationBody, parseTable, serializeTable, structureAt } from "../latex-structures";

describe("structured LaTeX editing", () => {
  it("round-trips cells while escaping special characters instead of executing commands", () => {
    const table = { align: "lr", rows: [["50% & $10", "{x}_^~\\"], ["\\input{private}", "<script>"]] };
    const source = serializeTable(table);
    expect(source).toContain("50\\% \\& \\$10");
    expect(source).not.toContain("\\input{private}");
    expect(parseTable(source)).toEqual(table);
  });
  it("refuses a destructive conversion of complex tables", () => {
    for (const body of ["\\multicolumn{2}{c}{Title}", "\\cite{paper} & 2", "\\hline A & B & C", "A & B & C"]) {
      expect(parseTable("\\begin{tabular}{ll}\n" + body + "\n\\end{tabular}")).toBeNull();
    }
    expect(() => serializeTable({ align: "lllllllll", rows: [[]] })).toThrow();
    expect(() => serializeTable({ align: "l", rows: [["line\nbreak"]] })).toThrow();
  });
  it("edits float table cells while retaining placement, caption, label and booktabs rules", () => {
    const source = "\\begin{table}[htbp]\n\\centering\n\\caption{Observed results}\n\\label{tab:results}\n\\begin{tabular}{|lr|}\n\\toprule\nName & Value \\\\\n\\midrule\nTest & 42 \\\\\n\\bottomrule\n\\end{tabular}\n\\end{table}";
    const parsed = parseTable(source)!; expect(parsed).not.toBeNull();
    parsed.rows[1]![1] = "50%";
    const edited = serializeTable(parsed);
    expect(edited).toContain("Test & 50\\%"); expect(edited).toContain("\\caption{Observed results}"); expect(edited).toContain("\\label{tab:results}");
    expect(edited).toContain("\\begin{tabular}{|lr|}"); expect(edited).toContain("\\midrule"); expect(edited).toContain("\\bottomrule");
    expect(parseTable(edited)?.rows).toEqual([["Name", "Value"], ["Test", "50%"]]);
    expect(parseTable(source.replace("\\centering", "\\input{private}"))).toBeNull();
  });
  it("edits exactly the enclosing structure and checks matching math delimiters", () => {
    const equation = "\\begin{equation*}\nx^2 + y^2\n\\end{equation*}";
    const source = "Before\n" + equation + "\nAfter";
    const range = structureAt(source, 20, 20, "equation");
    expect(source.slice(range.from, range.to)).toBe(equation);
    expect(equationBody(equation)).toBe("x^2 + y^2");
    expect(equationBody("\\begin{equation}x\\end{equation*}")).toBeNull();
    expect(structureAt(source, 0, 3, "table")).toEqual({ from: 0, to: 3 });
  });
});
