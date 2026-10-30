import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { z } from "zod";
import type { ContributionEvaluationRule, ContributionEvaluationRow, ContributionEvaluationSnapshot, EvaluationCoverage, EvaluationDecision, EvaluationPayload, EvaluationSource, EvaluationProposalInput, OutcomeEvaluation, EvaluationAllocationReference, AllocationShareInput, EvaluationObjection } from "@trend/shared-types";
import type { AllocationPeriod, ContributionOutcomeEvaluation, ContributionEvaluationRule as RuleRow } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { withWorkspace, workspaceId, jsonSnapshot, workspacePeople, type WorkspaceContext } from "./workspace-access.js";
import { eligibleAllocationRoster } from "./allocation.service.js";
import { assertActiveProjectAccount, lockProjectAccounts } from "./project-transaction.js";
import { calculateContributionShares } from "./contribution-evaluation.calculator.js";
import { unresolvedEvaluationObjections } from "./contribution-evaluation.rules.js";
import type { evaluationRuleSchema, evaluationDecisionSchema, evaluationRunSchema, evaluationBoardSchema } from "./dto/contribution-evaluation.schema.js";
import { contributionsNotify } from "./contributions-notification.js";
import { writingEvaluationReference } from "../workspaces/manuscript-writing.service.js";

export const CONTRIBUTION_EVALUATION_JOB = "contribution-evaluation-v1";
const viewRule = (r: RuleRow): ContributionEvaluationRule => ({ id: r.id, version: r.version, title: r.title, rationale: r.rationale, defaultWeight: r.defaultWeight, maxWeight: r.maxWeight, createdAt: r.createdAt.toISOString() });
// JSON keys are canonicalized recursively; arrays are sorted explicitly where order is not meaningful.
export function evaluationHash(value: unknown): string {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => [k, canonical(x)])) : v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
async function periodFor(c: WorkspaceContext, id: string) {
  const row = await c.tx.allocationPeriod.findFirst({ where: { id, projectId: c.project.id } });
  if (!row) throw AppError.notFound("Allocation period not found"); return row;
}
async function currentRule(c: WorkspaceContext) { return c.tx.contributionEvaluationRule.findFirst({ where: { projectId: c.project.id }, orderBy: { version: "desc" } }); }
async function allSources(c: WorkspaceContext): Promise<EvaluationSource[]> {
  const result: EvaluationSource[] = []; let cursor: string | undefined;
  // Never reuse the 500-row allocation summary; every source is read in a stable cursor traversal.
  for (;;) {
    const rows = await c.tx.projectContributionProposal.findMany({ where: { projectId: c.project.id }, orderBy: { id: "asc" }, take: 250, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (!rows.length) break;
    const people = await c.tx.contributionParticipant.findMany({ where: { proposalId: { in: rows.map(r => r.id) } }, orderBy: { userId: "asc" } });
    const participants = new Map<string, string[]>();
    for (const person of people) { const ids = participants.get(person.proposalId) ?? []; ids.push(person.userId); participants.set(person.proposalId, ids); }
    for (const row of rows) result.push({ id: row.id, version: row.version, title: row.title, description: row.description, workDate: row.workDate.toISOString(), status: row.status, evidence: row.evidence ?? "", evidenceRefs: row.evidenceRefs, participants: participants.get(row.id) ?? [] });
    cursor = rows.at(-1)!.id;
  }
  return result;
}
async function outcomeObjections(c: WorkspaceContext, outcomeId: string) {
  const revisions = await c.tx.contributionOutcomeEvaluation.findMany({ where: { projectId: c.project.id, outcomeId }, select: { id: true, version: true } });
  const decisions = await c.tx.contributionEvaluationDecision.findMany({ where: { evaluationId: { in: revisions.map(r => r.id) } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  return unresolvedEvaluationObjections(revisions, decisions);
}
function evaluationView(c: WorkspaceContext, row: ContributionOutcomeEvaluation, decisions: EvaluationDecision[], objections: EvaluationObjection[] = []): OutcomeEvaluation {
  const payload = row.payload as unknown as EvaluationPayload;
  const writable = c.project.status !== "ARCHIVED";
  return { id: row.id, version: row.version, payloadHash: row.payloadHash, payload, createdAt: row.createdAt.toISOString(), createdById: row.createdById, decisions,
    unresolvedObjections: objections,
    canResolveObjection: writable && objections.some(o => o.userId === c.actorId && o.version < row.version) && !decisions.some(d => d.userId === c.actorId && d.kind === "RESOLUTION"),
    canApprove: writable && payload.participation.some(p => p.userId === c.actorId) && !decisions.some(d => d.userId === c.actorId && d.kind === "PARTICIPANT"),
    canApproveWeight: writable && c.role === "OWNER" && !decisions.some(d => d.userId === c.actorId && d.kind === "WEIGHT"),
    canChallenge: writable && !decisions.some(d => d.userId === c.actorId && (d.decision === "DISPUTE" || d.kind === "CHALLENGE")),
  };
}
async function currentEvaluationView(c: WorkspaceContext, row: ContributionOutcomeEvaluation) {
  const decisions = await c.tx.contributionEvaluationDecision.findMany({ where: { evaluationId: row.id } });
  const objections = await outcomeObjections(c, row.outcomeId);
  const result = evaluationView(c, row, decisions.map(d => ({ ...d, kind: d.kind as EvaluationDecision["kind"], decision: d.decision as "APPROVE" | "DISPUTE", createdAt: d.createdAt.toISOString() })), objections);
  const latest = await c.tx.contributionOutcomeEvaluation.findFirst({ where: { outcomeId: row.outcomeId }, orderBy: { version: "desc" }, select: { id: true } });
  result.supersededById = latest?.id !== row.id ? latest?.id : null;
  if (result.supersededById) result.canApprove = result.canApproveWeight = result.canChallenge = result.canResolveObjection = false;
  else {
    if ((await currentRule(c))?.id !== row.ruleId) result.approvalBlockedReason = "RULE_CHANGED";
    else {
      const sourceIds = new Set(result.payload.sources.map(s => s.id));
      const sources = (await allSources(c)).filter(s => sourceIds.has(s.id)).sort((a, b) => a.id.localeCompare(b.id));
      if (evaluationHash(sources) !== evaluationHash(result.payload.sources)) result.approvalBlockedReason = "SOURCE_CHANGED";
    }
    if (result.approvalBlockedReason) result.canApprove = result.canApproveWeight = result.canResolveObjection = false;
  }
  return result;
}
async function state(c: WorkspaceContext, period: AllocationPeriod) {
  const sources = await allSources(c);
  const [outcomes, mappings, evaluations, decisionRows, roster, rule, memberships] = await Promise.all([
    c.tx.contributionOutcome.findMany({ where: { projectId: c.project.id }, orderBy: { key: "asc" } }),
    c.tx.contributionOutcomeSource.findMany({ where: { projectId: c.project.id } }),
    c.tx.contributionOutcomeEvaluation.findMany({ where: { projectId: c.project.id }, orderBy: { version: "desc" } }),
    c.tx.contributionEvaluationDecision.findMany({ where: { projectId: c.project.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    eligibleAllocationRoster(c, period), currentRule(c),
    c.tx.projectMembershipPeriod.findMany({ where: { projectId: c.project.id }, select: { userId: true } }),
  ]);
  const teamIds = new Set(memberships.map(m => m.userId));
  const inPeriod = (s: EvaluationSource) => new Date(s.workDate) >= period.periodStart && new Date(s.workDate) <= period.periodEnd;
  const latest = new Map<string, ContributionOutcomeEvaluation>(); for (const row of evaluations) if (!latest.has(row.outcomeId)) latest.set(row.outcomeId, row);
  const revisionsByOutcome = new Map<string, ContributionOutcomeEvaluation[]>();
  for (const revision of evaluations) { const group = revisionsByOutcome.get(revision.outcomeId) ?? []; group.push(revision); revisionsByOutcome.set(revision.outcomeId, group); }
  const sourceById = new Map(sources.map(s => [s.id, s]));
  const sourcesByOutcome = new Map<string, EvaluationSource[]>();
  for (const mapping of mappings) { const source = sourceById.get(mapping.contributionId); if (source) { const group = sourcesByOutcome.get(mapping.outcomeId) ?? []; group.push(source); sourcesByOutcome.set(mapping.outcomeId, group); } }
  const historicalInPeriod = new Set(evaluations.filter(e => (e.payload as unknown as EvaluationPayload).sources.some(inPeriod)).map(e => e.outcomeId));
  const decisionsByEvaluation = new Map<string, typeof decisionRows>();
  for (const decision of decisionRows) { const group = decisionsByEvaluation.get(decision.evaluationId) ?? []; group.push(decision); decisionsByEvaluation.set(decision.evaluationId, group); }
  const rosterIds = new Set(roster.map(p => p.id));
  const items: ContributionEvaluationRow[] = [];
  for (const outcome of outcomes) {
    const row = latest.get(outcome.id); const payload = row?.payload as unknown as EvaluationPayload | undefined;
    const current = (sourcesByOutcome.get(outcome.id) ?? []).sort((a, b) => a.id.localeCompare(b.id));
    // A later correction cannot quietly remove a previously registered claim from this period's coverage.
    if (!current.some(inPeriod) && !historicalInPeriod.has(outcome.id)) continue;
    const decisions = row ? (decisionsByEvaluation.get(row.id) ?? []).map(d => ({ userId: d.userId, kind: d.kind as EvaluationDecision["kind"], decision: d.decision as "APPROVE" | "DISPUTE", note: d.note, payloadHash: d.payloadHash, createdAt: d.createdAt.toISOString() })) : [];
    const history = revisionsByOutcome.get(outcome.id) ?? [];
    const objections = unresolvedEvaluationObjections(history, history.flatMap(r => decisionsByEvaluation.get(r.id) ?? []));
    const evaluation = row ? evaluationView(c, row, decisions, objections) : null;
    const reasons: ContributionEvaluationRow["reasons"] = [];
    if (objections.length || current.some(s => s.status === "DISPUTED")) reasons.push("DISPUTED");
    if (!payload) reasons.push("AWAITING_PROPOSAL");
    else {
      if (evaluationHash(payload.sources) !== evaluationHash(current.sort((a, b) => a.id.localeCompare(b.id)))) reasons.push("SOURCE_CHANGED");
      if (payload.ruleId !== rule?.id) reasons.push("RULE_CHANGED");
      if (payload.sources.some(s => !inPeriod(s))) reasons.push("SOURCE_OUTSIDE_PERIOD");
      if (payload.writingReference && (new Date(payload.writingReference.recordedFrom) < period.periodStart || new Date(payload.writingReference.recordedThrough) > period.periodEnd)) reasons.push("SOURCE_OUTSIDE_PERIOD");
      if (payload.sources.some(s => !["ACCEPTED", "SELF_RECORDED"].includes(s.status))) reasons.push("SOURCE_NOT_CONFIRMED");
      if (payload.sources.some(s => s.evidence.trim().length < 10 && (!Array.isArray(s.evidenceRefs) || !s.evidenceRefs.length))) reasons.push("MISSING_EVIDENCE");
      const participants = [...new Set(payload.sources.flatMap(s => s.participants))].sort();
      if (!isDeepStrictEqual(participants, payload.participation.map(p => p.userId).sort())) reasons.push("PARTICIPATION_MISMATCH");
      if (participants.some(id => !teamIds.has(id) || !rosterIds.has(id))) reasons.push("MEMBERSHIP_MISMATCH");
      if (!decisions.some(d => d.kind === "WEIGHT" && d.decision === "APPROVE")) reasons.push("AWAITING_WEIGHT");
      if (participants.some(id => !decisions.some(d => d.userId === id && d.kind === "PARTICIPANT" && d.decision === "APPROVE"))) reasons.push("AWAITING_PARTICIPANTS");
    }
    const eligibility = reasons.includes("DISPUTED") ? "DISPUTED" : reasons.some(r => !["AWAITING_PROPOSAL", "AWAITING_WEIGHT", "AWAITING_PARTICIPANTS"].includes(r)) ? "EXCLUDED" : reasons.length ? "PENDING" : "ELIGIBLE";
    items.push({ outcomeId: outcome.id, outcomeKey: outcome.key, title: payload?.sources[0]?.title ?? current[0]?.title ?? outcome.key, sources: current, evaluation, eligibility, reasons,
      verificationMode: eligibility !== "ELIGIBLE" ? null : payload!.sources.every(s => s.status === "ACCEPTED") ? "INDEPENDENTLY_ACCEPTED" : payload!.participation.length === 1 && roster.length === 1 ? "SOLO_SELF_CONFIRMED" : "TEAM_CONFIRMED" });
  }
  const mapped = new Set(mappings.map(m => m.contributionId));
  for (const s of sources.filter(s => !mapped.has(s.id) && inPeriod(s))) items.push({ outcomeId: null, outcomeKey: null, title: s.title, sources: [s], evaluation: null, eligibility: s.status === "DISPUTED" ? "DISPUTED" : "PENDING", reasons: s.status === "DISPUTED" ? ["DISPUTED"] : ["AWAITING_PROPOSAL"], verificationMode: null });
  items.sort((a, b) => (a.outcomeId ?? a.sources[0]!.id).localeCompare(b.outcomeId ?? b.sources[0]!.id));
  const coverage: EvaluationCoverage = { total: items.length, eligible: 0, pending: 0, disputed: 0, excluded: 0 };
  for (const row of items) coverage[row.eligibility.toLowerCase() as "eligible" | "pending" | "disputed" | "excluded"]++;
  return { items, roster, coverage, rule };
}
export const contributionEvaluationService = {
  async rules(projectId: string, actorId: string) { return withWorkspace(projectId, actorId, {}, async c => (await c.tx.contributionEvaluationRule.findMany({ where: { projectId: c.project.id }, orderBy: { version: "desc" } })).map(viewRule)); },
  async createRule(projectId: string, actorId: string, input: z.infer<typeof evaluationRuleSchema>) {
    return withWorkspace(projectId, actorId, { write: true, owner: true }, async c => {
      const previous = await c.tx.contributionEvaluationRule.findUnique({ where: { projectId_clientKey: { projectId: c.project.id, clientKey: input.clientKey } } });
      if (previous) { if (!isDeepStrictEqual({ title: previous.title, rationale: previous.rationale, defaultWeight: previous.defaultWeight, maxWeight: previous.maxWeight }, { title: input.title, rationale: input.rationale, defaultWeight: input.defaultWeight, maxWeight: input.maxWeight })) throw AppError.conflict("Request key was used with different content"); return viewRule(previous); }
      const last = await currentRule(c);
      return viewRule(await c.tx.contributionEvaluationRule.create({ data: { ...input, projectId: c.project.id, version: (last?.version ?? 0) + 1, createdById: c.actorId } }));
    });
  },
  async board(projectId: string, actorId: string, input: z.infer<typeof evaluationBoardSchema>) {
    return withWorkspace(projectId, actorId, {}, async c => {
      const data = await state(c, await periodFor(c, input.periodId));
      const rules = await c.tx.contributionEvaluationRule.findMany({ where: { projectId: c.project.id }, orderBy: { version: "desc" } });
      const start = (input.page - 1) * input.pageSize;
      return { ...data, rule: data.rule ? viewRule(data.rule) : null, rules: rules.map(viewRule), items: data.items.slice(start, start + input.pageSize), total: data.items.length, page: input.page, pageSize: input.pageSize, hasNext: start + input.pageSize < data.items.length, currentActorId: c.actorId };
    });
  },
  async propose(projectId: string, actorId: string, input: EvaluationProposalInput) {
    return withWorkspace(projectId, actorId, { write: true }, async c => {
      const oldRetry = await c.tx.contributionOutcomeEvaluation.findUnique({ where: { projectId_clientKey: { projectId: c.project.id, clientKey: input.clientKey } } });
      if (oldRetry) {
        const receipt = await c.tx.projectActivity.findUnique({ where: { projectId_idempotencyKey: { projectId: c.project.id, idempotencyKey: `evaluation:${input.clientKey}` } } });
        if (oldRetry.createdById !== c.actorId || (receipt?.metadata as { requestHash?: string })?.requestHash !== evaluationHash(input)) throw AppError.conflict("Request key was used with different content");
        return currentEvaluationView(c, oldRetry);
      }
      const rule = await currentRule(c); if (!rule || rule.id !== input.ruleId || input.weight > rule.maxWeight) throw AppError.conflict("Choose the current evaluation rule and a permitted weight");
      let outcome = await c.tx.contributionOutcome.findUnique({ where: { projectId_key: { projectId: c.project.id, key: input.outcomeKey } } });
      const last = outcome ? await c.tx.contributionOutcomeEvaluation.findFirst({ where: { outcomeId: outcome.id }, orderBy: { version: "desc" } }) : null;
      if ((last?.version ?? 0) !== input.expectedVersion) throw AppError.conflict("Outcome changed. Reload before proposing a revision");
      const sources = (await allSources(c)).filter(s => input.contributionIds.includes(s.id)).sort((a, b) => a.id.localeCompare(b.id));
      if (sources.length !== input.contributionIds.length || sources.some(s => !["SUBMITTED", "ACCEPTED", "SELF_RECORDED", "DISPUTED", "NEEDS_CHANGES"].includes(s.status))) throw AppError.badRequest("Select submitted work from this project");
      const participants = [...new Set(sources.flatMap(s => s.participants))].sort();
      if (!participants.length || !isDeepStrictEqual(participants, input.participation.map(p => p.userId).sort())) throw AppError.badRequest("Include every named source participant exactly once");
      const historical = last ? (last.payload as unknown as EvaluationPayload).participation.map(p => p.userId) : [];
      if (c.role !== "OWNER" && ![...participants, ...historical].includes(c.actorId)) throw AppError.forbidden("Only the owner or affected participants can propose an evaluation");
      if (sources.some(s => s.evidence.trim().length < 10 && (!Array.isArray(s.evidenceRefs) || !s.evidenceRefs.length))) throw AppError.badRequest("Supply evidence before proposing evaluation");
      if (!outcome) outcome = await c.tx.contributionOutcome.create({ data: { projectId: c.project.id, key: input.outcomeKey, createdById: c.actorId } });
      const conflicting = await c.tx.contributionOutcomeSource.findMany({ where: { contributionId: { in: input.contributionIds }, outcomeId: { not: outcome.id } } });
      if (conflicting.length) throw AppError.conflict("A source already belongs to another outcome. Amend that outcome instead");
      const priorMappings = await c.tx.contributionOutcomeSource.findMany({ where: { outcomeId: outcome.id } });
      if (priorMappings.some(m => !input.contributionIds.includes(m.contributionId))) throw AppError.badRequest("Preserve all outcome sources when creating a correction");
      const objections = await outcomeObjections(c, outcome.id);
      const payload: EvaluationPayload = { ruleId: rule.id, outcomeKey: input.outcomeKey, weight: input.weight, rationale: input.rationale, retrospectiveWeight: input.retrospectiveWeight, sources, participation: [...input.participation].sort((a, b) => a.userId.localeCompare(b.userId)) };
      if (input.writingReportId) payload.writingReference = await writingEvaluationReference(c, input.writingReportId, sources, outcome.id);
      const row = await c.tx.contributionOutcomeEvaluation.create({ data: { projectId: c.project.id, outcomeId: outcome.id, ruleId: rule.id, version: (last?.version ?? 0) + 1, payload: jsonSnapshot(payload), payloadHash: evaluationHash(payload), clientKey: input.clientKey, createdById: c.actorId } });
      for (const source of sources) await c.tx.contributionOutcomeSource.upsert({ where: { contributionId: source.id }, create: { contributionId: source.id, projectId: c.project.id, outcomeId: outcome.id }, update: {} });
      await c.tx.projectActivity.create({ data: { projectId: c.project.id, actorId: c.actorId, type: "EVALUATION_PROPOSED", entityKind: "EVALUATION", entityId: row.id, idempotencyKey: `evaluation:${input.clientKey}`, metadata: { requestHash: evaluationHash(input) } } });
      await notifyEvaluation(c, [...participants, ...historical, ...objections.map(o => o.userId), c.project.ownerId], row.id, row.version);
      return evaluationView(c, row, [], objections);
    });
  },
  async detail(projectId: string, actorId: string, id: string) {
    return withEvaluation(projectId, actorId, id, false, async (c, row) => {
      const result = await currentEvaluationView(c, row);
      const rule = await c.tx.contributionEvaluationRule.findUniqueOrThrow({ where: { id: row.ruleId } });
      // Former participants receive a review summary, never private artifact references.
      if (!c.role) result.payload = { ...result.payload, sources: result.payload.sources.map(s => ({ ...s, description: "", evidence: "", evidenceRefs: [] })) };
      const people = await workspacePeople(c.tx, [...result.payload.participation.map(p => p.userId), ...result.decisions.map(d => d.userId), ...(result.unresolvedObjections ?? []).map(o => o.userId)]);
      return { evaluation: result, rule: viewRule(rule), people: [...people.values()] };
    });
  },
  async decide(projectId: string, actorId: string, id: string, input: z.infer<typeof evaluationDecisionSchema>) {
    return withEvaluation(projectId, actorId, id, true, async (c, row) => {
      if (row.payloadHash !== input.payloadHash) throw AppError.conflict("Evaluation payload changed");
      const latest = await c.tx.contributionOutcomeEvaluation.findFirst({ where: { outcomeId: row.outcomeId }, orderBy: { version: "desc" } });
      if (latest?.id !== row.id) throw AppError.conflict("Review the latest evaluation revision");
      const payload = row.payload as unknown as EvaluationPayload;
      if (input.kind === "PARTICIPANT" && !payload.participation.some(p => p.userId === c.actorId)) throw AppError.forbidden("Only named participants can confirm participation");
      if (input.kind === "WEIGHT" && c.role !== "OWNER") throw AppError.forbidden("Only the owner can confirm the proposed weight");
      const old = await c.tx.contributionEvaluationDecision.findUnique({ where: { evaluationId_userId_kind: { evaluationId: id, userId: c.actorId, kind: input.kind } } });
      if (old) { if (old.decision !== input.decision || old.note !== input.note) throw AppError.conflict("Decision is immutable. Propose an amendment"); return { recorded: true }; }
      if (input.kind === "RESOLUTION") {
        const own = (await outcomeObjections(c, row.outcomeId)).find(o => o.userId === c.actorId);
        if (!own) throw AppError.forbidden("Only the original objector can resolve their objection");
        if (own.version >= row.version) throw AppError.conflict("Propose a revised evaluation before resolving its objection");
      }
      if (input.decision === "APPROVE") {
        if ((await currentRule(c))?.id !== row.ruleId) throw AppError.conflict("Evaluation rule changed");
        const current = (await allSources(c)).filter(s => payload.sources.some(p => p.id === s.id)).sort((a, b) => a.id.localeCompare(b.id));
        if (evaluationHash(current) !== evaluationHash(payload.sources)) throw AppError.conflict("Source work changed. Propose a new evaluation revision");
      }
      await c.tx.contributionEvaluationDecision.create({ data: { projectId: c.project.id, evaluationId: id, userId: c.actorId, ...input } });
      const open = await outcomeObjections(c, row.outcomeId);
      await notifyEvaluation(c, [...payload.participation.map(p => p.userId), ...open.map(o => o.userId), c.project.ownerId], id, row.version);
      return { recorded: true };
    });
  },
  async requestRun(projectId: string, actorId: string, input: z.infer<typeof evaluationRunSchema>) {
    const row = await withWorkspace(projectId, actorId, { write: true }, async c => {
      await periodFor(c, input.periodId);
      const old = await c.tx.contributionEvaluationRun.findUnique({ where: { projectId_clientKey: { projectId: c.project.id, clientKey: input.clientKey } } });
      if (old) { if (old.actorId !== c.actorId || old.periodId !== input.periodId || old.ruleId !== input.ruleId) throw AppError.conflict("Request key was used with different content"); return old; }
      if ((await currentRule(c))?.id !== input.ruleId) throw AppError.conflict("Choose the current evaluation rule");
      return c.tx.contributionEvaluationRun.create({ data: { ...input, projectId: c.project.id, actorId: c.actorId } });
    });
    if (row.status === "QUEUED") await enqueueEvaluation(row.id);
    return this.run(projectId, actorId, row.id);
  },
  async run(projectId: string, actorId: string, id: string) {
    return withWorkspace(projectId, actorId, {}, async c => {
      const row = await c.tx.contributionEvaluationRun.findFirst({ where: { id, projectId: c.project.id } });
      if (!row) throw AppError.notFound("Evaluation run not found");
      const snapshot = await c.tx.contributionEvaluationSnapshot.findUnique({ where: { runId: row.id }, select: { id: true } });
      return { id: row.id, status: row.status, snapshotId: snapshot?.id ?? null, createdAt: row.createdAt.toISOString() };
    });
  },
  async process(runId: string) {
    const db = getPrisma(); const run = await db.contributionEvaluationRun.findUnique({ where: { id: runId } });
    if (!run || run.status !== "QUEUED") return;
    await withWorkspace(run.projectId, run.actorId, { write: true, timeoutMs: 120000 }, async c => {
      if (await c.tx.contributionEvaluationSnapshot.findUnique({ where: { runId } })) return;
      const period = await periodFor(c, run.periodId); const data = await state(c, period);
      if (data.rule?.id !== run.ruleId) throw AppError.conflict("Rule changed before calculation");
      const rule = viewRule(data.rule); const inputVersion = String((await c.tx.contributionEvaluationState.findUnique({ where: { projectId: c.project.id } }))?.version ?? 0n);
      const calculation = calculateContributionShares(data.roster.map(p => p.id), data.items.filter(i => i.eligibility === "ELIGIBLE").map(i => i.evaluation!.payload));
      const input = { projectId: c.project.id, rule, period: { id: period.id, scope: period.scope, periodStart: period.periodStart.toISOString(), periodEnd: period.periodEnd.toISOString() }, roster: data.roster, outcomes: data.items, rounding: "LARGEST_REMAINDER_UUID_ASC_V1" };
      // Viewer-specific buttons must not become historical input or affect its hash.
      for (const item of input.outcomes) if (item.evaluation) { item.evaluation.canApprove = false; item.evaluation.canApproveWeight = false; item.evaluation.canChallenge = false; item.evaluation.canResolveObjection = false; }
      const id = randomUUID(); const calculatedAt = new Date().toISOString();
      const payload = { ...input, id, periodId: period.id, inputVersion, calculatedAt, calculatedBy: c.actorId, inputHash: evaluationHash(input), coverage: data.coverage, calculation };
      await c.tx.contributionEvaluationSnapshot.create({ data: { id, projectId: c.project.id, periodId: period.id, ruleId: rule.id, runId, inputHash: payload.inputHash, inputVersion: BigInt(inputVersion), payload: jsonSnapshot(payload) } });
      await c.tx.contributionEvaluationRun.update({ where: { id: runId }, data: { status: "COMPLETED" } });
    });
  },
  async snapshots(projectId: string, actorId: string, input: z.infer<typeof evaluationBoardSchema>) {
    return withWorkspace(projectId, actorId, {}, async c => {
      await periodFor(c, input.periodId);
      const where = { projectId: c.project.id, periodId: input.periodId };
      const [rows, total, version] = await Promise.all([c.tx.contributionEvaluationSnapshot.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (input.page - 1) * input.pageSize, take: input.pageSize, select: { id: true, inputHash: true, inputVersion: true, createdAt: true } }), c.tx.contributionEvaluationSnapshot.count({ where }), c.tx.contributionEvaluationState.findUnique({ where: { projectId: c.project.id } })]);
      return { items: rows.map(r => ({ id: r.id, inputHash: r.inputHash, calculatedAt: r.createdAt.toISOString(), isStale: r.inputVersion !== (version?.version ?? 0n) })), total, page: input.page, pageSize: input.pageSize, hasNext: input.page * input.pageSize < total };
    });
  },
  async snapshot(projectId: string, actorId: string, id: string): Promise<ContributionEvaluationSnapshot> {
    return withWorkspace(projectId, actorId, {}, async c => {
      const row = await c.tx.contributionEvaluationSnapshot.findFirst({ where: { id, projectId: c.project.id } });
      if (!row) throw AppError.notFound("Evaluation snapshot not found");
      const version = await c.tx.contributionEvaluationState.findUnique({ where: { projectId: c.project.id } });
      return { ...(row.payload as unknown as ContributionEvaluationSnapshot), isStale: row.inputVersion !== (version?.version ?? 0n) };
    });
  },
};
async function withEvaluation<T>(projectId: string, actorId: string, id: string, write: boolean, run: (c: WorkspaceContext, row: ContributionOutcomeEvaluation) => Promise<T>) {
  const db = getPrisma();
  const [project, actor] = await Promise.all([db.project.findUnique({ where: workspaceId(projectId) }), db.user.findUnique({ where: workspaceId(actorId), select: { id: true } })]);
  if (!project || !actor) throw AppError.notFound("Evaluation not found");
  return db.$transaction(async tx => {
    await lockProjectAccounts(tx, [actor.id], project.id); await assertActiveProjectAccount(tx, actor.id);
    const live = await tx.project.findUniqueOrThrow({ where: { id: project.id } });
    const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: live.id, userId: actor.id } } });
    const role = live.ownerId === actor.id ? "OWNER" : member?.status === "ACTIVE" ? "MEMBER" : null;
    const row = await tx.contributionOutcomeEvaluation.findFirst({ where: { id, projectId: live.id } });
    if (!row) throw AppError.notFound("Evaluation not found");
    if (!role) {
      const revisions = await tx.contributionOutcomeEvaluation.findMany({ where: { projectId: live.id, outcomeId: row.outcomeId }, select: { id: true, payload: true } });
      const sourceIds = [...new Set(revisions.flatMap(r => (r.payload as unknown as EvaluationPayload).sources.map(s => s.id)))];
      const [participant, history, objector] = await Promise.all([
        tx.contributionParticipant.findFirst({ where: { proposalId: { in: sourceIds }, userId: actor.id } }),
        tx.projectContributionHistory.findMany({ where: { proposalId: { in: sourceIds } }, select: { snapshot: true } }),
        tx.contributionEvaluationDecision.findFirst({ where: { evaluationId: { in: revisions.map(r => r.id) }, userId: actor.id, decision: "DISPUTE" } }),
      ]);
      const previouslyNamed = history.some(h => (h.snapshot as { participants?: { userId: string }[] }).participants?.some(p => p.userId === actor.id));
      if (!participant && !previouslyNamed && !objector) throw AppError.notFound("Evaluation not found");
    }
    if (write && live.status === "ARCHIVED") throw AppError.conflict("Archived projects are read-only");
    return run({ tx, project: live, actorId: actor.id, role }, row);
  }, { maxWait: 10000, timeout: 20000 });
}
async function notifyEvaluation(c: WorkspaceContext, recipients: string[], id: string, version: number) {
  // Use the existing durable notification outbox, with a dedicated restricted review link.
  await contributionsNotify(c, recipients, `EVALUATION_${id}_${await c.tx.contributionEvaluationDecision.count({ where: { evaluationId: id } })}`, id, version, false, true);
}
export async function enqueueEvaluation(id: string) {
  const { aiJobsQueue } = await import("../../infrastructure/queue.js");
  await aiJobsQueue.add(CONTRIBUTION_EVALUATION_JOB, { runId: id }, { jobId: `evaluation-${id}`, attempts: 5, backoff: { type: "exponential", delay: 2000 } });
}
export async function evaluationAllocationReference(c: WorkspaceContext, periodId: string, snapshotId: string | null | undefined, shares: AllocationShareInput[]): Promise<EvaluationAllocationReference | null> {
  if (!snapshotId) return null;
  const row = await c.tx.contributionEvaluationSnapshot.findFirst({ where: { id: snapshotId, projectId: c.project.id, periodId } });
  if (!row) throw AppError.badRequest("Choose an evaluation snapshot from this allocation period");
  const snap = row.payload as unknown as ContributionEvaluationSnapshot;
  if (snap.calculation.status === "INSUFFICIENT_DATA") throw AppError.badRequest("This snapshot has no suggested distribution");
  if (!isDeepStrictEqual(shares.map(s => s.userId).sort(), snap.roster.map(p => p.id).sort())) throw AppError.conflict("Snapshot roster differs from allocation roster");
  const differences = shares.map(s => { const suggested = snap.calculation.scores.find(p => p.userId === s.userId)!.basisPoints!; return { userId: s.userId, suggestedBasisPoints: suggested, proposedBasisPoints: s.basisPoints, deltaBasisPoints: s.basisPoints - suggested, rationale: s.rationale }; });
  if (differences.some(d => d.deltaBasisPoints && d.rationale.trim().length < 10)) throw AppError.badRequest("Explain each adjustment to the suggested distribution");
  return { snapshotId, ruleVersion: snap.rule.version, calculatedAt: snap.calculatedAt, inputHash: snap.inputHash, differences };
}
