import { describe, expect, it } from "vitest";
import {
  buildVocabulary, extractPostTopics, overfrequentTerms, postTopicRelevance, resolveTopicKey,
  type PostTopicInput, type VocabularySource,
} from "../personalization.topics.js";

const source = (overrides: Partial<VocabularySource> = {}): VocabularySource => ({ communityTopics: [], keywords: [], userTerms: [], ...overrides });
const post = (overrides: Partial<PostTopicInput> = {}): PostTopicInput => ({ tags: [], title: "", body: "", paperKeywordNames: [], ...overrides });

describe("topic extraction (spec tests 12-17, 29)", () => {
  it("12. title phrase r = 0.8, one body mention no match, two body mentions r = 0.3", () => {
    const vocab = buildVocabulary(source({ communityTopics: ["Graph neural networks"] }));
    expect(extractPostTopics(post({ title: "Using graph neural networks for chemistry" }), vocab)).toMatchObject({ derivedKeys: ["graph neural networks"], derivedWeights: [0.8] });
    expect(extractPostTopics(post({ title: "Chemistry", body: "We tried graph neural networks once." }), vocab).derivedKeys).toEqual([]);
    expect(extractPostTopics(post({ title: "Chemistry", body: "Graph neural networks here, and graph neural networks there." }), vocab))
      .toMatchObject({ derivedKeys: ["graph neural networks"], derivedWeights: [0.3] });
  });

  it("13. the same term as tag and title keeps r = 1.0 (max, not sum)", () => {
    const vocab = buildVocabulary(source({ communityTopics: ["Knowledge graphs"] }));
    const topics = extractPostTopics(post({ tags: ["Knowledge Graphs"], title: "Knowledge graphs in practice" }), vocab);
    expect(topics.topicKeys).toEqual(["knowledge graphs"]);
    expect(topics.derivedKeys).toEqual([]);
  });

  it("14. curated nlp matches 'NLP for ...' but not 'nlpx'; a Vietnamese title matches 'hoc may'", () => {
    const vocab = buildVocabulary(source({ communityTopics: ["NLP", "Học máy"] }));
    expect(extractPostTopics(post({ title: "NLP for legal text" }), vocab).derivedKeys).toEqual(["nlp"]);
    expect(extractPostTopics(post({ title: "nlpx is something else" }), vocab).derivedKeys).toEqual([]);
    expect(extractPostTopics(post({ title: "Học máy cho dữ liệu y tế" }), vocab).derivedKeys).toEqual(["hoc may"]);
  });

  it("15. generic terms never match, single-word user terms are not in V, multi-word user terms are, 1-char curated rejected", () => {
    const vocab = buildVocabulary(source({ communityTopics: ["Simulation", "Statistics", "x", "LLM"], userTerms: ["learning", "Knowledge Graphs"] }));
    expect(vocab.has("simulation")).toBe(false);
    expect(vocab.has("x")).toBe(false);
    expect(vocab.has("llm")).toBe(true);
    expect(vocab.has("learning")).toBe(false);
    expect(vocab.has("knowledge graphs")).toBe(true);
    expect(extractPostTopics(post({ title: "Simulation and statistics, learning" }), vocab).derivedKeys).toEqual([]);
  });

  it("a term that is both curated and user counts as curated", () => {
    const vocab = buildVocabulary(source({ userTerms: ["Knowledge Graphs"], communityTopics: ["knowledge graphs"] }));
    expect(vocab.get("knowledge graphs")!.curated).toBe(true);
  });

  it("keyword aliases map to the keyword name and merged keywords to the survivor; hidden ones are skipped", () => {
    const vocab = buildVocabulary(source({
      keywords: [
        { id: "1", keywordName: "Machine Learning", normalizedName: "machine learning", aliases: ["ml", "hoc may"], status: "active", mergedIntoId: null },
        { id: "2", keywordName: "Machine-learning", normalizedName: "machine learning x", aliases: [], status: "merged", mergedIntoId: "1" },
        { id: "3", keywordName: "Secret term", normalizedName: "secret term", aliases: [], status: "hidden", mergedIntoId: null },
      ],
    }));
    expect(resolveTopicKey("ML", vocab)).toBe("machine learning");
    expect(resolveTopicKey("Machine-learning X", vocab)).toBe("machine learning");
    expect(resolveTopicKey("secret term", vocab)).toBeNull();
  });

  it("16. the over-frequent rule is off below 200 posts and on above, but never drops tags or community topics", () => {
    const vocab = buildVocabulary(source({ communityTopics: ["deep learning", "rare topic"] }));
    const corpus = (size: number) => Array.from({ length: size }, (_, index) => post({ title: index < size * 0.2 ? "About deep learning" : "Other title" }));
    expect(overfrequentTerms(corpus(100), vocab).size).toBe(0);
    const dropped = overfrequentTerms(corpus(200), vocab);
    expect([...dropped]).toEqual(["deep learning"]);
    expect(extractPostTopics(post({ title: "Intro to deep learning" }), vocab, dropped).derivedKeys).toEqual([]);
    expect(extractPostTopics(post({ title: "Intro", tags: ["Deep Learning"] }), vocab, dropped).topicKeys).toEqual(["deep learning"]);
    expect(extractPostTopics(post({ title: "Intro", paperKeywordNames: ["Deep learning"] }), vocab, dropped).derivedWeights).toEqual([0.6]);
    const joined = postTopicRelevance({ topicKeys: [], derivedTopicKeys: [], derivedTopicWeights: [], communityTopics: ["Deep Learning"] }, vocab);
    expect(joined).toEqual([{ key: "deep learning", r: 0.5 }]);
  });

  it("17. a community topic joins at r = 0.5 and a post-specific title topic outranks it", () => {
    const vocab = buildVocabulary(source({ communityTopics: ["Computer vision", "Image segmentation"] }));
    const stored = extractPostTopics(post({ title: "Image segmentation tricks" }), vocab);
    const full = postTopicRelevance({ topicKeys: stored.topicKeys, derivedTopicKeys: stored.derivedKeys, derivedTopicWeights: stored.derivedWeights, communityTopics: ["Computer vision", "Image segmentation"] }, vocab);
    expect(full).toEqual([{ key: "image segmentation", r: 0.8 }, { key: "computer vision", r: 0.5 }]);
  });

  it("keeps at most 8 topics, highest relevance first", () => {
    const names = Array.from({ length: 12 }, (_, index) => `topic number ${String.fromCharCode(97 + index)}`);
    const vocab = buildVocabulary(source({ communityTopics: names }));
    const result = extractPostTopics(post({ title: names.join(" ") }), vocab);
    expect(result.derivedKeys).toHaveLength(8);
  });

  it("29. paper keyword source: keyword_name 'Machine Learning' (no keyword id) gives 'machine learning' with r = 0.6", () => {
    const vocab = buildVocabulary(source({ communityTopics: ["Machine learning"] }));
    expect(extractPostTopics(post({ title: "A question", paperKeywordNames: ["Machine Learning"] }), vocab))
      .toMatchObject({ derivedKeys: ["machine learning"], derivedWeights: [0.6] });
  });
});
