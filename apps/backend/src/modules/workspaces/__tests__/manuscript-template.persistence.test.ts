import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { MANUSCRIPT_TEMPLATES, MANUSCRIPT_TEMPLATE_REGISTRY, type CreateManuscript } from "@trend/shared-types";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { manuscriptService as writing } from "../manuscript.service.js";
import * as source from "../manuscript-source.js";
vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn() }, manuscriptCompileQueue: { add: vi.fn() } }));
const enabled = process.env.MANUSCRIPT_TEMPLATE_INTEGRATION === "1" && /^\/codex_manuscript_templates_[a-f0-9]{12}_test$/.test(new URL(process.env.DATABASE_URL ?? "postgres://localhost/unused").pathname);
describe.skipIf(!enabled).sequential("template creation in fresh PostgreSQL", () => {
  const db = getPrisma(); let owner: string, member: string, outsider: string, project: string;
  const input = (overrides: Partial<CreateManuscript> = {}): CreateManuscript => ({ title: "Research document", documentType: "RESEARCH_PAPER", template: "ARTICLE", description: "", clientKey: crypto.randomUUID(), ...overrides });
  beforeAll(async () => {
    const users = [];
    for (const fullName of ["Template Owner", "Template Member", "Template Outsider"]) {
      const user = await db.user.create({ data: { fullName, email: `${crypto.randomUUID()}@example.org`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date(), admissionBasis: "INVITATION" } });
      await db.academicProfile.create({ data: { userId: user.id, primaryPosition: "RESEARCH_STAFF", academicRole: "RESEARCHER" } }); users.push(user.id);
    }
    [owner, member, outsider] = users as [string, string, string];
    project = (await createProjectFixture({ data: { title: "Template project", ownerId: owner, status: "ACTIVE" } })).id;
    await db.projectMember.create({ data: { projectId: project, userId: member } });
  });
  afterEach(() => vi.restoreAllMocks());
  it.each(MANUSCRIPT_TEMPLATES)("retains %s metadata, source, initial history and collaborative access", async template => {
    const definition = MANUSCRIPT_TEMPLATE_REGISTRY[template];
    const created = await writing.create(project, owner, input({ template, documentType: definition.documentType }));
    const detail = await writing.detail(project, member, created.id);
    expect(detail.templateMetadata).toMatchObject({ id: template, templateVersion: definition.templateVersion, documentClass: definition.documentClass });
    expect(detail.compilerSettings?.engine).toBe(definition.preferredCompiler);
    const file = await writing.fileContent(project, member, created.id, detail.mainFileId!);
    expect(source.sourceText(Buffer.from(file.state!, "base64"))).toContain(`{${definition.documentClass}}`);
    const revision = await db.projectWorkspaceRevision.findFirstOrThrow({ where: { entityId: created.id, entityKind: "MANUSCRIPT", version: 1 } });
    expect(revision.snapshot).toMatchObject({ templateMetadata: { id: template } });
    expect(await db.manuscriptFile.count({ where: { workspaceId: created.id, kind: "TEXT" } })).toBe(source.manuscriptTemplate("Research document", template).length);
    await expect(writing.detail(project, outsider, created.id)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("serializes double-submit and rejects altered retry input", async () => {
    const values = input(); const [first, second] = await Promise.all([writing.create(project, owner, values), writing.create(project, owner, values)]);
    expect(first.id).toBe(second.id);
    expect(await db.draftWorkspace.count({ where: { clientKey: values.clientKey } })).toBe(1);
    await expect(writing.create(project, owner, { ...values, title: "Changed title" })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("rejects incompatible templates, unauthorized creation and failed initialization without orphan drafts", async () => {
    const invalid = input({ template: "IEEE_CONFERENCE", documentType: "THESIS" });
    await expect(writing.create(project, owner, invalid)).rejects.toMatchObject({ statusCode: 400 });
    await expect(writing.create(project, outsider, input())).rejects.toMatchObject({ statusCode: 404 });
    const values = input();
    vi.spyOn(source, "manuscriptTemplate").mockReturnValue([{ path: "main.tex", text: "Valid source" }, { path: "../bad.tex", text: "Bad path" }]);
    await expect(writing.create(project, owner, values)).rejects.toMatchObject({ statusCode: 400 });
    expect(await db.draftWorkspace.count({ where: { clientKey: values.clientKey } })).toBe(0);
    expect(await db.draftWorkspace.count({ where: { clientKey: invalid.clientKey } })).toBe(0);
  });
  it("preserves Other labels and metadata through snapshots and copy restoration", async () => {
    const created = await writing.create(project, member, input({ documentType: "OTHER", documentTypeLabel: "Poster", template: "BLANK" }));
    const snapshot = await writing.snapshot(project, member, created.id, { label: "Poster version", clientKey: crypto.randomUUID(), minimumSequences: {} });
    const restored = await writing.restore(project, member, created.id, snapshot.id, { title: "Poster copy", clientKey: crypto.randomUUID() });
    expect(restored.documentTypeLabel).toBe("Poster");
    expect(restored.templateMetadata).toEqual(created.templateMetadata);
    expect((await writing.detail(project, owner, created.id)).version).toBe(created.version);
  });
});
