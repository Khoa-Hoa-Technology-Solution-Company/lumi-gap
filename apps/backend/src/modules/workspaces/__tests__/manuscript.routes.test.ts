import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type ErrorRequestHandler } from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { ZodError } from "zod";
import { AppError } from "../../../common/exceptions/app-error.js";

const mocks = vi.hoisted(() => ({ actor: "20000000-0000-4000-8000-000000000001", user: vi.fn(), project: vi.fn(), list: vi.fn(), create: vi.fn(), detail: vi.fn(), fileContent: vi.fn(), ticket: vi.fn() }));
vi.mock("../../../common/middleware/auth.js", () => ({ requireAuth: (req: any, _res: any, next: () => void) => { req.user = { sub: mocks.actor, sessionId: "30000000-0000-4000-8000-000000000001" }; next(); } }));
vi.mock("../../authorization/authorization.middleware.js", () => ({ requireResearchWorkflow: (_req: any, _res: any, next: () => void) => next() }));
vi.mock("../../../common/middleware/rate-limit.js", () => ({ createRateLimiter: () => (_req: any, _res: any, next: () => void) => next() }));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => ({ project: { findUnique: mocks.project }, user: { findUnique: mocks.user } }) }));
vi.mock("../manuscript.service.js", () => ({ manuscriptService: mocks }));
vi.mock("../../auth/token.service.js", () => ({ tokenService: { signPurposeToken: mocks.ticket } }));
import { manuscriptRouter } from "../manuscript.routes.js";

describe("manuscript HTTP project identifiers", () => {
  const legacy = "6ab33f1537802fe30d38753b", canonical = "10000000-0000-4000-8000-000000000001";
  const manuscript = "40000000-0000-4000-8000-000000000001", file = "50000000-0000-4000-8000-000000000001";
  const actor = "20000000-0000-4000-8000-000000000001";
  const app = express();
  app.use(express.json());
  app.use("/projects/:projectId/manuscripts", manuscriptRouter);
  app.use(((error, _req, res, _next) => { res.status(error instanceof ZodError ? 400 : error.statusCode ?? 500).json({ error: error.message }); }) as ErrorRequestHandler);
  const server = createServer(app);
  let origin: string;
  beforeAll(async () => { server.listen(0, "127.0.0.1"); await once(server, "listening"); origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; });
  afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.actor = actor;
    mocks.user.mockResolvedValue({ id: actor });
    mocks.project.mockResolvedValue({ id: canonical });
    mocks.list.mockResolvedValue([]);
    mocks.create.mockResolvedValue({ id: manuscript });
    mocks.detail.mockResolvedValue({ id: manuscript });
    mocks.fileContent.mockResolvedValue({ id: file, kind: "TEXT" });
    mocks.ticket.mockReturnValue("signed-ticket");
  });
  const call = (project: string, path = "", body?: unknown) => fetch(`${origin}/projects/${project}/manuscripts${path}`, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  it.each(["6ab2458390fdee5fbb8e4d93", "6AB2458390FDEE5FBB8E4D93"])("resolves migrated account %s for creation and collaboration", async legacyActor => {
    mocks.actor = legacyActor;
    const body = { title: "Collaborative research", documentType: "RESEARCH_PAPER", template: "ARTICLE", clientKey: crypto.randomUUID() };
    expect((await call(legacy, "", body)).status).toBe(201);
    expect(mocks.user).toHaveBeenCalledWith({ where: { legacyMongoId: legacyActor.toLowerCase() }, select: { id: true } });
    expect(mocks.create).toHaveBeenCalledWith(canonical, actor, expect.objectContaining({ title: body.title }));
    expect((await call(legacy, `/${manuscript}`)).status).toBe(200);
    expect(mocks.detail).toHaveBeenCalledWith(canonical, actor, manuscript);
    expect((await call(legacy, `/${manuscript}/files/${file}/ticket`, {})).status).toBe(200);
    expect(mocks.ticket).toHaveBeenCalledWith(expect.objectContaining({ actorId: actor, projectId: canonical }), "manuscript-room", "5m");
  });
  it("rejects an unresolved account without invoking manuscript services", async () => {
    mocks.actor = "6ab2458390fdee5fbb8e4d93";
    mocks.user.mockResolvedValue(null);
    expect((await call(legacy, "", { title: "Research", documentType: "RESEARCH_PAPER", template: "ARTICLE", clientKey: crypto.randomUUID() })).status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([legacy, legacy.toUpperCase(), canonical])("lists and creates through public project ID %s", async project => {
    expect((await call(project)).status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(canonical, actor);
    const body = { title: "Evidence synthesis", documentType: "RESEARCH_PAPER", template: "ARTICLE", clientKey: crypto.randomUUID() };
    expect((await call(project, "", body)).status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(canonical, actor, { ...body, description: "" });
    if (project === canonical) expect(mocks.project).not.toHaveBeenCalled();
    else expect(mocks.project).toHaveBeenCalledWith({ where: { legacyMongoId: legacy }, select: { id: true } });
  });
  it("resolves nested editor routes and signs collaboration tickets with the canonical project UUID", async () => {
    expect((await call(legacy, `/${manuscript}`)).status).toBe(200);
    expect(mocks.detail).toHaveBeenCalledWith(canonical, actor, manuscript);
    expect((await call(legacy, `/${manuscript}/files/${file}/ticket`, {})).status).toBe(200);
    expect(mocks.fileContent).toHaveBeenCalledWith(canonical, actor, manuscript, file);
    expect(mocks.ticket).toHaveBeenCalledWith(expect.objectContaining({ projectId: canonical, manuscriptId: manuscript, fileId: file }), "manuscript-room", "5m");
  });
  it("rejects malformed project and manuscript IDs before calling services", async () => {
    expect((await call("invalid")).status).toBe(400);
    expect((await call(legacy, "/invalid")).status).toBe(400);
    expect(mocks.project).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.detail).not.toHaveBeenCalled();
  });
  it("preserves missing-project and service authorization errors", async () => {
    mocks.project.mockResolvedValueOnce(null);
    expect((await call(legacy)).status).toBe(404);
    expect(mocks.list).not.toHaveBeenCalled();
    mocks.list.mockRejectedValueOnce(AppError.notFound("Project not found"));
    expect((await call(legacy)).status).toBe(404);
  });
});
