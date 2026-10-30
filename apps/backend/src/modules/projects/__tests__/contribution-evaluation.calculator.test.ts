import { describe, expect, it } from "vitest";
import { calculateContributionShares as calculate } from "../contribution-evaluation.calculator.js";
const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222", c = "33333333-3333-4333-8333-333333333333";
const outcome = (key: string, weight = 10, x = 6000) => ({ outcomeKey: key, weight, participation: [{ userId: a, basisPoints: x }, { userId: b, basisPoints: 10000 - x }] });
describe("weighted confirmed contribution calculation", () => {
  it("computes 60/40, preserves zero members and explains every score", () => {
    const result = calculate([a, b, c], [outcome("METHOD")]);
    expect(result.scores.map(s => s.basisPoints)).toEqual([6000, 4000, 0]);
    expect(result.scores[0]!.components[0]).toEqual({ outcomeKey: "METHOD", weight: 10, participationBasisPoints: 6000, rawScore: "60000" });
  });
  it("uses weights across outputs rather than averaging their percentages", () => {
    expect(calculate([a, b], [outcome("A", 1, 10000), outcome("B", 3, 0)]).scores.map(s => s.basisPoints)).toEqual([2500, 7500]);
  });
  it("distributes remainders deterministically, including equal scores", () => {
    const outcomes = [a, b, c].map((id, i) => ({ outcomeKey: String(i), weight: 1, participation: [{ userId: id, basisPoints: 10000 }] }));
    const expected = calculate([a, b, c], outcomes);
    expect(expected.scores.map(s => s.basisPoints)).toEqual([3334, 3333, 3333]);
    expect(calculate([c, a, b], [...outcomes].reverse())).toEqual(expected);
  });
  it("has no fabricated distribution without confirmed outputs", () => {
    const result = calculate([a, b], []); expect(result.status).toBe("INSUFFICIENT_DATA"); expect(result.scores.every(s => s.basisPoints === null)).toBe(true);
  });
  it("normalizes UUID casing before detecting duplicates and resolving ties", () => {
    const id = "abcdefab-abcd-4abc-8abc-abcdefabcdef";
    expect(calculate([id.toUpperCase()], [{ outcomeKey: "X", weight: 1, participation: [{ userId: id, basisPoints: 10000 }] }]).scores[0]).toMatchObject({ userId: id, basisPoints: 10000 });
    expect(() => calculate([id, id.toUpperCase()], [])).toThrow();
  });
  it("rejects duplicate outcomes, missing members and invalid participation", () => {
    for (const outputs of [[outcome("X"), outcome("X")], [outcome("X", 0)], [outcome("X", 101)], [{ ...outcome("X"), participation: [{ userId: a, basisPoints: 9999 }] }], [{ ...outcome("X"), participation: [{ userId: c, basisPoints: 10000 }] }], [{ ...outcome("X"), participation: [{ userId: a, basisPoints: 5000 }, { userId: a, basisPoints: 5000 }] }]]) expect(() => calculate([a, b], outputs)).toThrow();
    expect(() => calculate([a, a], [])).toThrow();
  });
  it("conserves exactly 10000 basis points across large varied inputs", () => {
    for (let n = 1; n <= 50; n++) {
      const outcomes = Array.from({ length: 501 + n }, (_, i) => outcome(String(i), (i % 100) + 1, (i * 7919 + n) % 10001));
      const result = calculate([a, b, c], outcomes);
      expect(result.scores.reduce((sum, s) => sum + s.basisPoints!, 0)).toBe(10000);
      expect(result.scores.every(s => Number.isInteger(s.basisPoints) && s.basisPoints! >= 0)).toBe(true);
    }
  });
});
