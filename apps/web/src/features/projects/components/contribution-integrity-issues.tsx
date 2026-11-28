import { Link } from "react-router-dom";
import { useI18n } from "@/i18n";
import { contributionsApi } from "../api/contributions.api";
import { useWorkspaceResource } from "../hooks/use-workspace";
import { WorkspaceError, WorkspaceLoading } from "./workspace-common";

/** Existing contribution responses are issues to resolve, never misconduct verdicts. */
export function ContributionIntegrityIssues({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const issues = useWorkspaceResource(projectId, "contribution-integrity-issues", async () => {
    const [disputed, clarification] = await Promise.all([contributionsApi.work(projectId, { status: "DISPUTED", page: 1, pageSize: 5 }), contributionsApi.work(projectId, { status: "NEEDS_CHANGES", page: 1, pageSize: 5 })]);
    return { items: [...disputed.items, ...clarification.items], total: disputed.total + clarification.total };
  });
  return <section className="space-y-3 border-b pb-5"><h3 className="font-semibold">{t("Contribution issues to review")}</h3>{issues.isLoading ? <WorkspaceLoading /> : issues.isError ? <WorkspaceError error={issues.error} retry={() => void issues.refetch()} /> : !issues.data?.items.length ? <p className="text-sm text-muted-foreground">{t("No open contribution disputes or clarification requests have been recorded.")}</p> : <ul className="divide-y">{issues.data.items.map(item => <li key={item.id} className="flex flex-wrap justify-between gap-2 py-3"><div><strong className="font-medium">{item.title}</strong><p className="text-xs text-muted-foreground">{t(item.status === "DISPUTED" ? "recognition.state.DISPUTED" : "recognition.state.NEEDS_CLARIFICATION")} · {item.participants.map(person => person.name).join(", ")}</p></div><Link className="text-sm text-primary hover:underline" to={`/projects/${encodeURIComponent(projectId)}?tab=contributions&contributionTab=declarations&contributionId=${encodeURIComponent(item.id)}`}>{t("View contribution evidence")}</Link></li>)}</ul>}</section>;
}
