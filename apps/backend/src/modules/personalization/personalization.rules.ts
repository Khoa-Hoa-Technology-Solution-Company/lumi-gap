import type { ForYouPostsBasis, ForYouReasonKind, InterestSource } from "@trend/shared-types";
import { PERSONALIZATION, type SignalKind } from "./personalization.constants.js";
import type { TopicRelevance } from "./personalization.topics.js";

export { PERSONALIZATION } from "./personalization.constants.js";
export type { SignalKind } from "./personalization.constants.js";

/**
 * Pure formulas of the "For you" feature. They take plain data and `now`; SQL only fetches the raw rows.
 * No Prisma, no clock, no I/O in this file.
 */

const DAY_MS = 86_400_000;
const ageDays = (now: Date, then: Date) => Math.max(0, (now.getTime() - then.getTime()) / DAY_MS);

export interface Signal {
  postId: string;
  kind: SignalKind;
  at: Date;
  /** The post was removed or hidden by moderation. Such signals never count. */
  moderated?: boolean;
}

export interface LabeledKey {
  key: string;
  label: string;
}

export interface ProfileInterest extends LabeledKey {
  /** False when the term is not in the vocabulary, so no discussion can match it. */
  matchable: boolean;
}

/** One topic of one research community the user joined (active membership, ACTIVE community). */
export interface CommunityInterest extends LabeledKey {
  community: { id: string; name: string };
  joinedAt: Date;
}

export interface ProfileInput {
  now: Date;
  signals: Signal[];
  /** T(p) for every post that has a signal. */
  postTopics: ReadonlyMap<string, readonly TopicRelevance[]>;
  /** Rows of user_topic_follows. */
  follows: LabeledKey[];
  /** users.research_interests, already resolved against V. Read only (R1). */
  profileInterests: ProfileInterest[];
  /** Topics of joined communities (R6), already resolved against V. */
  communityInterests?: CommunityInterest[];
  mutedKeys: ReadonlySet<string>;
  /** Label for an inferred topic key. */
  labelOf: (key: string) => string;
  /** Keys that exist in the vocabulary (a followed topic is matchable only then). */
  isMatchable: (key: string) => boolean;
}

export interface ProfileTopic {
  key: string;
  label: string;
  source: InterestSource;
  /** W(u,t). */
  weight: number;
  /** s(u,t). */
  score: number;
  /** S(u,t), unnormalised. */
  rawScore: number;
  evidenceCount: number;
  maxSignal: number;
  lowConfidence: boolean;
  matchable: boolean;
  viaCommunity?: { id: string; name: string };
  contributions: Array<{ postId: string; e: number; r: number; bonus: 0 | 1 }>;
}

export interface InterestProfile {
  /** A(u): distinct posts with a signal. */
  activity: number;
  topics: ProfileTopic[];
}

/** e(u,p) = max weight of the user's signals on p, tau(u,p) = latest of them. Moderated posts are skipped. */
export function aggregateSignals(signals: readonly Signal[]): Map<string, { e: number; tau: Date }> {
  const perPost = new Map<string, { e: number; tau: Date }>();
  for (const signal of signals) {
    if (signal.moderated) continue;
    const e = PERSONALIZATION.SIGNAL_WEIGHT[signal.kind];
    const current = perPost.get(signal.postId);
    if (!current) perPost.set(signal.postId, { e, tau: signal.at });
    else perPost.set(signal.postId, { e: Math.max(current.e, e), tau: signal.at > current.tau ? signal.at : current.tau });
  }
  return perPost;
}

/** The community a key comes through: the most recently joined one, ties by name. */
function viaCommunityOf(items: readonly CommunityInterest[]): { id: string; name: string } {
  const [best] = [...items].sort((left, right) => right.joinedAt.getTime() - left.joinedAt.getTime() || left.community.name.localeCompare(right.community.name));
  return best!.community;
}

/**
 * Builds the profile of one user. Old activity is never decayed; activity in the last 30 days gets a x2 bonus.
 * Precedence of sources: followed > profile > community > inferred; W is computed for the winning source only:
 * followed/profile 1 + s (pinned, never cut), community 0.5 + 0.5 s, inferred s. Community and inferred topics
 * compete for the slots PROFILE_TOP_K leaves after the pinned ones.
 */
export function computeInterestProfile(input: ProfileInput): InterestProfile {
  const perPost = aggregateSignals(input.signals);
  const activity = perPost.size;

  const raw = new Map<string, { S: number; contributions: ProfileTopic["contributions"]; maxSignal: number }>();
  for (const [postId, { e, tau }] of perPost) {
    const topics = input.postTopics.get(postId) ?? [];
    if (topics.length === 0) continue;
    const bonus: 0 | 1 = ageDays(input.now, tau) <= PERSONALIZATION.RECENT_BONUS_DAYS ? 1 : 0;
    for (const { key, r } of topics) {
      if (input.mutedKeys.has(key)) continue;
      const entry = raw.get(key) ?? { S: 0, contributions: [], maxSignal: 0 };
      entry.S += (e * r / Math.sqrt(topics.length)) * (1 + bonus);
      entry.contributions.push({ postId, e, r, bonus });
      entry.maxSignal = Math.max(entry.maxSignal, e);
      raw.set(key, entry);
    }
  }

  const lowActivity = activity < PERSONALIZATION.LOW_ACTIVITY_POSTS;
  const inferredKeys = [...raw.entries()]
    .filter(([, entry]) => lowActivity
      ? entry.contributions.length >= 1
      : entry.contributions.length >= PERSONALIZATION.MIN_POSTS_ACTIVE || entry.maxSignal >= PERSONALIZATION.MIN_STRONG_SIGNAL)
    .map(([key]) => key);

  const followed = new Map<string, LabeledKey & { matchable: boolean }>();
  for (const follow of input.follows) if (!input.mutedKeys.has(follow.key)) followed.set(follow.key, { ...follow, matchable: input.isMatchable(follow.key) });
  const profileOnly = new Map<string, ProfileInterest>();
  for (const interest of input.profileInterests) if (!input.mutedKeys.has(interest.key) && !followed.has(interest.key)) profileOnly.set(interest.key, interest);
  const pinned = new Set([...followed.keys(), ...profileOnly.keys()]);

  const communityGroups = new Map<string, CommunityInterest[]>();
  for (const item of input.communityInterests ?? []) {
    if (input.mutedKeys.has(item.key) || pinned.has(item.key) || !input.isMatchable(item.key)) continue;
    communityGroups.set(item.key, [...(communityGroups.get(item.key) ?? []), item]);
  }

  const rawFor = (key: string) => raw.get(key);
  // maxS is taken over every key that has any source.
  const maxS = Math.max(0, ...[...inferredKeys, ...pinned, ...communityGroups.keys()].map((key) => rawFor(key)?.S ?? 0));
  const normalised = (key: string) => (maxS > 0 ? Math.min(1, (rawFor(key)?.S ?? 0) / maxS) : 0);

  const make = (key: string, label: string, source: InterestSource, matchable: boolean, via?: { id: string; name: string }): ProfileTopic => {
    const entry = rawFor(key);
    const s = normalised(key);
    const weight = source === "community" ? PERSONALIZATION.COMMUNITY_BASE_WEIGHT + (1 - PERSONALIZATION.COMMUNITY_BASE_WEIGHT) * s
      : source === "inferred" ? s : 1 + s;
    return {
      key, label, source, weight, score: s,
      rawScore: entry?.S ?? 0, evidenceCount: entry?.contributions.length ?? 0, maxSignal: entry?.maxSignal ?? 0,
      lowConfidence: source === "inferred" && lowActivity, matchable, contributions: entry?.contributions ?? [],
      ...(via ? { viaCommunity: via } : {}),
    };
  };
  const order = (left: ProfileTopic, right: ProfileTopic) => right.weight - left.weight || right.rawScore - left.rawScore || left.key.localeCompare(right.key);

  const pinnedTopics = [
    ...[...followed.values()].map((item) => make(item.key, item.label, "followed", item.matchable)),
    ...[...profileOnly.values()].map((item) => make(item.key, item.label, "profile", item.matchable)),
  ].sort(order);
  const room = Math.max(0, PERSONALIZATION.PROFILE_TOP_K - pinnedTopics.length);
  const competing = [
    ...[...communityGroups.entries()].map(([key, items]) => make(key, items[0]!.label, "community", true, viaCommunityOf(items))),
    ...inferredKeys.filter((key) => !pinned.has(key) && !communityGroups.has(key)).map((key) => make(key, input.labelOf(key), "inferred", true)),
  ].sort(order).slice(0, room);
  return { activity, topics: [...pinnedTopics, ...competing] };
}

export function freshness(now: Date, lastActivityAt: Date): number {
  return 2 ** (-ageDays(now, lastActivityAt) / PERSONALIZATION.FRESH_HALF_LIFE_DAYS);
}

export interface FeedCandidate {
  id: string;
  /** Research community id, else forum category id: the diversity bucket and the trending label. */
  bucketId: string;
  bucketName: string;
  lastActivityAt: Date;
  voteScore: number;
  commentCount: number;
  topics: readonly TopicRelevance[];
  /** Set when the post belongs to a research community the viewer is an active member of. */
  joinedCommunity?: { id: string; name: string };
}

export interface RankedPost {
  candidate: FeedCandidate;
  match: number;
  fresh: number;
  quality: number;
  score: number;
  reasonKind: ForYouReasonKind;
  reasonTopic: LabeledKey;
  reasonSource?: InterestSource;
  reasonCommunity?: { id: string; name: string };
}

const byRecencyThenId = (left: FeedCandidate, right: FeedCandidate) =>
  right.lastActivityAt.getTime() - left.lastActivityAt.getTime() || left.id.localeCompare(right.id);

/** Ranks posts that share a topic with the profile. Posts without overlap are dropped. */
export function rankPersonal(candidates: readonly FeedCandidate[], profile: InterestProfile, now: Date): RankedPost[] {
  const byKey = new Map(profile.topics.filter((topic) => topic.matchable).map((topic) => [topic.key, topic]));
  const ranked: RankedPost[] = [];
  for (const candidate of candidates) {
    const size = candidate.topics.length;
    let match = 0;
    let best: { topic: ProfileTopic; term: number } | undefined;
    for (const { key, r } of candidate.topics) {
      const topic = byKey.get(key);
      if (!topic) continue;
      const term = topic.weight * r / Math.sqrt(size);
      match += term;
      if (!best || term > best.term || (term === best.term && topic.key < best.topic.key)) best = { topic, term };
    }
    if (!best || match <= 0) continue;
    const fresh = freshness(now, candidate.lastActivityAt);
    const quality = 1 + Math.log(1 + Math.max(candidate.voteScore, 0) + candidate.commentCount);
    // "Because you joined X" must name a community that really contains the post: its own, when the viewer joined it.
    const reasonCommunity = best.topic.source === "community" ? (candidate.joinedCommunity ?? best.topic.viaCommunity) : undefined;
    const reasonKind: ForYouReasonKind = best.topic.source === "community" ? "joined"
      : best.topic.source !== "inferred" ? "followed"
        : best.topic.lowConfidence ? "lowConfidence" : "inferred";
    ranked.push({
      candidate, match, fresh, quality,
      score: match * (PERSONALIZATION.FRESH_FLOOR + (1 - PERSONALIZATION.FRESH_FLOOR) * fresh) * quality,
      reasonKind, reasonTopic: { key: best.topic.key, label: best.topic.label }, reasonSource: best.topic.source,
      ...(reasonCommunity ? { reasonCommunity } : {}),
    });
  }
  return ranked.sort((left, right) => right.score - left.score || byRecencyThenId(left.candidate, right.candidate));
}

/** Raw activity of a post in the trending window (R5). */
export interface WindowStats {
  /** Rows of forum_post_views in the window: one per viewer, authors never recorded. */
  readers: number;
  /** Distinct commenters in the window, excluding the post's author. */
  repliers: number;
  /** Repliers whose own view of the post is also in the window (counted once). */
  readerRepliers: number;
}

export interface WindowCandidate extends FeedCandidate, WindowStats {
  createdAt: Date;
  /** The viewer is an active member of the post's research community. */
  inJoinedCommunity: boolean;
}

export const heatOf = (stats: WindowStats) => stats.readers + 2 * stats.repliers;
export const participantsOf = (stats: WindowStats) => stats.readers + stats.repliers - stats.readerRepliers;

export type Tier = "trending" | "new" | "none";

/** Trending needs heat >= 3 AND >= 2 distinct participants; otherwise a post created in the window is "new". */
export function tierOf(candidate: Pick<WindowCandidate, "createdAt"> & WindowStats, now: Date): Tier {
  if (heatOf(candidate) >= PERSONALIZATION.MIN_TRENDING_HEAT && participantsOf(candidate) >= PERSONALIZATION.MIN_TRENDING_PARTICIPANTS) return "trending";
  return ageDays(now, candidate.createdAt) <= PERSONALIZATION.TRENDING_DAYS ? "new" : "none";
}

export interface TierEntry {
  candidate: WindowCandidate;
  tier: "trending" | "new";
  score: number;
}

const joinedFirst = (left: TierEntry, right: TierEntry) => Number(right.candidate.inJoinedCommunity) - Number(left.candidate.inJoinedCommunity);

/**
 * Splits the window candidates into the trending tier (ln(1 + heat) x fresh) and the new tier (newest first). Inside
 * a tier, posts of communities the viewer joined come first, then the score, then lastActivityAt desc, id asc.
 */
export function rankTiers(candidates: readonly WindowCandidate[], now: Date): { trending: TierEntry[]; fresh: TierEntry[] } {
  const trending: TierEntry[] = [];
  const fresh: TierEntry[] = [];
  for (const candidate of candidates) {
    const tier = tierOf(candidate, now);
    if (tier === "trending") trending.push({ candidate, tier, score: Math.log(1 + heatOf(candidate)) * freshness(now, candidate.lastActivityAt) });
    else if (tier === "new") fresh.push({ candidate, tier, score: candidate.createdAt.getTime() });
  }
  const order = (left: TierEntry, right: TierEntry) => joinedFirst(left, right) || right.score - left.score || byRecencyThenId(left.candidate, right.candidate);
  return { trending: trending.sort(order), fresh: fresh.sort(order) };
}

/** Walks a ranked list taking at most `cap` per bucket until `size` are picked, then fills from the skipped ones. */
export function pickDiverse<T>(items: readonly T[], bucketOf: (item: T) => string, size: number = PERSONALIZATION.FEED_SIZE, cap: number = PERSONALIZATION.MAX_PER_COMMUNITY): T[] {
  const picked: T[] = [];
  const skipped: T[] = [];
  const perBucket = new Map<string, number>();
  for (const item of items) {
    if (picked.length >= size) break;
    const bucket = bucketOf(item);
    if ((perBucket.get(bucket) ?? 0) >= cap) {
      skipped.push(item);
      continue;
    }
    perBucket.set(bucket, (perBucket.get(bucket) ?? 0) + 1);
    picked.push(item);
  }
  for (const item of skipped) {
    if (picked.length >= size) break;
    picked.push(item);
  }
  return picked;
}

export interface FeedEntry {
  postId: string;
  reasonKind: ForYouReasonKind;
  reasonTopic: LabeledKey;
  reasonSource?: InterestSource;
  reasonCommunity?: { id: string; name: string };
  reasonStats?: { readers: number; replies: number };
}

/**
 * Fill order: personal -> trending -> new -> stop. The diversity cap (2 per community or category) spans the whole
 * feed; slots the cap leaves open are filled from the skipped posts in the same order. Older or quiet posts never
 * fill a slot. Basis is `personal` with any personal entry, else `explore` with any trending/new entry, else `none`.
 */
export function assembleFeed(
  personal: readonly RankedPost[],
  tiers: { trending: readonly TierEntry[]; fresh: readonly TierEntry[] },
  size: number = PERSONALIZATION.FEED_SIZE,
): { basis: ForYouPostsBasis; entries: FeedEntry[] } {
  type Slot = { bucket: string; id: string; entry: FeedEntry };
  const slots: Slot[] = [
    ...personal.map((item): Slot => ({ bucket: item.candidate.bucketId, id: item.candidate.id, entry: {
      postId: item.candidate.id, reasonKind: item.reasonKind, reasonTopic: item.reasonTopic, reasonSource: item.reasonSource,
      ...(item.reasonCommunity ? { reasonCommunity: item.reasonCommunity } : {}),
    } })),
    ...tiers.trending.map((item): Slot => ({ bucket: item.candidate.bucketId, id: item.candidate.id, entry: {
      postId: item.candidate.id, reasonKind: "trending", reasonTopic: { key: item.candidate.bucketId, label: item.candidate.bucketName },
      reasonStats: { readers: item.candidate.readers, replies: item.candidate.repliers },
    } })),
    ...tiers.fresh.map((item): Slot => ({ bucket: item.candidate.bucketId, id: item.candidate.id, entry: {
      postId: item.candidate.id, reasonKind: "new", reasonTopic: { key: item.candidate.bucketId, label: item.candidate.bucketName },
    } })),
  ];
  const seen = new Set<string>();
  const unique = slots.filter((slot) => (seen.has(slot.id) ? false : (seen.add(slot.id), true)));
  const chosen = pickDiverse(unique, (slot) => slot.bucket, size);
  const entries = chosen.map((slot) => slot.entry);
  const basis: ForYouPostsBasis = entries.some((entry) => !["trending", "new"].includes(entry.reasonKind)) ? "personal" : entries.length > 0 ? "explore" : "none";
  return { basis, entries };
}

/** Top topics of the posts that qualify as trending (papers fallback): sum of heat x r. */
export function trendingTopics(posts: ReadonlyArray<{ heat: number; topics: readonly TopicRelevance[] }>, limit: number = PERSONALIZATION.PAPER_TOPICS): string[] {
  const totals = new Map<string, number>();
  for (const post of posts) for (const { key, r } of post.topics) totals.set(key, (totals.get(key) ?? 0) + post.heat * r);
  return [...totals.entries()]
    .filter(([, total]) => total > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([key]) => key);
}

/** The matchable topics the paper search is built from: top PAPER_TOPICS by W. */
export function paperTopicsOf(profile: InterestProfile): ProfileTopic[] {
  return profile.topics.filter((topic) => topic.matchable).slice(0, PERSONALIZATION.PAPER_TOPICS);
}

/** Topics used to suggest communities: followed, profile, community, and inferred ones that are not low confidence. */
export function communityInputTopics(profile: InterestProfile): ProfileTopic[] {
  return profile.topics.filter((topic) => topic.matchable && (topic.source !== "inferred" || !topic.lowConfidence));
}

export interface CommunityCandidate {
  id: string;
  memberCount: number;
  /** The community's topics resolved to keys (V keys only). */
  topicKeys: readonly string[];
}

/** Communities ordered by the sum of W of the matched input topics, then memberCount desc, then id asc. */
export function rankCommunities(candidates: readonly CommunityCandidate[], inputs: readonly ProfileTopic[]): Array<{ id: string; score: number; matched: ProfileTopic[] }> {
  const byKey = new Map(inputs.map((topic) => [topic.key, topic]));
  const ranked = candidates.flatMap((community) => {
    const matched = [...new Set(community.topicKeys)].flatMap((key) => (byKey.has(key) ? [byKey.get(key)!] : []));
    return matched.length ? [{ id: community.id, memberCount: community.memberCount, matched, score: matched.reduce((sum, topic) => sum + topic.weight, 0) }] : [];
  });
  return ranked
    .sort((left, right) => right.score - left.score || right.memberCount - left.memberCount || left.id.localeCompare(right.id))
    .map(({ id, score, matched }) => ({ id, score, matched }));
}
