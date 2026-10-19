import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../../config/env.js";
import { disconnectPostgres, getPrisma } from "../../../infrastructure/database/prisma.js";
import { ABSTRACT, makeJudgeOutput } from "./quality.fixture.js";
const generate = vi.hoisted(() => vi.fn());
vi.mock("../../llm/llm.run.js", () => ({ cachedGenerateJSON: generate }));
vi.mock("../../auth/points.service.js", () => ({ syncUserPoints: vi.fn() }));
import { qualityService } from "../quality.service.js";

// This suite must never write to a developer's ordinary database.
const isolated = /^\/lumi_gap_qa_quality_[a-z0-9_]+$/.test(new URL(env.DATABASE_URL).pathname);
describe.skipIf(!isolated).sequential("quality assessment PostgreSQL persistence (isolated QA only)", () => {
  const ownerId = randomUUID(), paperId = randomUUID(), reportId = randomUUID();
  beforeAll(async () => {
    await getPrisma().user.create({ data: { id: ownerId, email: `quality-${ownerId}@example.test`, fullName: "Quality QA", emailVerifiedAt: new Date() } });
    await getPrisma().paper.create({ data: { id: paperId, title: "Guided feedback", abstractText: ABSTRACT, primaryProvider: "user", publicationYear: 2026, dataStatus: "active" } });
    await getPrisma().report.create({ data: { id: reportId, userId: ownerId, query: "Guided feedback", status: "ready", markdown: ABSTRACT } });
    generate.mockImplementation(async () => makeJudgeOutput());
  });
  afterAll(async () => {
    await getPrisma().report.deleteMany({ where: { id: reportId } });
    await getPrisma().paper.deleteMany({ where: { id: paperId } });
    await getPrisma().user.deleteMany({ where: { id: ownerId } });
    await disconnectPostgres();
  });
  it("persists evidence and a fractional mean and retrieves the same assessment", async () => {
    const result = await qualityService.evaluate(ownerId, { targetKind: "paper", targetId: paperId, language: "vi" });
    expect(result.overall).toBe(3.3);
    const saved = await getPrisma().qualityEvaluation.findFirstOrThrow({ where: { paperId } });
    expect(saved.overall).toBe(3.3); expect(saved.assessment).toMatchObject({ rubric: { language: "vi" }, actions: expect.any(Array) });
    expect((await qualityService.view(ownerId, "paper", paperId)).evaluation?.details).toEqual(result.details);
  });
  it("marks changed input as outdated and updates the existing row", async () => {
    await getPrisma().paper.update({ where: { id: paperId }, data: { abstractText: `${ABSTRACT} Follow-up observations are planned.` } });
    expect((await qualityService.view(ownerId, "paper", paperId)).evaluation?.freshness).toBe("outdated");
    await qualityService.evaluate(ownerId, { targetKind: "paper", targetId: paperId, language: "vi" });
    expect(await getPrisma().qualityEvaluation.count({ where: { paperId } })).toBe(1);
    expect((await qualityService.view(ownerId, "paper", paperId)).evaluation?.freshness).toBe("current");
  });
  it("keeps a single row when two forced worker evaluations complete together", async () => {
    await Promise.all([1, 2].map(() => qualityService.evaluate(ownerId, { targetKind: "paper", targetId: paperId, force: true })));
    expect(await getPrisma().qualityEvaluation.count({ where: { paperId } })).toBe(1);
  });
  it("stores missing groundedness as SQL NULL rather than a misleading number", async () => {
    const result = await qualityService.evaluate(ownerId, { targetKind: "report", targetId: reportId });
    expect(result.groundedness).toBeNull(); expect(result.overall).toBeNull();
    const saved = await getPrisma().qualityEvaluation.findFirstOrThrow({ where: { reportId } });
    expect(saved.groundedness).toBeNull(); expect(saved.overall).toBeNull();
  });
});
