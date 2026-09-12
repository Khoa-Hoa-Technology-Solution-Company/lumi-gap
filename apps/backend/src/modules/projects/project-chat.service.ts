import mongoose from "mongoose";
import type { FilterQuery } from "mongoose";
import type { ProjectChatScope } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";
import { creditService } from "../credits/credit.service.js";
import { auditService } from "../audit/audit.service.js";
import { hashKey } from "../../infrastructure/cache.js";
import { logger } from "../../infrastructure/logger.js";
import { getEmbeddingProvider } from "../embeddings/embedding.factory.js";
import { getLlmProvider } from "../llm/llm.factory.js";
import { cachedGenerate } from "../llm/llm.run.js";
import { PaperModel } from "../papers/models/paper.model.js";
import { UserModel } from "../auth/models/user.model.js";
import { ProjectModel } from "./models/project.model.js";
import {
  ProjectChatMessageModel,
  type ProjectChatMessageDoc,
} from "./models/project-chat-message.model.js";
import { projectChatEventHub } from "./project-chat.events.js";
import {
  buildChatPrompt,
  parseCitations,
  pickEvidence,
  type ChatEvidencePaper,
  type ChatHistoryTurn,
} from "./project-chat.prompt.js";
import {
  fitToBudget,
  normalizeQuestion,
  PROJECT_CHAT_PROMPT_VERSION,
} from "./project-chat.tokens.js";
import { assertProjectHasPapers } from "./project-scope.js";

export interface SendProjectChatMessageResult {
  scope: ProjectChatScope;
  answer: string;
  citedPaperIds: string[];
  creditCost: number;
}

export interface ProjectChatHistoryMessage {
  id: string;
  projectId: string;
  userId: string;
  scope: ProjectChatScope;
  role: "user" | "assistant";
  content: string;
  citedPaperIds: string[];
  requester?: {
    id: string;
    fullName?: string;
    email?: string;
    avatarUrl?: string;
  };
  creditCost?: number;
  isPinned?: boolean;
  pinnedAt?: string;
  pinnedBy?: {
    id: string;
    fullName?: string;
    email?: string;
    avatarUrl?: string;
  };
  createdAt: string;
}

export function buildChatHistoryFilter(
  projectId: string,
  userId: string,
  scope: ProjectChatScope,
): FilterQuery<ProjectChatMessageDoc> {
  const filter: FilterQuery<ProjectChatMessageDoc> = {
    projectId: new mongoose.Types.ObjectId(projectId),
  };
  if (scope === "private") {
    filter.userId = new mongoose.Types.ObjectId(userId);
    filter.$or = [{ scope: "private" }, { scope: { $exists: false } }];
  } else {
    filter.scope = scope;
  }
  return filter;
}

export class ProjectChatService {
  async sendMessage(
    projectId: string,
    userId: string,
    message: string,
    scope: ProjectChatScope = "private",
  ): Promise<SendProjectChatMessageResult> {
    const papers = await this.loadProjectEvidence(projectId, userId);
    assertProjectHasPapers(papers.map((paper) => paper.id), "project chat");

    // Charge 1 credit for sending a message
    const tx = await creditService.chargeCreditsChecked({
      userId,
      action: "project_chat_message",
      amount: 1,
      targetKind: "project_chat",
      targetId: projectId,
      idempotencyKey: `chat:${projectId}:${userId}:${Date.now()}`,
    });
    const txId = tx?._id;

    const selectedEvidence = await this.selectEvidence(message, papers);
    const selectedHistory = await this.loadRecentHistory(projectId, userId, scope);
    const fitted = fitToBudget({
      papers: selectedEvidence,
      history: selectedHistory,
      maxChars: env.CHAT_MAX_PROMPT_CHARS,
      abstractMaxChars: env.CHAT_ABSTRACT_MAX_CHARS,
      render: (evidence, history) =>
        [
          buildChatPrompt({
            question: message,
            evidence,
            history,
            abstractMaxChars: env.CHAT_ABSTRACT_MAX_CHARS,
          }).system,
          buildChatPrompt({
            question: message,
            evidence,
            history,
            abstractMaxChars: env.CHAT_ABSTRACT_MAX_CHARS,
          }).prompt,
        ].join("\n").slice(0),
    });
    const evidence = [...fitted.papers].sort((a, b) => a.id.localeCompare(b.id));
    const history = fitted.history;
    const { system, prompt } = buildChatPrompt({
      question: message,
      evidence,
      history,
      abstractMaxChars: env.CHAT_ABSTRACT_MAX_CHARS,
    });
    const provider = getLlmProvider();
    const model = provider.name === "ollama" ? env.OLLAMA_MODEL : env.GEMINI_MODEL_FAST;
    let result: SendProjectChatMessageResult;
    try {
      result = await cachedGenerate<SendProjectChatMessageResult>({
        task: "chat",
        promptVersion: PROJECT_CHAT_PROMPT_VERSION,
        keyParts: {
          projectId,
          scope,
          question: normalizeQuestion(message),
          paperIds: evidence.map((paper) => paper.id).sort(),
          provider: provider.name,
        },
        inputHash: hashKey({ system, prompt }),
        model,
        ttlSeconds: env.CHAT_CACHE_TTL_SECONDS,
        generate: async () => {
          const answer = (
            await provider.generate(prompt, {
              system,
              temperature: 0.25,
              maxOutputTokens: 1024,
            })
          )
            .trim()
            .slice(0, 4000);
          return { scope, answer, citedPaperIds: parseCitations(answer, evidence), creditCost: 1 };
        },
      });
    } catch (err) {
      if (txId) {
        await creditService.refundCreditsOnce({
          transactionId: txId.toString(),
          reason: "Project chat message LLM call failed",
        });
      }
      logger.warn({ err, projectId, userId, provider: provider.name }, "project chat LLM failed");
      throw AppError.serviceUnavailable("LLM provider unreachable");
    }
    result = { ...result, scope, creditCost: result.creditCost ?? 1 };
    const saved = await this.saveTurn(
      projectId,
      userId,
      message,
      scope,
      result.answer,
      result.citedPaperIds,
      txId,
      result.creditCost,
    );
    if (scope === "team") {
      for (const message of saved) {
        projectChatEventHub.publish({
          type: "message.created",
          projectId,
          scope,
          message,
          occurredAt: new Date().toISOString(),
        });
      }
      await auditService.log("project.ai_chat.team_message_sent", {
        userId,
        targetTableName: "research_projects",
        targetRecordId: projectId,
        details: {
          citedPaperIds: result.citedPaperIds,
          creditCost: result.creditCost,
        },
      });
    }
    return result;
  }

  private async saveTurn(
    projectId: string,
    userId: string,
    message: string,
    scope: ProjectChatScope,
    answer: string,
    citedPaperIds: string[],
    creditTransactionId?: mongoose.Types.ObjectId,
    creditCost = 1,
  ): Promise<ProjectChatHistoryMessage[]> {
    const docs = await ProjectChatMessageModel.insertMany([
      {
        projectId: new mongoose.Types.ObjectId(projectId),
        userId: new mongoose.Types.ObjectId(userId),
        scope,
        role: "user",
        content: message,
        citedPaperIds: [],
      },
      {
        projectId: new mongoose.Types.ObjectId(projectId),
        userId: new mongoose.Types.ObjectId(userId),
        scope,
        role: "assistant",
        content: answer,
        citedPaperIds: citedPaperIds.map((id) => new mongoose.Types.ObjectId(id)),
        creditTransactionId,
        creditCost,
      },
    ]);
    const requesters = await this.loadUserSummaries([userId]);
    return docs.map((doc) => this.toHistoryMessage(doc, requesters, requesters));
  }

  async listHistory(
    projectId: string,
    userId: string,
    limit: number,
    scope: ProjectChatScope = "private",
  ): Promise<ProjectChatHistoryMessage[]> {
    await this.assertCanAccess(projectId, userId);
    const docs = await ProjectChatMessageModel.find(buildChatHistoryFilter(projectId, userId, scope))
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    const requesters = await this.loadUserSummaries(docs.map((doc) => String(doc.userId)));
    const pinnedBy = await this.loadUserSummaries(docs.map((doc) => String(doc.pinnedBy ?? "")));

    return docs.reverse().map((doc) => this.toHistoryMessage(doc, requesters, pinnedBy));
  }

  async setPinned(
    projectId: string,
    messageId: string,
    userId: string,
    pinned: boolean,
  ): Promise<ProjectChatHistoryMessage> {
    await this.assertCanAccess(projectId, userId);
    const doc = await ProjectChatMessageModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(messageId),
        projectId: new mongoose.Types.ObjectId(projectId),
        scope: "team",
        role: "assistant",
      },
      {
        isPinned: pinned,
        pinnedAt: pinned ? new Date() : undefined,
        pinnedBy: pinned ? new mongoose.Types.ObjectId(userId) : undefined,
      },
      { new: true },
    ).lean();

    if (!doc) throw AppError.notFound("Team AI assistant message not found");

    const users = await this.loadUserSummaries([String(doc.userId), userId]);
    const message = this.toHistoryMessage(doc, users, users);
    projectChatEventHub.publish({
      type: "message.updated",
      projectId,
      scope: "team",
      message,
      occurredAt: new Date().toISOString(),
    });
    await auditService.log("project.ai_chat.message_pin_updated", {
      userId,
      targetTableName: "project_chat_messages",
      targetRecordId: messageId,
      details: { projectId, pinned },
    });
    return message;
  }

  private async selectEvidence(question: string, papers: ChatEvidencePaper[]): Promise<ChatEvidencePaper[]> {
    if (papers.length <= env.CHAT_CONTEXT_PAPERS) return pickEvidence(papers, env.CHAT_CONTEXT_PAPERS);
    const questionVector = await getEmbeddingProvider().embed(normalizeQuestion(question));
    return pickEvidence(papers, env.CHAT_CONTEXT_PAPERS, questionVector);
  }

  private async loadRecentHistory(
    projectId: string,
    userId: string,
    scope: ProjectChatScope,
  ): Promise<ChatHistoryTurn[]> {
    const limit = env.CHAT_HISTORY_TURNS * 2;
    if (limit === 0) return [];
    const docs = await ProjectChatMessageModel.find(buildChatHistoryFilter(projectId, userId, scope))
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return docs.reverse().map((doc) => ({
      role: doc.role as "user" | "assistant",
      content: doc.content,
    }));
  }

  private async loadProjectEvidence(projectId: string, userId: string): Promise<ChatEvidencePaper[]> {
    const project = await this.assertCanAccess(projectId, userId);
    const paperIds = (project.papers ?? []).map((paper) => String(paper.targetId));
    if (paperIds.length === 0) return [];

    const docs = await PaperModel.find({ _id: { $in: paperIds.map((id) => new mongoose.Types.ObjectId(id)) } })
      .select("title abstractText publicationYear authors +embedding")
      .lean();

    const byId = new Map(docs.map((doc) => [String(doc._id), doc]));
    return paperIds
      .map((id) => byId.get(id))
      .filter((doc): doc is NonNullable<typeof doc> => Boolean(doc))
      .map((doc) => ({
        id: String(doc._id),
        title: doc.title,
        abstractText: doc.abstractText || undefined,
        publicationYear: doc.publicationYear,
        authorNames: (doc.authors ?? []).map((a) => a.displayName).filter(Boolean),
        embedding: Array.isArray(doc.embedding) ? doc.embedding : undefined,
      }));
  }

  private async assertCanAccess(projectId: string, userId: string) {
    const project = await ProjectModel.findById(projectId).select("ownerId members papers").lean();
    if (!project) throw AppError.notFound("Project not found");

    const hasAccess =
      String(project.ownerId) === userId ||
      (project.members ?? []).some((member) => String(member.targetId) === userId);
    if (!hasAccess) throw AppError.forbidden("Access denied to this project");

    return project;
  }

  async assertCanOpenEvents(projectId: string, userId: string): Promise<void> {
    await this.assertCanAccess(projectId, userId);
  }

  private toHistoryMessage(
    doc: ProjectChatMessageDoc | (ProjectChatMessageDoc & { createdAt: Date }),
    requesters: Map<string, ProjectChatHistoryMessage["requester"]>,
    pinnedBy: Map<string, ProjectChatHistoryMessage["requester"]>,
  ): ProjectChatHistoryMessage {
    const pinnedById = String(doc.pinnedBy ?? "");
    return {
      id: String(doc._id),
      projectId: String(doc.projectId),
      userId: String(doc.userId),
      scope: (doc.scope ?? "private") as ProjectChatScope,
      role: doc.role as "user" | "assistant",
      content: doc.content,
      citedPaperIds: (doc.citedPaperIds ?? []).map((id) => String(id)),
      requester: requesters.get(String(doc.userId)),
      creditCost: doc.creditCost ?? undefined,
      isPinned: Boolean(doc.isPinned),
      pinnedAt: doc.pinnedAt?.toISOString(),
      pinnedBy: pinnedBy.get(pinnedById),
      createdAt: doc.createdAt.toISOString(),
    };
  }

  private async loadUserSummaries(userIds: string[]) {
    const uniqueIds = [...new Set(userIds)].filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (uniqueIds.length === 0) return new Map<string, ProjectChatHistoryMessage["requester"]>();

    const users = await UserModel.find({ _id: { $in: uniqueIds.map((id) => new mongoose.Types.ObjectId(id)) } })
      .select("fullName email avatarUrl")
      .lean();

    return new Map(
      users.map((user) => [
        String(user._id),
        {
          id: String(user._id),
          fullName: user.fullName,
          email: user.email,
          avatarUrl: user.avatarUrl ?? undefined,
        },
      ]),
    );
  }
}

export const projectChatService = new ProjectChatService();
