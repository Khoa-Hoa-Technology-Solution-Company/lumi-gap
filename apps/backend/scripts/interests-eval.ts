/**
 * Prints the interest profile of one user and the "For you" ranking behind it, to tune the formulas.
 * Read-only: nothing is written, no cache is touched, the academic profile is only read.
 *
 * Run: pnpm --filter backend eval:interests <userId|email>
 */
import { disconnectRedis } from "../src/infrastructure/redis.js";
import { connectPostgres, disconnectPostgres, getPrisma } from "../src/infrastructure/database/prisma.js";
import { forumPostVisibilitySql } from "../src/modules/forum/forum-visibility.js";
import { loadVocabulary } from "../src/modules/personalization/personalization-topics.service.js";
import { PERSONALIZATION } from "../src/modules/personalization/personalization.constants.js";
import {
  fetchActiveMemberships, fetchCandidates, fetchFollows, fetchMutes, fetchProfileInterests, fetchResearchCommunityTopics, fetchSignals,
  fetchStoredPostTopics, fetchVotedPostIds, type CandidateRow,
} from "../src/modules/personalization/personalization.repository.js";
import {
  assembleFeed, computeInterestProfile, heatOf, participantsOf, rankPersonal, rankTiers,
  type CommunityInterest, type ProfileInterest, type WindowCandidate,
} from "../src/modules/personalization/personalization.rules.js";
import { postTopicRelevance, resolveTopicKey, topicLabel } from "../src/modules/personalization/personalization.topics.js";
import { normalizeTerm } from "../src/modules/taxonomy/taxonomy.normalize.js";

const DAY_MS = 86_400_000;
const fixed = (value: number) => value.toFixed(3);

async function closeConnections(): Promise<void> {
  await disconnectPostgres().catch(() => undefined);
  await disconnectRedis().catch(() => undefined);
}

async function main(): Promise<void> {
  const log = console.log;
  const target = process.argv[2]?.trim();
  if (!target) throw new Error("Pass a user id or email: pnpm --filter backend eval:interests <userId|email>");

  await connectPostgres();
  const prisma = getPrisma();
  const user = await prisma.user.findFirst({
    where: /^[0-9a-f-]{36}$/i.test(target) ? { id: target } : { email: target.toLowerCase() },
    select: { id: true, email: true, role: true },
  });
  if (!user) throw new Error(`No user found for ${target}`);

  const now = new Date();
  const vocab = await loadVocabulary();
  const [signals, follows, mutes, interests, memberships] = await Promise.all([
    fetchSignals(user.id), fetchFollows(user.id), fetchMutes(user.id), fetchProfileInterests(user.id), fetchActiveMemberships(user.id),
  ]);
  const signalPostIds = [...new Set(signals.filter((signal) => !signal.moderated).map((signal) => signal.postId))];
  const stored = await fetchStoredPostTopics(signalPostIds);
  const postTopics = new Map([...stored].map(([id, topics]) => [id, postTopicRelevance(topics, vocab)]));
  const keys = new Set([...vocab.values()].map((entry) => entry.canonical));
  const profileInterests: ProfileInterest[] = interests.flatMap((raw) => {
    const resolved = resolveTopicKey(raw, vocab);
    const key = resolved ?? normalizeTerm(raw);
    return key ? [{ key, label: raw.trim(), matchable: Boolean(resolved) }] : [];
  });
  const communityInterests: CommunityInterest[] = memberships.flatMap((membership) => membership.researchTopics.flatMap((topic) => {
    const key = resolveTopicKey(topic, vocab) ?? normalizeTerm(topic);
    return key && keys.has(key) ? [{ key, label: topic.trim(), community: { id: membership.communityId, name: membership.name }, joinedAt: membership.joinedAt }] : [];
  }));
  const profile = computeInterestProfile({
    now, signals, postTopics, follows, profileInterests, communityInterests, mutedKeys: new Set(mutes.map((mute) => mute.key)),
    labelOf: (key) => topicLabel(key, vocab), isMatchable: (key) => keys.has(key),
  });

  const titleOf = async (ids: string[]) => new Map((ids.length
    ? await prisma.forumPost.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } })
    : []).map((post) => [post.id, post.title]));
  const titles = await titleOf(signalPostIds);

  log(`user ${user.email} (${user.id}) | vocabulary ${vocab.size} terms | A(u) = ${profile.activity} posts with a signal | ${memberships.length} joined communities`);
  log(`muted: ${mutes.map((mute) => mute.label).join(", ") || "-"}\n`);
  log("TOPICS (followed/profile first, then community and inferred competing for the rest)");
  for (const item of profile.topics) {
    const via = item.viaCommunity ? ` via="${item.viaCommunity.name}"` : "";
    log(`- ${item.label} [${item.key}] source=${item.source}${via} W=${fixed(item.weight)} s=${fixed(item.score)} S=${fixed(item.rawScore)} n=${item.evidenceCount} lowConfidence=${item.lowConfidence} matchable=${item.matchable}`);
    for (const contribution of item.contributions.slice(0, 8)) {
      log(`    ${(titles.get(contribution.postId) ?? contribution.postId).slice(0, 70)} | e=${contribution.e} r=${contribution.r} B=${contribution.bonus}`);
    }
  }

  const visibilitySql = await forumPostVisibilitySql({ userId: user.id, role: user.role as never }, "p");
  const voted = await fetchVotedPostIds(user.id);
  const excludePostIds = [...new Set([...signals.map((signal) => signal.postId), ...voted])];
  const windowSince = new Date(now.getTime() - PERSONALIZATION.TRENDING_DAYS * DAY_MS);
  const matchKeys = profile.topics.filter((topic) => topic.matchable).map((topic) => topic.key);
  const candidate = (row: CandidateRow) => ({
    id: row.id, bucketId: row.bucketId, bucketName: row.bucketName, lastActivityAt: row.lastActivityAt,
    voteScore: row.voteScore, commentCount: row.commentCount, topics: postTopicRelevance(row.stored, vocab),
  });

  let personal: ReturnType<typeof rankPersonal> = [];
  if (matchKeys.length > 0) {
    const keySet = new Set(matchKeys);
    const communityIds = (await fetchResearchCommunityTopics())
      .filter((community) => community.researchTopics.some((topic) => keySet.has(resolveTopicKey(topic, vocab) ?? normalizeTerm(topic))))
      .map((community) => community.id);
    const rows = await fetchCandidates({
      userId: user.id, visibilitySql, since: new Date(now.getTime() - PERSONALIZATION.CANDIDATE_WINDOW_DAYS * DAY_MS), excludePostIds,
      overlap: { keys: matchKeys, communityIds }, windowSince, limit: PERSONALIZATION.CANDIDATE_LIMIT,
    });
    personal = rankPersonal(rows.map(candidate), profile, now);
    log(`\nPERSONAL CANDIDATES: ${rows.length} fetched, ${personal.length} with a matching topic`);
    const names = await titleOf(personal.slice(0, 10).map((item) => item.candidate.id));
    for (const item of personal.slice(0, 10)) {
      log(`- ${(names.get(item.candidate.id) ?? item.candidate.id).slice(0, 70)} | match=${fixed(item.match)} fresh=${fixed(item.fresh)} q=${fixed(item.quality)} score=${fixed(item.score)} | ${item.reasonKind}: ${item.reasonTopic.label}`);
    }
  } else log("\nPERSONAL CANDIDATES: no matchable topics");

  const windowRows = await fetchCandidates({ userId: user.id, visibilitySql, since: windowSince, windowSince, excludePostIds, limit: PERSONALIZATION.CANDIDATE_LIMIT });
  const tiers = rankTiers(windowRows.map((row): WindowCandidate => ({
    ...candidate(row), createdAt: row.createdAt, readers: row.readers, repliers: row.repliers, readerRepliers: row.readerRepliers, inJoinedCommunity: row.inJoinedCommunity,
  })), now);
  const { basis, entries } = assembleFeed(personal, tiers);
  const byPost = new Map([...tiers.trending, ...tiers.fresh].map((entry) => [entry.candidate.id, entry]));
  const feedTitles = await titleOf(entries.map((entry) => entry.postId));
  log(`\nFEED (postsBasis=${basis}, ${windowRows.length} window candidates: ${tiers.trending.length} trending, ${tiers.fresh.length} new)`);
  for (const entry of entries) {
    const tier = byPost.get(entry.postId);
    const detail = tier
      ? ` tier=${tier.tier} readers=${tier.candidate.readers} repliers=${tier.candidate.repliers} heat=${heatOf(tier.candidate)} participants=${participantsOf(tier.candidate)} joined=${tier.candidate.inJoinedCommunity}`
      : " tier=personal";
    log(`- ${(feedTitles.get(entry.postId) ?? entry.postId).slice(0, 60)} | ${entry.reasonKind}: ${entry.reasonTopic.label}${detail}`);
  }
  await closeConnections();
  // Importing the topic service creates a BullMQ queue (its own Redis connection), which keeps the process alive.
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await closeConnections();
  process.exit(1);
});
