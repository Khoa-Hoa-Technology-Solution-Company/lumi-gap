import type { ScreeningObligation, ScreeningRound } from "../../generated/prisma/client.js";
import type { ScreeningAutomaticTask, ScreeningTaskAction, ScreeningTaskStatus, ScreeningTaskFeedback } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { withWorkspace, type WorkspaceContext } from "./workspace-access.js";
import { roundView, roundSettings } from "./screening-context.js";
import { screeningPeople } from "./screening-assignments.js";
import { caseView, ensureAssignment } from "./screening-case-context.js";

const open = (status: string) => ["TODO", "IN_PROGRESS", "BLOCKED"].includes(status);
const final = (round: ScreeningRound) => ["INCLUDED", "EXCLUDED", "BACKGROUND", "WAITING_FULLTEXT"].includes(round.status);
type Desired = { round: ScreeningRound; actor: string; kind: ScreeningTaskAction; instance: string; dueAt?: Date | null; completedAt?: Date | null; status?: ScreeningTaskStatus; reason?: string };

/** Run only inside withWorkspace's project lock. State, ledger and events commit together.
 * Reads and the existing maintenance worker also reconcile time/access driven transitions.
 * No ballot text or sealed statement content is copied into the task ledger.
 */
export async function reconcileScreeningObligations(c: WorkspaceContext) {
  const now = new Date();
  let rounds = await c.tx.screeningRound.findMany({ where: { projectId: c.project.id } });
  const [assignments, members, people, old] = await Promise.all([
    c.tx.screeningAssignment.findMany({ where: { projectId: c.project.id } }),
    c.tx.projectMember.findMany({ where: { projectId: c.project.id, status: "ACTIVE" }, select: { userId: true } }),
    screeningPeople(c),
    c.tx.screeningObligation.findMany({ where: { projectId: c.project.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
  ]);
  const live = new Set(people.map(p => p.id));
  const memberIds = new Set(members.map(p => p.userId));
  const asActor = (id: string): WorkspaceContext => ({ ...c, actorId: id, role: id === c.project.ownerId ? "OWNER" : memberIds.has(id) ? "MEMBER" : null });
  const initialCases = await c.tx.screeningAdjudicationCase.findMany({ where: { projectId: c.project.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  for (const row of initialCases.filter(row => row.active)) {
    const round = rounds.find(r => r.id === row.roundId);
    if (round) await ensureAssignment(c, round, row, true);
  }
  const [cases, statements, invitations, decisions, claims] = await Promise.all([
    c.tx.screeningAdjudicationCase.findMany({ where: { projectId: c.project.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    c.tx.screeningAdjudicationStatement.findMany({ where: { projectId: c.project.id }, select: { caseId: true, reviewerId: true, packetVersion: true, createdAt: true } }),
    c.tx.screeningAdjudicationInvitation.findMany({ where: { projectId: c.project.id } }),
    c.tx.screeningFinalDecision.findMany({ where: { projectId: c.project.id }, orderBy: { roundVersion: "desc" } }),
    c.tx.screeningAudit.findMany({ where: { projectId: c.project.id, type: { in: ["ROUND_CLAIMED", "NEXT_ROUND_CLAIMED", "REVIEW_REOPENED"] } }, orderBy: { createdAt: "desc" }, select: { id: true, roundId: true, actorId: true, details: true, result: true } }),
  ]);
  rounds = await c.tx.screeningRound.findMany({ where: { projectId: c.project.id } });
  const desired: Desired[] = [];
  const writable = !["ARCHIVED", "COMPLETED"].includes(c.project.status);
  for (const r of rounds) {
    const enabled = writable && r.active && !r.legacyNeedsAudit;
    const assigned = assignments.filter(a => a.roundId === r.id);
    const dispute = cases.find(row => row.roundId === r.id && row.active);
    for (const a of assigned) {
      const claim = claims.find(e => e.roundId === r.id && (e.actorId === a.reviewerId || (e.details as { assignmentId?: string }).assignmentId === a.id) && ((e.result as { assignmentId?: string }).assignmentId === a.id || (e.details as { assignmentId?: string }).assignmentId === a.id));
      const instance = `review:${a.id}:${claim?.id ?? "initial"}`;
      if (a.submittedAt || enabled && a.active && live.has(a.reviewerId) && !final(r) && (!a.dueAt || a.dueAt > now)) {
        desired.push({ round: r, actor: a.reviewerId, kind: "REVIEW", instance, dueAt: a.dueAt, completedAt: a.submittedAt, status: a.submittedAt ? "DONE" : "TODO", reason: a.submittedAt ? "Đã gửi phiếu đánh giá" : "Chờ bạn gửi phiếu" });
      }
    }
    if (!enabled) continue;
    if (dispute) {
      for (const id of dispute.reviewerIds.filter(id => live.has(id))) {
        if (dispute.status === "COLLECTING" && !dispute.lockedAt && dispute.deadline > now && !statements.some(s => s.caseId === dispute.id && s.reviewerId === id && s.packetVersion === dispute.packetVersion))
          desired.push({ round: r, actor: id, kind: "STATEMENT", instance: `statement:${dispute.id}:${dispute.packetVersion}`, dueAt: dispute.deadline, reason: "Chờ bạn gửi quan điểm riêng" });
      }
      const ids = new Set([c.project.ownerId, ...(roundSettings(r.settings).adjudicationCoordinatorIds ?? []), ...invitations.filter(i => i.caseId === dispute.id && i.status === "ASSIGNED").map(i => i.userId)]);
      for (const id of ids) {
        if (!live.has(id) && !invitations.some(i => i.caseId === dispute.id && i.userId === id && i.status === "ASSIGNED")) continue;
        try {
          const view = await caseView(asActor(id), r, dispute);
          const invitation = invitations.find(i => i.caseId === dispute.id && i.userId === id && i.status === "ASSIGNED");
          if (view.canResolve && invitation || invitation && view.invitation?.userId === id && dispute.status === "COI_REVIEW")
            desired.push({ round: r, actor: id, kind: "ADJUDICATION", instance: `adjudication:${invitation!.id}`, status: dispute.status === "COI_REVIEW" ? "BLOCKED" : dispute.status === "IN_PROGRESS" ? "IN_PROGRESS" : "TODO", reason: dispute.status === "COI_REVIEW" ? "Chờ điều phối xem xét xung đột lợi ích" : "Chờ kết luận có lý do và căn cứ" });
          if (view.canCoordinate && ["WAITING_ASSIGNMENT", "COI_REVIEW"].includes(view.status))
            desired.push({ round: r, actor: id, kind: "COORDINATION", instance: `coordination:${dispute.id}:${dispute.status}`, reason: view.status === "COI_REVIEW" ? "Xem xét báo cáo xung đột lợi ích" : "Phân công người phân xử hợp lệ" });
        } catch (error) { if (!(error instanceof AppError && error.statusCode === 404)) throw error; }
      }
    } else if (["NEEDS_RESOLUTION", "NEEDS_MORE_INFO"].includes(r.status)) {
      for (const a of assigned.filter(a => a.active && a.submittedAt && live.has(a.reviewerId))) {
        const view = await roundView(asActor(a.reviewerId), r);
        if (view.hiddenReviews || view.resolution || r.finalizerId) continue;
        if (view.agreement?.canConfirm) desired.push({ round: r, actor: a.reviewerId, kind: "CONSENSUS", instance: `consensus:${view.agreement.id}`, reason: "Phản hồi đề xuất thống nhất" });
        else if (!view.agreement || view.agreement.canDecline || (roundSettings(r.settings).workflowVersion ?? 0) >= 5)
          desired.push({ round: r, actor: a.reviewerId, kind: "DISCUSSION", instance: `discussion:${r.id}`, reason: view.classification === "CONFLICT" ? "Trao đổi và giải quyết bất đồng" : "Đối chiếu nguồn và làm rõ đánh giá" });
      }
    }
    if (["WAITING_FULLTEXT", "NEEDS_MORE_INFO"].includes(r.status)) {
      const link = await c.tx.projectPaper.findUnique({ where: { projectId_paperId: { projectId: c.project.id, paperId: r.paperId } }, select: { addedById: true } });
      for (const id of new Set([c.project.ownerId, ...(link?.addedById ? [link.addedById] : [])].filter(id => live.has(id)))) {
        const view = await roundView(asActor(id), r);
        if (r.status === "WAITING_FULLTEXT" ? view.canResumeFullText : id === c.project.ownerId && view.resolution)
          desired.push({ round: r, actor: id, kind: r.status === "WAITING_FULLTEXT" ? "FULLTEXT" : "INFORMATION", instance: `information:${r.id}:${r.version}`, reason: view.resolution?.reason ?? "Bổ sung nguồn toàn văn để tiếp tục" });
      }
    }
  }
  const matches = (row: ScreeningObligation, d: Desired) => row.roundId === d.round.id && row.assigneeId === d.actor && row.actionType === d.kind && (row.workflowInstanceId === d.instance || row.workflowInstanceId.startsWith(`${d.instance}|`));
  async function change(row: ScreeningObligation, status: string, reason: string, dueAt = row.dueAt) {
    if (row.status === status && row.reason === reason && row.dueAt?.getTime() === dueAt?.getTime()) return row;
    const next = await c.tx.screeningObligation.update({ where: { id: row.id }, data: { status, reason, dueAt, endedAt: open(status) ? null : now } });
    await c.tx.screeningObligationEvent.create({ data: { obligationId: row.id, status, reason } });
    return next;
  }
  // End old instances first, so the partial unique index prevents concurrent live duplicates.
  for (const row of old.filter(row => open(row.status))) {
    if (desired.some(d => matches(row, d))) continue;
    const r = rounds.find(r => r.id === row.roundId)!;
    const dispute = cases.find(d => row.workflowInstanceId.includes(d.id));
    const activeCase = cases.find(d => d.roundId === r.id && d.active);
    let status = "CANCELLED", reason = "Nhiệm vụ không còn quyền hoặc không còn hiệu lực";
    if (row.actionType === "REVIEW") {
      const assignment = assignments.find(a => row.workflowInstanceId.includes(a.id));
      if (assignment?.submittedAt) { status = "DONE"; reason = "Đã gửi phiếu đánh giá"; }
      else if (assignment?.dueAt && assignment.dueAt <= now || row.dueAt && row.dueAt <= now) { status = "EXPIRED"; reason = "Hết thời hạn giữ suất đánh giá"; }
      else if (assignment && !assignment.active) reason = "Đã trả suất hoặc bị thu hồi quyền đánh giá";
    } else if (row.actionType === "STATEMENT" && dispute) {
      const version = Number(row.workflowInstanceId.split(":")[2]?.split("|")[0]);
      if (statements.some(s => s.caseId === dispute.id && s.packetVersion === version && s.reviewerId === row.assigneeId)) { status = "DONE"; reason = "Đã gửi quan điểm riêng"; }
      else if (version !== dispute.packetVersion) { status = "REPLACED"; reason = "Hồ sơ có phiên bản mới, cần đối chiếu lại"; }
      else if (dispute.deadline <= now) { status = "EXPIRED"; reason = "Hết hạn gửi quan điểm; không bổ sung ý kiến"; }
    } else if (["DISCUSSION", "CONSENSUS"].includes(row.actionType) && activeCase) { status = "REPLACED"; reason = "Chuyển sang phân xử"; }
    else if (["DISCUSSION", "CONSENSUS"].includes(row.actionType) && final(r)) { status = "DONE"; reason = "Hai phiếu đã có kết quả hợp lệ"; }
    else if (row.actionType === "ADJUDICATION") {
      const invitation = invitations.find(i => row.workflowInstanceId.includes(i.id));
      const source = cases.find(d => d.id === invitation?.caseId);
      if (source?.finalDecisionId && decisions.some(d => d.id === source.finalDecisionId && d.resolverId === row.assigneeId)) { status = "DONE"; reason = "Đã lưu quyết định phân xử"; }
      else if (invitation?.status === "REVOKED") { status = "REPLACED"; reason = invitation.responseReason || "Đã phân công lại hoặc thu hồi quyền phân xử"; }
    } else if (row.actionType === "COORDINATION" && activeCase && ["ASSIGNED", "IN_PROGRESS"].includes(activeCase.status)) { status = "DONE"; reason = "Đã phân công người phân xử hợp lệ"; }
    else if (["FULLTEXT", "INFORMATION"].includes(row.actionType) && !["WAITING_FULLTEXT", "NEEDS_MORE_INFO"].includes(r.status)) { status = "DONE"; reason = "Đã chuyển sang bước đánh giá tiếp theo"; }
    if (!r.active && !final(r) && status !== "DONE") { status = "REPLACED"; reason = "Vòng đã được thay thế hoặc mất hiệu lực"; }
    await change(row, status, reason);
  }
  for (const d of desired) {
    const previous = old.find(row => matches(row, d));
    const status = d.status ?? "TODO", reason = d.reason ?? "";
    if (previous && open(previous.status)) { await change(previous, status, reason, d.dueAt ?? null); continue; }
    // Never reopen completed obligations. Recurring discussion/coordination gets a new episode.
    const recurring = ["DISCUSSION", "COORDINATION"].includes(d.kind);
    if (previous && (!recurring || status === "DONE")) continue;
    const row = await c.tx.screeningObligation.create({ data: { projectId: c.project.id, paperId: d.round.paperId, roundId: d.round.id, assigneeId: d.actor, actionType: d.kind, workflowInstanceId: previous ? `${d.instance}|${previous.id}` : d.instance, status, reason, dueAt: d.dueAt, endedAt: open(status) ? null : d.completedAt ?? now } });
    await c.tx.screeningObligationEvent.create({ data: { obligationId: row.id, status, reason } });
  }
}

export async function screeningObligationDtos(c: WorkspaceContext): Promise<ScreeningAutomaticTask[]> {
  const rows = await c.tx.screeningObligation.findMany({ where: { projectId: c.project.id, assigneeId: c.actorId }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }] });
  const [papers, rounds] = await Promise.all([
    c.tx.paper.findMany({ where: { id: { in: rows.map(r => r.paperId) } }, select: { id: true, title: true } }),
    c.tx.screeningRound.findMany({ where: { projectId: c.project.id, id: { in: rows.map(r => r.roundId) } }, select: { id: true, phase: true, number: true, status: true, active: true } }),
  ]);
  return rows.map(row => {
    const round = rounds.find(r => r.id === row.roundId)!;
    return { actionLabel: row.actionType === "DISCUSSION" && row.reason === "Đối chiếu nguồn và làm rõ đánh giá" ? "Làm rõ đánh giá" : undefined, id: row.id, paperId: row.paperId, roundId: row.roundId, assigneeId: row.assigneeId, actionType: row.actionType as ScreeningTaskAction, status: row.status as ScreeningTaskStatus, reason: row.reason, title: papers.find(p => p.id === row.paperId)?.title ?? "Bài báo", phase: round.phase as ScreeningAutomaticTask["phase"], roundNumber: round.number, roundStatus: round.status, roundActive: round.active, dueAt: row.dueAt?.toISOString() ?? null, endedAt: row.endedAt?.toISOString() ?? null, updatedAt: row.updatedAt.toISOString() };
  });
}
export const screeningObligationsService = {
  async list(project: string, actor: string) {
    return withWorkspace(project, actor, { mentor: true, mentorScope: "SHARED_RESOURCES" }, async c => {
      await reconcileScreeningObligations(c);
      // Scoped mentors only receive their own case obligations, never other project work.
      const rows = await screeningObligationDtos(c);
      return c.role ? rows : rows.filter(row => row.actionType === "ADJUDICATION");
    });
  },
};

export async function screeningTaskFeedback(c: WorkspaceContext, roundId: string, command: string): Promise<ScreeningTaskFeedback | undefined> {
  const labels: Record<string, string> = { ROUND_CLAIMED: "Nhận bài đánh giá", NEXT_ROUND_CLAIMED: "Nhận bài đánh giá", LEASE_EXTENDED: "Gia hạn lượt đánh giá", REVIEW_SUBMITTED: "Gửi phiếu đánh giá", REVIEW_REASSESSED: "Cập nhật đánh giá", ADJUDICATION_REQUESTED: "Yêu cầu phân xử", ADJUDICATION_STATEMENT: "Gửi quan điểm phân xử", ADJUDICATION_START: "Bắt đầu phân xử", FINALIZED: "Ghi kết luận", ROUND_RELEASED: "Trả suất đánh giá", FULLTEXT_READY: "Bổ sung toàn văn", ADJUDICATION_SELECT: "Phân công người phân xử", ADJUDICATION_REASSIGN: "Phân công lại" };
  if (!labels[command]) return undefined;
  const round = await c.tx.screeningRound.findUniqueOrThrow({ where: { id: roundId } });
  const dispute = await c.tx.screeningAdjudicationCase.findFirst({ where: { roundId, active: true } });
  const assignments = await c.tx.screeningAssignment.findMany({ where: { roundId, active: true } });
  const statements = dispute ? await c.tx.screeningAdjudicationStatement.findMany({ where: { caseId: dispute.id, packetVersion: dispute.packetVersion }, select: { reviewerId: true } }) : [];
  const remaining = dispute?.reviewerIds.filter(id => !statements.some(s => s.reviewerId === id)) ?? [];
  const nextRound = !round.active ? await c.tx.screeningRound.findFirst({ where: { projectId: c.project.id, paperId: round.paperId, active: true, number: { gt: round.number } } }) : null;
  const nextActor = nextRound?.phase === "FULL_TEXT" ? "Hai reviewer của vòng toàn văn" : dispute?.status === "COLLECTING" ? remaining.includes(c.actorId) ? "Bạn cần gửi quan điểm riêng" : "Reviewer còn lại"
    : dispute?.status === "WAITING_ASSIGNMENT" || dispute?.status === "COI_REVIEW" ? "Người điều phối độc lập"
    : dispute ? "Người phân xử được phân công"
    : round.status === "WAITING_FULLTEXT" || round.status === "NEEDS_MORE_INFO" ? "Người được giao bổ sung thông tin"
    : final(round) ? "Không còn hành động trong vòng này"
    : assignments.some(a => a.reviewerId === c.actorId && !a.submittedAt) ? "Bạn cần gửi phiếu đánh giá"
    : ["IN_REVIEW", "NOT_REVIEWED"].includes(round.status) || assignments.some(a => !a.submittedAt) ? "Reviewer chưa gửi phiếu hoặc reviewer nhận suất còn trống" : "Hai reviewer theo quy trình của vòng";
  const labelsByStatus: Record<string, string> = { COLLECTING: "Đang thu thập ý kiến", WAITING_ASSIGNMENT: "Chờ phân công", ASSIGNED: "Đã phân công người phân xử", IN_PROGRESS: "Đang phân xử", INCLUDED: "Đã qua vòng theo quy trình", EXCLUDED: "Đã loại", WAITING_FULLTEXT: "Chờ toàn văn", IN_REVIEW: assignments.some(a => a.submittedAt) ? "Chờ phiếu còn lại" : "Đang đánh giá", NEEDS_MORE_INFO: "Cần bổ sung thông tin", NEEDS_RESOLUTION: "Cần giải quyết bất đồng", COI_REVIEW: "Chờ xem xét xung đột lợi ích" };
  return { roundId, completedAction: labels[command]!, nextStatus: nextRound?.phase === "FULL_TEXT" ? "Qua vòng tiêu đề / tóm tắt, chờ đánh giá toàn văn" : labelsByStatus[dispute?.status ?? round.status] ?? round.status,
    nextActor };
}
