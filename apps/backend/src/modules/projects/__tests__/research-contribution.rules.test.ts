import { describe, expect, it } from "vitest";
import { creditRoles } from "@trend/shared-types";
import { activityCategory, meaningfulActivity, suggestedCreditRoles } from "../research-contribution.rules.js";
import { researchContributionsQuerySchema, activitySchema, contributionFieldsSchema } from "../dto/project-contributions.schema.js";

describe("evidence-based contribution rules", () => {
  it("supports the fourteen CRediT roles without equating them with authorship", () => expect(new Set(creditRoles).size).toBe(14));
  it.each(["MEMBER_JOINED", "MENTORSHIP_ACCEPTED", "PAGE_VIEW", "LOGIN", "MANUSCRIPT_AUTOSAVED", "REVIEW_REQUESTED"])("excludes non-contribution %s", type => expect(Object.values(meaningfulActivity).flat()).not.toContain(type));
  it.each(["TASK_CREATED", "TASK_COMPLETED", "MANUSCRIPT_SNAPSHOT_CREATED", "MENTORSHIP_ACCEPTED", "MANUSCRIPT_WRITING_SESSION"])("does not assign a role from %s alone", type => expect(suggestedCreditRoles(type)).toEqual([]));
  it("offers only conservative, unconfirmed suggestions for traceable reviews/extraction", () => {
    expect(suggestedCreditRoles("MENTOR_REVIEW_SUBMITTED")).toEqual(["WRITING_REVIEW_EDITING"]);
    expect(suggestedCreditRoles("EVIDENCE_EXTRACTED")).toEqual(["DATA_CURATION"]);
    expect(activityCategory("SCREENING_PARTICIPATION")).toBe("SCREENING");
  });
  it("rejects percentage inputs, forged provenance, malformed scopes and actor substitution", () => {
    for (const input of [{ pageSize: 1000 }, { scopeKey: "DRAFT:../../private" }, { actorId: crypto.randomUUID() }, { provenance: "SYSTEM_RECORDED" }, { percentage: 99 }]) expect(researchContributionsQuerySchema.safeParse(input).success).toBe(false);
    expect(contributionFieldsSchema.safeParse({ source: "SYSTEM_RECORDED" }).success).toBe(false);
    expect(activitySchema.safeParse({ from: "2026-01-01T00:00:00Z", to: "2026-02-01T00:00:00Z", scopeKey: "SUBMISSION:bad" }).success).toBe(false);
  });
});
