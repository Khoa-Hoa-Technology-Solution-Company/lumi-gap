import { describe, expect, it } from "vitest";

import { communityEmbeddingText } from "../community-embedding.service.js";

describe("communityEmbeddingText", () => {
  it("joins name, field, topics and description in order, skipping empty parts", () => {
    expect(communityEmbeddingText({
      name: "Machine Learning & AI",
      researchField: "Computer Science",
      researchTopics: ["deep learning", "neural networks"],
      description: "  Models that learn  ",
    })).toBe("Machine Learning & AI\nComputer Science\ndeep learning, neural networks\nModels that learn");
    expect(communityEmbeddingText({ name: "Only name", researchField: null, researchTopics: [], description: "" })).toBe("Only name");
  });

  it("caps the text at 2000 characters", () => {
    expect(communityEmbeddingText({ name: "x", description: "y".repeat(5000) })).toHaveLength(2000);
  });
});
