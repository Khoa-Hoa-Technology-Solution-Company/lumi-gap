import { beforeEach, describe, expect, it, vi } from "vitest";
import { paperService } from "../paper.service.js";

const owner = "00000000-0000-4000-8000-0000000000a1";
const other = "00000000-0000-4000-8000-0000000000a2";
const paperId = "00000000-0000-4000-8000-0000000000b1";

const mocks = vi.hoisted(() => ({
  paperFindUnique: vi.fn(), paperDelete: vi.fn(), chargeFindFirst: vi.fn(), refund: vi.fn(), deletePdf: vi.fn(),
}));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => ({
  user: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, fullName: "User", role: "student" }) },
  paper: { findUnique: mocks.paperFindUnique, delete: mocks.paperDelete },
  creditTransaction: { findFirst: mocks.chargeFindFirst },
}) }));
vi.mock("../../credits/credit.service.js", () => ({ creditService: { refundCreditsOnce: mocks.refund } }));
vi.mock("../../notifications/notification.service.js", () => ({ notificationService: { create: vi.fn() } }));
vi.mock("../../../infrastructure/pdf-storage.service.js", () => ({ pdfStorageService: { deletePdf: mocks.deletePdf } }));

const paper = (overrides: Record<string, unknown> = {}) => ({ id: paperId, legacyMongoId: null, doi: "10.1000/x", requestedById: owner, uploadedById: null, dataStatus: "draft", paperStatus: "not-downloaded", pdfPath: null, ...overrides });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.paperDelete.mockResolvedValue({});
  mocks.chargeFindFirst.mockResolvedValue(null);
});

describe("paperService.deletePaper", () => {
  it("refuses a requester deleting a paper that is already in the corpus", async () => {
    // An approved paper that went back to "pending" after a PDF upload is still live.
    mocks.paperFindUnique.mockResolvedValue(paper({ dataStatus: "active", paperStatus: "pending", pdfPath: "p.pdf" }));
    await expect(paperService.deletePaper(paperId, owner, "student")).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.paperDelete).not.toHaveBeenCalled();
    expect(mocks.deletePdf).not.toHaveBeenCalled();
    expect(mocks.refund).not.toHaveBeenCalled();
  });

  it("lets a requester withdraw a draft request and refunds the charge", async () => {
    mocks.paperFindUnique.mockResolvedValue(paper());
    mocks.chargeFindFirst.mockResolvedValue({ id: "tx-1" });
    await paperService.deletePaper(paperId, owner, "student");
    expect(mocks.paperDelete).toHaveBeenCalledWith({ where: { id: paperId } });
    expect(mocks.refund).toHaveBeenCalledWith({ transactionId: "tx-1", reason: "Paper request cancelled" });
  });

  it("withdraws a draft request without a refund when no charge exists", async () => {
    mocks.paperFindUnique.mockResolvedValue(paper({ pdfPath: "p.pdf", paperStatus: "pending" }));
    await paperService.deletePaper(paperId, owner, "student");
    expect(mocks.deletePdf).toHaveBeenCalledWith("p.pdf");
    expect(mocks.paperDelete).toHaveBeenCalledTimes(1);
    expect(mocks.refund).not.toHaveBeenCalled();
  });

  it("rejects a non-owner, non-admin", async () => {
    mocks.paperFindUnique.mockResolvedValue(paper());
    await expect(paperService.deletePaper(paperId, other, "student")).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.paperDelete).not.toHaveBeenCalled();
  });

  it("still lets an admin hard-delete an active paper", async () => {
    mocks.paperFindUnique.mockResolvedValue(paper({ dataStatus: "active", paperStatus: "downloaded", pdfPath: "p.pdf", requestedById: other }));
    await paperService.deletePaper(paperId, owner, "admin");
    expect(mocks.deletePdf).toHaveBeenCalledWith("p.pdf");
    expect(mocks.paperDelete).toHaveBeenCalledWith({ where: { id: paperId } });
    expect(mocks.refund).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing paper", async () => {
    mocks.paperFindUnique.mockResolvedValue(null);
    await expect(paperService.deletePaper(paperId, owner, "student")).rejects.toMatchObject({ statusCode: 404 });
    await expect(paperService.deletePaper(paperId, owner, "admin")).rejects.toMatchObject({ statusCode: 404 });
  });
});
