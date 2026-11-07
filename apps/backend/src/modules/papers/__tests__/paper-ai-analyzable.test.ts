import { beforeEach, describe, expect, it, vi } from "vitest";
import { paperService } from "../paper.service.js";

const mocks = vi.hoisted(() => ({
  paperFindFirst: vi.fn(), paperFindUnique: vi.fn(), paperCreate: vi.fn(), paperUpdate: vi.fn(),
  charge: vi.fn(), refund: vi.fn(), notify: vi.fn(),
}));
const empty = { findMany: async () => [] };
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => ({
  user: { findUnique: async () => ({ id: "00000000-0000-4000-8000-0000000000a1", fullName: "Requester", role: "student" }), findMany: async () => [] },
  paper: { findFirst: mocks.paperFindFirst, findUnique: mocks.paperFindUnique, update: mocks.paperUpdate },
  paperAuthor: empty, paperKeyword: empty, paperTopic: empty, journal: empty,
  $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
    paper: { create: mocks.paperCreate },
    paperAuthor: { createMany: async () => ({}) }, paperKeyword: { createMany: async () => ({}) }, paperTopic: { createMany: async () => ({}) },
  }),
}) }));
vi.mock("../../credits/credit.service.js", () => ({ creditService: { chargeCreditsChecked: mocks.charge, refundCreditsOnce: mocks.refund } }));
vi.mock("../../notifications/notification.service.js", () => ({ notificationService: { create: mocks.notify } }));
vi.mock("../../../infrastructure/pdf-storage.service.js", () => ({ pdfStorageService: { deletePdf: vi.fn() } }));

const userId = "00000000-0000-4000-8000-0000000000a1";
const paperId = "00000000-0000-4000-8000-0000000000b1";
const longAbstract = "x".repeat(250);
const shortAbstract = "x".repeat(249);
const baseInput = (abstractText: string) => ({ doi: "10.1000/Test", title: "A Title", abstractText, publicationYear: 2025, paperKind: "journal-article", paperLink: "https://example.org/p", openAccessUrl: "", authors: [{ displayName: "A", isCorresponding: true }], keywords: [], topics: [] }) as never;
const row = { id: paperId, legacyMongoId: null, title: "A Title", requestedById: userId, uploadedById: null, journalId: null, paperStatus: "rejected", dataStatus: "draft", pdfPath: null, abstractText: "old" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.paperFindFirst.mockResolvedValue(null);
  mocks.charge.mockResolvedValue({ id: "tx-1" });
  mocks.paperCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data }));
  mocks.paperFindUnique.mockResolvedValue(row);
  mocks.paperUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data }));
});

describe("paper isAiAnalyzable derivation", () => {
  it("marks a new user request with a long abstract as analyzable (still a draft)", async () => {
    await paperService.create(userId, false, baseInput(longAbstract));
    expect(mocks.paperCreate.mock.calls[0]![0].data).toMatchObject({ isAiAnalyzable: true, dataStatus: "draft" });
  });

  it("marks a new user request with a short abstract as not analyzable", async () => {
    await paperService.create(userId, false, baseInput(shortAbstract));
    expect(mocks.paperCreate.mock.calls[0]![0].data.isAiAnalyzable).toBe(false);
  });

  it("recomputes isAiAnalyzable when an admin edit changes the abstract", async () => {
    await paperService.update(paperId, { abstractText: longAbstract });
    expect(mocks.paperUpdate.mock.calls[0]![0].data).toMatchObject({ abstractText: longAbstract, isAiAnalyzable: true });
    await paperService.update(paperId, { abstractText: shortAbstract });
    expect(mocks.paperUpdate.mock.calls[1]![0].data).toMatchObject({ abstractText: shortAbstract, isAiAnalyzable: false });
  });

  it("does not let an admin edit set isAiAnalyzable directly", async () => {
    await paperService.update(paperId, { title: "New title", isAiAnalyzable: true });
    expect(mocks.paperUpdate.mock.calls[0]![0].data).not.toHaveProperty("isAiAnalyzable");
    await paperService.update(paperId, { abstractText: shortAbstract, isAiAnalyzable: true });
    expect(mocks.paperUpdate.mock.calls[1]![0].data.isAiAnalyzable).toBe(false);
  });

  it("leaves isAiAnalyzable alone when the abstract is not part of the update", async () => {
    await paperService.update(paperId, { title: "New title" });
    expect(mocks.paperUpdate.mock.calls[0]![0].data).not.toHaveProperty("isAiAnalyzable");
  });

  it("recomputes isAiAnalyzable when the requester resubmits with a new abstract", async () => {
    await paperService.resubmit(paperId, userId, { abstractText: longAbstract });
    expect(mocks.paperUpdate.mock.calls[0]![0].data).toMatchObject({ isAiAnalyzable: true, paperStatus: "pending", dataStatus: "draft" });
  });

  it("does not touch isAiAnalyzable when the requester resubmits without an abstract", async () => {
    await paperService.resubmit(paperId, userId, { title: "Fixed title" });
    expect(mocks.paperUpdate.mock.calls[0]![0].data).not.toHaveProperty("isAiAnalyzable");
  });
});
