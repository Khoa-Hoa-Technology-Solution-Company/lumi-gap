import type { ScreeningAutomaticTask, ScreeningClassification, ScreeningEvaluationStatus, ScreeningPersonalEvaluation, ScreeningWorkspaceSummary, ScreeningWorkPaper } from "@trend/shared-types";
import { screeningStatusTone, screeningClassificationLabels } from "./screening-status";

export const evaluationStatusLabels: Record<ScreeningEvaluationStatus, string> = {
  CONSENSUS_REQUIRED: "Cần thảo luận", CONSENSUS_IN_PROGRESS: "Đang thảo luận",
  WAITING_FULLTEXT: "Chờ toàn văn", ADVANCE_TO_FULLTEXT: "Qua vòng tiêu đề / tóm tắt",
  WAITING_REVIEWER: "Chờ người còn lại", CONFLICT: "Có bất đồng", ADJUDICATING: "Đang phân xử",
  INCLUDED: "Qua vòng", EXCLUDED: "Đã loại", NEEDS_MORE_INFO: "Cần làm rõ",
  AWAITING_FINALIZATION: "Chờ chốt kết quả", BACKGROUND: "Tài liệu nền",
};
export type MyWorkTask = {
  obligation?: ScreeningAutomaticTask;
  paperId: string; roundId: string; title: string;
  kind: "REVIEW" | "CONSENSUS" | "DISCUSSION" | "STATEMENT" | "ADJUDICATION" | "COORDINATION" | "FULLTEXT" | "INFORMATION";
  label: string; description: string; action: string; deadline?: string | null;
};
export function myWorkTasks(summary: ScreeningWorkspaceSummary, readOnly: boolean, now = Date.now()): MyWorkTask[] {
  if (readOnly || summary.readOnly) return [];
  if (summary.automaticTasks) return summary.automaticTasks.filter(t => !t.endedAt && t.status !== "BLOCKED" && (!t.dueAt || Date.parse(t.dueAt) > now)).map(automaticWorkTask);
  const tasks = new Map<string, MyWorkTask>();
  const add = (task: MyWorkTask) => { if (!tasks.has(task.roundId)) tasks.set(task.roundId, task); };
  const cases = new Set((summary.myTrackedDisputes ?? []).filter(t => t.caseStatus).map(t => t.roundId));

  // 1. Disputes needing my opinion/statement
  const statements = (summary.myTrackedDisputes ?? []).filter(t => t.needsMyStatement && (!t.deadline || new Date(t.deadline).getTime() > now))
    .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));
  for (const t of statements) add({ ...t, kind: "STATEMENT", label: "Cần gửi ý kiến", description: "Nêu quan điểm và căn cứ của bạn để hoàn tất hồ sơ phân xử.", action: "Nhập ý kiến ngay" });

  // 3. Consensus proposals
  for (const t of summary.pendingConsensus) if (!cases.has(t.roundId)) add({ ...t, kind: "CONSENSUS", label: "Cần phản hồi", description: `${t.proposedByName} đã đề xuất thống nhất. Xem căn cứ và phản hồi.`, action: "Xem & phản hồi" });

  // 4. Discussions
  for (const t of summary.pendingDiscussions ?? []) if (!cases.has(t.roundId)) {
    const isClarification = t.classification === "NEEDS_CLARIFICATION" || t.classification === "NEEDS_MORE_INFORMATION";
    const isMismatch = t.classification === "EXCLUSION_REASON_MISMATCH";
    add({
      ...t,
      kind: "DISCUSSION",
      label: t.classification === "NEEDS_CLARIFICATION" ? "Cần làm rõ" : t.classification === "NEEDS_MORE_INFORMATION" ? "Cần đọc thêm" : isMismatch ? "Cần thống nhất lý do loại" : "Có bất đồng",
      description: isClarification
        ? "Trao đổi và xem xét lại phiếu của bạn. Chưa đủ căn cứ kết luận, đối chiếu tiêu chí và cập nhật phiếu của bạn."
        : isMismatch
        ? "Hai reviewer chọn loại nhưng chưa thống nhất lý do. Thảo luận để đối chiếu tiêu chí và cập nhật đánh giá."
        : "Có bất đồng kết luận giữa hai reviewer. Trao đổi và xem xét lại phiếu của bạn.",
      action: isClarification ? "Xem lại & làm rõ" : "Trao đổi và xem lại"
    });
  }

  // 5. Adjudications assigned
  for (const t of summary.pendingAdjudications) {
    const coordination = t.caseStatus === "WAITING_ASSIGNMENT" || t.caseStatus === "COI_REVIEW";
    add({ ...t, kind: coordination ? "COORDINATION" : "ADJUDICATION", label: coordination ? "Cần điều phối phân xử" : "Cần tôi phân xử", description: coordination ? "Phân công người hợp lệ hoặc xem xét báo cáo xung đột." : "Đọc hồ sơ, tài liệu và tiêu chí để ghi quyết định có căn cứ.", action: "Mở hồ sơ phân xử" });
  }

  for (const t of summary.pendingInformation ?? []) add({ ...t, kind: t.kind, label: t.kind === "FULLTEXT" ? "Cần bổ sung toàn văn" : "Cần bổ sung thông tin", description: t.reason, action: t.kind === "FULLTEXT" ? "Bổ sung toàn văn" : "Bổ sung và mở lại" });

  // 6. Active claims
  for (const t of summary.myActiveClaims) if (!t.dueAt || new Date(t.dueAt).getTime() > now) add({ ...t, kind: "REVIEW", label: "Chưa gửi phiếu", description: "Hoàn tất phiếu đánh giá trong thời hạn giữ chỗ.", action: "Tiếp tục đánh giá", deadline: t.dueAt });

  return [...tasks.values()];
}
// Compatibility while the running backend is being updated.
export function personalEvaluations(summary: ScreeningWorkspaceSummary): ScreeningPersonalEvaluation[] {
  if (summary.myEvaluations) return summary.myEvaluations;
  return (summary.myCompletedEvaluations ?? []).map(t => ({
    ...t,
    submittedAt: t.decidedAt ?? "",
    groupStatus: (t.finalDecision === "INCLUDE" || t.finalDecision === "INCLUDED" ? "INCLUDED" : t.finalDecision === "EXCLUDE" || t.finalDecision === "EXCLUDED" ? "EXCLUDED" : "BACKGROUND") as ScreeningEvaluationStatus,
    publicationYear: t.publicationYear ?? null,
    journalName: t.journalName ?? null,
    isAdjudicated: "isAdjudicated" in t && Boolean(t.isAdjudicated),
    decidedAt: "decidedAt" in t ? t.decidedAt ?? null : null,
    resolverName: "resolverName" in t ? t.resolverName ?? null : null
  }));
}
export type EvaluationHistoryFilter = "PENDING" | "DECIDED" | "ALL";
export function matchesEvaluationHistory(item: ScreeningPersonalEvaluation, filter: EvaluationHistoryFilter) {
  const decided = ["INCLUDED", "EXCLUDED", "BACKGROUND"].includes(item.groupStatus);
  return filter === "ALL" || (filter === "DECIDED" ? decided : !decided);
}
export function evaluationGroupLabel(item: ScreeningPersonalEvaluation) {
  if (item.groupStatus === "INCLUDED") return item.acceptedForAnalysis ? "Chấp nhận bài" : "Qua vòng";
  if (item.groupStatus === "ADJUDICATING" && item.caseStatus === "WAITING_ASSIGNMENT") return "Chờ phân công";
  return evaluationStatusLabels[item.groupStatus];
}
export function screeningTaskGroup(task: MyWorkTask) {
  return task.kind === "REVIEW" ? "REVIEW" : task.kind === "ADJUDICATION" ? "ADJUDICATION" : "RESOLUTION";
}
export function screeningWorkLink(projectId: string, item: Pick<MyWorkTask, "paperId" | "roundId" | "obligation">, section: "review" | "discussion" | "history" | "statement" | "decision" | "coordination") {
  const dossier = ["statement", "decision", "coordination"].includes(section);
  const query = new URLSearchParams({ tab: dossier ? "tasks" : "papers", view: dossier ? "screening" : "my-work" });
  query.set(dossier ? "screeningRound" : "round", item.roundId);
  query.set(dossier ? "screeningPaper" : "paper", item.paperId);
  query.set(dossier ? "screeningSection" : "section", section);
  if (item.obligation) query.set("automaticTask", item.obligation.id);
  return `/projects/${encodeURIComponent(projectId)}?${query}`;
}

export const automaticTaskActions = { REVIEW: "Đánh giá bài báo", DISCUSSION: "Giải quyết bất đồng", CONSENSUS: "Thảo luận và cập nhật đánh giá", STATEMENT: "Gửi quan điểm phân xử", ADJUDICATION: "Đưa ra kết luận phân xử", COORDINATION: "Điều phối phân xử", FULLTEXT: "Bổ sung toàn văn", INFORMATION: "Bổ sung thông tin" };
export const automaticTaskStatuses = { TODO: "Cần làm", IN_PROGRESS: "Đang thực hiện", BLOCKED: "Đang vướng mắc", DONE: "Hoàn thành", EXPIRED: "Hết hạn", CANCELLED: "Đã hủy", REPLACED: "Đã chuyển bước" };
export function automaticWorkTask(task: ScreeningAutomaticTask): MyWorkTask {
  return { paperId: task.paperId, roundId: task.roundId, title: task.title, kind: task.actionType, label: task.actionLabel ?? automaticTaskActions[task.actionType], description: task.reason, action: task.endedAt ? "Xem lại" : task.status === "BLOCKED" ? "Xem trạng thái" : task.actionType === "REVIEW" ? "Tiếp tục đánh giá" : automaticTaskActions[task.actionType], deadline: task.dueAt, obligation: task };
}
export function groupPersonalEvaluations(evaluations: ScreeningPersonalEvaluation[]) {
  const papers = new Map<string, ScreeningPersonalEvaluation[]>();
  for (const item of [...evaluations].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))) {
    const rounds = papers.get(item.paperId) ?? [];
    if (!rounds.some(r => r.roundId === item.roundId)) rounds.push(item);
    papers.set(item.paperId, rounds);
  }
  return [...papers.values()];
}
export type ScreeningCardPaper = Pick<ScreeningWorkPaper, "paperId" | "roundId" | "title"> & Partial<ScreeningWorkPaper> & { classification?: ScreeningClassification | null; caseStatus?: string | null };
export function workPaperFor(summary: ScreeningWorkspaceSummary, item: ScreeningCardPaper): ScreeningCardPaper {
  const paper: ScreeningCardPaper = summary.workPapers?.find(p => p.roundId === item.roundId) ?? item;
  const classification = summary.pendingDiscussions?.find(p => p.roundId === item.roundId)?.classification ?? paper.classification;
  const caseStatus = summary.myTrackedDisputes?.find(p => p.roundId === item.roundId)?.caseStatus
    ?? summary.pendingAdjudications.find(p => p.roundId === item.roundId)?.caseStatus ?? paper.caseStatus;
  // Use only choices already disclosed by the protocol, never hidden peer reviews.
  const publicUnsure = paper.hiddenReviews === false && paper.reviews && paper.reviews.length >= 2 && paper.reviews.some(r => r.decision === "UNSURE");
  return { ...paper, classification: classification ?? (publicUnsure ? "NEEDS_CLARIFICATION" : null), caseStatus };
}
export function workPaperTone(paper: ScreeningCardPaper, evaluation?: ScreeningPersonalEvaluation) {
  const status = paper.status === "INCLUDED" || paper.status === "EXCLUDED" ? paper.status : evaluation?.groupStatus ?? paper.status;
  return screeningStatusTone({ status, classification: paper.classification,
    caseStatus: paper.caseStatus ?? evaluation?.caseStatus, invalidated: paper.invalidated || evaluation?.invalidated });
}
export const sectionForTask = (task: MyWorkTask) => ["REVIEW", "FULLTEXT", "INFORMATION"].includes(task.kind) ? "review" : task.kind === "STATEMENT" ? "statement" : task.kind === "ADJUDICATION" ? "decision" : task.kind === "COORDINATION" ? "coordination" : "discussion";
export function workCaseLabel(status?: string | null) {
  return ({ COLLECTING: "Đang thu thập ý kiến", WAITING_ASSIGNMENT: "Chờ phân công", REQUESTED: "Chờ phân công", INVITED: "Chờ phân công", ASSIGNED: "Đã phân công", ACCEPTED: "Đã phân công", IN_PROGRESS: "Đang phân xử", NEEDS_MORE_INFO: "Cần bổ sung thông tin", COI_REVIEW: "Đang xem xét xung đột lợi ích", COMPLETED: "Đã phân xử" } as Record<string, string>)[status ?? ""];
}
export function workPaperStatus(paper: ScreeningCardPaper, evaluation?: ScreeningPersonalEvaluation, caseStatus?: string | null) {
  if (paper.invalidated || evaluation?.invalidated) return "Vòng đã mất hiệu lực";
  const group = evaluation?.groupStatus;
  if (group === "CONSENSUS_REQUIRED" || paper.status === "CONSENSUS_REQUIRED") return "Cần thảo luận";
  if (group === "CONSENSUS_IN_PROGRESS" || paper.status === "CONSENSUS_IN_PROGRESS") return "Đang thảo luận";
  const number = paper.roundNumber ?? evaluation?.roundNumber;
  if (group === "INCLUDED" || paper.status === "INCLUDED") return (paper.acceptedForAnalysis ?? evaluation?.acceptedForAnalysis) ? "Đã chọn cho phân tích" : `Qua vòng${number ? ` ${number}` : ""}`;
  if (group === "WAITING_FULLTEXT" || paper.status === "WAITING_FULLTEXT") return "Chờ nguồn toàn văn";
  if (group === "ADVANCE_TO_FULLTEXT") return "Qua vòng tiêu đề / tóm tắt";
  if (group === "EXCLUDED" || paper.status === "EXCLUDED") return "Đã loại";
  const caseLabel = workCaseLabel(caseStatus ?? paper.caseStatus ?? evaluation?.caseStatus);
  if (caseLabel) return caseLabel;
  if (["CONFLICT", "NEEDS_MORE_INFO"].includes(group ?? "") || ["NEEDS_RESOLUTION", "NEEDS_MORE_INFO"].includes(paper.status ?? "")) {
    if (paper.classification && !paper.classification.startsWith("AGREEMENT")) return screeningClassificationLabels[paper.classification];
  }
  if (group === "CONFLICT" || paper.status === "NEEDS_RESOLUTION") return "Cần giải quyết bất đồng";
  if (group === "NEEDS_MORE_INFO" || paper.status === "NEEDS_MORE_INFO") return "Cần làm rõ";
  if (group === "WAITING_REVIEWER") return "Chờ đánh giá thứ hai";
  if (group === "ADJUDICATING" || paper.status === "ADJUDICATING") return "Đang phân xử";
  if (group === "AWAITING_FINALIZATION" || paper.status === "AWAITING_FINALIZATION") return "Chờ chốt kết quả";
  if (group === "BACKGROUND" || paper.status === "BACKGROUND") return "Tài liệu nền";
  return "Đang đánh giá";
}
