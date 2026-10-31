import type { ManuscriptManifest, ManuscriptWritingCalculation, ManuscriptWritingReport, ManuscriptWritingReference, EvaluationSource } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { withWorkspace, jsonSnapshot, workspacePeople, type WorkspaceContext } from "../projects/workspace-access.js";
import { retainedWritingHistory } from "./manuscript-history.js";
import { calculateRetainedWriting, latexBodyMask } from "./manuscript-writing.calculator.js";
import { hashBytes } from "./manuscript-source.js";
import type { ManuscriptWritingReport as ReportRow } from "../../generated/prisma/client.js";
import { workContributionsService } from "../projects/work-contributions.service.js";
import { posix } from "node:path";

export const MANUSCRIPT_WRITING_JOB = "manuscript-retained-writing-v1";
export function includedWritingFiles(manifest: ManuscriptManifest) {
  const byPath = new Map(manifest.files.map(f => [f.path, f])), found = new Set<string>();
  const pending = manifest.files.filter(f => f.id === manifest.mainFileId);
  for (let index = 0; index < pending.length; index++) {
    const file = pending[index]!; if (found.has(file.id)) continue; found.add(file.id);
    if (!/\.tex$/i.test(file.path)) continue;
    const source = latexBodyMask(file.text ?? "");
    for (const match of source.matchAll(/\\(?:input|include)\s*\{([^{}\\]+)\}/g)) {
      const target = match[1]!.trim();
      const names = [target, `${target}.tex`, posix.join(posix.dirname(file.path), target), posix.join(posix.dirname(file.path), `${target}.tex`)];
      const child = names.map(name => byPath.get(name)).find(f => f?.kind === "TEXT");
      if (child && !found.has(child.id)) pending.push(child);
    }
  }
  return manifest.files.filter(f => found.has(f.id));
}
async function draft(c: WorkspaceContext, id: string) {
  const row = await c.tx.draftWorkspace.findFirst({ where: { id, projectId: c.project.id, deletedAt: null, writingMode: "LATEX" } });
  if (!row) throw AppError.notFound("Manuscript not found"); return row;
}
async function reportView(c: WorkspaceContext, row: ReportRow): Promise<ManuscriptWritingReport> {
  const [snapshot, manuscript] = await Promise.all([c.tx.manuscriptSnapshot.findUniqueOrThrow({ where: { id: row.snapshotId } }), draft(c, row.workspaceId)]);
  return { id: row.id, manuscriptId: row.workspaceId, snapshotId: row.snapshotId, title: (snapshot.manifest as unknown as ManuscriptManifest).title, snapshotLabel: snapshot.label, sourceVersion: snapshot.sourceVersion,
    status: row.status as ManuscriptWritingReport["status"], createdAt: row.createdAt.toISOString(), calculatedAt: row.calculatedAt?.toISOString() ?? null,
    inputHash: row.inputHash, result: row.result as unknown as ManuscriptWritingCalculation | null, isStale: manuscript.version !== snapshot.sourceVersion };
}
export const manuscriptWritingService = {
  async contributionDraft(project: string, actor: string, id: string, reportId: string) {
    const data = await withWorkspace(project, actor, { write: true }, async c => {
      await draft(c, id);
      const row = await c.tx.manuscriptWritingReport.findFirst({ where: { id: reportId, projectId: c.project.id, workspaceId: id, status: "COMPLETED" } });
      if (!row) throw AppError.notFound("Completed writing report not found");
      const result = row.result as unknown as ManuscriptWritingCalculation;
      if (!result.attributedWordUnits) throw AppError.conflict("No attributable writing is available");
      const snapshot = await c.tx.manuscriptSnapshot.findUniqueOrThrow({ where: { id: row.snapshotId } });
      return { actorId: c.actorId, title: (snapshot.manifest as unknown as ManuscriptManifest).title, row, result, snapshot };
    });
    const ids = [...new Set([...data.result.members.map(m => m.userId), data.actorId])];
    return workContributionsService.save(project, actor, {
      clientKey: reportId, title: `Writing: ${data.title}`.slice(0, 240), source: "WORKSPACE", workDate: data.snapshot.createdAt.toISOString(),
      description: `Retained manuscript writing at version ${data.snapshot.sourceVersion}. This records text insertion, not scientific quality or total research effort. Review and confirm the participants before submitting.`,
      participants: ids.map(userId => ({ userId, roles: data.result.members.some(m => m.userId === userId) ? ["WRITING_ORIGINAL_DRAFT" as const] : [] })),
      evidence: `RETAINED_WRITING_V1 report ${reportId}; snapshot ${data.row.snapshotId}; fingerprint ${data.row.inputHash}; attributed ${data.result.attributedWordUnits / 1000}/${data.result.totalWords} words; unknown ${data.result.unknownWordUnits / 1000}. Participation requires explicit team confirmation.`,
      evidenceRefs: [{ kind: "MANUSCRIPT_SNAPSHOT", id: data.row.snapshotId }],
    });
  },
  async request(project: string, actor: string, id: string, snapshotId: string) {
    const row = await withWorkspace(project, actor, { write: true }, async c => {
      const manuscript = await draft(c, id); if (manuscript.archivedAt) throw AppError.conflict("Archived manuscripts are read-only");
      const snapshot = await c.tx.manuscriptSnapshot.findFirst({ where: { id: snapshotId, workspaceId: id, projectId: c.project.id } });
      if (!snapshot) throw AppError.notFound("Snapshot not found");
      const history = retainedWritingHistory(snapshot), manifest = snapshot.manifest as unknown as ManuscriptManifest;
      if (!history || manifest.files.some(f => f.kind === "TEXT" && !history.states[f.id])) throw AppError.conflict("This version has no complete retained collaboration state. Save a new version or use a smaller manuscript.");
      const previous = await c.tx.manuscriptWritingReport.findUnique({ where: { snapshotId } });
      if (previous) return previous.status === "FAILED" ? c.tx.manuscriptWritingReport.update({ where: { id: previous.id }, data: { status: "QUEUED", actorId: c.actorId } }) : previous;
      return c.tx.manuscriptWritingReport.create({ data: { projectId: c.project.id, workspaceId: id, snapshotId, actorId: c.actorId } });
    });
    if (row.status === "QUEUED") await enqueueWritingReport(row.id);
    return this.get(project, actor, id, row.id);
  },
  async get(project: string, actor: string, id: string, reportId: string) {
    return withWorkspace(project, actor, {}, async c => {
      await draft(c, id);
      const row = await c.tx.manuscriptWritingReport.findFirst({ where: { id: reportId, projectId: c.project.id, workspaceId: id } });
      if (!row) throw AppError.notFound("Writing report not found"); return reportView(c, row);
    });
  },
  async list(project: string, actor: string, id: string, page = 1) {
    return withWorkspace(project, actor, {}, async c => {
      await draft(c, id);
      const where = { projectId: c.project.id, workspaceId: id };
      const [rows, total] = await Promise.all([c.tx.manuscriptWritingReport.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 10, take: 10 }), c.tx.manuscriptWritingReport.count({ where })]);
      return { items: await Promise.all(rows.map(r => reportView(c, r))), page, pageSize: 10, total, hasNext: page * 10 < total };
    });
  },
  async linked(project: string, actor: string, contributionIds: string[]) {
    return withWorkspace(project, actor, {}, async c => {
      const sources = await c.tx.projectContributionProposal.findMany({ where: { projectId: c.project.id, id: { in: contributionIds } }, select: { evidenceRefs: true } });
      const snapshotIds = sources.flatMap(s => Array.isArray(s.evidenceRefs) ? s.evidenceRefs.flatMap(ref => ref && typeof ref === "object" && !Array.isArray(ref) && ref.kind === "MANUSCRIPT_SNAPSHOT" && typeof ref.id === "string" ? [ref.id] : []) : []);
      const rows = await c.tx.manuscriptWritingReport.findMany({ where: { projectId: c.project.id, snapshotId: { in: snapshotIds }, status: "COMPLETED", workspaceId: { in: (await c.tx.draftWorkspace.findMany({ where: { projectId: c.project.id, deletedAt: null }, select: { id: true } })).map(d => d.id) } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      return Promise.all(rows.map(r => reportView(c, r)));
    });
  },
  async process(id: string) {
    const row = await getPrisma().manuscriptWritingReport.findUnique({ where: { id } });
    if (!row || row.status !== "QUEUED") return;
    await withWorkspace(row.projectId, row.actorId, { write: true, timeoutMs: 120000 }, async c => {
      const live = await c.tx.manuscriptWritingReport.findUniqueOrThrow({ where: { id } }); if (live.status !== "QUEUED") return;
      await draft(c, row.workspaceId);
      const snapshot = await c.tx.manuscriptSnapshot.findUniqueOrThrow({ where: { id: row.snapshotId } });
      const history = retainedWritingHistory(snapshot), manifest = snapshot.manifest as unknown as ManuscriptManifest;
      if (!history) throw AppError.conflict("Retained manuscript history unavailable");
      const files = includedWritingFiles(manifest).filter(f => f.kind === "TEXT" && /\.(tex|txt)$/i.test(f.path)).map(f => {
        if (!history.states[f.id]) throw AppError.conflict("Incomplete manuscript state");
        return { id: f.id, path: f.path, state: Buffer.from(history.states[f.id]!, "base64"), spans: history.writingSpans?.[f.id] ?? [] };
      });
      const people = await workspacePeople(c.tx, files.flatMap(f => f.spans.flatMap(s => s.userId ? [s.userId] : [])));
      const calculation = calculateRetainedWriting(files, people);
      const inputHash = hashBytes(JSON.stringify({ algorithm: calculation.algorithmVersion, snapshotId: snapshot.id, checksum: snapshot.checksum, spans: files.map(f => ({ id: f.id, spans: f.spans })) }));
      await c.tx.manuscriptWritingReport.update({ where: { id }, data: { result: jsonSnapshot(calculation), status: "COMPLETED", inputHash, calculatedAt: new Date() } });
    });
  },
};
export async function enqueueWritingReport(id: string) {
  const { aiJobsQueue } = await import("../../infrastructure/queue.js");
  const previous = await aiJobsQueue.getJob(`writing-${id}`);
  if (previous && ["failed", "completed"].includes(await previous.getState())) await previous.remove();
  await aiJobsQueue.add(MANUSCRIPT_WRITING_JOB, { runId: id }, { jobId: `writing-${id}`, attempts: 5, backoff: { type: "exponential", delay: 2000 } });
}
export async function writingEvaluationReference(c: WorkspaceContext, reportId: string, sources: EvaluationSource[], outcomeId: string): Promise<ManuscriptWritingReference> {
  const report = await c.tx.manuscriptWritingReport.findFirst({ where: { id: reportId, projectId: c.project.id, status: "COMPLETED" } });
  if (!report || !report.inputHash) throw AppError.badRequest("Choose a completed writing report from this project");
  await draft(c, report.workspaceId);
  if (!sources.some(s => Array.isArray(s.evidenceRefs) && s.evidenceRefs.some(ref => ref && typeof ref === "object" && ref.kind === "MANUSCRIPT_SNAPSHOT" && ref.id === report.snapshotId))) throw AppError.badRequest("Link the writing report's snapshot as work evidence first");
  const result = report.result as unknown as ManuscriptWritingCalculation;
  const participantIds = new Set(sources.flatMap(s => s.participants));
  if (!result.attributedWordUnits || !result.recordedFrom || !result.recordedThrough || result.members.some(m => !participantIds.has(m.userId))) throw AppError.badRequest("Include every measured writer and use a report with a complete recording window");
  // Project lock serializes this check; a manuscript is one writing outcome even across snapshots.
  const revisions = await c.tx.contributionOutcomeEvaluation.findMany({ where: { projectId: c.project.id, outcomeId: { not: outcomeId } }, select: { payload: true } });
  const usedIds = revisions.flatMap(r => { const payload = r.payload as { writingReference?: ManuscriptWritingReference }; return payload.writingReference ? [payload.writingReference.reportId] : []; });
  if (await c.tx.manuscriptWritingReport.count({ where: { id: { in: usedIds }, workspaceId: report.workspaceId } })) throw AppError.conflict("This manuscript already has a writing outcome. Revise that outcome to avoid counting it twice.");
  return { reportId, snapshotId: report.snapshotId, inputHash: report.inputHash, algorithmVersion: result.algorithmVersion, coverageBasisPoints: result.coverageBasisPoints, recordedFrom: result.recordedFrom, recordedThrough: result.recordedThrough, suggestedParticipation: result.members.map(m => ({ userId: m.userId, basisPoints: m.suggestedBasisPoints! })) };
}
