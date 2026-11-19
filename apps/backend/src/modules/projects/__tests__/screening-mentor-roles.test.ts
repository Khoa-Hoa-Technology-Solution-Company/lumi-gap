import { expect, it, vi } from "vitest";
import { ensureAssignment } from "../screening-case-context.js";


it.each(["PRIMARY", "SECONDARY", "UNASSIGNED"])("does not assign a %s mentor in retired arbitration", async mentorRole => {
  const row = { id: "case", active: true };
  const context = { project: { id: "project" }, actorId: "actor", tx: {
    screeningAdjudicationCase: { findFirst: vi.fn().mockResolvedValue(row), update: vi.fn().mockResolvedValue({ ...row, active: false }), findUniqueOrThrow: vi.fn().mockResolvedValue({ ...row, active: false }) },
    screeningAudit: { create: vi.fn() },
    mentorRelationship: { findMany: vi.fn().mockResolvedValue([{ mentorRole }]) },
    screeningAdjudicationInvitation: { create: vi.fn(), updateMany: vi.fn() },
  } };
  const result = await ensureAssignment(context as any, { id: "round" } as any, row as any);
  expect(context.tx.screeningAdjudicationCase.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ active: false, status: "CANCELLED_AS_RESOLVED" }) }));
  expect(context.tx.mentorRelationship.findMany).not.toHaveBeenCalled();
  expect(context.tx.screeningAdjudicationInvitation.create).not.toHaveBeenCalled();
  expect(result.active).toBe(false);
});
