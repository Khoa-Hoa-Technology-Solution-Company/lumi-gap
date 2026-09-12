import { describe, expect, it } from "vitest";
import { formatPaperRequester } from "../paper-request";

describe("formatPaperRequester", () => {
  it("renders a populated requester using the human-readable name", () => {
    expect(
      formatPaperRequester({
        _id: "user-1",
        email: "researcher@example.com",
        fullName: "Researcher One",
        role: "researcher",
      }),
    ).toBe("Researcher One");
  });

  it("falls back to email and supports legacy string values", () => {
    expect(formatPaperRequester({ _id: "user-2", email: "fallback@example.com", role: "student" })).toBe(
      "fallback@example.com",
    );
    expect(formatPaperRequester("Legacy requester")).toBe("Legacy requester");
  });
});
