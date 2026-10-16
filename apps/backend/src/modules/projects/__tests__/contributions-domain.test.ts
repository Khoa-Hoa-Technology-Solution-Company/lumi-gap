import { describe, expect, it } from "vitest";
import { assertAllocationShares } from "../allocation.service.js";
import { activityDay } from "../contribution-activity.service.js";
import { activitySchema, allocationDecisionSchema, allocationDraftSchema, contributionReviewSchema, createWorkContributionSchema } from "../dto/project-contributions.schema.js";
const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
describe("contribution governance rules", () => {
  const shares = [{ userId: a, basisPoints: 6000, rationale: "Work delivered" }, { userId: b, basisPoints: 4000, rationale: "Work delivered" }], roster = [{ id: a }, { id: b }];
  it("validates an exact integer total and full roster", () => { expect(() => assertAllocationShares(shares, roster)).not.toThrow(); for (const invalid of [[shares[0]!], [shares[0]!, shares[0]!], [{ ...shares[0]!, basisPoints: 6001 }, shares[1]!], [{ ...shares[0]!, basisPoints: 6000.1 }, shares[1]!], [{ ...shares[0]!, basisPoints: -1 }, shares[1]!]]) expect(() => assertAllocationShares(invalid, roster)).toThrow(); });
  it("requires consent-compatible rationale for zero shares", () => { expect(() => assertAllocationShares([{ ...shares[0]!, basisPoints: 10000 }, { ...shares[1]!, basisPoints: 0, rationale: "" }], roster)).toThrow(/zero/i); expect(() => assertAllocationShares([{ ...shares[0]!, basisPoints: 10000 }, { ...shares[1]!, basisPoints: 0, rationale: "No work in this scope, reviewed with participant" }], roster)).not.toThrow(); });
  it("allows incomplete totals only while drafting", () => { expect(() => assertAllocationShares(shares.map(s => ({ ...s, basisPoints: 0 })), roster, false)).not.toThrow(); });
  it("groups midnight consistently in the specified timezone", () => { const time = new Date("2026-10-13T18:00:00Z"); expect(activityDay(time, "Asia/Ho_Chi_Minh")).toBe("2026-10-14"); expect(activityDay(time, "UTC")).toBe("2026-10-13"); });
  it("rejects forged statuses and reviewer identities", () => {
    expect(allocationDecisionSchema.safeParse({ decision: "APPROVE", userId: b }).success).toBe(false);
    expect(allocationDecisionSchema.safeParse({ decision: "FINALIZED" }).success).toBe(false);
    expect(allocationDraftSchema.safeParse({ shares, rationale: "Owner proposal", clientKey: a, status: "FINALIZED" }).success).toBe(false);
    expect(contributionReviewSchema.safeParse({ expectedVersion: 1, decision: "DISPUTE", note: "" }).success).toBe(false);
  });
  it("validates manual work and all fourteen CRediT roles without requiring fabricated activity", () => { const record = { title: "Offline analysis", description: "Analyzed the experiment results outside the platform", source: "MANUAL", workDate: new Date().toISOString(), participants: [{ userId: a, roles: ["FORMAL_ANALYSIS", "DATA_CURATION"] }], evidence: "Lab notes held by the team", evidenceRefs: [], clientKey: a }; expect(createWorkContributionSchema.safeParse(record).success).toBe(true); expect(createWorkContributionSchema.safeParse({ ...record, actorUserId: b }).success).toBe(false); expect(createWorkContributionSchema.safeParse({ ...record, participants: [...record.participants, ...record.participants] }).success).toBe(false); });
  it("bounds activity queries and validates IANA timezone", () => { const query = { from: "2026-10-01T00:00:00Z", to: "2026-10-14T00:00:00Z", timeZone: "Asia/Ho_Chi_Minh" }; expect(activitySchema.safeParse(query).success).toBe(true); expect(activitySchema.safeParse({ ...query, timeZone: "invalid" }).success).toBe(false); expect(activitySchema.safeParse({ ...query, from: "2024-01-01T00:00:00Z" }).success).toBe(false); expect(activitySchema.safeParse({ ...query, actorUserId: b }).success).toBe(false); });
});
