import { Link, useSearchParams } from "react-router-dom";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { ContributionActivityPanel } from "./contribution-activity";
import { WorkContributionsPanel } from "./work-contributions";
import { ContributionAllocationPanel } from "./contribution-allocation";
import { PersonalContributionEvidencePanel } from "./personal-contribution-evidence-panel";
import { SubmissionReadinessPackage } from "./submission-readiness-package";
import { ResearchContributionsPanel } from "./research-contributions-panel";
import { canLeaveWorkspace } from "./workspace-common";
import { ContributionOverviewPanel } from "./contribution-overview";
import { ContributionIntegrityIssues } from "./contribution-integrity-issues";
import "../project-contributions.css";

export function ProjectContributionsWorkspace({ projectId, currentUserId, isOwner, readOnly }: {
  projectId: string; currentUserId: string; isOwner: boolean; readOnly: boolean;
}) {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = params.get("contributionTab") ?? "work";
  const section = ["integrity"].includes(tab) ? "integrity" : ["recognition", "overview", "manuscript", "readiness", "allocation"].includes(tab) ? "recognition" : "contributions";
  async function selectTab(nextKey: string, create = false) {
    if (!await canLeaveWorkspace()) return;
    const next = new URLSearchParams(params);
    next.set("contributionTab", nextKey);
    ["contributionId", "newContribution", "memberId", "creditRole"].forEach(key => next.delete(key));
    if (create) next.set("newContribution", "1");
    setParams(next);
  }
  return <div className="contributions-workspace coord-panel" data-no-i18n>
    <header className="coord-heading flex flex-wrap items-start justify-between gap-4"><div><h2>{t("Research Integrity & Contributions")}</h2><p>{t("researchContribution.intro")}</p></div>{!readOnly && section === "contributions" && <Button onClick={() => void selectTab("declarations", true)}>{t("Declare contribution")}</Button>}</header>
    <nav className="contribution-tabs" aria-label={t("Contribution sections")}>
      {[["work", "Contributions", "contributions"], ["integrity", "Research integrity", "integrity"], ["recognition", "Contribution recognition", "recognition"]].map(([key, label, value]) => <button key={key} type="button" aria-current={section === value ? "page" : undefined} onClick={() => void selectTab(key!)}>{t(label!)}</button>)}
    </nav>
    {section === "integrity" ? <><p className="contribution-note">{t("Integrity checks identify information to review, not a certificate of research integrity.")}</p><ContributionIntegrityIssues projectId={projectId} /><SubmissionReadinessPackage key="integrity" section="integrity" projectId={projectId} currentUserId={currentUserId} isOwner={isOwner} readOnly={readOnly} /></> : section === "recognition" ? <div className="space-y-6">
      <ContributionOverviewPanel projectId={projectId} />
      <details className="border-t pt-4" open={tab === "manuscript"}><summary className="cursor-pointer font-medium">{t("researchContribution.statement")}</summary><ResearchContributionsPanel projectId={projectId} manuscript /></details>
      <details className="border-t pt-4"><summary className="cursor-pointer font-medium">{t("Authorship agreements")}</summary><p className="mt-3 text-sm text-muted-foreground">{t("Authorship is agreed against a manuscript version. CRediT roles do not select or order authors.")}</p><Button asChild variant="outline" className="mt-3"><Link to={`/projects/${encodeURIComponent(projectId)}?tab=manuscripts`}>{t("Open manuscript authorship agreements")}</Link></Button></details>
      <details className="border-t pt-4"><summary className="cursor-pointer font-medium">{t("My evidence & export")}</summary><PersonalContributionEvidencePanel projectId={projectId} /></details>
      {tab === "allocation" && <><p className="contribution-note">{t("researchContribution.legacyHint")}</p><ContributionAllocationPanel projectId={projectId} isOwner={false} readOnly onOpenEvidenceTab={() => void selectTab("work")} /></>}
    </div> : <>
      <nav className="research-contribution-secondary" aria-label={t("researchContribution.more")}>
        {[["work", "Research products"], ["my", "mentorWorkspace.myContributions"], ["declarations", "Declared contributions"], ["pending", "Pending acknowledgements"], ["activity", "researchContribution.activity"]].map(([key,label]) => <button key={key} type="button" aria-current={(tab === key || (key === "my" && tab === "evidence")) ? "page" : undefined} onClick={() => void selectTab(key!)}>{t(label!)}</button>)}
      </nav>
      {tab === "activity" ? <ContributionActivityPanel projectId={projectId} /> : (tab === "my" || tab === "evidence") ? <PersonalContributionEvidencePanel projectId={projectId} /> : ["declarations", "pending"].includes(tab) ? <WorkContributionsPanel key={`${tab}:${params.get("newContribution") ?? ""}`} projectId={projectId} currentUserId={currentUserId} readOnly={readOnly} initialFilter={tab === "pending" ? "PENDING" : "TEAM"} initialCreate={params.get("newContribution") === "1"} /> : <ResearchContributionsPanel projectId={projectId} />}
    </>}
  </div>;
}
