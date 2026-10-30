import { describe, expect, it } from "vitest";
import {
  calculateContributionMatrix,
  createDefaultContributionMatrixCategories,
  formatBasisPointsAsPercentage,
} from "../contribution-matrix.calculator.js";

describe("contribution-matrix.calculator", () => {
  const memberA = "00000000-0000-4000-8000-000000000001";
  const memberB = "00000000-0000-4000-8000-000000000002";
  const memberC = "00000000-0000-4000-8000-000000000003";
  const roster = [memberA, memberB, memberC];

  it("creates a default 4-category contribution matrix with weights summing to 100%", () => {
    const defaults = createDefaultContributionMatrixCategories(roster);
    expect(defaults).toHaveLength(4);
    expect(defaults.map((c) => c.category)).toEqual([
      "CONCEPTUALIZATION_METHODOLOGY",
      "LITERATURE_DATA",
      "EXECUTION_VALIDATION",
      "WRITING_REVISION",
    ]);
    expect(defaults.reduce((sum, c) => sum + c.weightBasisPoints, 0)).toBe(10000);
  });

  it("calculates the exact specification example: A 45.5%, B 36%, C 18.5% totaling 100%", () => {
    const result = calculateContributionMatrix({
      rosterUserIds: roster,
      categories: [
        {
          category: "CONCEPTUALIZATION_METHODOLOGY",
          weightBasisPoints: 2500, // 25%
          shares: [
            { userId: memberA, basisPoints: 5000 }, // 50%
            { userId: memberB, basisPoints: 3000 }, // 30%
            { userId: memberC, basisPoints: 2000 }, // 20%
          ],
        },
        {
          category: "LITERATURE_DATA",
          weightBasisPoints: 2000, // 20%
          shares: [
            { userId: memberA, basisPoints: 4000 }, // 40%
            { userId: memberB, basisPoints: 4000 }, // 40%
            { userId: memberC, basisPoints: 2000 }, // 20%
          ],
        },
        {
          category: "EXECUTION_VALIDATION",
          weightBasisPoints: 3500, // 35%
          shares: [
            { userId: memberA, basisPoints: 6000 }, // 60%
            { userId: memberB, basisPoints: 3000 }, // 30%
            { userId: memberC, basisPoints: 1000 }, // 10%
          ],
        },
        {
          category: "WRITING_REVISION",
          weightBasisPoints: 2000, // 20%
          shares: [
            { userId: memberA, basisPoints: 2000 }, // 20%
            { userId: memberB, basisPoints: 5000 }, // 50%
            { userId: memberC, basisPoints: 3000 }, // 30%
          ],
        },
      ],
    });

    const totalsById = new Map(result.matrix.memberTotals.map((m) => [m.userId, m]));
    expect(totalsById.get(memberA)?.basisPoints).toBe(4550);
    expect(totalsById.get(memberA)?.percentage).toBe("45.5%");

    expect(totalsById.get(memberB)?.basisPoints).toBe(3600);
    expect(totalsById.get(memberB)?.percentage).toBe("36%");

    expect(totalsById.get(memberC)?.basisPoints).toBe(1850);
    expect(totalsById.get(memberC)?.percentage).toBe("18.5%");

    const sumBp = result.shares.reduce((s, x) => s + x.basisPoints, 0);
    expect(sumBp).toBe(10000);
    expect(formatBasisPointsAsPercentage(sumBp)).toBe("100%");
  });

  it("allows a non-applicable category to have 0% weight when explicit redistribution reason is provided", () => {
    const result = calculateContributionMatrix({
      rosterUserIds: [memberA, memberB],
      categories: [
        {
          category: "CONCEPTUALIZATION_METHODOLOGY",
          weightBasisPoints: 4000,
          shares: [
            { userId: memberA, basisPoints: 5000 },
            { userId: memberB, basisPoints: 5000 },
          ],
        },
        {
          category: "LITERATURE_DATA",
          weightBasisPoints: 6000,
          shares: [
            { userId: memberA, basisPoints: 7500 },
            { userId: memberB, basisPoints: 2500 },
          ],
        },
        {
          category: "EXECUTION_VALIDATION",
          weightBasisPoints: 0,
          zeroWeightReason: "Theoretical synthesis project with no empirical execution phase",
          shares: [
            { userId: memberA, basisPoints: 0 },
            { userId: memberB, basisPoints: 0 },
          ],
        },
        {
          category: "WRITING_REVISION",
          weightBasisPoints: 0,
          zeroWeightReason: "Pre-manuscript scoping period prior to drafting",
          shares: [
            { userId: memberA, basisPoints: 0 },
            { userId: memberB, basisPoints: 0 },
          ],
        },
      ],
    });

    expect(result.shares.find((s) => s.userId === memberA)?.basisPoints).toBe(6500); // 20% + 45% = 65%
    expect(result.shares.find((s) => s.userId === memberB)?.basisPoints).toBe(3500); // 20% + 15% = 35%
  });

  it("rejects invalid category weight totals, invalid category share totals, and missing 0% weight reasons", () => {
    // Category weights sum to 90% instead of 100%
    expect(() =>
      calculateContributionMatrix({
        rosterUserIds: [memberA, memberB],
        categories: [
          {
            category: "CONCEPTUALIZATION_METHODOLOGY",
            weightBasisPoints: 2000,
            shares: [
              { userId: memberA, basisPoints: 5000 },
              { userId: memberB, basisPoints: 5000 },
            ],
          },
          {
            category: "LITERATURE_DATA",
            weightBasisPoints: 2000,
            shares: [
              { userId: memberA, basisPoints: 5000 },
              { userId: memberB, basisPoints: 5000 },
            ],
          },
          {
            category: "EXECUTION_VALIDATION",
            weightBasisPoints: 3000,
            shares: [
              { userId: memberA, basisPoints: 5000 },
              { userId: memberB, basisPoints: 5000 },
            ],
          },
          {
            category: "WRITING_REVISION",
            weightBasisPoints: 2000,
            shares: [
              { userId: memberA, basisPoints: 5000 },
              { userId: memberB, basisPoints: 5000 },
            ],
          },
        ],
      }),
    ).toThrow(/Category weights must sum to 100%/);

    // Member shares within an active category sum to 90% instead of 100%
    expect(() =>
      calculateContributionMatrix({
        rosterUserIds: [memberA, memberB],
        categories: [
          {
            category: "CONCEPTUALIZATION_METHODOLOGY",
            weightBasisPoints: 2500,
            shares: [
              { userId: memberA, basisPoints: 4000 },
              { userId: memberB, basisPoints: 5000 },
            ],
          },
          {
            category: "LITERATURE_DATA",
            weightBasisPoints: 2500,
            shares: [
              { userId: memberA, basisPoints: 5000 },
              { userId: memberB, basisPoints: 5000 },
            ],
          },
          {
            category: "EXECUTION_VALIDATION",
            weightBasisPoints: 2500,
            shares: [
              { userId: memberA, basisPoints: 5000 },
              { userId: memberB, basisPoints: 5000 },
            ],
          },
          {
            category: "WRITING_REVISION",
            weightBasisPoints: 2500,
            shares: [
              { userId: memberA, basisPoints: 5000 },
              { userId: memberB, basisPoints: 5000 },
            ],
          },
        ],
      }),
    ).toThrow(/Member shares in "Conceptualization & Methodology" must sum to 100%/);

    // 0% weight category without zeroWeightReason
    expect(() =>
      calculateContributionMatrix({
        rosterUserIds: [memberA],
        categories: [
          {
            category: "CONCEPTUALIZATION_METHODOLOGY",
            weightBasisPoints: 10000,
            shares: [{ userId: memberA, basisPoints: 10000 }],
          },
          {
            category: "LITERATURE_DATA",
            weightBasisPoints: 0,
            zeroWeightReason: "",
            shares: [{ userId: memberA, basisPoints: 0 }],
          },
          {
            category: "EXECUTION_VALIDATION",
            weightBasisPoints: 0,
            zeroWeightReason: "Not applicable in this phase",
            shares: [{ userId: memberA, basisPoints: 0 }],
          },
          {
            category: "WRITING_REVISION",
            weightBasisPoints: 0,
            zeroWeightReason: "Not applicable in this phase",
            shares: [{ userId: memberA, basisPoints: 0 }],
          },
        ],
      }),
    ).toThrow(/has 0% weight and requires an explicit explanation/);
  });

  it("handles fractional basis-point remainders deterministically so displayed percentages always total 100%", () => {
    // Weights: 33.33% (3333), 33.33% (3333), 33.34% (3334), 0% (0)
    // Shares create non-integer basis point products that require largest-remainder rounding
    const result = calculateContributionMatrix({
      rosterUserIds: roster,
      categories: [
        {
          category: "CONCEPTUALIZATION_METHODOLOGY",
          weightBasisPoints: 3333,
          shares: [
            { userId: memberA, basisPoints: 3334 },
            { userId: memberB, basisPoints: 3333 },
            { userId: memberC, basisPoints: 3333 },
          ],
        },
        {
          category: "LITERATURE_DATA",
          weightBasisPoints: 3333,
          shares: [
            { userId: memberA, basisPoints: 3333 },
            { userId: memberB, basisPoints: 3334 },
            { userId: memberC, basisPoints: 3333 },
          ],
        },
        {
          category: "EXECUTION_VALIDATION",
          weightBasisPoints: 3334,
          shares: [
            { userId: memberA, basisPoints: 3333 },
            { userId: memberB, basisPoints: 3333 },
            { userId: memberC, basisPoints: 3334 },
          ],
        },
        {
          category: "WRITING_REVISION",
          weightBasisPoints: 0,
          zeroWeightReason: "No manuscript writing in this sprint",
          shares: [
            { userId: memberA, basisPoints: 0 },
            { userId: memberB, basisPoints: 0 },
            { userId: memberC, basisPoints: 0 },
          ],
        },
      ],
    });

    const totalBp = result.shares.reduce((s, x) => s + x.basisPoints, 0);
    expect(totalBp).toBe(10000);
    // Member C has slightly higher raw product (3333*3333 + 3333*3333 + 3334*3334 = 33,333,334 vs 33,333,333)
    expect(result.shares.map((s) => s.basisPoints)).toEqual([3333, 3333, 3334]);
  });
});

