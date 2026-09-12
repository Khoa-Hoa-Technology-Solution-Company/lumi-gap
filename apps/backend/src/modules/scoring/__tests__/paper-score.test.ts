import { describe, expect, it } from "vitest";
import { computePaperScore, PAPER_SCORE_VERSION } from "../paper-score.js";

const NOW = 2026;
const AT = "2026-06-27T00:00:00.000Z";

describe("computePaperScore (v3)", () => {
  it("uses OpenAlex normalized citation percentile before raw citations when available", () => {
    const highFieldImpact = computePaperScore(
      {
        publicationYear: 2021,
        citationCount: 10,
        dataQualityScore: 1,
        citationNormalizedPercentile: { value: 0.96, isInTop1Percent: false, isInTop10Percent: true },
        fwci: 8,
      },
      NOW,
      AT,
    );
    const rawCitationOnly = computePaperScore(
      { publicationYear: 2021, citationCount: 10, dataQualityScore: 1 },
      NOW,
      AT,
    );

    expect(highFieldImpact.scoreBasis).toBe("openalex-percentile-fwci");
    expect(highFieldImpact.citationPercentileScore).toBe(0.96);
    expect(highFieldImpact.finalScore).toBeGreaterThan(rawCitationOnly.finalScore);
    expect(highFieldImpact.finalScore).toBeGreaterThanOrEqual(0.7);
  });

  it("does not over-score a paper with weak OpenAlex impact just because it is recent", () => {
    const weakExternalImpact = computePaperScore(
      {
        publicationYear: 2026,
        citationCount: 39,
        dataQualityScore: 1,
        citationNormalizedPercentile: { value: 0.05, isInTop1Percent: false, isInTop10Percent: false },
        fwci: 0,
      },
      NOW,
      AT,
    );

    expect(weakExternalImpact.scoreBasis).toBe("openalex-percentile-fwci");
    expect(weakExternalImpact.finalScore).toBeLessThan(0.4);
  });

  it("is age-fair: a recent paper out-scores an old paper with the SAME citations", () => {
    const recent = computePaperScore({ publicationYear: 2024, citationCount: 200, dataQualityScore: 1 }, NOW, AT);
    const old = computePaperScore({ publicationYear: 2010, citationCount: 200, dataQualityScore: 1 }, NOW, AT);
    expect(recent.citationImpactScore).toBeGreaterThan(old.citationImpactScore);
    expect(recent.finalScore).toBeGreaterThan(old.finalScore);
  });

  it("finalScore weights external impact highest, then recency, then a small metadata trust signal", () => {
    const s = computePaperScore({ publicationYear: 2026, citationCount: 0, dataQualityScore: 0 }, NOW, AT);
    // citations 0 → impact 0; recency 1 (current year) → finalScore ≈ 0.2
    expect(s.recencyScore).toBe(1);
    expect(s.citationImpactScore).toBe(0);
    expect(s.finalScore).toBeCloseTo(0.2, 5);
  });

  it("recency curve: current year = 1, -10y = 0, -5y = 0.5, unknown(0) = 0", () => {
    expect(computePaperScore({ publicationYear: 2026, citationCount: 0, dataQualityScore: 0 }, NOW, AT).recencyScore).toBe(1);
    expect(computePaperScore({ publicationYear: 2016, citationCount: 0, dataQualityScore: 0 }, NOW, AT).recencyScore).toBe(0);
    expect(computePaperScore({ publicationYear: 2021, citationCount: 0, dataQualityScore: 0 }, NOW, AT).recencyScore).toBe(0.5);
    expect(computePaperScore({ publicationYear: 0, citationCount: 0, dataQualityScore: 0 }, NOW, AT).recencyScore).toBe(0);
  });

  it("still exposes metadataQualityScore (= dataQualityScore) for display and traceability", () => {
    const s = computePaperScore({ publicationYear: 2020, citationCount: 10, dataQualityScore: 0.85 }, NOW, AT);
    expect(s.metadataQualityScore).toBe(0.85);
  });

  it("stamps the v3 version + computedAt", () => {
    const s = computePaperScore({ publicationYear: 2022, citationCount: 5, dataQualityScore: 0.5 }, NOW, AT);
    expect(s.modelVersion).toBe(PAPER_SCORE_VERSION);
    expect(PAPER_SCORE_VERSION).toBe("paper-score-v3");
    expect(s.computedAt).toBe(AT);
  });

  it("a future-dated paper scores recency 1 (not >1)", () => {
    const s = computePaperScore({ publicationYear: 2027, citationCount: 0, dataQualityScore: 0 }, NOW, AT);
    expect(s.recencyScore).toBe(1);
  });
});
