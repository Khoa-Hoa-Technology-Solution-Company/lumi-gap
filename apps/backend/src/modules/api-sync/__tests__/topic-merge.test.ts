import { describe, expect, it } from "vitest";
import { shouldReplaceTopics } from "../topic-merge.js";

describe("shouldReplaceTopics", () => {
  it("replaces when incoming topics add OpenAlex hierarchy to an existing topic", () => {
    expect(
      shouldReplaceTopics(
        [{ topicName: "Pharmaceutical studies and practices", detectedBy: "openalex" }],
        [
          {
            openalexTopicId: "T12547",
            topicName: "Pharmaceutical studies and practices",
            detectedBy: "openalex",
            confidence: 0.98,
            isPrimary: true,
            subfieldId: "2735",
            subfieldName: "Pediatrics, Perinatology and Child Health",
            fieldId: "27",
            fieldName: "Medicine",
            domainId: "4",
            domainName: "Health Sciences",
          },
        ],
      ),
    ).toBe(true);
  });

  it("keeps existing topics when incoming data is not richer", () => {
    const topics = [
      {
        openalexTopicId: "T12547",
        topicName: "Pharmaceutical studies and practices",
        detectedBy: "openalex",
        confidence: 0.98,
        isPrimary: true,
        subfieldName: "Pediatrics, Perinatology and Child Health",
        fieldName: "Medicine",
        domainName: "Health Sciences",
      },
    ];

    expect(shouldReplaceTopics(topics, topics)).toBe(false);
  });
});
