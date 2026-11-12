import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { IntegrityAiCategory, IntegrityRightsInput, IntegrityPolicyInput, IntegrityRecordKind, IntegrityReadiness, IntegrityStoredRecord, ManuscriptManifest, ManuscriptAiResult, IntegrityAiOperation } from "@trend/shared-types";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { withWorkspace, jsonSnapshot, type WorkspaceContext } from "../projects/workspace-access.js";
import { notificationService } from "../notifications/notification.service.js";
import { lockProjectAccounts, assertActiveProjectAccount } from "../projects/project-transaction.js";
import { assertCanExportProjectSource, researchLedgerService } from "../audit/research-ledger.service.js";
import { readManuscriptAttribution } from "./manuscript-attribution.service.js";
import { integrityCommandSchema, aiAcceptanceSchema } from "./dto/manuscript-integrity.schema.js";
import { analyzeSnapshotCitations, integrityDigest, providerCitationStatus, type CitationMetadata } from "./integrity-citations.js";
import { sourceText } from "./manuscript-source.js";
import { normalizeProjectDoi } from "../projects/project-paper-identity.js";

type Db = Prisma.TransactionClient;
type RecordRow = Awaited<ReturnType<Db["manuscriptIntegrityRecord"]["findFirstOrThrow"]>>;
const defaultPolicy: IntegrityPolicyInput = { requireAiAcknowledgement: false, requireRightsAcknowledgement: false, requireCitationAudit: false, requireCurrentSnapshot: false, reason: "Existing authorship gates remain mandatory; additional evidence is advisory unless configured for this snapshot." };
const notice = "These checks record evidence and human accountability for a specific snapshot. They do not certify scientific correctness, ethical compliance, legal ownership, plagiarism-free work or absence of undisclosed AI use.";
const category: Record<string, IntegrityAiCategory> = { grammar: "LANGUAGE", improve: "LANGUAGE", translate: "TRANSLATION", repair: "LATEX_DEBUGGING", citations: "CITATION_SUGGESTIONS", explain: "LATEX_DEBUGGING", rewrite: "DRAFT_TEXT", continue: "DRAFT_TEXT", expand: "DRAFT_TEXT", shorten: "DRAFT_TEXT", custom: "OTHER" };
const emptyObject = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const recordOrder = [{ version: "desc" as const }, { id: "desc" as const }];
async function scope(c: WorkspaceContext, manuscriptId: string, snapshotId: string, write = false) {
  const draft = await c.tx.draftWorkspace.findFirst({ where: { id: manuscriptId, projectId: c.project.id, writingMode: "LATEX", deletedAt: null } });
  const snapshot = await c.tx.manuscriptSnapshot.findFirst({ where: { id: snapshotId, projectId: c.project.id, workspaceId: manuscriptId } });
  if (!draft || !snapshot) throw AppError.notFound("Manuscript snapshot not found");
  if (write && (draft.archivedAt || ["ARCHIVED", "COMPLETED"].includes(c.project.status))) throw AppError.conflict("This integrity record is read-only");
  return { draft, snapshot, manifest: snapshot.manifest as unknown as ManuscriptManifest };
}
async function metadata(tx: Db, projectId: string, manifest: ManuscriptManifest): Promise<CitationMetadata[]> {
  const wanted = new Set(analyzeSnapshotCitations(manifest).entries.flatMap(entry => entry.doi ? [normalizeProjectDoi(entry.doi)] : []));
  if (!wanted.size) return [];
  const links = await tx.projectPaper.findMany({ where: { projectId }, take: 5000, orderBy: { paperId: "asc" }, select: { paperId: true } });
  const papers = await tx.paper.findMany({ where: { id: { in: links.map(link => link.paperId) }, dataStatus: "active", primaryProvider: { in: ["openalex", "crossref", "pubmed", "semantic_scholar"] } },
    select: { id: true, title: true, doi: true, publicationYear: true, primaryProvider: true, updatedAt: true }, orderBy: { id: "asc" } });
  const relevant = papers.filter(paper => paper.doi && wanted.has(normalizeProjectDoi(paper.doi))).slice(0, 200);
  if (!relevant.length) return [];
  const authors = await tx.paperAuthor.findMany({ where: { paperId: { in: relevant.map(paper => paper.id) } }, orderBy: [{ paperId: "asc" }, { position: "asc" }], take: 4000, select: { paperId: true, displayName: true } });
  // Project only bounded status fields, never entire provider payloads or abstracts.
  const sourceRows = await tx.$queryRaw<Array<{ id: string; paperId: string; providerId: string; fetchedAt: Date; rawMetadata: unknown }>>(Prisma.sql`
    SELECT DISTINCT ON (paper_id) id, paper_id AS "paperId", provider_id AS "providerId", fetched_at AS "fetchedAt",
      jsonb_build_object('is_retracted',raw_metadata->'is_retracted','updated-by',
        (SELECT jsonb_agg(notice.value) FROM (SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(raw_metadata->'updated-by')='array' THEN raw_metadata->'updated-by' ELSE '[]'::jsonb END) LIMIT 20) notice)) AS "rawMetadata"
    FROM paper_source_records WHERE paper_id IN (${Prisma.join(relevant.map(paper => Prisma.sql`${paper.id}::uuid`))})
    ORDER BY paper_id,fetched_at DESC,id ASC LIMIT 200`);
  const providers = await tx.apiProvider.findMany({ where: { id: { in: [...new Set(sourceRows.map(row => row.providerId))] } }, select: { id: true, providerName: true } });
  return relevant.map(paper => {
    const row = sourceRows.find(source => source.paperId === paper.id && providers.some(provider => provider.id === source.providerId && provider.providerName.toLowerCase() === paper.primaryProvider));
    const raw = emptyObject(row?.rawMetadata);
    // Do not infer retractions from arbitrary free-text metadata or user-provided fields.
    const status = row ? providerCitationStatus(paper.primaryProvider, raw) : { status: "UNKNOWN" as const };
    return { paperId: paper.id, title: paper.title, year: paper.publicationYear, doi: paper.doi!, provider: paper.primaryProvider, observedAt: (row?.fetchedAt ?? paper.updatedAt).toISOString(), authors: authors.filter(author => author.paperId === paper.id).map(author => author.displayName), ...status, ...(row ? { sourceRecordId: row.id } : {}) };
  });
}
async function append(c: WorkspaceContext, manuscriptId: string, snapshotId: string, kind: IntegrityRecordKind, content: unknown, digest: string, clientKey: string, command: unknown) {
  const commandHash = integrityDigest(command);
  const prior = await c.tx.manuscriptIntegrityRecord.findUnique({ where: { workspaceId_createdById_clientKey: { workspaceId: manuscriptId, createdById: c.actorId, clientKey } } });
  if (prior) { if (prior.snapshotId !== snapshotId || prior.kind !== kind || prior.commandHash !== commandHash) throw AppError.conflict("This command key was used for different integrity content"); return prior; }
  const last = await c.tx.manuscriptIntegrityRecord.findFirst({ where: { snapshotId, kind }, orderBy: recordOrder });
  const version = (last?.version ?? 0) + 1;
  const checksum = integrityDigest({ projectId: c.project.id, manuscriptId, snapshotId, kind, version, content, evidenceDigest: digest, createdById: c.actorId });
  const row = await c.tx.manuscriptIntegrityRecord.create({ data: { projectId: c.project.id, workspaceId: manuscriptId, snapshotId, kind, version, content: jsonSnapshot(content), evidenceDigest: digest, checksum, createdById: c.actorId, clientKey, commandHash } });
  await researchLedgerService.record({ tx: c.tx, projectId: c.project.id, actorId: c.actorId, eventType: "MANUSCRIPT_INTEGRITY_RECORDED", resourceKind: "MANUSCRIPT_INTEGRITY", resourceId: row.id, artifactVersion: version, checksumSha256: checksum, visibility: "PROJECT_TEAM", metadata: { manuscriptId, snapshotId, kind } });
  return row;
}
async function present(tx: Db, row: RecordRow): Promise<IntegrityStoredRecord> {
  const acknowledgements = await tx.manuscriptIntegrityAcknowledgement.findMany({ where: { recordId: row.id }, orderBy: { userId: "asc" } });
  return { id: row.id, kind: row.kind as IntegrityRecordKind, version: row.version, createdById: row.createdById, createdAt: row.createdAt.toISOString(), evidenceDigest: row.evidenceDigest, checksum: row.checksum, content: row.content, acknowledgedBy: acknowledgements.map(ack => ({ userId: ack.userId, at: ack.createdAt.toISOString() })) };
}
async function gather(c: WorkspaceContext, manuscriptId: string, snapshotId: string): Promise<IntegrityReadiness> {
  const { draft, snapshot, manifest } = await scope(c, manuscriptId, snapshotId);
  const authorship = await readManuscriptAttribution(c.tx, c.project.id, manuscriptId, snapshotId, c.actorId);
  const rows = await c.tx.manuscriptIntegrityRecord.findMany({ where: { snapshotId, projectId: c.project.id, workspaceId: manuscriptId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 200 });
  const records: IntegrityReadiness["records"] = {};
  for (const kind of ["CITATION_AUDIT", "AI_DECLARATION", "RIGHTS_DECLARATION", "POLICY", "READINESS_REPORT"] as const) {
    const row = await c.tx.manuscriptIntegrityRecord.findFirst({ where: { snapshotId, kind }, orderBy: recordOrder });
    if (row) records[kind] = await present(c.tx, row);
  }
  const [runs, runCount, acceptances, currentFiles, relationships, legacyActivities] = await Promise.all([
    c.tx.aiRun.findMany({ where: { workspaceId: manuscriptId, projectId: c.project.id, jobType: "manuscript_writing" }, take: 200, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, ownerId: true, status: true, prompt: true, createdAt: true, updatedAt: true } }),
    c.tx.aiRun.count({ where: { workspaceId: manuscriptId, projectId: c.project.id, jobType: "manuscript_writing" } }),
    c.tx.manuscriptAiAcceptance.findMany({ where: { workspaceId: manuscriptId, projectId: c.project.id }, take: 1000, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    c.tx.manuscriptFile.findMany({ where: { workspaceId: manuscriptId, deletedAt: null }, select: { id: true, sequence: true, checksum: true, path: true, kind: true }, orderBy: { id: "asc" } }),
    c.tx.mentorRelationship.findMany({ where: { projectId: c.project.id }, take: 100, orderBy: { id: "asc" } }),
    c.tx.projectActivity.findMany({ where: { projectId: c.project.id, type: "EXTERNAL_AI_DECLARED" }, take: 500, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, entityId: true, metadata: true, actorId: true, createdAt: true } }),
  ]);
  const runPeople = await c.tx.user.findMany({ where: { id: { in: [...new Set(runs.map(run => run.ownerId))] } }, select: { id: true, fullName: true } });
  const aiOperations: IntegrityAiOperation[] = runs.map(run => {
    let action = "unknown"; try { action = String(JSON.parse(run.prompt ?? "{}").action ?? "unknown"); } catch { /* Never disclose malformed prompts. */ }
    return { id: run.id, actorId: run.ownerId, actorName: runPeople.find(person => person.id === run.ownerId)?.fullName ?? "Research participant", category: category[action] ?? "OTHER", action, status: run.status, createdAt: run.createdAt.toISOString(), acceptedEdits: acceptances.filter(acceptance => acceptance.runId === run.id).map(acceptance => ({ id: acceptance.id, acceptedById: acceptance.acceptedById, fileId: acceptance.fileId, sequence: acceptance.sequence, sourceVersion: acceptance.sourceVersion, createdAt: acceptance.createdAt.toISOString(), exactSourceCaptured: manifest.files.some(file => file.id === acceptance.fileId && file.sequence === acceptance.sequence && file.checksum === acceptance.sourceChecksum) && acceptance.createdAt <= snapshot.createdAt })) };
  });
  const seen = new Set<string>();
  const legacyExternalAi = legacyActivities.flatMap(activity => {
    const id = activity.entityId ?? activity.id; if (seen.has(id)) return []; seen.add(id);
    const value = emptyObject(activity.metadata); if (value.active === false) return [];
    return [{ id, tool: typeof value.toolName === "string" ? value.toolName.slice(0, 120) : "Unspecified external AI", purpose: typeof value.purpose === "string" ? value.purpose.slice(0, 100) : "OTHER", actorId: activity.actorId, declaredAt: activity.createdAt.toISOString() }];
  });
  const liveMetadata = await metadata(c.tx, c.project.id, manifest);
  const metadataDigest = integrityDigest(liveMetadata);
  const citations = records.CITATION_AUDIT?.content as IntegrityReadiness["citations"] ?? null;
  const authorVersion = { id: authorship.checkId, version: authorship.version, authors: authorship.proposedAuthors.map(author => ({ userId: author.userId, order: author.order, creditRoles: author.creditRoles })) };
  const aiDigest = integrityDigest({ snapshot: snapshot.checksum, authorVersion, aiOperations, legacyExternalAi, count: runCount, updatedRuns: runs.map(run => run.updatedAt.toISOString()) });
  const rightsDigest = integrityDigest({ snapshot: snapshot.checksum, authorVersion });
  const policy = records.POLICY?.content as IntegrityPolicyInput ?? defaultPolicy;
  const rights = records.RIGHTS_DECLARATION?.content as IntegrityRightsInput | undefined;
  const authorIds = authorship.proposedAuthors.map(author => author.userId);
  const acknowledged = (kind: "AI_DECLARATION" | "RIGHTS_DECLARATION", digest: string) => {
    const row = records[kind]; return Boolean(row && row.evidenceDigest === digest && authorIds.length && authorIds.every(userId => row.acknowledgedBy.some(ack => ack.userId === userId)));
  };
  const currentSnapshot = draft.version === snapshot.sourceVersion && draft.name === manifest.title && draft.documentType === manifest.documentType && draft.mainFileId === manifest.mainFileId && currentFiles.length === manifest.files.length && currentFiles.every(file => manifest.files.some(saved => saved.id === file.id && saved.sequence === file.sequence && saved.checksum === file.checksum && saved.path === file.path && saved.kind === file.kind));
  const cases = await c.tx.researchIntegrityCase.findMany({ where: { projectId: c.project.id, status: { notIn: ["RESOLVED", "CLOSED"] } }, orderBy: { id: "asc" }, select: { id: true, kind: true, status: true } });
  const ledgerRows = await c.tx.researchEvidenceEvent.findMany({ where: { projectId: c.project.id, retentionClass: { not: "SECURITY_AUDIT" }, resourceKind: { in: ["WORK_CONTRIBUTION", "ALLOCATION_REVISION", "MANUSCRIPT_ATTRIBUTION", "MENTOR_FEEDBACK", "MENTOR_AGREEMENT", "MENTOR_ACCESS", "PROJECT"] } }, take: 500, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, resourceKind: true, resourceId: true, artifactVersion: true, checksumSha256: true, createdAt: true } });
  const supportingEvidenceRefs = ledgerRows.map(row => ({ id: row.id, kind: row.resourceKind, resourceId: row.resourceId, version: row.artifactVersion, checksum: row.checksumSha256, recordedAt: row.createdAt.toISOString() }));
  const mentors: IntegrityReadiness["mentors"] = [];
  for (const relationship of relationships) {
    const [person, access] = await Promise.all([c.tx.user.findUnique({ where: { id: relationship.mentorUserId }, select: { fullName: true } }), c.tx.mentorAccess.findUnique({ where: { relationshipId: relationship.id } })]);
    const agreements = access ? await c.tx.mentorAgreement.findMany({ where: { accessId: access.id, status: "ACCEPTED" }, select: { id: true } }) : [];
    const feedback = access ? await c.tx.mentorFeedback.findMany({ where: { accessId: access.id, status: { in: ["ACCEPTED", "RESOLVED"] } }, select: { id: true, resultingRevisionRef: true } }) : [];
    mentors.push({ id: relationship.id, userId: relationship.mentorUserId, name: person?.fullName ?? "Mentor", role: relationship.mentorRole, status: relationship.status, accessRevoked: !access || Boolean(access.revokedAt) || Boolean(access.expiresAt && access.expiresAt <= new Date()) || relationship.status !== "ACTIVE", acceptedAgreementIds: agreements.map(row => row.id).sort(), acceptedFeedbackRefs: feedback.map(row => ({ id: row.id, revisionRef: row.resultingRevisionRef })).sort((a, b) => a.id.localeCompare(b.id)) });
  }
  const base = `/projects/${encodeURIComponent(c.project.id)}/manuscripts/${encodeURIComponent(manuscriptId)}/integrity?snapshot=${snapshotId}`;
  const checks: IntegrityReadiness["checks"] = [];
  const panels = { AUTHORSHIP: "Authorship and contributions", CITATIONS: "Citation audit", AI: "AI disclosure", RIGHTS: "Mentorship and rights", MENTORSHIP: "Mentorship and rights", CASES: "Integrity history", SNAPSHOT: "Overview" };
  const check = (area: IntegrityReadiness["checks"][number]["area"], state: IntegrityReadiness["state"], blocking: boolean, reason: string, href = `${base}&panel=${encodeURIComponent(panels[area])}`) => checks.push({ area, state, blocking, reason, href });
  check("AUTHORSHIP", authorship.readyForInternalSubmission ? "VERIFIED" : authorship.status === "DISPUTED" ? "DISPUTED" : "PENDING", !authorship.readyForInternalSubmission, authorship.blockingReasons.join(" ") || "The existing attribution workflow confirms the proposed author list and order.");
  const citationSupported = citations && !citations.findings.some(finding => ["ANALYSIS_LIMIT", "MAIN_FILE_UNAVAILABLE"].includes(finding.code));
  const citationFresh = citationSupported && citations.metadataDigest === metadataDigest;
  check("CITATIONS", !citations || !citationSupported ? "UNAVAILABLE" : !citationFresh ? "STALE" : citations.findings.length ? "NEEDS_REVIEW" : "VERIFIED", policy.requireCitationAudit && !citationFresh, !citations ? "Run citation analysis on this saved snapshot." : !citationSupported ? "Automatic citation analysis is incomplete. Review its source bounds or main-file findings before continuing." : !citationFresh ? "Source metadata changed. Run citation analysis again." : citations.findings.length ? "Review the listed bibliography and source warnings. Claim support has not been assessed." : "Supported citation checks completed. Claim support and source status completeness are not certified.");
  const aiComplete = acknowledged("AI_DECLARATION", aiDigest);
  const partialAiHistory = runCount > runs.length || acceptances.length >= 1000 || legacyActivities.length >= 500;
  check("AI", aiComplete ? partialAiHistory ? "NEEDS_REVIEW" : "VERIFIED" : records.AI_DECLARATION && records.AI_DECLARATION.evidenceDigest !== aiDigest ? "STALE" : "PENDING", policy.requireAiAcknowledgement && !aiComplete, partialAiHistory ? "The displayed AI history is bounded, not exhaustive. Review earlier usage and include it in the human declaration; acknowledgments do not certify complete AI detection." : aiComplete ? "Proposed authors acknowledged this snapshot's AI disclosure and human responsibility." : "Review internal assistance and self-declared external use, then have each proposed author acknowledge the current declaration.");
  const rightsComplete = acknowledged("RIGHTS_DECLARATION", rightsDigest);
  check("RIGHTS", rights?.prohibitsInternalSubmission ? "DISPUTED" : rightsComplete && !rights?.unresolvedQuestions && rights?.basis !== "UNDETERMINED" ? "VERIFIED" : records.RIGHTS_DECLARATION && records.RIGHTS_DECLARATION.evidenceDigest !== rightsDigest ? "STALE" : "NEEDS_REVIEW", Boolean(rights?.prohibitsInternalSubmission) || policy.requireRightsAcknowledgement && !rightsComplete, rights?.prohibitsInternalSubmission ? "The current rights declaration explicitly prohibits internal submission. Resolve and version this restriction before submitting." : "Rights are user declarations, not a legal determination. Review claims, restrictions, third-party content and unresolved questions.");
  check("MENTORSHIP", relationships.length >= 100 ? "NEEDS_REVIEW" : "VERIFIED", false, "Mentoring and approved contribution references are listed separately from authorship. A mentorship does not grant source editing, export or publication authority.", `/projects/${c.project.id}?tab=support`);
  check("CASES", cases.length ? "NEEDS_REVIEW" : "VERIFIED", false, cases.length ? "Open cases are listed by status only. Mandatory attribution disputes remain enforced by the existing attribution gate; review security containment in project settings." : "No open integrity cases were found in the project.", `/projects/${c.project.id}?tab=settings`);
  const writable = !draft.archivedAt && !["ARCHIVED", "COMPLETED"].includes(c.project.status);
  check("SNAPSHOT", !writable ? "PENDING" : currentSnapshot ? "VERIFIED" : "STALE", !writable || c.role === null || policy.requireCurrentSnapshot && !currentSnapshot, !writable || c.role === null ? "This project or manuscript is read-only for the viewer. Internal submission is not authorized." : currentSnapshot ? "The saved snapshot matches the current persisted file inventory and sequences." : "The working manuscript differs from this historical snapshot. These results apply only to the selected saved version.", `/projects/${c.project.id}/manuscripts/${manuscriptId}`);
  const evidenceVersions = { attribution: authorship.checkId, attributionVersion: authorship.version, citation: records.CITATION_AUDIT?.id ?? null, ai: records.AI_DECLARATION?.id ?? null, rights: records.RIGHTS_DECLARATION?.id ?? null, policy: records.POLICY?.id ?? null, aiScope: aiDigest, rightsScope: rightsDigest, metadata: metadataDigest, sourceVersion: draft.version, aiOperationCount: runCount, displayedAiOperations: runs.length, ledger: integrityDigest(supportingEvidenceRefs) };
  const evidenceDigest = integrityDigest({ snapshot: snapshot.checksum, evidenceVersions, decisions: authorship.decisions.map(item => ({ id: item.id, decision: item.decision })), contributions: authorship.detectedContributors.map(person => ({ userId: person.userId, creditRoles: person.creditRoles, sources: person.sources, attributionState: person.attributionState })), checks, mentors, cases, acknowledgements: [records.AI_DECLARATION?.acknowledgedBy, records.RIGHTS_DECLARATION?.acknowledgedBy], exportPolicy: c.project.exportPolicy, aiDataPolicy: c.project.aiDataPolicy, externalLookupPolicy: c.project.externalLookupPolicy, projectStatus: c.project.status, currentSnapshot });
  const blocking = checks.some(item => item.blocking);
  return { schemaVersion: "LUMIGAP_INTEGRITY_V1", algorithmVersion: "READINESS_V1", projectId: c.project.id, viewerId: c.actorId, manuscriptId, snapshotId, snapshotVersion: snapshot.sourceVersion, snapshotChecksum: snapshot.checksum, evaluatedAt: new Date().toISOString(), evidenceDigest,
    state: blocking ? checks.some(item => item.state === "DISPUTED") ? "DISPUTED" : "PENDING" : checks.some(item => item.state === "STALE") ? "STALE" : checks.some(item => item.state !== "VERIFIED") ? "NEEDS_REVIEW" : "VERIFIED", maySubmit: !blocking, currentSnapshot, policy, checks, evidenceVersions, supportingEvidenceRefs, authorship, citations, aiOperations, legacyExternalAi, mentors, cases, records,
    history: rows.map(row => ({ id: row.id, kind: row.kind as IntegrityRecordKind, version: row.version, createdAt: row.createdAt.toISOString(), checksum: row.checksum })),
    permissions: { canManagePolicy: c.role === "OWNER", canDeclareRights: c.role === "OWNER", canWrite: !draft.archivedAt && !["ARCHIVED", "COMPLETED"].includes(c.project.status), canExport: c.project.exportPolicy !== "OWNER_ONLY" || c.role === "OWNER", canAcknowledge: authorIds.includes(c.actorId) }, notice };
}
function reportContent(view: IntegrityReadiness) {
  return { schemaVersion: view.schemaVersion, algorithmVersion: view.algorithmVersion, projectId: view.projectId, manuscriptId: view.manuscriptId, snapshotId: view.snapshotId, snapshotVersion: view.snapshotVersion, snapshotChecksum: view.snapshotChecksum, evaluatedAt: view.evaluatedAt, evidenceDigest: view.evidenceDigest, state: view.state, maySubmit: view.maySubmit, currentSnapshot: view.currentSnapshot, checks: view.checks, evidenceVersions: view.evidenceVersions, supportingEvidenceRefs: view.supportingEvidenceRefs, policy: view.policy,
    citations: view.citations, aiOperations: view.aiOperations, legacyExternalAi: view.legacyExternalAi,
    aiDeclaration: view.records.AI_DECLARATION ?? null, rightsDeclaration: view.records.RIGHTS_DECLARATION ?? null,
    authors: view.authorship.proposedAuthors.map(author => ({ userId: author.userId, name: author.name, order: author.order, creditRoles: author.creditRoles, confirmed: author.confirmed })), contributors: view.authorship.detectedContributors.map(person => ({ userId: person.userId, name: person.name, creditRoles: person.creditRoles, sources: person.sources, attributionState: person.attributionState })), omittedContributors: view.authorship.omittedContributors, acknowledgements: view.authorship.acknowledgements, acknowledgementText: view.authorship.acknowledgementText, attributionCheckId: view.authorship.checkId,
    confirmationTimes: view.authorship.decisions.map(decision => ({ userId: decision.userId, decision: decision.decision, createdAt: decision.createdAt })), mentors: view.mentors, cases: view.cases, notice };
}
/** Called under the existing publication transaction and project lock, after authoritative authorship checks. */
export async function assertIntegrityForSubmission(c: WorkspaceContext, manuscriptId: string, snapshotId: string) {
  const view = await gather(c, manuscriptId, snapshotId);
  if (!view.maySubmit) throw AppError.conflict(view.checks.find(check => check.blocking)!.reason);
  return append(c, manuscriptId, snapshotId, "READINESS_REPORT", reportContent(view), view.evidenceDigest, randomUUID(), { publication: snapshotId, evidenceDigest: view.evidenceDigest });
}
export const manuscriptIntegrityService = {
  async overview(projectId: string, actorId: string, manuscriptId: string, snapshotId: string) {
    return withWorkspace(projectId, actorId, { timeoutMs: 30000 }, c => gather(c, manuscriptId, snapshotId));
  },
  async command(projectId: string, actorId: string, manuscriptId: string, snapshotId: string, raw: unknown) {
    const input = integrityCommandSchema.parse(raw);
    if (input.kind === "ACKNOWLEDGE") return this.acknowledge(projectId, actorId, manuscriptId, snapshotId, input);
    return withWorkspace(projectId, actorId, { write: true, timeoutMs: 30000 }, async c => {
      await scope(c, manuscriptId, snapshotId, true);
      const prior = await c.tx.manuscriptIntegrityRecord.findUnique({ where: { workspaceId_createdById_clientKey: { workspaceId: manuscriptId, createdById: c.actorId, clientKey: input.clientKey } } });
      if (prior) {
        if (prior.snapshotId !== snapshotId || prior.kind !== input.kind || prior.commandHash !== integrityDigest(input)) throw AppError.conflict("This command key was used for different integrity content");
        return present(c.tx, prior);
      }
      const view = await gather(c, manuscriptId, snapshotId);
      if (["RIGHTS_DECLARATION", "POLICY"].includes(input.kind) && c.role !== "OWNER") throw AppError.forbidden("Only the project owner may record rights or submission policy declarations");
      const current = view.records[input.kind];
      if ("expectedVersion" in input && input.expectedVersion !== (current?.version ?? 0)) throw AppError.conflict("The integrity declaration changed. Reload before saving.");
      let content: unknown, digest: string;
      if (input.kind === "CITATION_AUDIT") {
        const { manifest } = await scope(c, manuscriptId, snapshotId);
        const audit = analyzeSnapshotCitations(manifest, await metadata(c.tx, c.project.id, manifest)); content = audit; digest = audit.metadataDigest;
      } else if (input.kind === "READINESS_REPORT") { content = reportContent(view); digest = view.evidenceDigest; }
      else { content = input.kind === "AI_DECLARATION" ? { ...input.content, internalOperations: view.aiOperations, legacyExternalAi: view.legacyExternalAi, activityCoverage: { totalOperations: view.evidenceVersions.aiOperationCount, displayedOperations: view.evidenceVersions.displayedAiOperations, notice: "Bounded records do not establish complete AI usage coverage." } } : input.content; digest = input.kind === "AI_DECLARATION" ? String(view.evidenceVersions.aiScope) : input.kind === "RIGHTS_DECLARATION" ? String(view.evidenceVersions.rightsScope) : view.snapshotChecksum; }
      const row = await append(c, manuscriptId, snapshotId, input.kind, content, digest, input.clientKey, input);
      if (["AI_DECLARATION", "RIGHTS_DECLARATION"].includes(input.kind)) for (const author of view.authorship.proposedAuthors.filter(author => author.userId !== c.actorId)) {
        await notificationService.create({ userId: author.userId, type: "MANUSCRIPT_INTEGRITY_DECLARATION", title: "Review a manuscript declaration", message: "A snapshot-specific declaration requires your own review and acknowledgment.", targetKind: "project", targetId: c.project.id,
          eventKey: `WORKSPACE:MANUSCRIPT_INTEGRITY:${row.id}:${author.userId}`, emailPayload: { manuscriptId, snapshotId, integrityRecordId: row.id }, emailStatus: "SKIPPED" }, c.tx);
      }
      return present(c.tx, row);
    });
  },
  async acknowledge(projectId: string, actorId: string, manuscriptId: string, snapshotId: string, input: Extract<z.infer<typeof integrityCommandSchema>, { kind: "ACKNOWLEDGE" }>) {
    return getPrisma().$transaction(async tx => {
      await lockProjectAccounts(tx, [actorId], projectId); await assertActiveProjectAccount(tx, actorId);
      const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
      const c: WorkspaceContext = { tx, project, actorId, role: null };
      await scope(c, manuscriptId, snapshotId, true);
      const authorship = await readManuscriptAttribution(tx, projectId, manuscriptId, snapshotId, actorId);
      if (!authorship.proposedAuthors.some(author => author.userId === actorId)) throw AppError.forbidden("Only the authenticated proposed author can acknowledge their declaration");
      const view = await gather(c, manuscriptId, snapshotId);
      const record = [view.records.AI_DECLARATION, view.records.RIGHTS_DECLARATION].find(row => row?.id === input.recordId);
      if (!record) throw AppError.conflict("Only the latest declaration can be acknowledged");
      const digest = record.kind === "AI_DECLARATION" ? view.evidenceVersions.aiScope : view.evidenceVersions.rightsScope;
      if (record.evidenceDigest !== digest || input.evidenceDigest !== digest) throw AppError.conflict("Declaration evidence changed. Review a new declaration before acknowledging.");
      const prior = await tx.manuscriptIntegrityAcknowledgement.findUnique({ where: { recordId_userId: { recordId: record.id, userId: actorId } } });
      if (!prior) {
        await tx.manuscriptIntegrityAcknowledgement.create({ data: { recordId: record.id, userId: actorId, evidenceDigest: input.evidenceDigest } });
        await researchLedgerService.record({ tx, projectId, actorId, eventType: "MANUSCRIPT_INTEGRITY_ACKNOWLEDGED", resourceKind: "MANUSCRIPT_INTEGRITY", resourceId: record.id, checksumSha256: record.checksum, visibility: "PROJECT_TEAM", metadata: { manuscriptId, snapshotId, kind: record.kind } });
      }
      return present(tx, await tx.manuscriptIntegrityRecord.findUniqueOrThrow({ where: { id: record.id } }));
    }, { timeout: 30000 });
  },
  async declarationPacket(projectId: string, actorId: string, manuscriptId: string, snapshotId: string, recordId: string) {
    return getPrisma().$transaction(async tx => {
      await lockProjectAccounts(tx, [actorId], projectId); await assertActiveProjectAccount(tx, actorId);
      const authorship = await readManuscriptAttribution(tx, projectId, manuscriptId, snapshotId, actorId);
      if (!authorship.proposedAuthors.some(author => author.userId === actorId)) throw AppError.notFound("Declaration not found");
      const record = await tx.manuscriptIntegrityRecord.findFirst({ where: { id: recordId, projectId, workspaceId: manuscriptId, snapshotId, kind: { in: ["AI_DECLARATION", "RIGHTS_DECLARATION"] } } });
      if (!record) throw AppError.notFound("Declaration not found");
      const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
      const current = await gather({ tx, project, actorId, role: null }, manuscriptId, snapshotId);
      const latest = current.records[record.kind as "AI_DECLARATION" | "RIGHTS_DECLARATION"];
      const scopeDigest = record.kind === "AI_DECLARATION" ? current.evidenceVersions.aiScope : current.evidenceVersions.rightsScope;
      return { projectId, manuscriptId, snapshotId, viewerId: actorId, snapshotChecksum: authorship.snapshotChecksum, record: await present(tx, record), stale: latest?.id !== record.id || record.evidenceDigest !== scopeDigest, latestRecordId: latest?.id, canAcknowledge: current.permissions.canWrite, notice };
    }, { maxWait: 10000, timeout: 30000 });
  },
  async exportReport(projectId: string, actorId: string, manuscriptId: string, snapshotId: string, recordId: string) {
    return withWorkspace(projectId, actorId, { timeoutMs: 30000 }, async c => {
      assertCanExportProjectSource(c.project, c.actorId);
      const view = await gather(c, manuscriptId, snapshotId);
      const record = await c.tx.manuscriptIntegrityRecord.findFirst({ where: { id: recordId, projectId: c.project.id, workspaceId: manuscriptId, snapshotId, kind: "READINESS_REPORT" } });
      if (!record) throw AppError.notFound("Integrity report not found");
      const stale = record.evidenceDigest !== view.evidenceDigest;
      await researchLedgerService.record({ tx: c.tx, projectId: c.project.id, actorId: c.actorId, eventType: "MANUSCRIPT_INTEGRITY_EXPORTED", resourceKind: "MANUSCRIPT_INTEGRITY", resourceId: record.id, checksumSha256: record.checksum, metadata: { snapshotId, stale } });
      return { recordId: record.id, recordKind: record.kind, reportVersion: record.version, createdById: record.createdById, recordedAt: record.createdAt.toISOString(), checksumAlgorithm: "SHA-256/CANONICAL_JSON_V1", reportChecksum: record.checksum, stale, exportEvaluatedAt: new Date().toISOString(), report: record.content, notice };
    });
  },
  async recordAiAcceptance(projectId: string, actorId: string, manuscriptId: string, runId: string, raw: unknown) {
    const input = aiAcceptanceSchema.parse(raw);
    return withWorkspace(projectId, actorId, { write: true }, async c => {
      const draft = await c.tx.draftWorkspace.findFirst({ where: { id: manuscriptId, projectId: c.project.id, writingMode: "LATEX", deletedAt: null, archivedAt: null } });
      if (!draft) throw AppError.notFound("Writable manuscript not found");
      const run = await c.tx.aiRun.findFirst({ where: { id: runId, workspaceId: manuscriptId, projectId: c.project.id, ownerId: c.actorId, jobType: "manuscript_writing", status: "completed" } });
      if (!run?.resultSummary) throw AppError.notFound("Completed AI proposal not found");
      const result = JSON.parse(run.resultSummary) as ManuscriptAiResult;
      const citation = input.paperId ? result.citations.find(source => source.id === input.paperId) : undefined;
      const proposal = input.paperId ? citation ? `\\cite{${citation.citationKey}}` : "" : result.text;
      const proposalChecksum = integrityDigest({ runId, proposal });
      const prior = await c.tx.manuscriptAiAcceptance.findUnique({ where: { workspaceId_acceptedById_clientKey: { workspaceId: manuscriptId, acceptedById: c.actorId, clientKey: input.clientKey } } });
      if (prior) { if (prior.runId !== runId || prior.fileId !== input.fileId || prior.sequence !== input.sequence || prior.proposalChecksum !== proposalChecksum) throw AppError.conflict("AI acceptance key was reused"); return { id: prior.id }; }
      const file = await c.tx.manuscriptFile.findFirst({ where: { id: input.fileId, workspaceId: manuscriptId, deletedAt: null, sequence: input.sequence } });
      if (!file?.crdtState || result.needsContext || !proposal?.trim() || result.scope?.fileId !== file.id || !sourceText(file.crdtState).includes(proposal)) throw AppError.conflict("The accepted proposal is not present at this persisted file sequence");
      if (!await c.tx.manuscriptUpdate.count({ where: { fileId: file.id, actorId: c.actorId, serverSequence: file.sequence } })) throw AppError.conflict("AI acceptance must reference your own durably saved source edit");
      const row = await c.tx.manuscriptAiAcceptance.create({ data: { projectId: c.project.id, workspaceId: manuscriptId, runId, acceptedById: c.actorId, fileId: file.id, sequence: file.sequence, sourceVersion: draft.version, sourceChecksum: file.checksum!, proposalChecksum, clientKey: input.clientKey } });
      await researchLedgerService.record({ tx: c.tx, projectId: c.project.id, actorId: c.actorId, eventType: "MANUSCRIPT_AI_ACCEPTED", resourceKind: "MANUSCRIPT_AI_ACCEPTANCE", resourceId: row.id, artifactVersion: draft.version, checksumSha256: file.checksum, metadata: { runId, fileId: file.id, sequence: file.sequence } });
      return { id: row.id };
    });
  },
};
