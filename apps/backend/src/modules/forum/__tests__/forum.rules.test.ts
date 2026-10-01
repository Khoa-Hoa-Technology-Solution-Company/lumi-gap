import { describe, expect, it } from "vitest";
import {
  canExposeForumGap,
  canExposeForumProject,
  canShowAcademicIdentity,
  cleanForumText,
  isAllowedForumUrl,
  isValidForumDoi,
  normalizeForumPostType,
  normalizeForumTags,
} from "../forum.rules.js";
import { forumPublicSlug } from "../forum.service.js";

describe("forum domain rules", () => {
  it("normalizes duplicate tag variants to one canonical slug", () => {
    expect(normalizeForumTags(["#LLM", "llm", "  AI for SE  ", "AI-for-SE"])).toEqual([
      { name: "LLM", slug: "llm" },
      { name: "AI for SE", slug: "ai-for-se" },
    ]);
  });

  it("supports the four bounded academic thread types", () => {
    expect(normalizeForumPostType("paper_discussion")).toBe("PAPER_DISCUSSION");
    expect(normalizeForumPostType("research_gap_discussion")).toBe("RESEARCH_GAP_DISCUSSION");
    expect(normalizeForumPostType("unknown")).toBe("DISCUSSION");
  });

  it("never exposes private project or gap context", () => {
    expect(canExposeForumProject("PUBLIC_SUMMARY")).toBe(true);
    expect(canExposeForumProject("PRIVATE")).toBe(false);
    expect(canExposeForumGap(false)).toBe(false);
  });

  it("respects academic profile visibility", () => {
    expect(canShowAcademicIdentity("PUBLIC", false, false)).toBe(true);
    expect(canShowAcademicIdentity("MEMBERS", false, false)).toBe(false);
    expect(canShowAcademicIdentity("MEMBERS", true, false)).toBe(true);
    expect(canShowAcademicIdentity("PRIVATE", true, true)).toBe(true);
  });

  it("stores forum copy as safe plain text without executable HTML", () => {
    expect(cleanForumText("<script>alert(1)</script> Evidence p < 0.05\u0000")).toBe("alert(1) Evidence p < 0.05");
  });

  it("accepts structured DOI and web references but rejects unsafe URL schemes and credentials", () => {
    expect(isValidForumDoi("10.1145/1234.5678")).toBe(true);
    expect(isValidForumDoi("javascript:alert(1)")).toBe(false);
    expect(isAllowedForumUrl("https://doi.org/10.1145/1234.5678")).toBe(true);
    expect(isAllowedForumUrl("http://example.org/paper")).toBe(true);
    expect(isAllowedForumUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedForumUrl("https://user:secret@example.org/paper")).toBe(false);
  });

  it("creates stable readable thread slugs without exposing the full UUID", () => {
    expect(forumPublicSlug("Discussing LLM evaluation: Vietnamese results", "12345678-1234-4234-8234-123456789abc")).toBe("discussing-llm-evaluation-vietnamese-results-123456781234");
    expect(forumPublicSlug("研究方法", "12345678-1234-4234-8234-123456789abc")).toBe("discussion-123456781234");
  });
});
