import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildManuscriptGovernance, loadManuscriptGovernanceMap } from "../manuscript-governance.js";

const workspaceMocks = vi.hoisted(() => ({
  withWorkspace: vi.fn(),
  workspacePeople: vi.fn(),
  workspaceEvent: vi.fn(),
  workspaceRevision: vi.fn(),
  notify: vi.fn(),
}));
const ledgerMocks = vi.hoisted(() => ({ record: vi.fn() }));
const projectSocketMocks = vi.hoisted(() => ({ emitToProject: vi.fn() }));

vi.mock("../../projects/workspace-access.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../projects/workspace-access.js")>();
  return {
    ...original,
    withWorkspace: (...args: unknown[]) => workspaceMocks.withWorkspace(...args),
    workspacePeople: (...args: unknown[]) => workspaceMocks.workspacePeople(...args),
    workspaceEvent: (...args: unknown[]) => workspaceMocks.workspaceEvent(...args),
    workspaceRevision: (...args: unknown[]) => workspaceMocks.workspaceRevision(...args),
  };
});
vi.mock("../../audit/research-ledger.service.js", () => ({
  assertCanExportProjectSource: vi.fn(),
  researchLedgerService: ledgerMocks,
}));
vi.mock("../manuscript-compiler.js", () => ({ status: vi.fn(async () => ({ available: false, reason: "UNCONFIGURED" })) }));
vi.mock("../../../realtime/project-socket.js", () => ({ projectSocket: projectSocketMocks }));
vi.mock("../manuscript-attribution.service.js", () => ({ assertVerifiedAttributionForPublish: vi.fn() }));

import { manuscriptService } from "../manuscript.service.js";

const OWNER = "10000000-0000-4000-8000-000000000001";
const CREATOR = "10000000-0000-4000-8000-000000000002";
const COAUTHOR = "10000000-0000-4000-8000-000000000003";
const PROJECT_ID = "20000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "30000000-0000-4000-8000-000000000001";

const peopleMap = new Map([
  [OWNER, { id: OWNER, name: "Dr. Owner" }],
  [CREATOR, { id: CREATOR, name: "Student Creator" }],
  [COAUTHOR, { id: COAUTHOR, name: "Co-Author" }],
]);

function makeSignals(overrides: Partial<Parameters<typeof buildManuscriptGovernance>[4]> = {}) {
  return {
    contributorIds: new Set([CREATOR]),
    snapshotCount: 0,
    submissionIds: new Set<string>(),
    reviewThreadCount: 0,
    reviewRequestCount: 0,
    attributionCheckCount: 0,
    commentCount: 0,
    remoteBinding: null,
    ...overrides,
  };
}

function makeDraftRow(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-11-14T10:00:00.000Z");
  return {
    id: WORKSPACE_ID,
    legacyMongoId: null,
    projectId: PROJECT_ID,
    name: "Collaborative Paper",
    createdById: CREATOR,
    createdAt: now,
    updatedAt: now,
    writingMode: "LATEX",
    compilerEngine: "pdflatex",
    compilerRelease: "2022",
    compilerRevision: 1,
    documentType: "RESEARCH_PAPER",
    template: "ARTICLE",
    description: "Draft description",
    version: 3,
    mainFileId: null,
    archivedAt: null as Date | null,
    deletedAt: null as Date | null,
    clientKey: null,
    researchLink: null,
    ...overrides,
  };
}

function createFakeTx(overrides: Record<string, unknown> = {}) {
  return {
    draftWorkspace: {
      findFirst: vi.fn(),
      findMany: vi.fn(async () => []),
      update: vi.fn(),
      count: vi.fn(async () => 1),
    },
    projectMember: { findMany: vi.fn(async () => []) },
    projectDiscussion: { findMany: vi.fn(async () => []) },
    projectTeamMessage: { findMany: vi.fn(async () => []) },
    manuscriptFile: { findMany: vi.fn(async () => []) },
    manuscriptSnapshot: { findMany: vi.fn(async () => []) },
    manuscriptSuggestion: { findMany: vi.fn(async () => []) },
    manuscriptAttributionCheck: { findMany: vi.fn(async () => []) },
    manuscriptAttributionDecision: { findMany: vi.fn(async () => []) },
    manuscriptRemoteBinding: { findMany: vi.fn(async () => []) },
    manuscriptUpdate: { findMany: vi.fn(async () => []) },
    submissionRevision: { findMany: vi.fn(async () => []) },
    submissionAuthor: { findMany: vi.fn(async () => []) },
    reviewRequest: { findMany: vi.fn(async () => []) },
    ...overrides,
  };
}

describe("manuscript governance and deletion protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceMocks.workspacePeople.mockResolvedValue(peopleMap);
  });

  it("allows creator or owner to soft delete and restore an unshared personal draft, while blocking other members", () => {
    const draft = { id: WORKSPACE_ID, createdById: CREATOR, archivedAt: null, deletedAt: null };
    const signals = makeSignals();

    const forCreator = buildManuscriptGovernance(draft, "ACTIVE", CREATOR, "MEMBER", signals, peopleMap);
    expect(forCreator.canDelete).toBe(true);
    expect(forCreator.governance.ownershipScope).toBe("PERSONAL_DRAFT");
    expect(forCreator.governance.canArchive).toBe(true);
    expect(forCreator.governance.approvalStatus).toBe("NOT_APPLICABLE");

    const forOwner = buildManuscriptGovernance(draft, "ACTIVE", OWNER, "OWNER", signals, peopleMap);
    expect(forOwner.canDelete).toBe(true);

    const forOtherMember = buildManuscriptGovernance(draft, "ACTIVE", COAUTHOR, "MEMBER", signals, peopleMap);
    expect(forOtherMember.canDelete).toBe(false);
    expect(forOtherMember.governance.canArchive).toBe(false);
    expect(forOtherMember.governance.deleteBlockedReason).toBe("NOT_CREATOR_OR_OWNER");

    const deletedDraft = { ...draft, deletedAt: new Date("2026-11-14T11:00:00.000Z") };
    expect(buildManuscriptGovernance(deletedDraft, "ACTIVE", CREATOR, "MEMBER", signals, peopleMap).governance.canRestore).toBe(true);
    expect(buildManuscriptGovernance(deletedDraft, "ACTIVE", COAUTHOR, "MEMBER", signals, peopleMap).governance.canRestore).toBe(false);
  });

  it("blocks unilateral deletion on collaborative manuscripts and limits archiving to owner", () => {
    const draft = { id: WORKSPACE_ID, createdById: CREATOR, archivedAt: null, deletedAt: null };
    const signals = makeSignals({
      contributorIds: new Set([CREATOR, COAUTHOR]),
      snapshotCount: 2,
      commentCount: 3,
      remoteBinding: { provider: "GITHUB", repository: "lab/paper-repo", branch: "main" },
    });

    const forOwner = buildManuscriptGovernance(draft, "ACTIVE", OWNER, "OWNER", signals, peopleMap);
    expect(forOwner.canDelete).toBe(false);
    expect(forOwner.governance.ownershipScope).toBe("COLLABORATIVE");
    expect(forOwner.governance.requiresCoAuthorApprovalForDelete).toBe(true);
    expect(forOwner.governance.approvalStatus).toBe("REQUIRES_COAUTHOR_APPROVAL");
    expect(forOwner.governance.deleteBlockedReason).toBe("COLLABORATIVE_MANUSCRIPT");
    expect(forOwner.governance.canArchive).toBe(true);
    expect(forOwner.governance.remoteBinding).toEqual({ provider: "GITHUB", repository: "lab/paper-repo", branch: "main" });

    const forCreatorMember = buildManuscriptGovernance(draft, "ACTIVE", CREATOR, "MEMBER", signals, peopleMap);
    expect(forCreatorMember.canDelete).toBe(false);
    expect(forCreatorMember.governance.canArchive).toBe(false);

    const archivedDraft = { ...draft, archivedAt: new Date("2026-11-14T11:30:00.000Z") };
    expect(buildManuscriptGovernance(archivedDraft, "ACTIVE", OWNER, "OWNER", signals, peopleMap).governance.canUnarchive).toBe(true);
    expect(buildManuscriptGovernance(archivedDraft, "ACTIVE", CREATOR, "MEMBER", signals, peopleMap).governance.canUnarchive).toBe(false);
  });

  it("marks submitted or reviewed manuscripts as protected academic records regardless of collaborator count", async () => {
    const draft = makeDraftRow({ createdById: OWNER });
    const tx = createFakeTx({
      manuscriptSnapshot: { findMany: vi.fn(async () => [{ id: "snap-1", workspaceId: WORKSPACE_ID, createdById: OWNER }]) },
      submissionRevision: { findMany: vi.fn(async () => [{ id: "rev-1", manuscriptSnapshotId: "snap-1", submissionId: "sub-1", uploadedById: OWNER }]) },
      manuscriptRemoteBinding: { findMany: vi.fn(async () => [{ workspaceId: WORKSPACE_ID, repository: "lab/submitted", branch: "main" }]) },
    });

    const map = await loadManuscriptGovernanceMap(tx as never, { id: PROJECT_ID, status: "ACTIVE" }, OWNER, "OWNER", [draft]);
    const evaluated = map.get(WORKSPACE_ID)!;
    expect(evaluated.canDelete).toBe(false);
    expect(evaluated.governance.hasReviewsOrSubmissions).toBe(true);
    expect(evaluated.governance.deleteBlockedReason).toBe("HAS_SUBMISSIONS_OR_REVIEWS");
    expect(evaluated.governance.approvalStatus).toBe("PROTECTED_RECORD");
    expect(evaluated.governance.canArchive).toBe(true);
    expect(evaluated.governance.remoteBinding?.repository).toBe("lab/submitted");
  });

  it("enforces soft delete, restore, archive, unarchive, version checks, and audit logging in manuscriptService", async () => {
    const row = makeDraftRow();
    const tx = createFakeTx({
      draftWorkspace: {
        findFirst: vi.fn(async () => row),
        update: vi.fn(async ({ data }: { data: { archivedAt?: Date | null; deletedAt?: Date | null } }) => ({
          ...row,
          archivedAt: data.archivedAt !== undefined ? data.archivedAt : row.archivedAt,
          deletedAt: data.deletedAt !== undefined ? data.deletedAt : row.deletedAt,
          version: row.version + 1,
        })),
        count: vi.fn(async () => 1),
      },
    });
    workspaceMocks.withWorkspace.mockImplementation(async (_p: string, actorId: string, _opts: unknown, cb: (ctx: unknown) => Promise<unknown>) =>
      cb({ tx, project: { id: PROJECT_ID, ownerId: OWNER, status: "ACTIVE" }, actorId, role: actorId === OWNER ? "OWNER" : "MEMBER" }),
    );

    // Non-creator member cannot soft-delete someone else's personal draft.
    await expect(manuscriptService.remove(PROJECT_ID, COAUTHOR, WORKSPACE_ID, 3)).rejects.toMatchObject({ statusCode: 403 });

    // Version conflict returns 409.
    await expect(manuscriptService.remove(PROJECT_ID, CREATOR, WORKSPACE_ID, 2)).rejects.toMatchObject({ statusCode: 409 });

    // Creator soft-deletes personal draft and records revision + event + ledger.
    await expect(manuscriptService.remove(PROJECT_ID, CREATOR, WORKSPACE_ID, 3, "Duplicate draft")).resolves.toEqual({ id: WORKSPACE_ID });
    expect(workspaceMocks.workspaceEvent).toHaveBeenCalledWith(
      expect.anything(),
      "MANUSCRIPT_DELETED",
      "MANUSCRIPT",
      WORKSPACE_ID,
      expect.objectContaining({ version: 4, ownershipScope: "PERSONAL_DRAFT", reason: "Duplicate draft" }),
    );
    expect(ledgerMocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "MANUSCRIPT_SOFT_DELETED", resourceId: WORKSPACE_ID, reason: "Duplicate draft" }),
    );

    // Collaborative manuscript blocks Owner direct delete with 409 and Member delete/archive with 403.
    tx.manuscriptSuggestion.findMany.mockResolvedValueOnce([{ workspaceId: WORKSPACE_ID, authorId: COAUTHOR }]);
    await expect(manuscriptService.remove(PROJECT_ID, OWNER, WORKSPACE_ID, 3)).rejects.toMatchObject({ statusCode: 409 });

    tx.manuscriptSuggestion.findMany.mockResolvedValue([{ workspaceId: WORKSPACE_ID, authorId: COAUTHOR }]);
    await expect(manuscriptService.remove(PROJECT_ID, CREATOR, WORKSPACE_ID, 3)).rejects.toMatchObject({ statusCode: 403 });
    await expect(manuscriptService.setArchived(PROJECT_ID, CREATOR, WORKSPACE_ID, 3, true)).rejects.toMatchObject({ statusCode: 403 });

    // Owner archives collaborative manuscript safely without touching GitHub bindings.
    const archived = await manuscriptService.setArchived(PROJECT_ID, OWNER, WORKSPACE_ID, 3, true, "Milestone freeze");
    expect(archived.archived).toBe(true);
    expect(ledgerMocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "MANUSCRIPT_ARCHIVED", resourceId: WORKSPACE_ID, reason: "Milestone freeze" }),
    );

    // Creator restores a soft-deleted personal draft.
    tx.manuscriptSuggestion.findMany.mockResolvedValue([]);
    tx.draftWorkspace.findFirst.mockResolvedValueOnce({ ...row, deletedAt: new Date("2026-11-14T11:00:00.000Z"), version: 4 });
    const restored = await manuscriptService.restoreDeleted(PROJECT_ID, CREATOR, WORKSPACE_ID, 4, "Need draft again");
    expect(restored.deletedAt).toBeNull();
    expect(ledgerMocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "MANUSCRIPT_RESTORED_FROM_TRASH", resourceId: WORKSPACE_ID, reason: "Need draft again" }),
    );
  });
});
