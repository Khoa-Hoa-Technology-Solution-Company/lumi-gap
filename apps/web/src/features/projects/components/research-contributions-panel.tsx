import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FileText, Users } from "lucide-react";
import type { ResearchContributionRecord } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import { useWorkspaceResource } from "../hooks/use-workspace";
import { contributionsApi } from "../api/contributions.api";
import { WorkspaceLoading, WorkspaceError, WorkspacePager, projectSectionHref } from "./workspace-common";
import { ContributionArtifactReference } from "./contribution-artifact-link";
import { creditLabels } from "./work-contributions";
import { activityLabels } from "./contribution-activity";
import { mentorWorkspaceDestination } from "../utils/mentor-workspace-navigation";

function ResearchRecord({ projectId, record }: { projectId: string; record: ResearchContributionRecord }) {
  const { t, language } = useI18n();
  const { pathname } = useLocation();
  const declarationHref=projectSectionHref(projectId,"contributions",{contributionTab:"declarations",contributionId:record.sourceId});
  return <li className="research-contribution-record">
    <header><div><strong>{record.actor.name}</strong><span>{t(`researchContribution.${record.participantKind}`)}</span></div><Badge variant="outline">{t(`researchContribution.${record.provenance}`)}</Badge></header>
    <p className="research-contribution-record-title">{record.type === "CONTRIBUTION_DECLARED" ? t("researchContribution.declaredWork") : record.type === "MENTOR_REVIEW_SUBMITTED" ? t("researchContribution.versionReview") : record.type === "MENTOR_FEEDBACK_RECORDED" ? t("researchContribution.academicFeedback") : t(activityLabels[record.category])}
      {record.artifactVersion !== null ? <small>v{record.artifactVersion}</small> : null}</p>
    {record.description ? <p className="contribution-prose">{record.description}</p> : null}
    {record.evidence ? <details><summary>{t("Evidence and deliverables")}</summary><p className="contribution-prose">{record.evidence}</p></details> : null}
    {record.suggestedRoles.length ? <p className="research-contribution-role-note">{t("researchContribution.inferredRoles")}: {record.suggestedRoles.map(role => t(creditLabels[role])).join(", ")}</p> : null}
    {record.declaredRoles.length ? <p className="research-contribution-role-note">{t("researchContribution.declaredRoles")}: {record.declaredRoles.map(role => t(creditLabels[role])).join(", ")} · {t(record.status === "ACCEPTED" ? "Acknowledged by a peer" : record.status === "DISPUTED" ? "Disputed" : "Pending acknowledgement")}</p> : null}
    <footer><time dateTime={record.createdAt}>{new Date(record.createdAt).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" })}</time>
      {record.sourceType === "CONTRIBUTION" ? <Link to={pathname==="/mentor-workspace"?mentorWorkspaceDestination(declarationHref):declarationHref}>{t("researchContribution.reviewDeclaration")}</Link> : <ContributionArtifactReference projectId={projectId} link={record.link} />}
    </footer>
  </li>;
}

export function ResearchContributionsPanel({ projectId, manuscript = false }: { projectId: string; manuscript?: boolean }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const declarationHref=projectSectionHref(projectId,"contributions",{contributionTab:"declarations"});
  const [person, setPerson] = useState(""); const [kind, setKind] = useState(""); const [scopeKey, setScope] = useState(""); const [page, setPage] = useState(1);
  const query = { page, pageSize:20, memberId:person || undefined, participantKind:kind || undefined, scopeKey:manuscript ? scopeKey || undefined : undefined };
  const result = useWorkspaceResource(projectId, "research-contributions", () => contributionsApi.research(projectId,query),query);
  const visibleData = result.isError ? undefined : result.data;
  const statement = useWorkspaceResource(projectId,"manuscript-contribution-statement",()=>contributionsApi.statement(projectId,scopeKey),scopeKey,manuscript && Boolean(scopeKey) && Boolean(visibleData && !visibleData.mentorScoped));
  const selectScope=(key:string)=>{setScope(key);setPerson("");setPage(1);};
  const showRecords=!manuscript || Boolean(scopeKey);
  return <section className="contribution-section research-contribution-panel">
    <p className="contribution-note">{t("researchContribution.evidenceHint")}</p>
    {visibleData?.mentorScoped ? <Link className="coord-inline-link" to={pathname==="/mentor-workspace"?mentorWorkspaceDestination(declarationHref):declarationHref}>{t("researchContribution.declareExternal")}</Link> : null}
    <div className="contribution-filters">
      {manuscript ? <label>{t("researchContribution.manuscript")}<select value={scopeKey} onChange={e=>selectScope(e.target.value)}><option value="">{t("researchContribution.chooseManuscript")}</option>{visibleData?.manuscripts.map(scope=><option key={scope.key} value={scope.key}>{scope.title}</option>)}</select></label> : null}
      <label>{t("researchContribution.participants")}<select value={kind} onChange={e=>{setKind(e.target.value);setPage(1);}}><option value="">{t("researchContribution.allParticipants")}</option><option value="MEMBER">{t("researchContribution.MEMBER")}</option><option value="MENTOR">{t("researchContribution.MENTOR")}</option></select></label>
      <Button type="button" variant={person && person===visibleData?.currentActorId ? "secondary" : "outline"} disabled={!visibleData} onClick={()=>{setPerson(person ? "" : visibleData!.currentActorId);setPage(1);}}>{t(person ? "researchContribution.allParticipants" : "My contributions")}</Button>
      {person ? <Button variant="ghost" onClick={()=>{setPerson("");setPage(1);}}>{t("Clear filters")}</Button> : null}
    </div>
    {result.isLoading ? <WorkspaceLoading /> : result.isError ? <WorkspaceError error={result.error} retry={()=>void result.refetch()} /> : !showRecords ? <div className="contribution-empty"><FileText aria-hidden="true" /><h3>{t("researchContribution.chooseManuscript")}</h3><p>{t("researchContribution.manuscriptHint")}</p></div> : <>
      <div className="research-contribution-profiles" aria-label={t("researchContribution.profiles")}>
        {(["MEMBER","MENTOR"] as const).map(group=>{
          const profiles=visibleData?.profiles.filter(profile=>profile.participantKind===group) ?? [];
          if(!profiles.length || kind && kind!==group) return null;
          return <section key={group}><h3><Users size={16} aria-hidden="true" />{t(`researchContribution.${group}`)}</h3><ul>{profiles.map(profile=><li key={`${profile.id}:${group}`}><button type="button" aria-pressed={person===profile.id} onClick={()=>{setPerson(person===profile.id?"":profile.id);setPage(1);}}><strong>{profile.name}</strong><small>{t("researchContribution.recordCount",{count:profile.recordCount})}</small></button></li>)}</ul></section>;
        })}
      </div>
      <header className="research-contribution-list-heading"><h3>{t("researchContribution.evidenceRecords")}</h3><span role="status">{t("researchContribution.recordCount",{count:visibleData?.total??0})}</span></header>
      {!visibleData?.items.length ? <p className="contribution-empty">{t("researchContribution.empty")}</p> : <ol className="research-contribution-records">{visibleData.items.map(record=><ResearchRecord key={record.id} projectId={projectId} record={record}/>)}</ol>}
      <WorkspacePager data={visibleData} page={page} onPage={setPage}/>
      {manuscript && !visibleData?.mentorScoped ? <section className="research-contribution-statement"><h3>{t("researchContribution.statement")}</h3><p>{t("researchContribution.statementHint")}</p>
        {statement.isLoading ? <WorkspaceLoading/> : statement.isError ? <WorkspaceError error={statement.error} retry={()=>void statement.refetch()}/> : statement.data?.ready ? <><pre>{statement.data.statement}</pre><Button variant="outline" onClick={()=>{
          const url=URL.createObjectURL(new Blob([statement.data!.statement!],{type:"text/plain;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download="credit-contribution-statement.txt";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        }}>{t("researchContribution.downloadStatement")}</Button></> : <p>{t("researchContribution.statementPending")}</p>}
        <Link className="coord-inline-link" to={projectSectionHref(projectId,"contributions",{contributionTab:"declarations"})}>{t("researchContribution.reviewDeclaration")}</Link>
      </section> : null}
    </>}
  </section>;
}
