import type { ForYouCommunity, ForYouPapersBasis, ForYouPost, ForYouResponse, InterestsResponse, VocabularyTerm } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { cache, hashKey } from "../../infrastructure/cache.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { forumPostVisibilitySql } from "../forum/forum-visibility.js";
import { forumService } from "../forum/forum.service.js";
import { searchPapersByTopics, type RelatedPaper } from "../communities/related-papers.query.js";
import { nearestCommunityIds } from "../communities/community-embedding.service.js";
import { presentCommunity } from "../communities/community.service.js";
import { getEmbeddingProvider } from "../embeddings/embedding.factory.js";
import { normalizeTerm } from "../taxonomy/taxonomy.normalize.js";
import { PERSONALIZATION } from "./personalization.constants.js";
import { invalidatePersonalizationProfile, profileCacheKey } from "./personalization.cache.js";
import { enqueueRecomputeForumTopics, loadVocabulary } from "./personalization-topics.service.js";
import {
  fetchActiveMemberships, fetchCandidates, fetchFollows, fetchMembershipCommunityIds, fetchMutes, fetchProfileInterests, fetchResearchCommunityTopics, fetchSignals,
  fetchStoredPostTopics, fetchTrendingWindowPosts, fetchVotedPostIds, type CandidateRow,
} from "./personalization.repository.js";
import {
  assembleFeed, communityInputTopics, computeInterestProfile, heatOf, paperTopicsOf, rankCommunities, rankPersonal, rankTiers, trendingTopics,
  type CommunityInterest, type FeedCandidate, type InterestProfile, type ProfileInterest, type WindowCandidate,
} from "./personalization.rules.js";
import { postTopicRelevance, resolveTopicKey, topicLabel, type Vocabulary } from "./personalization.topics.js";

const DAY_MS = 86_400_000;
const PAPERS_CACHE_TTL_SECONDS = 3600;

interface CachedProfile {
  profile: InterestProfile;
  muted: Array<{ key: string; label: string }>;
}

async function resolveUserUuid(sub: string): Promise<string> {
  const parsed = parseDatabaseId(sub);
  if (!parsed) throw AppError.unauthorized();
  if (parsed.kind === "uuid") return parsed.value;
  const row = await getPrisma().user.findUnique({ where: { legacyMongoId: parsed.value }, select: { id: true } });
  if (!row) throw AppError.unauthorized();
  return row.id;
}

const canonicalKeys = (vocab: Vocabulary) => new Set([...vocab.values()].map((entry) => entry.canonical));

const invalidateProfile = invalidatePersonalizationProfile;

/** Reads the signals and rows, then runs the pure scoring. Cached for PROFILE_CACHE_TTL_SECONDS. */
async function buildProfile(userId: string, vocab: Vocabulary, now: Date): Promise<CachedProfile> {
  const [signals, follows, mutes, interests, memberships] = await Promise.all([
    fetchSignals(userId), fetchFollows(userId), fetchMutes(userId), fetchProfileInterests(userId), fetchActiveMemberships(userId),
  ]);
  const stored = await fetchStoredPostTopics([...new Set(signals.filter((signal) => !signal.moderated).map((signal) => signal.postId))]);
  const postTopics = new Map([...stored].map(([id, topics]) => [id, postTopicRelevance(topics, vocab)]));
  const keys = canonicalKeys(vocab);
  const profileInterests: ProfileInterest[] = [];
  for (const raw of interests) {
    const resolved = resolveTopicKey(raw, vocab);
    const key = resolved ?? normalizeTerm(raw);
    if (key) profileInterests.push({ key, label: raw.trim(), matchable: Boolean(resolved) });
  }
  const communityInterests: CommunityInterest[] = memberships.flatMap((membership) => membership.researchTopics.flatMap((topic) => {
    const key = resolveTopicKey(topic, vocab) ?? normalizeTerm(topic);
    return key && keys.has(key) ? [{ key, label: topic.trim(), community: { id: membership.communityId, name: membership.name }, joinedAt: membership.joinedAt }] : [];
  }));
  const profile = computeInterestProfile({
    now, signals, postTopics, follows, profileInterests, communityInterests,
    mutedKeys: new Set(mutes.map((mute) => mute.key)),
    labelOf: (key) => topicLabel(key, vocab),
    isMatchable: (key) => keys.has(key),
  });
  return { profile, muted: mutes };
}

async function loadProfile(userId: string, vocab: Vocabulary, now: Date): Promise<CachedProfile> {
  const cached = await cache.get<CachedProfile>(profileCacheKey(userId));
  if (cached) return cached;
  const built = await buildProfile(userId, vocab, now);
  await cache.set(profileCacheKey(userId), built, PERSONALIZATION.PROFILE_CACHE_TTL_SECONDS);
  return built;
}

const toCandidate = (row: CandidateRow, vocab: Vocabulary): FeedCandidate => ({
  id: row.id, bucketId: row.bucketId, bucketName: row.bucketName, lastActivityAt: row.lastActivityAt,
  voteScore: row.voteScore, commentCount: row.commentCount, topics: postTopicRelevance(row.stored, vocab),
});
const toWindowCandidate = (row: CandidateRow, vocab: Vocabulary): WindowCandidate => ({
  ...toCandidate(row, vocab), createdAt: row.createdAt, readers: row.readers, repliers: row.repliers,
  readerRepliers: row.readerRepliers, inJoinedCommunity: row.inJoinedCommunity,
});

async function papersFor(labels: string[], keys: string[]): Promise<RelatedPaper[]> {
  if (labels.length === 0) return [];
  const cacheKey = `personalization:papers:v1:${hashKey([...keys].sort())}`;
  const cached = await cache.get<RelatedPaper[]>(cacheKey);
  if (cached) return cached;
  const papers = await searchPapersByTopics(labels, PERSONALIZATION.PAPER_RESULTS);
  await cache.set(cacheKey, papers, PAPERS_CACHE_TTL_SECONDS);
  return papers;
}

/** Embeds the input topic labels once per distinct topic set (1 day); null on any failure so callers keep topic matches. */
async function embedTopicsSafely(labels: string[], keys: string[]): Promise<number[] | null> {
  const cacheKey = `personalization:communities-embed:v1:${hashKey([...keys].sort())}`;
  const cached = await cache.get<number[]>(cacheKey);
  if (cached) return cached;
  try {
    const vector = await getEmbeddingProvider().embed(labels.join(", "));
    await cache.set(cacheKey, vector, PERSONALIZATION.COMMUNITY_EMBED_TTL_SECONDS);
    return vector;
  } catch (error) {
    logger.warn({ error }, "community suggestion embedding failed; using topic matches only");
    return null;
  }
}

export const personalizationService = {
  /** GET /interests: followed and profile topics first, then inferred ones. */
  async interests(sub: string): Promise<InterestsResponse> {
    const userId = await resolveUserUuid(sub);
    const vocab = await loadVocabulary();
    const { profile, muted } = await loadProfile(userId, vocab, new Date());
    return {
      topics: profile.topics.map((topic) => ({
        key: topic.key, label: topic.label, source: topic.source, weight: topic.weight, score: topic.score,
        evidenceCount: topic.evidenceCount, lowConfidence: topic.lowConfidence, matchable: topic.matchable,
        ...(topic.viaCommunity ? { viaCommunity: topic.viaCommunity } : {}),
      })),
      muted,
    };
  },

  async vocabulary(query: string): Promise<VocabularyTerm[]> {
    const vocab = await loadVocabulary();
    const prefix = normalizeTerm(query);
    const seen = new Map<string, VocabularyTerm>();
    for (const [term, entry] of vocab) {
      if (seen.has(entry.canonical)) continue;
      if (!prefix || term.startsWith(prefix) || entry.canonical.startsWith(prefix)) seen.set(entry.canonical, { key: entry.canonical, label: entry.label });
    }
    return [...seen.values()].sort((left, right) => left.label.localeCompare(right.label)).slice(0, 20);
  },

  /** Writes user_topic_follows only. users.research_interests is never touched (R1). */
  async follow(sub: string, topic: string): Promise<void> {
    const userId = await resolveUserUuid(sub);
    const vocab = await loadVocabulary();
    const key = resolveTopicKey(topic, vocab);
    if (!key) throw new AppError(422, "TOPIC_NOT_IN_VOCABULARY", "No discussion or community uses this topic yet");
    // The user's own spelling is what they see back ("Deep Learning"), not the lowercase curated label.
    const label = topic.trim();
    await getPrisma().$transaction(async (tx) => {
      // Serialize concurrent follows of one user so the limit cannot be passed by two parallel requests.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`personalization:follow:${userId}`}))`;
      const existing = await tx.userTopicFollow.findUnique({ where: { userId_topicKey: { userId, topicKey: key } }, select: { topicKey: true } });
      if (!existing) {
        const count = await tx.userTopicFollow.count({ where: { userId } });
        if (count >= PERSONALIZATION.MAX_FOLLOWS) throw AppError.conflict(`You can follow up to ${PERSONALIZATION.MAX_FOLLOWS} topics`);
        await tx.userTopicFollow.create({ data: { userId, topicKey: key, label } });
      }
      await tx.userTopicMute.deleteMany({ where: { userId, topicKey: key } });
    });
    await invalidateProfile(userId);
    if (key.includes(" ")) enqueueRecomputeForumTopics();
  },

  /** A topic that also comes from the academic profile stays in the list with source `profile`. */
  async unfollow(sub: string, rawKey: string): Promise<void> {
    const userId = await resolveUserUuid(sub);
    const key = normalizeTerm(rawKey);
    await getPrisma().userTopicFollow.deleteMany({ where: { userId, topicKey: key } });
    await invalidateProfile(userId);
    if (key.includes(" ")) enqueueRecomputeForumTopics();
  },

  /** Hides a topic from "For you" (including profile interests) and drops any follow of it. */
  async mute(sub: string, topic: string): Promise<void> {
    const userId = await resolveUserUuid(sub);
    const vocab = await loadVocabulary();
    const key = resolveTopicKey(topic, vocab) ?? normalizeTerm(topic);
    if (!key) throw AppError.badRequest("Topic is required");
    const label = topic.trim();
    await getPrisma().$transaction(async (tx) => {
      await tx.userTopicMute.upsert({ where: { userId_topicKey: { userId, topicKey: key } }, create: { userId, topicKey: key, label }, update: {} });
      await tx.userTopicFollow.deleteMany({ where: { userId, topicKey: key } });
    });
    await invalidateProfile(userId);
  },

  async unmute(sub: string, rawKey: string): Promise<void> {
    const userId = await resolveUserUuid(sub);
    await getPrisma().userTopicMute.deleteMany({ where: { userId, topicKey: normalizeTerm(rawKey) } });
    await invalidateProfile(userId);
  },

  /** GET /for-you. Posts and papers fall back independently; the feed itself is never cached. */
  async forYou(sub: string, role: string | undefined, now: Date = new Date()): Promise<ForYouResponse> {
    const userId = await resolveUserUuid(sub);
    const vocab = await loadVocabulary();
    const { profile } = await loadProfile(userId, vocab, now);
    const [signals, voted] = await Promise.all([fetchSignals(userId), fetchVotedPostIds(userId)]);
    const excludePostIds = [...new Set([...signals.map((signal) => signal.postId), ...voted])];
    const visibilitySql = await forumPostVisibilitySql({ userId, role: role as never }, "p");

    // Posts: profile first, then trending to fill the five slots.
    const keys = profile.topics.filter((topic) => topic.matchable).map((topic) => topic.key);
    let personal: ReturnType<typeof rankPersonal> = [];
    if (keys.length > 0) {
      const keySet = new Set(keys);
      const communityIds = (await fetchResearchCommunityTopics())
        .filter((community) => community.researchTopics.some((topic) => keySet.has(resolveTopicKey(topic, vocab) ?? normalizeTerm(topic))))
        .map((community) => community.id);
      const rows = await fetchCandidates({
        userId, visibilitySql, since: new Date(now.getTime() - PERSONALIZATION.CANDIDATE_WINDOW_DAYS * DAY_MS), excludePostIds,
        overlap: { keys, communityIds }, windowSince: new Date(now.getTime() - PERSONALIZATION.TRENDING_DAYS * DAY_MS),
        limit: PERSONALIZATION.CANDIDATE_LIMIT,
      });
      personal = rankPersonal(rows.map((row) => toCandidate(row, vocab)), profile, now);
    }
    const windowSince = new Date(now.getTime() - PERSONALIZATION.TRENDING_DAYS * DAY_MS);
    // Trending and new posts only matter when personal matches do not fill the feed.
    const windowRows = personal.length >= PERSONALIZATION.FEED_SIZE ? [] : await fetchCandidates({
      userId, visibilitySql, since: windowSince, windowSince, excludePostIds, limit: PERSONALIZATION.CANDIDATE_LIMIT,
    });
    const tiers = rankTiers(windowRows.map((row) => toWindowCandidate(row, vocab)), now);
    const { basis: postsBasis, entries } = assembleFeed(personal, tiers);

    const presented = await forumService.listPostsByIds(entries.map((entry) => entry.postId), userId);
    const byId = new Map(presented.map((item) => [item.internalId, item.post]));
    const posts: ForYouPost[] = entries.flatMap((entry) => {
      const post = byId.get(entry.postId);
      return post ? [{
        ...(post as unknown as ForYouPost), reasonKind: entry.reasonKind, reasonTopic: entry.reasonTopic,
        ...(entry.reasonSource ? { reasonSource: entry.reasonSource } : {}),
        ...(entry.reasonCommunity ? { reasonCommunity: entry.reasonCommunity } : {}),
        ...(entry.reasonStats ? { reasonStats: entry.reasonStats } : {}),
      }] : [];
    });

    // Papers: profile topics, then trending topics, then none.
    let papersBasis: ForYouPapersBasis = "none";
    let papers: RelatedPaper[] = [];
    const personalTopics = paperTopicsOf(profile);
    if (personalTopics.length > 0) {
      papers = await papersFor(personalTopics.map((topic) => topic.label), personalTopics.map((topic) => topic.key));
      if (papers.length > 0) papersBasis = "personal";
    }
    if (papers.length === 0) {
      const window = await fetchTrendingWindowPosts(visibilitySql, windowSince);
      // Only posts that qualify as trending (not merely new) say what people are discussing.
      const trendingPosts = rankTiers(window.map((row) => toWindowCandidate(row, vocab)), now).trending;
      const topKeys = trendingTopics(trendingPosts.map(({ candidate }) => ({ heat: heatOf(candidate), topics: candidate.topics })));
      papers = await papersFor(topKeys.map((key) => topicLabel(key, vocab)), topKeys);
      if (papers.length > 0) papersBasis = "trending";
    }
    return { postsBasis: posts.length > 0 ? postsBasis : "none", papersBasis, posts, papers };
  },

  /**
   * GET /communities: research communities the user has no membership row for, matched on topics (sum of W), then
   * filled by meaning. Embedding failures degrade to topic matches only.
   */
  async communities(sub: string, now: Date = new Date()): Promise<ForYouCommunity[]> {
    const userId = await resolveUserUuid(sub);
    const vocab = await loadVocabulary();
    const { profile } = await loadProfile(userId, vocab, now);
    const inputs = communityInputTopics(profile);
    if (inputs.length === 0) return [];
    const limit = PERSONALIZATION.COMMUNITY_SUGGESTIONS;
    const prisma = getPrisma();
    const joinedIds = await fetchMembershipCommunityIds(userId);
    const candidates = await prisma.community.findMany({
      where: { isForumCategory: false, status: "ACTIVE", ...(joinedIds.length ? { id: { notIn: joinedIds } } : {}) },
      orderBy: [{ memberCount: "desc" }, { id: "asc" }],
      take: 500,
    });
    const keySet = canonicalKeys(vocab);
    const ranked = rankCommunities(candidates.map((community) => ({
      id: community.id, memberCount: community.memberCount,
      topicKeys: community.researchTopics.flatMap((topic) => {
        const key = resolveTopicKey(topic, vocab) ?? normalizeTerm(topic);
        return keySet.has(key) ? [key] : [];
      }),
    })), inputs).slice(0, limit);
    const byId = new Map(candidates.map((community) => [community.id, community]));
    const present = (row: (typeof candidates)[number], matchedTopics: ForYouCommunity["matchedTopics"], matchReason: ForYouCommunity["matchReason"]): ForYouCommunity =>
      ({ ...presentCommunity(row, null, undefined, userId), matchedTopics, matchReason });
    const result = ranked.map((item) => present(byId.get(item.id)!, item.matched.map((topic) => ({ key: topic.key, label: topic.label })), "topic"));
    if (result.length >= limit) return result;

    const vector = await embedTopicsSafely(inputs.map((topic) => topic.label), inputs.map((topic) => topic.key));
    if (!vector) return result;
    const nearest = await nearestCommunityIds(vector, { limit: limit - result.length, excludeIds: [...joinedIds, ...ranked.map((item) => item.id)] });
    if (nearest.length === 0) return result;
    const rows = await prisma.community.findMany({ where: { id: { in: nearest.map((row) => row.id) }, status: "ACTIVE", isForumCategory: false } });
    const similarity = new Map(nearest.map((row) => [row.id, row.similarity]));
    return [...result, ...rows.sort((left, right) => (similarity.get(right.id) ?? 0) - (similarity.get(left.id) ?? 0)).map((row) => present(row, [], "semantic"))];
  },
};
