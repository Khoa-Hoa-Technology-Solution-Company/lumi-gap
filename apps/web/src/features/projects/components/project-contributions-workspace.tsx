import { useSearchParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { useI18n } from "@/i18n";
import { ContributionActivityPanel } from "./contribution-activity";
import { WorkContributionsPanel } from "./work-contributions";
import { ContributionAllocationPanel } from "./contribution-allocation";
import { PersonalContributionEvidencePanel } from "./personal-contribution-evidence-panel";
import { SubmissionReadinessPackage } from "./submission-readiness-package";
import { ResearchContributionsPanel } from "./research-contributions-panel";
import { canLeaveWorkspace } from "./workspace-common";
import { ContributionOverviewPanel } from "./contribution-overview";
import "../project-contributions.css";

export function ProjectContributionsWorkspace({ projectId, currentUserId, isOwner, readOnly }: {
  projectId:string; currentUserId:string; isOwner:boolean; readOnly:boolean;
}) {
  const { t }=useI18n(); const [params,setParams]=useSearchParams();
  const value=params.get("contributionTab");
  const tab=value && ["activity","work","manuscript","declarations","allocation","pending","overview","evidence","readiness"].includes(value)?value:value==="advisors"?"work":"activity";
  async function selectTab(nextKey:string) {
    if(!await canLeaveWorkspace()) return;
    const next=new URLSearchParams(params); next.set("contributionTab",nextKey);setParams(next);
  }
  return <div className="contributions-workspace coord-panel" data-no-i18n>
    <header className="coord-heading"><h2>{t("Contributions")}</h2><p>{t("researchContribution.intro")}</p></header>
    <nav className="contribution-tabs" aria-label={t("Contribution sections")}>
      {[["activity","researchContribution.activity"],["work","researchContribution.research"],["manuscript","researchContribution.manuscriptTab"]].map(([key,label])=><button key={key} type="button" aria-current={tab===key?"page":undefined} onClick={()=>void selectTab(key!)}>{t(label!)}</button>)}
    </nav>
    {tab==="overview"?<ContributionOverviewPanel projectId={projectId}/>:tab==="pending"?<WorkContributionsPanel key="pending" projectId={projectId} currentUserId={currentUserId} readOnly={readOnly} initialFilter="PENDING"/>:tab==="activity"?<ContributionActivityPanel projectId={projectId}/>:tab==="work"?<ResearchContributionsPanel projectId={projectId}/>:tab==="manuscript"?<ResearchContributionsPanel key="manuscript" projectId={projectId} manuscript/>:tab==="declarations"?<WorkContributionsPanel projectId={projectId} currentUserId={currentUserId} readOnly={readOnly}/>:tab==="evidence"?<PersonalContributionEvidencePanel projectId={projectId}/>:tab==="readiness"?<SubmissionReadinessPackage projectId={projectId} currentUserId={currentUserId} isOwner={isOwner} readOnly={readOnly}/>:<><p className="contribution-note">{t("researchContribution.legacyHint")}</p><ContributionAllocationPanel projectId={projectId} isOwner={false} readOnly onOpenEvidenceTab={()=>void selectTab("work")}/></>}
    <nav className="research-contribution-secondary" aria-label={t("researchContribution.more")}>
      <button type="button" onClick={()=>void selectTab("pending")}>{t("Pending acknowledgements")}</button>
      <button type="button" onClick={()=>void selectTab("overview")}>{t("Research contribution overview")}</button>
      <button type="button" onClick={()=>void selectTab("declarations")}>{t("researchContribution.declareExternal")}</button>
      <button type="button" onClick={()=>void selectTab("evidence")}>{t("My evidence & export")}</button>
      <button type="button" onClick={()=>void selectTab("readiness")}>{t("Authorship & Integrity Package")}</button>
      <button type="button" onClick={()=>void selectTab("allocation")}>{t("researchContribution.legacyHistory")}</button>
    </nav>
  </div>;
}
