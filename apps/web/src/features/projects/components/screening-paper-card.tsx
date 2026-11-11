import { useId, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Clock, Scale, HelpCircle, X } from "lucide-react";
import { toast } from "sonner";
import type { ScreeningPersonalEvaluation, ScreeningWorkspaceSummary } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import { screeningApi } from "../api/screening.api";
import { personalEvaluations, workPaperFor, workPaperStatus, workPaperTone, workCaseLabel, type ScreeningCardPaper, type MyWorkTask } from "../my-work-model";
import { useScreeningCommand, ScreeningError } from "./screening-common";
import { screeningChoiceTone, screeningStatusTone, type ScreeningTone } from "../screening-status";
import { ScreeningStatusBadge } from "./screening-status-badge";
import { ScreeningDiscussionUnread } from "./screening-discussion-unread";
import "../screening-paper-card.css";

const choices = { INCLUDE: "Phù hợp", EXCLUDE: "Không phù hợp", UNSURE: "Cần xem xét thêm" };
const date = (value: string) => new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
function PublicBallots({ paper }: { paper: ScreeningCardPaper }) {
  const currentUserId = useAuthStore(s => s.user?.id);
  if (paper.hiddenReviews !== false || !paper.reviews || paper.reviews.length < 2) return null;
  return <details className="screening-paper-card-ballots-details">
    <summary>Xem {paper.reviews.length} phiếu đánh giá</summary>
    <dl className="screening-paper-card-ballots" aria-label="Hai phiếu đã công bố">
      {paper.reviews.map(review => {
        const isYou = Boolean(currentUserId && review.reviewerId === currentUserId);
        return <div key={review.reviewerId} className="screening-ballot-row">
          <dt>{review.name}{isYou && <span className="text-muted-foreground"> (Bạn)</span>}</dt>
          <dd className="screening-tone screening-status-text" data-tone={screeningChoiceTone(review.decision)}>
            {review.decision === "INCLUDE" ? <Check size={14} aria-hidden="true" /> : review.decision === "EXCLUDE" ? <X size={14} aria-hidden="true" /> : <HelpCircle size={14} aria-hidden="true" />}
            {choices[review.decision]}
          </dd>
        </div>;
      })}
    </dl>
  </details>;
}
function CardAction({ href, onOpen, children, secondary = false }: { href?: string; onOpen: () => void; children: ReactNode; secondary?: boolean }) {
  return href ? <Button size="sm" variant={secondary ? "outline" : "default"} asChild><Link to={href}>{children}<ArrowRight size={14} aria-hidden="true" /></Link></Button>
    : <Button size="sm" variant={secondary ? "outline" : "default"} onClick={onOpen}>{children}<ArrowRight size={14} aria-hidden="true" /></Button>;
}

export function WorkPaperCard({ paper, status, onOpen, href, children, actions, actionRequired, deadline, now = Date.now(), ariaLabel, tone: providedTone }: {
  paper: ScreeningCardPaper; status: string; onOpen: () => void; href?: string;
  children?: ReactNode; actions: ReactNode; actionRequired?: boolean;
  deadline?: { at: string; kind: "CLAIM" | "STATEMENT" }; now?: number; ariaLabel?: string; tone?: ScreeningTone;
}) {
  const titleId = useId();
  const remaining = deadline ? Math.max(0, Math.ceil((new Date(deadline.at).getTime() - now) / 1000)) : null;
  const urgent = remaining !== null && remaining <= 7200;
  const counter = remaining === null ? "" : [Math.floor(remaining / 3600), Math.floor(remaining % 3600 / 60), remaining % 60].map(n => String(n).padStart(2, "0")).join(":");
  const metadata = [paper.publicationYear, paper.journalName?.trim()].filter(Boolean).join(" · ");
  const authors = paper.authors?.map(a => a.trim()).filter(Boolean);
  const complete = paper.completed;
  const required = paper.required;
  const hasProgress = typeof complete === "number" && typeof required === "number" && required > 0;

  const tone = providedTone ?? workPaperTone(paper);
  return <article className="screening-paper-card screening-tone" data-tone={tone} data-action-required={actionRequired || undefined} aria-label={ariaLabel} aria-labelledby={ariaLabel ? undefined : titleId}>
    <header className="screening-paper-card-top">
      {(paper.roundNumber || paper.phase) && <p className="screening-paper-card-round">{[paper.roundNumber ? `Vòng ${paper.roundNumber}` : null, paper.phase === "FULL_TEXT" ? "Toàn văn" : paper.phase === "TITLE_ABSTRACT" ? "Tiêu đề & Tóm tắt" : null].filter(Boolean).join(" · ")}</p>}
      <ScreeningStatusBadge className="screening-paper-card-status" tone={tone}><span aria-hidden="true" className="screening-paper-card-dot" /><span className="sr-only">Trạng thái: </span>{status}</ScreeningStatusBadge>
    </header>
    <div className="screening-paper-card-identity">
      <h4 id={titleId}>{href ? <Link to={href}>{paper.title}</Link> : <button type="button" onClick={onOpen}>{paper.title}</button>}</h4>
      {(authors?.length || metadata) ? (
        <div className="screening-paper-card-meta">
          {authors && authors.length > 0 && (authors.length > 2 ? <details className="screening-paper-card-authors">
            <summary>{authors.slice(0, 2).join(", ")} <span>+{authors.length - 2} tác giả</span></summary>
            <p>{authors.join(", ")}</p>
          </details> : <p className="screening-paper-card-authors">{authors.join(", ")}</p>)}
          {metadata && <span className="screening-paper-card-metadata">{metadata}</span>}
        </div>
      ) : null}
    </div>
    <div className="screening-paper-card-content">{paper.hiddenReviews !== true && <ScreeningDiscussionUnread roundId={paper.roundId} />}{children}</div>
    <footer className="screening-paper-card-footer">
      <div className="screening-paper-card-tracking">
      {hasProgress && <div className="screening-paper-card-progress">
        <div className="screening-paper-card-progress-label"><span className="sr-only">Tiến độ vòng đánh giá</span><strong>{complete}/{required} phiếu đã gửi</strong></div>
        <div role="progressbar" aria-label="Tiến độ vòng đánh giá" aria-valuemin={0} aria-valuemax={required} aria-valuenow={Math.min(complete, required)} aria-valuetext={`${complete}/${required} phiếu đã gửi`} className="screening-paper-card-segments">
          {Array.from({ length: required }, (_, index) => <span key={index} data-filled={index < complete} />)}
        </div>
      </div>}
      {deadline ? (
        <div className="screening-paper-card-deadline screening-tone" data-tone={urgent ? "warning" : "neutral"} data-urgent={urgent}>
          <span>{deadline.kind === "CLAIM" ? "Hạn phiếu đang giữ" : "Hạn gửi quan điểm"}</span>
          {deadline.kind === "CLAIM" ? <strong aria-label={`Còn ${counter}`}><Clock size={14} aria-hidden="true" />{remaining === 0 ? "Đã hết hạn" : counter}</strong> : <strong><Clock size={14} aria-hidden="true" />{date(deadline.at)}</strong>}
        </div>
      ) : null}
      </div>
      <div className="screening-paper-card-actions">{actions}</div>
    </footer>
  </article>;
}

export function EvaluationMetadata({ item }: { item: Pick<ScreeningPersonalEvaluation, "phase" | "publicationYear" | "journalName"> & { submittedAt?: string; roundNumber?: number } }) {
  return <p className="text-xs text-muted-foreground">{[item.roundNumber ? `Vòng ${item.roundNumber}` : null, item.phase === "FULL_TEXT" ? "Toàn văn" : "Tiêu đề & Tóm tắt", item.submittedAt ? `Đã gửi ${date(item.submittedAt)}` : null].filter(Boolean).join(" · ")}</p>;
}

export function EvaluationSummary({ item, paper }: { item: ScreeningPersonalEvaluation; paper?: ScreeningCardPaper }) {
  const context = paper ?? item;
  const result = workPaperStatus(context, item);
  const reason = paper?.groupReason ?? item.groupReason;
  const resolution = paper?.resolutionType ?? (item.isAdjudicated ? "ADJUDICATION" : null);
  return <div className="screening-paper-card-evaluation">
    <dl>
      <div><dt>Đánh giá của tôi</dt><dd className="screening-tone screening-status-text" data-tone={screeningChoiceTone(item.myDecision)}>{choices[item.myDecision]}</dd></div>
      <div><dt>Kết quả của nhóm</dt><dd className="screening-tone screening-status-text" data-tone={workPaperTone(context, item)}>{result}</dd></div>
    </dl>
    {(paper?.invalidated || item.invalidated) && <p className="text-xs text-muted-foreground">Vòng trước đã mở lại. Các phiếu và kết quả ở đây được giữ để tra cứu lịch sử.</p>}
    {resolution && <p className="screening-paper-card-resolution">{resolution === "ADJUDICATION" ? <Scale size={13} aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}{resolution === "ADJUDICATION" ? "Quyết định sau phân xử" : resolution === "CONSENSUS_AFTER_DISCUSSION" ? "Thống nhất sau thảo luận" : paper?.required === 2 ? "Thống nhất từ hai phiếu" : "Thống nhất từ phiếu đánh giá"}</p>}
    {item.resolverName && <p className="text-xs text-muted-foreground">Người phân xử: {item.resolverName}</p>}
    {reason && <p className="screening-paper-card-reason"><span>Lý do: </span>{reason}</p>}
  </div>;
}

export function EvaluationPaperCard({ summary, item, onOpen, href, actions, children }: {
  summary: ScreeningWorkspaceSummary; item: ScreeningPersonalEvaluation; onOpen: () => void; href?: string; actions?: ReactNode; children?: ReactNode;
}) {
  const paper = workPaperFor(summary, item);
  const tracked = summary.myTrackedDisputes?.find(t => t.roundId === item.roundId);
  return <WorkPaperCard paper={paper} status={workPaperStatus(paper, item)} tone={workPaperTone(paper, item)} onOpen={onOpen} href={href}
    deadline={tracked?.caseStatus === "COLLECTING" && tracked.deadline ? { kind: "STATEMENT", at: tracked.deadline } : undefined}
    actions={actions ?? <CardAction onOpen={onOpen} href={href} secondary>Xem lại bài</CardAction>}>
    <EvaluationSummary item={item} paper={paper} />
    {["CONFLICT", "NEEDS_MORE_INFO", "ADJUDICATING"].includes(item.groupStatus) && <PublicBallots paper={paper} />}
    {!item.resolverName && tracked?.adjudicatorName && <p className="text-xs text-muted-foreground">Người phân xử: {tracked.adjudicatorName}</p>}
    {item.submittedAt && <p className="text-xs text-muted-foreground">Đã gửi phiếu {date(item.submittedAt)}</p>}
    {children}
  </WorkPaperCard>;
}

export function ScreeningTaskCard({ projectId, summary, task, onOpen, href, now, readOnly }: {
  projectId: string; summary: ScreeningWorkspaceSummary; task: MyWorkTask; onOpen: () => void; href?: string; now: number; readOnly: boolean;
}) {
  const command = useScreeningCommand(projectId);
  const claim = summary.myActiveClaims.find(c => c.roundId === task.roundId);
  const evaluation = personalEvaluations(summary).find(e => e.roundId === task.roundId);
  const tracked = summary.myTrackedDisputes?.find(t => t.roundId === task.roundId);
  const paper = workPaperFor(summary, { ...task, ...tracked, ...evaluation, ...claim });
  const statement = task.kind === "STATEMENT";
  const adjudication = task.kind === "ADJUDICATION";
  const isClarification = paper.classification === "NEEDS_CLARIFICATION" || paper.classification === "NEEDS_MORE_INFORMATION" || paper.status === "NEEDS_MORE_INFO" && !paper.caseStatus;
  const status = statement ? "Cần gửi quan điểm phân xử"
    : ["FULLTEXT", "INFORMATION"].includes(task.kind) ? task.label
    : task.kind === "REVIEW" ? "Đang đánh giá"
    : task.kind === "DISCUSSION" ? paper.classification === "NEEDS_MORE_INFORMATION" ? "Cần đọc thêm" : isClarification ? "Cần làm rõ" : paper.classification === "EXCLUSION_REASON_MISMATCH" ? "Cần thống nhất lý do loại" : "Cần giải quyết bất đồng"
    : task.kind === "CONSENSUS" ? "Cần phản hồi thống nhất"
    : workCaseLabel(summary.pendingAdjudications.find(a => a.roundId === task.roundId)?.caseStatus) ?? (task.kind === "COORDINATION" ? "Chờ phân công" : "Đang phân xử");
  const action = statement ? "Bổ sung quan điểm"
    : adjudication ? "Đưa ra kết luận"
    : isClarification ? "Làm rõ đánh giá"
    : task.kind === "DISCUSSION" ? "Thảo luận và giải quyết"
    : task.action;
  const changeClaim = async (action: "extend" | "release") => {
    if (action === "release" && !window.confirm("Trả bài này về hàng đợi để thành viên khác đánh giá?")) return;
    const ok = await command.run({ action, roundId: task.roundId }, key => screeningApi[action](projectId, task.roundId, { clientKey: key }));
    if (ok) toast.success(action === "extend" ? "Đã gia hạn thêm 24 giờ." : "Đã trả bài lại hàng đợi.");
  };
  const expired = Boolean(task.deadline && new Date(task.deadline).getTime() <= now);
  const canAct = !readOnly && !summary.readOnly && !expired;
  const tone: ScreeningTone = expired ? "warning"
    : statement || adjudication || task.kind === "COORDINATION" ? screeningStatusTone({ status: "ADJUDICATING", caseStatus: paper.caseStatus })
    : task.kind === "REVIEW" ? "attention"
    : task.kind === "FULLTEXT" || task.kind === "INFORMATION" ? "warning"
    : task.kind === "CONSENSUS" ? "dispute"
    : workPaperTone(paper, evaluation);
  const hasPublicBallots = paper.hiddenReviews === false && Boolean(paper.reviews && paper.reviews.length >= 2);
  const instruction = statement ? "Gửi quan điểm riêng và căn cứ của bạn trước hạn chung."
    : adjudication ? "Đọc hồ sơ hai bên và ghi kết luận có căn cứ."
    : task.kind === "COORDINATION" ? paper.caseStatus === "COI_REVIEW" ? "Xem xét báo cáo xung đột lợi ích để tiếp tục phân xử." : "Phân công người phân xử đủ điều kiện cho hồ sơ này."
    : task.kind === "REVIEW" ? "Đọc bài báo và gửi phiếu đánh giá trước hạn."
    : task.kind === "CONSENSUS" ? "Xem đề xuất thống nhất và gửi phản hồi của bạn."
    : isClarification ? "Đối chiếu nguồn, bổ sung căn cứ hoặc cập nhật đánh giá của bạn."
    : task.kind === "DISCUSSION" && paper.classification === "EXCLUSION_REASON_MISMATCH" ? "Đối chiếu căn cứ loại và thống nhất tiêu chí với reviewer còn lại."
    : task.kind === "DISCUSSION" ? "Thảo luận căn cứ và cùng xác nhận kết luận cuối cùng."
    : task.description;

  return <WorkPaperCard paper={paper} status={expired ? "Đã hết hạn" : status} tone={tone} onOpen={onOpen} href={href} now={now}
    ariaLabel={statement ? "Ý kiến phân xử cần gửi" : undefined} actionRequired={canAct}
    deadline={task.deadline ? { at: task.deadline, kind: task.kind === "REVIEW" ? "CLAIM" : "STATEMENT" } : undefined}
    actions={canAct ? <>
      <CardAction onOpen={onOpen} href={href}>{action}</CardAction>
      {task.kind === "REVIEW" && claim?.canExtend && <Button size="sm" variant="ghost" disabled={command.isPending} onClick={() => void changeClaim("extend")}>Gia hạn +24h</Button>}
      {task.kind === "REVIEW" && claim?.canRelease && <Button size="sm" variant="ghost" disabled={command.isPending} onClick={() => void changeClaim("release")}>Trả lại hàng đợi</Button>}
    </> : <CardAction onOpen={onOpen} href={href} secondary>Xem lại bài</CardAction>}>
    {!expired && <p className="screening-paper-card-next-step"><strong>{canAct ? "Việc của bạn" : "Bước tiếp theo"}</strong><span>{instruction}</span></p>}
    {evaluation && !hasPublicBallots && <EvaluationSummary item={evaluation} paper={paper} />}
    {["DISCUSSION", "CONSENSUS", "STATEMENT", "ADJUDICATION"].includes(task.kind) && <PublicBallots paper={paper} />}
    <ScreeningError error={command.error} />
  </WorkPaperCard>;
}
