import { describe, expect, it } from "vitest";
import type { ClosureCalibrationView, CoverageCheckView } from "@trend/shared-types";
import {
  buildDossier,
  dossierFilename,
  dossierMarkdown,
  interRaterKappa,
  toCalibrationView,
  toCheckView,
  toCoverageView,
  toDocumentView,
  type CheckRow,
  type DocumentRow,
} from "../dossier.js";

const now = new Date("2026-10-15T08:00:00.000Z");

function checkRow(overrides: Partial<CheckRow> = {}): CheckRow {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    targetKind: "GAP",
    targetId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    protocolVersion: "gcp-v1",
    status: "DECIDED",
    question: "Does telehealth reduce readmissions in adults with heart failure?",
    facets: { population: "adults with heart failure", outcome: "", extra: 3 },
    queries: [{ source: "LOCAL", query: "telehealth heart failure", executedAt: now.toISOString(), resultCount: 2 }, { source: "OPENALEX", query: "telehealth heart failure", executedAt: now.toISOString(), resultCount: 0, error: "timeout" }],
    yearFrom: null,
    yearTo: null,
    judgeKind: "AI",
    coverageCheckId: "cov",
    calibrationId: "cal",
    delta: 0.05,
    epsHat: 0.095,
    pHat: 0.058,
    bound: 0.153,
    maxFalseNovelty: 0.2,
    decision: "OPEN_CERTIFIED",
    decisionReasons: [],
    witnessDocumentId: null,
    corroborated: false,
    errorMessage: null,
    createdById: "u1",
    decidedById: "u1",
    decidedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function docRow(id: string, overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id,
    paperId: null,
    openalexId: null,
    doi: `10.1000/${id}`,
    title: `Paper | ${id}`,
    abstractText: "An abstract.",
    publicationYear: 2024,
    retrievedFrom: "LOCAL",
    queryIndex: 0,
    rank: 1,
    aiLabel: "UNRELATED",
    aiQuote: null,
    aiFacets: null,
    aiQuoteVerified: false,
    humanLabel: null,
    humanQuote: null,
    humanFacets: null,
    reviewerId: null,
    reviewedAt: null,
    secondLabel: null,
    secondReviewerId: null,
    limitationStatement: false,
    ...overrides,
  };
}

const coverage: CoverageCheckView = { id: "cov", topic: "telehealth", referenceSource: "Survey reference list", m: 50, x: 0, delta: 0.05, pHat: 0.058, createdById: "u1", createdAt: now.toISOString(), items: [{ doi: "10.1/a", position: 0, foundLocal: true, foundOpenAlex: true }, { doi: "10.1/b", position: 1, foundLocal: false, foundOpenAlex: true }] };
const calibration: ClosureCalibrationView = { id: "cal", name: "Cardiology", domain: "cardiology", judgeKind: "AI", mode: "TRANSFER", protocolVersion: "gcp-v1", status: "COMPUTED", delta: 0.05, n: 30, misses: 0, epsHat: 0.095, createdById: "u1", createdAt: now.toISOString(), questions: [{ id: "q1", calibrationId: "cal", question: "Does X reduce Y?", facets: {}, witnessDoi: "10.1/w", labelSource: "SURVEY", result: "FOUND", createdAt: now.toISOString() }] };

describe("row mappers", () => {
  it("maps a check row, keeping only valid facets and the query log", () => {
    const view = toCheckView(checkRow(), [docRow("a")]);
    expect(view.facets).toEqual({ population: "adults with heart failure" });
    expect(view.queries).toHaveLength(2);
    expect(view.decidedAt).toBe(now.toISOString());
    expect(view.yearFrom).toBeUndefined();
    expect(view.documents).toHaveLength(1);
  });

  it("computes effectiveLabel for each document", () => {
    const pending = toDocumentView(docRow("p", { aiLabel: "ANSWERS", aiQuote: "q", aiQuoteVerified: false }));
    const verified = toDocumentView(docRow("v", { aiLabel: "ANSWERS", aiQuote: "q", aiQuoteVerified: true }));
    const human = toDocumentView(docRow("h", { aiLabel: "ANSWERS", aiQuoteVerified: false, humanLabel: "UNRELATED" }));
    const unscreened = toDocumentView(docRow("u", { aiLabel: null }));
    expect(pending.effectiveLabel).toBeUndefined();
    expect(verified.effectiveLabel).toBe("ANSWERS");
    expect(human.effectiveLabel).toBe("UNRELATED");
    expect(unscreened.effectiveLabel).toBeUndefined();
  });

  it("sorts coverage items and calibration questions", () => {
    const cov = toCoverageView({ id: "c", topic: "t", projectId: null, referenceSource: "s", m: 2, x: 1, delta: 0.05, pHat: 0.9, createdById: "u", createdAt: now }, [
      { doi: "b", position: 1, title: null, foundLocal: false, foundOpenAlex: false, paperId: null, openalexId: null },
      { doi: "a", position: 0, title: "A", foundLocal: true, foundOpenAlex: false, paperId: "p", openalexId: null },
    ]);
    expect(cov.items.map((item) => item.doi)).toEqual(["a", "b"]);
    const cal = toCalibrationView({ id: "k", name: "n", domain: "d", judgeKind: "HUMAN", protocolVersion: "gcp-v1", status: "DRAFT", delta: 0.05, n: 0, misses: 0, epsHat: null, computedAt: null, createdById: "u", createdAt: now });
    expect(cal.questions).toBeUndefined();
    expect(cal.epsHat).toBeUndefined();
  });
});

describe("interRaterKappa", () => {
  it("needs at least two documents with both labels", () => {
    const one = toDocumentView(docRow("a", { humanLabel: "ANSWERS", secondLabel: "ANSWERS" }));
    expect(interRaterKappa([one, toDocumentView(docRow("b", { humanLabel: "ANSWERS" }))])).toBeUndefined();
  });

  it("is 1 for perfect agreement over varied labels and lower with disagreement", () => {
    const agree = [["ANSWERS", "ANSWERS"], ["UNRELATED", "UNRELATED"], ["PARTIAL", "PARTIAL"], ["UNRELATED", "UNRELATED"]] as const;
    const docs = agree.map(([first, second], index) => toDocumentView(docRow(`d${index}`, { humanLabel: first, secondLabel: second })));
    expect(interRaterKappa(docs)).toEqual({ kappa: 1, documents: 4 });
    const mixed = [...docs.slice(0, 3), toDocumentView(docRow("x", { humanLabel: "ANSWERS", secondLabel: "UNRELATED" }))];
    const result = interRaterKappa(mixed)!;
    expect(result.documents).toBe(4);
    expect(result.kappa).toBeLessThan(1);
  });
});

describe("buildDossier", () => {
  it("explains the bound with the numbers a person can recompute", () => {
    const dossier = buildDossier({ generatedAt: now, check: toCheckView(checkRow(), [docRow("a")]), coverage, calibration, defaults: { delta: 0.05, maxFalseNovelty: 0.2 } });
    expect(dossier.protocolVersion).toBe("gcp-v1");
    expect(dossier.generatedAt).toBe(now.toISOString());
    expect(dossier.arithmetic.join("\n")).toContain("epsHat = Clopper-Pearson upper 95% of 0/30");
    expect(dossier.arithmetic.join("\n")).toContain("pHat = Clopper-Pearson upper 95% of 0/50");
    expect(dossier.arithmetic.join("\n")).toContain("B = 0.095 + 0.058 = 0.153 <= 0.2");
    expect(dossier.interRaterKappa).toBeUndefined();
  });

  it("uses the stored values and flags a calibration recomputed after the decision", () => {
    const dossier = buildDossier({ generatedAt: now, check: toCheckView(checkRow({ epsHat: 0.2 }), []), coverage, calibration, defaults: { delta: 0.05, maxFalseNovelty: 0.2 } });
    expect(dossier.arithmetic.join("\n")).toContain("recomputed after this decision");
  });

  it("explains an in-situ bound from the formula the check recorded", () => {
    const check = toCheckView(checkRow({ bound: 0.095, boundMode: "IN_SITU" }), []);
    expect(check.boundMode).toBe("IN_SITU");
    const dossier = buildDossier({ generatedAt: now, check, coverage, calibration: { ...calibration, mode: "IN_SITU" }, defaults: { delta: 0.05, maxFalseNovelty: 0.2 } });
    expect(dossier.arithmetic.join("\n")).toContain("not part of the bound");
    expect(dossier.arithmetic.at(-1)).toBe("B = epsHat = 0.095 <= 0.2");
    const markdown = dossierMarkdown(dossier);
    expect(markdown).toContain("P(false novelty) <= epsHat holds with probability >= 1 - delta");
    expect(markdown).toContain("mode IN_SITU");
  });

  it("reads rows without a bound mode as having none", () => {
    expect(toCheckView(checkRow(), []).boundMode).toBeUndefined();
  });

  it("states what is missing for a check that was never decided", () => {
    const row = checkRow({ status: "SCREENING", decision: null, epsHat: null, pHat: null, bound: null, delta: null, maxFalseNovelty: null, coverageCheckId: null, calibrationId: null });
    const dossier = buildDossier({ generatedAt: now, check: toCheckView(row, []), defaults: { delta: 0.05, maxFalseNovelty: 0.2 } });
    expect(dossier.arithmetic).toEqual(["epsHat: no computed calibration", "pHat: no coverage check"]);
  });
});

describe("dossierMarkdown", () => {
  it("renders the decision, the search log with errors, documents and escapes table cells", () => {
    const witness = docRow("w", { paperId: "p1", aiLabel: "ANSWERS", aiQuote: "telehealth reduced readmissions in adults", aiQuoteVerified: true });
    const row = checkRow({ decision: "CLOSED", witnessDocumentId: "w", epsHat: null, pHat: null, bound: null, coverageCheckId: null, calibrationId: null });
    const dossier = buildDossier({ generatedAt: now, gap: { id: "g", title: "A gap", topic: "telehealth" }, check: toCheckView(row, [witness, docRow("n")]), defaults: { delta: 0.05, maxFalseNovelty: 0.2 } });
    const markdown = dossierMarkdown(dossier);
    expect(markdown).toContain("# Gap closure dossier");
    expect(markdown).toContain("- Decision: CLOSED");
    expect(markdown).toContain("> telehealth reduced readmissions in adults");
    expect(markdown).toContain("| 1 | OPENALEX | telehealth heart failure | 0 | timeout |");
    expect(markdown).toContain("Paper \\| w");
    expect(markdown).toContain("No coverage check was used.");
    expect(markdown).toContain("No calibration was used.");
  });

  it("includes coverage DOIs and calibration questions when present", () => {
    const dossier = buildDossier({ generatedAt: now, check: toCheckView(checkRow(), []), coverage, calibration, defaults: { delta: 0.05, maxFalseNovelty: 0.2 } });
    const markdown = dossierMarkdown(dossier);
    expect(markdown).toContain("| 10.1/b | no | yes |");
    expect(markdown).toContain("m = 50 reference DOIs, x = 0");
    expect(markdown).toContain("| Does X reduce Y? | 10.1/w | SURVEY | FOUND |");
  });

  it("names the file after the check", () => {
    expect(dossierFilename({ id: "11111111-2222-4333-8444-555555555555" })).toBe("gap-closure-11111111.md");
  });
});
