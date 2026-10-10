import { describe, expect, it } from "vitest";
import { countValidatingExperts } from "../validation-progress";

const record = (id: string, reviewer: string, action: string, minute: number) =>
  ({ id, action, createdAt: new Date(Date.UTC(2026, 9, 10, 0, minute)).toISOString(), reviewerId: { id: reviewer } }) as never;

describe("countValidatingExperts", () => {
  it("counts each expert once", () => {
    expect(countValidatingExperts([record("1", "e1", "VALIDATE", 0), record("2", "e1", "VALIDATE", 1), record("3", "e2", "VALIDATE", 2)])).toBe(2);
  });

  it("drops an expert who changed their mind", () => {
    expect(countValidatingExperts([record("1", "e1", "VALIDATE", 0), record("2", "e2", "VALIDATE", 1), record("3", "e1", "CHALLENGE", 2)])).toBe(1);
  });

  it("is zero without decisions", () => {
    expect(countValidatingExperts([])).toBe(0);
  });
});
