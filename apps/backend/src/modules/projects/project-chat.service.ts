import { aiModel, withProjectAi } from "../user-ai/user-ai.runtime.js";
import type {
  ProjectAiDataPolicy,
  ProjectChatCitation,
  ProjectChatCitationSourceKind,
  ProjectChatRetrievalMeta,
  ProjectChatScope,
  ProjectChatSourcesOverview,
  ProjectExternalLookupPolicy,
  ProjectScreeningStatus,
} from "@trend/shared-types";
import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";
import { hashKey } from "../../infrastructure/cache.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { logger } from "../../infrastructure/logger.js";
import { auditService } from "../audit/audit.service.js";
import { creditService } from "../credits/credit.service.js";
import { getEmbeddingProvider } from "../embeddings/embedding.factory.js";
import { attachKnowledgeEvidence } from "../knowledge/knowledge.retrieval.js";
import { getLlmProvider } from "../llm/llm.factory.js";
import { cachedGenerate } from "../llm/llm.run.js";
import { projectChatEventHub } from "./project-chat.events.js";
import {
  buildChatPrompt,
  buildMethodologyPrompt,
  classifyChatIntent,
  parseCitationEntries,
  pickEvidenceWithMetadata,
  type ChatEvidencePaper,
  type ChatHistoryTurn,
  type ParsedCitationEntry,
} from "./project-chat.prompt.js";
import { fitToBudget, normalizeQuestion, PROJECT_CHAT_PROMPT_VERSION } from "./project-chat.tokens.js";
import { assertProjectHasPapers } from "./project-scope.js";
import { authorizeProjectTransaction, lockProjectAccounts } from "./project-transaction.js";

export interface SendProjectChatMessageResult {
  scope: ProjectChatScope;
  answer: string;
  citedPaperIds: string[];
  citations: ProjectChatCitation[];
  retrievalMeta: ProjectChatRetrievalMeta;
  creditCost: number;
  userMessage?: ProjectChatHistoryMessage;
  assistantMessage?: ProjectChatHistoryMessage;
}

type UserSummary = { id: string; fullName?: string; email?: string; avatarUrl?: string };

export interface ProjectChatHistoryMessage {
  id: string;
  projectId: string;
  userId: string;
  scope: ProjectChatScope;
  role: "user" | "assistant";
  content: string;
  citedPaperIds: string[];
  citations?: ProjectChatCitation[];
  retrievalMeta?: ProjectChatRetrievalMeta | null;
  clientKey?: string;
  requester?: UserSummary;
  creditCost?: number;
  isPinned?: boolean;
  pinnedAt?: string;
  pinnedBy?: UserSummary;
  createdAt: string;
}

type ChatRow = {
  id: string;
  legacyMongoId: string | null;
  projectId: string;
  userId: string;
  scope: string;
  role: string;
  content: string;
  clientKey?: string | null;
  retrievalMeta?: unknown;
  creditCost: number | null;
  isPinned: boolean;
  pinnedAt: Date | null;
  pinnedById: string | null;
  createdAt: Date;
};

type SavedCitationInput = {
  paperId: string;
  internalPaperId?: string;
  position: number;
  citationNumber: number;
  sourceKind: ProjectChatCitationSourceKind;
  excerpt?: string | null;
  pageNumber?: number | null;
  chunkId?: string | null;
};

function idWhere(value: string): { id?: string; legacyMongoId?: string } {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.badRequest("Invalid database identifier");
  return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value };
}

function parseVectorText(raw?: string | null): number[] | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return undefined;
  const parts = trimmed.slice(1, -1).split(",");
  if (parts.length === 0) return undefined;
  const out = new Array<number>(parts.length);
  for (let i = 0; i < parts.length; i++) {
    const num = Number(parts[i]);
    if (!Number.isFinite(num)) return undefined;
    out[i] = num;
  }
  return out;
}

function parseRetrievalMeta(raw: unknown): ProjectChatRetrievalMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const meta = raw as Partial<ProjectChatRetrievalMeta>;
  if (typeof meta.intent !== "string" || typeof meta.admittedCount !== "number") return null;
  return meta as ProjectChatRetrievalMeta;
}

function normalizeSourceKind(raw?: string | null): ProjectChatCitationSourceKind {
  if (raw === "FULLTEXT" || raw === "ABSTRACT" || raw === "METADATA") return raw;
  return "ABSTRACT";
}

function buildCapabilityAnswer(question: string, overview: ProjectChatSourcesOverview): string {
  const isEnglish = /^[a-z0-9\s?!.,'"-]+$/i.test(question.trim()) && !/\b(chào|bạn|tài liệu|nghiên cứu|của|không)\b/i.test(question);
  if (isEnglish) {
    const lines = [
      "I am **LumiGap AI**, a research assistant powered by a language model that answers questions using your conversation and the authorized papers retrieved from this project's library.",
      "",
      "### Current project source coverage",
      `- **Total papers in library:** ${overview.totalLibraryCount}`,
      `- **Eligible for AI retrieval (non-excluded):** ${overview.eligibleCount} (${overview.includedCount} included, ${overview.pendingCount} pending/maybe, ${overview.excludedCount} excluded)`,
      `- **Content available:** ${overview.coverage.fullTextIndexed} indexed full-text, ${overview.coverage.abstractAvailable} abstract, ${overview.coverage.metadataOnly} metadata only`,
      "",
      "### Capabilities & limitations",
      "- I retrieve relevant authorized project sources within the prompt context budget rather than reading the entire library at once.",
      "- Full-text analysis applies only to papers that actually have indexed full-text passages; other papers rely on abstracts or bibliographic metadata.",
      "- I do not browse the open web, read unshared private uploads, or access other members' private AI conversations.",
      "- My synthesis and suggested research directions are AI-assisted interpretations and should be verified against original papers.",
    ];
    return lines.join("\n");
  }

  return [
    "Tôi là **LumiGap AI**, trợ lý nghiên cứu sử dụng mô hình ngôn ngữ để tạo câu trả lời từ câu hỏi của bạn và các tài liệu nghiên cứu hợp lệ được truy xuất từ thư viện dự án này.",
    "",
    "### Phạm vi nguồn hiện có trong dự án",
    `- **Tổng tài liệu trong thư viện:** ${overview.totalLibraryCount}`,
    `- **Tài liệu đủ điều kiện truy xuất (không bị loại trừ):** ${overview.eligibleCount} (${overview.includedCount} đã chọn, ${overview.pendingCount} chờ sàng lọc/cân nhắc, ${overview.excludedCount} đã loại trừ)`,
    `- **Mức độ nội dung hiện có:** ${overview.coverage.fullTextIndexed} bài đã lập chỉ mục toàn văn, ${overview.coverage.abstractAvailable} bài có tóm tắt (abstract), ${overview.coverage.metadataOnly} bài chỉ có thông tin thư mục`,
    "",
    "### Khả năng và giới hạn",
    "- Với mỗi câu hỏi, hệ thống truy xuất các tài liệu liên quan nhất trong giới hạn ngữ cảnh của mô hình chứ không đọc toàn bộ thư viện cùng lúc.",
    "- Phân tích toàn văn chỉ áp dụng với các bài thực sự có đoạn trích toàn văn đã được lập chỉ mục; các bài còn lại dựa trên bản tóm tắt hoặc siêu dữ liệu.",
    "- Tôi không tự duyệt web bên ngoài, không tự đọc tệp chưa được lập chỉ mục và không truy cập các cuộc trò chuyện riêng tư của thành viên khác.",
    "- Các tổng hợp và hướng nghiên cứu gợi ý cần được đối chiếu lại với tài liệu gốc trước khi đưa vào kết luận khoa học.",
  ].join("\n");
}

function buildProjectContextAnswer(
  question: string,
  overview: ProjectChatSourcesOverview,
  papers: Array<{ title: string; publicationYear?: number | null; screeningStatus: string }>,
): string {
  const isEnglish = /^[a-z0-9\s?!.,'"-]+$/i.test(question.trim()) && !/\b(nhóm|dự án|tài liệu|bài báo|chọn)\b/i.test(question);
  const statusLabelVi: Record<string, string> = {
    INCLUDED: "Đã chọn",
    MAYBE: "Cân nhắc",
    UNDECIDED: "Chưa sàng lọc",
    EXCLUDED: "Đã loại trừ",
  };
  if (papers.length === 0) {
    return isEnglish
      ? "This project library currently has **0 research papers**. Add papers in **Literature** so LumiGap AI can retrieve and synthesize evidence."
      : "Thư viện dự án hiện chưa có tài liệu nghiên cứu nào (**0 bài báo**). Bạn có thể thêm bài báo tại mục **Tài liệu nghiên cứu** để AI hỗ trợ phân tích.";
  }

  const shown = papers.slice(0, 20);
  const remaining = papers.length - shown.length;
  if (isEnglish) {
    const items = shown.map((p, idx) => `${idx + 1}. **${p.title}**${p.publicationYear ? ` (${p.publicationYear})` : ""} — \`${p.screeningStatus}\``);
    return [
      `This project currently contains **${overview.totalLibraryCount}** papers (**${overview.includedCount}** included, **${overview.pendingCount}** pending/maybe, **${overview.excludedCount}** excluded; **${overview.eligibleCount}** eligible for AI retrieval).`,
      "",
      ...items,
      ...(remaining > 0 ? ["", `_Showing first ${shown.length} of ${papers.length} papers. Open **Literature** to inspect the complete library._`] : []),
    ].join("\n");
  }

  const items = shown.map(
    (p, idx) => `${idx + 1}. **${p.title}**${p.publicationYear ? ` (${p.publicationYear})` : ""} — ${statusLabelVi[p.screeningStatus] ?? p.screeningStatus}`,
  );
  return [
    `Dự án hiện có **${overview.totalLibraryCount}** tài liệu trong thư viện (**${overview.includedCount}** đã chọn, **${overview.pendingCount}** chờ sàng lọc/cân nhắc, **${overview.excludedCount}** đã loại trừ; **${overview.eligibleCount}** tài liệu đủ điều kiện truy xuất cho AI).`,
    "",
    ...items,
    ...(remaining > 0 ? ["", `_Đang hiển thị ${shown.length}/${papers.length} tài liệu đầu tiên. Mở mục **Tài liệu nghiên cứu** để xem toàn bộ danh sách._`] : []),
  ].join("\n");
}

/** Centralizes the private/team message visibility boundary. */
export function buildChatHistoryFilter(projectId: string, userId: string, scope: ProjectChatScope): Prisma.ProjectChatMessageWhereInput {
  return scope === "private" ? { projectId, userId, scope: "private" } : { projectId, scope };
}

export class ProjectChatService {
  async getSourcesOverview(projectIdInput: string, userIdInput: string): Promise<ProjectChatSourcesOverview> {
    const access = await this.assertCanAccess(projectIdInput, userIdInput);
    return this.computeSourcesOverview(access.project.id, access.project);
  }

  private async computeSourcesOverview(
    projectId: string,
    projectMeta: { aiDataPolicy?: string | null; externalLookupPolicy?: string | null },
  ): Promise<ProjectChatSourcesOverview> {
    const prisma = getPrisma();
    const links = await prisma.projectPaper.findMany({
      where: { projectId },
      select: { paperId: true, screeningStatus: true },
    });
    const totalLibraryCount = links.length;
    const excludedCount = links.filter((l) => l.screeningStatus === "EXCLUDED").length;
    const includedCount = links.filter((l) => l.screeningStatus === "INCLUDED").length;
    const pendingCount = links.filter((l) => l.screeningStatus !== "EXCLUDED" && l.screeningStatus !== "INCLUDED").length;
    const eligiblePaperIds = links.filter((l) => l.screeningStatus !== "EXCLUDED").map((l) => l.paperId);

    let fullTextIndexed = 0;
    let abstractAvailable = 0;
    let metadataOnly = 0;
    let withEmbeddings = 0;
    let eligibleCount = 0;

    if (eligiblePaperIds.length > 0) {
      const papers = await prisma.paper.findMany({
        where: { id: { in: eligiblePaperIds }, dataStatus: "active" },
        select: { id: true, abstractText: true },
      });
      eligibleCount = papers.length;
      const activeIds = papers.map((p) => p.id);

      let readyDocs: Array<{ paperId: string; sourceKind: string }> = [];
      if (activeIds.length > 0 && typeof prisma.paperDocument?.findMany === "function") {
        readyDocs = await prisma.paperDocument.findMany({
          where: { paperId: { in: activeIds }, status: "ready" },
          select: { paperId: true, sourceKind: true },
        });
      }
      const fullTextPaperIds = new Set(readyDocs.filter((d) => d.sourceKind !== "abstract").map((d) => d.paperId));

      for (const paper of papers) {
        if (fullTextPaperIds.has(paper.id)) fullTextIndexed++;
        else if (paper.abstractText && paper.abstractText.trim().length > 0) abstractAvailable++;
        else metadataOnly++;
      }

      if (activeIds.length > 0 && typeof prisma.$queryRaw === "function") {
        try {
          const embRows = await prisma.$queryRaw<Array<{ cnt: number }>>(Prisma.sql`
            SELECT COUNT(*)::int AS cnt FROM papers
            WHERE id = ANY(${activeIds}::uuid[]) AND embedding IS NOT NULL AND data_status = 'active'
          `);
          withEmbeddings = Number(embRows[0]?.cnt ?? 0);
        } catch {
          withEmbeddings = 0;
        }
      }
    }

    return {
      totalLibraryCount,
      eligibleCount,
      includedCount,
      excludedCount,
      pendingCount,
      coverage: {
        fullTextIndexed,
        abstractAvailable,
        metadataOnly,
        withEmbeddings,
      },
      aiDataPolicy: (projectMeta.aiDataPolicy ?? "ALLOW_PERSONAL_AI") as ProjectAiDataPolicy,
      externalLookupPolicy: (projectMeta.externalLookupPolicy ?? "ALLOW_PUBLIC_INDEX") as ProjectExternalLookupPolicy,
    };
  }

  async sendMessage(
    projectIdInput: string,
    userIdInput: string,
    message: string,
    scope: ProjectChatScope = "private",
    clientKey?: string,
  ): Promise<SendProjectChatMessageResult> {
    const access = await this.assertCanAccess(projectIdInput, userIdInput);
    if (access.project.status === "ARCHIVED") throw AppError.conflict("Archived projects are read-only");
    const projectId = access.project.id;
    const userId = access.user.id;

    // Enforce authoritative AI security policy BEFORE any retrieval, deterministic reply, or credit debit.
    const projPolicy = await getPrisma().project.findUnique({
      where: { id: projectId },
      select: { aiDataPolicy: true, externalLookupPolicy: true },
    });
    if (projPolicy?.aiDataPolicy === "DISABLED") {
      throw AppError.forbidden("External AI processing is disabled by this project's security policy");
    }

    // Idempotent replay: prevent double charges and duplicate messages on retries/double-clicks.
    if (clientKey) {
      const existingAssistant = await getPrisma().projectChatMessage.findFirst({
        where: { projectId, userId, scope, role: "assistant", clientKey },
      });
      if (existingAssistant) {
        const existingUser = await getPrisma().projectChatMessage.findFirst({
          where: { projectId, userId, scope, role: "user", clientKey },
        });
        const rowsToHydrate = existingUser ? [existingUser, existingAssistant] : [existingAssistant];
        const users = await this.loadUserSummaries([userId]);
        const hydrated = await this.hydrateMessages(projectId, rowsToHydrate, users, users);
        const assistantMsg = hydrated.find((m) => m.role === "assistant")!;
        const userMsg = hydrated.find((m) => m.role === "user");
        return {
          scope,
          answer: assistantMsg.content,
          citedPaperIds: assistantMsg.citedPaperIds,
          citations: assistantMsg.citations ?? [],
          retrievalMeta: assistantMsg.retrievalMeta ?? {
            intent: "grounded",
            retrievalMode: "none",
            totalLibraryCount: 0,
            eligibleCount: 0,
            retrievedCount: 0,
            admittedCount: 0,
            coverage: { fullText: 0, abstract: 0, metadataOnly: 0 },
            truncatedAbstracts: 0,
            droppedPapers: 0,
            hasReliableCitations: Boolean(assistantMsg.citations?.every((c) => c.citationNumber !== null)),
          },
          creditCost: assistantMsg.creditCost ?? 0,
          userMessage: userMsg,
          assistantMessage: assistantMsg,
        };
      }
    }

    const intent = classifyChatIntent(message);
    const sourcesOverview = await this.computeSourcesOverview(projectId, projPolicy ?? access.project);

    // 1. Deterministic capability/greeting response (0 credit, never cites unrelated papers, works with 0 papers).
    if (intent === "capability") {
      const answer = buildCapabilityAnswer(message, sourcesOverview);
      const retrievalMeta: ProjectChatRetrievalMeta = {
        intent: "capability",
        retrievalMode: "none",
        totalLibraryCount: sourcesOverview.totalLibraryCount,
        eligibleCount: sourcesOverview.eligibleCount,
        retrievedCount: 0,
        admittedCount: 0,
        coverage: { fullText: 0, abstract: 0, metadataOnly: 0 },
        truncatedAbstracts: 0,
        droppedPapers: 0,
        hasReliableCitations: true,
      };
      const saved = await this.saveTurn(projectId, userId, message, scope, answer, [], undefined, 0, clientKey, retrievalMeta);
      const userMessage = saved.find((m) => m.role === "user");
      const assistantMessage = saved.find((m) => m.role === "assistant");
      if (scope === "team") {
        for (const savedMessage of saved) {
          projectChatEventHub.publish({ type: "message.created", projectId: projectIdInput, scope, message: savedMessage, occurredAt: new Date().toISOString() });
        }
      }
      return {
        scope,
        answer,
        citedPaperIds: [],
        citations: [],
        retrievalMeta,
        creditCost: 0,
        userMessage,
        assistantMessage,
      };
    }

    // 2. Deterministic project library inventory response (0 credit, uses real DB state, never hallucinates).
    if (intent === "project_context") {
      const links = await getPrisma().projectPaper.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
        select: { paperId: true, screeningStatus: true },
      });
      const paperRows = links.length
        ? await getPrisma().paper.findMany({
            where: { id: { in: links.map((l) => l.paperId) }, dataStatus: "active" },
            select: { id: true, title: true, publicationYear: true },
          })
        : [];
      const paperMap = new Map(paperRows.map((p) => [p.id, p]));
      const inventory = links.flatMap((l) => {
        const p = paperMap.get(l.paperId);
        return p ? [{ title: p.title, publicationYear: p.publicationYear, screeningStatus: l.screeningStatus }] : [];
      });
      const answer = buildProjectContextAnswer(message, sourcesOverview, inventory);
      const retrievalMeta: ProjectChatRetrievalMeta = {
        intent: "project_context",
        retrievalMode: "direct",
        totalLibraryCount: sourcesOverview.totalLibraryCount,
        eligibleCount: sourcesOverview.eligibleCount,
        retrievedCount: inventory.length,
        admittedCount: Math.min(inventory.length, 20),
        coverage: { fullText: 0, abstract: 0, metadataOnly: Math.min(inventory.length, 20) },
        truncatedAbstracts: 0,
        droppedPapers: Math.max(0, inventory.length - 20),
        hasReliableCitations: true,
      };
      const saved = await this.saveTurn(projectId, userId, message, scope, answer, [], undefined, 0, clientKey, retrievalMeta);
      const userMessage = saved.find((m) => m.role === "user");
      const assistantMessage = saved.find((m) => m.role === "assistant");
      if (scope === "team") {
        for (const savedMessage of saved) {
          projectChatEventHub.publish({ type: "message.created", projectId: projectIdInput, scope, message: savedMessage, occurredAt: new Date().toISOString() });
        }
      }
      return {
        scope,
        answer,
        citedPaperIds: [],
        citations: [],
        retrievalMeta,
        creditCost: 0,
        userMessage,
        assistantMessage,
      };
    }

    const selectedHistory = await this.loadRecentHistory(projectId, userId, scope);

    // 3. General research methodology guidance (allowed even with 0 papers, clearly labeled, respects AI policy & credits).
    if (intent === "methodology") {
      const { system, prompt } = buildMethodologyPrompt(message, selectedHistory);
      const provider = getLlmProvider();
      const idempotencyKey = clientKey
        ? `chat:${projectId}:${userId}:${scope}:${clientKey}`
        : `chat:${projectId}:${userId}:${crypto.randomUUID()}`;
      const tx = await creditService.chargeCreditsChecked({
        userId,
        action: "project_chat_message",
        amount: 1,
        targetKind: "project_chat",
        targetId: projectId,
        idempotencyKey,
      });
      const txId = tx?.id;
      let answer: string;
      try {
        answer = await withProjectAi(projectId, userId, async () => {
          const activeProvider = getLlmProvider();
          const activeModel = activeProvider.name === "ollama" ? env.OLLAMA_MODEL : aiModel();
          const generated = await cachedGenerate<{ answer: string }>({
            task: "chat",
            promptVersion: `${PROJECT_CHAT_PROMPT_VERSION}:methodology`,
            keyParts: { projectId, scope, intent: "methodology", question: normalizeQuestion(message), provider: activeProvider.name },
            inputHash: hashKey({ system, prompt }),
            model: activeModel,
            ttlSeconds: env.CHAT_CACHE_TTL_SECONDS,
            generate: async () => ({
              answer: (await activeProvider.generate(prompt, { system, temperature: 0.25, maxOutputTokens: 1024 })).trim().slice(0, 4000),
            }),
          });
          return generated.answer;
        });
      } catch (error) {
        if (txId) await creditService.refundCreditsOnce({ transactionId: txId, reason: "Project chat methodology LLM call failed" });
        logger.warn({ err: error, projectId, userId, provider: provider.name }, "project chat methodology LLM failed");
        throw AppError.serviceUnavailable("LLM provider unreachable");
      }

      const retrievalMeta: ProjectChatRetrievalMeta = {
        intent: "methodology",
        retrievalMode: "none",
        totalLibraryCount: sourcesOverview.totalLibraryCount,
        eligibleCount: sourcesOverview.eligibleCount,
        retrievedCount: 0,
        admittedCount: 0,
        coverage: { fullText: 0, abstract: 0, metadataOnly: 0 },
        truncatedAbstracts: 0,
        droppedPapers: 0,
        hasReliableCitations: true,
      };
      let saved: ProjectChatHistoryMessage[];
      try {
        saved = await this.saveTurn(projectId, userId, message, scope, answer, [], txId, 1, clientKey, retrievalMeta);
      } catch (error) {
        if (txId) await creditService.refundCreditsOnce({ transactionId: txId, reason: "Project chat message could not be saved" });
        throw error;
      }
      const userMessage = saved.find((m) => m.role === "user");
      const assistantMessage = saved.find((m) => m.role === "assistant");
      if (scope === "team") {
        for (const savedMessage of saved) {
          projectChatEventHub.publish({ type: "message.created", projectId: projectIdInput, scope, message: savedMessage, occurredAt: new Date().toISOString() });
        }
      }
      return {
        scope,
        answer,
        citedPaperIds: [],
        citations: [],
        retrievalMeta,
        creditCost: 1,
        userMessage,
        assistantMessage,
      };
    }

    // 4. Document-grounded research chat (default).
    const papers = await this.loadProjectEvidence(projectId);
    assertProjectHasPapers(papers.map((paper) => paper.id), "project chat");

    const { selectedEvidence, retrievalMode, questionVector } = await this.selectEvidence(message, papers);
    const enrichedEvidence = await this.attachKnowledgePassages(selectedEvidence, message, questionVector);

    const fitted = fitToBudget({
      papers: enrichedEvidence,
      history: selectedHistory,
      maxChars: env.CHAT_MAX_PROMPT_CHARS,
      abstractMaxChars: env.CHAT_ABSTRACT_MAX_CHARS,
      render: (evidence, history) => {
        const built = buildChatPrompt({ question: message, evidence, history, abstractMaxChars: env.CHAT_ABSTRACT_MAX_CHARS });
        return `${built.system}\n${built.prompt}`;
      },
    });

    // Preserve relevance ordering so [1] is the top-ranked paper and citation numbers stay faithful.
    const evidence = fitted.papers;
    const { system, prompt } = buildChatPrompt({
      question: message,
      evidence,
      history: fitted.history,
      abstractMaxChars: env.CHAT_ABSTRACT_MAX_CHARS,
    });

    const coverage = {
      fullText: evidence.filter((p) => p.sourceKind === "FULLTEXT").length,
      abstract: evidence.filter((p) => p.sourceKind === "ABSTRACT" || (!p.sourceKind && Boolean(p.abstractText))).length,
      metadataOnly: evidence.filter((p) => p.sourceKind === "METADATA" || (!p.sourceKind && !p.abstractText)).length,
    };

    const retrievalMeta: ProjectChatRetrievalMeta = {
      intent: "grounded",
      retrievalMode,
      totalLibraryCount: sourcesOverview.totalLibraryCount,
      eligibleCount: papers.length,
      retrievedCount: selectedEvidence.length,
      admittedCount: evidence.length,
      coverage,
      truncatedAbstracts: fitted.truncatedAbstracts,
      droppedPapers: fitted.droppedPapers,
      hasReliableCitations: true,
    };

    const provider = getLlmProvider();
    const idempotencyKey = clientKey
      ? `chat:${projectId}:${userId}:${scope}:${clientKey}`
      : `chat:${projectId}:${userId}:${crypto.randomUUID()}`;
    const tx = await creditService.chargeCreditsChecked({
      userId,
      action: "project_chat_message",
      amount: 1,
      targetKind: "project_chat",
      targetId: projectId,
      idempotencyKey,
    });
    const txId = tx?.id;

    let generated: { answer: string; citationEntries: ParsedCitationEntry[]; creditCost: number };
    try {
      generated = await withProjectAi(projectId, userId, async () => {
        const activeProvider = getLlmProvider();
        const activeModel = activeProvider.name === "ollama" ? env.OLLAMA_MODEL : aiModel();
        const cached = await cachedGenerate<{ answer: string; creditCost: number }>({
          task: "chat",
          promptVersion: PROJECT_CHAT_PROMPT_VERSION,
          keyParts: {
            projectId,
            scope,
            question: normalizeQuestion(message),
            paperIds: evidence.map((paper) => paper.id),
            provider: activeProvider.name,
          },
          inputHash: hashKey({ system, prompt }),
          model: activeModel,
          ttlSeconds: env.CHAT_CACHE_TTL_SECONDS,
          generate: async () => {
            const answer = (await activeProvider.generate(prompt, { system, temperature: 0.25, maxOutputTokens: 1024 })).trim().slice(0, 4000);
            // Validate citation range immediately before caching!
            parseCitationEntries(answer, evidence);
            return { answer, creditCost: 1 };
          },
        });
        const citationEntries = parseCitationEntries(cached.answer, evidence);
        return { answer: cached.answer, citationEntries, creditCost: cached.creditCost ?? 1 };
      });
    } catch (error) {
      if (txId) await creditService.refundCreditsOnce({ transactionId: txId, reason: "Project chat message LLM call failed" });
      logger.warn({ err: error, projectId, userId, provider: provider.name }, "project chat LLM failed");
      throw AppError.serviceUnavailable("LLM provider unreachable");
    }

    const savedCitations: SavedCitationInput[] = generated.citationEntries.map((entry, position) => ({
      paperId: entry.paper.id,
      internalPaperId: entry.paper.internalId,
      position,
      citationNumber: entry.citationNumber,
      sourceKind: entry.paper.sourceKind ?? (entry.paper.abstractText ? "ABSTRACT" : "METADATA"),
      excerpt: entry.paper.excerpt ?? (entry.paper.abstractText ? entry.paper.abstractText.slice(0, 420) : null),
      pageNumber: entry.paper.pageNumber ?? null,
      chunkId: entry.paper.chunkId ?? null,
    }));

    let saved: ProjectChatHistoryMessage[];
    try {
      saved = await this.saveTurn(
        projectId,
        userId,
        message,
        scope,
        generated.answer,
        savedCitations,
        txId,
        generated.creditCost,
        clientKey,
        retrievalMeta,
      );
    } catch (error) {
      if (txId) await creditService.refundCreditsOnce({ transactionId: txId, reason: "Project chat message could not be saved" });
      throw error;
    }

    const userMessage = saved.find((m) => m.role === "user");
    const assistantMessage = saved.find((m) => m.role === "assistant");
    const citedPaperIds = assistantMessage?.citedPaperIds ?? savedCitations.map((c) => c.paperId);
    const citations = assistantMessage?.citations ?? [];

    if (scope === "team") {
      for (const savedMessage of saved) {
        projectChatEventHub.publish({ type: "message.created", projectId: projectIdInput, scope, message: savedMessage, occurredAt: new Date().toISOString() });
      }
      await auditService.log("project.ai_chat.team_message_sent", {
        userId,
        targetTableName: "projects",
        targetRecordId: projectId,
        details: { citedPaperIds, creditCost: generated.creditCost },
      });
    }

    return {
      scope,
      answer: generated.answer,
      citedPaperIds,
      citations,
      retrievalMeta,
      creditCost: generated.creditCost,
      userMessage,
      assistantMessage,
    };
  }

  private async saveTurn(
    projectId: string,
    userId: string,
    message: string,
    scope: ProjectChatScope,
    answer: string,
    citations: SavedCitationInput[],
    creditTransactionId?: string,
    creditCost = 1,
    clientKey?: string,
    retrievalMeta?: ProjectChatRetrievalMeta,
  ): Promise<ProjectChatHistoryMessage[]> {
    const prisma = getPrisma();
    // Resolve canonical DB paper UUIDs while preserving the exact input order and citation numbers.
    const unresolvedFilters = citations.filter((c) => !c.internalPaperId).map((c) => idWhere(c.paperId));
    const resolvedPaperRows = unresolvedFilters.length
      ? await prisma.paper.findMany({ where: { OR: unresolvedFilters }, select: { id: true, legacyMongoId: true } })
      : [];
    const internalIdByPublic = new Map<string, string>();
    for (const row of resolvedPaperRows) {
      internalIdByPublic.set(row.id, row.id);
      if (row.legacyMongoId) internalIdByPublic.set(row.legacyMongoId, row.id);
    }

    const rowsToInsert = citations
      .map((item) => {
        const resolvedId = item.internalPaperId ?? internalIdByPublic.get(item.paperId);
        if (!resolvedId) return null;
        return {
          paperId: resolvedId,
          position: item.position,
          citationNumber: item.citationNumber,
          sourceKind: item.sourceKind,
          excerpt: item.excerpt ?? null,
          pageNumber: item.pageNumber ?? null,
          chunkId: item.chunkId ?? null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const rows = await prisma.$transaction(async (db) => {
      await lockProjectAccounts(db, [userId], projectId);
      await authorizeProjectTransaction(db, projectId, userId, "CONTRIBUTE");
      const userMessage = await db.projectChatMessage.create({
        data: {
          projectId,
          userId,
          scope,
          role: "user",
          content: message,
          ...(clientKey ? { clientKey } : {}),
        },
      });
      const assistantMessage = await db.projectChatMessage.create({
        data: {
          projectId,
          userId,
          scope,
          role: "assistant",
          content: answer,
          creditTransactionId,
          creditCost,
          ...(clientKey ? { clientKey } : {}),
          ...(retrievalMeta ? { retrievalMeta: retrievalMeta as unknown as Prisma.InputJsonValue } : {}),
        },
      });
      if (rowsToInsert.length) {
        await db.projectChatCitation.createMany({
          data: rowsToInsert.map((item) => ({
            messageId: assistantMessage.id,
            paperId: item.paperId,
            position: item.position,
            citationNumber: item.citationNumber,
            sourceKind: item.sourceKind,
            excerpt: item.excerpt,
            pageNumber: item.pageNumber,
            chunkId: item.chunkId,
          })),
          skipDuplicates: true,
        });
      }
      return [userMessage, assistantMessage];
    });

    const users = await this.loadUserSummaries([userId]);
    return this.hydrateMessages(projectId, rows, users, users);
  }

  async listHistory(
    projectIdInput: string,
    userIdInput: string,
    limit: number,
    scope: ProjectChatScope = "private",
    beforeId?: string,
  ): Promise<ProjectChatHistoryMessage[]> {
    const access = await this.assertCanAccess(projectIdInput, userIdInput);
    const db = getPrisma();
    const where = buildChatHistoryFilter(access.project.id, access.user.id, scope);
    const cursor = beforeId
      ? await db.projectChatMessage.findFirst({ where: { ...idWhere(beforeId), ...where }, select: { id: true } })
      : null;
    if (beforeId && !cursor) throw AppError.notFound("AI chat history cursor not found");
    // Reverse chronological order also reverses the user-before-assistant tie
    // order. A database cursor retains the full timestamptz precision.
    const rows = await db.projectChatMessage.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { role: "asc" }, { id: "desc" }],
      take: limit,
      ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
    });
    const requesters = await this.loadUserSummaries(rows.map((row) => row.userId));
    const pinnedBy = await this.loadUserSummaries(rows.flatMap((row) => (row.pinnedById ? [row.pinnedById] : [])));
    return this.hydrateMessages(access.project.id, rows.reverse(), requesters, pinnedBy);
  }

  async setPinned(projectIdInput: string, messageIdInput: string, userIdInput: string, pinned: boolean): Promise<ProjectChatHistoryMessage> {
    const access = await this.assertCanAccess(projectIdInput, userIdInput);
    const message = await getPrisma().projectChatMessage.findFirst({
      where: { ...idWhere(messageIdInput), projectId: access.project.id, scope: "team", role: "assistant" },
    });
    if (!message) throw AppError.notFound("Team AI assistant message not found");
    const row = await getPrisma().$transaction(async (db) => {
      await lockProjectAccounts(db, [access.user.id], access.project.id);
      await authorizeProjectTransaction(db, access.project.id, access.user.id, "CONTRIBUTE");
      return db.projectChatMessage.update({
        where: { id: message.id },
        data: { isPinned: pinned, pinnedAt: pinned ? new Date() : null, pinnedById: pinned ? access.user.id : null },
      });
    });
    const users = await this.loadUserSummaries([row.userId, access.user.id]);
    const [hydrated] = await this.hydrateMessages(access.project.id, [row], users, users);
    projectChatEventHub.publish({ type: "message.updated", projectId: projectIdInput, scope: "team", message: hydrated!, occurredAt: new Date().toISOString() });
    await auditService.log("project.ai_chat.message_pin_updated", {
      userId: access.user.id,
      targetTableName: "project_chat_messages",
      targetRecordId: row.id,
      details: { projectId: access.project.id, pinned },
    });
    return hydrated!;
  }

  private async selectEvidence(
    question: string,
    papers: ChatEvidencePaper[],
  ): Promise<{ selectedEvidence: ChatEvidencePaper[]; retrievalMode: ProjectChatRetrievalMeta["retrievalMode"]; questionVector?: number[] }> {
    let questionVector: number[] | undefined;
    const anyEmbedding = papers.some((p) => Array.isArray(p.embedding) && p.embedding.length > 0);
    if (anyEmbedding) {
      try {
        questionVector = await getEmbeddingProvider().embed(normalizeQuestion(question));
      } catch (error) {
        logger.warn({ err: error }, "project chat query embedding failed; using lexical fallback");
        questionVector = undefined;
      }
    }
    const picked = pickEvidenceWithMetadata(papers, env.CHAT_CONTEXT_PAPERS, questionVector, question);
    return {
      selectedEvidence: picked.papers,
      retrievalMode: picked.retrievalMode,
      questionVector,
    };
  }

  private async attachKnowledgePassages(
    papers: ChatEvidencePaper[],
    question: string,
    questionVector?: number[],
  ): Promise<ChatEvidencePaper[]> {
    if (!papers.length) return papers;
    try {
      const enriched = await attachKnowledgeEvidence(papers, question, questionVector);
      return enriched.map((paper) => {
        const passages = paper.knowledgeEvidence?.passages ?? [];
        const topPassage = passages[0];
        if (topPassage && paper.knowledgeEvidence) {
          const isFullText = paper.knowledgeEvidence.sourceKind !== "abstract";
          return {
            ...paper,
            sourceKind: isFullText ? "FULLTEXT" : (paper.abstractText ? "ABSTRACT" : "METADATA"),
            excerpt: topPassage.text.slice(0, 600),
            pageNumber: topPassage.pageNumber ?? null,
            chunkId: topPassage.id,
          };
        }
        return {
          ...paper,
          sourceKind: paper.abstractText ? "ABSTRACT" : "METADATA",
          excerpt: paper.abstractText ? paper.abstractText.slice(0, 420) : null,
          pageNumber: null,
          chunkId: null,
        };
      });
    } catch (error) {
      logger.warn({ err: error }, "project chat knowledge passage lookup failed; falling back to abstracts");
      return papers.map((paper) => ({
        ...paper,
        sourceKind: paper.abstractText ? "ABSTRACT" : "METADATA",
        excerpt: paper.abstractText ? paper.abstractText.slice(0, 420) : null,
        pageNumber: null,
        chunkId: null,
      }));
    }
  }

  private async loadRecentHistory(projectId: string, userId: string, scope: ProjectChatScope): Promise<ChatHistoryTurn[]> {
    const limit = env.CHAT_HISTORY_TURNS * 2;
    if (limit === 0) return [];
    const rows = await getPrisma().projectChatMessage.findMany({
      where: buildChatHistoryFilter(projectId, userId, scope),
      orderBy: [{ createdAt: "desc" }, { role: "asc" }, { id: "desc" }],
      take: limit,
      select: { role: true, content: true },
    });
    return rows.reverse().map((row) => ({ role: row.role as "user" | "assistant", content: row.content }));
  }

  private async loadProjectEvidence(projectId: string): Promise<ChatEvidencePaper[]> {
    const prisma = getPrisma();
    const links = await prisma.projectPaper.findMany({
      where: { projectId, screeningStatus: { not: "EXCLUDED" } },
      orderBy: { createdAt: "asc" },
    });
    if (!links.length) return [];
    const paperIds = links.map((link) => link.paperId);
    const papers = await prisma.paper.findMany({
      where: { id: { in: paperIds }, dataStatus: "active" },
      select: { id: true, legacyMongoId: true, title: true, abstractText: true, publicationYear: true, journalName: true, doi: true },
    });
    if (!papers.length) return [];
    const activeIds = papers.map((paper) => paper.id);
    const authors = await prisma.paperAuthor.findMany({
      where: { paperId: { in: activeIds } },
      orderBy: { position: "asc" },
    });
    const authorsByPaper = new Map<string, string[]>();
    for (const author of authors) {
      const list = authorsByPaper.get(author.paperId) ?? [];
      list.push(author.displayName);
      authorsByPaper.set(author.paperId, list);
    }

    // Load stored pgvector embeddings via parameterized raw query so semantic ranking actually receives vectors.
    const embeddingsByPaper = new Map<string, number[]>();
    if (typeof prisma.$queryRaw === "function") {
      try {
        const vectorRows = await prisma.$queryRaw<Array<{ id: string; embeddingText: string | null }>>(Prisma.sql`
          SELECT id, embedding::text AS "embeddingText"
          FROM papers
          WHERE id = ANY(${activeIds}::uuid[]) AND embedding IS NOT NULL AND data_status = 'active'
        `);
        for (const row of vectorRows) {
          const parsed = parseVectorText(row.embeddingText);
          if (parsed) embeddingsByPaper.set(row.id, parsed);
        }
      } catch (error) {
        logger.warn({ err: error, projectId }, "project chat embedding fetch failed; will use lexical fallback");
      }
    }

    const byId = new Map(papers.map((paper) => [paper.id, paper]));
    return links.flatMap((link) => {
      const paper = byId.get(link.paperId);
      if (!paper) return [];
      return [{
        id: publicDatabaseId(paper),
        internalId: paper.id,
        title: paper.title,
        abstractText: paper.abstractText ?? undefined,
        publicationYear: paper.publicationYear,
        journalName: paper.journalName ?? null,
        doi: paper.doi ?? null,
        authorNames: authorsByPaper.get(paper.id) ?? [],
        screeningStatus: link.screeningStatus,
        embedding: embeddingsByPaper.get(paper.id),
        sourceKind: paper.abstractText ? "ABSTRACT" : "METADATA",
      }];
    });
  }

  private async assertCanAccess(projectIdInput: string, userIdInput: string) {
    const prisma = getPrisma();
    const [project, user] = await Promise.all([
      prisma.project.findFirst({ where: idWhere(projectIdInput) }),
      prisma.user.findFirst({ where: idWhere(userIdInput) }),
    ]);
    if (!project || Boolean(project.deletedAt)) throw AppError.notFound("Project not found");
    if (!user) throw AppError.notFound("User not found");
    if (!user.isActive || user.accountStatus !== "ACTIVE") throw AppError.unauthorized();
    if (project.ownerId !== user.id) {
      const member = await prisma.projectMember.findFirst({ where: { projectId: project.id, userId: user.id, status: "ACTIVE" } });
      if (!member) throw AppError.forbidden("Access denied to this project");
    }
    return { project, user };
  }

  async assertCanOpenEvents(projectId: string, userId: string): Promise<void> {
    await this.assertCanAccess(projectId, userId);
  }

  private async hydrateMessages(
    projectId: string,
    rows: ChatRow[],
    requesters: Map<string, UserSummary>,
    pinnedBy: Map<string, UserSummary>,
  ): Promise<ProjectChatHistoryMessage[]> {
    if (!rows.length) return [];
    const prisma = getPrisma();
    const messageIds = rows.map((row) => row.id);
    const allCitations = await prisma.projectChatCitation.findMany({
      where: { messageId: { in: messageIds } },
      orderBy: [{ position: "asc" }],
    });

    const citationsByMessage = new Map<string, typeof allCitations>();
    const citedInternalPaperIds = new Set<string>();
    for (const c of allCitations) {
      const list = citationsByMessage.get(c.messageId) ?? [];
      list.push(c);
      citationsByMessage.set(c.messageId, list);
      citedInternalPaperIds.add(c.paperId);
    }

    const paperIdsList = [...citedInternalPaperIds];
    const paperById = new Map<string, { id: string; legacyMongoId: string | null; title: string; publicationYear: number | null; journalName: string | null; doi: string | null; dataStatus?: string }>();
    const authorsByPaper = new Map<string, string[]>();
    const projectPaperStatusById = new Map<string, ProjectScreeningStatus>();

    if (paperIdsList.length > 0) {
      const [papers, authors, projectLinks] = await Promise.all([
        prisma.paper.findMany({
          where: { id: { in: paperIdsList } },
          select: { id: true, legacyMongoId: true, title: true, publicationYear: true, journalName: true, doi: true, dataStatus: true },
        }),
        typeof prisma.paperAuthor?.findMany === "function"
          ? prisma.paperAuthor.findMany({ where: { paperId: { in: paperIdsList } }, orderBy: { position: "asc" } })
          : Promise.resolve([]),
        typeof prisma.projectPaper?.findMany === "function"
          ? prisma.projectPaper.findMany({ where: { projectId, paperId: { in: paperIdsList } }, select: { paperId: true, screeningStatus: true } })
          : Promise.resolve([]),
      ]);
      for (const p of papers) paperById.set(p.id, p);
      for (const a of authors) {
        const list = authorsByPaper.get(a.paperId) ?? [];
        list.push(a.displayName);
        authorsByPaper.set(a.paperId, list);
      }
      for (const link of projectLinks) {
        projectPaperStatusById.set(link.paperId, link.screeningStatus as ProjectScreeningStatus);
      }
    }

    return rows.map((row) => {
      const rawCitations = citationsByMessage.get(row.id) ?? [];
      const citedPaperIds: string[] = [];
      const citations: ProjectChatCitation[] = [];

      for (const cite of rawCitations) {
        const paper = paperById.get(cite.paperId);
        if (!paper) continue;
        const publicId = publicDatabaseId(paper);
        citedPaperIds.push(publicId);
        const stillInProject = projectPaperStatusById.has(paper.id);
        const isActive = (paper.dataStatus ?? "active") === "active";
        const available = stillInProject && isActive;
        citations.push({
          citationNumber: typeof cite.citationNumber === "number" ? cite.citationNumber : null,
          paperId: publicId,
          title: available ? paper.title : paper.title || "Unavailable source",
          authors: available ? (authorsByPaper.get(paper.id) ?? []) : [],
          publicationYear: paper.publicationYear,
          journalName: available ? paper.journalName : null,
          doi: available ? paper.doi : null,
          sourceKind: normalizeSourceKind(cite.sourceKind),
          excerpt: available ? (cite.excerpt ?? null) : null,
          pageNumber: available ? (cite.pageNumber ?? null) : null,
          chunkId: available ? (cite.chunkId ?? null) : null,
          screeningStatus: projectPaperStatusById.get(paper.id) ?? null,
          available,
        });
      }

      return {
        id: publicDatabaseId(row),
        projectId: row.projectId,
        userId: row.userId,
        scope: row.scope as ProjectChatScope,
        role: row.role as "user" | "assistant",
        content: row.content,
        citedPaperIds,
        ...(citations.length > 0 ? { citations } : {}),
        retrievalMeta: parseRetrievalMeta(row.retrievalMeta),
        ...(row.clientKey ? { clientKey: row.clientKey } : {}),
        requester: requesters.get(row.userId),
        creditCost: row.creditCost ?? undefined,
        isPinned: row.isPinned,
        pinnedAt: row.pinnedAt?.toISOString(),
        pinnedBy: row.pinnedById ? pinnedBy.get(row.pinnedById) : undefined,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  private async loadUserSummaries(userIds: string[]) {
    const uniqueIds = [...new Set(userIds)].filter(Boolean);
    if (!uniqueIds.length) return new Map<string, UserSummary>();
    const users = await getPrisma().user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, legacyMongoId: true, fullName: true, email: true, avatarUrl: true },
    });
    return new Map(users.map((user) => [user.id, { id: publicDatabaseId(user), fullName: user.fullName, email: user.email, avatarUrl: user.avatarUrl ?? undefined }]));
  }
}

export const projectChatService = new ProjectChatService();
