import type { ScreeningPhase, ScreeningReview, ScreeningSettings } from "@trend/shared-types";

export interface AssessmentContextValue {
  scope: ScreeningPhase;
  fullTextReference: string;
  researchQuestionIds: string[];
}

export function initialAssessmentContext(review?: ScreeningReview | null, phase: ScreeningPhase = "TITLE_ABSTRACT"): AssessmentContextValue {
  return { scope: review?.scope ?? phase, fullTextReference: review?.fullTextReference ?? "", researchQuestionIds: review?.researchQuestions?.map(q => q.id) ?? [] };
}

export function AssessmentContextFields({
  value,
  settings,
  onChange,
  fixedScope = false,
  disabled = false,
}: {
  value: AssessmentContextValue;
  settings: ScreeningSettings;
  onChange: (value: AssessmentContextValue) => void;
  fixedScope?: boolean;
  disabled?: boolean;
}) {
  const questions = settings.questionOptions ?? [];
  const isFullText = value.scope === "FULL_TEXT";
  const isLocked = disabled;

  return (
    <div className="assessment-context">
      {fixedScope ? (
        <input type="hidden" name="scope" value={value.scope} />
      ) : (
        <div className="assessment-scope-control">
          <label htmlFor="assessment-scope-select" className="assessment-scope-label">
            <span>Phạm vi đã đọc</span>
          </label>

          <div className="assessment-scope-select-wrapper">
            <select
              id="assessment-scope-select"
              aria-label="Chọn phạm vi đã đọc"
              disabled={isLocked}
              value={value.scope}
              onChange={e => onChange({ ...value, scope: e.target.value as ScreeningPhase })}
              className="assessment-scope-select"
            >
              <option value="TITLE_ABSTRACT">Tiêu đề / Tóm tắt</option>
              <option value="FULL_TEXT">Toàn văn</option>
            </select>
          </div>
        </div>
      )}

      {isFullText && (
        <label className="assessment-fulltext-label">
          <span>Nguồn toàn văn đã đọc <span className="text-destructive">*</span></span>
          <input
            value={value.fullTextReference}
            disabled={isLocked}
            onChange={e => onChange({ ...value, fullTextReference: e.target.value })}
            required
            minLength={10}
            maxLength={1000}
            className="assessment-fulltext-input"
            placeholder="Đường dẫn, tệp trong dự án hoặc cách nhóm đã kiểm tra toàn văn"
          />
          <small className="text-xs text-muted-foreground">Chỉ chọn toàn văn khi bạn thực sự đã đọc nguồn hợp lệ (tối thiểu 10 ký tự).</small>
        </label>
      )}

      {questions.length > 0 && (
        <details open={value.researchQuestionIds.length > 0 || undefined}>
          <summary>Câu hỏi nghiên cứu liên quan{value.researchQuestionIds.length ? ` (${value.researchQuestionIds.length})` : " (tùy chọn)"}</summary>
          <div className="assessment-questions">
            {questions.map((question, index) => (
              <label className="screening-check" key={question.id}>
                <input
                  type="checkbox"
                  disabled={isLocked}
                  checked={value.researchQuestionIds.includes(question.id)}
                  onChange={e => onChange({
                    ...value,
                    researchQuestionIds: e.target.checked
                      ? [...value.researchQuestionIds, question.id]
                      : value.researchQuestionIds.filter(id => id !== question.id),
                  })}
                />
                <span><strong>RQ{index + 1}</strong> {question.text}</span>
              </label>
            ))}
          </div>
        </details>
      )}

      {value.researchQuestionIds.some(id => !questions.some(q => q.id === id)) && (
        <p role="status">Một câu hỏi đã được thay đổi hoặc xóa. <button type="button" className="underline" onClick={() => onChange({ ...value, researchQuestionIds: value.researchQuestionIds.filter(id => questions.some(q => q.id === id)) })}>Bỏ liên kết không còn hiện hành</button>. Phiên bản trước vẫn giữ nguyên câu hỏi đã lưu.</p>
      )}
    </div>
  );
}

export function ReviewContextSummary({ review }: { review: ScreeningReview }) {
  if (!review.scope && !review.researchQuestions?.length) return null;
  const hasFullText = review.scope === "FULL_TEXT";
  const hasCustomRef = Boolean(review.fullTextReference);
  const hasRqs = Boolean(review.researchQuestions?.length);
  if (!hasFullText && !hasCustomRef && !hasRqs) return null;

  return (
    <div className="assessment-review-context text-muted-foreground text-[11px] space-y-0.5">
      {hasFullText ? (
        <small className="text-muted-foreground">
          Đã đọc toàn văn{review.fullTextReference ? ` · ${review.fullTextReference}` : ""}
        </small>
      ) : hasCustomRef ? (
        <small className="text-muted-foreground">
          {review.fullTextReference}
        </small>
      ) : null}
      {review.researchQuestions?.map(q => <p key={q.id} className="text-muted-foreground">RQ: {q.text}</p>)}
    </div>
  );
}
