import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { env } from "../../../config/env.js";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { getEmbeddingProvider } from "../../embeddings/embedding.factory.js";
import { cachedGenerateJSON } from "../../llm/llm.run.js";
import { countOpenAlexIntersection } from "../gap-global-evidence.js";
import { gapsService } from "../gaps.service.js";

// Embedding fails on purpose: the pipeline then retrieves by keyword, which is an existing path.
vi.mock("../../embeddings/embedding.factory.js", () => ({ getEmbeddingProvider: vi.fn() }));
vi.mock("../../llm/llm.run.js", () => ({ cachedGenerateJSON: vi.fn() }));
// Never reach OpenAlex from tests.
vi.mock("../gap-global-evidence.js", () => ({ countOpenAlexIntersection: vi.fn().mockResolvedValue(null) }));
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

  async function runAnalysis(data: { evidenceMode: "hybrid" | "auto"; projectId?: string; yearFrom?: number; yearTo?: number }) {
    const analysis = await getPrisma().gapAnalysis.create({
      data: { userId, topic: `${topicA} ${topicB}`, status: "queued", evidenceMode: data.evidenceMode, projectId: data.projectId, yearFrom: data.yearFrom, yearTo: data.yearTo },
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

    const user = await prisma.user.create({ data: { email: `gap-scope-${m}@example.test`, fullName: `Gap scope ${m}`, emailVerifiedAt: new Date() } });
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

    const project = await createProjectFixture({ data: { title: `Gap scope ${m}`, ownerId: userId } });
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
    expect(gaps[0]!.evidenceScopeSize).toBeGreaterThanOrEqual(PAPER_COUNT);
    expect(gaps[0]!.projectEvidence).toBeNull();
    expect(gaps[0]!.globalEvidence).toBeNull();
    expect(countOpenAlexIntersection).toHaveBeenCalledWith(topicA, topicB, expect.anything());
  });

  it("drops a probe whose topic does not occur in the gap's evidence papers", async () => {
    vi.mocked(cachedGenerateJSON).mockResolvedValueOnce({
      gaps: [{ title: `Invented probe ${m}`, description: "d", rationale: "r", supportingEvidence: [1], confidence: 0.5, probe: { topicA, topicB: `inventedtopic${m}k` } }],
    } as never);

    const { done, gaps } = await runAnalysis({ evidenceMode: "hybrid" });

    expect(done.status).toBe("ready");
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.probe).toBeNull();
    expect(gaps[0]!.intersectionCount).toBeNull();
    expect(gaps[0]!.parentCounts).toBeNull();
    expect(gaps[0]!.globalEvidence).toBeNull();
  });

  it("keeps a probe whose second topic occurs only in an evidence paper the gap does not cite", async () => {
    const onlyA = `onlya${m}k`, onlyB = `onlyb${m}k`; // own words, so the other tests' corpus counts are untouched
    const prisma = getPrisma();
    const made = await Promise.all([`${onlyA} only`, `${onlyA} again`, `${onlyB} alone`].map((text, i) =>
      prisma.paper.create({ data: { title: `Uncited evidence ${i} ${m}`, abstractText: `This paper mentions ${text}.`, publicationYear: 2024, primaryProvider: "user", dataStatus: "active" } })));
    paperIds.push(...made.map((paper) => paper.id));
    vi.mocked(cachedGenerateJSON).mockResolvedValueOnce({
      gaps: [{ title: `Rare intersection ${m}`, description: "d", rationale: "r", supportingEvidence: [1], confidence: 0.5, probe: { topicA: onlyA, topicB: onlyB } }],
    } as never);
    const analysis = await prisma.gapAnalysis.create({ data: { userId, topic: `${onlyA} ${onlyB}`, status: "queued", evidenceMode: "selected" } });
    analysisIds.push(analysis.id);
    await prisma.gapAnalysisPaper.createMany({ data: made.map((paper, position) => ({ analysisId: analysis.id, paperId: paper.id, position })) });

    await gapsService.runGapPipeline({ analysisId: analysis.id });

    const [gap] = await prisma.researchGap.findMany({ where: { analysisId: analysis.id } });
    expect(gap!.probe).toEqual({ topicA: onlyA, topicB: onlyB });
  });

  it("scores probes against the whole corpus in auto mode too", async () => {
    const { done, gaps } = await runAnalysis({ evidenceMode: "auto" });

    expect(done.status).toBe("ready");
    expect((done.evidenceSnapshot as unknown[]).length).toBeLessThanOrEqual(env.GAPS_TOP_K);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.parentCounts).toEqual({ a: PAPER_COUNT, b: PAPER_COUNT });
    expect(gaps[0]!.intersectionCount).toBe(PAPER_COUNT);
  });

  it("keeps the main counts on the corpus and reports INCLUDED project papers separately", async () => {
    const { done, gaps } = await runAnalysis({ evidenceMode: "hybrid", projectId });

    expect(done.status).toBe("ready");
    expect(gaps).toHaveLength(1);
    // The Confirmed label rests on the corpus counts, never on the project's handful of papers.
    expect(gaps[0]!.parentCounts).toEqual({ a: PAPER_COUNT, b: PAPER_COUNT });
    expect(gaps[0]!.intersectionCount).toBe(PAPER_COUNT);
    expect(gaps[0]!.evidenceScopeSize).toBeGreaterThanOrEqual(PAPER_COUNT);
    // 7 INCLUDED papers count; the 3 EXCLUDED ones and the 15 outside the project do not.
    expect(gaps[0]!.projectEvidence).toMatchObject({
      intersectionCount: INCLUDED_COUNT,
      parentCounts: { a: INCLUDED_COUNT, b: INCLUDED_COUNT },
      scopePaperCount: INCLUDED_COUNT,
    });
  });

  it("narrows the probe counts to the year window chosen for the analysis", async () => {
    // 25 papers spread evenly over 2021-2025, so 2023 onward leaves 3 years x 5 papers.
    const { done, gaps } = await runAnalysis({ evidenceMode: "hybrid", yearFrom: 2023 });

    expect(done.status).toBe("ready");
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.parentCounts).toEqual({ a: 15, b: 15 });
    expect(gaps[0]!.intersectionCount).toBe(15);
    // The recorded sample size is the corpus inside the same window.
    expect(gaps[0]!.evidenceScopeSize).toBeGreaterThanOrEqual(15);
    expect(gaps[0]!.evidenceScopeSize).toBeLessThan((await getPrisma().paper.count({ where: { dataStatus: "active" } })));
  });
  it("rejects a changed project corpus after generation rather than saving a stale candidate", async () => {
    const db = getPrisma();
    const analysis = await db.gapAnalysis.create({ data: { userId, projectId, topic: `${topicA} ${topicB}`, status: "queued", evidenceMode: "hybrid" } }); analysisIds.push(analysis.id);
    vi.mocked(cachedGenerateJSON).mockImplementationOnce(async () => {
      await db.projectPaper.update({ where: { projectId_paperId: { projectId, paperId: paperIds[0]! } }, data: { screeningStatus: "EXCLUDED" } });
      return { gaps: [{ title: "Stale proposal", description: "Bounded hypothesis", rationale: "Source context changed", supportingEvidence: [1], confidence: 0.99 }] } as never;
    });
    try {
      await expect(gapsService.runGapPipeline({ analysisId: analysis.id })).rejects.toMatchObject({ statusCode: 409 });
      expect(await db.researchGap.count({ where: { analysisId: analysis.id } })).toBe(0);
    } finally {
      await db.projectPaper.update({ where: { projectId_paperId: { projectId, paperId: paperIds[0]! } }, data: { screeningStatus: "INCLUDED" } });
      mockLlm();
    }
  });
});
