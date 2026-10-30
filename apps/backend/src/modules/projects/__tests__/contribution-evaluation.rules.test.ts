import { describe, expect, it } from "vitest";
import { unresolvedEvaluationObjections as open } from "../contribution-evaluation.rules.js";
import { evaluationDecisionSchema } from "../dto/contribution-evaluation.schema.js";

const revisions = [{ id: "v1", version: 1 }, { id: "v2", version: 2 }, { id: "v3", version: 3 }];
const dispute = { evaluationId: "v1", userId: "a", kind: "CHALLENGE", decision: "DISPUTE", note: "Missing attribution" };
const resolution = { evaluationId: "v2", userId: "a", kind: "RESOLUTION", decision: "APPROVE", note: "Corrected attribution" };
describe("evaluation objection continuity", () => {
  it("carries objections across new versions and ordinary approvals", () => {
    expect(open(revisions, [dispute, { ...resolution, kind: "PARTICIPANT" }])).toEqual([{ userId: "a", evaluationId: "v1", version: 1, note: dispute.note }]);
  });
  it("only removes the resolving user's objection and keeps other objectors", () => {
    expect(open(revisions, [dispute, { ...dispute, userId: "b" }, resolution]).map(o => o.userId)).toEqual(["b"]);
  });
  it("ignores same-version resolutions and lets new disputes reopen the outcome", () => {
    expect(open(revisions, [dispute, { ...resolution, evaluationId: "v1" }])).toHaveLength(1);
    expect(open(revisions, [dispute, resolution])).toEqual([]);
    expect(open(revisions, [dispute, resolution, { ...dispute, evaluationId: "v2" }])[0]?.version).toBe(2);
  });
  it("does not depend on revision/decision array order for dispute precedence", () => {
    const responses = [dispute, resolution, { ...dispute, evaluationId: "v2" }];
    expect(open([...revisions].reverse(), [...responses].reverse())).toEqual(open(revisions, responses));
  });
  it("requires explicit approval and an explanation for a resolution", () => {
    const input = { payloadHash: "a".repeat(64), kind: "RESOLUTION", decision: "APPROVE", note: "The correction restores my work" };
    expect(evaluationDecisionSchema.safeParse(input).success).toBe(true);
    expect(evaluationDecisionSchema.safeParse({ ...input, decision: "DISPUTE" }).success).toBe(false);
    expect(evaluationDecisionSchema.safeParse({ ...input, note: "" }).success).toBe(false);
  });
});
