import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import type { ScreeningChoice, ScreeningRoundView, ScreeningSettings } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { screeningApi } from "../api/screening.api";
import { choiceLabels, ScreeningError, useScreeningCommand } from "./screening-common";
import { canLeaveWorkspace, useUnsavedWorkspace } from "./workspace-common";
import { AssessmentContextFields, initialAssessmentContext } from "./assessment-context";

export function LibraryAssessment({
  projectId,
  paperId,
  round,
  settings,
  readOnly,
  defaultEditing,
}: {
  projectId: string;
  paperId: string;
  round: ScreeningRoundView | null;
  settings: ScreeningSettings;
  readOnly: boolean;
  defaultEditing?: boolean;
}) {
  const own = round?.myReview;
  const ownAssignment = round?.assignments?.find(assignment => assignment.id === round.myAssignmentId);
  const currentRevision = ownAssignment?.revision ?? own?.revision ?? 0;
  const [isEditing, setIsEditing] = useState(() => defaultEditing ?? !own);
  const [decision, setDecision] = useState<ScreeningChoice | "">(own?.decision ?? "");
  const [reason, setReason] = useState(own?.exclusionReason ?? ""), [comment, setComment] = useState(own?.comment ?? "");
  const [base, setBase] = useState({ roundId: round?.id ?? null, revision: currentRevision, settingsVersion: settings.version });
  const [dirty, setDirty] = useState(false), [saved, setSaved] = useState(false);
  const [context, setContext] = useState(() => initialAssessmentContext(own));
  const command = useScreeningCommand(projectId);
  useUnsavedWorkspace(dirty || command.isPending);
  const locked = readOnly || Boolean(round?.finalDecision) || (round ? !round.canReview : settings.reviewMode !== "COLLABORATIVE");
  const stale = base.roundId !== (round?.id ?? null) || base.revision < currentRevision || (!round && base.settingsVersion !== settings.version);
  const change = () => { setDirty(true); setSaved(false); };

  const cancelEdit = async () => {
    if (dirty) {
      if (!(await canLeaveWorkspace())) return;
    }
    setDecision(own?.decision ?? "");
    setReason(own?.exclusionReason ?? "");
    setComment(own?.comment ?? "");
    setContext(initialAssessmentContext(own));
    setDirty(false);
    setIsEditing(false);
  };

  // If already evaluated and not currently in edit mode: render compact summary card with "Chỉnh sửa" button
  if (own && !isEditing) {
    const displayDecision = (saved ? decision : own.decision) || own.decision;
    const displayReason = (saved ? reason : own.exclusionReason) || own.exclusionReason;
    const displayComment = (saved ? comment : own.comment) || own.comment;
    const displayScope = (saved ? context.scope : own.scope) || own.scope || "TITLE_ABSTRACT";
    const displayFullTextRef = (saved ? context.fullTextReference : own.fullTextReference) || own.fullTextReference || "";

    return (
      <div className="screening-form library-assessment assessment-summary-card">
        <div className="assessment-summary-header">
          <div className="assessment-summary-header-left">
            <h4 className="assessment-summary-title">Đánh giá của tôi</h4>
            <span className="assessment-summary-badge" data-choice={displayDecision}>
              {choiceLabels[displayDecision as ScreeningChoice] || displayDecision}
            </span>
          </div>
          {!locked && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="assessment-edit-btn"
              onClick={() => {
                setIsEditing(true);
                setSaved(false);
              }}
            >
              <Pencil size={12} className="mr-1" />
              Chỉnh sửa
            </Button>
          )}
        </div>

        <div className="assessment-summary-body">
          {displayDecision === "EXCLUDE" && displayReason && (
            <div className="assessment-summary-row">
              <span className="assessment-summary-label">Lý do không phù hợp:</span>
              <span className="assessment-summary-value text-destructive font-medium">
                {displayReason}
              </span>
            </div>
          )}

          {displayComment && (
            <div
              className={`assessment-summary-row assessment-summary-comment-row ${!readOnly && !locked ? "assessment-summary-row-interactive" : ""}`}
              onClick={() => {
                if (!readOnly && !locked) setIsEditing(true);
              }}
              title={!readOnly && !locked ? "Nhấp để chỉnh sửa nhận xét" : undefined}
            >
              <span className="assessment-summary-label">Ghi chú:</span>
              <p className="assessment-summary-comment">{displayComment}</p>
            </div>
          )}

          <div
            className={`assessment-summary-row ${!readOnly && !locked ? "assessment-summary-row-interactive" : ""}`}
            onClick={() => {
              if (!readOnly && !locked) setIsEditing(true);
            }}
            title={!readOnly && !locked ? "Nhấp để chỉnh sửa phạm vi đọc" : undefined}
          >
            <span className="assessment-summary-label">Phạm vi đã đọc:</span>
            <span className="assessment-summary-value">
              {displayScope === "FULL_TEXT" ? "Toàn văn" : "Tiêu đề / Tóm tắt"}
              {displayFullTextRef ? ` · ${displayFullTextRef}` : ""}
              {!readOnly && !locked && (
                <Pencil size={11} className="inline ml-1.5 opacity-60 text-muted-foreground" />
              )}
            </span>
          </div>

          {Boolean(own.researchQuestions?.length) && (
            <div className="assessment-summary-row">
              <span className="assessment-summary-label">Câu hỏi nghiên cứu:</span>
              <div className="assessment-summary-rqs">
                {own.researchQuestions!.map(q => (
                  <span key={q.id} className="assessment-summary-rq-chip">
                    {q.text}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="assessment-summary-footer">
          <div className="assessment-status-indicator" role="status">
            {saved ? (
              <span className="status-saved">
                <Check size={13} className="inline mr-1 text-emerald-600" />
                Đã lưu ý kiến của bạn.{base.revision ? ` Phiên bản ${base.revision}.` : ""}
              </span>
            ) : (
              <span className="status-clean">
                Đã lưu · Phiên bản {own.revision}
                {own.submittedAt ? ` · ${new Date(own.submittedAt).toLocaleDateString("vi-VN")}` : ""}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return <form className="screening-form library-assessment" onSubmit={async e => {
    e.preventDefault(); if (!decision || locked || stale) return;
    const payload = { roundId: base.roundId, expectedRevision: base.revision, settingsVersion: base.settingsVersion, decision, exclusionReason: reason, comment, ...context };
    let nextRoundId = base.roundId;
    let nextRevision = base.revision;
    if (await command.run({ paperId, ...payload }, async clientKey => {
      const result = await screeningApi.assess(projectId, paperId, { ...payload, clientKey }) as { roundId: string; revision: number };
      nextRoundId = result.roundId; nextRevision = result.revision; return result;
    })) {
      setBase({ ...base, roundId: nextRoundId, revision: nextRevision });
      setDirty(false);
      setSaved(true);
      if (own) {
        setIsEditing(false);
      }
    }
  }}>
    <div className="assessment-sticky-header">
      <div className="assessment-header-title-row">
        <h4>{own ? "Chỉnh sửa đánh giá của tôi" : "Đánh giá của tôi"}</h4>
      </div>
      <div className="assessment-choices">
        {Object.entries(choiceLabels).map(([value, label]) => (
          <label className="assessment-choice" data-selected={decision === value} data-choice={value} key={value}>
            <input
              type="radio"
              name={`assessment-${paperId}`}
              checked={decision === value}
              disabled={command.isPending || locked}
              onChange={() => { setDecision(value as ScreeningChoice); change(); }}
              required
            />
            {label}
          </label>
        ))}
      </div>
    </div>
    <fieldset disabled={command.isPending || locked} className="assessment-fieldset">
      {decision === "EXCLUDE" && (
        <div className="assessment-exclusion-section">
          <label className="assessment-field-label">
            Lý do không phù hợp (tùy chọn)
          </label>
          {Boolean(settings.exclusionCriteria?.length) && (
            <div className="assessment-quick-reasons" role="group" aria-label="Gợi ý tiêu chí loại trừ">
              {settings.exclusionCriteria.map((c, idx) => {
                const selected = reason === c;
                return (
                  <button
                    type="button"
                    key={idx}
                    className={`assessment-quick-reason-chip ${selected ? "active" : ""}`}
                    onClick={() => {
                      setReason(selected ? "" : c);
                      change();
                    }}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          )}
          <input
            type="text"
            className="assessment-reason-input"
            value={reason}
            onChange={e => { setReason(e.target.value); change(); }}
            maxLength={500}
            placeholder="Hoặc nhập ngắn gọn lý do bài không phù hợp…"
          />
        </div>
      )}
      <div className="assessment-comment-wrapper">
        <label>
          <span className="assessment-comment-header-row">
            <span>Ghi chú ngắn (tùy chọn)</span>
            <span className="assessment-comment-len">{comment.length}/2000</span>
          </span>
          <textarea
            className="assessment-comment-box"
            value={comment}
            onChange={e => { setComment(e.target.value); change(); }}
            maxLength={2000}
            rows={3}
            placeholder={
              decision === "INCLUDE"
                ? "Ghi chú ngắn (tùy chọn): phương pháp, phát hiện chính, giá trị tham khảo…"
                : decision === "UNSURE"
                  ? "Cần làm rõ thêm thông tin gì (ví dụ: cần đọc toàn văn phần phương pháp...)?"
                  : "Ghi chú thêm nếu cần (tùy chọn)…"
            }
          />
        </label>
      </div>
      <AssessmentContextFields value={context} settings={settings} disabled={locked || command.isPending} onChange={value => { setContext(value); change(); }} />
    </fieldset>
    {locked && <p role="status">{round?.finalDecision ? "Đã chốt chọn bài. Người phụ trách có thể mở lại để xem xét thêm." : "Hiện chỉ có quyền xem; bản nháp vẫn được giữ."}</p>}
    <ScreeningError error={command.error} />
    {stale && <><p role="status">Ý kiến hoặc vòng đánh giá đã thay đổi. Hãy xem lại trước khi gửi.</p><Button type="button" variant="outline" onClick={async () => { if (await canLeaveWorkspace()) { setDecision(own?.decision ?? ""); setReason(own?.exclusionReason ?? ""); setComment(own?.comment ?? ""); setContext(initialAssessmentContext(own)); setBase({ roundId: round?.id ?? null, revision: currentRevision, settingsVersion: settings.version }); setDirty(false); } }}>Tải ý kiến hiện tại</Button></>}
    <div className="assessment-save">
      <Button disabled={locked || stale || command.isPending || !decision || !dirty || (context.scope === "FULL_TEXT" && context.fullTextReference.trim().length < 10)}>
        {command.isPending ? "Đang lưu…" : own ? "Cập nhật ý kiến" : "Lưu ý kiến"}
      </Button>
      {own && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="assessment-cancel-btn"
          onClick={() => void cancelEdit()}
        >
          Hủy bỏ
        </Button>
      )}
      <div className="assessment-status-indicator" role="status">
        {saved ? (
          <span className="status-saved">
            <Check size={13} className="inline mr-1 text-emerald-600" />
            Đã lưu ý kiến của bạn.{base.revision ? ` Phiên bản ${base.revision}.` : ""}
          </span>
        ) : dirty ? (
          <span className="status-dirty">
            <span className="status-dirty-dot" />
            Đang chỉnh sửa (chưa lưu)
          </span>
        ) : own ? (
          <span className="status-clean">
            Chưa thay đổi
          </span>
        ) : (
          <span className="status-empty">Chưa có đánh giá</span>
        )}
      </div>
    </div>
  </form>;
}
