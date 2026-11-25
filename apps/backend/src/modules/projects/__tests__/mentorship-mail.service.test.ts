import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { deliverMentorshipEmail } from "../mentorship-mail.service.js";

const mocks = vi.hoisted(() => ({
  db: { notification: {findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn()}, user: {findUnique: vi.fn()}, academicProfile: {findUnique: vi.fn()}, mentorshipRequest: {findFirst: vi.fn()} },
  mail: vi.fn(), env: { EMAIL_DELIVERY_MODE: "smtp" },
}));
vi.mock("../../../infrastructure/database/prisma.js", () => ({getPrisma: () => mocks.db}));
vi.mock("../../../config/env.js", () => ({env: mocks.env}));
vi.mock("../../auth/auth-mail.service.js", async original => ({...await original<typeof import("../../auth/auth-mail.service.js")>(), webOrigin: () => "https://lumigap.example", authMailService: {sendMentorship: mocks.mail}}));
vi.mock("../../../infrastructure/logger.js", () => ({logger: {warn: vi.fn()}}));
let id: string;
beforeEach(() => {
  vi.resetAllMocks(); id = randomUUID(); mocks.env.EMAIL_DELIVERY_MODE = "smtp";
  mocks.db.notification.findUnique.mockResolvedValue({id, userId: "mentor", emailStatus: "PENDING", emailPayload: {event: "MENTORSHIP_REQUEST_RECEIVED", projectId: randomUUID(), requestId: randomUUID(), projectTitle: "Research group", actorName: "Project owner"}});
  mocks.db.user.findUnique.mockResolvedValue({email: "mentor@university.edu", fullName: "Lecturer", isActive: true, accountStatus: "ACTIVE", emailVerifiedAt: new Date()});
  mocks.db.academicProfile.findUnique.mockResolvedValue({mentorshipEmailEnabled: true, notificationLocale: "vi"});
  mocks.db.mentorshipRequest.findFirst.mockResolvedValue({status: "PENDING", expiresAt: new Date(Date.now() + 86400000)});
  mocks.db.notification.updateMany.mockResolvedValue({count: 1});
  mocks.mail.mockResolvedValue(true);
});
it("delivers an opted-in invitation to the verified account email and records SMTP success", async () => {
  await deliverMentorshipEmail(id);
  expect(mocks.mail).toHaveBeenCalledWith("mentor@university.edu", expect.stringContaining("mời bạn hướng dẫn"), expect.objectContaining({text: expect.stringContaining("/academic-support?view=incoming")}));
  expect(mocks.db.notification.update).toHaveBeenCalledWith({where: {id}, data: {emailStatus: "SENT", emailSentAt: expect.any(Date)}});
});
it.each(["opted-out", "unverified", "disabled", "withdrawn"])("does not send when %s at delivery time", async reason => {
  if(reason === "opted-out") mocks.db.academicProfile.findUnique.mockResolvedValue({mentorshipEmailEnabled: false});
  if(reason === "unverified") mocks.db.user.findUnique.mockResolvedValue({isActive: true, accountStatus: "ACTIVE", emailVerifiedAt: null});
  if(reason === "disabled") mocks.env.EMAIL_DELIVERY_MODE = "disabled";
  if(reason === "withdrawn") mocks.db.mentorshipRequest.findFirst.mockResolvedValue({status: "CANCELLED"});
  await deliverMentorshipEmail(id);
  expect(mocks.mail).not.toHaveBeenCalled();
  expect(mocks.db.notification.updateMany).toHaveBeenCalledWith(expect.objectContaining({data: {emailStatus: "SKIPPED"}}));
});
it("does not send twice when another worker already claimed the message", async () => {
  mocks.db.notification.updateMany.mockResolvedValue({count: 0});
  await deliverMentorshipEmail(id);
  expect(mocks.mail).not.toHaveBeenCalled();
});
it.each([["ECONNREFUSED", "PENDING", true], ["ETIMEDOUT", "UNCERTAIN", false]] as const)("handles SMTP %s without reporting success", async (code, status, throws) => {
  mocks.mail.mockRejectedValue(Object.assign(new Error("SMTP failed"), {code}));
  if(throws) await expect(deliverMentorshipEmail(id)).rejects.toThrow("SMTP failed");
  else await deliverMentorshipEmail(id);
  expect(mocks.db.notification.update).toHaveBeenCalledWith({where: {id}, data: {emailStatus: status}});
});
