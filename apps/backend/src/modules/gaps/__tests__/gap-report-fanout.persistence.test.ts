import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { gapsService, REPORT_SOURCES_EXCLUDED_MESSAGE } from "../gaps.service.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";

// Never reach OpenAlex from tests.
vi.mock("../gap-global-evidence.js", () => ({ countOpenAlexIntersection: vi.fn().mockResolvedValue(null) }));
// Never reach OpenAlex from tests: coverage, corpus enrichment and OpenAlex counter-evidence are stubbed.
vi.mock("../gap-literature.js", () => ({ measureTopicCoverage: vi.fn().mockResolvedValue(null), enrichCorpusForTopic: vi.fn(), findOpenAlexCounterPapers: vi.fn().mockResolvedValue([]) }));
// Never enqueue real jobs from tests.
vi.mock("../../../infrastructure/queue.js", () => ({ gapsQueue: { add: vi.fn().mockResolvedValue(undefined) }, notificationQueue: { add: vi.fn().mockResolvedValue(undefined) } }));

const randomLetters = (length: number) => Array.from({ length }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");

describe.sequential("fan-out of report gaps into research gaps (PostgreSQL)", () => {
  const m = randomLetters(10);
  // Unique words ending in "k" (no stem rule), so the probe only matches this test's papers.
  const topicA = `fa${m}k`;
  const topicB = `fb${m}k`;
  const prisma = getPrisma();
  const paperIds: string[] = [];
  const reportIds: string[] = [];
  let userId = "";
  let projectId = "";

  const snapshot = (title: string) => ({
    title,
    description: `${title} description`,
    rationale: `${title} rationale`,
    supportingPaperIds: [paperIds[0]],
    confidence: 0.6,
    probe: { topicA, topicB },
  });

  async function createReport(status: string) {
    const report = await prisma.report.create({
      data: { userId, query: `fanout ${m}`, status, researchGapSnapshots: [snapshot("First gap"), snapshot("Second gap")] as never },
    });
    reportIds.push(report.id);
    await prisma.reportPaper.createMany({ data: paperIds.map((paperId, position) => ({ reportId: report.id, paperId, kind: "grounding", position })) });
    return report;
  }
  const gapsOf = (reportId: string) => prisma.researchGap.findMany({ where: { sourceReportId: reportId } });

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { fullName: "Fan-out user", email: `gap-fanout-${m}@example.test`, emailVerifiedAt: new Date() } });
    userId = user.id;
    for (let i = 0; i < 3; i += 1) {
      const paper = await prisma.paper.create({
        data: { title: `Fan-out paper ${i} ${m}`, abstractText: `Links ${topicA} with ${topicB} in study ${i}.`, publicationYear: 2024, primaryProvider: "user", dataStatus: "active" },
      });
      paperIds.push(paper.id);
    }
  });

  afterAll(async () => {
    const gaps = await prisma.researchGap.findMany({ where: { sourceReportId: { in: reportIds } }, select: { id: true } });
    await prisma.researchGapPaper.deleteMany({ where: { gapId: { in: gaps.map((gap) => gap.id) } } });
    await prisma.researchGap.deleteMany({ where: { id: { in: gaps.map((gap) => gap.id) } } });
    await prisma.reportPaper.deleteMany({ where: { reportId: { in: reportIds } } });
    await prisma.report.deleteMany({ where: { id: { in: reportIds } } });
    if (projectId) {
      await prisma.projectActivity.deleteMany({ where: { projectId } });
      await prisma.projectPaper.deleteMany({ where: { projectId } });
      await prisma.project.deleteMany({ where: { id: projectId } });
    }
    await prisma.paper.deleteMany({ where: { id: { in: paperIds } } });
    if (userId) await prisma.notification.deleteMany({ where: { userId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("creates the report's gaps once, even when the job runs twice", async () => {
    const report = await createReport("ready");

    await gapsService.fanOutGapsFromReport({ reportId: report.id });
    await gapsService.fanOutGapsFromReport({ reportId: report.id });

    const gaps = await gapsOf(report.id);
    expect(gaps).toHaveLength(2);
    expect(gaps.map((gap) => gap.title).sort()).toEqual(["First gap", "Second gap"]);
    expect(gaps.every((gap) => gap.source === "report" && gap.userId === userId)).toBe(true);
    // The probe is scored over the corpus, so the three matching papers are found.
    expect(gaps.every((gap) => gap.intersectionCount === 3)).toBe(true);
    const links = await prisma.researchGapPaper.findMany({ where: { gapId: { in: gaps.map((gap) => gap.id) }, kind: "evidence" } });
    expect(links).toHaveLength(2 * paperIds.length);
  });

  it("keeps a probe whose second topic occurs only in a grounding paper that is not cited", async () => {
    const onlyB = `onlyb${m}k`;
    const extra = await prisma.paper.create({ data: { title: `Fan-out extra ${m}`, abstractText: `Mentions ${onlyB} alone.`, publicationYear: 2024, primaryProvider: "user", dataStatus: "active" } });
    paperIds.push(extra.id);
    const report = await prisma.report.create({
      data: { userId, query: `fanout keep ${m}`, status: "ready", researchGapSnapshots: [{ ...snapshot("Rare intersection"), supportingPaperIds: [paperIds[0]], probe: { topicA, topicB: onlyB } }] as never },
    });
    reportIds.push(report.id);
    await prisma.reportPaper.createMany({ data: [...paperIds].map((paperId, position) => ({ reportId: report.id, paperId, kind: "grounding", position })) });

    await gapsService.fanOutGapsFromReport({ reportId: report.id });

    const [gap] = await gapsOf(report.id);
    expect(gap!.probe).toEqual({ topicA, topicB: onlyB });
  });

  it("drops a report probe whose topic is in none of the evidence papers", async () => {
    const report = await prisma.report.create({
      data: { userId, query: `fanout drop ${m}`, status: "ready", researchGapSnapshots: [{ ...snapshot("Invented probe gap"), probe: { topicA, topicB: `inventedtopic${m}k` } }] as never },
    });
    reportIds.push(report.id);
    await prisma.reportPaper.createMany({ data: paperIds.map((paperId, position) => ({ reportId: report.id, paperId, kind: "grounding", position })) });

    await gapsService.fanOutGapsFromReport({ reportId: report.id });

    const [gap] = await gapsOf(report.id);
    expect(gap!.probe).toBeNull();
    expect(gap!.intersectionCount).toBeNull();
    expect(gap!.globalEvidence).toBeNull();
  });

  it("fails a project fan-out without retries when a source was excluded, and tells the owner once", async () => {
    const project = await createProjectFixture({ data: { title: `Fan-out project ${m}`, ownerId: userId } });
    projectId = project.id;
    // paperIds[0] is the cited paper; it was excluded after the report ran.
    await prisma.projectPaper.createMany({ data: paperIds.slice(0, 3).map((paperId, index) => ({ projectId, paperId, screeningStatus: index === 0 ? "EXCLUDED" : "INCLUDED" })) });
    const report = await prisma.report.create({ data: { userId, projectId, query: `fanout project ${m}`, status: "ready", researchGapSnapshots: [snapshot("Project gap")] as never } });
    reportIds.push(report.id);
    await prisma.reportPaper.createMany({ data: paperIds.slice(1, 3).map((paperId, position) => ({ reportId: report.id, paperId, kind: "grounding", position })) });

    await expect(gapsService.fanOutGapsFromReport({ reportId: report.id })).rejects.toMatchObject({ statusCode: 409, nonRetryable: true, message: REPORT_SOURCES_EXCLUDED_MESSAGE });
    expect(await gapsOf(report.id)).toHaveLength(0);

    await gapsService.notifyReportGapFanoutFailed(report.id, REPORT_SOURCES_EXCLUDED_MESSAGE);
    await gapsService.notifyReportGapFanoutFailed(report.id, REPORT_SOURCES_EXCLUDED_MESSAGE);
    const notes = await prisma.notification.findMany({ where: { userId, type: "report_gaps_failed" } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ message: REPORT_SOURCES_EXCLUDED_MESSAGE, targetKind: "report", targetUuid: report.id });
  });

  it("creates nothing for a report that is not ready", async () => {
    const report = await createReport("analyzing");

    await gapsService.fanOutGapsFromReport({ reportId: report.id });

    expect(await gapsOf(report.id)).toHaveLength(0);
  });
});
