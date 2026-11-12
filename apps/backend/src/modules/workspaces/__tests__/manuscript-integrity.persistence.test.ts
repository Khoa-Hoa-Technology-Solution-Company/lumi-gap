import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import * as Y from "yjs";
import express from "express";
import { once } from "node:events";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { manuscriptService as writing } from "../manuscript.service.js";
import { manuscriptIntegrityService as integrity } from "../manuscript-integrity.service.js";
import { manuscriptAttributionService as attribution } from "../manuscript-attribution.service.js";
import { projectMentorshipService as mentorship } from "../../projects/project-mentorship.service.js";
import { mentorAccessService } from "../../projects/mentor-access.service.js";
import { sourceDocument } from "../manuscript-source.js";
import { integrityDigest } from "../integrity-citations.js";
import { manuscriptRouter } from "../manuscript.routes.js";
import { errorHandler } from "../../../common/middleware/error-handler.js";
import { tokenService, hashOpaqueToken } from "../../auth/token.service.js";
import type { IntegrityRightsInput, IntegrityPolicyInput } from "@trend/shared-types";
vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn().mockResolvedValue({}) }, aiJobsQueue: { add: vi.fn().mockResolvedValue({}) }, manuscriptCompileQueue: { add: vi.fn().mockResolvedValue({}) } }));
const enabled = process.env.MANUSCRIPT_INTEGRITY_INTEGRATION === "1";
if (enabled && (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test") || !["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname))) throw new Error("A local isolated test database is required");
describe.skipIf(!enabled).sequential("snapshot research integrity on PostgreSQL", () => {
  const db = getPrisma(); let owner: string, member: string, outsider: string;
  async function user() {
    const row = await db.user.create({ data: { email: `${randomUUID()}@integrity.invalid`, fullName: "Research participant", emailVerifiedAt: new Date(), onboardingCompletedAt: new Date(), admissionBasis: "INVITATION" } });
    await db.academicProfile.create({ data: { userId: row.id, primaryPosition: "RESEARCH_STAFF", academicRole: "RESEARCHER" } }); return row.id;
  }
  beforeEach(async () => { [owner, member, outsider] = await Promise.all([user(), user(), user()]); });
  afterAll(disconnectPostgres);
  async function fixture() {
    const project = await createProjectFixture({ data: { title: "Integrity study", ownerId: owner, status: "ACTIVE", description: "PRIVATE-RESEARCH-NOTES", mentorshipSummary: "Approved mentoring preview for a collaborative research methods study" } });
    await db.projectMember.create({ data: { projectId: project.id, userId: member } });
    const draft = await writing.create(project.id, owner, { title: "Methods manuscript", template: "BLANK", documentType: "RESEARCH_PAPER", description: "", clientKey: randomUUID() });
    const snapshot = await writing.snapshot(project.id, owner, draft.id, { label: "Saved evidence", clientKey: randomUUID(), minimumSequences: {} });
    const saved = await db.manuscriptSnapshot.findUniqueOrThrow({ where: { id: snapshot.id }, select: { checksum: true } });
    return { project: project.id, manuscript: draft.id, snapshot: snapshot.id, checksum: saved.checksum, file: draft.mainFileId! };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const view = (f: Fixture, actor = owner) => integrity.overview(f.project, actor, f.manuscript, f.snapshot);
  const command = (f: Fixture, body: unknown, actor = owner) => integrity.command(f.project, actor, f.manuscript, f.snapshot, body);
  async function verified(f: Fixture) {
    const check = await attribution.saveAttributionCheck(f.project, owner, f.manuscript, f.snapshot, { proposedAuthors: [{ userId: owner, order: 1, displayName: "Research author 1", email: "author-1@example.invalid", affiliation: "Test institution", corresponding: true, creditRoles: ["CONCEPTUALIZATION"] }, { userId: member, order: 2, displayName: "Research author 2", email: "author-2@example.invalid", affiliation: "Test institution", corresponding: false, creditRoles: ["WRITING_REVIEW_EDITING"] }], acknowledgements: [], omittedContributors: [] });
    await attribution.decideAttributionCheck(f.project, owner, f.manuscript, check.checkId!, { decision: "CONFIRM", note: "Explicit approval of this exact version" });
    await attribution.decideAttributionCheck(f.project, member, f.manuscript, check.checkId!, { decision: "CONFIRM", note: "I reviewed the author list and order" });
  }
  const ai = { disclosure: "AI was used for language review only. Authors checked every claim and citation.", venuePolicy: "Research venue policy", externalUsage: [{ tool: "External writing tool", category: "LANGUAGE", purpose: "Grammar and spelling review", affectedSections: "Introduction" }] };
  const rights: IntegrityRightsInput = { holders: ["Declared research authors"], basis: "JOINT_CLAIM", basisExplanation: "Joint claim subject to the authors' agreement", institutionalArrangement: "", thirdPartyContent: "No third-party figures declared", restrictions: "", unresolvedQuestions: "", supportingReferences: [], prohibitsInternalSubmission: false };
  const policy: IntegrityPolicyInput = { requireAiAcknowledgement: true, requireRightsAcknowledgement: true, requireCitationAudit: true, requireCurrentSnapshot: true, reason: "Institutional internal submission policy" };
  async function acknowledge(f: Fixture, record: Awaited<ReturnType<typeof command>>, actor: string) {
    return command(f, { kind: "ACKNOWLEDGE", recordId: record.id, evidenceDigest: record.evidenceDigest, confirmed: true }, actor);
  }
  async function edit(f: Fixture, text: string, actor = owner) {
    const file = await writing.fileContent(f.project, actor, f.manuscript, f.file), doc = sourceDocument(Buffer.from(file.state!, "base64")), vector = Y.encodeStateVector(doc);
    const source = doc.getText("source"); source.delete(0, source.length); source.insert(0, text);
    await writing.applyUpdate(f.project, actor, f.manuscript, f.file, { clientSessionId: randomUUID(), clientSequence: 1, update: Buffer.from(Y.encodeStateAsUpdate(doc, vector)).toString("base64") }); doc.destroy();
    return writing.fileContent(f.project, actor, f.manuscript, f.file);
  }
  it("reuses authoritative authorship without turning owners, mentors or writing statistics into authors", async () => {
    const f = await fixture(), result = await view(f);
    expect(result.authorship.proposedAuthors).toEqual([]); expect(result.maySubmit).toBe(false);
    expect(result.checks.find(check => check.area === "AUTHORSHIP")?.blocking).toBe(true);
    expect(result.notice).toContain("do not certify"); expect(result).not.toHaveProperty("integrityScore");
  });
  it("allows advisory evidence to be missing but preserves mandatory author confirmation", async () => {
    const f = await fixture(); await expect(writing.publish(f.project, owner, f.manuscript, f.snapshot, [owner, member])).rejects.toMatchObject({ statusCode: 409 });
    await verified(f); const ready = await view(f); expect(ready.maySubmit).toBe(true); expect(ready.state).toBe("NEEDS_REVIEW");
    const sealed = await writing.publish(f.project, member, f.manuscript, f.snapshot, [owner, member]);
    const revision = await db.submissionRevision.findUniqueOrThrow({ where: { id: sealed.revisionId } });
    expect(revision.integrityReportId).toBeTruthy(); expect(revision.attributionCheckId).toBeTruthy();
    expect(await writing.publish(f.project, member, f.manuscript, f.snapshot, [owner, member])).toEqual(sealed);
  });
  it("enforces configured checks at publication, requires each author's own acknowledgment and seals the exact report", async () => {
    const f = await fixture(); await verified(f); await command(f, { kind: "POLICY", expectedVersion: 0, clientKey: randomUUID(), content: policy });
    await expect(writing.publish(f.project, owner, f.manuscript, f.snapshot, [owner, member])).rejects.toMatchObject({ statusCode: 409 });
    await command(f, { kind: "CITATION_AUDIT", clientKey: randomUUID() });
    const aiRecord = await command(f, { kind: "AI_DECLARATION", expectedVersion: 0, clientKey: randomUUID(), content: ai });
    const rightsRecord = await command(f, { kind: "RIGHTS_DECLARATION", expectedVersion: 0, clientKey: randomUUID(), content: rights });
    for (const record of [aiRecord, rightsRecord]) for (const actor of [owner, member]) await acknowledge(f, record, actor);
    expect((await view(f)).maySubmit).toBe(true);
    const sealed = await writing.publish(f.project, owner, f.manuscript, f.snapshot, [owner, member]);
    const revision = await db.submissionRevision.findUniqueOrThrow({ where: { id: sealed.revisionId } });
    const report = await db.manuscriptIntegrityRecord.findUniqueOrThrow({ where: { id: revision.integrityReportId! } });
    expect(report.kind).toBe("READINESS_REPORT"); expect(report.snapshotId).toBe(f.snapshot);
    expect(JSON.stringify(report.content)).not.toContain("PRIVATE-RESEARCH-NOTES");
  });
  it("rejects forged acknowledgments and unauthorized rights/policy changes", async () => {
    const f = await fixture(); await verified(f);
    const record = await command(f, { kind: "AI_DECLARATION", expectedVersion: 0, clientKey: randomUUID(), content: ai });
    await expect(command(f, { kind: "ACKNOWLEDGE", recordId: record.id, evidenceDigest: record.evidenceDigest, confirmed: true, userId: member })).rejects.toThrow();
    await expect(acknowledge(f, record, outsider)).rejects.toMatchObject({ statusCode: 403 });
    await expect(command(f, { kind: "RIGHTS_DECLARATION", expectedVersion: 0, clientKey: randomUUID(), content: rights }, member)).rejects.toMatchObject({ statusCode: 403 });
    await expect(command(f, { kind: "POLICY", expectedVersion: 0, clientKey: randomUUID(), content: policy }, member)).rejects.toMatchObject({ statusCode: 403 });
    expect(await db.manuscriptIntegrityAcknowledgement.count({ where: { recordId: record.id } })).toBe(0);
  });
  it("supports limited declaration review by former proposed authors without restoring project/source access", async () => {
    const f = await fixture(); await verified(f);
    const record = await command(f, { kind: "AI_DECLARATION", expectedVersion: 0, clientKey: randomUUID(), content: ai });
    await db.projectMember.update({ where: { projectId_userId: { projectId: f.project, userId: member } }, data: { status: "LEFT" } });
    await expect(view(f, member)).rejects.toMatchObject({ statusCode: 404 });
    await expect(writing.fileContent(f.project, member, f.manuscript, f.file)).rejects.toMatchObject({ statusCode: 404 });
    const packet = await integrity.declarationPacket(f.project, member, f.manuscript, f.snapshot, record.id);
    expect(packet.record.id).toBe(record.id); expect(packet).not.toHaveProperty("manifest");
    await acknowledge(f, record, member);
    expect(await db.manuscriptIntegrityAcknowledgement.count({ where: { recordId: record.id, userId: member } })).toBe(1);
    await expect(integrity.declarationPacket(f.project, outsider, f.manuscript, f.snapshot, record.id)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("keeps snapshot declarations immutable and handles duplicate commands and concurrent confirmations", async () => {
    const f = await fixture(); await verified(f); const body = { kind: "AI_DECLARATION", expectedVersion: 0, clientKey: randomUUID(), content: ai };
    const [first, second] = await Promise.all([command(f, body), command(f, body)]); expect(first.id).toBe(second.id);
    await expect(command(f, { ...body, content: { ...ai, disclosure: "A changed declaration with the same command key" } })).rejects.toMatchObject({ statusCode: 409 });
    await Promise.all([acknowledge(f, first, member), acknowledge(f, first, member)]);
    expect(await db.manuscriptIntegrityAcknowledgement.count({ where: { recordId: first.id } })).toBe(1);
    await expect(db.manuscriptIntegrityRecord.update({ where: { id: first.id }, data: { content: {} } })).rejects.toThrow();
    await expect(db.manuscriptIntegrityAcknowledgement.deleteMany({ where: { recordId: first.id } })).rejects.toThrow();
  });
  it("marks AI disclosure stale after assistance evidence changes, without guessing external usage", async () => {
    const f = await fixture(); await verified(f); const record = await command(f, { kind: "AI_DECLARATION", expectedVersion: 0, clientKey: randomUUID(), content: ai });
    await acknowledge(f, record, owner); await acknowledge(f, record, member);
    await db.aiRun.create({ data: { ownerId: owner, projectId: f.project, workspaceId: f.manuscript, jobType: "manuscript_writing", prompt: JSON.stringify({ action: "grammar", secret: "PRIVATE-AI-CREDENTIAL" }), status: "completed", resultSummary: "PRIVATE-GENERATED-TEXT" } });
    const result = await view(f); expect(result.checks.find(check => check.area === "AI")?.state).toBe("STALE");
    expect(result.aiOperations[0]?.acceptedEdits).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("PRIVATE-AI-CREDENTIAL"); expect(JSON.stringify(result)).not.toContain("PRIVATE-GENERATED-TEXT");
    await expect(acknowledge(f, record, owner)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("records accepted AI edits only for the authenticated run owner and a persisted matching file sequence", async () => {
    const f = await fixture(), proposal = "Human-reviewed AI language assistance.";
    const run = await db.aiRun.create({ data: { ownerId: member, projectId: f.project, workspaceId: f.manuscript, jobType: "manuscript_writing", status: "completed", prompt: JSON.stringify({ action: "grammar" }), resultSummary: JSON.stringify({ text: proposal, explanation: "Language review", citations: [], warnings: [], scope: { fileId: f.file } }) } });
    await expect(integrity.recordAiAcceptance(f.project, member, f.manuscript, run.id, { fileId: f.file, sequence: 1, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    const source = await edit(f, `\\begin{document}${proposal}\\end{document}`, member), key = randomUUID();
    await expect(integrity.recordAiAcceptance(f.project, owner, f.manuscript, run.id, { fileId: f.file, sequence: source.sequence, clientKey: key })).rejects.toMatchObject({ statusCode: 404 });
    const acceptance = await integrity.recordAiAcceptance(f.project, member, f.manuscript, run.id, { fileId: f.file, sequence: source.sequence, clientKey: key });
    expect((await view(f)).aiOperations[0]?.acceptedEdits[0]).toMatchObject({ acceptedById: member, exactSourceCaptured: false });
    const snapshot = await writing.snapshot(f.project, owner, f.manuscript, { label: "After accepted edit", clientKey: randomUUID(), minimumSequences: {} });
    expect((await view({ ...f, snapshot: snapshot.id })).aiOperations[0]?.acceptedEdits[0]).toMatchObject({ id: acceptance.id, exactSourceCaptured: true });
    await edit(f, "\\begin{document}A later human revision.\\end{document}", member);
    expect(await integrity.recordAiAcceptance(f.project, member, f.manuscript, run.id, { fileId: f.file, sequence: source.sequence, clientKey: key })).toEqual(acceptance);
    const other = await fixture(), stored = await db.manuscriptAiAcceptance.findUniqueOrThrow({ where: { id: acceptance.id } });
    const { id: _id, ...fields } = stored;
    await expect(db.manuscriptAiAcceptance.create({ data: { ...fields, projectId: other.project, workspaceId: other.manuscript, fileId: other.file, clientKey: randomUUID() } })).rejects.toMatchObject({ code: "P2003" });
  });
  it("audits authorized cached source metadata, retains provider status provenance and detects stale metadata", async () => {
    const f = await fixture(), doi = `10.1000/${randomUUID()}`;
    const paper = await db.paper.create({ data: { title: "A relevant scientific source", publicationYear: 2024, doi, primaryProvider: "openalex", dataStatus: "active" } });
    await db.projectPaper.create({ data: { projectId: f.project, paperId: paper.id, addedById: owner } });
    const provider = await db.apiProvider.upsert({ where: { providerName: "openalex" }, create: { providerName: "openalex", baseUrl: "https://api.openalex.org" }, update: {} });
    const record = await db.paperSourceRecord.create({ data: { paperId: paper.id, providerId: provider.id, fetchedAt: new Date(), rawMetadata: { is_retracted: true } } });
    await writing.createFile(f.project, owner, f.manuscript, { path: "refs.bib", kind: "TEXT", content: `@article{study,title={A relevant scientific source},author={Smith, A},year={2024},doi={${doi}}}`, clientKey: randomUUID() });
    await edit(f, "\\begin{document}\\cite{study}\\bibliography{refs}\\end{document}");
    const snapshot = await writing.snapshot(f.project, owner, f.manuscript, { label: "References", clientKey: randomUUID(), minimumSequences: {} });
    const current = { ...f, snapshot: snapshot.id };
    const audit = await command(current, { kind: "CITATION_AUDIT", clientKey: randomUUID() });
    const result = audit.content as { findings: Array<{ code: string }>; entries: Array<{ evidence: { sourceRecordId: string }; identity: string }> };
    expect(result.entries[0]?.identity).toBe("CONFIRMED"); expect(result.entries[0]?.evidence.sourceRecordId).toBe(record.id);
    expect(result.findings.some(finding => finding.code === "SOURCE_RETRACTED")).toBe(true);
    await db.paper.update({ where: { id: paper.id }, data: { title: "Corrected title from provider" } });
    expect((await view(current)).checks.find(check => check.area === "CITATIONS")?.state).toBe("STALE");
    const rerun = await command(current, { kind: "CITATION_AUDIT", clientKey: randomUUID() });
    expect(JSON.stringify(rerun.content)).toContain("DOI_METADATA_MISMATCH");
  });
  it("keeps mentors and approved contribution references separate from authorship and hides private conversations after revocation", async () => {
    const f = await fixture(), mentor = await user();
    await db.academicProfile.update({ where: { userId: mentor }, data: { academicRole: "LECTURER", roleVerificationStatus: "VERIFIED", positionStatus: "VERIFIED", supportAvailability: { enabled: true } } });
    const request = await mentorship.request(f.project, owner, { mentorUserId: mentor, message: "Please guide the research design and methodology", idempotencyKey: randomUUID() });
    await mentorship.accept(f.project, request.id, mentor, "Accepted", request.accessPolicy?.version);
    const access = await db.mentorAccess.findUniqueOrThrow({ where: { requestId: request.id } });
    await db.mentorFeedback.create({ data: { projectId: f.project, accessId: access.id, authorId: mentor, kind: "REVIEW", body: "PRIVATE-MENTOR-CONVERSATION", status: "ACCEPTED", handledById: owner, handledAt: new Date(), clientKey: randomUUID() } });
    await expect(view(f, mentor)).rejects.toMatchObject({ statusCode: 404 });
    await mentorAccessService.revoke(f.project, owner, access.id, { expectedVersion: access.version, reason: "End scoped mentorship access", confirmed: true });
    const result = await view(f); expect(result.mentors[0]).toMatchObject({ userId: mentor, accessRevoked: true, status: "ENDED" });
    expect(result.authorship.proposedAuthors.some(author => author.userId === mentor)).toBe(false);
    const report = await command(f, { kind: "READINESS_REPORT", clientKey: randomUUID() });
    expect(JSON.stringify(report.content)).not.toContain("PRIVATE-MENTOR-CONVERSATION");
  });
  it("preserves an explicit rights restriction at submission without granting ownership or technical access", async () => {
    const f = await fixture(); await verified(f);
    await command(f, { kind: "RIGHTS_DECLARATION", expectedVersion: 0, clientKey: randomUUID(), content: { ...rights, prohibitsInternalSubmission: true, restrictions: "Institutional permission is still required" } });
    await expect(writing.publish(f.project, owner, f.manuscript, f.snapshot, [owner, member])).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.mentorAccess.count({ where: { projectId: f.project } })).toBe(0);
    expect(await db.projectMember.count({ where: { projectId: f.project } })).toBe(2);
    await expect(command(f, { kind: "RIGHTS_DECLARATION", expectedVersion: 1, clientKey: randomUUID(), content: { ...rights, supportingReferences: ["javascript:alert(1)"] } })).rejects.toThrow();
  });
  it("exports permission-scoped reports and marks old evidence stale after source or policy changes", async () => {
    const f = await fixture(); await verified(f); const report = await command(f, { kind: "READINESS_REPORT", clientKey: randomUUID() });
    const initial = await integrity.exportReport(f.project, member, f.manuscript, f.snapshot, report.id); expect(initial.stale).toBe(false);
    expect(integrityDigest({ projectId: f.project, manuscriptId: f.manuscript, snapshotId: f.snapshot, kind: initial.recordKind, version: initial.reportVersion, content: initial.report, evidenceDigest: (initial.report as { evidenceDigest: string }).evidenceDigest, createdById: initial.createdById })).toBe(initial.reportChecksum);
    await edit(f, "\\begin{document}New scientific source.\\end{document}");
    const exported = await integrity.exportReport(f.project, owner, f.manuscript, f.snapshot, report.id);
    expect(exported.stale).toBe(true); expect(JSON.stringify(exported)).not.toContain("New scientific source.");
    expect((await view(f)).snapshotChecksum).toBe(f.checksum);
    await db.project.update({ where: { id: f.project }, data: { exportPolicy: "OWNER_ONLY" } });
    await expect(integrity.exportReport(f.project, member, f.manuscript, f.snapshot, report.id)).rejects.toMatchObject({ statusCode: 403 });
    await expect(integrity.exportReport(f.project, outsider, f.manuscript, f.snapshot, report.id)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("serializes snapshot evaluation with collaborative source changes and preserves the selected snapshot", async () => {
    const f = await fixture();
    const [report] = await Promise.all([command(f, { kind: "READINESS_REPORT", clientKey: randomUUID() }), edit(f, "\\begin{document}Concurrent update.\\end{document}")]);
    const body = report.content as { snapshotChecksum: string; snapshotId: string };
    expect(body.snapshotChecksum).toBe(f.checksum); expect(body.snapshotId).toBe(f.snapshot);
    expect((await view(f)).currentSnapshot).toBe(false);
  });
  it("serializes submission against an author changing confirmation without silently bypassing the attribution gate", async () => {
    const f = await fixture(); await verified(f); const check = await attribution.getAttributionCheck(f.project, member, f.manuscript, f.snapshot);
    const [decision, submission] = await Promise.allSettled([
      attribution.decideAttributionCheck(f.project, member, f.manuscript, check.checkId!, { decision: "DISPUTE", note: "New attribution evidence requires review", expectedDecisionId: check.decisions.filter(d => d.userId === member).at(-1)!.id }),
      writing.publish(f.project, owner, f.manuscript, f.snapshot, [owner, member]),
    ]);
    if (submission.status === "fulfilled") {
      expect(decision.status).toBe("rejected");
      if (decision.status === "rejected") expect(decision.reason).toMatchObject({ statusCode: 409 });
      const revision = await db.submissionRevision.findUniqueOrThrow({ where: { id: submission.value.revisionId } });
      const report = await integrity.exportReport(f.project, owner, f.manuscript, f.snapshot, revision.integrityReportId!);
      expect((report.report as { maySubmit: boolean }).maySubmit).toBe(true);
    } else { expect(decision.status).toBe("fulfilled"); expect(submission.reason).toMatchObject({ statusCode: 409 }); expect(await db.submissionRevision.count({ where: { manuscriptSnapshotId: f.snapshot } })).toBe(0); expect((await view(f)).maySubmit).toBe(false); }
  });
  it("keeps archived projects read-only even when their author list has already been confirmed", async () => {
    const f = await fixture(); await verified(f); await db.project.update({ where: { id: f.project }, data: { status: "ARCHIVED" } });
    expect((await view(f)).maySubmit).toBe(false);
    await expect(writing.publish(f.project, owner, f.manuscript, f.snapshot, [owner, member])).rejects.toThrow();
  });
  it("reuses authoritative disputes, so a confirmed author list cannot bypass an unresolved mandatory dispute", async () => {
    const f = await fixture(); await verified(f);
    await db.researchIntegrityCase.create({ data: { projectId: f.project, kind: "ATTRIBUTION_DISPUTE", targetKind: "MANUSCRIPT", targetId: f.manuscript, reporterId: member, title: "Unresolved author evidence", description: "PRIVATE-DISPUTE-EVIDENCE" } });
    const result = await view(f); expect(result.maySubmit).toBe(false);
    const report = await command(f, { kind: "READINESS_REPORT", clientKey: randomUUID() });
    expect(JSON.stringify(report.content)).not.toContain("PRIVATE-DISPUTE-EVIDENCE");
    await expect(writing.publish(f.project, owner, f.manuscript, f.snapshot, [owner, member])).rejects.toMatchObject({ statusCode: 409 });
  });
  it("rejects cross-project snapshots, records and exports", async () => {
    const f = await fixture(), other = await fixture();
    const record = await command(f, { kind: "READINESS_REPORT", clientKey: randomUUID() });
    await expect(integrity.overview(other.project, owner, other.manuscript, f.snapshot)).rejects.toMatchObject({ statusCode: 404 });
    await expect(integrity.exportReport(other.project, owner, other.manuscript, other.snapshot, record.id)).rejects.toMatchObject({ statusCode: 404 });
    const stored = await db.manuscriptIntegrityRecord.findUniqueOrThrow({ where: { id: record.id } });
    const { id: _id, ...data } = stored;
    await expect(db.manuscriptIntegrityRecord.create({ data: { ...data, projectId: other.project, clientKey: randomUUID(), version: 2 } })).rejects.toMatchObject({ code: "P2003" });
  });
  it("uses authenticated HTTP validation, private headers and existing error envelopes", async () => {
    const f = await fixture(), familyId = randomUUID();
    await db.refreshToken.create({ data: { userId: owner, familyId, tokenHash: hashOpaqueToken(randomUUID()), expiresAt: new Date(Date.now() + 3600000) } });
    const token = tokenService.signAccessToken({ sub: owner, systemRole: "USER", sessionId: familyId }).token;
    const app = express(); app.use(express.json()); app.use('/projects/:projectId/manuscripts', manuscriptRouter); app.use(errorHandler);
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/projects/${f.project}/manuscripts/${f.manuscript}/snapshots/${f.snapshot}/integrity`;
    try {
      expect((await fetch(url)).status).toBe(401);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
      const invalid = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'AI_DECLARATION', clientKey: randomUUID(), expectedVersion: 0, content: { ...ai, actorId: outsider } }) });
      expect(invalid.status).toBe(400); expect((await invalid.json() as { success: boolean }).success).toBe(false);
    } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
});
