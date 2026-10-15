import { afterEach, describe, expect, it, vi } from "vitest";
import * as database from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { workContributionsService as work } from "../work-contributions.service.js";
import { allocationService as allocations } from "../allocation.service.js";

const isolated = process.env.PROJECT_SLICE_TEST === "1" && process.env.DATABASE_URL?.includes("127.0.0.1:15439/lumigap_project_slice_test") && process.env.REDIS_URL === "redis://127.0.0.1:16389";
describe.skipIf(!isolated).sequential("contribution query growth audit", () => {
  const db = database.getPrisma();
  afterEach(() => vi.restoreAllMocks());
  async function fixture() {
    const user = await db.user.create({ data: { email: `perf-${crypto.randomUUID()}@example.org`, fullName: "Query audit", emailVerifiedAt: new Date() } });
    const project = await createProjectFixture({ data: { ownerId: user.id, title: "Query growth audit", status: "ACTIVE", createdAt: new Date(Date.now() - 86400000) } });
    return { id: project.id, actor: user.id };
  }
  function measure() {
    const operations: string[] = [];
    const measured = db.$extends({ query: { $allOperations({ model, operation, args, query }) { operations.push(`${model ?? "raw"}.${operation}`); return query(args); } } });
    vi.spyOn(database, "getPrisma").mockReturnValue(measured as unknown as ReturnType<typeof database.getPrisma>);
    return operations;
  }
  it("loads twenty work records with a bounded number of queries", async () => {
    const { id, actor } = await fixture();
    for (let n = 0; n < 20; n++) {
      const record = await db.projectContributionProposal.create({ data: { projectId: id, proposedById: actor, contributorId: actor, source: "MANUAL", title: `Protocol ${n}`, description: "Offline methodology and experiment protocol", status: "DRAFT", confirmationRequiredFrom: "CONTRIBUTOR", visibility: "PRIVATE", clientKey: crypto.randomUUID() } });
      await db.contributionParticipant.create({ data: { proposalId: record.id, userId: actor, roles: ["METHODOLOGY"] } });
    }
    const operations = measure();
    const list = await work.list(id, actor, { page: 1, pageSize: 20, q: "", filter: "TEAM" });
    console.info("AUDIT_WORK_LIST", JSON.stringify({ records: list.items.length, queries: operations.length }));
    expect(list.items).toHaveLength(20); expect(list.items.every(item => item.participants[0]?.userId === actor)).toBe(true);
    expect(operations.length).toBeLessThan(25);
  });
  it("loads twelve revisions without recomputing live eligibility per revision", async () => {
    const { id, actor } = await fixture();
    const period = await allocations.createPeriod(id, actor, { title: "Research phase", description: "Documented research methodology", scope: "Methodology effort in this phase", periodStart: new Date(Date.now() - 86400000).toISOString(), periodEnd: new Date().toISOString(), clientKey: crypto.randomUUID() });
    for (let n = 0; n < 12; n++) {
      const r = await allocations.draft(id, actor, period.id, { shares: [{ userId: actor, basisPoints: 10000, rationale: "Self-recorded research effort" }], rationale: "Documented methodology effort in this phase", clientKey: crypto.randomUUID() });
      await allocations.submit(id, actor, r.id, 1);
      await allocations.decide(id, actor, r.id, { decision: "DISPUTE", explanation: "Request an explicit updated proposal rationale" });
    }
    const operations = measure(); const history = await allocations.history(id, actor, period.id);
    console.info("AUDIT_ALLOCATION_HISTORY", JSON.stringify({ revisions: history.length, queries: operations.length }));
    expect(history).toHaveLength(12); expect(history.every(r => r.period.roster[0]?.id === actor && r.status === "DISPUTED")).toBe(true);
    expect(operations.length).toBeLessThan(25);
  });
});
