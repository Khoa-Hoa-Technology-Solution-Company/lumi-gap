import { caseStatusLabels } from "./screening-case-labels";
import { screeningStatusTone, screeningClassificationLabels } from "../screening-status";
import { ScreeningStatusBadge } from "./screening-status-badge";
import { useRef } from "react";
import type { ScreeningChoice, ScreeningState, ScreeningPaperRow, ScreeningRoundView } from "@trend/shared-types";
import { isAxiosError } from "axios";
import { Button } from "@/components/ui/button";
import { useResearchCommand } from "../hooks/use-project-research";
export const stateLabels: Record<ScreeningState, string> = { WAITING_FULLTEXT: "Chờ toàn văn", NOT_REVIEWED: "Chờ đánh giá", IN_REVIEW: "Đang đánh giá", NEEDS_RESOLUTION: "Có bất đồng", NEEDS_MORE_INFO: "Cần xem xét thêm", ADJUDICATING: "Đang phân xử", AWAITING_FINALIZATION: "Chờ quyết định", INCLUDED: "Đã chọn", EXCLUDED: "Đã loại", BACKGROUND: "Tài liệu nền", CLOSED_UNRESOLVED: "Đã đóng — Không đạt đồng thuận" };
export const choiceLabels: Record<ScreeningChoice, string> = { INCLUDE: "Phù hợp", EXCLUDE: "Không phù hợp", UNSURE: "Chưa chắc chắn" };
/** Auth can expose a migrated public ID; round membership uses the database UUID. */
export function screeningActorId(round: ScreeningRoundView, publicActorId?: string) {
  return round.myReview?.reviewerId ?? round.assignments.find(a => a.id === round.myAssignmentId)?.reviewerId ?? publicActorId;
}
export function screeningMetadataWarning(paper: Pick<ScreeningPaperRow, "title" | "journalName" | "paperKind">) {
  const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
  if (paper.journalName && normalize(paper.title) === normalize(paper.journalName)) return "Tiêu đề trùng tên tạp chí. Cần kiểm tra nguồn và DOI để xác nhận đây là một bài báo cụ thể.";
  if (paper.paperKind === "journal" || paper.paperKind === "paratext") return "Nguồn có thể là tạp chí hoặc tài liệu phụ trợ. Cần xác minh loại tài liệu trước khi đánh giá.";
  return null;
}
export const classificationLabels = screeningClassificationLabels;
export function screeningStatusLabel(status: ScreeningState, round?: ScreeningRoundView | null) {
  if (round?.extractionReady && status === "INCLUDED") return "Được chấp nhận";
  if (round?.adjudicationCase && ["ADJUDICATING", "NEEDS_MORE_INFO"].includes(status)) return caseStatusLabels[round.adjudicationCase.status] ?? "Hồ sơ phân xử";
  if (["NEEDS_RESOLUTION", "NEEDS_MORE_INFO"].includes(status) && round?.classification) return round.resolution ? "Đã thống nhất cần đọc thêm" : classificationLabels[round.classification];
  if ((round?.settings.workflowVersion ?? 0) >= 3 && round?.settings.reviewMode !== "COLLABORATIVE") {
    if (status === "INCLUDED" && round?.phase === "TITLE_ABSTRACT") return "Qua sàng lọc";
    if (status === "EXCLUDED" && round?.phase === "TITLE_ABSTRACT") return "Loại sơ bộ";
  }
  return stateLabels[status];
}
export function ScreeningStatus({ status, round, className = "" }: { status: ScreeningState; round?: ScreeningRoundView | null; className?: string }) {
  const tone = screeningStatusTone({ status, classification: round?.classification, caseStatus: round?.adjudicationCase?.status, legacyNeedsAudit: round?.legacyNeedsAudit });
  return <ScreeningStatusBadge className={`screening-state ${className}`} state={status} tone={tone}>{screeningStatusLabel(status, round)}</ScreeningStatusBadge>;
}
export function screeningProgressLabel(round: ScreeningRoundView) {
  if (round.legacyNeedsAudit) return `Dữ liệu cần rà soát: ${round.assigned} phân công, ${round.completed} phiếu đã gửi`;
  if (round.settings.reviewMode === "COLLABORATIVE") return `Quy trình cộng tác cũ · ${round.completed} ý kiến đã gửi`;
  return round.completed === round.settings.requiredReviewers ? `${round.completed}/${round.settings.requiredReviewers} đánh giá đã gửi${round.resolutionType === "ADJUDICATION" ? " · Đã phân xử" : ""}` : `${round.completed}/${round.settings.requiredReviewers} phiếu đã gửi · ${round.assigned} chỗ có người`;
}
export function ScreeningError({ error, retry }: { error: unknown; retry?: () => void }) {
  if (!error) return null;
  const status = isAxiosError(error) ? error.response?.status : null;
  const message = isAxiosError(error) ? error.response?.data?.error?.message : null;
  const explanation = typeof message === "string" && /[À-ỹĐđ]/.test(message) ? message : null;
  return <div role="alert" className="screening-error"><p>{explanation ? `${explanation}. Nội dung bạn nhập vẫn được giữ.` : status === 409 ? "Dữ liệu đã thay đổi. Tải lại để kiểm tra; nội dung bạn nhập vẫn được giữ." : status === 403 || status === 404 ? "Bạn chưa có quyền thực hiện hoặc mục này không còn khả dụng." : "Chưa thể thực hiện yêu cầu. Nội dung bạn nhập vẫn được giữ, vui lòng thử lại."}</p>{retry && <Button type="button" variant="outline" size="sm" onClick={retry}>Tải lại</Button>}</div>;
}
/** Reuse a key on network retry; a changed payload gets a new key. */
export function useScreeningCommand(projectId: string) {
  const command = useResearchCommand(projectId), busy = useRef(false), attempt = useRef<{ content: string; key: string }>();
  const run = async (payload: unknown, execute: (key: string) => Promise<unknown>) => {
    if (busy.current) return false;
    const content = JSON.stringify(payload);
    if (attempt.current?.content !== content) attempt.current = { content, key: crypto.randomUUID() };
    busy.current = true;
    try {
      await command.mutateAsync(() => execute(attempt.current!.key));
      attempt.current = undefined; return true;
    }
    catch { return false; } finally { busy.current = false; }
  };
  return { ...command, run };
}
export function ScreeningPager({ page, total, hasNext, onPage }: { page: number; total: number; hasNext: boolean; onPage: (page: number) => void }) {
  return <nav aria-label="Phân trang" className="screening-actions"><Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page-1)}>Trang trước</Button><span>Trang {page} · {total} mục</span><Button type="button" variant="outline" size="sm" disabled={!hasNext} onClick={() => onPage(page+1)}>Trang sau</Button></nav>;
}

export function isConflictedRound(round: ScreeningRoundView): boolean {
  return Boolean(
    round.adjudicationCase ||
    round.status === "ADJUDICATING" ||
    round.status === "NEEDS_RESOLUTION" ||
    round.status === "NEEDS_MORE_INFO" ||
    (round.completed >= 2 && (
      (round.classification && !round.classification.startsWith("AGREEMENT")) ||
      (round.reviews.length >= 2 &&
        (round.reviews.some(r => r.decision === "INCLUDE") && round.reviews.some(r => r.decision === "EXCLUDE") ||
         round.reviews.some(r => r.decision === "UNSURE")))
    ))
  );
}
