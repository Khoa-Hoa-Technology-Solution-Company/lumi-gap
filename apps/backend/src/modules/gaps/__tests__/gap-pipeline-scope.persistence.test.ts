import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { env } from "../../../config/env.js";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { getEmbeddingProvider } from "../../embeddings/embedding.factory.js";
import { cachedGenerateJSON } from "../../llm/llm.run.js";
import { gapsService } from "../gaps.service.js";

// Embedding fails on purpose: the pipeline then retrieves by keyword, which is an existing path.
vi.mock("../../embeddings/embedding.factory.js", () => ({ getEmbeddingProvider: vi.fn() }));
vi.mock("../../llm/llm.run.js", () => ({ cachedGenerateJSON: vi.fn() }));
// Never enqueue real jobs from tests: a running dev worker would call Gemini.
vi.mock("../../../infrastructure/queue.js", () => ({ gapsQueue: { add: vi.fn().mockResolvedValue(undefined) } }));

const PAPER_COUNT = 25;
const INCLUDED_COUNT = 7;
const EXCLUDED_COUNT = 3;

// Lowercase letters only, so no stemming suffix can ever apply to the probe words below.
const randomLetters = (length: number) => Array.from({ length }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");

describe.sequential("gap pipeline probe scope (PostgreSQL)", () => {
  const m = randomLetters(10);
  // Unique words (ending in "k", which has no stem rule) that no other row in the database can contain.
  const topicA = `qx${m}k`;
  const topicB = `zv${m}k`;
  const paperIds: string[] = [];
  const analysisIds: string[] = [];
  let userId = "";
  let projectId = "";

  const mockLlm = () =>
    vi.mocked(cachedGenerateJSON).mockResolvedValue({
      gaps: [
        {
          title: `Gap ${m}`,
          description: "Scope test gap",
          rationale: "Scope test rationale",
          supportingEvidence: [1],
          confidence: 0.5,
          probe: { topicA, topicB },
        },
      ],
    } as never);

  async function runAnalysis(data: { evidenceMode: "hybrid" | "auto"; projectId?: string }) {
    const analysis = await getPrisma().gapAnalysis.create({
      data: { userId, topic: `${topicA} ${topicB}`, status: "queued", evidenceMode: data.evidenceMode, projectId: data.projectId },
    });
    analysisIds.push(analysis.id);
    await gapsService.runGapPipeline({ analysisId: analysis.id });
    const done = await getPrisma().gapAnalysis.findUniqueOrThrow({ where: { id: analysis.id } });
    const gaps = await getPrisma().researchGap.findMany({ where: { analysisId: analysis.id } });
    return { done, gaps };
  }

  beforeAll(async () => {
    const prisma = getPrisma();
    vi.mocked(getEmbeddingProvider).mockReturnValue({
      embed: async () => {
        throw new Error("embedding unavailable in test");
      },
    } as unknown as ReturnType<typeof getEmbeddingProvider>);
    mockLlm();

    const user = await prisma.user.create({ data: { email: `gap-scope-${m}@example.test`, fullName: `Gap scope ${m}` } });
    userId = user.id;

    for (let i = 0; i < PAPER_COUNT; i += 1) {
      const paper = await prisma.paper.create({
        data: {
          title: `Gap scope paper ${i} ${m}`,
          abstractText: `This study links ${topicA} with ${topicB} in experiment ${i}.`,
          publicationYear: 2021 + (i % 5),
          primaryProvider: "user",
          dataStatus: "active",
        },
      });
      paperIds.push(paper.id);
    }

    const project = await prisma.project.create({ data: { title: `Gap scope ${m}`, ownerId: userId } });
    projectId = project.id;
    await prisma.projectPaper.createMany({
      data: paperIds.slice(0, INCLUDED_COUNT + EXCLUDED_COUNT).map((paperId, index) => ({
        projectId,
        paperId,
        screeningStatus: index < INCLUDED_COUNT ? "INCLUDED" : "EXCLUDED",
      })),
    });
  });

  afterAll(async () => {
    const prisma = getPrisma();
    const gaps = await prisma.researchGap.findMany({ where: { analysisId: { in: analysisIds } }, select: { id: true } });
    const gapIds = gaps.map((gap) => gap.id);
    await prisma.researchGapPaper.deleteMany({ where: { gapId: { in: gapIds } } });
    await prisma.researchGap.deleteMany({ where: { id: { in: gapIds } } });
    await prisma.gapAnalysisPaper.deleteMany({ where: { analysisId: { in: analysisIds } } });
    await prisma.gapAnalysis.deleteMany({ where: { id: { in: analysisIds } } });
    if (projectId) {
      await prisma.projectActivity.deleteMany({ where: { projectId } });
      await prisma.projectPaper.deleteMany({ where: { projectId } });
      await prisma.projectMember.deleteMany({ where: { projectId } });
      await prisma.project.deleteMany({ where: { id: projectId } });
    }
    await prisma.paper.deleteMany({ where: { id: { in: paperIds } } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("scores probes against the whole corpus, not the evidence pack (hybrid)", async () => {
    const { done, gaps } = await runAnalysis({ evidenceMode: "hybrid" });

    expect(done.status).toBe("ready");
    const snapshot = done.evidenceSnapshot as unknown[];
    expect(snapshot.length).toBeGreaterThan(0);
    expect(snapshot.length).toBeLessThanOrEqual(env.GAPS_TOP_K);
    expect(snapshot.length).toBeLessThan(PAPER_COUNT);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.parentCounts).toEqual({ a: PAPER_COUNT, b: PAPER_COUNT });
    expect(gaps[0]!.intersectionCount).toBe(PAPER_COUNT);
  });

  it("scores probes against the whole corpus in auto mode too", async () => {
    const { done, gaps } = await runAnalysis({ evidenceMode: "auto" });

    expect(done.status).toBe("ready");
    expect((done.evidenceSnapshot as unknown[]).length).toBeLessThanOrEqual(env.GAPS_TOP_K);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.parentCounts).toEqual({ a: PAPER_COUNT, b: PAPER_COUNT });
    expect(gaps[0]!.intersectionCount).toBe(PAPER_COUNT);
  });

  it("scopes probes to INCLUDED project papers", async () => {
    const { done, gaps } = await runAnalysis({ evidenceMode: "hybrid", projectId });

    expect(done.status).toBe("ready");
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.parentCounts).toEqual({ a: INCLUDED_COUNT, b: INCLUDED_COUNT });
    expect(gaps[0]!.intersectionCount).toBe(INCLUDED_COUNT);
  });
});
