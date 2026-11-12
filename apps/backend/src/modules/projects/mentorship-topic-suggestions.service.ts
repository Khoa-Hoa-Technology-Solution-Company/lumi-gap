import { createHash } from "node:crypto";
import { z } from "zod";
import { normalizeResearchTerm, TECHNICAL_SKILLS, type ResearchTopicSuggestionJob, type ResearchTopicSuggestions } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { aiJobsQueue } from "../../infrastructure/queue.js";
import { redis } from "../../infrastructure/redis.js";
import { cache } from "../../infrastructure/cache.js";
import { appendOpenAlexIdentity } from "../api-sync/providers/openalex.client.js";
import { resolveResearchClassification } from "../taxonomy/research-classification.service.js";
import { assertAcademicRelationshipManager } from "./academic-relationship-access.js";

export const MENTOR_TOPICS_JOB = "mentor-research-topics";
type Payload = { projectId: string; ownerId: string; title: string; abstract: string; consentAt: string; inputHash: string };
const hash = (title: string, abstract: string) => createHash("sha256").update(JSON.stringify([title, abstract])).digest("hex");
const entity = z.object({ id: z.string().max(400), display_name: z.string().trim().min(1).max(300) });
const topicSchema = entity.extend({ score: z.number().min(0).max(1).optional(), domain: entity, field: entity, subfield: entity });
const responseSchema = z.object({ topics: z.array(topicSchema).max(10).default([]), keywords: z.array(entity).max(30).default([]) });
function skillsInText(value: string) {
  const words = ` ${normalizeResearchTerm(value).replace(/[^\p{L}\p{N}+#.-]+/gu, " ")} `;
  return TECHNICAL_SKILLS.filter(skill => [skill.label, ...skill.aliases].some(alias => alias.length >= 3 && words.includes(` ${normalizeResearchTerm(alias)} `))).map(skill => skill.id);
}

/** Specialized OpenAlex classifier. Runs only on the existing AI worker, never in a page request. */
export const mentorshipTopicSuggestions = {
  async start(projectId: string, ownerId: string): Promise<ResearchTopicSuggestionJob> {
    const project = await assertAcademicRelationshipManager(projectId, ownerId);
    if (["ARCHIVED", "COMPLETED"].includes(project.status)) throw AppError.conflict("This project is read-only");
    const title = project.title.trim(), abstract = project.mentorshipSummary?.trim() ?? "";
    if (abstract.length < 20 || title.length + abstract.length > 2000) throw AppError.badRequest("Save an approved abstract of at least 20 characters; title and abstract together must be at most 2000 characters.");
    const inputHash = hash(title, abstract), jobId = `mentor-topics-${projectId}-${ownerId}-${inputHash}`;
    const previous = await aiJobsQueue.getJob(jobId);
    if (previous && await previous.getState() === "failed") await previous.remove();
    await aiJobsQueue.add(MENTOR_TOPICS_JOB, { projectId, ownerId, title, abstract, inputHash, consentAt: new Date().toISOString() } satisfies Payload,
      { jobId, attempts: 3, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: { age: 3600, count: 100 }, removeOnFail: { age: 3600, count: 100 } });
    return this.status(projectId, ownerId, jobId);
  },
  async status(projectId: string, ownerId: string, jobId: string): Promise<ResearchTopicSuggestionJob> {
    await assertAcademicRelationshipManager(projectId, ownerId);
    const job = await aiJobsQueue.getJob(jobId);
    if (!job || job.name !== MENTOR_TOPICS_JOB || job.data.projectId !== projectId || job.data.ownerId !== ownerId) throw AppError.notFound("Suggestion request not found");
    const state = await job.getState();
    return { jobId, status: state === "completed" ? "COMPLETED" : state === "failed" ? "FAILED" : state === "active" ? "PROCESSING" : "QUEUED", ...(state === "completed" ? { result: job.returnvalue as ResearchTopicSuggestions } : {}) };
  },
  async process(payload: Payload): Promise<ResearchTopicSuggestions> {
    const project = await assertAcademicRelationshipManager(payload.projectId, payload.ownerId);
    if (!payload.consentAt || hash(project.title.trim(), project.mentorshipSummary?.trim() ?? "") !== payload.inputHash || ["ARCHIVED", "COMPLETED"].includes(project.status)) throw new Error("Approved research brief changed; request suggestions again.");
    const cacheKey = `mentor-classification:v2:${payload.projectId}:${payload.ownerId}:${payload.inputHash}`;
    const previous = await cache.get<ResearchTopicSuggestions>(cacheKey); if (previous) return previous;
    let result: ResearchTopicSuggestions;
    try {
      // Distributed, provider-wide 1 request/second gate. A busy gate retries through BullMQ.
      if (!await redis.set("openalex:text:rate", "1", "EX", 1, "NX")) throw AppError.conflict("Classifier rate limit; retry shortly");
      const url = new URL("https://api.openalex.org/text"); appendOpenAlexIdentity(url); url.searchParams.set("version", "2");
      const response = await fetch(url, { method: "POST", redirect: "error", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ title: payload.title, abstract: payload.abstract }), signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error("Classifier unavailable");
      // Never log provider bodies: they can contain the submitted private text or credentials.
      result = await this.importSuggestions(responseSchema.parse(await response.json()));
      result.classification.skillIds = skillsInText(`${payload.title} ${payload.abstract}`);
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 409) throw error;
      result = await this.localSuggestions(payload.title, payload.abstract);
    }
    await cache.set(cacheKey, result, 3600); return result;
  },
  async importSuggestions(input: z.infer<typeof responseSchema>): Promise<ResearchTopicSuggestions> {
    const db = getPrisma(), nodeIds: string[] = [], keywordIds: string[] = [], confidence: Record<string, number> = {};
    await db.$transaction(async tx => {
      for (const topic of input.topics) {
        let parentTopicId: string | null = null;
        for (const [level, entry] of [["domain", topic.domain], ["field", topic.field], ["subfield", topic.subfield], ["topic", topic]] as const) {
          const pattern = level === "topic" ? /^https:\/\/openalex\.org\/(T\d+)$/ : new RegExp(`^https://openalex\\.org/${level}s/(\\d+)$`);
          const externalId = entry.id.match(pattern)?.[1]; if (!externalId) { parentTopicId = null; break; }
          const node: { id: string; status: string } = await tx.researchTopic.upsert({ where: { level_openalexId: { level, openalexId: externalId } },
            create: { level, openalexId: externalId, topicName: entry.display_name, parentTopicId, syncedAt: new Date(), sourceVersion: "OpenAlex-text-v2" },
            update: {} });
          if (node.status !== "active") { parentTopicId = null; break; }
          parentTopicId = node.id;
          if (level === "topic") { nodeIds.push(node.id); if (topic.score !== undefined) confidence[node.id] = topic.score; }
        }
      }
      for (const entry of input.keywords) {
        const externalId = entry.id.match(/^https:\/\/openalex\.org\/keywords\/([a-z0-9-]+)$/)?.[1]; if (!externalId) continue;
        const normalizedName = normalizeResearchTerm(entry.display_name);
        let keyword = await tx.keyword.findUnique({ where: { openalexId: externalId } }) ?? await tx.keyword.upsert({ where: { normalizedName }, create: { keywordName: entry.display_name, normalizedName, openalexId: externalId, syncedAt: new Date(), sourceVersion: "OpenAlex-text-v2" }, update: {} });
        if (!keyword.openalexId && keyword.status === "active") {
          // The provider's exact normalized label can identify an existing local keyword.
          // Never replace a conflicting provider identity or alter curated labels/aliases.
          await tx.keyword.updateMany({ where: { id: keyword.id, openalexId: null }, data: { openalexId: externalId, syncedAt: new Date(), sourceVersion: "OpenAlex-text-v2" } });
          keyword = await tx.keyword.findUniqueOrThrow({ where: { id: keyword.id } });
        }
        if (keyword.status === "active" && keyword.openalexId === externalId) keywordIds.push(keyword.id);
      }
    });
    return { classification: await resolveResearchClassification({ nodeIds: [...new Set(nodeIds)], keywordIds: [...new Set(keywordIds)], skillIds: [] }), source: "OPENALEX", providerVersion: "OpenAlex-text-v2", generatedAt: new Date().toISOString(), topicConfidence: confidence };
  },
  async localSuggestions(title: string, abstract: string): Promise<ResearchTopicSuggestions> {
    const db = getPrisma(), text = normalizeResearchTerm(`${title} ${abstract}`), words = [...new Set(text.split(/[^\p{L}\p{N}-]+/u).filter(word => word.length >= 4))].slice(0, 12);
    const [topics, keywords] = await Promise.all([
      words.length ? db.researchTopic.findMany({ where: { status: "active", level: "topic", OR: words.map(word => ({ topicName: { contains: word, mode: "insensitive" as const } })) }, orderBy: [{ paperCount: "desc" }, { id: "asc" }], take: 5 }) : [],
      words.length ? db.keyword.findMany({ where: { status: "active", OR: words.map(word => ({ normalizedName: { contains: word, mode: "insensitive" as const } })) }, orderBy: [{ paperCount: "desc" }, { id: "asc" }], take: 8 }) : [],
    ]);
    const skillIds = skillsInText(text);
    return { classification: await resolveResearchClassification({ nodeIds: topics.map(topic => topic.id), keywordIds: keywords.map(keyword => keyword.id), skillIds }), source: "LOCAL", generatedAt: new Date().toISOString() };
  },
};
