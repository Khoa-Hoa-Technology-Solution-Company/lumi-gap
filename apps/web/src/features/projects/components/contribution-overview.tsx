import { creditRoleMetadata } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { contributionsApi } from "../api/contributions.api";
import { useWorkspaceResource } from "../hooks/use-workspace";
import { WorkspaceError, WorkspaceLoading } from "./workspace-common";
export function ContributionOverviewPanel({projectId}:{projectId:string}) {
  const {t,language}=useI18n();
  const query=useWorkspaceResource(projectId,'contribution-overview',()=>contributionsApi.overview(projectId));
  if(query.isLoading)return <WorkspaceLoading/>;
  if(query.isError)return <WorkspaceError error={query.error} retry={()=>void query.refetch()}/>;
  return <section className="space-y-4"><h3 className="font-semibold">{t("Research contribution overview")}</h3><p className="text-sm text-muted-foreground">{t("Roles are listed once per person. Duplicate records and references do not increase this overview or determine author order.")}</p><dl className="space-y-4">{query.data?.people.map(person=><div key={person.userId} className="space-y-2 border-b pb-3"><dt className="font-medium">{person.name}</dt><dd className="text-sm"><span className="text-muted-foreground">{t("Declared roles")}: </span>{person.declaredRoles.map(role=>language==='vi'?creditRoleMetadata[role].nameVi:creditRoleMetadata[role].name).join(', ')}</dd><dd className="text-sm"><span className="text-muted-foreground">{t("Independently acknowledged roles")}: </span>{person.independentlyAcknowledgedRoles.map(role=>language==='vi'?creditRoleMetadata[role].nameVi:creditRoleMetadata[role].name).join(', ')||t("Awaiting acknowledgement")}</dd></div>)}</dl></section>;
}
