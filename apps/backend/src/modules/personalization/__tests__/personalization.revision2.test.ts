import { describe, expect, it } from "vitest";
import {
  assembleFeed, communityInputTopics, computeInterestProfile, heatOf, participantsOf, rankCommunities, rankPersonal, rankTiers, tierOf,
  type CommunityInterest, type InterestProfile, type ProfileInput, type ProfileTopic, type Signal, type WindowCandidate,
} from "../personalization.rules.js";
import type { SignalKind } from "../personalization.constants.js";
import type { TopicRelevance } from "../personalization.topics.js";

const NOW = new Date("2026-11-04T00:00:00.000Z");
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);
const sig = (postId: string, kind: SignalKind, days: number): Signal => ({ postId, kind, at: daysAgo(days) });
const one = (key: string): TopicRelevance[] => [{ key, r: 1 }];

function profileOf(overrides: Partial<ProfileInput> & { postTopics?: Record<string, TopicRelevance[]> } = {}) {
  const { postTopics = {}, ...rest } = overrides;
  return computeInterestProfile({
    now: NOW, signals: [], follows: [], profileInterests: [], communityInterests: [], mutedKeys: new Set(),
    labelOf: (key) => key.toUpperCase(), isMatchable: () => true, ...rest, postTopics: new Map(Object.entries(postTopics)),
  });
}
const community = (key: string, name: string, daysJoined: number, id = name): CommunityInterest => ({ key, label: key, community: { id, name }, joinedAt: daysAgo(daysJoined) });
const topic = (profile: InterestProfile, key: string) => profile.topics.find((item) => item.key === key);

describe("R6 joined communities as an interest source", () => {
  it("30. an active membership alone gives its topics source community, W = 0.5 and viaCommunity", () => {
    const profile = profileOf({ communityInterests: [community("nlp", "NLP Lab", 5), community("text mining", "NLP Lab", 5)] });
    expect(profile.topics.map((item) => item.key).sort()).toEqual(["nlp", "text mining"]);
    for (const item of profile.topics) expect(item).toMatchObject({ source: "community", weight: 0.5, lowConfidence: false, viaCommunity: { id: "NLP Lab", name: "NLP Lab" } });
  });

  it("31. followed beats community: source followed, W = 1 + s", () => {
    const profile = profileOf({
      follows: [{ key: "nlp", label: "NLP" }], communityInterests: [community("nlp", "NLP Lab", 5)],
      signals: [sig("p1", "comment", 100)], postTopics: { p1: one("nlp") },
    });
    const nlp = topic(profile, "nlp")!;
    expect(nlp.source).toBe("followed");
    expect(nlp.weight).toBeCloseTo(1 + nlp.score, 10);
    expect(nlp.viaCommunity).toBeUndefined();
  });

  it("31b. profile beats community too", () => {
    const profile = profileOf({ profileInterests: [{ key: "nlp", label: "NLP", matchable: true }], communityInterests: [community("nlp", "NLP Lab", 5)] });
    expect(topic(profile, "nlp")).toMatchObject({ source: "profile", weight: 1 });
  });

  it("32. community + inferred with s = 0.9: source community, W = 0.5 + 0.5 x 0.9 = 0.95", () => {
    const a = ["a1", "a2", "a3"].map((id) => sig(id, "comment", 100));
    const b = Array.from({ length: 10 }, (_, index) => sig(`b${index}`, "read", 100));
    const postTopics = Object.fromEntries([...a, ...b].map((signal) => [signal.postId, one(signal.postId.startsWith("a") ? "a" : "b")]));
    const profile = profileOf({ signals: [...a, ...b], postTopics, communityInterests: [community("a", "A Lab", 5)] });
    expect(topic(profile, "a")).toMatchObject({ source: "community" });
    expect(topic(profile, "a")!.score).toBeCloseTo(0.9, 10);
    expect(topic(profile, "a")!.weight).toBeCloseTo(0.95, 10);
    expect(topic(profile, "b")).toMatchObject({ source: "inferred", weight: 1 });
  });

  it("33. three communities with 50 topics each never push out pinned topics and stay within PROFILE_TOP_K", () => {
    const interests = ["one", "two", "three"].flatMap((name, index) => Array.from({ length: 50 }, (_, topicIndex) => community(`c${index}-t${topicIndex}`, name, index)));
    const profile = profileOf({
      communityInterests: interests, follows: [{ key: "f1", label: "F1" }, { key: "f2", label: "F2" }],
      profileInterests: [{ key: "p1", label: "P1", matchable: true }],
    });
    expect(profile.topics).toHaveLength(10);
    expect(profile.topics.filter((item) => item.source === "followed" || item.source === "profile")).toHaveLength(3);
    expect(profile.topics.filter((item) => item.source === "community")).toHaveLength(7);
    const manyFollows = profileOf({ communityInterests: interests, follows: Array.from({ length: 12 }, (_, index) => ({ key: `f${index}`, label: `F${index}` })) });
    expect(manyFollows.topics.filter((item) => item.source === "followed")).toHaveLength(12);
    expect(manyFollows.topics.some((item) => item.source === "community")).toBe(false);
  });

  it("35. a muted key from a joined community is absent", () => {
    const profile = profileOf({ communityInterests: [community("nlp", "NLP Lab", 5), community("vision", "Vision", 5)], mutedKeys: new Set(["nlp"]) });
    expect(profile.topics.map((item) => item.key)).toEqual(["vision"]);
  });

  it("topics outside the vocabulary are ignored", () => {
    const profile = profileOf({ communityInterests: [community("nlp", "NLP Lab", 5)], isMatchable: () => false });
    expect(profile.topics).toEqual([]);
  });

  it("36. viaCommunity is the most recently joined community that has the key, ties by name", () => {
    const recent = profileOf({ communityInterests: [community("nlp", "Old", 30), community("nlp", "Recent", 2)] });
    expect(topic(recent, "nlp")!.viaCommunity).toEqual({ id: "Recent", name: "Recent" });
    const tie = profileOf({ communityInterests: [community("nlp", "Beta", 3), community("nlp", "Alpha", 3)] });
    expect(topic(tie, "nlp")!.viaCommunity).toEqual({ id: "Alpha", name: "Alpha" });
  });

  it("a joined-community match gives the feed reason `joined` with that community", () => {
    const profile = profileOf({ communityInterests: [community("nlp", "NLP Lab", 5)] });
    const [ranked] = rankPersonal([{ id: "p", bucketId: "b", bucketName: "B", lastActivityAt: NOW, voteScore: 0, commentCount: 0, topics: one("nlp") }], profile, NOW);
    expect(ranked).toMatchObject({ reasonKind: "joined", reasonSource: "community", reasonCommunity: { id: "NLP Lab", name: "NLP Lab" } });
  });
});

const windowPost = (id: string, overrides: Partial<WindowCandidate> = {}): WindowCandidate => ({
  id, bucketId: `b-${id}`, bucketName: `Community ${id}`, lastActivityAt: daysAgo(1), voteScore: 0, commentCount: 0, topics: [],
  createdAt: daysAgo(3), readers: 0, repliers: 0, readerRepliers: 0, inJoinedCommunity: false, ...overrides,
});
const profileWith = (topics: Array<Partial<ProfileTopic> & { key: string }>): InterestProfile => ({
  activity: 0,
  topics: topics.map((item) => ({ label: item.key, source: "followed", weight: 1, score: 0, rawScore: 0, evidenceCount: 0, maxSignal: 0, lowConfidence: false, matchable: true, contributions: [], ...item })),
});

describe("R5 trending and new tiers", () => {
  it("heat = readers + 2 x repliers and participants count a reader who replied once", () => {
    const stats = { readers: 3, repliers: 2, readerRepliers: 1 };
    expect(heatOf(stats)).toBe(7);
    expect(participantsOf(stats)).toBe(4);
  });

  it("38. a single reader (even re-reading) is not trending; a post created in the window is new", () => {
    expect(tierOf(windowPost("a", { readers: 1 }), NOW)).toBe("new");
    expect(tierOf(windowPost("old", { readers: 1, createdAt: daysAgo(30) }), NOW)).toBe("none");
  });

  it("40. heat 3 with one participant (same user read and replied) is not trending", () => {
    const stats = { readers: 1, repliers: 1, readerRepliers: 1 };
    expect(heatOf(stats)).toBe(3);
    expect(participantsOf(stats)).toBe(1);
    expect(tierOf(windowPost("a", stats), NOW)).toBe("new");
  });

  it("is trending at heat 3 with two participants", () => {
    expect(tierOf(windowPost("a", { readers: 3 }), NOW)).toBe("trending");
    expect(tierOf(windowPost("b", { readers: 1, repliers: 1 }), NOW)).toBe("trending");
  });

  it("an older post with window activity can trend but is never new", () => {
    expect(tierOf(windowPost("a", { createdAt: daysAgo(60), readers: 5 }), NOW)).toBe("trending");
  });

  it("41. fills personal(2) -> trending(1) -> new(2) = 5, and a 30-day-old quiet post never appears", () => {
    const personal = rankPersonal([windowPost("p1", { topics: one("t"), bucketId: "x1" }), windowPost("p2", { topics: one("t"), bucketId: "x2" })], profileWith([{ key: "t" }]), NOW);
    const tiers = rankTiers([
      windowPost("t1", { readers: 4, repliers: 1 }),
      windowPost("n1", { createdAt: daysAgo(1) }), windowPost("n2", { createdAt: daysAgo(2) }),
      windowPost("quiet", { createdAt: daysAgo(30), lastActivityAt: daysAgo(30) }),
      windowPost("n3", { createdAt: daysAgo(4) }),
    ], NOW);
    const { basis, entries } = assembleFeed(personal, tiers);
    expect(basis).toBe("personal");
    expect(entries.map((entry) => entry.postId)).toEqual(["p1", "p2", "t1", "n1", "n2"]);
    expect(entries.map((entry) => entry.reasonKind)).toEqual(["followed", "followed", "trending", "new", "new"]);
    expect(entries[2]!.reasonStats).toEqual({ readers: 4, replies: 1 });
    expect(entries.some((entry) => entry.postId === "quiet")).toBe(false);
  });

  it("42. inside the trending tier a joined-community post with less heat ranks above a hotter post elsewhere", () => {
    const tiers = rankTiers([
      windowPost("hot", { readers: 20, repliers: 5 }),
      windowPost("mine", { readers: 3, inJoinedCommunity: true }),
    ], NOW);
    expect(tiers.trending.map((entry) => entry.candidate.id)).toEqual(["mine", "hot"]);
    const newTier = rankTiers([windowPost("newer", { createdAt: daysAgo(1) }), windowPost("joined", { createdAt: daysAgo(5), inJoinedCommunity: true })], NOW);
    expect(newTier.fresh.map((entry) => entry.candidate.id)).toEqual(["joined", "newer"]);
  });

  it("43. basis is explore without a personal entry and none when nothing qualifies", () => {
    const explore = assembleFeed([], rankTiers([windowPost("t", { readers: 3 }), windowPost("n")], NOW));
    expect(explore.basis).toBe("explore");
    expect(explore.entries.map((entry) => entry.reasonKind)).toEqual(["trending", "new"]);
    const none = assembleFeed([], rankTiers([windowPost("quiet", { createdAt: daysAgo(40), lastActivityAt: daysAgo(40) })], NOW));
    expect(none).toEqual({ basis: "none", entries: [] });
  });

  it("applies the diversity cap across the whole feed", () => {
    const tiers = rankTiers(Array.from({ length: 6 }, (_, index) => windowPost(`n${index}`, { bucketId: index < 4 ? "same" : `other${index}`, createdAt: daysAgo(index + 1) })), NOW);
    const { entries } = assembleFeed([], tiers);
    expect(entries).toHaveLength(5);
    expect(entries.filter((entry) => entry.reasonTopic.key === "same").length).toBeLessThanOrEqual(3);
    expect(entries.slice(0, 4).filter((entry) => entry.reasonTopic.key === "same")).toHaveLength(2);
  });
});

describe("R4 community suggestions (pure part)", () => {
  it("44. input topics skip low-confidence inferred ones; communities rank by sum of W then memberCount then id", () => {
    const inputs = communityInputTopics(profileWith([
      { key: "a", weight: 2, source: "followed" }, { key: "b", weight: 0.5, source: "community" },
      { key: "weak", weight: 1, source: "inferred", lowConfidence: true }, { key: "solid", weight: 0.8, source: "inferred" },
      { key: "gone", weight: 1, source: "followed", matchable: false },
    ]));
    expect(inputs.map((item) => item.key)).toEqual(["a", "b", "solid"]);
    const ranked = rankCommunities([
      { id: "z", memberCount: 5, topicKeys: ["a"] },
      { id: "y", memberCount: 50, topicKeys: ["b", "solid"] },
      { id: "x", memberCount: 9, topicKeys: ["a"] },
      { id: "w", memberCount: 99, topicKeys: ["weak"] },
      { id: "v", memberCount: 1, topicKeys: ["a", "a"] },
    ], inputs);
    expect(ranked.map((item) => item.id)).toEqual(["x", "z", "v", "y"]);
    expect(ranked.find((item) => item.id === "y")!.score).toBeCloseTo(1.3, 10);
  });
});
