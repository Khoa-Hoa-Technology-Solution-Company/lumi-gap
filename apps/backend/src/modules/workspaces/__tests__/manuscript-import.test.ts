import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { readSourceZip, decodeSource, prepareFigure } from "../manuscript-import.js";

const main = "\\documentclass{article}\n\\begin{document}Nghiên cứu\\end{document}";
const zip = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([path, text]) => [path, strToU8(text)])));
describe("bounded source ZIP import", () => {
  it("preserves UTF-8 multi-file sources and custom classes and strips one enclosing project directory", () => {
    const archive = readSourceZip(zip({ "project/main.tex": main, "project/sections/intro.tex": "\\section{Nghiên cứu}", "project/team.cls": "\\LoadClass{article}", "project/references.bib": "@misc{a,title={Test}}" }));
    expect(archive.mainFile).toBe("main.tex"); expect(archive.files).toHaveLength(4);
    expect(archive.files.find(file => file.path === "sections/intro.tex")?.text).toBe("\\section{Nghiên cứu}");
  });
  it("reports unsupported files and lets the user choose between multiple main documents", () => {
    const bytes = zip({ "one.tex": main, "two.tex": main, "README.md": "Description", "latexmkrc": "system('bad')" });
    expect(() => readSourceZip(bytes)).toThrow(/main/);
    expect(readSourceZip(bytes, "two.tex")).toMatchObject({ mainFile: "two.tex", ignored: ["README.md", "latexmkrc"] });
  });
  it("retains the explicitly chosen main file from a LumiGap source export", () => {
    const archive = readSourceZip(zip({ "main.tex": main, "appendix.tex": main, "lumigap-version.json": JSON.stringify({ mainFile: "appendix.tex" }) }));
    expect(archive.mainFile).toBe("appendix.tex"); expect(archive.files).toHaveLength(2);
  });
  it("rejects traversal, duplicate case-insensitive paths and reserved compiler outputs", () => {
    for (const path of ["../bad.tex", "a/../../bad.tex", "/root.tex", "a\\bad.tex", "lumigap-build/paper.tex", "LUMIGAP-BUILD/a.tex"]) expect(() => readSourceZip(zip({ "main.tex": main, [path]: "text" }))).toThrow();
    expect(() => readSourceZip(zip({ "main.tex": main, "Main.tex": main }))).toThrow();
  });
  it("rejects bombs, invalid UTF-8, binary text, truncated archives and corrupt CRCs before persistence", () => {
    expect(() => readSourceZip(zip({ "main.tex": "x".repeat(500001) }))).toThrow();
    expect(() => readSourceZip(zip({ "main.tex": main }).slice(0, -1))).toThrow();
    expect(() => decodeSource(new Uint8Array([0xff, 0xff]))).toThrow(/UTF-8/);
    expect(() => decodeSource(strToU8("abc\0def"))).toThrow();
    const corrupt = Buffer.from(zip({ "main.tex": main }));
    const central = corrupt.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); corrupt.writeUInt32LE(0, central + 16);
    expect(() => readSourceZip(corrupt)).toThrow();
    const bomb = Buffer.from(zip({ "main.tex": main })); const entry = bomb.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); bomb.writeUInt32LE(0xffffffff, entry + 24);
    expect(() => readSourceZip(bomb)).toThrow();
  });
  it("retains PDF figures privately and rejects spoofed PDFs", async () => {
    const bytes = strToU8("%PDF-1.7\nfixture\n%%EOF");
    expect(await prepareFigure("figures/Diagram (1).pdf", bytes)).toMatchObject({ mimeType: "application/pdf", bytes });
    await expect(prepareFigure("figure.pdf", strToU8("<script>"))).rejects.toThrow(/PDF/);
  });
});
