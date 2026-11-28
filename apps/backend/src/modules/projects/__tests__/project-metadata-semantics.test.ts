import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getPrisma: vi.fn(),
  assertResearchWorkflowAccess: vi.fn(),
  lockProjectAccounts: vi.fn(),
  authorizeProjectTransaction: vi.fn(),
  assertActiveProjectAccount: vi.fn(),
  purgeProjectRecord: vi.fn(),
  emitManuscriptEvent: vi.fn(),
  activityList: vi.fn(),
  replaceProjectClassifications: vi.fn(),
  loadProjectClassifications: vi.fn(),
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
vi.mock("../../research-catalog/research-catalog.service.js", () => ({
  replaceProjectClassifications: mocks.replaceProjectClassifications,
  loadProjectClassifications: mocks.loadProjectClassifications,
}));

import { projectService } from "../project.service.js";
import { createProjectSchema, updateProjectSchema } from "../project.controller.js";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

function makeProjectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PROJECT_ID,
    legacyMongoId: null,
    title: "LumiGap 2",
    description: "Research synthesis with LLMs",
    researchField: "Software Engineering",
    researchAreas: ["Software Engineering"],
    researchKeywords: ["Large Language Models", "Literature Review"],
    publicSummary: null,
    mentorshipDiscovery: "CLOSED",
    version: 1,
    screeningMode: "EXPLORATORY",
    screeningBlinded: false,
    inclusionCriteria: [],
    exclusionCriteria: [],
    status: "PLANNING",
    visibility: "PRIVATE",
    exportPolicy: "ALL_MEMBERS",
    aiDataPolicy: "ALLOW_PERSONAL_AI",
    externalLookupPolicy: "ALLOW_PUBLIC_INDEX",
    ownerId: OWNER_ID,
    createdById: OWNER_ID,
    archivedAt: null,
    deletedAt: null,
    deletedById: null,
    purgeAt: null,
    createdAt: new Date("2026-11-20T00:00:00.000Z"),
    updatedAt: new Date("2026-11-20T00:00:00.000Z"),
    ...overrides,
  };
}

describe("project metadata & keyword semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertResearchWorkflowAccess.mockResolvedValue(undefined);
    mocks.lockProjectAccounts.mockResolvedValue(undefined);
    mocks.assertActiveProjectAccount.mockResolvedValue(undefined);
    mocks.activityList.mockResolvedValue([]);
    mocks.loadProjectClassifications.mockResolvedValue(undefined);
    mocks.replaceProjectClassifications.mockResolvedValue(undefined);
  });

  it("validates create and update schemas for keywords (max 10, max 80 chars, preserves multiword spaces)", () => {
    const validCreate = createProjectSchema.safeParse({
      title: "Systematic Review",
      researchField: "Software Engineering",
      researchAreas: ["Software Engineering", "Artificial Intelligence"],
      keywords: ["Large Language Models", "Literature Review", "Research Gap"],
    });
    expect(validCreate.success).toBe(true);

    const tooLongKeyword = updateProjectSchema.safeParse({
      keywords: ["x".repeat(81)],
    });
    expect(tooLongKeyword.success).toBe(false);

    const tooManyKeywords = updateProjectSchema.safeParse({
      keywords: Array.from({ length: 11 }, (_, i) => `Term ${i + 1}`),
    });
    expect(tooManyKeywords.success).toBe(false);
  });

  it("persists researchKeywords on Project without polluting researchAreas or ResearchPlan.searchStrategy", async () => {
    const createdRow = makeProjectRow({
      researchAreas: ["Software Engineering", "Artificial Intelligence"],
      researchKeywords: ["Large Language Models", "Literature Review", "Research Gap"],
    });
    const projectCreate = vi.fn().mockResolvedValue(createdRow);
    const researchPlanCreate = vi.fn().mockResolvedValue({ id: "plan-1" });
    const tx = {
      project: {
        create: projectCreate,
        findUnique: vi.fn().mockResolvedValue(createdRow),
        findFirst: vi.fn().mockResolvedValue(createdRow),
      },
      projectMember: { create: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) },
      researchPlan: { create: researchPlanCreate, findUnique: vi.fn().mockResolvedValue({ researchApproach: "EXPLORATORY" }) },
      projectActivity: { create: vi.fn().mockResolvedValue({}) },
      projectPaper: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
      projectInvitation: { findMany: vi.fn().mockResolvedValue([]) },
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: OWNER_ID, fullName: "Owner", email: "owner@example.com", avatarUrl: null }),
        findFirst: vi.fn().mockResolvedValue({ id: OWNER_ID, fullName: "Owner", email: "owner@example.com", avatarUrl: null }),
      },
    };
    mocks.getPrisma.mockReturnValue({
      $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      ...tx,
    });

    const result = await projectService.createProject(
      {
        title: "LumiGap 2",
        description: "Research synthesis with LLMs",
        researchField: "Software Engineering",
        researchAreas: ["Software Engineering", "Artificial Intelligence"],
        keywords: ["  Large   Language Models ", "large language models", "Literature Review", "Research Gap"],
        researchApproach: "EXPLORATORY",
      },
      OWNER_ID,
    );

    expect(projectCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          researchField: "Software Engineering",
          researchAreas: ["Software Engineering", "Artificial Intelligence"],
          researchKeywords: ["Large Language Models", "Literature Review", "Research Gap"],
        }),
      }),
    );
    expect(researchPlanCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          searchStrategy: "",
        }),
      }),
    );
    expect(result.keywords).toEqual(["Large Language Models", "Literature Review", "Research Gap"]);
    expect(result.researchAreas).toEqual(["Software Engineering", "Artificial Intelligence"]);
  });

  it("updates researchKeywords and keeps researchField synced to researchAreas[0] without touching ResearchPlan.searchStrategy", async () => {
    const existingRow = makeProjectRow({ version: 2 });
    const updatedRow = makeProjectRow({
      version: 3,
      researchField: "Data Science",
      researchAreas: ["Data Science", "Software Engineering"],
      researchKeywords: ["Systematic Review", "Evidence Synthesis"],
    });
    const projectUpdate = vi.fn().mockResolvedValue(updatedRow);
    const researchPlanUpdate = vi.fn();
    mocks.authorizeProjectTransaction.mockResolvedValue({ project: existingRow, role: "OWNER" });
    const tx = {
      project: {
        update: projectUpdate,
        findUnique: vi.fn().mockResolvedValue(updatedRow),
        findFirst: vi.fn().mockResolvedValue(existingRow),
      },
      projectMember: { findMany: vi.fn().mockResolvedValue([]) },
      researchPlan: { update: researchPlanUpdate, findUnique: vi.fn().mockResolvedValue({ researchApproach: "LITERATURE_REVIEW" }) },
      projectActivity: { create: vi.fn().mockResolvedValue({}) },
      projectPaper: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
      projectInvitation: { findMany: vi.fn().mockResolvedValue([]) },
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: OWNER_ID, fullName: "Owner", email: "owner@example.com", avatarUrl: null }),
        findFirst: vi.fn().mockResolvedValue({ id: OWNER_ID, fullName: "Owner", email: "owner@example.com", avatarUrl: null }),
      },
    };
    mocks.getPrisma.mockReturnValue({
      $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      ...tx,
    });

    const result = await projectService.updateProject(
      PROJECT_ID,
      {
        expectedVersion: 2,
        researchAreas: ["Data Science", "Software Engineering", "data science"],
        keywords: ["Systematic Review", "Evidence   Synthesis"],
      },
      OWNER_ID,
    );

    expect(projectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          researchField: "Data Science",
          researchAreas: ["Data Science", "Software Engineering"],
          researchKeywords: ["Systematic Review", "Evidence Synthesis"],
        }),
      }),
    );
    expect(researchPlanUpdate).not.toHaveBeenCalled();
    expect(result.keywords).toEqual(["Systematic Review", "Evidence Synthesis"]);
    expect(result.researchField).toBe("Data Science");
  });
});
