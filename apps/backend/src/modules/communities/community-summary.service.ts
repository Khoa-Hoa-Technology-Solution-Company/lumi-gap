import type { UserRole } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { cache, hashKey } from "../../infrastructure/cache.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { communitySummaryQueue } from "../../infrastructure/queue.js";
import { LlmContentError, generateText } from "../llm/gemini.client.js";
import { assertCitationsInRange, sanitizeForPrompt, UNTRUSTED_DATA_PREAMBLE } from "../llm/grounding.js";
import { buildLlmCacheKey, cachedGenerate, routeLlmModel } from "../llm/llm.run.js";
import { withPlatformAi } from "../user-ai/user-ai.runtime.js";
import { auditService } from "../audit/audit.service.js";
import { getActiveCommunityMembership, resolveCommunityId } from "./community.service.js";

/** Bump when the prompt changes so old cached summaries are invalidated (§6). */
export const COMMUNITY_SUMMARY_PROMPT_VERSION = "community-summary-v2";
export const COMMUNITY_SUMMARY_WINDOW_DAYS = 7;
const MAX_POSTS = 30;
const MAX_BODY_CHARS = 1200;

const SYSTEM_PROMPT = [
  "You summarize a week of discussion in an academic research community forum.",
  "Write a concise summary (under 250 words) with: main topics, notable questions and open problems, and any emerging consensus.",
  "Write in the language used by most of the posts. Use only the supplied posts; do not invent details or citations.",
  "Cite the posts you draw on inline as [n] (the post number). Do not cite numbers that are not listed.",
  UNTRUSTED_DATA_PREAMBLE,
].join(" ");

export interface CommunitySummarySource { n: number; id: string; title: string; publicSlug?: string }

export type CommunitySummaryStatus =
  | { status: "completed"; summary: string; postCount: number; sources: CommunitySummarySource[] }
  | { status: "pending"; postCount: number }
  | { status: "failed"; message: string; postCount: number }
  | { status: "none"; postCount: number };

interface CachedCommunitySummary { summary: string; postIds: string[] }

interface RecentPost { id: string; updatedAt: Date }

export interface CommunitySummaryPromptPost { title: string; body: string; type: string; tags: string[]; commentCount: number }

function postVersionsOf(posts: RecentPost[]): string[] {
  return posts.map((post) => `${post.id}:${post.updatedAt.toISOString()}`).sort();
}

/**
 * The summary is shared community data, so it always lives in the platform AI namespace: a viewer with a
 * personal AI connection must read (and fill) the same cache entry as everyone else.
 */
export function communitySummaryCacheKey(communityId: string, postVersions: string[]): string {
  return withPlatformAi(() => buildLlmCacheKey({
    task: "summary",
    promptVersion: COMMUNITY_SUMMARY_PROMPT_VERSION,
    model: routeLlmModel("summary"),
    keyParts: { communityId },
    inputHash: hashKey(postVersions),
  }));
}

function jobIdFor(communityId: string, postVersions: string[]): string {
  // BullMQ custom job ids may not contain ":".
  return `community-summary-${hashKey({ communityId, postVersions, v: COMMUNITY_SUMMARY_PROMPT_VERSION })}`;
}

export function buildCommunitySummaryPrompt(community: { name: string; researchField?: string | null }, posts: CommunitySummaryPromptPost[]): string {
  return [
    `Community: ${sanitizeForPrompt(community.name)}${community.researchField ? ` (${sanitizeForPrompt(community.researchField)})` : ""}`,
    ...posts.map((post, index) => {
      const n = index + 1;
      return [
        `<<<POST_${n}>>>`,
        `[${n}] type=${post.type} comments=${post.commentCount} tags=${post.tags.map(sanitizeForPrompt).join(", ") || "none"}`,
        `Title: ${sanitizeForPrompt(post.title)}`,
        sanitizeForPrompt(post.body).slice(0, MAX_BODY_CHARS),
        `<<<END_POST_${n}>>>`,
      ].join("\n");
    }),
  ].join("\n\n");
}

async function recentPosts(communityId: string): Promise<RecentPost[]> {
  const since = new Date(Date.now() - COMMUNITY_SUMMARY_WINDOW_DAYS * 24 * 3600 * 1000);
  return getPrisma().forumPost.findMany({
    where: { researchCommunityId: communityId, status: "active", visibilityStatus: "ACTIVE", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: MAX_POSTS,
    select: { id: true, updatedAt: true },
  });
}

async function assertCanSummarize(communityId: string, actorId: string, actorRole: UserRole): Promise<string> {
  const id = await resolveCommunityId(communityId);
  const community = await getPrisma().community.findUniqueOrThrow({ where: { id }, select: { status: true } });
  if (community.status !== "ACTIVE") throw AppError.conflict("Summaries are only available for active communities");
  if (actorRole !== "admin" && !(await getActiveCommunityMembership(id, actorId))) {
    throw AppError.forbidden("Active community membership is required to request a summary");
  }
  return id;
}

async function jobSnapshot(jobId: string) {
  const job = await communitySummaryQueue.getJob(jobId);
  if (!job) return null;
  return { job, state: await job.getState() };
}

const IN_FLIGHT_STATES = new Set(["waiting", "active", "delayed", "prioritized", "waiting-children"]);

async function statusFor(communityId: string, postVersions: string[]): Promise<CommunitySummaryStatus> {
  const postCount = postVersions.length;
  const cached = await cache.get<CachedCommunitySummary>(communitySummaryCacheKey(communityId, postVersions));
  if (cached !== null && typeof cached === "object" && typeof cached.summary === "string") {
    const postIds = Array.isArray(cached.postIds) ? cached.postIds : [];
    const found = postIds.length
      ? await getPrisma().forumPost.findMany({ where: { id: { in: postIds } }, select: { id: true, legacyMongoId: true, publicSlug: true, title: true } })
      : [];
    const byId = new Map(found.map((post) => [post.id, post]));
    const sources = postIds.flatMap((id, index) => {
      const post = byId.get(id);
      return post ? [{ n: index + 1, id: publicDatabaseId(post), title: post.title, ...(post.publicSlug ? { publicSlug: post.publicSlug } : {}) }] : [];
    });
    return { status: "completed", summary: cached.summary, postCount, sources };
  }
  const snapshot = await jobSnapshot(jobIdFor(communityId, postVersions));
  if (snapshot && IN_FLIGHT_STATES.has(snapshot.state)) return { status: "pending", postCount };
  if (snapshot?.state === "failed") return { status: "failed", message: "Summary generation failed. Try again later.", postCount };
  return { status: "none", postCount };
}

export const communitySummaryService = {
  /** Enqueue a summary job, or return the cached result. Never calls the LLM in-request. */
  async request(communityId: string, actorId: string, actorRole: UserRole): Promise<CommunitySummaryStatus> {
    const id = await assertCanSummarize(communityId, actorId, actorRole);
    const posts = await recentPosts(id);
    if (posts.length === 0) throw AppError.badRequest(`No discussions in the last ${COMMUNITY_SUMMARY_WINDOW_DAYS} days to summarize`);
    const postVersions = postVersionsOf(posts);

    const current = await statusFor(id, postVersions);
    if (current.status === "completed" || current.status === "pending") return current;

    const jobId = jobIdFor(id, postVersions);
    // A failed/finished job with the same id would silently swallow the add().
    const stale = await jobSnapshot(jobId);
    if (stale) await stale.job.remove().catch(() => undefined);
    await communitySummaryQueue.add("summarize", { communityId: id, postIds: posts.map((post) => post.id).sort(), postVersions }, { jobId });
    await auditService.log("community.summary.requested", { userId: actorId, targetTableName: "communities", targetRecordId: id, details: { postCount: posts.length } });
    return { status: "pending", postCount: posts.length };
  },

  async status(communityId: string, actorId: string, actorRole: UserRole): Promise<CommunitySummaryStatus> {
    const id = await assertCanSummarize(communityId, actorId, actorRole);
    const posts = await recentPosts(id);
    if (posts.length === 0) return { status: "none", postCount: 0 };
    return statusFor(id, postVersionsOf(posts));
  },

  /** Worker entry point. The only place in this feature that calls the LLM. */
  async generate(communityId: string, postIds: string[], postVersions?: string[]): Promise<CachedCommunitySummary> {
    const [community, posts] = await Promise.all([
      getPrisma().community.findUniqueOrThrow({ where: { id: communityId }, select: { name: true, researchField: true } }),
      getPrisma().forumPost.findMany({
        where: { id: { in: postIds }, researchCommunityId: communityId, status: "active", visibilityStatus: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        select: { id: true, updatedAt: true, title: true, body: true, type: true, tags: true, commentCount: true },
      }),
    ]);
    if (posts.length === 0) throw AppError.notFound("No active posts left to summarize");
    const prompt = buildCommunitySummaryPrompt(community, posts);
    const versions = postVersions ?? postVersionsOf(posts);
    return withPlatformAi(() => cachedGenerate<CachedCommunitySummary>({
      task: "summary",
      promptVersion: COMMUNITY_SUMMARY_PROMPT_VERSION,
      keyParts: { communityId },
      inputHash: hashKey(versions),
      generate: async (model) => ({
        summary: await generateText(prompt, { model, system: SYSTEM_PROMPT, temperature: 0.3, maxOutputTokens: 2048 }),
        postIds: posts.map((post) => post.id),
      }),
      validate: (output) => {
        assertCitationsInRange(output.summary, output.postIds.length, (message) => new LlmContentError(message));
        return output;
      },
    }));
  },
};
