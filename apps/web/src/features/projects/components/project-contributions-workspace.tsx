import { useSearchParams } from "react-router-dom";
import { useI18n } from "@/i18n";
import { ContributionActivityPanel } from "./contribution-activity";
import { WorkContributionsPanel } from "./work-contributions";
import { ContributionAllocationPanel } from "./contribution-allocation";
import { canLeaveWorkspace } from "./workspace-common";
import "../project-contributions.css";
export function ProjectContributionsWorkspace({ projectId, currentUserId, isOwner, readOnly }: { projectId: string; currentUserId: string; isOwner: boolean; readOnly: boolean }) {
  const { t } = useI18n(); const [params, setParams] = useSearchParams(); const value = params.get("contributionTab"); const tab = value === "work" || value === "allocation" ? value : "activity";
  return <div className="contributions-workspace coord-panel" data-no-i18n><header className="coord-heading"><h2>{t("Contributions")}</h2></header><nav className="contribution-tabs" aria-label={t("Contribution sections")}>{[["activity", "Activity"], ["work", "Work contributions"], ["allocation", "Contribution allocation"]].map(([key, label]) => <button key={key} type="button" aria-current={tab === key ? "page" : undefined} onClick={async () => { if (!(await canLeaveWorkspace())) return; const next = new URLSearchParams(params); next.set("contributionTab", key!); setParams(next); }}>{t(label!)}</button>)}</nav>
    {tab === "activity" ? <ContributionActivityPanel projectId={projectId} /> : tab === "work" ? <WorkContributionsPanel projectId={projectId} currentUserId={currentUserId} readOnly={readOnly} /> : <ContributionAllocationPanel projectId={projectId} isOwner={isOwner} readOnly={readOnly} />}
  </div>;
}
