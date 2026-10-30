import type { ScreeningPhase, ScreeningReview, ScreeningSettings } from "@trend/shared-types";

export interface AssessmentContextValue {
  scope: ScreeningPhase;
  fullTextReference: string;
  researchQuestionIds: string[];
}
export function initialAssessmentContext(review?: ScreeningReview | null, phase: ScreeningPhase = "TITLE_ABSTRACT"): AssessmentContextValue {
  return { scope: review?.scope ?? phase, fullTextReference: review?.fullTextReference ?? "", researchQuestionIds: review?.researchQuestions?.map(q => q.id) ?? [] };
}
export function AssessmentContextFields({ value, settings, onChange, fixedScope = false }: { value: AssessmentContextValue; settings: ScreeningSettings; onChange: (value: AssessmentContextValue) => void; fixedScope?: boolean }) {
  const questions = settings.questionOptions ?? [];
  return <div className="assessment-context">
    <label>Phạm vi đã đọc<select value={value.scope} disabled={fixedScope} onChange={e => onChange({ ...value, scope: e.target.value as ScreeningPhase })}><option value="TITLE_ABSTRACT">Tiêu đề / Tóm tắt</option><option value="FULL_TEXT">Toàn văn</option></select></label>
    {value.scope === "FULL_TEXT" && <label>Nguồn toàn văn đã đọc<input value={value.fullTextReference} onChange={e => onChange({ ...value, fullTextReference: e.target.value })} required minLength={10} maxLength={1000} placeholder="Đường dẫn, tệp trong dự án hoặc cách nhóm đã kiểm tra toàn văn" /><small>Chỉ chọn toàn văn khi bạn thực sự đã đọc nguồn hợp lệ.</small></label>}
    {questions.length ? <details open={value.researchQuestionIds.length > 0 || undefined}><summary>Câu hỏi nghiên cứu liên quan{value.researchQuestionIds.length ? ` (${value.researchQuestionIds.length})` : " (tùy chọn)"}</summary><div className="assessment-questions">{questions.map((question, index) => <label className="screening-check" key={question.id}><input type="checkbox" checked={value.researchQuestionIds.includes(question.id)} onChange={e => onChange({ ...value, researchQuestionIds: e.target.checked ? [...value.researchQuestionIds, question.id] : value.researchQuestionIds.filter(id => id !== question.id) })} /><span><strong>RQ{index + 1}</strong> {question.text}</span></label>)}</div></details> : <p className="assessment-hint">Dự án chưa có câu hỏi nghiên cứu. Bạn vẫn có thể đánh giá tài liệu.</p>}
    {value.researchQuestionIds.some(id => !questions.some(q => q.id === id)) && <p role="status">Một câu hỏi đã được thay đổi hoặc xóa. <button type="button" className="underline" onClick={() => onChange({ ...value, researchQuestionIds: value.researchQuestionIds.filter(id => questions.some(q => q.id === id)) })}>Bỏ liên kết không còn hiện hành</button>. Phiên bản trước vẫn giữ nguyên câu hỏi đã lưu.</p>}
  </div>;
}
export function ReviewContextSummary({ review }: { review: ScreeningReview }) {
  return <div className="assessment-review-context"><small>{review.scope === "FULL_TEXT" ? "Đã đọc toàn văn" : review.scope === "TITLE_ABSTRACT" ? "Tiêu đề / Tóm tắt" : "Chưa ghi nhận phạm vi đọc"}{review.fullTextReference ? ` · ${review.fullTextReference}` : ""}</small>{review.researchQuestions?.map(q => <p key={q.id}>RQ: {q.text}</p>)}</div>;
}
