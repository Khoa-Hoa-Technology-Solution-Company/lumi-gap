import { useState } from "react";
import { FEASIBILITY_DIMENSIONS, type FeasibilityDimension, type FeasibilityScores, type FeasibilityTargetKind, type FeasibilityVerdict } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import { researchApi } from "../api/project-research.api";
import { useResearchCommand, useResearchResource } from "../hooks/use-project-research";
import { useUnsavedWorkspace, WorkspaceError, WorkspaceLoading } from "./workspace-common";
import "../research-literature.css";

export const dimensionLabels: Record<FeasibilityDimension, { label: string; hint: string }> = {
  dataAvailability: { label: "Dữ liệu", hint: "Có dữ liệu hoặc có thể thu thập được không" },
  expertise: { label: "Chuyên môn", hint: "Nhóm có đủ kiến thức và kỹ năng không" },
  resources: { label: "Tài nguyên", hint: "Máy tính, thiết bị, kinh phí, công cụ" },
  timeline: { label: "Thời gian", hint: "Có làm kịp trong thời gian của dự án không" },
  risk: { label: "Rủi ro thấp", hint: "5 = rủi ro thấp; 1 = rủi ro chặn hẳn công việc" },
};
export const verdictLabels: Record<FeasibilityVerdict, string> = { FEASIBLE: "Khả thi", CONDITIONAL: "Khả thi có điều kiện", NOT_FEASIBLE: "Chưa khả thi" };
const scaleLabels = ["", "1 · Chặn", "2 · Khó", "3 · Tạm được", "4 · Tốt", "5 · Rất tốt"];

export function VerdictBadge({ verdict }: { verdict: FeasibilityVerdict | null }) {
  return <span className={`feasibility-verdict feasibility-verdict-${(verdict ?? "none").toLowerCase()}`}>{verdict ? verdictLabels[verdict] : "Chưa đánh giá"}</span>;
}

/**
 * Team feasibility of a limitation or a gap candidate. Each member keeps one assessment; the team verdict uses the
 * mean of each dimension, and any score of 1 from anyone is a blocker.
 */
export function FeasibilityPanel({ projectId, kind, targetId, readOnly }: { projectId: string; kind: FeasibilityTargetKind; targetId: string; readOnly: boolean }) {
  const userId = useAuthStore((state) => state.user?.id);
  const view = useResearchResource(projectId, ["feasibility", kind, targetId], () => researchApi.feasibility(projectId, kind, targetId));
  const command = useResearchCommand(projectId);
  const mine = view.data?.assessments.find((row) => row.assessorId === userId);
  const [draft, setDraft] = useState<(FeasibilityScores & { notes: string }) | null>(null);
  useUnsavedWorkspace(Boolean(draft));
  if (view.isLoading) return <WorkspaceLoading />;
  if (view.isError || !view.data) return <WorkspaceError error={view.error} retry={() => void view.refetch()} />;
  const { summary, assessments, canAssess } = view.data;
  const needsNotes = Boolean(draft && FEASIBILITY_DIMENSIONS.some((key) => draft[key] <= 2) && !draft.notes.trim());
  const start = () => setDraft(mine ? { dataAvailability: mine.dataAvailability, expertise: mine.expertise, resources: mine.resources, timeline: mine.timeline, risk: mine.risk, notes: mine.notes } : { dataAvailability: 3, expertise: 3, resources: 3, timeline: 3, risk: 3, notes: "" });
  const save = async () => {
    if (!draft || needsNotes) return;
    try { await command.mutateAsync(() => researchApi.saveFeasibility(projectId, kind, targetId, { ...draft, ...(mine ? { expectedVersion: mine.version } : {}) })); setDraft(null); } catch { /* keep the draft */ }
  };
  return <section className="feasibility-panel" aria-label="Đánh giá khả thi" data-no-i18n>
    <header className="feasibility-head">
      <div><h4>Đánh giá khả thi</h4><p className="research-help">Mỗi thành viên chấm 5 tiêu chí từ 1 (chặn) đến 5 (rất tốt). Chỉ cần một người chấm 1 ở tiêu chí nào thì tiêu chí đó bị coi là chặn.</p></div>
      <VerdictBadge verdict={summary.verdict} />
    </header>
    {summary.means && <dl className="feasibility-means">{FEASIBILITY_DIMENSIONS.map((key) => <div key={key} className={summary.blockers.includes(key) ? "feasibility-blocker" : undefined}><dt title={dimensionLabels[key].hint}>{dimensionLabels[key].label}</dt><dd>{summary.means![key].toFixed(1)}{summary.blockers.includes(key) && <span> · bị chặn</span>}</dd></div>)}<div><dt>Trung bình</dt><dd>{summary.mean?.toFixed(2)} · {summary.count} người chấm</dd></div></dl>}
    {!!assessments.length && <ul className="feasibility-list">{assessments.map((row) => <li key={row.id}><strong>{row.assessorName}</strong> <VerdictBadge verdict={row.verdict} /> <span className="research-help">{FEASIBILITY_DIMENSIONS.map((key) => `${dimensionLabels[key].label} ${row[key]}`).join(" · ")}</span>{row.notes && <p>{row.notes}</p>}</li>)}</ul>}
    {!readOnly && canAssess && !draft && <Button type="button" variant="outline" size="sm" onClick={start}>{mine ? "Sửa đánh giá của tôi" : "Thêm đánh giá của tôi"}</Button>}
    {draft && <form className="research-form feasibility-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div className="feasibility-grid">{FEASIBILITY_DIMENSIONS.map((key) => <label key={key}>{dimensionLabels[key].label}<small className="research-help">{dimensionLabels[key].hint}</small>
        <select value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: Number(event.target.value) })}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{scaleLabels[value]}</option>)}</select></label>)}</div>
      <label>Ghi chú{needsNotes && <small className="evidence-warning"> Bắt buộc giải thích khi có điểm 1 hoặc 2</small>}<textarea maxLength={4000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Ví dụ: chưa có bộ dữ liệu chữ viết tay có gán nhãn; cần liên hệ phòng lab đối tác" /></label>
      <div className="research-actions"><Button type="submit" disabled={needsNotes || command.isPending}>Lưu đánh giá</Button><Button type="button" variant="ghost" onClick={() => setDraft(null)}>Hủy</Button></div>
      {command.isError && <WorkspaceError error={command.error} />}
    </form>}
  </section>;
}
