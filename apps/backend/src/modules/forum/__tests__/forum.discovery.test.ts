import { describe, expect, it } from "vitest";
import { forumDiscoveryTags, forumDiscoveryTerms, forumRelatedReason } from "../forum-discovery.js";

describe("Forum discovery is navigation, not evidence", () => {
  it("ignores generic research vocabulary and requires more than one title term", () => {
    expect(forumDiscoveryTags(["research", "Computing", "LLM", "llm"])).toEqual(["llm"]);
    expect(forumDiscoveryTerms("How should research evaluation outcomes be defined?")).toEqual([]);
    expect(forumRelatedReason({ title: "Research evaluation", tags: ["research"] }, { title: "Research evaluation", tags: ["computing"] })).toBeUndefined();
    expect(forumRelatedReason({ title: "Supernova redshift", tags: [] }, { title: "Supernova radiation", tags: [] })).toBeUndefined();
  });
  it("ranks actual public research context above tag and title similarity", () => {
    const source = { title: "Supernova redshift measurement", tags: ["Cosmology"], linkedPaperId: "paper", linkedResearchGapId: "gap" };
    expect(forumRelatedReason(source, { ...source, linkedPaperId: undefined })).toMatchObject({ reason: "SAME_GAP" });
    expect(forumRelatedReason(source, source)).toMatchObject({ reason: "SAME_PAPER" });
    expect(forumRelatedReason(source, { title: "Other subject", tags: ["cosmology"] })).toMatchObject({ reason: "SHARED_TAGS" });
    expect(forumRelatedReason(source, { title: "Redshift measurement errors", tags: [] })).toMatchObject({ reason: "SIMILAR_TOPIC" });
  });
});
