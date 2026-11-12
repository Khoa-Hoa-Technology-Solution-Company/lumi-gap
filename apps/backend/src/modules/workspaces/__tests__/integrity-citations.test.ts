import { describe, expect, it } from "vitest";
import type { ManuscriptManifest } from "@trend/shared-types";
import { analyzeSnapshotCitations as audit, integrityDigest, providerCitationStatus, type CitationMetadata } from "../integrity-citations.js";
const manifest = (sources: Record<string, string>): ManuscriptManifest => ({ title: "Study", documentType: "RESEARCH_PAPER", mainFileId: "main.tex", files: Object.entries(sources).map(([path, text]) => ({ id: path, path, kind: "TEXT", sequence: 1, checksum: integrityDigest(text), sizeBytes: text.length, text })) });
const entry = (key = "study", extra = "") => `@article{${key}, title={A {nested} study}, author={Smith, A and Lee, B}, year={2024}, doi={10.1000/study}${extra}}`;
const metadata: CitationMetadata = { paperId: "paper", title: "A nested study", year: 2024, doi: "10.1000/study", provider: "openalex", observedAt: "2026-11-06T00:00:00.000Z", status: "UNKNOWN" };
describe("snapshot citation analysis", () => {
  it("finds undefined citation keys and missing bibliography resources", () => {
    const result = audit(manifest({ "main.tex": "\\begin{document}\\cite{missing}\\bibliography{absent}\\end{document}" }));
    expect(result.findings.map(row => row.code)).toEqual(expect.arrayContaining(["UNDEFINED_CITATION", "BIBLIOGRAPHY_UNAVAILABLE"]));
  });
  it("retains duplicate bibliography identifiers within one file", () => {
    const result = audit(manifest({ "main.tex": "\\cite{study}\\bibliography{refs}", "refs.bib": entry() + entry() }));
    expect(result.entries).toHaveLength(2); expect(result.findings.some(row => row.code === "DUPLICATE_IDENTIFIER")).toBe(true);
  });
  it("detects missing metadata and malformed DOIs without alleging fraud", () => {
    const result = audit(manifest({ "main.tex": "\\cite{study}\\bibliography{refs}", "refs.bib": "@misc{study,title={Only title},doi={no-doi}}" }));
    expect(result.findings.map(row => row.code)).toEqual(expect.arrayContaining(["INCOMPLETE_METADATA", "DOI_FORMAT", "UNABLE_TO_VERIFY"]));
    expect(JSON.stringify(result)).not.toContain("fraudulent");
  });
  it("compares the DOI to identified provider title/year metadata, not claim support", () => {
    const source = manifest({ "main.tex": "\\cite{study}\\bibliography{refs}", "refs.bib": entry() });
    expect(audit(source, [metadata]).entries[0]).toMatchObject({ identity: "CONFIRMED", metadata: "VERIFIED" });
    expect(audit(source, [{ ...metadata, title: "Different paper" }]).findings.some(row => row.code === "DOI_METADATA_MISMATCH")).toBe(true);
    expect(audit(source, [metadata]).claimSupport).toBe("NOT_REVIEWED");
  });
  it.each(["RETRACTED", "CORRECTED"] as const)("preserves a reliable %s status warning and source timestamp", status => {
    const result = audit(manifest({ "main.tex": "\\cite{study}\\bibliography{refs}", "refs.bib": entry() }), [{ ...metadata, status, sourceRecordId: "provider-record" }]);
    expect(result.findings.some(row => row.code === `SOURCE_${status}`)).toBe(true);
    expect(result.entries[0]?.evidence).toMatchObject({ observedAt: metadata.observedAt, sourceRecordId: "provider-record" });
  });
  it("degrades to manual verification when provider metadata is unavailable", () => {
    const result = audit(manifest({ "main.tex": "\\cite{study}\\bibliography{refs}", "refs.bib": entry() }));
    expect(result.entries[0]?.identity).toBe("UNAVAILABLE"); expect(result.findings.some(row => row.code === "UNABLE_TO_VERIFY")).toBe(true);
  });
  it("follows multi-file inputs once, excludes orphan files and comments/literals, and supports plural citations", () => {
    const result = audit(manifest({
      "main.tex": "\\input{sections/intro}\\input{sections/intro}\\bibliography{refs}\n% \\cite{comment}\n\\begin{verbatim}\\cite{literal}\\end{verbatim}",
      "sections/intro.tex": "\\parencites[see]{first}[p.2]{second}", "orphan.tex": "\\cite{orphan}", "refs.bib": entry("first") + entry("second"),
    }));
    expect(result.citedKeys).toEqual(["first", "second"]); expect(result.files).not.toContain("orphan.tex");
    expect(result.findings.some(row => row.code === "UNDEFINED_CITATION")).toBe(false);
  });
  it("keeps manual bibitems and dynamic TeX explicitly reviewable without executing commands", () => {
    const result = audit(manifest({ "main.tex": "\\newcommand{\\custom}[1]{\\cite{#1}}\\cite{manual}\\begin{thebibliography}{9}\\bibitem{manual}A source\\end{thebibliography}\\input{../../secrets}" }));
    expect(result.citedKeys).toEqual(["manual"]); expect(result.findings.some(row => row.code === "DYNAMIC_TEX")).toBe(true);
    expect(result.entries[0]?.identity).toBe("UNAVAILABLE");
  });
  it("bounds source analysis instead of running untrusted TeX", () => {
    const result = audit(manifest({ "main.tex": "x".repeat(2_000_001) }));
    expect(result.findings[0]?.code).toBe("ANALYSIS_LIMIT"); expect(result.entries).toEqual([]);
  });
  it("bounds manual bibliography items as well as BibTeX entries", () => {
    const result = audit(manifest({ "main.tex": Array.from({ length: 2001 }, (_, index) => `\\bibitem{manual${index}}Source`).join("\n") }));
    expect(result.entries).toHaveLength(2000);
    expect(result.findings.some(finding => finding.code === "ANALYSIS_LIMIT")).toBe(true);
  });
  it("keeps an incomplete-analysis warning when the finding budget is exhausted", () => {
    const result = audit(manifest({ "main.tex": `\\cite{${Array.from({ length: 1002 }, (_, index) => `missing${index}`).join(",")}}` }));
    expect(result.findings).toHaveLength(1000);
    expect(result.findings.some(finding => finding.code === "ANALYSIS_LIMIT")).toBe(true);
  });
  it("derives stable digests independent of JSON object property order", () => expect(integrityDigest({ a: 1, b: 2 })).toBe(integrityDigest({ b: 2, a: 1 })));
  it("distinguishes a Crossref correction notice from an original work updated by that notice", () => {
    expect(providerCitationStatus("crossref", { "update-to": [{ DOI: "10.1000/original", type: "correction" }] }).status).toBe("UNKNOWN");
    expect(providerCitationStatus("crossref", { "updated-by": [{ DOI: "10.1000/notice", type: "correction" }] })).toEqual({ status: "CORRECTED", statusNoticeDoi: "10.1000/notice" });
    expect(providerCitationStatus("manual", { is_retracted: true }).status).toBe("UNKNOWN");
  });
  it("compares available provider author names conservatively and reports exactly which fields matched", () => {
    const source = manifest({ "main.tex": "\\cite{study}\\bibliography{refs}", "refs.bib": entry() });
    const matched = audit(source, [{ ...metadata, authors: ["A Smith", "B Lee"] }]);
    expect(matched.entries[0]?.verifiedFields).toEqual(["title", "year", "authors"]);
    const mismatch = audit(source, [{ ...metadata, authors: ["Unrelated Author"] }]);
    expect(mismatch.findings.some(finding => finding.code === "AUTHOR_METADATA_MISMATCH")).toBe(true);
    expect(mismatch.entries[0]?.metadata).toBe("NEEDS_REVIEW");
  });
  it("does not hide a known retraction behind an earlier correction notice", () => {
    expect(providerCitationStatus("crossref", { "updated-by": [{ DOI: "10.1000/correction", type: "correction" }, { DOI: "10.1000/retraction", type: "retraction" }] })).toEqual({ status: "RETRACTED", statusNoticeDoi: "10.1000/retraction" });
  });
});
