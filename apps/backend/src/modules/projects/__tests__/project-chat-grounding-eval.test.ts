import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyChatIntent,
  parseCitationEntries,
  pickEvidenceWithMetadata,
  type ChatEvidencePaper,
} from "../project-chat.prompt.js";
import { parseCitationNumbers } from "../../llm/grounding.js";

const db = vi.hoisted(() => ({
  project: { findFirst: vi.fn(), findUnique: vi.fn() },
  user: { findFirst: vi.fn(), findMany: vi.fn() },
  projectMember: { findFirst: vi.fn() },
  projectPaper: { findMany: vi.fn() },
  paper: { findMany: vi.fn() },
  paperAuthor: { findMany: vi.fn() },
  paperDocument: { findMany: vi.fn() },
  projectChatMessage: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  projectChatCitation: { findMany: vi.fn(), createMany: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  chargeCreditsChecked: vi.fn(),
  refundCreditsOnce: vi.fn(),
  embed: vi.fn(),
  generate: vi.fn(),
  attachKnowledgeEvidence: vi.fn(),
  lockProjectAccounts: vi.fn(),
  authorizeProjectTransaction: vi.fn(),
}));

vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => db }));
vi.mock("../../credits/credit.service.js", () => ({
  creditService: {
    chargeCreditsChecked: mocks.chargeCreditsChecked,
    refundCreditsOnce: mocks.refundCreditsOnce,
  },
}));
vi.mock("../../embeddings/embedding.factory.js", () => ({
  getEmbeddingProvider: () => ({ embed: mocks.embed }),
}));
vi.mock("../../knowledge/knowledge.retrieval.js", () => ({
  attachKnowledgeEvidence: mocks.attachKnowledgeEvidence,
}));
vi.mock("../../llm/llm.factory.js", () => ({
  getLlmProvider: () => ({ name: "mock-llm", generate: mocks.generate }),
}));
vi.mock("../../llm/llm.run.js", () => ({
  cachedGenerate: async <T,>(opts: { generate: () => Promise<T> }) => opts.generate(),
}));
vi.mock("../../user-ai/user-ai.runtime.js", () => ({
  aiModel: () => "mock-model",
  withProjectAi: async <T,>(_p: string, _u: string, fn: () => Promise<T>) => fn(),
}));
vi.mock("../project-transaction.js", () => ({
  lockProjectAccounts: mocks.lockProjectAccounts,
  authorizeProjectTransaction: mocks.authorizeProjectTransaction,
}));

import { projectChatService } from "../project-chat.service.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PAPER_A = "33333333-3333-4333-8333-333333333331";
const PAPER_B = "33333333-3333-4333-8333-333333333332";
const PAPER_C = "33333333-3333-4333-8333-333333333333";

function makePaper(id: string, title: string, abstractText: string, embedding?: number[]): ChatEvidencePaper {
  return { id, internalId: id, title, abstractText, publicationYear: 2025, authorNames: ["Author A"], embedding };
}

describe("Retrieval evaluation dataset & ranking correctness", () => {
  const corpus: ChatEvidencePaper[] = [
    makePaper(PAPER_A, "Clinical NLP Error Detection", "Detects hallucinations in clinical discharge summaries.", [1, 0, 0]),
    makePaper(PAPER_B, "Soil Moisture Satellite Imaging", "Remote sensing radar reflectance for agriculture.", [0, 1, 0]),
    makePaper(PAPER_C, "Systematic Review Automation with LLMs", "Automated title and abstract screening recall analysis.", [0, 0, 1]),
  ];

  it("achieves 100% Recall@1 and MRR=1.0 on semantic vector queries with compatible embeddings", () => {
    const res1 = pickEvidenceWithMetadata(corpus, 2, [0.98, 0.05, 0.02], "clinical hallucinations");
    expect(res1.retrievalMode).toBe("hybrid");
    expect(res1.papers[0]?.id).toBe(PAPER_A);

    const res2 = pickEvidenceWithMetadata(corpus, 2, [0.02, 0.03, 0.99], "automated abstract screening");
    expect(res2.papers[0]?.id).toBe(PAPER_C);
  });

  it("falls back deterministically to lexical ranking when embeddings are missing or mismatched", () => {
    const noVectors = corpus.map((p) => ({ ...p, embedding: undefined }));
    const res = pickEvidenceWithMetadata(noVectors, 2, undefined, "radar reflectance agriculture soil");
    expect(res.retrievalMode).toBe("lexical_fallback");
    expect(res.papers[0]?.id).toBe(PAPER_B);

    // Mismatched vector dimensions must NOT crash or misrank
    const mismatch = pickEvidenceWithMetadata(corpus, 2, [1, 0], "automated screening recall");
    expect(mismatch.retrievalMode).toBe("lexical_fallback");
    expect(mismatch.papers[0]?.id).toBe(PAPER_C);
  });
});

describe("Citation number mapping & code-block safety", () => {
  const evidence: ChatEvidencePaper[] = [
    makePaper(PAPER_A, "Paper A", "Alpha"),
    makePaper(PAPER_B, "Paper B", "Beta"),
    makePaper(PAPER_C, "Paper C", "Gamma"),
  ];

  it("preserves exact [3] before [1] mapping and deduplicates repeated citations without renumbering", () => {
    const answer = "Paper C reports a limitation [3], while Paper A discusses another issue [1] and repeats [3].";
    const entries = parseCitationEntries(answer, evidence);
    expect(entries.map((e) => ({ n: e.citationNumber, id: e.paper.id }))).toEqual([
      { n: 3, id: PAPER_C },
      { n: 1, id: PAPER_A },
    ]);
  });

  it("ignores bracket numbers inside Markdown code blocks and inline code", () => {
    const answer = [
      "According to [2], indexing starts at zero:",
      "```ts",
      "const val = items[99]; // not a citation",
      "```",
      "You can also access `list[42]` safely.",
    ].join("\n");
    expect(parseCitationNumbers(answer)).toEqual([2]);
    expect(parseCitationEntries(answer, evidence).map((e) => e.paper.id)).toEqual([PAPER_B]);
  });

  it("rejects out-of-range prose citations", () => {
    expect(() => parseCitationEntries("Unsupported claim [9].", evidence)).toThrow(/out-of-range/);
  });
});

describe("Question intent classification", () => {
  it("distinguishes capability, project inventory, methodology, and document-grounded questions", () => {
    expect(classifyChatIntent("Xin chào")).toBe("capability");
    expect(classifyChatIntent("Bạn là một AI thực thụ hay chỉ là RAG?")).toBe("capability");
    expect(classifyChatIntent("Bạn có đọc được PDF không?")).toBe("capability");
    expect(classifyChatIntent("Nhóm hiện có những tài liệu nào?")).toBe("project_context");
    expect(classifyChatIntent("Research Gap là gì?")).toBe("methodology");
    expect(classifyChatIntent("Literature Review khác Systematic Review như thế nào?")).toBe("methodology");
    expect(classifyChatIntent("Các bài báo trong dự án này sử dụng phương pháp nào?")).toBe("grounded");
  });
});

describe("ProjectChatService policy, capability routing, idempotency, and citation hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.project.findFirst.mockResolvedValue({
      id: PROJECT_ID,
      ownerId: USER_ID,
      status: "ACTIVE",
      deletedAt: null,
      aiDataPolicy: "ALLOW_PERSONAL_AI",
      externalLookupPolicy: "ALLOW_PUBLIC_INDEX",
    });
    db.project.findUnique.mockResolvedValue({
      aiDataPolicy: "ALLOW_PERSONAL_AI",
      externalLookupPolicy: "ALLOW_PUBLIC_INDEX",
    });
    db.user.findFirst.mockResolvedValue({ id: USER_ID, isActive: true, accountStatus: "ACTIVE" });
    db.user.findMany.mockResolvedValue([{ id: USER_ID, legacyMongoId: null, fullName: "Researcher", email: "r@example.org", avatarUrl: null }]);
    db.projectPaper.findMany.mockResolvedValue([]);
    db.paper.findMany.mockResolvedValue([]);
    db.paperAuthor.findMany.mockResolvedValue([]);
    db.paperDocument.findMany.mockResolvedValue([]);
    db.projectChatCitation.findMany.mockResolvedValue([]);
    db.$queryRaw.mockResolvedValue([{ cnt: 0 }]);
    mocks.lockProjectAccounts.mockResolvedValue(undefined);
    mocks.authorizeProjectTransaction.mockResolvedValue({ role: "OWNER" });
    db.$transaction.mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db));
  });

  it("enforces project AI policy DISABLED before retrieval or credit charging", async () => {
    db.project.findUnique.mockResolvedValue({ aiDataPolicy: "DISABLED", externalLookupPolicy: "LOCAL_CORPUS_ONLY" });
    await expect(projectChatService.sendMessage(PROJECT_ID, USER_ID, "Xin chào", "private")).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.chargeCreditsChecked).not.toHaveBeenCalled();
  });

  it("handles capability questions deterministically with 0 credits even when project has 0 papers", async () => {
    const createdAt = new Date("2026-11-26T12:00:00Z");
    db.projectChatMessage.findFirst.mockResolvedValue(null);
    db.projectChatMessage.create
      .mockResolvedValueOnce({ id: "u1", legacyMongoId: null, projectId: PROJECT_ID, userId: USER_ID, scope: "private", role: "user", content: "Bạn là AI thực thụ hay chỉ là RAG?", creditCost: null, isPinned: false, pinnedAt: null, pinnedById: null, createdAt })
      .mockResolvedValueOnce({ id: "a1", legacyMongoId: null, projectId: PROJECT_ID, userId: USER_ID, scope: "private", role: "assistant", content: "Capability answer", creditCost: 0, isPinned: false, pinnedAt: null, pinnedById: null, createdAt });

    const res = await projectChatService.sendMessage(PROJECT_ID, USER_ID, "Bạn là AI thực thụ hay chỉ là RAG?", "private");
    expect(res.creditCost).toBe(0);
    expect(res.citedPaperIds).toEqual([]);
    expect(res.retrievalMeta.intent).toBe("capability");
    expect(mocks.chargeCreditsChecked).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("replays an existing turn on duplicate clientKey without double-charging credits", async () => {
    const clientKey = "44444444-4444-4444-8444-444444444444";
    const createdAt = new Date("2026-11-26T12:00:00Z");
    db.projectChatMessage.findFirst
      .mockResolvedValueOnce({ id: "a-replay", legacyMongoId: null, projectId: PROJECT_ID, userId: USER_ID, scope: "private", role: "assistant", content: "Saved answer [3]", clientKey, creditCost: 1, isPinned: false, pinnedAt: null, pinnedById: null, createdAt })
      .mockResolvedValueOnce({ id: "u-replay", legacyMongoId: null, projectId: PROJECT_ID, userId: USER_ID, scope: "private", role: "user", content: "Question", clientKey, creditCost: null, isPinned: false, pinnedAt: null, pinnedById: null, createdAt });

    const res = await projectChatService.sendMessage(PROJECT_ID, USER_ID, "Question", "private", clientKey);
    expect(res.answer).toBe("Saved answer [3]");
    expect(res.assistantMessage?.id).toBe("a-replay");
    expect(mocks.chargeCreditsChecked).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("hydrates bibliographic citations, protects removed sources, and keeps legacy null citationNumber honest", async () => {
    const createdAt = new Date("2026-11-26T12:00:00Z");
    db.projectChatMessage.findMany.mockResolvedValue([
      { id: "m-new", legacyMongoId: null, projectId: PROJECT_ID, userId: USER_ID, scope: "private", role: "assistant", content: "Findings [3] and [1]", creditCost: 1, isPinned: false, pinnedAt: null, pinnedById: null, createdAt },
      { id: "m-legacy", legacyMongoId: null, projectId: PROJECT_ID, userId: USER_ID, scope: "private", role: "assistant", content: "Legacy answer [1]", creditCost: 1, isPinned: false, pinnedAt: null, pinnedById: null, createdAt: new Date("2026-10-01T00:00:00Z") },
    ]);
    db.projectChatCitation.findMany.mockResolvedValue([
      { messageId: "m-new", paperId: PAPER_C, position: 0, citationNumber: 3, sourceKind: "FULLTEXT", excerpt: "Verified passage", pageNumber: 4, chunkId: null },
      { messageId: "m-new", paperId: PAPER_A, position: 1, citationNumber: 1, sourceKind: "ABSTRACT", excerpt: "Removed paper excerpt", pageNumber: null, chunkId: null },
      { messageId: "m-legacy", paperId: PAPER_C, position: 0, citationNumber: null, sourceKind: null, excerpt: null, pageNumber: null, chunkId: null },
    ]);
    db.paper.findMany.mockResolvedValue([
      { id: PAPER_C, legacyMongoId: null, title: "Active Grounded Paper", publicationYear: 2025, journalName: "Nature AI", doi: "10.1000/test", dataStatus: "active" },
      { id: PAPER_A, legacyMongoId: null, title: "Removed Paper", publicationYear: 2024, journalName: "Old Venue", doi: null, dataStatus: "active" },
    ]);
    db.paperAuthor.findMany.mockResolvedValue([
      { paperId: PAPER_C, displayName: "Nguyen An", position: 0 },
      { paperId: PAPER_A, displayName: "Secret Author", position: 0 },
    ]);
    // Only PAPER_C is still in the project; PAPER_A was removed.
    db.projectPaper.findMany.mockResolvedValue([
      { paperId: PAPER_C, screeningStatus: "INCLUDED" },
    ]);

    const history = await projectChatService.listHistory(PROJECT_ID, USER_ID, 50, "private");
    const legacyMsg = history.find((m) => m.id === "m-legacy")!;
    const newMsg = history.find((m) => m.id === "m-new")!;

    expect(legacyMsg.citations?.[0]?.citationNumber).toBeNull();
    expect(newMsg.citations).toHaveLength(2);
    expect(newMsg.citations?.[0]).toMatchObject({
      citationNumber: 3,
      title: "Active Grounded Paper",
      authors: ["Nguyen An"],
      sourceKind: "FULLTEXT",
      excerpt: "Verified passage",
      pageNumber: 4,
      available: true,
    });
    // Removed paper must NOT leak excerpt or authors!
    expect(newMsg.citations?.[1]).toMatchObject({
      citationNumber: 1,
      available: false,
      excerpt: null,
      authors: [],
    });
  });
});
