import type { ProjectChatScope } from "@trend/shared-types";
import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";
import { hashKey } from "../../infrastructure/cache.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { logger } from "../../infrastructure/logger.js";
import { auditService } from "../audit/audit.service.js";
import { creditService } from "../credits/credit.service.js";
import { getEmbeddingProvider } from "../embeddings/embedding.factory.js";
import { getLlmProvider } from "../llm/llm.factory.js";
import { cachedGenerate } from "../llm/llm.run.js";
import { projectChatEventHub } from "./project-chat.events.js";
import { buildChatPrompt, parseCitations, pickEvidence, type ChatEvidencePaper, type ChatHistoryTurn } from "./project-chat.prompt.js";
import { fitToBudget, normalizeQuestion, PROJECT_CHAT_PROMPT_VERSION } from "./project-chat.tokens.js";
import { assertProjectHasPapers } from "./project-scope.js";

export interface SendProjectChatMessageResult { scope: ProjectChatScope; answer: string; citedPaperIds: string[]; creditCost: number; }
type UserSummary = { id: string; fullName?: string; email?: string; avatarUrl?: string };
export interface ProjectChatHistoryMessage { id: string; projectId: string; userId: string; scope: ProjectChatScope; role: "user" | "assistant"; content: string; citedPaperIds: string[]; requester?: UserSummary; creditCost?: number; isPinned?: boolean; pinnedAt?: string; pinnedBy?: UserSummary; createdAt: string; }
type ChatRow = { id: string; legacyMongoId: string | null; projectId: string; userId: string; scope: string; role: string; content: string; creditCost: number | null; isPinned: boolean; pinnedAt: Date | null; pinnedById: string | null; createdAt: Date; };

function idWhere(value: string): { id?: string; legacyMongoId?: string } {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.badRequest("Invalid database identifier");
  return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value };
}

/** Centralizes the private/team message visibility boundary. */
export function buildChatHistoryFilter(projectId: string, userId: string, scope: ProjectChatScope): Prisma.ProjectChatMessageWhereInput {
  return scope === "private" ? { projectId, userId, scope: "private" } : { projectId, scope };
}

export class ProjectChatService {
  async sendMessage(projectIdInput: string, userIdInput: string, message: string, scope: ProjectChatScope = "private"): Promise<SendProjectChatMessageResult> {
    const access = await this.assertCanAccess(projectIdInput, userIdInput);
    const projectId = access.project.id;
    const userId = access.user.id;
    const papers = await this.loadProjectEvidence(projectId);
    assertProjectHasPapers(papers.map((paper) => paper.id), "project chat");
    const tx = await creditService.chargeCreditsChecked({ userId, action: "project_chat_message", amount: 1, targetKind: "project_chat", targetId: projectId, idempotencyKey: `chat:${projectId}:${userId}:${crypto.randomUUID()}` });
    const txId = tx?.id;
    const selectedEvidence = await this.selectEvidence(message, papers);
    const selectedHistory = await this.loadRecentHistory(projectId, userId, scope);
    const fitted = fitToBudget({ papers: selectedEvidence, history: selectedHistory, maxChars: env.CHAT_MAX_PROMPT_CHARS, abstractMaxChars: env.CHAT_ABSTRACT_MAX_CHARS, render: (evidence, history) => { const built = buildChatPrompt({ question: message, evidence, history, abstractMaxChars: env.CHAT_ABSTRACT_MAX_CHARS }); return `${built.system}\n${built.prompt}`; } });
    const evidence = [...fitted.papers].sort((a, b) => a.id.localeCompare(b.id));
    const { system, prompt } = buildChatPrompt({ question: message, evidence, history: fitted.history, abstractMaxChars: env.CHAT_ABSTRACT_MAX_CHARS });
    const provider = getLlmProvider();
    const model = provider.name === "ollama" ? env.OLLAMA_MODEL : env.GEMINI_MODEL_FAST;
    let result: SendProjectChatMessageResult;
    try {
      result = await cachedGenerate<SendProjectChatMessageResult>({ task: "chat", promptVersion: PROJECT_CHAT_PROMPT_VERSION, keyParts: { projectId, scope, question: normalizeQuestion(message), paperIds: evidence.map((paper) => paper.id).sort(), provider: provider.name }, inputHash: hashKey({ system, prompt }), model, ttlSeconds: env.CHAT_CACHE_TTL_SECONDS, generate: async () => { const answer = (await provider.generate(prompt, { system, temperature: 0.25, maxOutputTokens: 1024 })).trim().slice(0, 4000); return { scope, answer, citedPaperIds: parseCitations(answer, evidence), creditCost: 1 }; } });
    } catch (error) {
      if (txId) await creditService.refundCreditsOnce({ transactionId: txId, reason: "Project chat message LLM call failed" });
      logger.warn({ err: error, projectId, userId, provider: provider.name }, "project chat LLM failed");
      throw AppError.serviceUnavailable("LLM provider unreachable");
    }
    result = { ...result, scope, creditCost: result.creditCost ?? 1 };
    const saved = await this.saveTurn(projectId, userId, message, scope, result.answer, result.citedPaperIds, txId, result.creditCost);
    if (scope === "team") {
      for (const savedMessage of saved) projectChatEventHub.publish({ type: "message.created", projectId: projectIdInput, scope, message: savedMessage, occurredAt: new Date().toISOString() });
      await auditService.log("project.ai_chat.team_message_sent", { userId, targetTableName: "projects", targetRecordId: projectId, details: { citedPaperIds: result.citedPaperIds, creditCost: result.creditCost } });
    }
    return result;
  }

  private async saveTurn(projectId: string, userId: string, message: string, scope: ProjectChatScope, answer: string, citedPaperIds: string[], creditTransactionId?: string, creditCost = 1): Promise<ProjectChatHistoryMessage[]> {
    const prisma = getPrisma();
    const citationFilters = citedPaperIds.map((id) => idWhere(id));
    const citedPapers = citationFilters.length ? await prisma.paper.findMany({ where: { OR: citationFilters }, select: { id: true } }) : [];
    const rows = await prisma.$transaction(async (db) => {
      const userMessage = await db.projectChatMessage.create({ data: { projectId, userId, scope, role: "user", content: message } });
      const assistantMessage = await db.projectChatMessage.create({ data: { projectId, userId, scope, role: "assistant", content: answer, creditTransactionId, creditCost } });
      if (citedPapers.length) await db.projectChatCitation.createMany({ data: citedPapers.map((paper, position) => ({ messageId: assistantMessage.id, paperId: paper.id, position })), skipDuplicates: true });
      return [userMessage, assistantMessage];
    });
    const users = await this.loadUserSummaries([userId]);
    return Promise.all(rows.map((row) => this.toHistoryMessage(row, users, users)));
  }

  async listHistory(projectIdInput: string, userIdInput: string, limit: number, scope: ProjectChatScope = "private"): Promise<ProjectChatHistoryMessage[]> {
    const access = await this.assertCanAccess(projectIdInput, userIdInput);
    const rows = await getPrisma().projectChatMessage.findMany({ where: buildChatHistoryFilter(access.project.id, access.user.id, scope), orderBy: { createdAt: "desc" }, take: limit });
    const requesters = await this.loadUserSummaries(rows.map((row) => row.userId));
    const pinnedBy = await this.loadUserSummaries(rows.flatMap((row) => row.pinnedById ? [row.pinnedById] : []));
    return Promise.all(rows.reverse().map((row) => this.toHistoryMessage(row, requesters, pinnedBy)));
  }

  async setPinned(projectIdInput: string, messageIdInput: string, userIdInput: string, pinned: boolean): Promise<ProjectChatHistoryMessage> {
    const access = await this.assertCanAccess(projectIdInput, userIdInput);
    const message = await getPrisma().projectChatMessage.findFirst({ where: { ...idWhere(messageIdInput), projectId: access.project.id, scope: "team", role: "assistant" } });
    if (!message) throw AppError.notFound("Team AI assistant message not found");
    const row = await getPrisma().projectChatMessage.update({ where: { id: message.id }, data: { isPinned: pinned, pinnedAt: pinned ? new Date() : null, pinnedById: pinned ? access.user.id : null } });
    const users = await this.loadUserSummaries([row.userId, access.user.id]);
    const hydrated = await this.toHistoryMessage(row, users, users);
    projectChatEventHub.publish({ type: "message.updated", projectId: projectIdInput, scope: "team", message: hydrated, occurredAt: new Date().toISOString() });
    await auditService.log("project.ai_chat.message_pin_updated", { userId: access.user.id, targetTableName: "project_chat_messages", targetRecordId: row.id, details: { projectId: access.project.id, pinned } });
    return hydrated;
  }

  private async selectEvidence(question: string, papers: ChatEvidencePaper[]): Promise<ChatEvidencePaper[]> { if (papers.length <= env.CHAT_CONTEXT_PAPERS) return pickEvidence(papers, env.CHAT_CONTEXT_PAPERS); const questionVector = await getEmbeddingProvider().embed(normalizeQuestion(question)); return pickEvidence(papers, env.CHAT_CONTEXT_PAPERS, questionVector); }

  private async loadRecentHistory(projectId: string, userId: string, scope: ProjectChatScope): Promise<ChatHistoryTurn[]> {
    const limit = env.CHAT_HISTORY_TURNS * 2;
    if (limit === 0) return [];
    const rows = await getPrisma().projectChatMessage.findMany({ where: buildChatHistoryFilter(projectId, userId, scope), orderBy: { createdAt: "desc" }, take: limit, select: { role: true, content: true } });
    return rows.reverse().map((row) => ({ role: row.role as "user" | "assistant", content: row.content }));
  }

  private async loadProjectEvidence(projectId: string): Promise<ChatEvidencePaper[]> {
    const prisma = getPrisma();
    const links = await prisma.projectPaper.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
    if (!links.length) return [];
    const papers = await prisma.paper.findMany({ where: { id: { in: links.map((link) => link.paperId) } }, select: { id: true, legacyMongoId: true, title: true, abstractText: true, publicationYear: true } });
    const authors = await prisma.paperAuthor.findMany({ where: { paperId: { in: papers.map((paper) => paper.id) } }, orderBy: { position: "asc" } });
    const authorsByPaper = new Map<string, string[]>();
    for (const author of authors) { const list = authorsByPaper.get(author.paperId) ?? []; list.push(author.displayName); authorsByPaper.set(author.paperId, list); }
    const byId = new Map(papers.map((paper) => [paper.id, paper]));
    return links.flatMap((link) => { const paper = byId.get(link.paperId); return paper ? [{ id: publicDatabaseId(paper), title: paper.title, abstractText: paper.abstractText ?? undefined, publicationYear: paper.publicationYear, authorNames: authorsByPaper.get(paper.id) ?? [] }] : []; });
  }

  private async assertCanAccess(projectIdInput: string, userIdInput: string) {
    const prisma = getPrisma();
    const [project, user] = await Promise.all([prisma.project.findFirst({ where: idWhere(projectIdInput) }), prisma.user.findFirst({ where: idWhere(userIdInput) })]);
    if (!project) throw AppError.notFound("Project not found");
    if (!user) throw AppError.notFound("User not found");
    if (project.ownerId !== user.id) { const member = await prisma.projectMember.findFirst({ where: { projectId: project.id, userId: user.id, status: "active" } }); if (!member) throw AppError.forbidden("Access denied to this project"); }
    return { project, user };
  }

  async assertCanOpenEvents(projectId: string, userId: string): Promise<void> { await this.assertCanAccess(projectId, userId); }

  private async toHistoryMessage(row: ChatRow, requesters: Map<string, UserSummary>, pinnedBy: Map<string, UserSummary>): Promise<ProjectChatHistoryMessage> {
    const citations = await getPrisma().projectChatCitation.findMany({ where: { messageId: row.id }, orderBy: { position: "asc" } });
    const papers = citations.length ? await getPrisma().paper.findMany({ where: { id: { in: citations.map((citation) => citation.paperId) } }, select: { id: true, legacyMongoId: true } }) : [];
    const paperIds = new Map(papers.map((paper) => [paper.id, publicDatabaseId(paper)]));
    return { id: publicDatabaseId(row), projectId: row.projectId, userId: row.userId, scope: row.scope as ProjectChatScope, role: row.role as "user" | "assistant", content: row.content, citedPaperIds: citations.flatMap((citation) => { const id = paperIds.get(citation.paperId); return id ? [id] : []; }), requester: requesters.get(row.userId), creditCost: row.creditCost ?? undefined, isPinned: row.isPinned, pinnedAt: row.pinnedAt?.toISOString(), pinnedBy: row.pinnedById ? pinnedBy.get(row.pinnedById) : undefined, createdAt: row.createdAt.toISOString() };
  }

  private async loadUserSummaries(userIds: string[]) {
    const uniqueIds = [...new Set(userIds)].filter(Boolean);
    if (!uniqueIds.length) return new Map<string, UserSummary>();
    const users = await getPrisma().user.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, legacyMongoId: true, fullName: true, email: true, avatarUrl: true } });
    return new Map(users.map((user) => [user.id, { id: publicDatabaseId(user), fullName: user.fullName, email: user.email, avatarUrl: user.avatarUrl ?? undefined }]));
  }
}

export const projectChatService = new ProjectChatService();
