import { calculatePaperQuality } from "../src/modules/papers/paper-quality.js";

function runTests() {
  console.log("=== Testing Paper Quality & Tiering System ===");

  // Case 1: Minimal Invalid paper
  const case1 = {
    title: "Draft Title", // Too short or minimal
    abstractText: "Short abstract.",
    publicationYear: 2026,
    paperKind: "other",
  };
  const result1 = calculatePaperQuality(case1);
  console.log("\nCase 1 (Invalid):");
  console.log(`Quality Score: ${result1.qualityScore} / 100`);
  console.log(`Tier: ${result1.qualityTier} (Download Cost: ${result1.downloadCost}, Upload Reward: ${result1.uploadCreditReward})`);
  if (result1.qualityTier !== 0) console.error("Case 1 Failed! Expected Tier 0");

  // Case 2: High Quality Tier 4 paper
  const case2 = {
    title: "Attention Is All You Need and Transformer Architecture Analysis",
    authors: [
      { displayName: "Ashish Vaswani", position: 1 },
      { displayName: "Noam Shazeer", position: 2 },
    ],
    publicationYear: 2017,
    abstractText: "We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely. Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train. The code and dataset benchmarks are released at github.",
    paperKind: "article",
    doi: "10.1145/3065386",
    openAccessUrl: "https://arxiv.org/abs/1706.03762",
    keywords: [{ keywordName: "Transformers" }, { keywordName: "NLP" }],
    topics: [{ topicName: "Computer Science" }],
    pdfPath: "/uploads/attention.pdf",
    isDuplicate: false,
    needsDuplicateReview: false,
  };
  const result2 = calculatePaperQuality(case2);
  console.log("\nCase 2 (High Quality / Elite):");
  console.log(`Quality Score: ${result2.qualityScore} / 100`);
  console.log(`Tier: ${result2.qualityTier} (Download Cost: ${result2.downloadCost}, Reward: ${result2.uploadCreditReward})`);
  if (result2.qualityTier < 3) console.error("Case 2 Failed! Expected at least Tier 3 or 4");

  // Case 3: Academic Tier 2 paper
  const case3 = {
    title: "A Study of Machine Learning Classifiers",
    authors: [{ displayName: "John Doe", position: 1 }],
    publicationYear: 2022,
    abstractText: "This paper reviews several machine learning classifiers including decision trees, support vector machines, and neural networks. We present a survey of their performance on standard classification datasets. It provides a comprehensive analysis.",
    paperKind: "review",
    paperLink: "https://example.com/classifiers",
    keywords: [{ keywordName: "Machine Learning" }],
    topics: [{ topicName: "AI" }],
    pdfPath: "/uploads/study.pdf",
    isDuplicate: false,
    needsDuplicateReview: false,
  };
  const result3 = calculatePaperQuality(case3);
  console.log("\nCase 3 (Standard Academic):");
  console.log(`Quality Score: ${result3.qualityScore} / 100`);
  console.log(`Tier: ${result3.qualityTier} (Download Cost: ${result3.downloadCost}, Reward: ${result3.uploadCreditReward})`);
  
  console.log("\n=== Testing completed ===");
}

runTests();
