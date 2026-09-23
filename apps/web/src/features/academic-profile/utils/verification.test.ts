import { describe, expect, it } from "vitest";
import { canShowVerifiedLecturerBadge } from "./verification";

describe("verified lecturer badge", () => {
  it("renders only for backend VERIFIED status", () => {
    expect(canShowVerifiedLecturerBadge("VERIFIED")).toBe(true);
    expect(canShowVerifiedLecturerBadge("SELF_DECLARED")).toBe(false);
    expect(canShowVerifiedLecturerBadge("PENDING")).toBe(false);
    expect(canShowVerifiedLecturerBadge("REJECTED")).toBe(false);
    expect(canShowVerifiedLecturerBadge(undefined)).toBe(false);
  });
});
