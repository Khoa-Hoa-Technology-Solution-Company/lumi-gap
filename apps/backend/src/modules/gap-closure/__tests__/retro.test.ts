import { describe, expect, it } from "vitest";
import { clopperPearsonUpper } from "../closure.rules.js";
import {
  AUDIT_HEADERS,
  AuditParseError,
  afterStatusOf,
  auditToCsv,
  computeRetroMetrics,
  evaluateWindow,
  filterDraftsByYears,
  LEGACY_THRESHOLDS,
  legacyComputeGapEvidence,
  legacyCountRule,
  legacyCountYears,
  legacyGrowthWindow,
  legacyResolveProbeYears,
  parseAuditCsv,
  parseCsv,
  parseRetroArgs,
  pickWitness,
  proportionInterval,
  renderSummaryMarkdown,
  resolveReviewers,
  scoreRecord,
  toAuditRecord,
  toCsv,
  type AuditRecord,
  type LegacyThresholds,
  type RetroDocument,
  type RetroGapResult,
  type RetroWindowResult,
  type Witness,
} from "../retro.js";

const thresholds: LegacyThresholds = { scarceAbs: 5, scarcePct: 0.02, parentRisingMin: 0, minParentPapers: 5 };

describe("legacy count rule (frozen baseline)", () => {
  it("confirms a scarce intersection of two growing, sufficiently large parents", () => {
    const { label, evidence } = legacyCountRule({ intersectionCount: 2, parentCounts: { a: 100, b: 80 }, parentRisingGrowthPct: 12 }, thresholds);
    expect(label).toBe("confirmed");
    // ceiling = max(5, floor(0.02 * 80) = 1, 1) = 5 -> scarcity 1 - 2/5 = 0.6 -> confidence 0.5 + 0.5 * 0.6
    expect(evidence).toMatchObject({ confirmed: true, lowSample: false, scarcityScore: 0.6, evidenceConfidence: 0.8 });
  });

  it("scales the scarcity ceiling with the smaller parent", () => {
    // 2% of 1000 = 20 > the floor of 5
    expect(legacyCountRule({ intersectionCount: 18, parentCounts: { a: 5000, b: 1000 }, parentRisingGrowthPct: 1 }, thresholds).label).toBe("confirmed");
    expect(legacyCountRule({ intersectionCount: 21, parentCounts: { a: 5000, b: 1000 }, parentRisingGrowthPct: 1 }, thresholds).label).toBe("weak");
  });

  it("is weak when the intersection is not scarce, no parent rises, or a parent is small", () => {
    expect(legacyCountRule({ intersectionCount: 50, parentCounts: { a: 100, b: 80 }, parentRisingGrowthPct: 12 }, thresholds).label).toBe("weak");
    expect(legacyCountRule({ intersectionCount: 1, parentCounts: { a: 100, b: 80 }, parentRisingGrowthPct: 0 }, thresholds).label).toBe("weak");
    const small = legacyCountRule({ intersectionCount: 0, parentCounts: { a: 100, b: 4 }, parentRisingGrowthPct: 50 }, thresholds);
    expect(small.label).toBe("weak");
    expect(small.evidence?.lowSample).toBe(true);
  });

  it("treats an empty parent as missing data, not as scarcity", () => {
    const { label, evidence } = legacyCountRule({ intersectionCount: 0, parentCounts: { a: 0, b: 40 }, parentRisingGrowthPct: 90 }, thresholds);
    expect(label).toBe("weak");
    expect(evidence).toMatchObject({ confirmed: false, scarcityScore: 0, evidenceConfidence: 0, lowSample: true });
  });

  it("freezes the thresholds of the removed GAP_SCARCE_* settings", () => {
    expect(LEGACY_THRESHOLDS).toEqual(thresholds);
  });

  it("has no label without a probe", () => {
    expect(legacyCountRule(null, thresholds)).toEqual({ label: "none", evidence: null });
  });

  it("agrees with the confirmed flag at every boundary of the ceiling", () => {
    const base = { parentCounts: { a: 10, b: 10 }, parentRisingGrowthPct: 0.1 };
    expect(legacyComputeGapEvidence({ ...base, intersectionCount: 5 }, thresholds).confirmed).toBe(true);
    expect(legacyComputeGapEvidence({ ...base, intersectionCount: 6 }, thresholds).confirmed).toBe(false);
    // growth must be strictly above the minimum
    expect(legacyComputeGapEvidence({ ...base, intersectionCount: 1, parentRisingGrowthPct: 0 }, thresholds).confirmed).toBe(false);
  });
});

describe("legacy probe windows", () => {
  it("never counts papers after the cutoff", () => {
    expect(legacyCountYears({}, 2018)).toEqual({ yearFrom: undefined, yearTo: 2018, conflict: false });
    expect(legacyCountYears({ yearFrom: 2012, yearTo: 2024 }, 2018)).toEqual({ yearFrom: 2012, yearTo: 2018, conflict: false });
    expect(legacyCountYears({ yearTo: 2015 }, 2018)).toMatchObject({ yearTo: 2015 });
  });

  it("falls back to the cutoff window when the probe starts after it", () => {
    expect(legacyCountYears({ yearFrom: 2020 }, 2018)).toEqual({ yearFrom: undefined, yearTo: 2018, conflict: true });
    expect(legacyResolveProbeYears({ yearFrom: 2010, yearTo: 2012 }, { yearFrom: 2015 })).toMatchObject({ conflict: true, yearFrom: 2010, yearTo: 2012 });
  });

  it("computes the growth window like the service did", () => {
    expect(legacyGrowthWindow({ yearTo: 2018 }, 2026)).toEqual({ yearFrom: 2013, yearTo: 2018, lastCompleteYear: 2018 });
    expect(legacyGrowthWindow({ yearFrom: 2010, yearTo: 2018 }, 2026)).toEqual({ yearFrom: 2010, yearTo: 2018, lastCompleteYear: 2018 });
    // a window that reaches the current year drops the incomplete year
    expect(legacyGrowthWindow({ yearTo: 2026 }, 2026)).toMatchObject({ lastCompleteYear: 2025 });
  });
});

describe("filterDraftsByYears", () => {
  const drafts = [{ publicationYear: 2017 }, { publicationYear: 2018 }, { publicationYear: 2019 }, { publicationYear: undefined }, { publicationYear: 0 }];

  it("drops anything after the cutoff and anything of unknown year", () => {
    const result = filterDraftsByYears(drafts, { yearTo: 2018 });
    expect(result.kept.map((d) => d.publicationYear)).toEqual([2017, 2018]);
    expect(result.dropped).toBe(3);
    expect(result.droppedUnknownYear).toBe(2);
  });

  it("keeps only later papers after the cutoff", () => {
    expect(filterDraftsByYears(drafts, { yearFrom: 2019 }).kept.map((d) => d.publicationYear)).toEqual([2019]);
  });
});

function doc(id: string, over: Partial<RetroDocument> = {}): RetroDocument {
  return { dedupeKey: id, title: `Paper ${id}`, retrievedFrom: "LOCAL", aiLabel: "UNRELATED", aiQuote: null, aiQuoteVerified: false, limitationStatement: false, batchFailed: false, publicationYear: 2015, ...over };
}
const answering = (id: string) => doc(id, { aiLabel: "ANSWERS", aiQuote: "We show that the method works in schools.", aiQuoteVerified: true, doi: `10.1/${id}` });

describe("evaluateWindow", () => {
  it("is CLOSED with a witness when one verified answer exists", () => {
    const result = evaluateWindow({ documents: [doc("a"), answering("b"), answering("c")], searchErrors: 0, maxFalseNovelty: 0.2 });
    expect(result).toMatchObject({ state: "CLOSED", answers: 2, pending: 0, witnessId: "b" });
  });

  it("does not count an AI answer whose quote was not found in the text", () => {
    const result = evaluateWindow({ documents: [doc("a", { aiLabel: "ANSWERS", aiQuote: "invented", aiQuoteVerified: false })], searchErrors: 0, maxFalseNovelty: 0.2 });
    expect(result).toMatchObject({ state: "NEEDS_REVIEW", answers: 0, pending: 1 });
  });

  it("reports NO_ANSWER_FOUND only for a complete search with nothing pending", () => {
    const result = evaluateWindow({ documents: [doc("a"), doc("b")], searchErrors: 0, maxFalseNovelty: 0.2 });
    expect(result).toMatchObject({ state: "NO_ANSWER_FOUND", answers: 0, pending: 0 });
    expect(evaluateWindow({ documents: [], searchErrors: 0, maxFalseNovelty: 0.2 }).state).toBe("NO_ANSWER_FOUND");
  });

  it("is fail-closed: a failed search or an unlabelled document is NEEDS_REVIEW, never no answer", () => {
    expect(evaluateWindow({ documents: [doc("a")], searchErrors: 1, maxFalseNovelty: 0.2 }).state).toBe("NEEDS_REVIEW");
    expect(evaluateWindow({ documents: [], searchErrors: 2, maxFalseNovelty: 0.2 }).state).toBe("NEEDS_REVIEW");
    const failed = evaluateWindow({ documents: [doc("a", { aiLabel: null, batchFailed: true })], searchErrors: 0, maxFalseNovelty: 0.2 });
    expect(failed).toMatchObject({ state: "NEEDS_REVIEW", pending: 1 });
  });

  it("still closes on an answer even when another search failed", () => {
    expect(evaluateWindow({ documents: [answering("a")], searchErrors: 1, maxFalseNovelty: 0.2 }).state).toBe("CLOSED");
  });

  it("certifies openness with coverage and calibration, and abstains when the bound is too high", () => {
    const calibration = { epsHat: 0.05, judgeKind: "AI" };
    expect(evaluateWindow({ documents: [doc("a")], searchErrors: 0, coverage: { pHat: 0.1 }, calibration, maxFalseNovelty: 0.2 })).toMatchObject({ state: "OPEN_CERTIFIED", decision: "OPEN_CERTIFIED", bound: 0.15 });
    expect(evaluateWindow({ documents: [doc("a")], searchErrors: 0, coverage: { pHat: 0.3 }, calibration, maxFalseNovelty: 0.2 })).toMatchObject({ state: "ABSTAIN", bound: 0.35 });
  });

  it("does not certify when only the coverage is supplied", () => {
    expect(evaluateWindow({ documents: [doc("a")], searchErrors: 0, coverage: { pHat: 0.01 }, maxFalseNovelty: 0.2 }).state).toBe("NO_ANSWER_FOUND");
  });
});

describe("pickWitness", () => {
  it("returns the quote, doi and year of the witness", () => {
    expect(pickWitness([doc("a"), answering("b")], "b")).toEqual({ title: "Paper b", doi: "10.1/b", year: 2015, quote: "We show that the method works in schools." });
  });
  it("returns null without a witness id or a quote", () => {
    expect(pickWitness([answering("b")], undefined)).toBeNull();
    expect(pickWitness([doc("a")], "a")).toBeNull();
  });
});

describe("csv", () => {
  it("round-trips commas, quotes, line breaks and unicode", () => {
    const rows = [["a", 'He said "hi", twice', "line1\nline2", "Học máy, ứng dụng"], ["", " padded ", "x\r\ny", '""']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it("reads CRLF, a BOM, a missing final newline and skips blank lines", () => {
    expect(parseCsv(String.fromCharCode(0xfeff) + "a,b\r\n1,2\r\n\r\n3,4")).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
  });

  it("keeps empty cells", () => {
    expect(parseCsv("a,,c\n,,\n")).toEqual([["a", "", "c"], ["", "", ""]]);
  });

  it("rejects an unterminated quote", () => {
    expect(() => parseCsv('a,"b')).toThrow(/quoted/);
  });
});

function window(over: Partial<RetroWindowResult> = {}): RetroWindowResult {
  return {
    window: "AT_T", queries: [], documents: [], droppedByYear: 0, droppedUnknownYear: 0, witness: null,
    evaluation: { state: "NO_ANSWER_FOUND", decision: "ABSTAIN", reasons: [], answers: 0, pending: 0, searchErrors: 0 },
    ...over,
  };
}
const witness: Witness = { title: 'A study, "quoted"', doi: "10.1/x", year: 2016, quote: "We found that\nit works." };

function result(over: Partial<RetroGapResult> = {}): RetroGapResult {
  return { gapId: "g1", title: "Gap one", question: "Does X help Y?", facets: {}, cutoff: 2018, proposedQueries: [], old: { label: "confirmed", evidence: null }, atT: window(), afterT: window({ window: "AFTER_T" }), ...over };
}

describe("audit sheet", () => {
  it("has empty reviewer columns and round-trips through CSV", () => {
    const record = toAuditRecord(result({
      atT: window({ witness, evaluation: { state: "CLOSED", decision: "CLOSED", reasons: [], answers: 2, pending: 1, searchErrors: 0, witnessId: "k" } }),
    }));
    const csv = auditToCsv([record]);
    expect(csv.split("\r\n")[0]).toBe(AUDIT_HEADERS.join(","));
    const parsed = parseAuditCsv(csv);
    expect(parsed).toEqual([record]);
    expect(parsed[0]).toMatchObject({ gcpAtT: "CLOSED", answersAtT: 2, pendingAtT: 1, witnessAtT: witness, reviewer1AtT: "", reviewer2AfterT: "" });
  });

  it("marks a phase that failed as needing review", () => {
    const record = toAuditRecord(result({ atT: window({ error: "boom" }) }));
    expect(record.gcpAtT).toBe("NEEDS_REVIEW");
    expect(record.failedQueriesAtT).toBe(1);
    expect(afterStatusOf({ answers: 0, pending: 0, failedQueries: 1 })).toBe("UNKNOWN");
    expect(afterStatusOf({ answers: 0, pending: 0, failedQueries: 0 })).toBe("NOT_FOUND");
    expect(afterStatusOf({ answers: 1, pending: 3, failedQueries: 2 })).toBe("FILLED");
  });

  it("parses reviewer labels case-insensitively", () => {
    const record = toAuditRecord(result({ atT: window({ witness, evaluation: { state: "CLOSED", decision: "CLOSED", reasons: [], answers: 1, pending: 0, searchErrors: 0 } }) }));
    const [header, row] = parseCsv(auditToCsv([record])) as [string[], string[]];
    row[header.indexOf("reviewer1_at_t")] = "answers";
    row[header.indexOf("reviewer2_at_t")] = " Partial ";
    expect(parseAuditCsv(toCsv([header, row]))[0]).toMatchObject({ reviewer1AtT: "ANSWERS", reviewer2AtT: "PARTIAL" });
  });

  it("rejects bad values and missing columns, fail-closed", () => {
    const record = toAuditRecord(result({ atT: window({ witness, evaluation: { state: "CLOSED", decision: "CLOSED", reasons: [], answers: 1, pending: 0, searchErrors: 0 } }) }));
    const [header, row] = parseCsv(auditToCsv([record])) as [string[], string[]];
    const bad = [...row];
    bad[header.indexOf("reviewer1_at_t")] = "YES";
    expect(() => parseAuditCsv(toCsv([header, bad]))).toThrow(AuditParseError);
    expect(() => parseAuditCsv(toCsv([header.slice(1), row.slice(1)]))).toThrow(/missing column/);
    // a label with no document in the row is an error, not silently ignored
    const [, bare] = parseCsv(auditToCsv([toAuditRecord(result())])) as [string[], string[]];
    bare[header.indexOf("reviewer1_after_t")] = "ANSWERS";
    expect(() => parseAuditCsv(toCsv([header, bare]))).toThrow(/needs a filled-after-T document/);
    expect(() => parseAuditCsv("")).toThrow(AuditParseError);
  });
});

describe("proportionInterval", () => {
  it("uses clopperPearsonUpper for the upper end and its mirror for the lower end", () => {
    const interval = proportionInterval(3, 10, 0.05);
    expect(interval.upper).toBe(clopperPearsonUpper(3, 10, 0.025));
    // exact two-sided 95% Clopper-Pearson for 3/10 is (0.0667, 0.6525)
    expect(interval.lower).toBeCloseTo(0.0667, 3);
    expect(interval.upper).toBeCloseTo(0.6525, 3);
    expect(interval.estimate).toBe(0.3);
  });

  it("handles 0 and all successes", () => {
    expect(proportionInterval(0, 20, 0.05)).toMatchObject({ estimate: 0, lower: 0 });
    expect(proportionInterval(0, 20, 0.05).upper).toBeCloseTo(0.1684, 3);
    expect(proportionInterval(20, 20, 0.05)).toMatchObject({ estimate: 1, upper: 1 });
    expect(proportionInterval(20, 20, 0.05).lower).toBeCloseTo(0.8316, 3);
  });

  it("is empty for no gaps", () => {
    expect(proportionInterval(0, 0)).toEqual({ x: 0, m: 0, estimate: null, lower: null, upper: null });
  });

  it("rounds conservatively: lower never above, upper never below the exact bound", () => {
    const interval = proportionInterval(1, 7, 0.05);
    expect(interval.lower!).toBeLessThanOrEqual(0.0036);
    expect(interval.upper!).toBeGreaterThanOrEqual(0.5787);
  });
});

describe("resolveReviewers", () => {
  it("agrees, takes a single label, or flags a conflict", () => {
    expect(resolveReviewers("ANSWERS", "ANSWERS")).toEqual({ status: "agreed", label: "ANSWERS" });
    expect(resolveReviewers("", "PARTIAL")).toEqual({ status: "single", label: "PARTIAL" });
    expect(resolveReviewers("ANSWERS", "UNRELATED")).toEqual({ status: "conflict" });
    expect(resolveReviewers("", "")).toEqual({ status: "none" });
  });
});

function record(over: Partial<AuditRecord> = {}): AuditRecord {
  return {
    gapId: "g", title: "t", question: "q", oldLabel: "confirmed", gcpAtT: "NO_ANSWER_FOUND",
    answersAtT: 0, pendingAtT: 0, failedQueriesAtT: 0, witnessAtT: null,
    answersAfterT: 0, pendingAfterT: 0, failedQueriesAfterT: 0, witnessAfterT: null,
    reviewer1AtT: "", reviewer2AtT: "", reviewer1AfterT: "", reviewer2AfterT: "",
    ...over,
  };
}

describe("scoreRecord", () => {
  it("is fail-closed: pending or failed searches are unresolved, not no_answer", () => {
    expect(scoreRecord(record({ pendingAtT: 2 }), true).atT).toBe("unresolved");
    expect(scoreRecord(record({ failedQueriesAtT: 1 }), true).atT).toBe("unresolved");
    expect(scoreRecord(record({ failedQueriesAfterT: 1 }), true).after).toBe("unknown");
    expect(scoreRecord(record(), true)).toMatchObject({ atT: "no_answer", after: "not_filled" });
  });

  it("an answer beats pending documents", () => {
    expect(scoreRecord(record({ answersAtT: 1, pendingAtT: 4, witnessAtT: witness, gcpAtT: "CLOSED" }), false).atT).toBe("answered");
  });

  it("lets two reviewers confirm or overturn the witness", () => {
    const base = { answersAtT: 1, witnessAtT: witness, gcpAtT: "CLOSED" as const };
    expect(scoreRecord(record({ ...base, reviewer1AtT: "ANSWERS", reviewer2AtT: "ANSWERS" }), true)).toMatchObject({ atT: "answered", atTBy: "HUMAN" });
    expect(scoreRecord(record({ ...base, reviewer1AtT: "PARTIAL", reviewer2AtT: "UNRELATED" }), true)).toMatchObject({ atT: "disputed" });
    expect(scoreRecord(record({ ...base, reviewer1AtT: "UNRELATED", reviewer2AtT: "UNRELATED" }), true)).toMatchObject({ atT: "no_answer", atTBy: "HUMAN" });
    // AI-only scoring ignores the human cells
    expect(scoreRecord(record({ ...base, reviewer1AtT: "UNRELATED", reviewer2AtT: "UNRELATED" }), false)).toMatchObject({ atT: "answered", atTBy: "AI" });
  });

  it("does not turn a rejected witness into no_answer when other answers or pending documents remain", () => {
    const rejected = { witnessAtT: witness, gcpAtT: "CLOSED" as const, reviewer1AtT: "PARTIAL", reviewer2AtT: "PARTIAL" };
    expect(scoreRecord(record({ ...rejected, answersAtT: 2 }), true).atT).toBe("unresolved");
    expect(scoreRecord(record({ ...rejected, answersAtT: 1, pendingAtT: 1 }), true).atT).toBe("unresolved");
  });

  it("applies the same rules after T", () => {
    const base = { answersAfterT: 1, witnessAfterT: witness };
    expect(scoreRecord(record({ ...base, reviewer1AfterT: "ANSWERS" }), true)).toMatchObject({ after: "filled", afterBy: "HUMAN" });
    expect(scoreRecord(record({ ...base, reviewer1AfterT: "UNRELATED", reviewer2AfterT: "UNRELATED" }), true).after).toBe("not_filled");
    expect(scoreRecord(record({ ...base, answersAfterT: 3, reviewer1AfterT: "UNRELATED", reviewer2AfterT: "UNRELATED" }), true).after).toBe("unknown");
  });
});

describe("computeRetroMetrics", () => {
  const records = [
    record({ gapId: "1", oldLabel: "confirmed", gcpAtT: "CLOSED", answersAtT: 1, witnessAtT: witness }),
    record({ gapId: "2", oldLabel: "confirmed", gcpAtT: "CLOSED", answersAtT: 1, witnessAtT: witness }),
    record({ gapId: "3", oldLabel: "confirmed", gcpAtT: "NO_ANSWER_FOUND", answersAfterT: 1, witnessAfterT: witness }),
    record({ gapId: "4", oldLabel: "confirmed", gcpAtT: "NEEDS_REVIEW", failedQueriesAtT: 1 }),
    record({ gapId: "5", oldLabel: "weak", gcpAtT: "OPEN_CERTIFIED" }),
    record({ gapId: "6", oldLabel: "none", gcpAtT: "OPEN_CERTIFIED", failedQueriesAfterT: 1 }),
    record({ gapId: "7", oldLabel: "weak", gcpAtT: "CLOSED", answersAtT: 1, witnessAtT: witness }),
  ];

  it("counts the old-rule false novelty that GCP finds at T", () => {
    const metrics = computeRetroMetrics(records, { useHuman: false });
    expect(metrics.n).toBe(7);
    expect(metrics.oldLabels).toEqual({ confirmed: 4, weak: 2, none: 1, error: 0 });
    expect(metrics.gcpStates).toMatchObject({ CLOSED: 3, NO_ANSWER_FOUND: 1, NEEDS_REVIEW: 1, OPEN_CERTIFIED: 2, ABSTAIN: 0 });
    expect(metrics.atT).toEqual({ answered: 3, no_answer: 3, unresolved: 1, disputed: 0 });
    expect(metrics.oldConfirmed.n).toBe(4);
    expect(metrics.oldConfirmed.answeredAtT).toMatchObject({ x: 2, m: 4, estimate: 0.5 });
    expect(metrics.oldConfirmed.answeredAtT.upper).toBe(clopperPearsonUpper(2, 4, 0.025));
    expect(metrics.oldConfirmed.unresolvedAtT).toBe(1);
    expect(metrics.crossTab.confirmed).toEqual({ answered: 2, no_answer: 1, unresolved: 1, disputed: 0 });
  });

  it("reports the after-T share among gaps with no answer at T and keeps unknowns out of the ratio", () => {
    const metrics = computeRetroMetrics(records, { useHuman: false });
    expect(metrics.noAnswerAtT.n).toBe(3);
    expect(metrics.noAnswerAtT.filledAfter).toMatchObject({ x: 1, m: 2 });
    expect(metrics.noAnswerAtT.unknownAfter).toBe(1);
    expect(metrics.noAnswerAtT.byOldLabel.confirmed).toMatchObject({ x: 1, m: 1 });
    expect(metrics.noAnswerAtT.byOldLabel.other).toMatchObject({ x: 0, m: 1 });
    expect(metrics.noAnswerAtT.certified.n).toBe(2);
  });

  it("uses human labels and Cohen's kappa when the audit is filled", () => {
    const filled = records.map((r) => (r.gapId === "1" ? { ...r, reviewer1AtT: "ANSWERS", reviewer2AtT: "ANSWERS" }
      : r.gapId === "2" ? { ...r, reviewer1AtT: "UNRELATED", reviewer2AtT: "UNRELATED" }
      : r.gapId === "7" ? { ...r, reviewer1AtT: "ANSWERS", reviewer2AtT: "PARTIAL" }
      : r.gapId === "3" ? { ...r, reviewer1AfterT: "PARTIAL", reviewer2AfterT: "PARTIAL" }
      : r));
    const metrics = computeRetroMetrics(filled, { useHuman: true });
    // gap 2 is overturned (no answer), gap 7 is disputed
    expect(metrics.atT).toEqual({ answered: 1, no_answer: 4, unresolved: 1, disputed: 1 });
    expect(metrics.oldConfirmed.answeredAtT).toMatchObject({ x: 1, m: 4 });
    // gap 3's later answer is rejected by both reviewers; gap 2 joins the no-answer group
    expect(metrics.noAnswerAtT.filledAfter).toMatchObject({ x: 0, m: 3 });
    expect(metrics.humanCells).toEqual({ witnessCells: 4, labelledCells: 8, reviewed: 4 });
    expect(metrics.agreement.atT).toMatchObject({ pairs: 3, disagreements: 1 });
    expect(metrics.agreement.afterT).toMatchObject({ pairs: 1, disagreements: 0 });
    expect(metrics.agreement.pooled.pairs).toBe(4);
    expect(metrics.agreement.atT.kappa).not.toBeNull();
    // the AI-only view of the same file ignores the human cells entirely
    expect(computeRetroMetrics(filled, { useHuman: false }).atT).toEqual({ answered: 3, no_answer: 3, unresolved: 1, disputed: 0 });
    expect(computeRetroMetrics(filled, { useHuman: false }).humanCells.labelledCells).toBe(0);
  });

  it("computes kappa by hand on a small example", () => {
    // two labels agree 3 of 4 times: p_o = 0.75; reviewer 1: A,A,A,U ; reviewer 2: A,A,P,U
    const cells = [["ANSWERS", "ANSWERS"], ["ANSWERS", "ANSWERS"], ["ANSWERS", "PARTIAL"], ["UNRELATED", "UNRELATED"]] as const;
    const rows = cells.map(([a, b], i) => record({ gapId: String(i), answersAtT: 1, witnessAtT: witness, reviewer1AtT: a, reviewer2AtT: b }));
    const { kappa, pairs } = computeRetroMetrics(rows, { useHuman: true }).agreement.atT;
    // p_e = 0.75*0.5 + 0.25*0 + 0*0.25 + ... = A: 3/4*2/4 = 0.375, P: 0*1/4 = 0, U: 1/4*1/4 = 0.0625 -> 0.4375
    // kappa = (0.75 - 0.4375) / (1 - 0.4375) = 0.5556
    expect(pairs).toBe(4);
    expect(kappa).toBeCloseTo(0.5556, 3);
  });

  it("handles an empty experiment", () => {
    const metrics = computeRetroMetrics([], { useHuman: true });
    expect(metrics.n).toBe(0);
    expect(metrics.oldConfirmed.answeredAtT.estimate).toBeNull();
    expect(metrics.agreement.pooled.kappa).toBeNull();
  });
});

describe("renderSummaryMarkdown", () => {
  const rows = [
    record({ gapId: "1", oldLabel: "confirmed", gcpAtT: "CLOSED", answersAtT: 1, witnessAtT: witness }),
    record({ gapId: "2", oldLabel: "confirmed" }),
  ];

  it("states that AI labels are provisional until the audit is filled", () => {
    const text = renderSummaryMarkdown(computeRetroMetrics(rows, { useHuman: false }), { cutoff: 2018, generatedAt: "2026-10-15T00:00:00Z" });
    expect(text).toContain("PROVISIONAL");
    expect(text).toContain("2018");
    expect(text).toContain("1/2 = 50.0%");
    expect(text).toContain("LOWER bound");
    expect(text).toContain("Clopper-Pearson");
  });

  it("stays provisional when the reviewer columns are empty even in scoring mode", () => {
    const text = renderSummaryMarkdown(computeRetroMetrics(rows, { useHuman: true }), { generatedAt: "now" });
    expect(text).toContain("PROVISIONAL");
  });

  it("switches to the audited status once reviewers have labelled witnesses", () => {
    const filled = rows.map((r) => (r.gapId === "1" ? { ...r, reviewer1AtT: "ANSWERS", reviewer2AtT: "ANSWERS" } : r));
    const text = renderSummaryMarkdown(computeRetroMetrics(filled, { useHuman: true }), { generatedAt: "now" });
    expect(text).toContain("partly audited");
    expect(text).not.toContain("Status: PROVISIONAL");
    expect(text).toContain("kappa");
  });
});

describe("parseRetroArgs", () => {
  it("requires a cutoff and applies the defaults", () => {
    expect(() => parseRetroArgs([], 2026)).toThrow(/--cutoff/);
    expect(parseRetroArgs(["--cutoff", "2018"], 2026)).toEqual({
      mode: "run", cutoff: 2018, limit: 20, gapIds: [], topic: undefined, out: "./gap-closure-retro-2018", openalex: true,
      maxQueries: undefined, coverageId: undefined, calibrationId: undefined, auditPath: undefined,
    });
  });

  it("parses every option, in both forms", () => {
    const args = parseRetroArgs(["--cutoff=2015", "--limit", "5", "--gap-ids", "a, b,c", "--out", "out dir", "--no-openalex", "--max-queries", "2", "--coverage-id", "cov", "--calibration-id=cal"], 2026);
    expect(args).toMatchObject({ cutoff: 2015, limit: 5, gapIds: ["a", "b", "c"], out: "out dir", openalex: false, maxQueries: 2, coverageId: "cov", calibrationId: "cal" });
    expect(parseRetroArgs(["--cutoff", "2015", "--topic", " learning analytics "], 2026).topic).toBe("learning analytics");
  });

  it("rejects bad input", () => {
    expect(() => parseRetroArgs(["--cutoff", "abc"], 2026)).toThrow(/whole number/);
    expect(() => parseRetroArgs(["--cutoff", "2026"], 2026)).toThrow(/before 2026/);
    expect(() => parseRetroArgs(["--cutoff", "2018", "--limit", "0"], 2026)).toThrow(/between/);
    expect(() => parseRetroArgs(["--cutoff", "2018", "--max-queries", "9"], 2026)).toThrow(/between/);
    expect(() => parseRetroArgs(["--cutoff", "2018", "--gap-ids", "a", "--topic", "x"], 2026)).toThrow(/not both/);
    expect(() => parseRetroArgs(["--cutoff", "2018", "--wat"], 2026)).toThrow(/Unknown option/);
    expect(() => parseRetroArgs(["--cutoff"], 2026)).toThrow(/needs a value/);
    expect(() => parseRetroArgs(["--cutoff", "2018", "--out", "--limit"], 2026)).toThrow(/needs a value/);
    expect(() => parseRetroArgs(["2018"], 2026)).toThrow(/Unexpected/);
  });

  it("score mode needs only the audit file", () => {
    expect(parseRetroArgs(["--score-audit", "audit.csv"], 2026)).toMatchObject({ mode: "score", auditPath: "audit.csv", cutoff: undefined, out: undefined });
    expect(parseRetroArgs(["--score-audit", "audit.csv", "--out", "x"], 2026).out).toBe("x");
  });
});
