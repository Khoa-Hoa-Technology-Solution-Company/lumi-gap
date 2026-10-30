import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import * as Y from "yjs";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { manuscriptService as writing } from "../manuscript.service.js";
import { manuscriptWritingService as reports } from "../manuscript-writing.service.js";
import { manuscriptSuggestions } from "../manuscript-suggestions.js";
import { sourceDocument } from "../manuscript-source.js";
import { workContributionsService as work } from "../../projects/work-contributions.service.js";
import { contributionEvaluationService as evaluation } from "../../projects/contribution-evaluation.service.js";
import { allocationService } from "../../projects/allocation.service.js";

const enabled = process.env.MANUSCRIPT_WRITING_INTEGRATION === "1" || process.env.STUDENT_AFFILIATION_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Writing tests require an isolated _test database");
describe.skipIf(!enabled).sequential("retained writing in isolated PostgreSQL", () => {
  const db = getPrisma(); let owner: string, member: string, peer: string, outsider: string;
  beforeAll(async () => {
    const ids = [];
    for (const fullName of ["Writing Owner", "Writing Member", "Writing Peer", "Writing Outsider"]) {
      const row = await db.user.create({ data: { fullName, email: `retained-writing-${randomUUID()}@example.org`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
      await db.academicProfile.create({ data: { userId: row.id, academicRole: "RESEARCHER", primaryPosition: "RESEARCH_STAFF" } }); ids.push(row.id);
    }
    [owner, member, peer, outsider] = ids as [string, string, string, string];
  });
  async function fixture() {
    const project = await createProjectFixture({ data: { title: "Retained writing test", ownerId: owner, status: "ACTIVE", createdAt: new Date(Date.now() - 86400000) } });
    await db.projectMember.createMany({ data: [member, peer].map(userId => ({ projectId: project.id, userId })) });
    const manuscript = await writing.create(project.id, owner, { title: "Writing attribution study", template: "BLANK", documentType: "RESEARCH_PAPER", description: "", clientKey: randomUUID() });
    const file = (await writing.detail(project.id, owner, manuscript.id)).mainFileId!;
    return { project: project.id, id: manuscript.id, file };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function edit(f: Fixture, actor: string, update: (text: Y.Text) => void) {
    const saved = await writing.fileContent(f.project, actor, f.id, f.file), doc = sourceDocument(Buffer.from(saved.state!, "base64")), vector = Y.encodeStateVector(doc);
    update(doc.getText("source"));
    const input = { clientSessionId: randomUUID(), clientSequence: 1, update: Buffer.from(Y.encodeStateAsUpdate(doc, vector)).toString("base64") }; doc.destroy();
    await writing.applyUpdate(f.project, actor, f.id, f.file, input); return input;
  }
  async function ownerText(f: Fixture) { await edit(f, owner, text => { text.delete(0, text.length); text.insert(0, "\\begin{document}\nalpha beta gamma\n\\end{document}"); }); }
  async function calculate(f: Fixture) {
    const snapshot = await writing.snapshot(f.project, owner, f.id, { label: "Writing checkpoint", clientKey: randomUUID(), minimumSequences: {}, reuseUnchanged: true });
    const run = await reports.request(f.project, owner, f.id, snapshot.id); await reports.process(run.id);
    return reports.get(f.project, owner, f.id, run.id);
  }
  it("persists authenticated provenance, calculates 60/40, replays idempotently and freezes completed reports", async () => {
    const f = await fixture(); await ownerText(f);
    const update = await edit(f, member, text => text.insert(text.toString().indexOf("\\end{document}"), "delta epsilon "));
    await writing.applyUpdate(f.project, member, f.id, f.file, update);
    const report = await calculate(f);
    expect(report.status).toBe("COMPLETED"); expect(report.result?.totalWords).toBe(5); expect(report.result?.unknownWordUnits).toBe(0);
    expect(report.result?.members.find(m => m.userId === owner)?.suggestedBasisPoints).toBe(6000);
    expect(report.result?.members.find(m => m.userId === member)?.suggestedBasisPoints).toBe(4000);
    expect(await reports.request(f.project, owner, f.id, report.snapshotId)).toEqual(report);
    await reports.process(report.id);
    await expect(db.manuscriptWritingReport.update({ where: { id: report.id }, data: { inputHash: "0".repeat(64) } })).rejects.toThrow();
    await edit(f, member, text => text.insert(text.toString().indexOf("\\end{document}"), "zeta "));
    const old = await reports.get(f.project, owner, f.id, report.id); expect(old.isStale).toBe(true); expect(old.result).toEqual(report.result);
    const next = await calculate(f); expect(next.id).not.toBe(report.id); expect(next.result?.members.find(m => m.userId === owner)?.suggestedBasisPoints).toBe(5000);
  });
  it("records an accepted suggestion for its proposer and preserves original text through snapshot restoration", async () => {
    const f = await fixture(); await ownerText(f);
    const source = await writing.fileContent(f.project, owner, f.id, f.file), doc = sourceDocument(Buffer.from(source.state!, "base64"));
    const from = doc.getText("source").toString().indexOf("beta"); doc.destroy();
    const suggestion = await manuscriptSuggestions.create(f.project, member, f.id, { fileId: f.file, sourceSequence: source.sequence, from, to: from + 4, original: "beta", replacement: "new beta", note: "Clarify the retained writing example", clientKey: randomUUID() });
    await manuscriptSuggestions.resolve(f.project, owner, f.id, suggestion.id, "ACCEPTED", 1);
    const report = await calculate(f);
    expect(report.result?.members.find(m => m.userId === owner)?.retainedWordUnits).toBe(3000);
    expect(report.result?.members.find(m => m.userId === member)?.retainedWordUnits).toBe(1000);
    const restored = await writing.restore(f.project, owner, f.id, report.snapshotId, { title: "Restored writing study", clientKey: randomUUID() });
    const clone = { project: f.project, id: restored.id, file: (await writing.detail(f.project, owner, restored.id)).mainFileId! };
    expect((await calculate(clone)).result?.members).toEqual(report.result?.members);
  });
  it("retains the original writer after another account deletes and restores the prose", async () => {
    const f = await fixture(); await ownerText(f);
    await edit(f, member, text => { const start = text.toString().indexOf("alpha"); text.delete(start, "alpha beta gamma".length); });
    await edit(f, member, text => text.insert(text.toString().indexOf("\\end{document}"), "alpha beta gamma"));
    const report = await calculate(f);
    expect(report.result?.members.map(m => [m.userId, m.retainedWordUnits])).toEqual([[owner, 3000]]);
  });
  it("can calculate writing even when a snapshot cannot retain more than 200 comments", async () => {
    const f = await fixture(); await ownerText(f);
    await db.projectDiscussion.createMany({ data: Array.from({ length: 201 }, (_, i) => ({ projectId: f.project, targetKind: "MANUSCRIPT", targetId: f.id, authorId: owner, title: `Comment ${i}`, body: "Team discussion retained independently from writing measurements", clientKey: randomUUID() })) });
    const report = await calculate(f);
    expect(report.result?.attributedWordUnits).toBe(3000);
    const snapshot = await db.manuscriptSnapshot.findUniqueOrThrow({ where: { id: report.snapshotId } });
    expect(snapshot.collaborationState).toBeNull(); expect(snapshot.writingState).toBeTruthy();
  });
  it("keeps template/imported text unknown and rejects former, outsider and cross-project report access", async () => {
    const f = await fixture(), other = await fixture();
    const imported = await writing.createFile(f.project, owner, f.id, { path: "imported.tex", kind: "TEXT", content: "Imported unknown words", clientKey: randomUUID() });
    await edit(f, owner, text => text.insert(text.toString().indexOf("\\end{document}"), "\\input{imported}\n"));
    const report = await calculate(f);
    expect(report.result?.totalWords).toBe(3); expect(report.result?.unknownWordUnits).toBe(3000); expect(report.result?.members).toEqual([]);
    expect(report.result?.files.some(file => file.id === imported.id)).toBe(true);
    await expect(reports.contributionDraft(f.project, owner, f.id, report.id)).rejects.toMatchObject({ statusCode: 409 });
    await expect(reports.get(f.project, outsider, f.id, report.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(reports.get(other.project, owner, other.id, report.id)).rejects.toMatchObject({ statusCode: 404 });
    await db.projectMember.update({ where: { projectId_userId: { projectId: f.project, userId: member } }, data: { status: "REMOVED" } });
    await expect(reports.get(f.project, member, f.id, report.id)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("creates only a draft, attaches immutable writing evidence to a confirmed evaluation, and blocks duplicate manuscript scoring", async () => {
    const f = await fixture(); await ownerText(f);
    await edit(f, member, text => text.insert(text.toString().indexOf("\\end{document}"), "delta epsilon "));
    const report = await calculate(f);
    const contribution = await reports.contributionDraft(f.project, owner, f.id, report.id);
    expect(contribution.status).toBe("DRAFT"); expect(contribution.evidenceRefs).toEqual([{ kind: "MANUSCRIPT_SNAPSHOT", id: report.snapshotId }]);
    expect((await reports.contributionDraft(f.project, owner, f.id, report.id)).id).toBe(contribution.id);
    expect(await db.contributionOutcomeEvaluation.count({ where: { projectId: f.project } })).toBe(0);
    await work.submit(f.project, owner, contribution.id, 1);
    await work.review(f.project, member, contribution.id, { expectedVersion: 1, decision: "ACKNOWLEDGE", note: "Confirmed recorded writing in this version" });
    await work.review(f.project, peer, contribution.id, { expectedVersion: 1, decision: "ACCEPT", note: "Reviewed retained manuscript writing evidence" });
    const rule = await evaluation.createRule(f.project, owner, { title: "Writing scope weights", rationale: "Team confirms the scope and participation separately", defaultWeight: 1, maxWeight: 100, clientKey: randomUUID() });
    const input = { ruleId: rule.id, clientKey: randomUUID(), outcomeKey: "WRITING-01", expectedVersion: 0, contributionIds: [contribution.id], weight: 10, rationale: "Confirmed writing scope using retained prose as a starting suggestion", retrospectiveWeight: true, participation: report.result!.members.map(m => ({ userId: m.userId, basisPoints: m.suggestedBasisPoints! })), writingReportId: report.id };
    const proposed = await evaluation.propose(f.project, owner, input);
    expect(proposed.payload.writingReference?.inputHash).toBe(report.inputHash); expect(proposed.decisions).toHaveLength(0);
    const period = await allocationService.createPeriod(f.project, owner, { title: "After recorded writing", description: "A period that omits the earlier writing activity", scope: "Manuscript writing effort in the selected period", periodStart: new Date(new Date(report.result!.recordedThrough!).getTime() + 1).toISOString(), periodEnd: new Date().toISOString(), clientKey: randomUUID() });
    const board = await evaluation.board(f.project, owner, { periodId: period.id, page: 1, pageSize: 20 });
    expect(board.items[0]?.reasons).toContain("SOURCE_OUTSIDE_PERIOD");
    const second = await work.save(f.project, owner, { title: "Duplicate manuscript writing result", description: "Another record claiming the same complete writing outcome", source: "WORKSPACE", workDate: new Date().toISOString(), participants: contribution.participants.map(p => ({ userId: p.userId, roles: p.roles })), evidence: contribution.evidence, evidenceRefs: contribution.evidenceRefs, clientKey: randomUUID() });
    await work.submit(f.project, owner, second.id, 1);
    await expect(evaluation.propose(f.project, owner, { ...input, outcomeKey: "WRITING-02", clientKey: randomUUID(), contributionIds: [second.id] })).rejects.toMatchObject({ statusCode: 409 });
    const missingEvidence = await work.save(f.project, owner, { title: "No snapshot reference", description: "An otherwise valid work record without the writing snapshot", source: "MANUAL", workDate: new Date().toISOString(), participants: contribution.participants.map(p => ({ userId: p.userId, roles: p.roles })), evidence: "Meeting notes available for discussion", evidenceRefs: [], clientKey: randomUUID() });
    await work.submit(f.project, owner, missingEvidence.id, 1);
    await expect(evaluation.propose(f.project, owner, { ...input, outcomeKey: "WRITING-03", clientKey: randomUUID(), contributionIds: [missingEvidence.id] })).rejects.toMatchObject({ statusCode: 400 });
  });
});
