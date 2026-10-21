import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { researchApi } from "../api/project-research.api";
import { useResearchCommand, useResearchResource } from "../hooks/use-project-research";
import { WorkspaceError, WorkspaceLoading } from "./workspace-common";

export function ProjectPaperAnalysis({ projectId, paperId, readOnly }: { projectId: string; paperId: string; readOnly: boolean }) {
  const { t } = useI18n();
  const view = useResearchResource(projectId, ["paper-analysis", paperId], () => researchApi.paperAnalysis(projectId, paperId), true,
    data => ["queued", "processing"].includes(data?.knowledge.status ?? ""));
  const command = useResearchCommand(projectId);
  if (view.isLoading) return <WorkspaceLoading />;
  if (view.isError || !view.data) return <WorkspaceError error={view.error} retry={() => void view.refetch()} />;
  const { analysis, knowledge, screeningStatus, paperId: canonicalId } = view.data;
  const busy = command.isPending || ["queued", "processing"].includes(knowledge.status);
  const current = knowledge.status === "ready";
  const fields = [
    ["Research questions in this paper", analysis?.researchQuestions], ["Methodology", analysis?.methods],
    ["Dataset, population or sample", analysis?.dataset], ["Reported results", analysis?.findings],
    ["Limitations", analysis?.limitations], ["Future work", analysis?.futureWork],
  ] as const;
  return <section className="project-paper-analysis" data-no-i18n>
    <div className="research-heading"><h3>{t("Paper analysis")}</h3>{!readOnly && <Button size="sm" variant="outline" disabled={busy} onClick={() => command.mutate(() => researchApi.requestPaperAnalysis(projectId, paperId))}>{t(busy ? "Analyzing paper…" : current ? "Refresh paper analysis" : "Analyze paper")}</Button>}</div>
    <p className="research-help" role="status">{t(busy ? "Analysis is queued. You can keep reading while it runs." : current ? knowledge.sourceKind === "abstract" ? "Coverage: abstract only" : "Coverage: indexed full text" : "Analysis is not current. Refresh it before using a suggestion.")}</p>
    <p className="research-help">{t("AI interpretations need human review. Private project attachments are not sent by this action.")}</p>
    {knowledge.errorMessage && <p role="alert">{knowledge.errorMessage}</p>}
    {knowledge.warnings.map(warning => <p key={warning} className="research-help">{warning}</p>)}
    {analysis && <details open={current}><summary>{t("View extracted analysis")}</summary>{analysis.summary && <p>{analysis.summary}</p>}<dl>{fields.map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{Array.isArray(value) ? value.length ? <ul>{value.map((item, index) => <li key={index}>{item}</li>)}</ul> : t("Not stated in the available source") : value || t("Not stated in the available source")}</dd></div>)}</dl></details>}
    {current && knowledge.passages.length > 0 && <details><summary>{t("Check source passages")}</summary>{knowledge.passages.map(passage => <div key={passage.id} className="research-analysis-passage"><small>{passage.pageNumber ? t("Page {{page}}", { page: passage.pageNumber }) : t("Abstract")}</small><p>{passage.text}</p></div>)}</details>}
    {screeningStatus === "INCLUDED" && <Button size="sm" variant="outline" asChild><Link to={`/projects/${projectId}?${new URLSearchParams({ tab: "gaps", research: "evidence", extract: canonicalId })}`}>{t("Extract and review evidence")}</Link></Button>}
    {command.isError && <WorkspaceError error={command.error} />}
  </section>;
}
