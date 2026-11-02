export interface ResolutionEvidence { exclusionReason: string; sourceMaterial: string; retrieveFullText: boolean }
export const emptyResolutionEvidence: ResolutionEvidence = { exclusionReason: "", sourceMaterial: "", retrieveFullText: false };

export function ResolutionEvidenceFields({ value, onChange, decision, criteria, required, canRetrieveFullText }: {
  value: ResolutionEvidence; onChange: (value: ResolutionEvidence) => void; decision: string; criteria: string[]; required: boolean; canRetrieveFullText?: boolean;
}) {
  return <div className="screening-form space-y-3">
    {decision === "EXCLUDED" && <label>Lý do loại chính thức{criteria.length ? <select required={required} value={value.exclusionReason} onChange={e => onChange({ ...value, exclusionReason: e.target.value })}><option value="">Chọn tiêu chí của vòng</option>{criteria.map(c => <option key={c} value={c}>{c}</option>)}</select> : <input required={required} minLength={3} maxLength={500} value={value.exclusionReason} onChange={e => onChange({ ...value, exclusionReason: e.target.value })} />}</label>}
    <label>Nguồn tài liệu đã xem xét<textarea rows={2} required={required} minLength={3} maxLength={2000} placeholder="Tóm tắt, DOI, bản toàn văn và phần đã đọc…" value={value.sourceMaterial} onChange={e => onChange({ ...value, sourceMaterial: e.target.value })} /></label>
    {decision === "NEEDS_MORE_INFO" && canRetrieveFullText && <label className="screening-check"><input type="checkbox" checked={value.retrieveFullText} onChange={e => onChange({ ...value, retrieveFullText: e.target.checked })} />Chuyển sang lấy / đọc toàn văn sau khi xác nhận. Đây là quyết định sơ bộ, chưa đưa bài vào phân tích.</label>}
  </div>;
}
