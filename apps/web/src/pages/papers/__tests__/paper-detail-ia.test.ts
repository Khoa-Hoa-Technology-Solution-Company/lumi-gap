import { describe, expect, it } from "vitest";
import type { PaperTopic } from "@trend/shared-types";
import {
  formatImpactScoreBasis,
  formatResearchSignalScore,
} from "@/features/papers/components/paper-detail/paper-research-signals-section";
import { formatIndexedCitationCoverage } from "@/features/papers/components/paper-detail/paper-relationships-section";
import {
  getBestTaxonomyTopic,
  getReviewFormDraft,
} from "@/features/papers/components/paper-detail/paper-metadata-sidebar";
import { formatTranslationSourceLabel } from "@/features/papers/components/paper-detail/paper-reading-section";

describe("Paper Detail Information Architecture Contracts & Formats", () => {
  it("formats deterministic research signal score scale as 0..100 integer percentage", () => {
    expect(formatResearchSignalScore(0.84)).toBe("84 / 100");
    expect(formatResearchSignalScore(0.999)).toBe("100 / 100");
    expect(formatResearchSignalScore(0.001)).toBe("0 / 100");
  });

  it("formats score basis string accurately per OpenAlex authority", () => {
    expect(formatImpactScoreBasis("openalex-percentile-fwci")).toBe("OpenAlex citation percentile and FWCI");
    expect(formatImpactScoreBasis("openalex-fwci")).toBe("OpenAlex FWCI normalized by field");
    expect(formatImpactScoreBasis("citations-per-year-fallback")).toBe("Citations per year fallback");
  });

  it("formats indexed citation coverage accurately", () => {
    expect(formatIndexedCitationCoverage(12, 60)).toBe("12 of 60 citations indexed (20%)");
    expect(formatIndexedCitationCoverage(0, 0)).toBe("OpenAlex did not provide a reference count for this work.");
    expect(formatIndexedCitationCoverage(5, undefined)).toBe("OpenAlex did not provide a reference count for this work.");
  });

  it("prioritizes the primary taxonomy topic when multiple topics have hierarchy metadata", () => {
    const topics: PaperTopic[] = [
      {
        topicId: "t1",
        topicName: "Secondary AI",
        subfieldId: "s1",
        subfieldName: "Artificial Intelligence",
      },
      {
        topicId: "t2",
        topicName: "Primary Medicine",
        isPrimary: true,
        subfieldId: "s2",
        subfieldName: "Clinical Medicine",
      },
    ];
    const best = getBestTaxonomyTopic(topics);
    expect(best?.topicName).toBe("Primary Medicine");
    expect(best?.subfieldName).toBe("Clinical Medicine");
  });

  it("never replaces the primary topic with a secondary topic just to fill hierarchy fields", () => {
    const topics: PaperTopic[] = [
      {
        topicId: "t1",
        topicName: "Primary Unclassified",
        isPrimary: true,
      },
      {
        topicId: "t2",
        topicName: "Secondary AI",
        subfieldId: "s1",
        subfieldName: "Artificial Intelligence",
      },
    ];

    expect(getBestTaxonomyTopic(topics)?.topicName).toBe("Primary Unclassified");
  });

  it("labels the actual translation source language instead of assuming English", () => {
    expect(formatTranslationSourceLabel("ru")).toBe("Russian");
    expect(formatTranslationSourceLabel(undefined)).toBe("the original language");
  });

  it("prefills the review form from the current user's existing review", () => {
    expect(getReviewFormDraft({ stars: 2, comment: "Needs a clearer dataset." })).toEqual({
      stars: 2,
      comment: "Needs a clearer dataset.",
    });
    expect(getReviewFormDraft(undefined)).toEqual({ stars: 0, comment: "" });
  });
});
