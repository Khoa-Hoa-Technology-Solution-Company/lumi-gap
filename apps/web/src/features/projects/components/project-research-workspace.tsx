import { type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { researchApi } from "../api/project-research.api";
import { useResearchResource } from "../hooks/use-project-research";
import { ResearchEvidence } from "./research-evidence";
import { ResearchSynthesis } from "./research-synthesis";
import { LiteratureMatrixView } from "./literature-matrix";
import { ResearchLimitations } from "./research-limitations";
import { canLeaveWorkspace, WorkspaceError, WorkspaceLoading } from "./workspace-common";
import "../project-research.css";
import "../research-synthesis.css";

/** Order follows the research workflow: extract, compare, find limitations, synthesise, then gaps and questions. */
const RESEARCH_STEPS = [["evidence", "Trích xuất"], ["matrix", "Ma trận tài liệu"], ["limitations", "Hạn chế"], ["synthesis", "Tổng hợp"], ["gaps", "Gap ứng viên"], ["questions", "Câu hỏi nghiên cứu"]] as const;
export function ProjectResearchWorkspace({ projectId, readOnly, children }: { projectId: string; readOnly: boolean; children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const step = params.get("research") ?? "gaps";
  const go = async (target: string) => {
    if (target === step || !(await canLeaveWorkspace())) return;
    const next = new URLSearchParams(params); next.delete("extract"); next.delete("evidence");
    if (target === "gaps") next.delete("research"); else next.set("research", target);
    setParams(next);
  };
  return <div className="research-workflow project-research-steps" data-no-i18n>
    {/* Gap discovery keeps a single primary action; the step bar only appears inside the nested research steps. */}
    {RESEARCH_STEPS.some(([key]) => key === step && key !== "gaps") && <nav className="research-views research-step-nav" aria-label="Các bước tìm khoảng trống nghiên cứu">
      {RESEARCH_STEPS.map(([key, label], index) => <button key={key} type="button" aria-current={step === key ? "step" : undefined} onClick={() => void go(key)}><span className="research-step-index">{index + 1}</span>{label}</button>)}
    </nav>}
    {step === "matrix" ? <LiteratureMatrixView projectId={projectId} readOnly={readOnly} /> : step === "limitations" ? <ResearchLimitations projectId={projectId} readOnly={readOnly} /> : step === "evidence" ? <ResearchEvidence projectId={projectId} readOnly={readOnly} /> : step === "synthesis" ? <ResearchSynthesis projectId={projectId} readOnly={readOnly} /> : step === "questions" ? <ResearchQuestions projectId={projectId} /> : children}
  </div>;
}

function ResearchQuestions({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const view = useResearchResource(projectId, ["questions"], () => researchApi.questions(projectId));
  if (view.isLoading) return <WorkspaceLoading />;
  if (view.isError || !view.data) return <WorkspaceError error={view.error} retry={() => void view.refetch()} />;
  return <section><header className="research-heading"><div><h2>{t("Research questions")}</h2><p>{t("Research directions keep the gap and evidence revisions behind them.")}</p></div></header>
    {!view.data.length && <div className="research-empty"><h3>{t("Start with a team-supported gap")}</h3><p>{t("Open a candidate, review its evidence and record team support. Then derive a research question.")}</p><Button variant="outline" asChild><Link to={`/projects/${projectId}?tab=gaps&research=gaps`}>{t("Review candidates")}</Link></Button></div>}
    <ol className="research-question-list">{view.data.map(item => <li key={item.id}><h3>{item.text}</h3>{item.sourceGapId && <Link className="research-source-link" to={`/projects/${projectId}?tab=gaps&gap=${encodeURIComponent(item.sourceGapId)}`}>{item.sourceGapTitle ?? t("Originating gap")} · v{item.sourceGapVersion}</Link>}<p className="research-help">{t("{{count}} pinned evidence revisions", { count: item.evidenceCount })}</p>{item.needsReview && <p role="status" className="research-notice">{t("The originating gap or evidence changed. Review this research direction again.")}</p>}</li>)}</ol>
  </section>;
}
