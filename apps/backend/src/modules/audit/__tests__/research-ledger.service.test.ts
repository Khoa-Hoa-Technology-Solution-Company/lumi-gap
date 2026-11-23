import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyAuditEvent, researchLedgerService } from "../research-ledger.service.js";
import { auditEventsQuerySchema, securityOverviewQuerySchema } from "../../projects/project.controller.js";

const dbMocks = vi.hoisted(() => ({
  projectFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  projectMemberFindUnique: vi.fn(),
  projectMemberCount: vi.fn(),
  mentorRelationshipCount: vi.fn(),
  eventCount: vi.fn(),
  eventFindFirst: vi.fn(),
  eventFindMany: vi.fn(),
}));

vi.mock("../../../infrastructure/database/prisma.js", () => ({
  getPrisma: () => ({
    project: { findUnique: dbMocks.projectFindUnique },
    user: { findUnique: dbMocks.userFindUnique, findMany: dbMocks.userFindMany },
    projectMember: { findUnique: dbMocks.projectMemberFindUnique, count: dbMocks.projectMemberCount },
    mentorRelationship: { count: dbMocks.mentorRelationshipCount },
    researchEvidenceEvent: {
      count: dbMocks.eventCount,
      findFirst: dbMocks.eventFindFirst,
      findMany: dbMocks.eventFindMany,
    },
  }),
}));

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const MEMBER_ID = "33333333-3333-4333-8333-333333333333";
const OUTSIDER_ID = "44444444-4444-4444-8444-444444444444";

describe("researchLedgerService audit pagination, filtering & authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dbMocks.projectFindUnique.mockResolvedValue({
      id: PROJECT_ID,
      ownerId: OWNER_ID,
      status: "ACTIVE",
      visibility: "PRIVATE",
      exportPolicy: "ALL_MEMBERS",
      aiDataPolicy: "ALLOW_PERSONAL_AI",
      externalLookupPolicy: "ALLOW_PUBLIC_INDEX",
      deletedAt: null,
    });
    dbMocks.userFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      isActive: true,
      accountStatus: "ACTIVE",
      systemRole: "USER",
    }));
    dbMocks.projectMemberCount.mockResolvedValue(2);
    dbMocks.mentorRelationshipCount.mockResolvedValue(1);
    dbMocks.userFindMany.mockResolvedValue([{ id: OWNER_ID, fullName: "Owner Researcher" }]);
  });

  it("classifies real event types into the 5 user-facing audit categories", () => {
    expect(classifyAuditEvent("OWNERSHIP_TRANSFERRED")).toBe("MEMBERSHIP");
    expect(classifyAuditEvent("MEMBER_JOINED")).toBe("MEMBERSHIP");
    expect(classifyAuditEvent("MANUSCRIPT_SOFT_DELETED")).toBe("MANUSCRIPT");
    expect(classifyAuditEvent("MANUSCRIPT_SNAPSHOT_SAVED")).toBe("MANUSCRIPT");
    expect(classifyAuditEvent("MANUSCRIPT_PDF_DOWNLOADED")).toBe("ACCESS_EXPORT");
    expect(classifyAuditEvent("SUBMISSION_REVISION_DOWNLOADED")).toBe("ACCESS_EXPORT");
    expect(classifyAuditEvent("PROJECT_VISIBILITY_CHANGED")).toBe("SETTINGS_PRIVACY");
    expect(classifyAuditEvent("PROJECT_SECURITY_POLICY_CHANGED")).toBe("SETTINGS_PRIVACY");
    expect(classifyAuditEvent("INTEGRITY_CASE_OPENED")).toBe("INTEGRITY_SECURITY");
    expect(classifyAuditEvent("PROJECT_LEAK_CONTAINMENT_APPLIED")).toBe("INTEGRITY_SECURITY");
  });

  it("supports lightweight overview summary with limit=0 without loading event rows", async () => {
    dbMocks.projectMemberFindUnique.mockResolvedValue({ status: "ACTIVE" });
    dbMocks.eventCount.mockResolvedValue(139);
    dbMocks.eventFindFirst.mockResolvedValue({ createdAt: new Date("2026-11-22T15:22:13.000Z") });

    const overview = await researchLedgerService.getProjectSecurityOverview(PROJECT_ID, OWNER_ID, 0);

    expect(overview.totalEventCount).toBe(139);
    expect(overview.latestEventAt).toBe("2026-11-22T15:22:13.000Z");
    expect(overview.recentEvents).toEqual([]);
    expect(dbMocks.eventFindMany).not.toHaveBeenCalled();
  });

  it("blocks non-members and deleted projects from reading audit events", async () => {
    dbMocks.projectMemberFindUnique.mockResolvedValue(null);
    await expect(
      researchLedgerService.listProjectAuditEvents(PROJECT_ID, OUTSIDER_ID, {}),
    ).rejects.toMatchObject({ statusCode: 404 });

    dbMocks.projectFindUnique.mockResolvedValueOnce({
      id: PROJECT_ID,
      ownerId: OWNER_ID,
      deletedAt: new Date(),
    });
    await expect(
      researchLedgerService.listProjectAuditEvents(PROJECT_ID, OWNER_ID, {}),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("restricts OWNER_ADMIN visibility events from regular members while sanitizing metadata", async () => {
    dbMocks.projectMemberFindUnique.mockResolvedValue({ status: "ACTIVE" });
    dbMocks.eventCount.mockResolvedValue(1);
    dbMocks.eventFindMany.mockResolvedValue([
      {
        id: "evt-1",
        eventType: "MANUSCRIPT_PDF_DOWNLOADED",
        actorId: OWNER_ID,
        resourceKind: "MANUSCRIPT_COMPILATION",
        resourceId: "comp-1",
        artifactVersion: "3",
        checksumSha256: "a".repeat(64),
        reason: null,
        visibility: "PROJECT_TEAM",
        createdAt: new Date("2026-11-22T15:22:13.000Z"),
        metadata: {
          byteSize: 70450,
          manuscriptId: "ms-1",
          apiKey: "secret-should-be-stripped",
          latexSource: "\\documentclass{article}",
          token: "bearer-xyz",
        },
      },
    ]);

    const page = await researchLedgerService.listProjectAuditEvents(PROJECT_ID, MEMBER_ID, {
      page: 1,
      pageSize: 20,
      category: "ACCESS_EXPORT",
      from: "2026-11-01",
      to: "2026-11-23",
    });

    const countWhere = dbMocks.eventCount.mock.calls[0]?.[0]?.where;
    expect(countWhere.visibility.in).toEqual(["PROJECT_TEAM", "CONTRIBUTOR_SCOPED"]);
    expect(countWhere.eventType.in).toContain("MANUSCRIPT_PDF_DOWNLOADED");
    expect(countWhere.createdAt.gte).toEqual(new Date("2026-11-01T00:00:00.000Z"));
    expect(countWhere.createdAt.lte).toEqual(new Date("2026-11-23T23:59:59.999Z"));

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.category).toBe("ACCESS_EXPORT");
    expect(page.items[0]?.metadata).toEqual({ byteSize: 70450, manuscriptId: "ms-1" });
    expect(page.meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1, hasNext: false });
  });

  it("includes OWNER_ADMIN events and actor name search for project owners", async () => {
    dbMocks.projectMemberFindUnique.mockResolvedValue({ status: "ACTIVE" });
    dbMocks.userFindMany
      .mockResolvedValueOnce([{ id: OWNER_ID }])
      .mockResolvedValueOnce([{ id: OWNER_ID, fullName: "Owner Researcher" }]);
    dbMocks.eventCount.mockResolvedValue(25);
    dbMocks.eventFindMany.mockResolvedValue([]);

    const page = await researchLedgerService.listProjectAuditEvents(PROJECT_ID, OWNER_ID, {
      page: 2,
      pageSize: 10,
      q: "Owner",
    });

    const queryCall = dbMocks.eventFindMany.mock.calls[0]?.[0];
    expect(queryCall.where.visibility.in).toEqual(["PROJECT_TEAM", "OWNER_ADMIN", "CONTRIBUTOR_SCOPED"]);
    expect(queryCall.where.OR).toEqual(expect.arrayContaining([{ actorId: { in: [OWNER_ID] } }]));
    expect(queryCall.skip).toBe(10);
    expect(queryCall.take).toBe(10);
    expect(page.meta).toEqual({ page: 2, pageSize: 10, total: 25, totalPages: 3, hasNext: true });
  });

  it("validates query schemas strictly", () => {
    expect(securityOverviewQuerySchema.parse({ limit: "0" })).toEqual({ limit: 0 });
    expect(() => securityOverviewQuerySchema.parse({ limit: "-1" })).toThrow();
    expect(auditEventsQuerySchema.parse({ page: "2", pageSize: "20", category: "MEMBERSHIP" })).toEqual({
      page: 2,
      pageSize: 20,
      category: "MEMBERSHIP",
    });
    expect(() => auditEventsQuerySchema.parse({ category: "INVALID" })).toThrow();
    expect(() => auditEventsQuerySchema.parse({ pageSize: "500" })).toThrow();
  });
});
