import { expect, it, vi } from "vitest";
import { rankedCandidates } from "../screening-case-context.js";
const mocks = vi.hoisted(() => ({ pool: vi.fn() }));
vi.mock("../screening-adjudication-context.js", () => ({ screeningAdjudicators: mocks.pool, adjudicationPacket: vi.fn() }));
function context(roles: string[]) {
  mocks.pool.mockResolvedValue([{ id: "a", name: "An", mentor: true }, { id: "b", name: "Binh", mentor: true }]);
  return { project: { id: "project", ownerId: "owner" }, tx: { screeningAdjudicationInvitation: { findMany: async () => [] }, mentorAccess: { findMany: async () => [{ mentorUserId: "a", requestId: "qa" }, { mentorUserId: "b", requestId: "qb" }] }, mentorRelationship: { findMany: async () => roles.map((mentorRole, i) => ({ mentorUserId: i ? "b" : "a", mentorRole })) } } } as any;
}
it("ranks by the current consented relationship role rather than rewriting the original invitation", async () => {
  const result = await rankedCandidates(context(["SECONDARY", "PRIMARY"]), { settings: {} } as any, { id: "case" } as any);
  expect(result.map(r => r.id)).toEqual(["b"]); expect(result[0]!.role).toBe("PRIMARY_MENTOR");
});
it("labels unassigned mentors without assuming either is primary or secondary", async () => {
  const result = await rankedCandidates(context(["UNASSIGNED", "UNASSIGNED"]), { settings: {} } as any, { id: "case" } as any);
  expect(result.map(r => r.role)).toEqual(["MENTOR", "MENTOR"]);
});
