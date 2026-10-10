import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { gapsService } from "../gaps.service.js";

// Never enqueue real jobs from tests.
vi.mock("../../../infrastructure/queue.js", () => ({ gapsQueue: { add: vi.fn().mockResolvedValue(undefined) } }));

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
    const user = await prisma.user.create({ data: { fullName: "Fan-out user", email: `gap-fanout-${m}@example.test` } });
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
    await prisma.paper.deleteMany({ where: { id: { in: paperIds } } });
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

  it("creates nothing for a report that is not ready", async () => {
    const report = await createReport("analyzing");

    await gapsService.fanOutGapsFromReport({ reportId: report.id });

    expect(await gapsOf(report.id)).toHaveLength(0);
  });
});
