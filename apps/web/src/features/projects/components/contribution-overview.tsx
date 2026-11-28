import { creditRoleMetadata } from "@trend/shared-types";
import { Link } from "react-router-dom";
import { useI18n } from "@/i18n";
import { contributionsApi } from "../api/contributions.api";
import { useWorkspaceResource } from "../hooks/use-workspace";
import { WorkspaceError, WorkspaceLoading } from "./workspace-common";
export function ContributionOverviewPanel({projectId}:{projectId:string}) {
  const {t,language}=useI18n();
  const query=useWorkspaceResource(projectId,'contribution-overview',()=>contributionsApi.overview(projectId));
  if(query.isLoading)return <WorkspaceLoading/>;
  if(query.isError)return <WorkspaceError error={query.error} retry={()=>void query.refetch()}/>;
  const people = query.data?.people ?? [];
  return <section className="space-y-4"><h3 className="font-semibold">{t("Research contribution overview")}</h3><p className="max-w-prose text-sm text-muted-foreground">{t("Roles are listed once per person. Duplicate records and references do not increase this overview or determine author order.")}</p>{!people.length ? <p className="contribution-empty">{t("No declared research roles yet.")}</p> : <div className="max-w-full overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><caption className="sr-only">{t("CRediT contribution matrix")}</caption><thead><tr><th scope="col" className="border-b p-3">{t("CRediT role")}</th>{people.map(person => <th key={person.userId} scope="col" className="min-w-40 border-b p-3 font-medium">{person.name}</th>)}</tr></thead><tbody>{Object.entries(creditRoleMetadata).map(([role,meta]) => <tr key={role}><th scope="row" className="min-w-48 border-b p-3 font-medium">{language === "vi" ? meta.nameVi : meta.name}</th>{people.map(person => { const declared = person.declaredRoles.includes(role as keyof typeof creditRoleMetadata), confirmed = person.independentlyAcknowledgedRoles.includes(role as keyof typeof creditRoleMetadata); return <td key={person.userId} className="border-b p-3">{declared ? <Link className="text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2" to={`/projects/${encodeURIComponent(projectId)}?tab=contributions&contributionTab=declarations&memberId=${encodeURIComponent(person.userId)}&creditRole=${encodeURIComponent(role)}`}>{t(confirmed ? "Independently acknowledged" : "Declared, not independently confirmed")}</Link> : <span className="text-muted-foreground" aria-label={t("No contribution recorded for this role")}>—</span>}</td>; })}</tr>)}</tbody></table></div>}</section>;
}
