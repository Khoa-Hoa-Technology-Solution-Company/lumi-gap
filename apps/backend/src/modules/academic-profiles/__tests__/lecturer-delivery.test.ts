import { beforeEach, expect, it, vi } from "vitest";
import { buildLecturerVerificationMail, deliverLecturerVerificationEmail, lecturerVerificationNotification, type LecturerDeliveryEvent } from "../lecturer-verification-delivery.service.js";
const mocks = vi.hoisted(() => ({ status: "PENDING", requestStatus: "PENDING", superseded: false, invalidated: false, event: "LECTURER_VERIFICATION_SUBMITTED" as LecturerDeliveryEvent, updates: [] as unknown[], send: vi.fn(), create: vi.fn(), emailMode: "smtp" }));
const id = "11111111-1111-4111-8111-111111111111";
vi.mock("../../../config/env.js", () => ({ env: { get EMAIL_DELIVERY_MODE() { return mocks.emailMode; } } }));
vi.mock("../../../infrastructure/logger.js", () => ({ logger: { warn: vi.fn() } }));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => ({
  notification: { findUnique: async () => ({ id, userId: id, emailStatus: mocks.status, emailPayload: { event: mocks.event, requestId: id } }),
    updateMany: async ({ where, data }: { where: { emailStatus: string }; data: { emailStatus: string } }) => { if (mocks.status !== where.emailStatus) return { count: 0 }; mocks.status = data.emailStatus; mocks.updates.push(data); return { count: 1 }; },
    update: async ({ data }: { data: { emailStatus: string } }) => { mocks.status = data.emailStatus; mocks.updates.push(data); }, },
  user: { findUnique: async () => ({ isActive: true, accountStatus: "ACTIVE", emailVerifiedAt: new Date(), email: "lecturer@example.edu", fullName: "Lecturer" }) },
  academicProfile: { findUnique: async () => ({ notificationLocale: "vi" }) },
  verificationEvidence: { findFirst: async () => ({ id, status: mocks.requestStatus, supersededAt: mocks.superseded ? new Date() : null, invalidatedAt: mocks.invalidated ? new Date() : null, metadata: { institutionName: "Fixture University", positionTitle: "Lecturer" }, rejectionReason: null, revision: 1 }) },
}) }));
vi.mock("../../notifications/notification.service.js", () => ({ notificationService: { create: (...args: unknown[]) => mocks.create(...args) } }));
vi.mock("../../auth/auth-mail.service.js", async () => {
  const actual = await vi.importActual<typeof import("../../auth/auth-mail.service.js")>("../../auth/auth-mail.service.js");
  return { ...actual, authMailService: { sendLecturerVerification: (...args: unknown[]) => mocks.send(...args) }, webOrigin: () => "https://lumigap.example" };
});
beforeEach(() => { mocks.status = "PENDING"; mocks.requestStatus = "PENDING"; mocks.superseded = false; mocks.invalidated = false; mocks.event = "LECTURER_VERIFICATION_SUBMITTED"; mocks.emailMode = "smtp"; mocks.updates = []; mocks.send.mockReset().mockResolvedValue(true); mocks.create.mockReset(); });
it("atomically claims one email and does not resend on duplicate worker delivery", async () => {
  await Promise.all([deliverLecturerVerificationEmail(id), deliverLecturerVerificationEmail(id)]);
  expect(mocks.send).toHaveBeenCalledTimes(1); expect(mocks.status).toBe("SENT");
  await deliverLecturerVerificationEmail(id); expect(mocks.send).toHaveBeenCalledTimes(1);
});
it("keeps definite SMTP rejection retryable and ambiguous delivery observable", async () => {
  mocks.send.mockRejectedValueOnce({ code: "ECONNREFUSED" });
  await expect(deliverLecturerVerificationEmail(id)).rejects.toMatchObject({ code: "ECONNREFUSED" }); expect(mocks.status).toBe("PENDING");
  mocks.send.mockRejectedValueOnce({ code: "ETIMEDOUT" }); await deliverLecturerVerificationEmail(id); expect(mocks.status).toBe("UNCERTAIN");
  await deliverLecturerVerificationEmail(id); expect(mocks.send).toHaveBeenCalledTimes(2);
});
it("honors disabled mail delivery without logging verification secrets", async () => {
  mocks.emailMode = "disabled"; await deliverLecturerVerificationEmail(id); expect(mocks.status).toBe("SKIPPED"); expect(mocks.send).not.toHaveBeenCalled();
});
it.each(["LECTURER_VERIFICATION_SUBMITTED", "LECTURER_VERIFICATION_SUPPLEMENTED", "LECTURER_VERIFICATION_APPROVED", "LECTURER_VERIFICATION_REJECTED", "LECTURER_VERIFICATION_MORE_INFO_REQUIRED"] as const)("renders %s with an authenticated status link and no evidence contents", event => {
  const content = buildLecturerVerificationMail(event, id, "Lecturer", "vi", "https://lumigap.example", { institutionName: "Fixture University", position: "Lecturer", applicantMessage: "Cần quyết định bổ nhiệm hiện tại", revision: 2 });
  expect(content.text).toContain(`/settings/verification/lecturer?requestId=${id}`); expect(content.text).not.toContain("storageKey"); expect(content.subject).toBeTruthy();
  expect(content.text).toContain("Fixture University");
  if (["LECTURER_VERIFICATION_MORE_INFO_REQUIRED", "LECTURER_VERIFICATION_REJECTED"].includes(event)) expect(content.text).toContain("Cần quyết định bổ nhiệm hiện tại");
  else expect(content.text).not.toContain("Cần quyết định bổ nhiệm hiện tại");
  if (event === "LECTURER_VERIFICATION_SUPPLEMENTED") expect(content.text).toContain("Phiên bản hồ sơ: 2");
  expect(content.text).not.toContain("email preferences");
});
it("stores public feedback with the decision and queues the supplemented revision for administrators", async () => {
  const tx = { academicProfile: { findUnique: async () => ({ notificationLocale: "vi" }) }, verificationEvidence: { findUniqueOrThrow: async () => ({ metadata: { institutionName: "University", positionTitle: "Lecturer", adminNote: "PRIVATE ADMIN NOTE", storageKey: "PRIVATE FILE" }, revision: 2, rejectionReason: "Upload a current appointment record" }) } };
  await lecturerVerificationNotification(tx as never, "LECTURER_VERIFICATION_MORE_INFO_REQUIRED", { id, userId: id, academicProfileId: id });
  expect(mocks.create.mock.calls[0]![0]).toMatchObject({ emailStatus: "PENDING", emailPayload: { requestId: id, applicantMessage: "Upload a current appointment record" } });
  expect(JSON.stringify(mocks.create.mock.calls)).not.toContain("PRIVATE");
  mocks.create.mockClear();
  await lecturerVerificationNotification(tx as never, "LECTURER_VERIFICATION_SUPPLEMENTED", { id, userId: id, academicProfileId: id });
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ type: "LECTURER_VERIFICATION_REVIEW_REQUESTED", role: "admin", emailStatus: "SKIPPED", emailPayload: { requestId: id } }), tx);
});
it("does not send outdated calls to act after a new decision or supplement", async () => {
  mocks.requestStatus = "NEEDS_MORE_INFORMATION";
  await deliverLecturerVerificationEmail(id);
  expect(mocks.status).toBe("SKIPPED"); expect(mocks.send).not.toHaveBeenCalled();
  mocks.status = "PENDING"; mocks.event = "LECTURER_VERIFICATION_MORE_INFO_REQUIRED"; mocks.superseded = true;
  await deliverLecturerVerificationEmail(id);
  expect(mocks.status).toBe("SKIPPED"); expect(mocks.send).not.toHaveBeenCalled();
});
it("does not announce an approval after the verified claim was invalidated", async () => {
  mocks.event = "LECTURER_VERIFICATION_APPROVED"; mocks.requestStatus = "VERIFIED"; mocks.invalidated = true;
  await deliverLecturerVerificationEmail(id);
  expect(mocks.status).toBe("SKIPPED"); expect(mocks.send).not.toHaveBeenCalled();
});
it("records permanent recipient rejection without retrying indefinitely", async () => {
  mocks.send.mockRejectedValueOnce({ responseCode: 550 });
  await deliverLecturerVerificationEmail(id); expect(mocks.status).toBe("FAILED");
  await deliverLecturerVerificationEmail(id); expect(mocks.send).toHaveBeenCalledTimes(1);
});
it("escapes names and public feedback in the real HTML email template", () => {
  const value = '<img src=x onerror="alert(1)">';
  const content = buildLecturerVerificationMail("LECTURER_VERIFICATION_MORE_INFO_REQUIRED", id, value, "en", "https://lumigap.example", { applicantMessage: value });
  expect(content.html).not.toContain(value); expect(content.html).toContain("&lt;img"); expect(content.text).toContain(value);
});
