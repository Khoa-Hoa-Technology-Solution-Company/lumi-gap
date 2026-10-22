import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * P0.4 / P0.2 against a real PostgreSQL. OpenAlex is the only thing mocked (it
 * is an external service and the local path is what is under test): the
 * budget check says "unavailable", so every trend endpoint uses the local
 * corpus. Run only against a throwaway database:
 *   TRENDS_INTEGRATION=1 DATABASE_URL=postgresql://…/<name>_test vitest run <this file>
 */
vi.mock("../trend.openalex-client.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../trend.openalex-client.js")>()),
  isOpenAlexBudgetAvailable: () => false,
}));

import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { TopicTrendQuerySchema, TrendsOverviewQuerySchema } from "../dto/trends.schema.js";
import { getPostgresTrendsOverview } from "../trend.postgres.js";
import { trendService } from "../trend.service.js";

const enabled = process.env.TRENDS_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Use an isolated _test database");

const YEARS = [2020, 2021, 2022, 2023, 2024, 2025];
const run = randomUUID().slice(0, 8);
const FIELD = `p0-field-${run}`;
const OTHER_FIELD = `p0-other-${run}`;
const DOMAIN = `p0-domain-${run}`;
const topic = (name: string, field: string) => ({ topicName: `${name} ${run}`, openalexTopicId: `T9${run.replace(/\D/g, "").padEnd(4, "0").slice(0, 4)}${name}`, fieldId: field, fieldName: field, domainId: DOMAIN, domainName: DOMAIN });
const A = topic("A", FIELD);
const B = topic("B", FIELD);
const C = topic("C", FIELD); // only ever a secondary topic
const G = topic("G", OTHER_FIELD);

/** Per year: papers whose primary topic is A, B, or G (G papers also carry a
 *  secondary topic in FIELD, so they are inside the Data Scope of FIELD). */
const PLAN = YEARS.map((year, i) => ({ year, a: 5 + i * 3, b: 10, g: 4 }));
const paperIds: string[] = [];

describe.skipIf(!enabled).sequential("trend topic counting on PostgreSQL (P0.4)", () => {
  const db = getPrisma();

  beforeAll(async () => {
    const papers: Array<{ id: string; year: number }> = [];
    const topics: Array<Record<string, unknown>> = [];
    const add = (year: number, primary: typeof A, secondary: Array<typeof A>) => {
      const id = randomUUID();
      papers.push({ id, year });
      [primary, ...secondary].forEach((t, position) => topics.push({ paperId: id, ...t, isPrimary: position === 0, position }));
    };
    for (const row of PLAN) {
      // Every A paper also carries B and C; every B paper carries A. The old
      // query counted each of them in up to three topics.
      for (let k = 0; k < row.a; k++) add(row.year, A, [B, C]);
      for (let k = 0; k < row.b; k++) add(row.year, B, [A]);
      for (let k = 0; k < row.g; k++) add(row.year, G, [C]);
    }
    paperIds.push(...papers.map((paper) => paper.id));
    await db.paper.createMany({ data: papers.map(({ id, year }) => ({ id, title: `P0 trend counting ${run}`, primaryProvider: "openalex", publicationYear: year, dataStatus: "active" })) });
    await db.paperTopic.createMany({ data: topics as never });
  });

  afterAll(async () => {
    await db.paperTopic.deleteMany({ where: { paperId: { in: paperIds } } });
    await db.paper.deleteMany({ where: { id: { in: paperIds } } });
  });

  const overview = () => getPostgresTrendsOverview(TrendsOverviewQuerySchema.parse({ fieldIds: FIELD, yearFrom: "2020", yearTo: "2025", minPapers: "1", limit: "50" }));

  it("counts every paper in exactly one topic (its primary topic)", async () => {
    const result = await overview();
    const byName = new Map(result.topics.map((t) => [t.topic, t]));
    expect(byName.has(C.topicName)).toBe(false); // secondary-only topic is not a trend unit
    for (const row of PLAN) {
      expect(byName.get(A.topicName)!.yearlyBreakdown.find((y) => y.year === row.year)!.count).toBe(row.a);
      expect(byName.get(B.topicName)!.yearlyBreakdown.find((y) => y.year === row.year)!.count).toBe(row.b);
    }
  });

  it("keeps the shares of the topics of the field at or below 100% in every year", async () => {
    const result = await overview();
    const totals = new Map(result.yearlyTotalPapers.map((y) => [y.year, y.count]));
    for (const row of PLAN) {
      const scoped = totals.get(row.year)!;
      expect(scoped).toBe(row.a + row.b + row.g); // Data Scope: papers with any topic in FIELD
      const sum = result.topics.reduce((acc, t) => acc + (t.yearlyBreakdown.find((y) => y.year === row.year)?.count ?? 0), 0);
      expect((sum / scoped) * 100).toBeLessThanOrEqual(100);
      expect(sum).toBe(row.a + row.b);
    }
  });

  it("topic page and overview count the same topic papers (n_t)", async () => {
    const result = await overview();
    const fromList = result.topics.find((t) => t.topic === A.topicName)!;
    const detail = await trendService.topic(A.topicName, TopicTrendQuerySchema.parse({ topicId: A.openalexTopicId, yearFrom: "2020", yearTo: "2025", fieldIds: FIELD }));
    expect(detail.dataSource).toBe("local");
    expect(detail.statistics!.source).toBe("local");
    for (const share of detail.statistics!.shareSeries) {
      expect(share.count).toBe(fromList.yearlyBreakdown.find((y) => y.year === share.year)!.count);
    }
  });

  // C2 (P1.1): before P1 the overview divided by every scoped paper and the
  // topic page by the field population; both now use the same reference
  // population (trend.baseline.ts), with and without a Data Scope, at every level.
  const SCOPES = [["field-scoped", { fieldIds: FIELD }], ["unscoped", {}]] as const;
  for (const [label, scope] of SCOPES) {
    // "global" counts every paper of the database with a primary topic, which
    // other suites insert concurrently; it is covered by unit and live checks.
    for (const baseline of ["field", "domain"] as const) {
      it(`overview and topic page use the same N_t (${label}, baseline=${baseline})`, async () => {
        const query = { ...scope, yearFrom: "2020", yearTo: "2025", baseline };
        const result = await getPostgresTrendsOverview(TrendsOverviewQuerySchema.parse({ ...query, minPapers: "1", limit: "50" }));
        const fromList = result.topics.find((t) => t.topic === A.topicName)!;
        const detail = await trendService.topic(A.topicName, TopicTrendQuerySchema.parse({ ...query, topicId: A.openalexTopicId }));
        const stats = detail.statistics!;
        expect(stats.baseline.level).toBe(baseline);
        expect(stats.classification.mannKendall).toEqual(fromList.classification.mannKendall);
        expect(stats.classification.senSlope).toBe(fromList.classification.senSlope);
        // P1.3: same GGT on both pages, from the same n_t and N_t.
        expect(stats.ggt).toEqual(fromList.ggt);
        const N = (row: (typeof PLAN)[number]) => (baseline === "field" ? row.a + row.b : row.a + row.b + row.g);
        for (const year of stats.ggt!.annual.filter((y) => y.ggtPct !== null)) {
          const row = PLAN.find((r) => r.year === year.year)!, prev = PLAN.find((r) => r.year === year.year - 1)!;
          expect(year.ggtPct!).toBeCloseTo(((row.a - prev.a) / prev.a - (N(row) - N(prev)) / N(prev)) * 100, 10);
        }
        expect(stats.ggt!.n).toBe(stats.yearsUsed.length - 1);
        for (const share of stats.shareSeries) {
          const row = PLAN.find((r) => r.year === share.year)!;
          // field: primary topic in FIELD (A + B); domain: every seeded paper (A + B + G) is in DOMAIN.
          expect(share.total).toBe(baseline === "field" ? row.a + row.b : row.a + row.b + row.g);
          expect(share.count).toBe(row.a);
        }
      });
    }
  }

  it("the topic page applies the Data Scope (before P1 it ignored it)", async () => {
    // Every seeded paper is an "article" (default paper_kind): a review-only
    // scope leaves no paper of the topic, so the local topic page answers 404.
    await expect(trendService.topic(A.topicName, TopicTrendQuerySchema.parse({ topicId: A.openalexTopicId, yearFrom: "2020", yearTo: "2025", paperKinds: "review" }))).rejects.toThrow(/No papers found/);
    const article = await trendService.topic(A.topicName, TopicTrendQuerySchema.parse({ topicId: A.openalexTopicId, yearFrom: "2020", yearTo: "2025", paperKinds: "article" }));
    expect(article.statistics!.totalPapers).toBe(PLAN.reduce((sum, row) => sum + row.a, 0));
  });
});
