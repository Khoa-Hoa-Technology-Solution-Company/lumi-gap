import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { errorHandler } from "../../../common/middleware/error-handler.js";
import { manuscriptRouter } from "../manuscript.routes.js";
import { tokenService } from "../../auth/token.service.js";

const auth = vi.hoisted(() => ({ sub: "" }));
vi.mock("../../../common/middleware/auth.js", () => ({ requireAuth: (req: any, _res: any, next: () => void) => { req.user = { sub: auth.sub }; next(); } }));
vi.mock("../../authorization/authorization.middleware.js", () => ({ requireResearchWorkflow: (_req: any, _res: any, next: () => void) => next() }));
vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn() } }));

const isolated = process.env.NODE_ENV === "test" && /\/codex_mentorship_[a-f0-9]+_test(?:\?|$)/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!isolated).sequential("manuscripts for migrated accounts (isolated PostgreSQL)", () => {
  const db = getPrisma(), app = express(), server = createServer(app);
  let origin: string, project: string, owner: string, legacyOwner: string, manuscript: string, mainFile: string;
  app.use(express.json());
  app.use("/projects/:projectId/manuscripts", manuscriptRouter);
  app.use(errorHandler);
  const call = (path = "", body?: unknown) => fetch(`${origin}/projects/${project}/manuscripts${path}`, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  beforeAll(async () => {
    legacyOwner = crypto.randomUUID().replaceAll("-", "").slice(0, 24);
    const user = await db.user.create({ data: { legacyMongoId: legacyOwner, email: `${crypto.randomUUID()}@manuscript.invalid`, fullName: "Migrated owner", emailVerifiedAt: new Date() } });
    owner = user.id; auth.sub = legacyOwner;
    const row = await createProjectFixture({ data: { title: "Migrated team writing", ownerId: owner } });
    const legacyProject = crypto.randomUUID().replaceAll("-", "").slice(0, 24);
    await db.project.update({ where: { id: row.id }, data: { legacyMongoId: legacyProject } });
    project = legacyProject;
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(async () => { if (server.listening) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } });
  it("creates, retries and opens using legacy project/account IDs without duplicate manuscripts", async () => {
    const body = { title: "Collaborative LaTeX", template: "ARTICLE", documentType: "RESEARCH_PAPER", clientKey: crypto.randomUUID() };
    const response = await call("", body); expect(response.status).toBe(201);
    manuscript = (await response.json()).data.id;
    const retry = await call("", body); expect(retry.status).toBe(201);
    expect((await retry.json()).data.id).toBe(manuscript);
    const detail = await call(`/${manuscript}`); expect(detail.status).toBe(200);
    mainFile = (await detail.json()).data.mainFileId;
    expect(mainFile).toBeTruthy();
    expect((await db.draftWorkspace.findUniqueOrThrow({ where: { id: manuscript } })).createdById).toBe(owner);
    expect((await db.manuscriptFile.findMany({ where: { workspaceId: manuscript } })).every(row => row.createdById === owner)).toBe(true);
    expect((await (await call()).json()).data).toHaveLength(1);
  });
  it("uses the canonical account in collaboration tickets and persists files and versions", async () => {
    const response = await call(`/${manuscript}/files/${mainFile}/ticket`, {}); expect(response.status).toBe(200);
    const { ticket } = (await response.json()).data;
    expect(tokenService.verifyPurposeToken(ticket, "manuscript-room")).toMatchObject({ actorId: owner, manuscriptId: manuscript });
    expect((await call(`/${manuscript}/files`, { path: "sections/team.tex", kind: "TEXT", content: "Team contribution", clientKey: crypto.randomUUID() })).status).toBe(201);
    expect((await call(`/${manuscript}/snapshots`, { label: "Team draft", clientKey: crypto.randomUUID(), minimumSequences: {} })).status).toBe(201);
    expect((await db.manuscriptSnapshot.findFirstOrThrow({ where: { workspaceId: manuscript } })).createdById).toBe(owner);
  });
  it("preserves project authorization for a migrated outsider", async () => {
    const outsiderLegacy = crypto.randomUUID().replaceAll("-", "").slice(0, 24);
    await db.user.create({ data: { legacyMongoId: outsiderLegacy, email: `${crypto.randomUUID()}@manuscript.invalid`, fullName: "Outsider", emailVerifiedAt: new Date() } });
    auth.sub = outsiderLegacy;
    expect((await call(`/${manuscript}`)).status).toBe(404);
    expect((await call("", { title: "Unauthorized", template: "ARTICLE", documentType: "RESEARCH_PAPER", clientKey: crypto.randomUUID() })).status).toBe(404);
  });
});
