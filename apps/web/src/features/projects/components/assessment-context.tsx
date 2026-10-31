import type { ScreeningPhase, ScreeningReview, ScreeningSettings } from "@trend/shared-types";
import { ChevronDown, FileText, BookOpen, Lock } from "lucide-react";

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
  const isLocked = fixedScope || disabled;

  return (
    <div className="assessment-context">
      <div className="assessment-scope-control">
        <label htmlFor="assessment-scope-select" className="assessment-scope-label">
          <span>Phạm vi đã đọc</span>
          {fixedScope && (
            <span className="assessment-scope-fixed-tag">
              <Lock size={11} className="inline mr-1" />
              Cố định
            </span>
          )}
        </label>

        <div className="assessment-scope-select-wrapper">
          <div className="assessment-scope-select-icon">
            {isFullText ? (
              <BookOpen size={15} className="text-emerald-600 shrink-0" />
            ) : (
              <FileText size={15} className="text-primary shrink-0" />
            )}
          </div>
          <select
            id="assessment-scope-select"
            aria-label="Chọn phạm vi đã đọc"
            disabled={isLocked}
            value={value.scope}
            onChange={e => onChange({ ...value, scope: e.target.value as ScreeningPhase })}
            className={`assessment-scope-select ${fixedScope ? "is-fixed" : ""}`}
          >
            <option value="TITLE_ABSTRACT">Tiêu đề / Tóm tắt</option>
            <option value="FULL_TEXT">Toàn văn</option>
          </select>
          <ChevronDown size={14} className="assessment-scope-select-arrow" />
        </div>

        {fixedScope && (
          <p className="assessment-scope-fixed-note">
            Phạm vi đánh giá cố định theo giai đoạn của vòng này.
          </p>
        )}
      </div>

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
  return (
    <div className="assessment-review-context">
      <small>
        {review.scope === "FULL_TEXT" ? "Đã đọc toàn văn" : review.scope === "TITLE_ABSTRACT" ? "Tiêu đề / Tóm tắt" : "Chưa ghi nhận phạm vi đọc"}
        {review.fullTextReference ? ` · ${review.fullTextReference}` : ""}
      </small>
      {review.researchQuestions?.map(q => <p key={q.id}>RQ: {q.text}</p>)}
    </div>
  );
}
