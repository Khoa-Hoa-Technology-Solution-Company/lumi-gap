import { beforeAll, describe, expect, it } from "vitest";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { projectService } from "../project.service.js";
import { projectOverviewService } from "../project-overview.service.js";

const isolated = process.env.PROJECT_SLICE_TEST === "1" && process.env.DATABASE_URL?.includes("127.0.0.1:15439/lumigap_project_slice_test") && process.env.REDIS_URL === "redis://127.0.0.1:16389";
describe.skipIf(!isolated).sequential("project overview manuscript links, disposable PostgreSQL", () => {
  const db = getPrisma(), marker = crypto.randomUUID();
  let owner = "", project = "";
  beforeAll(async () => {
    const user = await db.user.create({ data: { email: `overview-${marker}@example.test`, fullName: "Overview researcher", emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
    owner = user.id;
    await db.academicProfile.create({ data: { userId: owner, primaryPosition: "RESEARCH_STAFF", academicRole: "RESEARCHER" } });
    project = (await projectService.createProject({ title: "Overview link audit", idempotencyKey: crypto.randomUUID() }, owner))._id;
  });
  // Snapshot history is immutable; this fixture is removed with the disposable database.
  it("shows the latest live manuscripts and excludes deleted and legacy drafts from artifact choices", async () => {
    const drafts = [];
    for (let number = 0; number < 5; number++) drafts.push(await db.draftWorkspace.create({ data: { projectId: project, createdById: owner, name: `Manuscript ${number}`, writingMode: "LATEX", updatedAt: new Date(Date.UTC(2026, 9, 20 + number)) } }));
    await db.draftWorkspace.update({ where: { id: drafts[4]!.id }, data: { deletedAt: new Date() } });
    await db.draftWorkspace.create({ data: { projectId: project, createdById: owner, name: "Legacy section editor", writingMode: "LEGACY" } });
    const overview = await projectOverviewService.get(project, owner);
    expect(overview.recentArtifacts.map(row => row.id)).toEqual([drafts[3]!.id, drafts[2]!.id, drafts[1]!.id]);
    const choices = await projectOverviewService.artifacts(project, owner, "MANUSCRIPT", "");
    expect(choices.map(row => row.id)).toEqual([drafts[3]!.id, drafts[2]!.id, drafts[1]!.id, drafts[0]!.id]);
  });
  it("does not offer snapshots belonging to a deleted manuscript", async () => {
    const live = await db.draftWorkspace.findFirstOrThrow({ where: { projectId: project, writingMode: "LATEX", deletedAt: null } });
    const removed = await db.draftWorkspace.findFirstOrThrow({ where: { projectId: project, deletedAt: { not: null } } });
    const saved = [];
    for (const draft of [live, removed]) saved.push(await db.manuscriptSnapshot.create({ data: { workspaceId: draft.id, projectId: project, createdById: owner, label: draft.name, manifest: {}, sourceVersion: 1, checksum: marker, clientKey: crypto.randomUUID() } }));
    expect((await projectOverviewService.artifacts(project, owner, "MANUSCRIPT_SNAPSHOT", "")).map(row => row.id)).toEqual([saved[0]!.id]);
  });
});
