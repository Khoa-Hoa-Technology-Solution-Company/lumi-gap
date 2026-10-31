import { describe, expect, it } from "vitest";
import {
  canExposeForumGap,
  canExposeForumProject,
  canShowAcademicIdentity,
  cleanForumText,
  countRawLinks,
  forumBodyHash,
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
    expect(canShowAcademicIdentity("MEMBERS_ONLY", false, false)).toBe(false);
    expect(canShowAcademicIdentity("MEMBERS_ONLY", true, false)).toBe(true);
    expect(canShowAcademicIdentity("PRIVATE", true, false)).toBe(false);
    expect(canShowAcademicIdentity(undefined, true, false)).toBe(false);
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
    expect(forumPublicSlug("Discussing LLM evaluation: Vietnamese results")).toBe("discussing-llm-evaluation-vietnamese-results");
    expect(forumPublicSlug("研究方法")).toBe("discussion");
    expect(forumPublicSlug("00000000-0000-4000-9000-000000000002")).toBe("00000000-0000-4000-9000-000000000002-discussion");
    expect(forumPublicSlug("abcdef123456abcdef123456")).toBe("abcdef123456abcdef123456-discussion");
    expect(forumPublicSlug("Đánh giá nghiên cứu")).toBe("danh-gia-nghien-cuu");
    expect(forumPublicSlug("Stable title")).toBe(forumPublicSlug("Stable title"));
    expect(forumPublicSlug("a ".repeat(250))).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(forumPublicSlug("a ".repeat(250)).length).toBeLessThanOrEqual(260);
  });
});

describe("link counting and duplicate hashing", () => {
  it("counts raw http(s) links and skips DOI hosts", () => {
    expect(countRawLinks("")).toBe(0);
    expect(countRawLinks("no links, just text about doi.org and example.com")).toBe(0);
    expect(countRawLinks("see https://example.org/a and http://example.net/b?x=1#y")).toBe(2);
    expect(countRawLinks("cited https://doi.org/10.1000/abc, https://dx.doi.org/10.1000/def and https://www.doi.org/10.1000/ghi")).toBe(0);
    expect(countRawLinks("mixed https://doi.org/10.1000/abc https://spam.example/x https://spam.example/y")).toBe(2);
    expect(countRawLinks("markdown [site](https://example.org/a) and <https://example.org/b>")).toBe(2);
    expect(countRawLinks("not a link: ftp://example.org and mailto:me@example.org")).toBe(0);
  });
  it("hashes the same text identically regardless of case, spacing and markup", () => {
    expect(forumBodyHash("Hello   World")).toBe(forumBodyHash("  hello world  "));
    expect(forumBodyHash("Hello <b>World</b>")).toBe(forumBodyHash("hello world"));
    expect(forumBodyHash("Hello World")).not.toBe(forumBodyHash("Hello World!"));
    expect(forumBodyHash("x")).toMatch(/^[a-f0-9]{64}$/);
  });
});
