import { describe, expect, it } from "vitest";
import {
  aggregateSignals, computeInterestProfile, freshness, pickDiverse, rankPersonal, trendingTopics,
  type FeedCandidate, type InterestProfile, type ProfileInput, type ProfileTopic, type Signal,
} from "../personalization.rules.js";
import type { SignalKind } from "../personalization.constants.js";
import type { TopicRelevance } from "../personalization.topics.js";

const NOW = new Date("2026-11-04T00:00:00.000Z");
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

const sig = (postId: string, kind: SignalKind, days: number, moderated = false): Signal => ({ postId, kind, at: daysAgo(days), moderated });
const one = (key: string): TopicRelevance[] => [{ key, r: 1 }];

function profileOf(overrides: Partial<ProfileInput> & { signals: Signal[]; postTopics: Record<string, TopicRelevance[]> }) {
  const { postTopics, ...rest } = overrides;
  return computeInterestProfile({
    now: NOW, follows: [], profileInterests: [], mutedKeys: new Set(), labelOf: (key) => key.toUpperCase(), isMatchable: () => true,
    ...rest, postTopics: new Map(Object.entries(postTopics)),
  });
}
const topic = (profile: InterestProfile, key: string) => profile.topics.find((item) => item.key === key);
const keysOf = (profile: InterestProfile) => profile.topics.map((item) => item.key);

describe("interest scoring (spec tests 1-11, 27)", () => {
  it("1. a single old read is inferred with low confidence and s = 1", () => {
    const profile = profileOf({ signals: [sig("p1", "read", 180)], postTopics: { p1: one("a") } });
    expect(topic(profile, "a")).toMatchObject({ source: "inferred", lowConfidence: true, score: 1, rawScore: 1 });
  });

  it("2. three old reads of A and one recent read of B: S_A = 3, S_B = 2, A above B", () => {
    const profile = profileOf({
      signals: [sig("a1", "read", 180), sig("a2", "read", 180), sig("a3", "read", 180), sig("b1", "read", 7)],
      postTopics: { a1: one("a"), a2: one("a"), a3: one("a"), b1: one("b") },
    });
    expect(topic(profile, "a")!.rawScore).toBe(3);
    expect(topic(profile, "b")!.rawScore).toBe(2);
    expect(keysOf(profile)).toEqual(["a", "b"]);
  });

  it("3. old interest is never decayed: S_B = 4 beats S_A = 3 but A stays in the profile", () => {
    const profile = profileOf({
      signals: [sig("a1", "read", 180), sig("a2", "read", 180), sig("a3", "read", 180), sig("b1", "read", 7), sig("b2", "read", 7)],
      postTopics: { a1: one("a"), a2: one("a"), a3: one("a"), b1: one("b"), b2: one("b") },
    });
    expect(topic(profile, "a")!.rawScore).toBe(3);
    expect(topic(profile, "b")!.rawScore).toBe(4);
    expect(keysOf(profile)).toEqual(["b", "a"]);
  });

  it("4. with A(u) = 15 a single read does not infer C, a single comment does", () => {
    const filler = Array.from({ length: 14 }, (_, index) => `f${index}`);
    const postTopics = Object.fromEntries([...filler.map((id) => [id, one("filler")]), ["c1", one("c")]]);
    const reads = [...filler.map((id) => sig(id, "read", 100)), sig("c1", "read", 100)];
    const readOnly = profileOf({ signals: reads, postTopics });
    expect(readOnly.activity).toBe(15);
    expect(topic(readOnly, "c")).toBeUndefined();
    expect(topic(readOnly, "filler")).toBeDefined();
    const commented = profileOf({ signals: [...filler.map((id) => sig(id, "read", 100)), sig("c1", "comment", 100)], postTopics });
    expect(topic(commented, "c")).toMatchObject({ source: "inferred", lowConfidence: false });
  });

  it("5. read + upvote + comment on one post count e = 3, not 6", () => {
    const signals = [sig("p1", "read", 100), sig("p1", "vote", 100), sig("p1", "comment", 100)];
    expect(aggregateSignals(signals).get("p1")!.e).toBe(3);
    expect(topic(profileOf({ signals, postTopics: { p1: one("a") } }), "a")!.rawScore).toBe(3);
  });

  it("6. old activity with the newest signal 5 days ago gets the bonus: S = 3 x 2", () => {
    const profile = profileOf({ signals: [sig("p1", "read", 120), sig("p1", "comment", 5)], postTopics: { p1: one("a") } });
    expect(topic(profile, "a")!.rawScore).toBe(6);
    expect(topic(profile, "a")!.contributions[0]).toMatchObject({ e: 3, bonus: 1 });
  });

  it("7. a muted topic never appears, however many reads follow", () => {
    const signals = Array.from({ length: 5 }, (_, index) => sig(`m${index}`, "read", 1));
    const postTopics = Object.fromEntries(signals.map((signal) => [signal.postId, one("muted")]));
    const profile = profileOf({ signals, postTopics, mutedKeys: new Set(["muted"]), profileInterests: [{ key: "muted", label: "Muted", matchable: true }] });
    expect(keysOf(profile)).toEqual([]);
  });

  it("8. a followed topic with no behaviour (W = 1) ties the top inferred topic (W = 1) and comes first", () => {
    const profile = profileOf({
      signals: [sig("p1", "read", 100)], postTopics: { p1: one("inferred") },
      follows: [{ key: "followed", label: "Followed" }],
    });
    expect(topic(profile, "followed")).toMatchObject({ source: "followed", weight: 1, score: 0 });
    expect(topic(profile, "inferred")!.weight).toBe(1);
    expect(keysOf(profile)).toEqual(["followed", "inferred"]);
  });

  it("9. no behaviour at all: no NaN, s = 0", () => {
    const profile = profileOf({ signals: [], postTopics: {}, follows: [{ key: "f", label: "F" }] });
    expect(profile.activity).toBe(0);
    expect(topic(profile, "f")).toMatchObject({ weight: 1, score: 0 });
    expect(Number.isNaN(topic(profile, "f")!.weight)).toBe(false);
    expect(profileOf({ signals: [], postTopics: {} }).topics).toEqual([]);
  });

  it("10. a moderation-hidden post gives no signal, an author-deleted post still counts", () => {
    const profile = profileOf({
      signals: [sig("hidden", "read", 100, true), sig("deleted", "comment", 100, false)],
      postTopics: { hidden: one("h"), deleted: one("d") },
    });
    expect(profile.activity).toBe(1);
    expect(topic(profile, "h")).toBeUndefined();
    expect(topic(profile, "d")).toBeDefined();
  });

  it("11. a post with 4 topics contributes e x r / 2 to each", () => {
    const profile = profileOf({ signals: [sig("p1", "read", 100)], postTopics: { p1: ["a", "b", "c", "d"].flatMap(one) } });
    for (const key of ["a", "b", "c", "d"]) expect(topic(profile, key)!.rawScore).toBeCloseTo(0.5, 10);
  });

  it("27. a followed topic below the inference threshold gets s = min(1, S/maxS), and 15 follows are never cut by top-K", () => {
    const filler = Array.from({ length: 12 }, (_, index) => `f${index}`);
    const postTopics = Object.fromEntries([...filler.map((id) => [id, one("big")]), ["x1", one("small")]]);
    const profile = profileOf({
      signals: [...filler.map((id) => sig(id, "comment", 100)), sig("x1", "read", 100)], postTopics,
      follows: [{ key: "small", label: "Small" }],
    });
    expect(topic(profile, "small")!.source).toBe("followed");
    expect(topic(profile, "small")!.score).toBeCloseTo(1 / 36, 10);
    expect(topic(profile, "small")!.score).toBeGreaterThan(0);

    const follows = Array.from({ length: 15 }, (_, index) => ({ key: `follow${index}`, label: `Follow ${index}` }));
    const inferredSignals = Array.from({ length: 10 }, (_, index) => sig(`i${index}`, "comment", 100));
    const many = profileOf({ signals: inferredSignals, postTopics: Object.fromEntries(inferredSignals.map((s, index) => [s.postId, one(`inf${index}`)])), follows });
    expect(many.topics.filter((item) => item.source === "followed")).toHaveLength(15);
    expect(many.topics).toHaveLength(15);
  });

  it("reports profile interests with source profile and keeps unmatchable ones", () => {
    const profile = profileOf({
      signals: [], postTopics: {},
      profileInterests: [{ key: "blockchain", label: "Blockchain", matchable: false }, { key: "knowledge graphs", label: "Knowledge Graphs", matchable: true }],
      follows: [{ key: "knowledge graphs", label: "Knowledge Graphs" }],
    });
    expect(topic(profile, "knowledge graphs")!.source).toBe("followed");
    expect(topic(profile, "blockchain")).toMatchObject({ source: "profile", matchable: false, weight: 1 });
  });
});

const candidate = (id: string, topics: TopicRelevance[], extra: Partial<FeedCandidate> = {}): FeedCandidate => ({
  id, bucketId: "c1", bucketName: "Community 1", lastActivityAt: NOW, voteScore: 0, commentCount: 0, topics, ...extra,
});
const profileWith = (topics: Array<Partial<ProfileTopic> & { key: string }>): InterestProfile => ({
  activity: 0,
  topics: topics.map((item) => ({
    label: item.key, source: "followed", weight: 1, score: 0, rawScore: 0, evidenceCount: 0, maxSignal: 0, lowConfidence: false, matchable: true, contributions: [], ...item,
  })),
});

describe("feed ranking", () => {
  it("19. only one community has matches: still 5 posts (fill from skipped)", () => {
    const ranked = rankPersonal(Array.from({ length: 7 }, (_, index) => candidate(`p${index}`, one("a"))), profileWith([{ key: "a" }]), NOW);
    const picked = pickDiverse(ranked, (item) => item.candidate.bucketId);
    expect(picked).toHaveLength(5);
  });

  it("diversity cap takes at most 2 per community while other communities have posts", () => {
    const items = [
      candidate("a1", one("a"), { bucketId: "x" }), candidate("a2", one("a"), { bucketId: "x" }), candidate("a3", one("a"), { bucketId: "x" }),
      candidate("b1", one("a"), { bucketId: "y" }),
    ];
    const ranked = rankPersonal(items, profileWith([{ key: "a" }]), NOW);
    const picked = pickDiverse(ranked, (item) => item.candidate.bucketId, 3);
    expect(picked.map((item) => item.candidate.bucketId).sort()).toEqual(["x", "x", "y"]);
  });

  it("20. score = match x (0.3 + 0.7 fresh) x q, ties break on activity then id, a 90-day-old perfect match stays above 0", () => {
    const a = candidate("a", [{ key: "t", r: 0.8 }, { key: "u", r: 0.5 }], { lastActivityAt: daysAgo(14), voteScore: 3, commentCount: 2 });
    const [ranked] = rankPersonal([a], profileWith([{ key: "t", weight: 1.5 }, { key: "u", weight: 1 }]), NOW);
    const match = (1.5 * 0.8 + 1 * 0.5) / Math.sqrt(2);
    const expected = match * (0.3 + 0.7 * 0.5) * (1 + Math.log(1 + 3 + 2));
    expect(ranked!.score).toBeCloseTo(expected, 10);
    expect(ranked!.match).toBeCloseTo(match, 10);

    const old = rankPersonal([candidate("old", one("t"), { lastActivityAt: daysAgo(90) })], profileWith([{ key: "t" }]), NOW);
    expect(old[0]!.score).toBeGreaterThan(0.3 - 1e-9);

    const tie = rankPersonal([candidate("b", one("t")), candidate("a", one("t"))], profileWith([{ key: "t" }]), NOW);
    expect(tie.map((item) => item.candidate.id)).toEqual(["a", "b"]);
    const newer = rankPersonal([candidate("old", one("t"), { lastActivityAt: daysAgo(0) }), candidate("zz", one("t"), { lastActivityAt: NOW })], profileWith([{ key: "t" }]), NOW);
    expect(newer.map((item) => item.candidate.id)).toEqual(["old", "zz"]);
    expect(freshness(NOW, daysAgo(14))).toBeCloseTo(0.5, 10);
  });

  it("negative vote scores do not reduce quality below 1", () => {
    const [ranked] = rankPersonal([candidate("a", one("t"), { voteScore: -9 })], profileWith([{ key: "t" }]), NOW);
    expect(ranked!.quality).toBe(1);
  });

  it("22. reason kinds: followed, profile, inferred, lowConfidence", () => {
    const reason = (topicDef: Partial<ProfileTopic>) => rankPersonal([candidate("a", one("t"))], profileWith([{ key: "t", ...topicDef }]), NOW)[0]!.reasonKind;
    expect(reason({ source: "followed" })).toBe("followed");
    expect(reason({ source: "profile" })).toBe("followed");
    expect(reason({ source: "inferred", weight: 1 })).toBe("inferred");
    expect(reason({ source: "inferred", lowConfidence: true })).toBe("lowConfidence");
  });

  it("the reason is the topic with the largest single term", () => {
    const [ranked] = rankPersonal([candidate("a", [{ key: "low", r: 0.3 }, { key: "high", r: 1 }])], profileWith([{ key: "low" }, { key: "high" }]), NOW);
    expect(ranked!.reasonTopic.key).toBe("high");
  });

  it("an unmatchable profile topic never matches a post", () => {
    expect(rankPersonal([candidate("a", one("t"))], profileWith([{ key: "t", matchable: false }]), NOW)).toEqual([]);
  });
});

describe("trending topics", () => {
  it("sums heat x r and keeps the top 3", () => {
    const keys = trendingTopics([
      { heat: 10, topics: [{ key: "a", r: 1 }, { key: "b", r: 0.5 }] },
      { heat: 4, topics: [{ key: "c", r: 1 }, { key: "d", r: 1 }, { key: "e", r: 0.3 }] },
    ]);
    expect(keys).toEqual(["a", "b", "c"]);
  });
});
