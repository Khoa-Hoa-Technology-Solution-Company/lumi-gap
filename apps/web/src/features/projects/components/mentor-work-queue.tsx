import { useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ArrowUpRight, AlertCircle, CheckCircle2, Search, SlidersHorizontal, X } from "lucide-react";
import type { MentorWorkItem, MentorWorkQuery, MentorWorkspaceData } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import "../mentor-workspace.css";
import { mentorWorkspaceDestination, withMentorWorkReturn } from "../utils/mentor-workspace-navigation";

export const mentorKindKeys = {
  TASK: "task",
  MANUSCRIPT_REVIEW: "manuscriptReview",
  PROPOSAL_REVIEW: "proposalReview",
  MENTOR_QUESTION: "mentorQuestion",
} as const;

export function MentorQueueLoading() {
  const { t } = useI18n();
  return (
    <div role="status" aria-label={t("mentorWorkspace.loading")} className="mentor-queue-loading">
      {[1, 2, 3].map(n => (
        <Skeleton key={n} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}

function resolveActionLabelKey(item: MentorWorkItem): string {
  if (["MANUSCRIPT_REVIEW", "PROPOSAL_REVIEW"].includes(item.kind) && item.status === "WAITING") return "mentorLifecycle.track";
  if (["MANUSCRIPT_REVIEW", "PROPOSAL_REVIEW"].includes(item.kind) && item.status === "DONE") return "mentorLifecycle.results";
  if (["MANUSCRIPT_REVIEW", "PROPOSAL_REVIEW"].includes(item.kind) && item.needsAction && item.status === "TODO" && (item.roundNumber ?? 1) > 1) return "mentorLifecycle.reviewRevision";
  if (item.accessIssue && item.canContactTeam) return "mentorWorkspace.contactTeam";
  if (item.kind === "TASK" && item.href.startsWith("/submissions/")) return "mentorWorkspace.openManuscript";
  if (item.action === "REVIEW" && item.status === "IN_PROGRESS") return "mentorWorkspace.action.CONTINUE_REVIEW";
  return `mentorWorkspace.action.${item.action}`;
}

export function MentorWorkRows({
  items,
  groupBy = "none",
  projectOnly = false,
}: {
  items: MentorWorkItem[];
  groupBy?: "none" | "project" | "status";
  projectOnly?: boolean;
}) {
  const { t, language } = useI18n();
  const { pathname } = useLocation();
  const { search } = useLocation();
  const href = (path: string) => (pathname === "/mentor-workspace" ? withMentorWorkReturn(mentorWorkspaceDestination(path), `${pathname}${search}`) : path);
  const groups = new Map<string, MentorWorkItem[]>();
  for (const item of items) {
    const key = groupBy === "project" ? item.projectId : groupBy === "status" ? item.status : "all";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return (
    <div className="mentor-work-groups">
      {[...groups.entries()].map(([key, rows]) => (
        <section key={key}>
          {groupBy !== "none" && (
            <h3 className="mentor-group-title">
              {groupBy === "project" ? rows[0]!.projectTitle : t(`mentorWorkspace.status.${key}`)}{" "}
              <span>{rows.length}</span>
            </h3>
          )}
          <ul className="mentor-work-list">
            {rows.map(item => (
              <li key={item.id} className="mentor-work-row">
                <div className="mentor-row-context">
                  <span className="mentor-kind-tag">{t(`mentorWorkspace.${mentorKindKeys[item.kind]}`)}</span>
                  {item.version !== null && (
                    <span className="mentor-version-tag">{t("mentorWorkspace.version", { version: item.version })}</span>
                  )}
                  {item.roundNumber ? <span>{t("mentorWorkspace.round", { round: item.roundNumber })}</span> : null}
                  {item.overdue && <Badge variant="destructive">{t("mentorWorkspace.overdue")}</Badge>}
                  {item.blocked && <Badge variant="destructive">{t("mentorWorkspace.blocked")}</Badge>}
                </div>

                <div className="mentor-row-main">
                  <div className="mentor-row-copy">
                    <Link className="mentor-row-title" to={href(item.href)}>
                      {item.title}
                    </Link>
                    <p>
                      {!projectOnly && <><Link to={href(`/projects/${encodeURIComponent(item.projectId)}?tab=tasks`)}>
                        {item.projectTitle}
                      </Link>
                      <span aria-hidden="true"> · </span></>}
                      <span>{item.sender}</span>
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 font-medium">
                    {t(`mentorWorkspace.status.${item.status}`)}
                  </Badge>
                </div>

                {item.accessIssue && (
                  <p className="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">
                    {t("mentorWorkspace.manuscriptNotShared")}
                  </p>
                )}
                {item.readOnly && <p className="mt-2 text-sm text-muted-foreground">{t("mentorWorkspace.workReadOnly")}</p>}
                {item.submittedAt && <p className="mt-2 text-sm text-muted-foreground">{t("mentorWorkspace.feedbackSentAt", { date: new Date(item.submittedAt).toLocaleDateString(language) })}</p>}

                <div className="mentor-row-footer">
                  <div>
                    <span className="mentor-priority-pill" data-priority={item.priority}>
                      {t(`mentorWorkspace.priority.${item.priority}`)}
                    </span>
                    {item.dueAt ? (
                      <time className={item.overdue ? "mentor-overdue" : undefined} dateTime={item.dueAt}>
                        {t("mentorWorkspace.due")}{" "}
                        {new Date(item.dueAt).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" })}
                      </time>
                    ) : (
                      <span>{t("mentorWorkspace.noDeadline")}</span>
                    )}
                  </div>
                  <Button asChild size="sm" variant={item.needsAction ? "default" : "outline"}>
                    <Link to={href(item.href)}>
                      {t(resolveActionLabelKey(item))}
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const WORK_TABS: Array<{ status: MentorWorkQuery["status"]; labelKey: string }> = [
  { status: "ACTIONABLE", labelKey: "mentorWorkspace.tab.actionable" },
  { status: "IN_PROGRESS", labelKey: "mentorWorkspace.tab.inProgress" },
  { status: "WAITING", labelKey: "mentorWorkspace.tab.waiting" },
  { status: "DONE", labelKey: "mentorWorkspace.tab.done" },
  { status: "ALL", labelKey: "mentorWorkspace.tab.all" },
];

export function MentorWorkQueue({
  data,
  query,
  onChange,
  loading,
  fetching,
  error,
  retry,
  projectOnly = false,
}: {
  data?: MentorWorkspaceData;
  query: MentorWorkQuery;
  onChange: (query: MentorWorkQuery) => void;
  loading: boolean;
  fetching: boolean;
  error: unknown;
  retry: () => void;
  projectOnly?: boolean;
}) {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const groupValue = params.get("workGroup");
  const groupBy = groupValue === "status" || groupValue === "project" && !projectOnly ? groupValue : "none";
  const setGroupBy = (value: "none" | "project" | "status") => setParams(current => {
    const next = new URLSearchParams(current);
    if (value === "none") next.delete("workGroup"); else next.set("workGroup", value);
    return next;
  });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const update = (patch: Partial<MentorWorkQuery>) => onChange({ ...query, ...patch, page: 1 });
  const currentStatus = query.status ?? "ACTIONABLE";
  const activeAdvancedCount =
    (query.projectId && !projectOnly ? 1 : 0) +
    (query.kind ? 1 : 0) +
    (!["ACTIONABLE", "IN_PROGRESS", "WAITING", "DONE", "ALL"].includes(currentStatus) ? 1 : 0) +
    (query.sort && query.sort !== "priority" ? 1 : 0);
  const hasActiveFilter = Boolean(query.q || activeAdvancedCount > 0 || currentStatus !== "ACTIONABLE");
  const totalCount = data?.meta.total ?? 0;
  // Adaptive density: show advanced filter selects automatically when there are >3 items or active filters;
  // otherwise keep the queue clean behind a single "Filters" toggle button.
  const showAdvancedBar = filtersOpen || activeAdvancedCount > 0 || groupBy !== "none" || totalCount > 3;

  return (
    <section className="mentor-queue" aria-label={t("mentorWorkspace.work")}>
      {/* Primary View Tabs + Compact Search / Filter Toggle */}
      <div className="mentor-queue-top">
        <div className="mentor-work-tabs" role="tablist" aria-label={t("mentorWorkspace.statusFilter")}>
          {WORK_TABS.map(tab => {
            const active = currentStatus === tab.status;
            return (
              <button
                key={tab.status}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active || !WORK_TABS.some(item => item.status === currentStatus) && tab === WORK_TABS[0] ? 0 : -1}
                className="mentor-work-tab"
                data-active={active ? "true" : undefined}
                onClick={() => update({ status: tab.status })}
                onKeyDown={event => {
                  const index = WORK_TABS.indexOf(tab);
                  const next = event.key === "ArrowRight" ? (index + 1) % WORK_TABS.length : event.key === "ArrowLeft" ? (index + WORK_TABS.length - 1) % WORK_TABS.length : event.key === "Home" ? 0 : event.key === "End" ? WORK_TABS.length - 1 : -1;
                  if (next < 0) return;
                  event.preventDefault();
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button[role="tab"]')[next]?.focus();
                  update({ status: WORK_TABS[next]!.status });
                }}
              >
                {t(tab.labelKey)}
                <span className="ml-1.5 tabular-nums text-muted-foreground">{!error && !loading && data?.facets ? data.facets[tab.status!] : "—"}</span>
              </button>
            );
          })}
        </div>

        <div className="mentor-queue-quick-actions">
          {(totalCount > 1 || Boolean(query.q) || showAdvancedBar) && (
            <label className="mentor-search mentor-search-compact">
              <Search size={15} aria-hidden="true" />
              <Input
                type="search"
                aria-label={t("mentorWorkspace.searchWork")}
                placeholder={t("mentorWorkspace.searchWork")}
                value={query.q ?? ""}
                maxLength={160}
                onChange={e => update({ q: e.target.value })}
              />
            </label>
          )}
          <Button
            type="button"
            size="sm"
            variant={showAdvancedBar ? "secondary" : "outline"}
            aria-expanded={showAdvancedBar}
            onClick={() => setFiltersOpen(open => !open)}
            className="gap-1.5 shrink-0"
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            <span>{t("mentorWorkspace.filtersToggle")}</span>
            {activeAdvancedCount > 0 ? (
              <Badge variant="default" className="h-4 px-1.5 text-[10px]">
                {activeAdvancedCount}
              </Badge>
            ) : null}
          </Button>
          {hasActiveFilter ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 shrink-0"
              onClick={() => {
                onChange({ page: 1, status: "ACTIONABLE", sort: "priority" });
              }}
            >
              <X size={14} aria-hidden="true" />
              <span>{t("mentorWorkspace.clearFilters")}</span>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Adaptive Advanced Controls */}
      {showAdvancedBar ? (
        <div className="mentor-queue-controls">
          {!projectOnly && (
            <select
              aria-label={t("mentorWorkspace.projectFilter")}
              value={query.projectId ?? ""}
              onChange={e => update({ projectId: e.target.value || undefined })}
            >
              <option value="">{t("mentorWorkspace.allProjects")}</option>
              {!error &&
                data?.projectOptions.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
            </select>
          )}
          <select
            aria-label={t("mentorWorkspace.kindFilter")}
            value={query.kind ?? ""}
            onChange={e => update({ kind: (e.target.value || undefined) as MentorWorkQuery["kind"] })}
          >
            <option value="">{t("mentorWorkspace.allKinds")}</option>
            <option value="REVIEW">{t("mentorWorkspace.reviewKinds")}</option>
            {Object.entries(mentorKindKeys).map(([value, key]) => (
              <option key={value} value={value}>
                {t(`mentorWorkspace.${key}`)}
              </option>
            ))}
          </select>
          <select
            aria-label={t("mentorWorkspace.statusFilter")}
            value={currentStatus}
            onChange={e => update({ status: e.target.value as MentorWorkQuery["status"] })}
          >
            {["ACTIONABLE", "OVERDUE", "ALL", "TODO", "IN_PROGRESS", "BLOCKED", "WAITING", "DONE"].map(s => (
              <option key={s} value={s}>
                {t(`mentorWorkspace.status.${s}`)}
              </option>
            ))}
          </select>
          <select
            aria-label={t("mentorWorkspace.sort")}
            value={query.sort ?? "priority"}
            onChange={e => update({ sort: e.target.value as MentorWorkQuery["sort"] })}
          >
            <option value="priority">
              {t("mentorWorkspace.sort")}: {t("mentorWorkspace.prioritySort")}
            </option>
            <option value="deadline">
              {t("mentorWorkspace.sort")}: {t("mentorWorkspace.deadlineSort")}
            </option>
          </select>
          <select
            aria-label={t("mentorWorkspace.group")}
            value={groupBy}
            onChange={e => setGroupBy(e.target.value as typeof groupBy)}
          >
            <option value="none">
              {t("mentorWorkspace.group")}: {t("mentorWorkspace.noGroup")}
            </option>
            {!projectOnly && (
              <option value="project">
                {t("mentorWorkspace.group")}: {t("mentorWorkspace.projectFilter")}
              </option>
            )}
            <option value="status">
              {t("mentorWorkspace.group")}: {t("mentorWorkspace.statusFilter")}
            </option>
          </select>
        </div>
      ) : null}

      <div className="mentor-queue-statusline">
        <p role="status" aria-live="polite">
          {error
            ? ""
            : loading
            ? t("mentorWorkspace.loading")
            : data
            ? t("mentorWorkspace.resultCount", { count: data.meta.total })
            : ""}
          {fetching && !loading ? ` · ${t("mentorWorkspace.updating")}` : ""}
        </p>
      </div>

      {error ? (
        <div role="alert" className="mentor-queue-empty">
          <AlertCircle size={22} aria-hidden="true" />
          <p>{t("mentorWorkspace.loadError")}</p>
          <Button variant="outline" onClick={retry}>
            {t("Try again")}
          </Button>
        </div>
      ) : loading ? (
        <MentorQueueLoading />
      ) : data?.items.length ? (
        <div aria-busy={fetching}>
          <MentorWorkRows items={data.items} groupBy={groupBy} projectOnly={projectOnly} />
        </div>
      ) : (
        <div className="mentor-queue-empty">
          <CheckCircle2 size={26} aria-hidden="true" />
          <h3>{t(`mentorWorkspace.empty.${currentStatus}`)}</h3>
          {currentStatus === "ACTIONABLE" && (data?.facets?.WAITING ?? 0) > 0 ? <><p>{t("mentorWorkspace.waitingHint", { count: data!.facets!.WAITING })}</p><Button variant="outline" onClick={() => update({ status: "WAITING" })}>{t("mentorWorkspace.viewWaiting")}</Button></> : <p>{t("mentorWorkspace.emptyWorkHint")}</p>}
          {hasActiveFilter ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onChange({ page: 1, status: "ACTIONABLE", sort: "priority" });
              }}
            >
              {t("mentorWorkspace.clearFilters")}
            </Button>
          ) : null}
        </div>
      )}

      {!error && data && data.meta.totalPages > 1 && (
        <nav className="mentor-pagination" aria-label={t("mentorWorkspace.pagination")}>
          <Button
            size="sm"
            variant="outline"
            disabled={data.meta.page <= 1 || fetching}
            onClick={() => onChange({ ...query, page: data.meta.page - 1 })}
          >
            {t("Previous")}
          </Button>
          <span>{t("mentorWorkspace.pageCount", { page: data.meta.page, total: data.meta.totalPages })}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={data.meta.page >= data.meta.totalPages || fetching}
            onClick={() => onChange({ ...query, page: data.meta.page + 1 })}
          >
            {t("Next")}
          </Button>
        </nav>
      )}
      {groupBy !== "none" && data && data.meta.totalPages > 1 && (
        <p className="mentor-group-note">{t("mentorWorkspace.pageGroups")}</p>
      )}
    </section>
  );
}
