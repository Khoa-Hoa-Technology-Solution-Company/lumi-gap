import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";

const add = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "test-job" }));
vi.mock("../../../infrastructure/queue.js", () => ({ paperAnalysisQueue: { add } }));
import { knowledgeService } from "../knowledge.service.js";

describe("PostgreSQL paper index claims", () => {
  let paperId: string | undefined;

  beforeAll(async () => {
    const paper = await getPrisma().paper.create({
      data: {
        title: `Index claim regression ${randomUUID()}`,
        abstractText: "Evidence for the transaction lock regression test.",
        publicationYear: 2026,
        primaryProvider: "user",
        paperStatus: "not-downloaded",
        dataStatus: "active",
      },
    });
    paperId = paper.id;
  });

  afterAll(async () => {
    if (paperId) await getPrisma().paper.delete({ where: { id: paperId } });
    await disconnectPostgres();
  });

  it("acquires a void-returning lock and enqueues only once for concurrent requests", async () => {
    const results = await Promise.all([
      knowledgeService.requestIndex(paperId!),
      knowledgeService.requestIndex(paperId!),
    ]);
    expect(results).toEqual([{ status: "queued" }, { status: "queued" }]);
    expect(add).toHaveBeenCalledOnce();
    expect(await getPrisma().paperDocument.findUnique({ where: { paperId } })).toMatchObject({ status: "queued" });
  });
});
