import { useState } from "react";
import type { ScreeningRoundView, WorkspacePerson, ScreeningChoice } from "@trend/shared-types";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { screeningApi } from "../api/screening.api";
import { useResearchResource } from "../hooks/use-project-research";
import { WorkspaceLoading } from "./workspace-common";
import { ScreeningError, ScreeningPager, choiceLabels, isConflictedRound } from "./screening-common";
import { ScreeningDiscussion, useScreeningDiscussion } from "./screening-discussion";
function legacyLabel(status: string) { return status === "INCLUDED" ? "Phù hợp" : status === "EXCLUDED" ? "Không phù hợp" : status === "BACKGROUND" ? "Tài liệu tham khảo nền" : status === "MAYBE" ? "Đang xem xét" : "Chưa xem xét"; }
const auditLabels: Record<string, string> = { ADJUDICATION_CASE_LOCKED: "Khóa hồ sơ phân xử", ADJUDICATION_DIRECT_ASSIGNED: "Phân công trực tiếp người phân xử", ADJUDICATION_START: "Bắt đầu xem xét hồ sơ", ADJUDICATION_REASSIGNED: "Phân công lại người phân xử", ADJUDICATION_REASSIGN: "Yêu cầu phân công lại", ADJUDICATION_REMINDER: "Nhắc xử lý hồ sơ", ADJUDICATION_INVITED: "Gửi lời mời phân xử", ADJUDICATION_ACCEPT: "Nhận nhiệm vụ phân xử", ADJUDICATION_DECLINE: "Từ chối nhiệm vụ phân xử", ADJUDICATION_STATEMENT: "Lưu phiên bản ý kiến riêng", ADJUDICATION_SELECT: "Điều phối chọn ứng viên", ADJUDICATION_RETRY: "Kiểm tra lại ứng viên", ADJUDICATION_REPORT_CONFLICT: "Báo cáo xung đột lợi ích", ADJUDICATION_REVIEW_CONFLICT: "Xem xét xung đột lợi ích", ADJUDICATION_ACCESS_REVOKED: "Thu hồi lời mời không còn đủ điều kiện", ADJUDICATION_PACKET_REVISED: "Cập nhật hồ sơ sau sửa phiếu", ADJUDICATION_CASE_CLOSED: "Đóng hồ sơ phân xử", PROVISIONAL_FULL_TEXT: "Đọc toàn văn để làm rõ bất đồng", AUTO_ASSIGNED: "Tự phân công reviewer", ROUND_INITIALIZED: "Bắt đầu đánh giá", AGREEMENT_DECLINED: "Tiếp tục thảo luận, chưa đồng ý đề xuất", ADJUDICATION_REQUESTED: "Yêu cầu phân xử độc lập", AGREEMENT_PROPOSED: "Đề xuất quyết định chung", AGREEMENT_CONFIRMED: "Xác nhận quyết định chung", GROUP_AGREEMENT: "Ghi quyết định chung sau thảo luận", ASSESSMENT_REVISED: "Lưu phiên bản ý kiến", SELECTION_DEFERRED: "Cần xem xét thêm / mở lại", ANALYSIS_SET_CREATED: "Tạo bộ bài phân tích", ROUND_STARTED: "Bắt đầu vòng", ASSIGNED: "Phân công người đánh giá", REVIEW_SUBMITTED: "Gửi phiếu", REVIEW_REOPENED: "Mở lại phiếu", EARLY_UNBLIND: "Công bố sớm", CONFLICT_RESOLVED: "Giải quyết bất đồng", PROPOSAL_REASON_UPDATED: "Cập nhật lý do đề xuất", FINALIZED: "Ghi quyết định cuối", FINALIZER_ASSIGNED: "Giao người chốt", REVIEWS_COMPLETED: "Đủ lượt đánh giá", DISCUSSION: "Thảo luận", ASSIGNMENT_REVOKED: "Thu hồi phân công chưa hoàn thành", CONSENSUS: "Ghi kết quả đồng thuận", STAGE_ADVANCED: "Chuyển sang đánh giá toàn văn" };

export function RoundHistory({ projectId, round, people, readOnly }: { projectId: string; round: ScreeningRoundView; people: WorkspacePerson[]; readOnly: boolean }) {
  const allowDiscussion = isConflictedRound(round) || round.settings.reviewMode === "COLLABORATIVE";
  if (!allowDiscussion) return null;
  const actorId = useAuthStore(state => state.user?.id);
  return <RoundHistoryContent key={`${projectId}:${round.id}:${actorId}`} projectId={projectId} round={round} people={people} readOnly={readOnly} />;
}
function RoundHistoryContent({ projectId, round, people, readOnly }: { projectId: string; round: ScreeningRoundView; people: WorkspacePerson[]; readOnly: boolean }) {
  const allowDiscussion = isConflictedRound(round) || round.settings.reviewMode === "COLLABORATIVE";
  if (!allowDiscussion) return null;

  const [page, setPage] = useState(1);
  const [kind, setKind] = useState<"DISCUSSION" | "HISTORY">("DISCUSSION");
  const data = useResearchResource(projectId, ["screening-history", round.id, page, kind], () => screeningApi.history(projectId, round.id, page, "HISTORY"), kind === "HISTORY", () => round.active);
  const discussion = useScreeningDiscussion(projectId, round, allowDiscussion && kind === "DISCUSSION");
  return (
    <section className="paper-discussion mt-4 pt-3 border-t space-y-3">
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-1 bg-muted/50 p-0.5 rounded-lg border">
          {([["DISCUSSION", `Trao đổi (${discussion.data?.pages[0]?.total ?? 0})`], ["HISTORY", "Lịch sử đánh giá"]] as const).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={kind === value ? "secondary" : "ghost"}
              className={`h-7 px-3 text-xs font-medium rounded-md transition-colors ${
                kind === value ? "bg-background shadow-xs text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={kind === value}
              onClick={() => { setKind(value); setPage(1); }}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div hidden={kind !== "DISCUSSION"}><ScreeningDiscussion projectId={projectId} round={round} people={people} readOnly={readOnly} query={discussion} visible={kind === "DISCUSSION"} /></div>

      {kind === "HISTORY" && <>
      {data.isLoading ? (
        <WorkspaceLoading />
      ) : data.isError ? (
        <ScreeningError error={data.error} retry={() => void data.refetch()} />
      ) : (
        <>
          {!data.data?.items.length && (
            <p className="text-xs text-muted-foreground italic py-2 text-center">
              Chưa có lịch sử đánh giá.
            </p>
          )}
          <ol className="screening-history space-y-2">
            {data.data?.items.map(item => (
              <li key={item.id} className="p-2.5 rounded-lg border bg-muted/20 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <strong className="text-foreground font-semibold">{auditLabels[item.type] ?? "Cập nhật vòng"}</strong>
                  <small className="text-muted-foreground text-[11px]">
                    {item.actorName ?? people.find(p => p.id === item.actorId)?.name ?? round.assignments.find(a => a.reviewerId === item.actorId)?.name ?? (round.finalizer.id === item.actorId ? round.finalizer.name : `Thành viên (${item.actorId})`)} · {new Date(item.createdAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}
                  </small>
                </div>
                {item.details ? (
                  <>
                    <p className="text-muted-foreground">{String(item.details.reason ?? item.details.comment ?? "")}</p>
                    {["INCLUDED", "EXCLUDED", "BACKGROUND"].includes(String(item.details.decision ?? item.details.status)) && (
                      <p className="font-medium text-foreground">
                        Kết quả: {legacyLabel(String(item.details.decision ?? item.details.status))}{typeof item.details.version === "number" ? ` · phiên bản ${item.details.version}` : ""}
                      </p>
                    )}
                    {item.details.review && typeof item.details.review === "object" ? <HistoricalReview value={item.details.review as Record<string, unknown>} /> : null}
                  </>
                ) : (
                  <p className="text-muted-foreground italic">Nội dung đang được ẩn theo quy tắc đánh giá độc lập.</p>
                )}
              </li>
            ))}
          </ol>
          {data.data && (data.data.hasNext || page > 1) && (
            <ScreeningPager page={page} total={data.data.total} hasNext={data.data.hasNext} onPage={setPage} />
          )}
        </>
      )}
      </>}
    </section>
  );
}

function HistoricalReview({ value }: { value: Record<string, unknown> }) { return <div><small>{value.scope === "FULL_TEXT" ? "Toàn văn" : value.scope === "TITLE_ABSTRACT" ? "Tiêu đề / Tóm tắt" : "Chưa ghi nhận phạm vi đọc"}</small>{typeof value.fullTextReference === "string" && <p>{value.fullTextReference}</p>}{Array.isArray(value.researchQuestions) && value.researchQuestions.map((q: { id: string; text: string }) => <p key={q.id}>RQ: {q.text}</p>)}<p>Phiên bản {String(value.revision)} · {choiceLabels[value.decision as ScreeningChoice]}</p><p>{String(value.exclusionReason ?? "")}</p><p>{String(value.comment ?? "")}</p></div>; }
