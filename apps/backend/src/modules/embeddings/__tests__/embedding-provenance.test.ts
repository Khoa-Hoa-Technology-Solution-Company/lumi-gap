import { describe, expect, it } from "vitest";
import {
  buildEmbeddingCandidateFilter,
  buildEmbeddingProvenance,
} from "../embedding.service.js";
import type { EmbeddingProvider } from "../embedding.provider.js";

const provider: EmbeddingProvider = {
  modelName: "gemini-embedding-2",
  modelVersion: "2026-07",
  dimensions: 768,
  embed: async () => [],
  embedBatch: async () => [],
};

describe("embedding provenance", () => {
  it("selects missing and stale vectors while retaining active quality gates", () => {
    expect(buildEmbeddingCandidateFilter(provider)).toEqual({
      isAiAnalyzable: true,
      dataStatus: "active",
      $or: [
        { embedding: { $exists: false } },
        { embeddingModel: { $ne: "gemini-embedding-2" } },
        { embeddingVersion: { $ne: "2026-07" } },
        { embeddingDimensions: { $ne: 768 } },
      ],
    });
  });

  it("records model, version, dimensions, and update time together", () => {
    const at = new Date("2026-07-29T00:00:00.000Z");

    expect(buildEmbeddingProvenance(provider, at)).toEqual({
      embeddingModel: "gemini-embedding-2",
      embeddingVersion: "2026-07",
      embeddingDimensions: 768,
      embeddingUpdatedAt: at,
    });
  });
});
