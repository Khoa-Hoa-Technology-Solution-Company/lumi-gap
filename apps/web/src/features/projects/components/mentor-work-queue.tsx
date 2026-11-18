import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, AlertCircle, Search } from "lucide-react";
import type { MentorWorkItem, MentorWorkQuery, MentorWorkspaceData } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import "../mentor-workspace.css";
import { mentorWorkspaceDestination } from "../utils/mentor-workspace-navigation";

export const mentorKindKeys = { TASK: "task", MANUSCRIPT_REVIEW: "manuscriptReview", PROPOSAL_REVIEW: "proposalReview", MENTOR_QUESTION: "mentorQuestion" } as const;

export function MentorQueueLoading() {
  const { t } = useI18n();
  return <div role="status" aria-label={t("mentorWorkspace.loading")} className="mentor-queue-loading">{[1, 2, 3].map(n => <Skeleton key={n} className="h-24 w-full" />)}</div>;
}

export function MentorWorkRows({ items, groupBy = "none" }: { items: MentorWorkItem[]; groupBy?: "none" | "project" | "status" }) {
  const { t, language } = useI18n();
  const { pathname } = useLocation();
  const href = (path: string) => pathname === "/mentor-workspace" ? mentorWorkspaceDestination(path) : path;
  const groups = new Map<string, MentorWorkItem[]>();
  for (const item of items) {
    const key = groupBy === "project" ? item.projectId : groupBy === "status" ? item.status : "all";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return <div className="mentor-work-groups">{[...groups.entries()].map(([key, rows]) => <section key={key}>
    {groupBy !== "none" && <h3 className="mentor-group-title">{groupBy === "project" ? rows[0]!.projectTitle : t(`mentorWorkspace.status.${key}`)} <span>{rows.length}</span></h3>}
    <ul className="mentor-work-list">{rows.map(item => <li key={item.id} className="mentor-work-row">
      <div className="mentor-row-context"><span>{t(`mentorWorkspace.${mentorKindKeys[item.kind]}`)}</span>{item.version !== null && <span>{t("mentorWorkspace.version", { version: item.version })}</span>}
        {item.overdue && <Badge variant="destructive">{t("mentorWorkspace.overdue")}</Badge>}
        {item.blocked && <Badge variant="destructive">{t("mentorWorkspace.blocked")}</Badge>}
      </div>
      <div className="mentor-row-main"><div className="mentor-row-copy"><Link className="mentor-row-title" to={href(item.href)}>{item.title}</Link><p><Link to={href(`/projects/${encodeURIComponent(item.projectId)}?tab=tasks`)}>{item.projectTitle}</Link><span aria-hidden="true"> · </span>{item.sender}</p></div>
        <Badge variant="secondary">{t(`mentorWorkspace.status.${item.status}`)}</Badge>
      </div>
      {item.accessIssue && <p className="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">{t("mentorWorkspace.manuscriptNotShared")}</p>}
      <div className="mentor-row-footer"><div><span className="mentor-priority-pill" data-priority={item.priority}>{t(`mentorWorkspace.priority.${item.priority}`)}</span>{item.dueAt ? <time className={item.overdue ? "mentor-overdue" : undefined} dateTime={item.dueAt}>{t("mentorWorkspace.due")} {new Date(item.dueAt).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" })}</time> : <span>{t("mentorWorkspace.noDeadline")}</span>}</div>
        <Button asChild size="sm" variant={item.needsAction ? "default" : "outline"}><Link to={href(item.href)}>{t(item.accessIssue && item.canContactTeam ? "mentorWorkspace.contactTeam" : item.kind === "TASK" && item.href.startsWith("/submissions/") ? "mentorWorkspace.openManuscript" : `mentorWorkspace.action.${item.action}`)}<ArrowUpRight size={14} aria-hidden="true" /></Link></Button>
      </div>
    </li>)}</ul>
  </section>)}</div>;
}

export function MentorWorkQueue({ data, query, onChange, loading, fetching, error, retry, projectOnly = false }: {
  data?: MentorWorkspaceData; query: MentorWorkQuery; onChange: (query: MentorWorkQuery) => void;
  loading: boolean; fetching: boolean; error: unknown; retry: () => void; projectOnly?: boolean;
}) {
  const { t } = useI18n();
  const [groupBy, setGroupBy] = useState<"none" | "project" | "status">("none");
  const update = (patch: Partial<MentorWorkQuery>) => onChange({ ...query, ...patch, page: 1 });
  const hasActiveFilter = Boolean(query.q || query.projectId || query.kind || (query.status && query.status !== "ACTIONABLE"));
  return <section className="mentor-queue" aria-label={t("mentorWorkspace.work")}>
    <div className="mentor-queue-controls">
      <label className="mentor-search"><Search size={16} aria-hidden="true" /><Input type="search" aria-label={t("mentorWorkspace.searchWork")} placeholder={t("mentorWorkspace.searchWork")} value={query.q ?? ""} maxLength={160} onChange={e => update({ q: e.target.value })} /></label>
      {!projectOnly && <select aria-label={t("mentorWorkspace.projectFilter")} value={query.projectId ?? ""} onChange={e => update({ projectId: e.target.value || undefined })}><option value="">{t("mentorWorkspace.allProjects")}</option>{!error && data?.projectOptions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select>}
      <select aria-label={t("mentorWorkspace.kindFilter")} value={query.kind ?? ""} onChange={e => update({ kind: (e.target.value || undefined) as MentorWorkQuery["kind"] })}><option value="">{t("mentorWorkspace.allKinds")}</option><option value="REVIEW">{t("mentorWorkspace.reviewKinds")}</option>{Object.entries(mentorKindKeys).map(([value, key]) => <option key={value} value={value}>{t(`mentorWorkspace.${key}`)}</option>)}</select>
      <select aria-label={t("mentorWorkspace.statusFilter")} value={query.status ?? "ACTIONABLE"} onChange={e => update({ status: e.target.value as MentorWorkQuery["status"] })}>{["ACTIONABLE", "OVERDUE", "ALL", "TODO", "IN_PROGRESS", "BLOCKED", "WAITING", "DONE"].map(s => <option key={s} value={s}>{t(`mentorWorkspace.status.${s}`)}</option>)}</select>
      {hasActiveFilter ? <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ page: 1, status: "ACTIONABLE", sort: query.sort ?? "priority" })}>{t("mentorWorkspace.clearFilters")}</Button> : null}
    </div>
    <div className="mentor-queue-toolbar"><p role="status" aria-live="polite">{error ? "" : loading ? t("mentorWorkspace.loading") : data ? t("mentorWorkspace.resultCount", { count: data.meta.total }) : ""}{fetching && !loading ? ` · ${t("mentorWorkspace.updating")}` : ""}</p><div>
      <label>{t("mentorWorkspace.sort")}<select aria-label={t("mentorWorkspace.sort")} value={query.sort ?? "priority"} onChange={e => update({ sort: e.target.value as MentorWorkQuery["sort"] })}><option value="priority">{t("mentorWorkspace.prioritySort")}</option><option value="deadline">{t("mentorWorkspace.deadlineSort")}</option></select></label>
      <label>{t("mentorWorkspace.group")}<select aria-label={t("mentorWorkspace.group")} value={groupBy} onChange={e => setGroupBy(e.target.value as typeof groupBy)}><option value="none">{t("mentorWorkspace.noGroup")}</option>{!projectOnly && <option value="project">{t("mentorWorkspace.projectFilter")}</option>}<option value="status">{t("mentorWorkspace.statusFilter")}</option></select></label>
    </div></div>
    {error ? <div role="alert" className="mentor-queue-empty"><AlertCircle size={22} aria-hidden="true" /><p>{t("mentorWorkspace.loadError")}</p><Button variant="outline" onClick={retry}>{t("Try again")}</Button></div> : loading ? <MentorQueueLoading /> : data?.items.length ? <div aria-busy={fetching}><MentorWorkRows items={data.items} groupBy={groupBy} /></div> : <div className="mentor-queue-empty"><h3>{t("mentorWorkspace.emptyWork")}</h3><p>{t("mentorWorkspace.emptyWorkHint")}</p><Button variant="ghost" onClick={() => onChange({ page: 1, status: "ACTIONABLE" })}>{t("mentorWorkspace.clearFilters")}</Button></div>}
    {!error && data && data.meta.totalPages > 1 && <nav className="mentor-pagination" aria-label={t("mentorWorkspace.pagination")}><Button size="sm" variant="outline" disabled={data.meta.page <= 1 || fetching} onClick={() => onChange({ ...query, page: data.meta.page - 1 })}>{t("Previous")}</Button><span>{t("mentorWorkspace.pageCount", { page: data.meta.page, total: data.meta.totalPages })}</span><Button size="sm" variant="outline" disabled={data.meta.page >= data.meta.totalPages || fetching} onClick={() => onChange({ ...query, page: data.meta.page + 1 })}>{t("Next")}</Button></nav>}
    {groupBy !== "none" && data && data.meta.totalPages > 1 && <p className="mentor-group-note">{t("mentorWorkspace.pageGroups")}</p>}
  </section>;
}
