import { type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { researchApi } from "../api/project-research.api";
import { useResearchResource } from "../hooks/use-project-research";
import { ResearchEvidence } from "./research-evidence";
import { ResearchSynthesis } from "./research-synthesis";
import { canLeaveWorkspace, WorkspaceError, WorkspaceLoading } from "./workspace-common";
import "../project-research.css";
import "../research-synthesis.css";

export function ProjectResearchWorkspace({ projectId, readOnly, children }: { projectId: string; readOnly: boolean; children: ReactNode }) {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const step = params.get("research") ?? "gaps";
  const nested = ["evidence", "synthesis", "questions"].includes(step);
  return <div className="research-workflow project-research-steps" data-no-i18n>
    {nested && <Button variant="ghost" className="mb-4" onClick={async () => { if (!(await canLeaveWorkspace())) return; const next = new URLSearchParams(params); next.delete("research"); next.delete("extract"); next.delete("evidence"); setParams(next); }}>{t("Back to gap discovery")}</Button>}
    {step === "evidence" ? <ResearchEvidence projectId={projectId} readOnly={readOnly} /> : step === "synthesis" ? <ResearchSynthesis projectId={projectId} readOnly={readOnly} /> : step === "questions" ? <ResearchQuestions projectId={projectId} /> : children}
  </div>;
}

function ResearchQuestions({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const view = useResearchResource(projectId, ["questions"], () => researchApi.questions(projectId));
  if (view.isLoading) return <WorkspaceLoading />;
  if (view.isError || !view.data) return <WorkspaceError error={view.error} retry={() => void view.refetch()} />;
  return <section><header className="research-heading"><div><h2>{t("Research questions")}</h2><p>{t("Research directions keep the gap and evidence revisions behind them.")}</p></div></header>
    {!view.data.length && <div className="research-empty"><h3>{t("Start with a team-supported gap")}</h3><p>{t("Open a candidate, review its evidence and record team support. Then derive a research question.")}</p><Button variant="outline" asChild><Link to={`/projects/${projectId}?tab=gaps&research=gaps`}>{t("Review candidates")}</Link></Button></div>}
    <ol className="research-question-list">{view.data.map(item => <li key={item.id}><h3>{item.text}</h3>{item.sourceGapId && <Link className="research-source-link" to={`/gaps/${encodeURIComponent(item.sourceGapId)}`}>{item.sourceGapTitle ?? t("Originating gap")} · v{item.sourceGapVersion}</Link>}<p className="research-help">{t("{{count}} pinned evidence revisions", { count: item.evidenceCount })}</p>{item.needsReview && <p role="status" className="research-notice">{t("The originating gap or evidence changed. Review this research direction again.")}</p>}</li>)}</ol>
  </section>;
}
