import { describe, expect, it, vi } from "vitest";
import { compiledManuscriptRepair, validateManuscriptAiOutput } from "../manuscript-ai.service.js";
import { manuscriptAiSchema } from "../dto/manuscript-ai.schema.js";

vi.mock("../../../infrastructure/queue.js", () => ({ aiJobsQueue: { add: vi.fn() } }));
const id = "29fda733-d3b7-4ba6-a2ee-7710aa0eb726";
const source = { id, title: "Existing project study", authors: ["Author"], year: 2025, doi: "10.1234/real", citationKey: "Author2025", bibtex: "canonical", abstract: "This study examines evidence from collaborative academic writing.", evidenceStatus: "PROJECT_SOURCE" as const };
const result = { text: "An improved passage \\cite{Author2025}.", explanation: "Preserved the claim", citations: [{ paperId: id, reason: "A possible supporting source" }] };
describe("compiler-backed repair checks", () => {
  const compiled = { id, status: "SUCCESS" as const, sourceVersion: 8, diagnostics: "This is pdfTeX\nLaTeX Warning: Citation `resolved' undefined.\nThis is pdfTeX\nOutput written on paper.pdf (1 page)." };
  it("uses only the final compiler pass, not warnings resolved by subsequent passes", () => {
    expect(compiledManuscriptRepair(compiled, 8)).toMatchObject({ text: "", warnings: [], repair: { outcome: "COMPILED", sourceVersion: 8 } });
  });
  it("reports remaining warnings as nonblocking and offers no source replacement", () => {
    const check = compiledManuscriptRepair({ ...compiled, diagnostics: compiled.diagnostics + "\nLaTeX Warning: Reference `missing' undefined.\nOverfull \\hbox (2pt too wide)\nLaTeX Font Warning: Some font shapes were not available." }, 8);
    expect(check).toMatchObject({ text: "", repair: { outcome: "WARNINGS" } });
    expect(check!.warnings).toHaveLength(3);
    expect(check!.warnings.join(" ")).not.toContain("resolved");
  });
  it("does not certify uncompiled, stale, failed, pending, or unavailable builds", () => {
    expect(compiledManuscriptRepair(null, 8)).toBeNull();
    expect(compiledManuscriptRepair(compiled, 9)).toBeNull();
    for (const status of ["FAILED", "QUEUED", "COMPILING", "BLOCKED", "TIMED_OUT"] as const) expect(compiledManuscriptRepair({ ...compiled, status }, 8)).toBeNull();
  });
});
describe("manuscript AI output boundary", () => {
  it("returns a noninsertable clarification when research context is insufficient", () => {
    const question = { text: "", explanation: "Please provide the observed findings before writing the results.", citations: [], needsContext: true };
    expect(validateManuscriptAiOutput(question, [], [], "continue")).toMatchObject({ text: "", needsContext: true, citations: [] });
    expect(() => validateManuscriptAiOutput({ ...question, text: "Invented findings" }, [], [], "continue")).toThrow();
  });
  it("resolves references from canonical metadata and labels unreviewed support", () => {
    const output = validateManuscriptAiOutput(result, [source], [source.citationKey], "improve");
    expect(output.citations[0]).toMatchObject({ id, citationKey: "Author2025", evidenceStatus: "PROJECT_SOURCE" });
    expect(output.citations[0]).not.toHaveProperty("abstract");
    expect(validateManuscriptAiOutput({ ...result, citations: [] }, [source], [source.citationKey], "improve").citations[0]?.id).toBe(id);
  });
  it("rejects invented sources, citation keys and DOIs", () => {
    expect(() => validateManuscriptAiOutput(result, [], [source.citationKey], "improve")).toThrow();
    for (const text of ["\\cite{Imaginary}", "\\citep*[p. 3]{Imaginary}", "\\Cite{Imaginary}", "\\parencites{Author2025}{Imaginary}", "doi: 10.9999/fake", "\\bibitem{fake} Invented reference"]) {
      expect(() => validateManuscriptAiOutput({ ...result, text }, [source], [source.citationKey], "improve")).toThrow();
    }
  });
  it("does not treat a prefix of an existing DOI as an authorized reference", () => {
    expect(() => validateManuscriptAiOutput({ text: "10.1234/study", explanation: "Retain DOI", citations: [] }, [], [], "custom", "10.1234/study-extension")).toThrow();
  });
  it("validates citations and bibliography commands assembled across the cursor boundary", () => {
    const fullSource = "Existing prose \\c";
    const scope = { fullSource, from: fullSource.length, to: fullSource.length, paths: [] };
    const output = { text: "ite{Imaginary}", explanation: "Continue", citations: [] };
    expect(() => validateManuscriptAiOutput(output, [], [], "continue", "", scope)).toThrow("unknown citation key");
    const bibSource = "Existing prose \\bib";
    expect(() => validateManuscriptAiOutput({ ...output, text: "item{fake} Invented reference" }, [], [], "continue", "", { ...scope, fullSource: bibSource, from: bibSource.length, to: bibSource.length })).toThrow("bibliography records");
    expect(() => validateManuscriptAiOutput({ ...output, text: "ite{Author2025}" }, [source], [source.citationKey], "continue", "", scope)).not.toThrow();
  });
  it("validates complete DOI tokens when only the DOI suffix is selected", () => {
    const fullSource = "Reference 10.1234/real", from = fullSource.indexOf("real");
    const scope = { fullSource, from, to: fullSource.length, paths: [] };
    const output = { text: "fake", explanation: "Edit reference", citations: [] };
    expect(() => validateManuscriptAiOutput(output, [source], [], "custom", "real", scope)).toThrow();
    expect(() => validateManuscriptAiOutput({ ...output, text: "real" }, [source], [], "custom", "real", scope)).not.toThrow();
  });
  it("lets noninsertable explanations discuss a missing key or bibliography error", () => {
    const explanation = { text: "The key in \\cite{missing} is absent. Check \\bibliography{references}.", explanation: "Source diagnostic", citations: [] };
    expect(validateManuscriptAiOutput(explanation, [], [], "explain").text).toContain("missing");
  });
  it("accepts valid citation whitespace and optional arguments while rejecting unknown keys", () => {
    const text = "Evidence \\Citep* [see] [p. 2] {Author2025,manual_key}.";
    expect(validateManuscriptAiOutput({ ...result, text }, [source], [source.citationKey, "manual_key"], "improve").text).toBe(text);
    expect(() => validateManuscriptAiOutput({ ...result, text }, [source], [source.citationKey], "improve")).toThrow();
  });
  it("does not permit citation searches to return insertable model prose or BibTeX metadata", () => {
    expect(() => validateManuscriptAiOutput(result, [source], [source.citationKey], "citations")).toThrow();
    expect(validateManuscriptAiOutput({ ...result, text: "", citations: [{ paperId: id, reason: "Check the source", supportQuote: source.abstract }] }, [source], [source.citationKey], "citations").citations[0]?.support).toMatchObject({ quote: source.abstract, locator: "Abstract", kind: "ABSTRACT" });
    expect(() => validateManuscriptAiOutput({ ...result, citations: [{ ...result.citations[0], bibtex: "fake" }] }, [source], [source.citationKey], "citations")).toThrow();
  });
  it("requires a traceable quotation for citation searches and rejects invented evidence", () => {
    for (const supportQuote of [undefined, "An invented quotation never present in the source."]) expect(() => validateManuscriptAiOutput({ text: "", explanation: "Check support", citations: [{ paperId: id, reason: "Claim support", ...(supportQuote ? { supportQuote } : {}) }] }, [source], [], "citations")).toThrow();
  });
  it("bounds requests and requires source selections for rewriting", () => {
    const input = { fileId: id, from: 0, to: 0, original: "", action: "continue", instruction: "", language: "English" };
    expect(manuscriptAiSchema.safeParse(input).success).toBe(true);
    expect(manuscriptAiSchema.safeParse({ ...input, action: "rewrite" }).success).toBe(false);
    expect(manuscriptAiSchema.safeParse({ ...input, action: "custom" }).success).toBe(false);
    expect(manuscriptAiSchema.safeParse({ ...input, to: 1 }).success).toBe(false);
    expect(manuscriptAiSchema.safeParse({ ...input, instruction: "a".repeat(2001) }).success).toBe(false);
  });
  it("allows repair to retain existing bibliography commands and unresolved citation keys", () => {
    const original = "\\documentclass{article}\n\\cite{existing_missing_key}\n\\bibliographystyle{plain}\n\\bibliography{references}";
    const output = { text: "\\documentclass{article}\n\\begin{document}\n\\cite{existing_missing_key}\n\\bibliographystyle{plain}\n\\bibliography{references}\n\\end{document}", explanation: "Fixed document structure; citation still needs checking", citations: [] };
    expect(validateManuscriptAiOutput(output, [], [], "repair", original).text).toBe(output.text);
    expect(() => validateManuscriptAiOutput({ ...output, text: output.text.replace("references}", "invented}") }, [], [], "repair", original)).toThrow();
    expect(() => validateManuscriptAiOutput({ ...output, text: output.text.replace("existing_missing_key", "invented") }, [], [], "repair", original)).toThrow();
    expect(validateManuscriptAiOutput(output, [], [], "repair", original).warnings[0]).toContain("not been compiled");
  });
});
