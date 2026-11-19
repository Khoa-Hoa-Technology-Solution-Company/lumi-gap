import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROJECT_TRASH_RETENTION_DAYS } from "@trend/shared-types";

const mocks = vi.hoisted(() => ({
  getPrisma: vi.fn(),
  assertResearchWorkflowAccess: vi.fn(),
  lockProjectAccounts: vi.fn(),
  authorizeProjectTransaction: vi.fn(),
  assertActiveProjectAccount: vi.fn(),
  purgeProjectRecord: vi.fn(),
  emitManuscriptEvent: vi.fn(),
  activityList: vi.fn(),
}));

vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: mocks.getPrisma }));
vi.mock("../../authorization/research-access.service.js", () => ({ assertResearchWorkflowAccess: mocks.assertResearchWorkflowAccess }));
vi.mock("../project-transaction.js", () => ({
  lockProjectAccounts: mocks.lockProjectAccounts,
  authorizeProjectTransaction: mocks.authorizeProjectTransaction,
  assertActiveProjectAccount: mocks.assertActiveProjectAccount,
}));
vi.mock("../project-purge.js", () => ({ purgeProjectRecord: mocks.purgeProjectRecord }));
vi.mock("../../workspaces/manuscript-events.js", () => ({ manuscriptEvents: { emit: mocks.emitManuscriptEvent } }));
vi.mock("../project-activity.service.js", () => ({ projectActivityService: { list: mocks.activityList } }));

import { projectService } from "../project.service.js";
import { assertProjectActionAllowed } from "../project-workspace.rules.js";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const PAPER_ID = "44444444-4444-4444-8444-444444444444";

function makeProjectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PROJECT_ID,
    legacyMongoId: null,
    title: "Clinical NLP Review",
    description: "Systematic literature review on clinical NLP",
    researchField: "Computer Science",
    researchAreas: ["Computer Science", "NLP"],
    publicSummary: null,
    mentorshipDiscovery: "SEEKING_MENTOR",
    version: 3,
    screeningMode: "INDEPENDENT",
    screeningBlinded: true,
    inclusionCriteria: ["Peer-reviewed"],
    exclusionCriteria: ["Non-English"],
    status: "ACTIVE",
    visibility: "PRIVATE",
    exportPolicy: "ALL_MEMBERS",
    aiDataPolicy: "PLATFORM_AI_ONLY",
    externalLookupPolicy: "ALLOW_PUBLIC_INDEX",
    ownerId: OWNER_ID,
    createdById: OWNER_ID,
    archivedAt: null,
    deletedAt: null,
    deletedById: null,
    purgeAt: null,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-10T00:00:00.000Z"),
    ...overrides,
  };
}

describe("project lifecycle service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertResearchWorkflowAccess.mockResolvedValue(undefined);
    mocks.lockProjectAccounts.mockResolvedValue(undefined);
    mocks.assertActiveProjectAccount.mockResolvedValue(undefined);
    mocks.purgeProjectRecord.mockResolvedValue(undefined);
    mocks.activityList.mockResolvedValue([
      { id: "act-1", projectId: PROJECT_ID, type: "PAPER_ADDED", metadata: {}, createdAt: "2026-10-05T00:00:00.000Z" },
    ]);
  });

  function buildDb(initialProject: ReturnType<typeof makeProjectRow>) {
    let projectState = { ...initialProject };
    const activities: Array<Record<string, unknown>> = [];
    const auditLogs: Array<Record<string, unknown>> = [];

    const tx = {
      project: {
        findUnique: vi.fn(async () => ({ ...projectState })),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          projectState = {
            ...projectState,
            ...data,
            version: projectState.version + 1,
          };
          return { ...projectState };
        }),
      },
      projectInvitation: { updateMany: vi.fn(async () => ({ count: 1 })) },
      projectActivity: {
        create: vi.fn(async (arg: { data: Record<string, unknown> }) => {
          activities.push(arg.data);
          return arg.data;
        }),
        findFirst: vi.fn(async () => ({ metadata: { previousStatus: "ACTIVE" } })),
      },
      auditLog: {
        create: vi.fn(async (arg: { data: Record<string, unknown> }) => {
          auditLogs.push(arg.data);
          return arg.data;
        }),
      },
    };

    const db = {
      project: {
        findUnique: vi.fn(async () => ({ ...projectState })),
        findMany: vi.fn(async () => (projectState.deletedAt ? [{ ...projectState }] : [])),
        count: vi.fn(async () => 0),
      },
      user: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          legacyMongoId: null,
          fullName: where.id === OWNER_ID ? "Project Owner" : "Project Member",
          email: where.id === OWNER_ID ? "owner@example.com" : "member@example.com",
          avatarUrl: null,
        })),
        findMany: vi.fn(async () => [
          { id: OWNER_ID, legacyMongoId: null, fullName: "Project Owner", email: "owner@example.com", avatarUrl: null },
          { id: MEMBER_ID, legacyMongoId: null, fullName: "Project Member", email: "member@example.com", avatarUrl: null },
        ]),
      },
      projectMember: {
        findMany: vi.fn(async () => [
          { projectId: PROJECT_ID, userId: OWNER_ID, role: "OWNER", status: "ACTIVE", joinedAt: new Date("2026-10-01T00:00:00.000Z") },
          { projectId: PROJECT_ID, userId: MEMBER_ID, role: "MEMBER", status: "ACTIVE", joinedAt: new Date("2026-10-02T00:00:00.000Z") },
        ]),
        groupBy: vi.fn(async () => [{ projectId: PROJECT_ID, _count: 2 }]),
      },
      projectPaper: {
        findMany: vi.fn(async () => [
          {
            id: "pp-1",
            projectId: PROJECT_ID,
            paperId: PAPER_ID,
            addedById: OWNER_ID,
            screenedById: OWNER_ID,
            screeningStatus: "INCLUDED",
            readingStatus: "REVIEWED",
            inclusionReason: "Matches PICO",
            exclusionReason: null,
            exclusionNote: null,
            screenedAt: new Date("2026-10-03T00:00:00.000Z"),
            notes: "Key study",
            createdAt: new Date("2026-10-02T00:00:00.000Z"),
            updatedAt: new Date("2026-10-03T00:00:00.000Z"),
          },
        ]),
        groupBy: vi.fn(async () => [{ projectId: PROJECT_ID, _count: 1 }]),
        count: vi.fn(async () => 1),
      },
      paper: {
        findMany: vi.fn(async () => [
          {
            id: PAPER_ID,
            legacyMongoId: null,
            title: "Benchmarks for Clinical NLP",
            publicationYear: 2025,
            abstractText: "Abstract text",
            doi: "10.1000/nlp",
            journalName: "JAMIA",
            aiAnalysis: null,
          },
        ]),
      },
      paperAuthor: { findMany: vi.fn(async () => [{ paperId: PAPER_ID, displayName: "A. Researcher" }]) },
      researchGap: { findMany: vi.fn(async () => []) },
      gapEvidenceRecord: { findMany: vi.fn(async () => []) },
      researchPlan: { findUnique: vi.fn(async () => ({ projectId: PROJECT_ID, approach: "LITERATURE_REVIEW" })), findMany: vi.fn(async () => []) },
      projectInvitation: { findMany: vi.fn(async () => []) },
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };

    mocks.getPrisma.mockReturnValue(db);
    mocks.authorizeProjectTransaction.mockImplementation(async (_tx: unknown, _projectId: string, actorId: string, action?: string) => {
      if (projectState.deletedAt) throw Object.assign(new Error("Project not found"), { statusCode: 404 });
      const role = actorId === projectState.ownerId ? "OWNER" : "MEMBER";
      if (action) assertProjectActionAllowed(role, projectState.status, action as never);
      return { project: projectState, role };
    });

    return { db, tx, activities, auditLogs, getState: () => projectState };
  }

  it("soft-deletes into 30-day trash, blocks normal access, and preserves papers, members, reviews, and history on restore", async () => {
    const { activities, auditLogs, getState } = buildDb(makeProjectRow());

    const result = await projectService.deleteProject(PROJECT_ID, OWNER_ID);
    expect(result.softDeleted).toBe(true);
    expect(result.retentionDays).toBe(PROJECT_TRASH_RETENTION_DAYS);
    expect(getState().deletedAt).toBeInstanceOf(Date);
    expect(getState().purgeAt).toBeInstanceOf(Date);
    expect(activities.some(a => a.type === "PROJECT_SOFT_DELETED")).toBe(true);
    expect(auditLogs.some(a => a.actionName === "PROJECT_SOFT_DELETED")).toBe(true);
    expect(mocks.purgeProjectRecord).not.toHaveBeenCalled();
    expect(mocks.emitManuscriptEvent).toHaveBeenCalledWith("member-revoked", { projectId: PROJECT_ID, userId: MEMBER_ID });

    await expect(projectService.getProjectById(PROJECT_ID, OWNER_ID)).rejects.toMatchObject({ statusCode: 404 });
    await expect(projectService.getPublicProjectById(PROJECT_ID)).rejects.toMatchObject({ statusCode: 404 });

    const trashed = await projectService.listTrashedProjects(OWNER_ID);
    expect(trashed).toHaveLength(1);
    expect(trashed[0]).toMatchObject({ _id: PROJECT_ID, memberCount: 2, paperCount: 1, expired: false });
    expect(trashed[0]!.daysRemaining).toBe(PROJECT_TRASH_RETENTION_DAYS);

    await expect(projectService.permanentDeleteProject(PROJECT_ID, OWNER_ID)).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.purgeProjectRecord).not.toHaveBeenCalled();

    const restored = await projectService.restoreProject(PROJECT_ID, OWNER_ID);
    expect(getState().deletedAt).toBeNull();
    expect(getState().purgeAt).toBeNull();
    expect(restored.status).toBe("ACTIVE");
    expect(restored.members).toHaveLength(2);
    expect(restored.papers).toHaveLength(1);
    expect(restored.papers[0]!.screeningStatus).toBe("INCLUDED");
    expect(restored.papers[0]!.notes).toBe("Key study");
    expect(restored.recentActivity).toHaveLength(1);
  });

  it("restricts archive, soft delete, restore, and permanent delete strictly to the owner", async () => {
    const { db } = buildDb(makeProjectRow());

    await expect(projectService.archiveProject(PROJECT_ID, MEMBER_ID)).rejects.toMatchObject({ statusCode: 403 });
    await expect(projectService.deleteProject(PROJECT_ID, MEMBER_ID)).rejects.toMatchObject({ statusCode: 403 });

    buildDb(makeProjectRow({ deletedAt: new Date("2026-10-01T00:00:00.000Z"), purgeAt: new Date("2026-10-31T00:00:00.000Z") }));
    await expect(projectService.restoreProject(PROJECT_ID, MEMBER_ID)).rejects.toMatchObject({ statusCode: 403 });
    await expect(projectService.permanentDeleteProject(PROJECT_ID, MEMBER_ID)).rejects.toMatchObject({ statusCode: 403 });

    expect(db).toBeDefined();
  });

  it("excludes trashed projects from active user project directory queries", async () => {
    const { db } = buildDb(makeProjectRow());
    await projectService.getProjectsPageByUser(OWNER_ID);
    expect(db.project.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ deletedAt: null }),
    }));
  });

  it("allows permanent deletion only after the 30-day retention period expires", async () => {
    const expiredDeletedAt = new Date(Date.now() - 31 * 86_400_000);
    const expiredPurgeAt = new Date(Date.now() - 86_400_000);
    buildDb(makeProjectRow({ deletedAt: expiredDeletedAt, purgeAt: expiredPurgeAt }));

    await expect(projectService.restoreProject(PROJECT_ID, OWNER_ID)).rejects.toMatchObject({ statusCode: 410 });
    const result = await projectService.permanentDeleteProject(PROJECT_ID, OWNER_ID);
    expect(result).toEqual({ deleted: true, permanentlyDeleted: true });
    expect(mocks.purgeProjectRecord).toHaveBeenCalledWith(
      expect.anything(),
      PROJECT_ID,
      OWNER_ID,
      expect.objectContaining({ trigger: "OWNER_MANUAL_AFTER_RETENTION" }),
    );
  });

  it("archives and restores archived projects back to their prior status", async () => {
    const { getState } = buildDb(makeProjectRow({ status: "ACTIVE" }));
    const archived = await projectService.archiveProject(PROJECT_ID, OWNER_ID);
    expect(archived.status).toBe("ARCHIVED");
    expect(getState().archivedAt).toBeInstanceOf(Date);

    const restored = await projectService.restoreProject(PROJECT_ID, OWNER_ID);
    expect(restored.status).toBe("ACTIVE");
    expect(getState().archivedAt).toBeNull();
  });

  it("auto-purges expired trashed projects in worker maintenance", async () => {
    const expiredDeletedAt = new Date(Date.now() - 31 * 86_400_000);
    const expiredPurgeAt = new Date(Date.now() - 86_400_000);
    buildDb(makeProjectRow({ deletedAt: expiredDeletedAt, purgeAt: expiredPurgeAt }));

    const purged = await projectService.purgeExpiredTrashedProjects();
    expect(purged).toBe(1);
    expect(mocks.purgeProjectRecord).toHaveBeenCalledWith(
      expect.anything(),
      PROJECT_ID,
      OWNER_ID,
      expect.objectContaining({ trigger: "RETENTION_WORKER_AUTO_PURGE" }),
    );
  });
});
