import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { env } from "../../../config/env.js";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { getEmbeddingProvider } from "../../embeddings/embedding.factory.js";
import { cachedGenerateJSON } from "../../llm/llm.run.js";
import { countOpenAlexIntersection } from "../gap-global-evidence.js";
import { computeGapEvidence } from "../gap-evidence.js";
import { gapsService } from "../gaps.service.js";
import { vectorParameter } from "../../../infrastructure/database/postgres-paper-search.js";
import { loadPaperEmbeddings } from "../gap-vector-queries.js";

// Embedding fails on purpose: the pipeline then retrieves by keyword, which is an existing path.
vi.mock("../../embeddings/embedding.factory.js", () => ({ getEmbeddingProvider: vi.fn() }));
vi.mock("../../llm/llm.run.js", () => ({ cachedGenerateJSON: vi.fn() }));
// Never reach OpenAlex from tests.
vi.mock("../gap-global-evidence.js", () => ({ countOpenAlexIntersection: vi.fn().mockResolvedValue(null) }));
// Spy on the signal so a test can read the Bonferroni family size k the pipeline passes in.
vi.mock("../gap-evidence.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../gap-evidence.js")>();
  return { ...actual, computeGapEvidence: vi.fn(actual.computeGapEvidence) };
});
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
          legacyMongoId: [0, INCLUDED_COUNT, INCLUDED_COUNT + EXCLUDED_COUNT].includes(i) ? crypto.randomUUID().replaceAll("-", "").slice(0, 24) : undefined,
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
  it("keeps legacy paper IDs in a selected project pack when the worker scopes sources by UUID", async () => {
    const db = getPrisma();
    const analysis = await db.gapAnalysis.create({ data: { userId, projectId, topic: `${topicA} ${topicB}`, status: "queued", evidenceMode: "selected" } });
    analysisIds.push(analysis.id);
    await db.gapAnalysisPaper.createMany({ data: paperIds.slice(0, 3).map((paperId, position) => ({ analysisId: analysis.id, paperId, position })) });
    await gapsService.runGapPipeline({ analysisId: analysis.id });
    const done = await db.gapAnalysis.findUniqueOrThrow({ where: { id: analysis.id } });
    expect(done.status).toBe("ready");
    expect(done.evidenceSnapshot).toHaveLength(3);
    const legacy = await db.paper.findUniqueOrThrow({ where: { id: paperIds[0] } });
    expect(done.evidenceSnapshot).toEqual(expect.arrayContaining([expect.objectContaining({ id: legacy.legacyMongoId })]));
  });

  it("does not admit excluded or outside-project legacy papers into a selected pack", async () => {
    const db = getPrisma();
    const analysis = await db.gapAnalysis.create({ data: { userId, projectId, topic: `${topicA} ${topicB}`, status: "queued", evidenceMode: "selected" } });
    analysisIds.push(analysis.id);
    const selected = [paperIds[0]!, paperIds[INCLUDED_COUNT]!, paperIds[INCLUDED_COUNT + EXCLUDED_COUNT]!];
    await db.gapAnalysisPaper.createMany({ data: selected.map((paperId, position) => ({ analysisId: analysis.id, paperId, position })) });
    const calls = vi.mocked(cachedGenerateJSON).mock.calls.length;
    await gapsService.runGapPipeline({ analysisId: analysis.id });
    expect((await db.gapAnalysis.findUniqueOrThrow({ where: { id: analysis.id } })).status).toBe("failed");
    expect(await db.researchGap.count({ where: { analysisId: analysis.id } })).toBe(0);
    expect(vi.mocked(cachedGenerateJSON).mock.calls).toHaveLength(calls);
  });

  it("counts the sample size N inside the probe's own year window", async () => {
    // No window chosen by the user; the probe narrows to 2024-2025, i.e. 2 years x 5 papers.
    vi.mocked(cachedGenerateJSON).mockResolvedValueOnce({
      gaps: [{ title: `Narrow probe ${m}`, description: "d", rationale: "r", supportingEvidence: [1], confidence: 0.5, probe: { topicA, topicB, yearFrom: 2024 } }],
    } as never);

    const { done, gaps } = await runAnalysis({ evidenceMode: "hybrid" });

    expect(done.status).toBe("ready");
    expect(gaps[0]!.parentCounts).toEqual({ a: 10, b: 10 });
    // N must cover the same window as nA and nB, not the whole corpus.
    expect(gaps[0]!.evidenceScopeSize).toBeGreaterThanOrEqual(10);
    expect(gaps[0]!.evidenceScopeSize).toBeLessThan(await getPrisma().paper.count({ where: { dataStatus: "active" } }));
  });

  it("uses only grounded probes as the Bonferroni family size", async () => {
    vi.mocked(computeGapEvidence).mockClear();
    vi.mocked(cachedGenerateJSON).mockResolvedValueOnce({
      gaps: [
        { title: `Grounded ${m}`, description: "d", rationale: "r", supportingEvidence: [1], confidence: 0.5, probe: { topicA, topicB } },
        { title: `Invented ${m}`, description: "d", rationale: "r", supportingEvidence: [1], confidence: 0.5, probe: { topicA, topicB: `inventedtopic${m}k` } },
      ],
    } as never);

    const { done, gaps } = await runAnalysis({ evidenceMode: "hybrid" });

    expect(done.status).toBe("ready");
    expect(gaps).toHaveLength(2);
    expect(vi.mocked(computeGapEvidence).mock.calls.map(([input]) => input.probeCount)).toEqual([1]);
  });

  it("links a corpus paper close to the gap's own text as possible counter-evidence, never a paper it read", async () => {
    // A random direction: only the paper given this exact embedding is close to it.
    const gapVector = Array.from({ length: 768 }, () => Math.random() - 0.5);
    const prisma = getPrisma();
    // Its words do not match the topic, so keyword retrieval leaves it out of the evidence pack.
    const answer = await prisma.paper.create({ data: { title: `Unrelated wording ${m}`, abstractText: "A study that already answers the question.", publicationYear: 2024, primaryProvider: "user", dataStatus: "active" } });
    paperIds.push(answer.id);
    await prisma.$executeRaw`UPDATE papers SET embedding = ${vectorParameter(gapVector)}::vector WHERE id = ${answer.id}::uuid`;
    expect((await loadPaperEmbeddings([answer.id])).get(answer.id)?.[0]).toBeCloseTo(gapVector[0]!, 5);

    const original = vi.mocked(getEmbeddingProvider).getMockImplementation();
    vi.mocked(getEmbeddingProvider).mockReturnValue({
      embed: async () => { throw new Error("embedding unavailable in test"); },
      embedBatch: async (texts: string[]) => texts.map(() => gapVector),
    } as unknown as ReturnType<typeof getEmbeddingProvider>);
    try {
      const { done, gaps } = await runAnalysis({ evidenceMode: "hybrid" });

      expect(done.status).toBe("ready");
      const links = await prisma.researchGapPaper.findMany({ where: { gapId: gaps[0]!.id } });
      expect(links.filter((link) => link.kind === "possible_counter").map((link) => link.paperId)).toEqual([answer.id]);
      const evidence = links.filter((link) => link.kind === "evidence").map((link) => link.paperId);
      expect(evidence).not.toContain(answer.id);
    } finally {
      if (original) vi.mocked(getEmbeddingProvider).mockImplementation(original);
      await prisma.$executeRaw`UPDATE papers SET embedding = NULL WHERE id = ${answer.id}::uuid`;
    }
  });

  it("counts a paper whose embedding is close to both topics when semantic matching is on, and records the threshold", async () => {
    const prisma = getPrisma();
    const unit = (v: number[]) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
    const vA = unit(Array.from({ length: 768 }, () => Math.random() - 0.5)), vB = unit(Array.from({ length: 768 }, () => Math.random() - 0.5));
    // About 0.71 cosine to each topic (random vA, vB are nearly orthogonal), and none of the probe words: only semantic matching can count it.
    const synonym = await prisma.paper.create({ data: { title: `Synonym wording ${m}`, abstractText: "Different vocabulary for the same pair of ideas.", publicationYear: 2023, primaryProvider: "user", dataStatus: "active" } });
    paperIds.push(synonym.id);
    await prisma.$executeRaw`UPDATE papers SET embedding = ${vectorParameter(unit(vA.map((x, i) => x + vB[i]!)))}::vector WHERE id = ${synonym.id}::uuid`;

    const original = vi.mocked(getEmbeddingProvider).getMockImplementation();
    vi.mocked(getEmbeddingProvider).mockReturnValue({
      embed: async () => { throw new Error("embedding unavailable in test"); },
      embedBatch: async (texts: string[]) => texts.map((text) => (text === topicA ? vA : text === topicB ? vB : Array.from({ length: 768 }, () => Math.random() - 0.5))),
    } as unknown as ReturnType<typeof getEmbeddingProvider>);
    const settings = env as { GAP_PROBE_SEMANTIC_MIN_SIMILARITY: number }, previous = settings.GAP_PROBE_SEMANTIC_MIN_SIMILARITY;
    settings.GAP_PROBE_SEMANTIC_MIN_SIMILARITY = 0.6; // cosine is about 0.71 give or take the random overlap of vA and vB
    try {
      const { done, gaps } = await runAnalysis({ evidenceMode: "hybrid" });

      expect(done.status).toBe("ready");
      expect(gaps[0]!.parentCounts).toEqual({ a: PAPER_COUNT + 1, b: PAPER_COUNT + 1 });
      expect(gaps[0]!.intersectionCount).toBe(PAPER_COUNT + 1);
      expect(gaps[0]!.probe).toMatchObject({ topicA, topicB, semanticMinSimilarity: 0.6 });
    } finally {
      settings.GAP_PROBE_SEMANTIC_MIN_SIMILARITY = previous;
      if (original) vi.mocked(getEmbeddingProvider).mockImplementation(original);
      await prisma.$executeRaw`UPDATE papers SET embedding = NULL WHERE id = ${synonym.id}::uuid`;
    }
  });

  it("counts probe words only while semantic matching is off (the default)", async () => {
    const { gaps } = await runAnalysis({ evidenceMode: "hybrid" });
    expect(gaps[0]!.parentCounts).toEqual({ a: PAPER_COUNT, b: PAPER_COUNT });
    expect(gaps[0]!.probe).not.toHaveProperty("semanticMinSimilarity");
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
