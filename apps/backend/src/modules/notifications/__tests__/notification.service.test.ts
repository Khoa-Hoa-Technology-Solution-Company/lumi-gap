import { beforeEach, describe, expect, it, vi } from "vitest";
import { notificationService } from "../notification.service.js";

const mocks = vi.hoisted(() => ({
  db: {
    user: { findUnique: vi.fn() },
    reviewRequest: { findUnique: vi.fn() },
    academicProfile: { findUnique: vi.fn() },
    notification: { create: vi.fn(), upsert: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  },
  push: vi.fn(),
}));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => mocks.db }));
vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: mocks.push } }));

const userId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const profileId = "33333333-3333-4333-8333-333333333333";
const notificationId = "44444444-4444-4444-8444-444444444444";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.user.findUnique.mockResolvedValue({ id: userId, legacyMongoId: null });
});

describe("notification targets after academic workflow merge", () => {
  it("resolves a new review request in its transaction and waits for commit before dispatch", async () => {
    const tx = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: userId, legacyMongoId: null }) },
      reviewRequest: { findUnique: vi.fn().mockResolvedValue({ id: requestId }) },
      notification: { create: vi.fn().mockResolvedValue({ id: notificationId, legacyMongoId: null, userId }) },
    };
    await notificationService.create({ userId, title: "Review accepted", message: "Your request was accepted.", type: "REVIEW_REQUEST_ACCEPTED", targetKind: "review_request", targetId: requestId }, tx as never);
    expect(tx.reviewRequest.findUnique).toHaveBeenCalledWith({ where: { id: requestId }, select: { id: true } });
    expect(tx.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId, targetKind: "review_request", targetUuid: requestId, targetLegacyMongoId: null }) });
    expect(mocks.db.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.db.reviewRequest.findUnique).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("preserves the original Lecturer delivery event when the same event key is submitted again", async () => {
    const original = { id: notificationId, legacyMongoId: null, userId, emailStatus: "SENT" };
    const tx = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: userId, legacyMongoId: null }) },
      academicProfile: { findUnique: vi.fn().mockResolvedValue({ id: profileId, legacyMongoId: null }) },
      notification: { create: vi.fn(), upsert: vi.fn().mockResolvedValue(original) },
    };
    const eventKey = `lecturer:${requestId}:submitted`;
    const result = await notificationService.create({ userId, title: "Request received", message: "Awaiting review.", type: "LECTURER_VERIFICATION_SUBMITTED", targetKind: "academic_profile", targetId: profileId, eventKey, emailStatus: "PENDING", emailPayload: { requestId } }, tx as never);
    expect(result).toBe(original);
    expect(tx.notification.upsert).toHaveBeenCalledWith({ where: { eventKey }, create: expect.objectContaining({ targetUuid: profileId, emailPayload: { requestId }, emailStatus: "PENDING" }), update: {} });
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("lists both workflows with their destinations while keeping private email payloads out of the response", async () => {
    const base = { id: notificationId, legacyMongoId: null, title: "Update", message: "Review status changed.", userId, role: null, paperId: null, targetLegacyMongoId: null, isRead: false, createdAt: new Date() };
    mocks.db.notification.findMany.mockResolvedValue([
      { ...base, type: "LECTURER_VERIFICATION_MORE_INFO_REQUIRED", targetKind: "academic_profile", targetUuid: profileId, emailPayload: { requestId, applicantMessage: "Private feedback", storageKey: "Private file" } },
      { ...base, type: "REVIEW_SUBMITTED", targetKind: "review_request", targetUuid: requestId, emailPayload: { requestId } },
    ]);
    const rows = await notificationService.list(userId, "user");
    expect(rows[0]).toMatchObject({ verificationRequestId: requestId, targetId: profileId });
    expect(rows[1]).toMatchObject({ targetKind: "review_request", targetId: requestId });
    expect(rows[1].verificationRequestId).toBeUndefined();
    expect(JSON.stringify(rows)).not.toMatch(/Private feedback|Private file|emailPayload/);
  });
});
